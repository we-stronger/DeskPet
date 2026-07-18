const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
  Tray,
  nativeImage,
  powerMonitor,
  screen,
  session,
  shell,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const {
  defaultPetSettings,
  loadPetSettings,
  normalizePetSettings,
  savePetSettings,
} = require("./pet-settings-store");
const {
  buildContextMenuTemplate,
  buildTrayMenuTemplate,
} = require("./pet-menu-template");
const { clampPositionToVisibleArea } = require("./window-position");
const { computeWindowMove } = require("./window-move-policy");
const { PET_WINDOW_SIZE, enforcePetWindowSize } = require("./window-size-policy");
const { sendMediaKey, minimizeNeteaseWindows, clickNeteaseSongPagePlayButton } = require("./media-control");
const { dispatchPlaySong } = require("./play-song-dispatch");
const {
  musicActionFromCommand,
  musicFeedbackCommandForAction,
} = require("./music-command");
const {
  buildSongOrpheusTargets,
  buildSongWebUrl,
  buildSearchWebUrl,
  buildSearchOrpheusTargets,
  buildCloudMusicArgv,
} = require("./netease-search");
const { createMusicController } = require("./music/music-controller");
const {
  clearHistory,
  loadPlaybackState,
  mergePlaybackStateForPersistence,
  normalizePlaybackState,
  removeHistoryEntry,
  savePlaybackState,
} = require("./music/music-playback-store");
const { createChatMemoryController } = require("./chat/chat-memory-controller");
const auth = require("./music/netease-auth");
const { startLoginWindow, sessionCookieString } = require("./music/netease-login-window");
const { chat: llmChat } = require("./llm-client");
const { buildNeteaseMediaHeaders } = require("./netease-media-headers");
const { createNeteaseAudioProxy } = require("./netease-audio-proxy");
const { buildNeteaseSongPageUrl, buildNeteaseWebPlayScript } = require("./netease-web-player");
const { createWindowManager } = require("./main/window-manager");
const { createTrayMenuRuntime } = require("./main/menu-runtime");
const { registerSettingsIpc } = require("./main/ipc/settings-ipc");
const { registerFocusSystem } = require("./main/focus-system");
// loadEnvConfig is intentionally not wired into packaged builds —
// end users configure LLM credentials through the in-app settings
// window (see openSettingsWindow below) which writes to
// deskpet-settings.json in app.getPath("userData"). The module is
// still exported for tests and for developers who want to override
// settings.json with a .env file at dev time.

// Common Windows install paths for NetEase Cloud Music. Best-effort fallback
// after the `orpheus://` URI scheme fails.
const NETEASE_CANDIDATE_PATHS = [
  "C:\\Program Files\\NetEase\\CloudMusic\\cloudmusic.exe",
  "C:\\Program Files (x86)\\NetEase\\CloudMusic\\cloudmusic.exe",
  path.join(process.env.LOCALAPPDATA || "", "NetEase\\CloudMusic\\cloudmusic.exe"),
];

let petWindow;
let musicSearchWindow;
let chatWindow;
let tray;
let trayMenuRuntime;
let focusSystem;
let appSettings = { ...defaultPetSettings };
let musicPlaybackState = normalizePlaybackState();
let activeLoginWindow = null;
let nextAudioHostRequestId = 1;
const pendingAudioHostRequests = new Map();
let neteaseWebPlayerWindow;
let chatMemoryController;

// Size of the standalone music-search window. Big enough to show full
// result rows (title + artist 璺?album + duration + play button) without
// clipping; resizable so the user can stretch if they want more density.
const MUSIC_SEARCH_WINDOW_SIZE = Object.freeze({ width: 520, height: 640 });
const MUSIC_SEARCH_WINDOW_MIN_SIZE = Object.freeze({ width: 360, height: 420 });
// Size of the full-featured standalone music window. Wider than the
// search-only window so the tab bar + lyrics panel fit without
// cramping, and the 480x480 minimum prevents the content from being
// squeezed into illegibility.
const MUSIC_WINDOW_SIZE = Object.freeze({ width: 720, height: 640 });
const MUSIC_WINDOW_MIN_SIZE = Object.freeze({ width: 480, height: 480 });
const CHAT_WINDOW_SIZE = Object.freeze({ width: 480, height: 600 });
const CHAT_WINDOW_MIN_SIZE = Object.freeze({ width: 360, height: 420 });
const isSmokeTest = process.argv.includes("--smoke-test");
let smokeFinished = false;
const musicController = createMusicController({
  sessionCookieProvider: async () => {
    const cookies = await session.defaultSession.cookies.get({ domain: ".music.163.com" });
    return sessionCookieString(cookies);
  },
  onSessionChanged: () => broadcastMusicAuthState(),
});
const neteaseAudioProxy = createNeteaseAudioProxy();

async function withProxiedAudioUrl(result, meta = {}) {
  if (!(result && result.success && typeof result.url === "string" && /^https?:\/\//i.test(result.url))) {
    return result;
  }
  try {
    const track = await neteaseAudioProxy.createTrack(result.url, meta);
    return {
      ...result,
      directUrl: result.url,
      url: track.proxyUrl,
      proxy: true,
      proxyTrackId: track.id,
    };
  } catch (error) {
    return {
      ...result,
      success: false,
      error: (error && error.message) || "audio-proxy-failed",
    };
  }
}

// userData path: use Electron's default (resolves to %APPDATA%/DeskPet
// when packaged, %APPDATA%/desk-play-pet when running from the source
// checkout). Don't override — the previous .runtime/user-data path
// was dev-only and not writable when running inside app.asar.
app.disableHardwareAcceleration();
// Chromium 117+ removed automatic software WebGL fallback. Pet renders
// only PNG frames but the renderer also spins up hidden pages (the
// settings/pet windows, music-search html) that hit media-stack init
// paths. Without this flag those surfaces spam the console with
// "Automatic fallback to software WebGL has been deprecated" + a
// crash-looking MojoAudioOutputIPC error on every load. --enable-unsafe-swiftshader
// re-enables the fallback for trusted local content.
app.commandLine.appendSwitch("enable-unsafe-swiftshader");
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-pinch");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
function settingsPath() {
  return path.join(app.getPath("userData"), "deskpet-settings.json");
}

function musicPlaybackStatePath() {
  return path.join(app.getPath("userData"), "music-playback-state.json");
}

function chatMemoryStatePath() {
  return path.join(app.getPath("userData"), "chat-memory-state.json");
}

function currentLlmSettings() {
  return (appSettings && appSettings.llm) || {};
}

async function callConfiguredLlm(messages, overrideSystemPrompt) {
  const llm = currentLlmSettings();
  if (!llm.apiKey) {
    return { success: false, error: "missing-api-key" };
  }
  return llmChat(messages, {
    apiKey: llm.apiKey,
    model: llm.model,
    endpoint: llm.endpoint,
    systemPrompt: overrideSystemPrompt == null ? llm.systemPrompt : overrideSystemPrompt,
  });
}

function parseJsonBlock(text) {
  if (typeof text !== "string" || !text.trim()) {
    return null;
  }
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!fenced) {
      return null;
    }
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_nestedError) {
      return null;
    }
  }
}

