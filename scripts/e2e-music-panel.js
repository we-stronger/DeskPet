// E2E browser test for the NetEase music panel. Launches the renderer
// in Electron with a custom preload (e2e-music-preload.js) that injects a
// stateful in-memory fake bridge via contextBridge, then walks through the
// full panel flow and checks the DOM ends up in the right state.
//
// Run with: npx electron scripts/e2e-music-panel.js
// Exits 0 on success, 1 on failure.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const userData = path.join(projectRoot, ".runtime", "user-data");
fs.mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("no-sandbox");

const logFile = path.join(projectRoot, ".runtime", "e2e-music.log");
fs.mkdirSync(path.dirname(logFile), { recursive: true });
fs.writeFileSync(logFile, "");
const logStream = fs.createWriteStream(logFile, { flags: "a" });
const log = (...args) => {
  const line = "[e2e-music] " + args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") + "\n";
  logStream.write(line);
  process.stderr.write(line);
};

function fail(win, message, detail) {
  log("FAIL:", message);
  if (detail !== undefined) log("  detail:", JSON.stringify(detail, null, 2));
  win.webContents
    .executeJavaScript("window.__e2eMusic ? JSON.stringify(window.__e2eMusic.getCalls()) : 'null'")
    .then((s) => {
      log("  openExternalCalls:", s);
    })
    .catch(() => {});
  setTimeout(() => app.exit(1), 200);
}

