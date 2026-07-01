const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, shell } = require("electron");
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
const { sendMediaKey } = require("./media-control");
const {
  musicActionFromCommand,
  musicFeedbackCommandForAction,
} = require("./music-command");
const {
  searchSongs,
  fetchSongUrl,
  buildSongOrpheusTargets,
  buildSongWebUrl,
  buildSearchOrpheusTargets,
  buildCloudMusicArgv,
} = require("./netease-search");
const { createMusicController } = require("./music/music-controller");
const auth = require("./music/netease-auth");
const { startLoginWindow } = require("./music/netease-login-window");
const { chat: llmChat } = require("./llm-client");
const { loadEnvConfig } = require("./env-config");
loadEnvConfig({ envPath: path.join(__dirname, "..", ".env") });

// Common Windows install paths for NetEase Cloud Music. Best-effort fallback
// after the `orpheus://` URI scheme fails.
const NETEASE_CANDIDATE_PATHS = [
  "D:\\SOFT\\CloudMusic\\cloudmusic.exe",
  "C:\\Program Files\\NetEase\\CloudMusic\\cloudmusic.exe",
  "C:\\Program Files (x86)\\NetEase\\CloudMusic\\cloudmusic.exe",
  path.join(process.env.LOCALAPPDATA || "", "NetEase\\CloudMusic\\cloudmusic.exe"),
];

let petWindow;
let musicSearchWindow;
let chatWindow;
let tray;
let appSettings = { ...defaultPetSettings };
let activeLoginWindow = null;

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
const musicController = createMusicController();

const runtimeUserDataPath = path.join(__dirname, "..", ".runtime", "user-data");
fs.mkdirSync(runtimeUserDataPath, { recursive: true });
app.setPath("userData", runtimeUserDataPath);
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
function settingsPath() {
  return path.join(app.getPath("userData"), "deskpet-settings.json");
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

  if (command.startsWith("music:")) {
    handleMusicCommand(command);
    return;
  }

  if (command === "chat:open") {
    openChatWindow();
    return;
  }

  petWindow?.webContents.send("pet:command", command);
}

function sendPetFeedback(command) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet:command", command);
  }
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
    sendMusicPanelCommand("search");
    return;
  }
  if (command === "music:open-playlists") {
    sendMusicPanelCommand("playlists");
    return;
  }
  if (command === "music:open-panel") {
    sendMusicPanelCommand();
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
async function openNeteaseWithUrl(url, { allowBareExe = true } = {}) {
  if (typeof url !== "string" || !url) {
    return { success: false, error: "empty-url" };
  }

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

  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate({
    petState: appSettings.petState,
    sendCommand: sendPetCommand,
    resetPosition: resetPetPosition,
    quit: () => app.quit(),
  })));
}