function buildChatMemorySummarizerPrompt({ summary, profile, memories, messages }) {
  const profileLines = [
    `displayName: ${profile && profile.displayName ? profile.displayName : ""}`,
    `relationshipTone: ${profile && profile.relationshipTone ? profile.relationshipTone : ""}`,
    `preferences: ${(profile && Array.isArray(profile.preferences) ? profile.preferences : []).join(", ")}`,
    `facts: ${(profile && Array.isArray(profile.facts) ? profile.facts : []).join(", ")}`,
    `avoidances: ${(profile && Array.isArray(profile.avoidances) ? profile.avoidances : []).join(", ")}`,
  ];
  const history = Array.isArray(messages)
    ? messages.map((item) => `${item.role}: ${item.content}`).join("\n")
    : "";
  const memoryLines = Array.isArray(memories)
    ? memories.map((memory) => `${memory.category}: ${memory.content}${memory.pinned ? " (pinned)" : ""}`).join("\n")
    : "";
  return [
    "You summarize chat memory for a desktop pet.",
    "Return JSON only.",
    'Schema: {"summary":"Rolling context","profile":{"displayName":"","relationshipTone":"","preferences":[],"facts":[],"avoidances":[]},"memories":[{"category":"preference","content":"prefers calm music"}]}',
    "Keep summary concise and cumulative.",
    "Only store stable facts, preferences, or durable relationship signals in memories.",
    `Existing summary:\n${summary || ""}`,
    `Existing profile:\n${profileLines.join("\n")}`,
    `Existing memory entries:\n${memoryLines}`,
    `New conversation chunk:\n${history}`,
  ].join("\n\n");
}

function getChatMemoryController() {
  if (chatMemoryController) {
    return chatMemoryController;
  }
  chatMemoryController = createChatMemoryController({
    statePath: chatMemoryStatePath(),
    systemPrompt: () => currentLlmSettings().systemPrompt || "",
    chat: async (messages) => callConfiguredLlm(messages),
    summarize: async ({ messages, summary, profile, memories }) => {
      const prompt = buildChatMemorySummarizerPrompt({ messages, summary, profile, memories });
      const result = await callConfiguredLlm([
        { role: "user", content: prompt },
      ], "");
      if (!(result && result.success && typeof result.content === "string")) {
        return { success: false, error: (result && result.error) || "summary-failed" };
      }
      const payload = parseJsonBlock(result.content);
      if (!payload || typeof payload !== "object") {
        return { success: false, error: "invalid-summary-json" };
      }
      return {
        success: true,
        summary: typeof payload.summary === "string" ? payload.summary : "",
        profile: payload.profile && typeof payload.profile === "object" ? payload.profile : {},
        memories: Array.isArray(payload.memories) ? payload.memories : null,
      };
    },
  });
  return chatMemoryController;
}

function broadcastMusicPlaybackState() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("music:playback-state-changed", musicPlaybackState);
    }
  }
}

function broadcastMusicAuthState() {
  const state = musicController.getSessionStatus();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("music:auth-state-changed", state);
    }
  }
}

function persistMusicPlaybackState(nextState) {
  musicPlaybackState = savePlaybackState(musicPlaybackStatePath(), nextState);
  broadcastMusicPlaybackState();
  return musicPlaybackState;
}

function persistSettings(nextSettings = appSettings) {
  appSettings = savePetSettings(settingsPath(), nextSettings);
  return appSettings;
}

function sendPetCommand(command) {
  if (command === "show") {
    showPetWindow();
    return;
  }

  if (command === "restore-defaults") {
    appSettings = { ...defaultPetSettings };
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.center();
      const [x, y] = petWindow.getPosition();
      appSettings.position = { x, y };
    }
    persistSettings(appSettings);
    refreshTrayMenu();
  }

  if (command.startsWith("size:")) {
    appSettings = normalizePetSettings({
      ...appSettings,
      sizePercent: command.slice("size:".length),
    });
    persistSettings(appSettings);
    refreshTrayMenu();
  }

  if (command.startsWith("speed:")) {
    appSettings = normalizePetSettings({
      ...appSettings,
      speedPercent: command.slice("speed:".length),
    });
    persistSettings(appSettings);
    refreshTrayMenu();
  }

  const toggleSettings = {
    "clock:toggle": "clockEnabled",
    "focus-indicator:toggle": "focusIndicatorEnabled",
    "pet-click-through:toggle": "petClickThroughEnabled",
    "music-click-through:toggle": "musicStatusClickThroughEnabled",
  };
  const toggleKey = toggleSettings[command];
  if (toggleKey) {
    appSettings = normalizePetSettings({ ...appSettings, [toggleKey]: !appSettings[toggleKey] });
    persistSettings(appSettings);
    sendSettingsToPet();
    refreshTrayMenu();
    return;
  }

  if (command.startsWith("music:")) {
    handleMusicCommand(command);
    return;
  }

  if (command === "chat:open") {
    openChatWindow();
    return;
  }

  if (command === "settings" || command === "settings:open" || command === "settings:open-records") {
    openSettingsWindow();
    return;
  }

  petWindow?.webContents.send("pet:command", command);
}

function sendPetFeedback(command) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet:command", command);
  }
}

function sendSettingsToPet() {
  sendPetCommand(`settings:${encodeURIComponent(JSON.stringify(appSettings))}`);
}