async function run() {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "e2e-music-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [],
    },
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    log("render-process-gone:", JSON.stringify(details));
  });
  win.webContents.on("preload-error", (_e, preloadPath, error) => {
    log("preload-error:", preloadPath, String(error));
  });
  // loadFile resolves when the page finishes loading — no need to wait again.
  await win.loadFile(path.join(projectRoot, "src", "renderer", "index.html"));
  await new Promise((r) => setTimeout(r, 400));

  // Sanity check: the music panel module loaded
  const moduleLoaded = await win.webContents.executeJavaScript(
    "typeof window.DeskpetMusicPanel === 'object' && typeof window.DeskpetMusicPanel.open === 'function'",
  );
  if (!moduleLoaded) return fail(win, "DeskpetMusicPanel module did not load");

  // Confirm the fake bridge is in place (preload should have run)
  const bridgeOk = await win.webContents.executeJavaScript(
    "typeof window.deskpet === 'object' && typeof window.deskpet.getProfile === 'function' && typeof window.__e2eMusic === 'object'",
  );
  if (!bridgeOk) return fail(win, "fake bridge did not install");

  // Reset any state from prior runs
  await win.webContents.executeJavaScript(
    "window.__e2eMusic.forceLoggedIn(false); window.__e2eMusic.resetQrCount();",
  );

  // ----- Scenario A: open panel, see logged-out state -----
  await win.webContents.executeJavaScript("window.DeskpetMusicPanel.open('home')");
  await new Promise((r) => setTimeout(r, 200));

  const stateA = await win.webContents.executeJavaScript(`(() => {
    const panel = document.querySelector('#music-panel');
    const profile = document.querySelector('#music-panel-profile');
    const loginBtn = document.querySelector('#music-panel-login-btn');
    return {
      panelExists: !!panel,
      panelVisible: panel && !panel.hidden,
      profileText: profile && profile.textContent,
      hasLoginButton: !!loginBtn,
    };
  })()`);
  log("A. loged-out state:", stateA);
  if (!stateA.panelExists || !stateA.panelVisible) {
    return fail(win, "panel should be visible after open()", stateA);
  }
  if (!stateA.hasLoginButton) {
    return fail(win, "expected '扫码登录' button when not logged in", stateA);
  }

  // ----- Scenario A2: real pointer events on the login button must NOT
  // bubble to the pet's #stage (which captures pointerdown with
  // setPointerCapture and would swallow the click). We instrument the stage
  // with a bubble-phase probe listener (matching how renderer.js registers
  // the pet's pointerdown handler) and dispatch a real PointerEvent. -----
  await win.webContents.executeJavaScript(`(() => {
    window.__stagePointerCount = 0;
    // Bubble phase — matches the pet's actual handler. stopPropagation()
    // on the panel must prevent this from firing.
    document.querySelector('#stage').addEventListener('pointerdown', () => {
      window.__stagePointerCount += 1;
    });
  })()`);
  // Dispatch a real PointerEvent (the same shape a mouse produces) on the
  // login button, then a pointerup.
  await win.webContents.executeJavaScript(`(() => {
    const btn = document.querySelector('#music-panel-login-btn');
    const r = btn.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, composed: true,
      pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
      screenX: r.left + r.width / 2, screenY: r.top + r.height / 2 };
    btn.dispatchEvent(new PointerEvent('pointerdown', opts));
    btn.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  })()`);
  await new Promise((r) => setTimeout(r, 600));

  const stateA2 = await win.webContents.executeJavaScript(`(() => ({
    stagePointerCount: window.__stagePointerCount,
    hasQrHint: !!document.querySelector('.music-panel-qr-hint'),
    hasRefresh: !!document.querySelector('#music-panel-refresh-qr'),
    statusText: (document.querySelector('#music-panel-status') || {}).textContent || '',
  }))()`);
  log("A2. pointer-event isolation + login hint:", stateA2);
  if (stateA2.stagePointerCount > 0) {
    return fail(
      win,
      "real pointerdown on the music panel login button leaked to #stage — the pet would intercept the click instead of the panel's QR login firing",
      stateA2,
    );
  }
  if (!stateA2.hasQrHint) {
    return fail(
      win,
      "real pointer events on the login button should trigger startQrLogin (the '扫码登录窗口已弹出' hint should appear)",
      stateA2,
    );
  }

  // ----- Scenario B: simulate the web-login popup succeeding -----
  // In production the popup closes and the main process pushes
  // `music:login-completed` via the same onCommand channel that renderer.js
  // already listens on. We invoke that handler directly to skip the real
  // popup (which would actually open music.163.com in a window and require a
  // phone scan).
  await win.webContents.executeJavaScript("window.__e2eMusic.forceLoggedIn(true)");
  await win.webContents.executeJavaScript("window.__e2eMusic.simulateLoginCompleted()");
  await new Promise((r) => setTimeout(r, 400));

  const stateB = await win.webContents.executeJavaScript(`(() => {
    const profile = document.querySelector('#music-panel-profile');
    const searchInput = document.querySelector('#music-panel-search-input');
    const searchBtn = document.querySelector('#music-panel-search-btn');
    const playlistsBtn = document.querySelector('#music-panel-playlists-btn');
    const logoutBtn = document.querySelector('#music-panel-logout-btn');
    return {
      profileText: profile && profile.textContent,
      hasSearchInput: !!searchInput,
      hasSearchBtn: !!searchBtn,
      hasPlaylistsBtn: !!playlistsBtn,
      hasLogoutBtn: !!logoutBtn,
    };
  })()`);
  log("B. after login-completed:", stateB);
  if (!stateB.hasSearchInput) return fail(win, "expected search input after login completion", stateB);
  if (!stateB.profileText.includes("测试昵称")) {
    return fail(win, "expected nickname to show in header after login", stateB);
  }

  // ----- Scenario D: trigger search and verify results render -----
  await win.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#music-panel-search-input');
    input.value = '周杰伦';
    document.querySelector('#music-panel-search-btn').click();
  })()`);
  await new Promise((r) => setTimeout(r, 400));

  const stateD = await win.webContents.executeJavaScript(`(() => {
    const rows = document.querySelectorAll('.music-panel-song');
    return {
      songCount: rows.length,
      firstTitle: rows[0] && rows[0].querySelector('strong') && rows[0].querySelector('strong').textContent,
    };
  })()`);
  log("D. search state:", stateD);
  if (stateD.songCount < 2) return fail(win, "expected at least 2 songs after search", stateD);

  // ----- Scenario E: click '我的歌单' and verify playlist render -----
  await win.webContents.executeJavaScript(`document.querySelector('#music-panel-playlists-btn').click()`);
  await new Promise((r) => setTimeout(r, 300));

  const stateE = await win.webContents.executeJavaScript(`(() => {
    const rows = document.querySelectorAll('.music-panel-playlist');
    return { playlistCount: rows.length };
  })()`);
  log("E. playlists state:", stateE);
  if (stateE.playlistCount < 2) return fail(win, "expected at least 2 playlists", stateE);

  // ----- Scenario F: click first playlist and verify detail render -----
  await win.webContents.executeJavaScript(`document.querySelector('.music-panel-open-playlist').click()`);
  await new Promise((r) => setTimeout(r, 300));

  const stateF = await win.webContents.executeJavaScript(`(() => {
    const title = document.querySelector('.music-panel-detail-title');
    const rows = document.querySelectorAll('.music-panel-song');
    return { titleText: title && title.textContent, songCount: rows.length };
  })()`);
  log("F. playlist detail state:", stateF);
  if (!stateF.titleText || !stateF.titleText.includes("我喜欢的音乐")) {
    return fail(win, "expected playlist title", stateF);
  }
  if (stateF.songCount < 2) return fail(win, "expected songs in playlist detail", stateF);

  // ----- Scenario G: click open on first song -----
  await win.webContents.executeJavaScript(`document.querySelector('.music-panel-open-song').click()`);
  await new Promise((r) => setTimeout(r, 400));

  const stateG = await win.webContents.executeJavaScript(`(() => ({
    calls: window.__e2eMusic ? window.__e2eMusic.getCalls() : null,
    bridgeExists: typeof window.deskpet === 'object' && typeof window.deskpet.openMusicSong === 'function',
    btnExists: !!document.querySelector('.music-panel-open-song'),
    btnHasId: document.querySelector('.music-panel-open-song') && document.querySelector('.music-panel-open-song').getAttribute('data-song-id'),
  }))()`);
  log("G. openSong side effects:", stateG);
  if (!stateG.calls || stateG.calls.length === 0) {
    return fail(win, "expected the song open button to trigger openMusicSong", stateG);
  }

  // ----- Scenario H: close and reopen reflects logged-in state -----
  await win.webContents.executeJavaScript("window.DeskpetMusicPanel.close()");
  await new Promise((r) => setTimeout(r, 100));
  await win.webContents.executeJavaScript("window.DeskpetMusicPanel.open('home')");
  await new Promise((r) => setTimeout(r, 200));
  const stateH = await win.webContents.executeJavaScript(`(() => {
    const profile = document.querySelector('#music-panel-profile');
    const searchInput = document.querySelector('#music-panel-search-input');
    return { profileText: profile && profile.textContent, hasSearch: !!searchInput };
  })()`);
  log("H. reopen state:", stateH);
  if (!stateH.hasSearch) return fail(win, "after reopen, expected logged-in UI (search input)", stateH);

  log("OK: full music panel flow works end-to-end");
  setTimeout(() => app.exit(0), 200);
}

app.whenReady().then(() => {
  // Hard timeout — if anything hangs in the renderer we still exit.
  const hardTimer = setTimeout(() => {
    log("HARD TIMEOUT after 60s — exiting");
    app.exit(2);
  }, 60000);
  run().then(() => clearTimeout(hardTimer)).catch((e) => {
    clearTimeout(hardTimer);
    log("error:", e && e.stack || e);
    app.exit(1);
  });
});