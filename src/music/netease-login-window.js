// NetEase "login window" helper.
//
// Opens NetEase's official login page in an Electron BrowserWindow so we
// can observe the MUSIC_U cookie that NetEase sets after a successful
// login via ANY method (QR scan, phone, email). The previous popup-based
// approach failed because (a) opening via music.163.com triggers an
// ERR_ABORTED on the SPA hash redirect, and (b) it could only detect
// success when the user scanned our specific QR — phone/email login
// would silently succeed on the page without ever confirming our
// unikey, so the panel would stay at "waiting" forever.
//
// This module:
//   - Opens the URL in a normal BrowserWindow the user can interact with.
//   - Polls webContents.session.cookies for the MUSIC_U auth marker.
//   - Treats did-fail-load's ERR_ABORTED as benign (SPA hash redirect).
//   - Resolves with the cookie string once MUSIC_U appears, or rejects
//     on timeout / window close.

const { BrowserWindow } = require("electron");

// Cookie names NetEase sets once a user is fully signed in. MUSIC_U is
// the canonical auth marker; __MUSIC_U and MUSIC_A are accepted as
// backups because some accounts only set one of them. NMTID is NOT
// included — it's a tracking cookie NetEase sets for every visitor
// (logged in or not), so detecting it would falsely flag the page
// load as a successful login before the user has even scanned the QR.
const AUTH_COOKIE_NAMES = ["MUSIC_U", "__MUSIC_U", "MUSIC_A"];

function isAuthCookie(cookie) {
  if (!cookie || !cookie.name) return false;
  return AUTH_COOKIE_NAMES.includes(cookie.name);
}

function cookieString(list) {
  if (!Array.isArray(list) || list.length === 0) return "";
  return list
    .filter((c) => c && c.name && typeof c.value === "string" && c.value.length > 0 && isAuthCookie(c))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function startLoginWindow({
  url,
  pollIntervalMs = 1500,
  timeoutMs = 5 * 60 * 1000,
  onSuccess = () => {},
  onCancel = () => {},
  onError = () => {},
  createWindow = BrowserWindow,
} = {}) {
  const win = new createWindow({
    width: 520,
    height: 720,
    title: "网易云音乐 扫码登录",
    parent: undefined,
    modal: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: "#f7f9fc",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // No preload — the page is third-party content from NetEase.
    },
  });
  win.removeMenu();

  let resolved = false;
  let pollId = null;
  let timeoutId = null;
  let closed = false;

  function cleanup() {
    if (pollId) { clearInterval(pollId); pollId = null; }
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
  }

  // Close the window once. We funnel cancel / success / error through
  // here so onSuccess / onCancel fire exactly once and in the right order.
  function closeWindow() {
    cleanup();
    try {
      if (!win.isDestroyed()) win.close();
    } catch (_e) {}
  }

  function resolveWith(intent) {
    if (resolved) return;
    resolved = true;
    closeWindow();
    if (intent === "cancel") onCancel();
    // "success" path already called onSuccess from the poller.
    // "error" paths already called onError before reaching here.
  }

  win.on("closed", () => {
    closed = true;
    resolveWith("cancel");
  });

  win.webContents.on("did-finish-load", () => {
    if (!win.isDestroyed() && !closed) win.show();
  });

  // ERR_ABORTED (-3) fires whenever Chromium cancels an in-flight load: the
  // page reloaded, the URL hash changed via SPA navigation, or the load was
  // superseded by another navigation. NetEase's login page is an SPA — the
  // server returns music.163.com/login and the JS hydrates by setting
  // location.hash = '/login', which Chromium reports as a soft abort on
  // the original navigation. The page itself actually loads (did-finish-load
  // fires shortly after) so we must NOT treat ERR_ABORTED as a real failure.
  win.webContents.on("did-fail-load", (_event, errorCode, _errorDescription, _validatedURL) => {
    if (resolved) return;
    if (errorCode === -3) return; // ERR_ABORTED — SPA hash redirect, not a real failure
    onError(`加载登录页失败 (${errorCode})`);
    resolveWith("error");
  });

  async function checkCookies() {
    if (resolved || closed || win.isDestroyed()) return;
    try {
      const sess = win.webContents && win.webContents.session;
      if (!sess) return;
      const all = await sess.cookies.get({ domain: ".music.163.com" });
      const auth = all.filter(isAuthCookie);
      if (auth.length > 0) {
        const cookieStr = cookieString(auth);
        if (cookieStr) {
          onSuccess(cookieStr);
          resolveWith("success");
        }
      }
    } catch (_error) {
      // transient — try again next interval
    }
  }

  pollId = setInterval(checkCookies, pollIntervalMs);
  timeoutId = setTimeout(() => {
    if (resolved) return;
    onError("二维码登录超时，请重试。");
    resolveWith("error");
  }, timeoutMs);

  win.loadURL(url).catch((_error) => {
    // loadURL may reject with ERR_ABORTED on the SPA hash redirect — that
    // is benign, the page is actually loading. Don't surface it as an error.
  });

  return {
    window: win,
    cancel: () => resolveWith("cancel"),
  };
}

module.exports = {
  startLoginWindow,
  isAuthCookie,
  cookieString,
  AUTH_COOKIE_NAMES,
};