// NOTE: this drives the OS-level media session, not NetEase specifically.
// If Spotify, a browser tab, or another player currently owns the session,
// the media key may be routed to that player instead. The renderer surfaces
// this limitation in the mood-bubble feedback.
function sendMusicPanelCommand(view) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet:command", view ? `music:open-panel:${view}` : "music:open-panel");
  }
}

function handleMusicCommand(command) {
  if (command === "music:open-search" || command === "settings:open-search") {
    openMusicWindow();
    return;
  }
  if (command === "music:open-playlists") {
    openMusicWindow();
    return;
  }
  if (command === "music:open-panel" || command === "music:open-window") {
    openMusicWindow();
    return;
  }
  if (command === "music:open-netease") {
    openNeteaseCloudMusic()
      .then((result) => {
        if (result.success) {
          sendPetFeedback("music:feedback:open-success");
        } else {
          sendPetFeedback("music:feedback:open-failed");
        }
      })
      .catch(() => sendPetFeedback("music:feedback:open-failed"));
    return;
  }

  if (command === "music:listen") {
    petWindow?.webContents.send("pet:command", command);
    return;
  }

  const action = musicActionFromCommand(command);
  if (!action) {
    return;
  }
  sendMediaKey(action)
    .then(() => sendPetFeedback(musicFeedbackCommandForAction(action)))
    .catch(() => sendPetFeedback("music:feedback:failed"));
}