function createTray() {
  if (tray || isSmokeTest) {
    return;
  }

  const iconPath = path.join(__dirname, "..", "photo.png");
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

function openMusicSearchWindow() {
  if (musicSearchWindow && !musicSearchWindow.isDestroyed()) {
    if (musicSearchWindow.isMinimized()) musicSearchWindow.restore();
    musicSearchWindow.show();
    musicSearchWindow.focus();
    return;
  }

  musicSearchWindow = new BrowserWindow({
    width: MUSIC_SEARCH_WINDOW_SIZE.width,
    height: MUSIC_SEARCH_WINDOW_SIZE.height,
    minWidth: MUSIC_SEARCH_WINDOW_MIN_SIZE.width,
    minHeight: MUSIC_SEARCH_WINDOW_MIN_SIZE.height,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: false,
    title: "闂婂厖绠伴幖婊呭偍 璺?Desk Pet",
    backgroundColor: "#f7f9fc",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  musicSearchWindow.removeMenu();
  musicSearchWindow.once("ready-to-show", () => {
    if (musicSearchWindow && !musicSearchWindow.isDestroyed()) {
      musicSearchWindow.show();
    }
  });

  musicSearchWindow.on("closed", () => {
    musicSearchWindow = undefined;
  });

  const rendererPath = path.join(__dirname, "renderer", "music-search.html");
  musicSearchWindow.loadURL(pathToFileURL(rendererPath).toString()).catch((error) => {
    logSmoke("music-search loadURL rejected", error.message);
  });
}

let musicWindow;
function openMusicWindow() {
  if (musicWindow && !musicWindow.isDestroyed()) {
    if (musicWindow.isMinimized()) musicWindow.restore();
    musicWindow.show();
    musicWindow.focus();
    return;
  }

  musicWindow = new BrowserWindow({
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
  });

  musicWindow.removeMenu();
  musicWindow.once("ready-to-show", () => {
    if (musicWindow && !musicWindow.isDestroyed()) {
      musicWindow.show();
    }
  });

  musicWindow.on("closed", () => {
    musicWindow = undefined;
  });

  const rendererPath = path.join(__dirname, "renderer", "music.html");
  musicWindow.loadURL(pathToFileURL(rendererPath).toString()).catch((error) => {
    logSmoke("music loadURL rejected", error.message);
  });
}

ipcMain.handle("music:open-window", () => {
  openMusicWindow();
  return { success: true };
});

function openChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    if (chatWindow.isMinimized()) chatWindow.restore();
    chatWindow.show();
    chatWindow.focus();
    return;
  }

  chatWindow = new BrowserWindow({
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
  });

  chatWindow.removeMenu();
  chatWindow.once("ready-to-show", () => {
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.show();
    }
  });

  chatWindow.on("closed", () => {
    chatWindow = undefined;
  });

  const rendererPath = path.join(__dirname, "renderer", "chat.html");
  chatWindow.loadURL(pathToFileURL(rendererPath).toString()).catch((error) => {
    logSmoke("chat loadURL rejected", error.message);
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  appSettings = loadPetSettings(settingsPath());
  createPetWindow();
  createTray();

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

ipcMain.handle("settings:update", (_event, settings) => {
  appSettings = persistSettings({ ...appSettings, ...settings });
  refreshTrayMenu();
  return appSettings;
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

ipcMain.handle("window:close", () => {
  app.quit();
});

ipcMain.handle("music:search", async (_event, payload = {}) => musicController.searchMusic(payload));

ipcMain.handle("music:fetch-song-url", async (_event, { id } = {}) => {
  return fetchSongUrl(id);
});

ipcMain.handle("music:open-song", async (_event, { id } = {}) => {
  const result = await musicController.openSong({ id });
  if (result && result.success) {
    sendPetFeedback("music:feedback:open-song");
  } else {
    sendPetFeedback("music:feedback:error");
  }
  return result;
});

ipcMain.handle("music:play-song", async (_event, { id } = {}) => {
  if (typeof id !== "string" && !Number.isFinite(id)) {
    return { success: false, error: "invalid-id" };
  }
  console.log("[music:play-song] requested id=", id);
  // Walk through every known orpheus:// play variant. Each one is
  // handled by openNeteaseWithUrl which (1) tries shell.openExternal,
  // (2) falls back to spawning cloudmusic.exe with the URL, (3) opens
  // the bare exe as a last resort. If all variants fail to surface
  // NetEase, fall back to the web URL so the song is at least reachable.
  const orpheusTargets = buildSongOrpheusTargets(id);
  console.log("[music:play-song] orpheusTargets=", JSON.stringify(orpheusTargets));
  // If there's no local NetEase executable, prefer opening the web
  // song page directly to avoid launching the client without the
  // desired song loaded.
  const exeForPlay = findNetEaseExecutable();
  if (!exeForPlay) {
    const webUrl = buildSongWebUrl(id);
    try {
      await shell.openExternal(webUrl);
      return { success: true, method: "web", target: webUrl, songId: id };
    } catch (error) {
      return { success: false, error: "open-failed", details: [error && error.message], songId: id };
    }
  }
  const errors = [];
  for (const target of orpheusTargets) {
    console.log("[music:play-song] trying target=", target);
    const result = await openNeteaseWithUrl(target, { allowBareExe: false });
    console.log("[music:play-song] result=", JSON.stringify(result));
    if (result.success) {
      return { ...result, songId: id };
    }
    errors.push(result.error || "open-failed");
  }

  // Verify NetEase is actually installed before claiming fallback.
  const webUrl = buildSongWebUrl(id);
  try {
    await shell.openExternal(webUrl);
    return { success: true, method: "web", target: webUrl, songId: id };
  } catch (error) {
    return {
      success: false,
      error: "open-failed",
      details: errors,
      songId: id,
    };
  }
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

ipcMain.handle("llm:chat", async (_event, { messages } = {}) => llmChat(messages));

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
    pendingTaskName: appSettings.pendingTaskName,
    focusRecords: appSettings.focusRecords,
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
    return await musicController.logout();
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

function notifyRenderer(command) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet:command", command);
  }
}

function completeQrLogin(cookie) {
  const acceptResult = musicController.acceptWebLoginCookie(cookie);
  console.log("[music] completeQrLogin acceptResult=", JSON.stringify(acceptResult).slice(0, 200));
  sendPetFeedback("music:feedback:login-success");
  notifyRenderer("music:login-completed");
}

function failQrLogin() {
  notifyRenderer("music:login-failed");
}

ipcMain.handle("music:qr-create-key", async () => {
  // Bail out if a login window is already open — multiple clicks should
  // not spawn duplicate windows.
  if (activeLoginWindow && activeLoginWindow.window && !activeLoginWindow.window.isDestroyed()) {
    return { success: true, pending: true, alreadyOpen: true };
  }
  // Best-effort: get a unikey from NetEase so the official QR is for
  // our session. If the API call fails we still open the generic login
  // page — the user can scan QR, use phone, or email to log in and we
  // detect any of them via cookie polling.
  const qrResult = await auth.createQrKey({
    onDebug: (info) => {
      const summary = JSON.stringify(info).slice(0, 400);
      console.error("[music:qr-create-key] debug:", summary);
    },
  }).catch((error) => {
    console.error("[music:qr-create-key] createQrKey failed:", error && error.message);
    return { success: false, error: error && error.message };
  });
  const url = qrResult.success && qrResult.qrUrl
    ? qrResult.qrUrl
    : "https://music.163.com/login";
  activeLoginWindow = startLoginWindow({
    url,
    onSuccess: (cookie) => {
      activeLoginWindow = null;
      completeQrLogin(cookie);
    },
    onCancel: () => {
      activeLoginWindow = null;
    },
    onError: (error) => {
      activeLoginWindow = null;
      console.error("[music:qr-create-key] login window error:", error);
      failQrLogin();
    },
  });
  return { success: true, pending: true };
});

ipcMain.handle("music:qr-create-image", async (_event, { key } = {}) => {
  // The QR "image" is now rendered inside the login window itself, so
  // there is no separate image endpoint. Return the URL for legacy
  // callers that still want to display it.
  if (key) return { success: true, qrUrl: auth.buildQrUrl(key) };
  return { success: false, error: "no-active-session" };
});

ipcMain.handle("music:qr-check", async (_event, { key } = {}) => {
  // Login detection now runs entirely in the main process via cookie
  // polling inside the login window. Older renderer builds still poll
  // this endpoint; answer "waiting-for-scan" so they don't flip into
  // an error state while the cookie poller does its job.
  return { success: true, status: "waiting-for-scan" };
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