function findNetEaseExecutable() {
  for (const candidate of NETEASE_CANDIDATE_PATHS) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function minimizeNeteaseBestEffort() {
  minimizeNeteaseWindows().catch(() => {});
}

// Open NetEase with a specific orpheus:// URL, trying multiple strategies:
// 1) shell.openExternal 閳?relies on the registered URI scheme. Resolves
//    without error even when no visible app launches (Windows is sloppy
//    about reporting success), so we don't trust it alone.
// 2) spawn cloudmusic.exe with the URL as its first argv. NetEase accepts
//    URLs as command-line args and routes them internally; this works
//    even when the URI scheme isn't registered.
// 3) shell.openPath on the bare exe (no URL) 閳?last resort so the app at
//    least appears on screen.
// Returns { success, method } describing which path worked.
async function openNeteaseWithUrl(url, { allowBareExe = true, silent = false } = {}) {
  if (typeof url !== "string" || !url) {
    return { success: false, error: "empty-url" };
  }

  // SILENT PATH (used by music:play-song): do not report WM_COPYDATA as
  // success. On current Windows NetEase builds it can return delivered
  // while the client keeps playing the previous song. The registered
  // protocol handler uses cloudmusic.exe --webcmd="%1", so use that exact
  // path and let NetEase's own single-instance dispatcher handle the URL.
  if (silent) {
    const exe = findNetEaseExecutable();
    if (exe) {
      try {
        const child = spawn(exe, buildCloudMusicArgv(url), {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        child.once("error", () => { /* surfaced below */ });
        const clicked = await clickNeteaseSongPagePlayButton({ waitMs: 1800 }).catch((error) => ({
          success: false,
          error: error && error.message ? error.message : "client-play-click-failed",
        }));
        if (clicked && clicked.success) {
          setTimeout(minimizeNeteaseBestEffort, 1200);
          return { success: true, method: "spawn-webcmd-click", clickMethod: clicked.method, path: exe, target: url };
        }
        return {
          success: false,
          error: (clicked && clicked.error) || "client-play-click-failed",
          method: "spawn-webcmd",
          path: exe,
          target: url,
        };
      } catch (_error) {
        // fall through
      }
    }

    return { success: false, error: "client-exe-not-found", target: url };
  }

  // NON-SILENT PATH (used by music:open-netease, music:open-search):
  // the user explicitly asked to open NetEase, so it's fine if a
  // browser pops up. Original behavior preserved.

  // Strategy 1: URI scheme registration
  try {
    // Try to open via the registered URI scheme. On Windows this
    // frequently resolves even when the client didn't fully handle
    // the URL, so record success but continue to try the local exe
    // if available to improve the chance the URL is actually passed
    // to the running client.
    await Promise.race([
      shell.openExternal(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error("openExternal timed out")), 2000)),
    ]);
    // Mark that the scheme opened without throwing, but don't return
    // immediately 閳?we still attempt the exe-based launch if possible.
    var schemeOpened = true;
  } catch (_error) {
    // fall through
  }

  // Strategy 2: spawn the executable with the URL as argv
  const exe = findNetEaseExecutable();
  if (exe) {
    try {
      const child = spawn(exe, buildCloudMusicArgv(url), {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      child.once("error", () => { /* surfaced below */ });
      // Also attempt the URI scheme as a secondary step; on Windows the
      // registry/handler may be more effective at routing the URL to an
      // already-running instance.
      try {
        await Promise.race([
          shell.openExternal(url),
          new Promise((_, reject) => setTimeout(() => reject(new Error("openExternal timed out")), 1200)),
        ]);
        return { success: true, method: "spawn+scheme", path: exe, target: url };
      } catch (_e) {
        return { success: true, method: "spawn", path: exe, target: url };
      }
    } catch (_error) {
      // fall through
    }
  }

  // If the scheme opened earlier but spawning the exe didn't run (or
  // exe wasn't present), prefer reporting the scheme result as a best
  // effort. This avoids false negatives on systems where `shell.openExternal`
  // is the only working path.
  if (typeof schemeOpened !== "undefined" && schemeOpened) {
    // If there's no local exe available, the URI scheme may have been
    // accepted by the OS but not forwarded to a running client. As a
    // pragmatic fallback, open the equivalent web page so the user at
    // least lands on a search or song page.
    if (!exe) {
      try {
        const parsed = new URL(url);
        // Song routes typically include an 'id' param
        const songId = parsed.searchParams.get("id");
        const keyword = parsed.searchParams.get("keyword");
        if (songId) {
          const webSong = buildSongWebUrl(songId);
          await shell.openExternal(webSong);
          return { success: true, method: "web", target: webSong };
        }
        if (keyword) {
          const webSearch = buildSearchWebUrl(keyword);
          await shell.openExternal(webSearch);
          return { success: true, method: "web", target: webSearch };
        }
      } catch (_err) {
        // ignore parsing/open failures and fall through to scheme result
      }
    }
    return { success: true, method: "scheme", target: url };
  }

  // Strategy 3: bare executable (so NetEase at least appears)
  if (allowBareExe && exe) {
    try {
      const errorString = await shell.openPath(exe);
      if (!errorString) {
        return { success: true, method: "bare-exe", path: exe };
      }
    } catch (_error) {
      // fall through
    }
  }

  return { success: false, error: "no-handler" };
}

async function openNeteaseCloudMusic() {
  return openNeteaseWithUrl("orpheus://", { allowBareExe: true });
}
async function openSearchInNeteaseCloudMusic(query) {
  if (typeof query !== "string" || !query.trim()) {
    return { success: false, error: "empty-query" };
  }
  const trimmed = query.trim();
  const orpheusTargets = buildSearchOrpheusTargets(trimmed);
  const attempts = [];
  let firstSuccess = null;
  for (const target of orpheusTargets) {
    const result = await openNeteaseWithUrl(target, { allowBareExe: false });
    attempts.push({ target, method: result.method || null, success: Boolean(result.success), error: result.error || null });
    if (result.success && !firstSuccess) {
      firstSuccess = { ...result, target };
    }
  }
  if (firstSuccess) {
    return { ...firstSuccess, query: trimmed, attempts };
  }

  const webUrl = buildSearchWebUrl(trimmed);
  try {
    await shell.openExternal(webUrl);
    return { success: true, method: "web", target: webUrl, query: trimmed, attempts };
  } catch (error) {
    return { success: false, error: "open-failed", query: trimmed, attempts };
  }
}


function showPetWindow() {
  if (!petWindow || petWindow.isDestroyed()) {
    createPetWindow();
    return;
  }
  petWindow.show();
  petWindow.focus();
}

function resetPetPosition() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  petWindow.center();
  const [x, y] = petWindow.getPosition();
  appSettings = persistSettings({ ...appSettings, position: { x, y } });
}

function refreshTrayMenu() {
  if (!tray || isSmokeTest) {
    return;
  }
  if (!trayMenuRuntime) {
    trayMenuRuntime = createTrayMenuRuntime({
      Menu,
      getState: () => appSettings,
      buildTemplate: (state) => buildTrayMenuTemplate({
        petState: state.petState,
        sendCommand: sendPetCommand,
        resetPosition: resetPetPosition,
        clockEnabled: state.clockEnabled,
        focusIndicatorEnabled: state.focusIndicatorEnabled,
        petClickThroughEnabled: state.petClickThroughEnabled,
        musicStatusClickThroughEnabled: state.musicStatusClickThroughEnabled,
        focusDurationMinutes: state.focusDurationMinutes,
        breakDurationMinutes: state.breakDurationMinutes,
        longBreakDurationMinutes: state.longBreakDurationMinutes,
        focusRoundsBeforeLongBreak: state.focusRoundsBeforeLongBreak,
        pendingTaskName: state.pendingTaskName,
        focusRecords: state.focusRecords,
        focusSession: state.focusSession,
        quit: () => app.quit(),
      }),
    });
  }
  trayMenuRuntime.setTray(tray);
  trayMenuRuntime.refresh();
}

function createTray() {
  if (tray || isSmokeTest) {
    return;
  }

  // photo.png ships at the project root in dev and is copied into
  // process.resourcesPath (the "resources" folder next to app.asar)
  // by electron-builder. Resolve the right path for both modes.
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "photo.png")
    : path.join(__dirname, "..", "photo.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Desk Pet");
  refreshTrayMenu();
}

function finishSmokeTest(exitCode) {
  if (!isSmokeTest || smokeFinished) {
    return;
  }

  smokeFinished = true;
  app.exit(exitCode);
}

function logSmoke(message, details = "") {
  if (isSmokeTest) {
    console.error(`[smoke] ${message}${details ? `: ${details}` : ""}`);
  }
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: PET_WINDOW_SIZE.width,
    height: PET_WINDOW_SIZE.height,
    frame: false,
    transparent: !isSmokeTest,
    resizable: false,
    alwaysOnTop: !isSmokeTest,
    skipTaskbar: true,
    hasShadow: false,
    show: !isSmokeTest,
    backgroundColor: isSmokeTest ? "#ffffff" : "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  petWindow.setAlwaysOnTop(true, "screen-saver");
  if (!isSmokeTest && process.env.DESKPET_DEVTOOLS === "1") {
    petWindow.webContents.openDevTools({ mode: "detach" });
  }
  enforcePetWindowSize(petWindow);
  petWindow.webContents.setZoomFactor(1);
  petWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  const safePosition = clampPositionToVisibleArea(
    appSettings.position,
    screen.getAllDisplays(),
    PET_WINDOW_SIZE,
  );
  petWindow.setPosition(safePosition.x, safePosition.y, false);
  appSettings = persistSettings({ ...appSettings, position: safePosition });

  petWindow.webContents.once("did-finish-load", () => {
    sendPetCommand(`settings:${encodeURIComponent(JSON.stringify(appSettings))}`);
    sendPetCommand(`size:${appSettings.sizePercent}`);
    sendPetCommand(`speed:${appSettings.speedPercent}`);
    sendPetCommand(`pet-state:${encodeURIComponent(JSON.stringify(appSettings.petState))}`);
  });

  if (isSmokeTest) {
    const smokeTimeout = setTimeout(() => {
      logSmoke("timed out waiting for renderer load", petWindow.webContents.getURL());
      finishSmokeTest(1);
    }, 8000);

    petWindow.webContents.once("did-finish-load", () => {
      logSmoke("renderer loaded");
      clearTimeout(smokeTimeout);
      setTimeout(() => finishSmokeTest(0), 250);
    });
    petWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
      logSmoke("renderer failed to load", `${errorCode} ${errorDescription}`);
      clearTimeout(smokeTimeout);
      finishSmokeTest(1);
    });
  }

  const rendererPath = path.join(__dirname, "renderer", "index.html");
  logSmoke("loading renderer", rendererPath);
  petWindow.loadURL(pathToFileURL(rendererPath).toString()).catch((error) => {
    logSmoke("loadURL rejected", error.message);
    finishSmokeTest(1);
  });

  petWindow.on("closed", () => {
    petWindow = undefined;
  });
}

const auxiliaryWindowManager = createWindowManager({
  BrowserWindow,
  resolveUrl: (rendererPath) => pathToFileURL(rendererPath).toString(),
  onLoadError: (name, error) => logSmoke(`${name} loadURL rejected`, error.message),
});

function openMusicSearchWindow() {
  return auxiliaryWindowManager.open({
    name: "music-search",
    get: () => musicSearchWindow,
    set: (window) => { musicSearchWindow = window; },
    windowOptions: {
    width: MUSIC_SEARCH_WINDOW_SIZE.width,
    height: MUSIC_SEARCH_WINDOW_SIZE.height,
    minWidth: MUSIC_SEARCH_WINDOW_MIN_SIZE.width,
    minHeight: MUSIC_SEARCH_WINDOW_MIN_SIZE.height,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: false,
    title: "音乐搜索 · Desk Pet",
    backgroundColor: "#f7f9fc",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    },
    rendererPath: path.join(__dirname, "renderer", "music-search.html"),
  });
}

let musicWindow;
function openMusicWindow() {
  return auxiliaryWindowManager.open({
    name: "music",
    get: () => musicWindow,
    set: (window) => { musicWindow = window; },
    windowOptions: {
    width: MUSIC_WINDOW_SIZE.width,
    height: MUSIC_WINDOW_SIZE.height,
    minWidth: MUSIC_WINDOW_MIN_SIZE.width,
    minHeight: MUSIC_WINDOW_MIN_SIZE.height,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: false,
    title: "网易云音乐 · Desk Pet",
    backgroundColor: "#f7f9fc",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    },
    rendererPath: path.join(__dirname, "renderer", "music.html"),
  });
}

ipcMain.handle("music:open-window", () => {
  openMusicWindow();
  return { success: true };
});

ipcMain.handle("music:control", async (_event, { action } = {}) => {
  const normalized = musicActionFromCommand(`music:${action}`) || musicActionFromCommand(String(action || ""));
  if (!normalized) {
    return { success: false, error: "invalid-action" };
  }
  try {
    await sendMediaKey(normalized);
    sendPetFeedback(musicFeedbackCommandForAction(normalized));
    return { success: true, action: normalized };
  } catch (_error) {
    sendPetFeedback("music:feedback:failed");
    return { success: false, error: "control-failed", action: normalized };
  }
});

function openChatWindow() {
  return auxiliaryWindowManager.open({
    name: "chat",
    get: () => chatWindow,
    set: (window) => { chatWindow = window; },
    windowOptions: {
    width: CHAT_WINDOW_SIZE.width,
    height: CHAT_WINDOW_SIZE.height,
    minWidth: CHAT_WINDOW_MIN_SIZE.width,
    minHeight: CHAT_WINDOW_MIN_SIZE.height,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: false,
    title: "閸滃本鍨滈懕濠呬喊 璺?Desk Pet",
    backgroundColor: "#f7f9fc",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    },
    rendererPath: path.join(__dirname, "renderer", "chat.html"),
  });
}

let settingsWindow;
function openSettingsWindow() {
  return auxiliaryWindowManager.open({
    name: "settings",
    get: () => settingsWindow,
    set: (window) => { settingsWindow = window; },
    windowOptions: {
    width: 560,
    height: 640,
    minWidth: 420,
    minHeight: 480,
    resizable: true,
    minimizable: true,
    maximizable: false,
    title: "设置 · Desk Pet",
    backgroundColor: "#f7f9fc",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    },
    rendererPath: path.join(__dirname, "renderer", "settings.html"),
  });
}

async function openNeteaseWebPlayer(id) {
  if (id === undefined || id === null || id === "") {
    return { success: false, error: "invalid-id" };
  }
  if (!neteaseWebPlayerWindow || neteaseWebPlayerWindow.isDestroyed()) {
    neteaseWebPlayerWindow = new BrowserWindow({
      width: 960,
      height: 720,
      show: false,
      skipTaskbar: true,
      autoHideMenuBar: true,
      backgroundColor: "#ffffff",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    neteaseWebPlayerWindow.removeMenu();
    neteaseWebPlayerWindow.on("closed", () => {
      neteaseWebPlayerWindow = undefined;
    });
  }

  const url = buildNeteaseSongPageUrl(id);
  try {
    await neteaseWebPlayerWindow.loadURL(url);
  } catch (error) {
    if (!String(error && error.message).includes("ERR_ABORTED")) {
      return { success: false, error: (error && error.message) || "web-load-failed" };
    }
  }

  async function clickOfficialPlayButton() {
    return neteaseWebPlayerWindow.webContents.executeJavaScript(buildNeteaseWebPlayScript(), true);
  }

  async function waitForWebPlayerAudible(timeoutMs = 6000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (
        neteaseWebPlayerWindow &&
        !neteaseWebPlayerWindow.isDestroyed() &&
        neteaseWebPlayerWindow.webContents.isCurrentlyAudible()
      ) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return false;
  }

  try {
    const result = await clickOfficialPlayButton();
    if (result && result.success && await waitForWebPlayerAudible()) {
      return { success: true, method: "web-player", songId: String(id), target: url };
    }

    if (!neteaseWebPlayerWindow.isDestroyed()) {
      neteaseWebPlayerWindow.setSkipTaskbar(false);
      neteaseWebPlayerWindow.show();
      neteaseWebPlayerWindow.focus();
      await clickOfficialPlayButton().catch(() => null);
      if (await waitForWebPlayerAudible(5000)) {
        return { success: true, method: "web-player", songId: String(id), target: url };
      }
    }

    return {
      success: true,
      method: "web-player-visible",
      songId: String(id),
      target: url,
      warning: (result && result.error) || "web-player-not-audible",
    };
  } catch (error) {
    return { success: false, error: (error && error.message) || "web-player-failed", songId: String(id), target: url };
  }
}

function closeNeteaseWebPlayer() {
  if (!neteaseWebPlayerWindow || neteaseWebPlayerWindow.isDestroyed()) {
    neteaseWebPlayerWindow = undefined;
    return;
  }
  const target = neteaseWebPlayerWindow;
  neteaseWebPlayerWindow = undefined;
  target.close();
}

function installNeteaseMediaHeaderPatch(sess = session.defaultSession) {
  if (!sess || !sess.webRequest || typeof sess.webRequest.onBeforeSendHeaders !== "function") {
    return;
  }
  sess.webRequest.onBeforeSendHeaders(
    {
      urls: ["*://*.music.126.net/*", "*://music.126.net/*"],
    },
    (details, callback) => {
      callback(buildNeteaseMediaHeaders(details));
    },
  );
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  installNeteaseMediaHeaderPatch();
  appSettings = loadPetSettings(settingsPath());
  musicPlaybackState = loadPlaybackState(musicPlaybackStatePath());
  createPetWindow();
  createTray();
  focusSystem = registerFocusSystem({
    ipcMain,
    Notification,
    powerMonitor,
    sendCommand: sendPetCommand,
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  focusSystem?.destroy();
  neteaseAudioProxy.close();
});

ipcMain.handle("window:move-by", (_event, { dx, dy }) => {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  const [x, y] = petWindow.getPosition();
  const moveResult = computeWindowMove({
    currentPosition: { x, y },
    delta: { dx, dy },
    displays: screen.getAllDisplays(),
    windowSize: PET_WINDOW_SIZE,
  });
  petWindow.setPosition(moveResult.position.x, moveResult.position.y, false);
  enforcePetWindowSize(petWindow);
  const [nextX, nextY] = petWindow.getPosition();
  appSettings = persistSettings({ ...appSettings, position: { x: nextX, y: nextY } });
  return {
    ...moveResult,
    position: { x: nextX, y: nextY },
  };
});

ipcMain.handle("window:set-size", (_event, { size }) => {
  sendPetCommand(`size:${size}`);
});

registerSettingsIpc({
  ipcMain,
  getSettings: () => appSettings,
  persistSettings: (settings) => persistSettings(settings),
  normalizeSettings: normalizePetSettings,
  refreshTray: refreshTrayMenu,
  sendSettingsToPet,
  getPetWindow: () => petWindow,
});

ipcMain.handle("pet:set-shape", (_event, { rect } = {}) => {
  if (!petWindow || petWindow.isDestroyed()) return { success: false, error: "no-pet-window" };
  const rawRects = Array.isArray(rect) ? rect : (rect ? [rect] : []);
  const shape = rawRects
    .filter((item) => item && Number.isFinite(item.x) && Number.isFinite(item.y)
      && Number.isFinite(item.width) && Number.isFinite(item.height)
      && item.width > 0 && item.height > 0)
    .slice(0, 1000)
    .map((item) => ({
      x: Math.max(0, Math.round(item.x)),
      y: Math.max(0, Math.round(item.y)),
      width: Math.max(1, Math.round(item.width)),
      height: Math.max(1, Math.round(item.height)),
    }));
  petWindow.setShape(shape);
  return { success: true, shape };
});

ipcMain.handle("pet:set-mouse-events-ignored", (_event, { ignored } = {}) => {
  if (!petWindow || petWindow.isDestroyed()) return { success: false, error: "no-pet-window" };
  petWindow.setIgnoreMouseEvents(ignored === true, { forward: true });
  return { success: true, ignored: ignored === true };
});

ipcMain.handle("window:close", () => {
  app.quit();
});

ipcMain.handle("music:search", async (_event, payload = {}) => musicController.searchMusic(payload));

ipcMain.handle("music:fetch-song-url", async (_event, { id } = {}) => {
  const result = await musicController.fetchSongUrl(id);
  return withProxiedAudioUrl(result, { songId: id == null ? "" : String(id) });
});

ipcMain.handle("music:open-song", async (_event, { id } = {}) => {
  console.log("[music:open-song] requested id=", id);
  const result = await musicController.openSong({ id });
  console.log("[music:open-song] result=", JSON.stringify(result));
  if (result && result.success) {
    sendPetFeedback("music:feedback:open-song");
  } else {
    sendPetFeedback("music:feedback:error");
  }
  return result;
});

ipcMain.handle("music:play-song", async (_event, { id } = {}) => {
  console.log("[music:play-song] requested id=", id);
  closeNeteaseWebPlayer();
  const result = await dispatchPlaySong(id, {
    buildSongOrpheusTargets,
    openNeteaseWithUrl,
    buildSongWebUrl,
    openExternal: shell.openExternal,
  });
  console.log("[music:play-song] result=", JSON.stringify(result));
  return result;
});

ipcMain.handle("music:web-play-song", async (_event, { id } = {}) => {
  console.log("[music:web-play-song] requested id=", id);
  const result = await openNeteaseWebPlayer(id);
  console.log("[music:web-play-song] result=", JSON.stringify(result));
  return result;
});

ipcMain.handle("music:play-audio-url", async (_event, payload = {}) => {
  if (!petWindow || petWindow.isDestroyed()) {
    return { success: false, error: "no-pet-window" };
  }
  if (typeof payload.url !== "string" || !/^https?:\/\//i.test(payload.url)) {
    return { success: false, error: "invalid-url" };
  }
  const safePayload = {
    url: payload.url,
    songId: payload.songId == null ? "" : String(payload.songId),
    title: typeof payload.title === "string" ? payload.title.slice(0, 80) : "",
    artist: typeof payload.artist === "string" ? payload.artist.slice(0, 80) : "",
    lyric: typeof payload.lyric === "string" ? payload.lyric : "",
    tlyric: typeof payload.tlyric === "string" ? payload.tlyric : "",
  };
  console.log("[music:play-audio-url] requested id=", safePayload.songId, "title=", safePayload.title);
  const requestId = `audio-host-${Date.now()}-${nextAudioHostRequestId++}`;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingAudioHostRequests.delete(requestId);
      resolve({ success: false, error: "audio-host-timeout", method: "audio-host", songId: safePayload.songId });
    }, 12000);
    pendingAudioHostRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve({
        success: !!(result && result.success),
        error: result && result.error,
        method: "audio-host",
        songId: safePayload.songId,
      });
    });
    petWindow.webContents.send(
      "pet:command",
      `music:play-audio-url:${encodeURIComponent(JSON.stringify({ ...safePayload, requestId }))}`,
    );
  });
});

ipcMain.handle("music:audio-host-result", (event, payload = {}) => {
  if (!petWindow || event.sender !== petWindow.webContents) {
    return { success: false, error: "invalid-sender" };
  }
  const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
  const resolve = pendingAudioHostRequests.get(requestId);
  if (!resolve) {
    return { success: false, error: "unknown-request" };
  }
  pendingAudioHostRequests.delete(requestId);
  resolve(payload);
  return { success: true };
});

ipcMain.handle("music:open-search-in-netease", async (_event, { query } = {}) => {
  // If no local NetEase executable is present, open the web search
  // immediately so web-only users get a reliable result.
  const exe = findNetEaseExecutable();
  if (!exe) {
    if (typeof query !== "string" || !query.trim()) {
      return { success: false, error: "empty-query" };
    }
    const webUrl = buildSearchWebUrl(query.trim());
    try {
      await shell.openExternal(webUrl);
      return { success: true, method: "web", target: webUrl, query };
    } catch (error) {
      return { success: false, error: "open-failed", details: [error && error.message], query };
    }
  }

  return openSearchInNeteaseCloudMusic(query);
});
ipcMain.handle("music:open-in-netease", async (_event, { url } = {}) => {
  if (typeof url !== "string" || !url) {
    return { success: false, error: "empty-url" };
  }
  if (!/^orpheus:\/\//i.test(url)) {
    return { success: false, error: "not-orpheus-url" };
  }
  return openNeteaseWithUrl(url, { allowBareExe: true });
});

ipcMain.handle("llm:chat", async (_event, { messages } = {}) => {
  return callConfiguredLlm(messages);
});

ipcMain.handle("chat:get-state", async () => {
  try {
    const controller = getChatMemoryController();
    return {
      success: true,
      mode: "remembered",
      state: controller.getState(),
    };
  } catch (err) {
    return { success: false, error: err && err.message, mode: "remembered", state: null };
  }
});

ipcMain.handle("chat:set-mode", async (_event, { mode } = {}) => {
  try {
    return getChatMemoryController().setMode(mode);
  } catch (err) {
    return { success: false, error: err && err.message, mode: "remembered" };
  }
});

ipcMain.handle("chat:send", async (_event, payload = {}) => {
  try {
    return await getChatMemoryController().sendMessage(payload);
  } catch (err) {
    return { success: false, error: err && err.message, state: null };
  }
});

ipcMain.handle("chat:clear-recent", async () => {
  try {
    return { success: true, state: getChatMemoryController().clearRecentMemory() };
  } catch (err) {
    return { success: false, error: err && err.message, state: null };
  }
});

ipcMain.handle("chat:clear-all", async () => {
  try {
    return { success: true, state: getChatMemoryController().clearAllMemory() };
  } catch (err) {
    return { success: false, error: err && err.message, state: null };
  }
});

ipcMain.handle("chat:get-memory-summary", async () => {
  try {
    return { success: true, summary: getChatMemoryController().getMemorySummary() };
  } catch (err) {
    return { success: false, error: err && err.message, summary: null };
  }
});

ipcMain.handle("chat:list-memories", async (_event, options = {}) => {
  try {
    return { success: true, memories: getChatMemoryController().listMemories(options) };
  } catch (err) {
    return { success: false, error: err && err.message, memories: [] };
  }
});

ipcMain.handle("chat:create-memory", async (_event, payload = {}) => {
  try {
    return getChatMemoryController().createMemory(payload);
  } catch (err) {
    return { success: false, error: err && err.message, state: null };
  }
});

ipcMain.handle("chat:update-memory", async (_event, payload = {}) => {
  try {
    return getChatMemoryController().updateMemory(payload);
  } catch (err) {
    return { success: false, error: err && err.message, state: null };
  }
});

ipcMain.handle("chat:delete-memory", async (_event, { id } = {}) => {
  try {
    return getChatMemoryController().deleteMemory(id);
  } catch (err) {
    return { success: false, error: err && err.message, state: null };
  }
});

ipcMain.handle("chat:clear-summary", async () => {
  try {
    return { success: true, state: getChatMemoryController().clearSummary() };
  } catch (err) {
    return { success: false, error: err && err.message, state: null };
  }
});

ipcMain.handle("chat:bubble-show", async (_event, { text } = {}) => {
  if (typeof text !== "string" || !text.trim()) {
    return { success: false, error: "empty-text" };
  }
  if (!petWindow || petWindow.isDestroyed()) {
    return { success: false, error: "no-pet-window" };
  }
  // Truncate to keep the bubble readable (it's a small overlay).
  const trimmed = text.trim().replace(/\s+/g, " ");
  const max = 60;
  const display = trimmed.length > max ? `${trimmed.slice(0, max)}...` : trimmed;
  petWindow.webContents.send("pet:command", `chat-reply-bubble:${encodeURIComponent(display)}`);
  return { success: true };
});

ipcMain.handle("shell:open-external", async (_event, { url } = {}) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return { success: false, error: "invalid-url" };
  }
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (_error) {
    return { success: false, error: "open-failed" };
  }
});

ipcMain.handle("pet:show-menu", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }

  Menu.buildFromTemplate(buildContextMenuTemplate({
    currentSizePercent: appSettings.sizePercent,
    currentSpeedPercent: appSettings.speedPercent,
    petState: appSettings.petState,
    focusDurationMinutes: appSettings.focusDurationMinutes,
    breakDurationMinutes: appSettings.breakDurationMinutes,
    longBreakDurationMinutes: appSettings.longBreakDurationMinutes,
    focusRoundsBeforeLongBreak: appSettings.focusRoundsBeforeLongBreak,
    pendingTaskName: appSettings.pendingTaskName,
    focusRecords: appSettings.focusRecords,
    focusSession: appSettings.focusSession,
    recentTaskNames: collectRecentTaskNames(appSettings.focusRecords),
    sendCommand: sendPetCommand,
    quit: () => app.quit(),
  })).popup({ window });
});

// Music profile, playlists, and QR login.
ipcMain.handle("music:get-session-status", async () => musicController.getSessionStatus());

ipcMain.handle("music:get-user-playlists", async (_event, payload = {}) => {
  try {
    return await musicController.getUserPlaylists(payload);
  } catch (err) {
    return { success: false, error: err && err.message, playlists: [] };
  }
});

ipcMain.handle("music:get-playlist-detail", async (_event, payload = {}) => {
  try {
    return await musicController.getPlaylistDetail(payload);
  } catch (err) {
    return { success: false, error: err && err.message };
  }
});

ipcMain.handle("music:get-profile", async () => {
  try {
    return await musicController.getProfile();
  } catch (err) {
    return { success: false, error: err && err.message };
  }
});

ipcMain.handle("music:logout", async () => {
  try {
    const result = await musicController.logout();
    broadcastMusicAuthState();
    return result;
  } catch (err) {
    return { success: false, error: err && err.message };
  }
});

// --- NetEase extras: daily rec, top charts, lyrics, FM ---

ipcMain.handle("music:get-daily-recommend", async () => {
  try {
    return await musicController.getDailyRecommend();
  } catch (err) {
    return { success: false, error: err && err.message, songs: [] };
  }
});

ipcMain.handle("music:get-top-charts", async () => {
  try {
    return await musicController.getTopCharts();
  } catch (err) {
    return { success: false, error: err && err.message, charts: [] };
  }
});

ipcMain.handle("music:get-lyric", async (_event, { id } = {}) => {
  try {
    return await musicController.getLyric(id);
  } catch (err) {
    return { success: false, error: err && err.message, lyric: "", tlyric: "" };
  }
});

ipcMain.handle("music:get-fm-song", async () => {
  try {
    return await musicController.getFmSong();
  } catch (err) {
    return { success: false, error: err && err.message };
  }
});

ipcMain.handle("music:playlist-tracks", async (_event, payload = {}) => {
  try {
    return await musicController.manipulatePlaylistTracks(payload);
  } catch (err) {
    return { success: false, error: err && err.message };
  }
});

ipcMain.handle("music:like-song", async (_event, { id, like } = {}) => {
  try {
    return await musicController.likeSong(id, like);
  } catch (err) {
    return { success: false, error: err && err.message };
  }
});

ipcMain.handle("music:check-liked-songs", async (_event, { ids } = {}) => {
  try {
    return await musicController.checkLikedSongs(ids);
  } catch (err) {
    return { success: false, error: err && err.message, liked: {} };
  }
});

ipcMain.handle("music:playback-state:get", () => musicPlaybackState);

ipcMain.handle("music:playback-state:update", (_event, state = {}) => {
  try {
    return { success: true, state: persistMusicPlaybackState(mergePlaybackStateForPersistence(musicPlaybackState, state)) };
  } catch (err) {
    return { success: false, error: err && err.message, state: musicPlaybackState };
  }
});

ipcMain.handle("music:playback-history:remove", (_event, { id } = {}) => {
  try {
    return {
      success: true,
      state: persistMusicPlaybackState(removeHistoryEntry(musicPlaybackState, id)),
    };
  } catch (err) {
    return { success: false, error: err && err.message, state: musicPlaybackState };
  }
});

ipcMain.handle("music:playback-history:clear", () => {
  try {
    return {
      success: true,
      state: persistMusicPlaybackState(clearHistory(musicPlaybackState)),
    };
  } catch (err) {
    return { success: false, error: err && err.message, state: musicPlaybackState };
  }
});

ipcMain.handle("music:get-intelligence-list", async (_event, payload = {}) => {
  try {
    return await musicController.getIntelligenceList(payload);
  } catch (err) {
    return { success: false, error: err && err.message, songs: [] };
  }
});

ipcMain.handle("music:fm-trash", async (_event, { id } = {}) => {
  try {
    return await musicController.trashFmSong(id);
  } catch (err) {
    return { success: false, error: err && err.message };
  }
});

function notifyRenderer(command) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet:command", command);
  }
}

function completeQrLogin(cookie) {
  const acceptResult = musicController.acceptWebLoginCookie(cookie);
  console.log("[music] completeQrLogin acceptResult=", JSON.stringify(acceptResult).slice(0, 200));
  broadcastMusicAuthState();
  sendPetFeedback("music:feedback:login-success");
  notifyRenderer("music:login-completed");
}

function failQrLogin() {
  notifyRenderer("music:login-failed");
}

ipcMain.handle("music:qr-create-key", async () => {
  return auth.createQrKey({
    onDebug: (info) => {
      const summary = JSON.stringify(info).slice(0, 400);
      console.error("[music:qr-create-key] debug:", summary);
    },
  }).catch((error) => {
    console.error("[music:qr-create-key] createQrKey failed:", error && error.message);
    return { success: false, error: error && error.message };
  });
});

ipcMain.handle("music:qr-create-image", async (_event, { key } = {}) => {
  return auth.createQrImage(key);
});

ipcMain.handle("music:qr-check", async (_event, { key } = {}) => {
  const result = await auth.checkQrStatus(key).catch((error) => ({
    success: false,
    error: error && error.message ? error.message : "qr-check-failed",
  }));
  if (result && result.success && result.status === "ok") {
    if (!result.cookie) {
      failQrLogin();
      return { ...result, success: false, error: "missing-cookie" };
    }
    completeQrLogin(result.cookie);
  }
  return result;
});

// Diagnostic handlers to help users/reporters debug NetEase launching.
ipcMain.handle("netease:find-exe", () => {
  try {
    const candidates = NETEASE_CANDIDATE_PATHS.map((p) => ({ path: p, exists: !!(p && fs.existsSync(p)) }));
    const found = findNetEaseExecutable();
    const result = { found, candidates };
    console.log("[netease:find-exe] ->", JSON.stringify(result));
    return result;
  } catch (err) {
    console.error("[netease:find-exe] error:", err && err.message);
    return { found: null, candidates: [], error: String(err && err.message) };
  }
});

ipcMain.handle("netease:open-test", async (_event, { url, allowBareExe = true } = {}) => {
  try {
    console.log("[netease:open-test] url=", url, "allowBareExe=", allowBareExe);
    const r = await openNeteaseWithUrl(url, { allowBareExe });
    console.log("[netease:open-test] result=", JSON.stringify(r));
    return r;
  } catch (err) {
    console.error("[netease:open-test] error:", err && err.message);
    return { success: false, error: String(err && err.message) };
  }
});

ipcMain.handle("netease:ping", () => {
  console.log("[netease:ping]");
  return { ok: true };
});

function collectRecentTaskNames(records, max = 5) {
  if (!Array.isArray(records)) {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const r = records[i];
    if (!r || typeof r !== "object") continue;
    const name = typeof r.task === "string" ? r.task.trim() : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}
