// Unit tests for the Electron BrowserWindow login helper. The helper
// polls the window's session cookies for MUSIC_U / __MUSIC_U / NMTID /
// MUSIC_A so we can detect login via ANY method (QR scan, phone, email)
// — the previous polling-endpoint approach only succeeded when the user
// scanned the specific unikey we generated.
const assert = require("node:assert/strict");
const test = require("node:test");
const { EventEmitter } = require("node:events");

const {
  startLoginWindow,
  isAuthCookie,
  cookieString,
  sessionCookieString,
  AUTH_COOKIE_NAMES,
} = require("../src/music/netease-login-window");

// -- cookie helpers exposed on the module --

test("AUTH_COOKIE_NAMES includes the three real NetEase session markers (not NMTID)", () => {
  // NMTID is a tracking cookie set for every visitor, so it must NOT
  // be treated as an auth marker — otherwise the helper declares the
  // page load itself as a successful login.
  assert.deepEqual(AUTH_COOKIE_NAMES, ["MUSIC_U", "__MUSIC_U", "MUSIC_A"]);
});

test("isAuthCookie rejects NMTID even though it sounds like an auth cookie", () => {
  // Regression: NMTID is set for every visitor to music.163.com, so
  // accepting it as an auth marker causes the polling helper to
  // trigger onSuccess the moment the login page loads.
  assert.equal(isAuthCookie({ name: "NMTID", value: "tracking-id" }), false);
});

test("isAuthCookie accepts every entry in AUTH_COOKIE_NAMES", () => {
  for (const name of AUTH_COOKIE_NAMES) {
    assert.equal(isAuthCookie({ name, value: "x" }), true);
  }
});

test("isAuthCookie rejects missing/empty/foreign cookies", () => {
  assert.equal(isAuthCookie(undefined), false);
  assert.equal(isAuthCookie(null), false);
  assert.equal(isAuthCookie({}), false);
  assert.equal(isAuthCookie({ value: "x" }), false);
  assert.equal(isAuthCookie({ name: "JSESSIONID", value: "x" }), false);
});

test("cookieString joins entries with '; '", () => {
  assert.equal(
    cookieString([
      { name: "MUSIC_U", value: "abc" },
      { name: "__MUSIC_U", value: "xyz" },
    ]),
    "MUSIC_U=abc; __MUSIC_U=xyz",
  );
});

test("cookieString filters out non-auth and invalid entries", () => {
  assert.equal(cookieString([]), "");
  assert.equal(cookieString(null), "");
  assert.equal(cookieString(undefined), "");
  // Non-auth cookies are dropped by isAuthCookie.
  assert.equal(
    cookieString([
      { name: "JSESSIONID", value: "j" },
      { name: "MUSIC_U", value: "abc" },
    ]),
    "MUSIC_U=abc",
  );
  // Missing value or empty value is dropped.
  assert.equal(
    cookieString([
      { name: "MUSIC_U", value: "" },
      { name: "MUSIC_U", value: "real" },
    ]),
    "MUSIC_U=real",
  );
});

test("sessionCookieString keeps csrf and device cookies after authentication", () => {
  assert.equal(
    sessionCookieString([
      { name: "NMTID", value: "device" },
      { name: "__csrf", value: "csrf-token" },
      { name: "MUSIC_U", value: "session-token" },
      { name: "empty", value: "" },
    ]),
    "NMTID=device; __csrf=csrf-token; MUSIC_U=session-token",
  );
});

// -- mock BrowserWindow factory --

function makeMockWindow() {
  const closedEvents = new EventEmitter();
  const loadListeners = {};
  const cookieStore = new Map();
  let destroyed = false;

  return {
    width: 520,
    height: 720,
    showCount: 0,
    show: function () {
      this.showCount += 1;
    },
    close: function () {
      destroyed = true;
      closedEvents.emit("closed");
    },
    isDestroyed: () => destroyed,
    on: (event, fn) => closedEvents.on(event, fn),
    once: (event, fn) => closedEvents.once(event, fn),
    off: (event, fn) => closedEvents.off(event, fn),
    removeListener: (event, fn) => closedEvents.off(event, fn),
    removeMenu: () => {},
    // The real BrowserWindow exposes loadURL on the window itself; the
    // mock delegates into webContents.loadURL so we only maintain one
    // implementation.
    loadURL(url) {
      return this.webContents.loadURL(url);
    },
    webContents: {
      on(event, fn) {
        loadListeners[event] = fn;
      },
      get session() {
        return {
          cookies: {
            get: async ({ domain } = {}) => {
              if (!domain) return Array.from(cookieStore.values());
              return Array.from(cookieStore.values()).filter((c) => c.domain === domain);
            },
          },
        };
      },
      loadURL: async (url) => {
        // Mirror the real loadURL: SPA hash redirect inside NetEase's
        // login page triggers did-fail-load with -3 right before
        // did-finish-load fires. The helper must treat ERR_ABORTED as
        // benign — see startLoginWindow's did-fail-load handler.
        setImmediate(() => {
          if (loadListeners["did-fail-load"] && !destroyed) {
            loadListeners["did-fail-load"]({}, -3, "ERR_ABORTED", url);
          }
          if (loadListeners["did-finish-load"] && !destroyed) {
            loadListeners["did-finish-load"]();
          }
        });
      },
    },
    // test-only helpers
    _addCookie(name, value, domain = ".music.163.com") {
      cookieStore.set(name, { name, value, domain });
    },
    _simulateLoadFailure(errorCode, description = "ERR", url = "https://music.163.com/login") {
      if (loadListeners["did-fail-load"] && !destroyed) {
        loadListeners["did-fail-load"]({}, errorCode, description, url);
      }
    },
    _emitClosed() {
      destroyed = true;
      closedEvents.emit("closed");
    },
  };
}

// Class-based factory so the helper can call `new createWindow(...)`.
function makeMockFactory() {
  const windows = [];
  class MockBrowserWindow {
    constructor(opts) {
      const w = makeMockWindow();
      Object.assign(this, w);
      this._opts = opts;
      windows.push(this);
    }
  }
  return {
    windows,
    create: MockBrowserWindow,
  };
}

// wait for the helper's loadURL setImmediate chain to flush.
async function waitForLoad() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

// -- startLoginWindow behavior --

test("startLoginWindow calls onSuccess with cookie string when MUSIC_U appears", async () => {
  const factory = makeMockFactory();
  let successCookie = null;
  let cancelled = false;
  let errored = null;
  const handle = startLoginWindow({
    url: "https://music.163.com/login",
    pollIntervalMs: 10,
    timeoutMs: 1000,
    onSuccess: (cookie) => {
      successCookie = cookie;
    },
    onCancel: () => {
      cancelled = true;
    },
    onError: (err) => {
      errored = err;
    },
    createWindow: factory.create,
  });
  await waitForLoad();
  // Drop a MUSIC_U cookie as if the user just completed login.
  factory.windows[0]._addCookie("MUSIC_U", "session-token-abc");
  // Wait for the next poll cycle.
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(successCookie, "MUSIC_U=session-token-abc");
  assert.equal(cancelled, false);
  assert.equal(errored, null);
  handle.cancel();
});

test("startLoginWindow returns the complete NetEase cookie set on success", async () => {
  const factory = makeMockFactory();
  let successCookie = null;
  const handle = startLoginWindow({
    url: "https://music.163.com/login",
    pollIntervalMs: 10,
    timeoutMs: 1000,
    onSuccess: (cookie) => {
      successCookie = cookie;
    },
    createWindow: factory.create,
  });
  await waitForLoad();
  factory.windows[0]._addCookie("__csrf", "csrf-token");
  factory.windows[0]._addCookie("NMTID", "device-token");
  factory.windows[0]._addCookie("MUSIC_U", "session-token");
  await new Promise((r) => setTimeout(r, 40));

  assert.match(successCookie, /MUSIC_U=session-token/);
  assert.match(successCookie, /__csrf=csrf-token/);
  assert.match(successCookie, /NMTID=device-token/);
  handle.cancel();
});

test("startLoginWindow shows the window only after the page finishes loading", async () => {
  const factory = makeMockFactory();
  startLoginWindow({
    url: "https://music.163.com/login",
    pollIntervalMs: 10,
    timeoutMs: 1000,
    createWindow: factory.create,
  });
  // Before did-finish-load fires, the window must NOT be shown.
  assert.equal(factory.windows[0].showCount, 0);
  await waitForLoad();
  assert.equal(factory.windows[0].showCount, 1);
});

test("startLoginWindow treats did-fail-load with ERR_ABORTED (-3) as benign", async () => {
  const factory = makeMockFactory();
  let errored = null;
  const handle = startLoginWindow({
    url: "https://music.163.com/login?codekey=abc",
    pollIntervalMs: 10,
    timeoutMs: 1000,
    onError: (err) => {
      errored = err;
    },
    createWindow: factory.create,
  });
  await waitForLoad();
  // A stray ERR_ABORTED after page load must not surface as an error.
  factory.windows[0]._simulateLoadFailure(-3, "ERR_ABORTED");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(errored, null);
  handle.cancel();
});

test("startLoginWindow surfaces non-ABORTED load failures via onError", async () => {
  const factory = makeMockFactory();
  let errored = null;
  const handle = startLoginWindow({
    url: "https://music.163.com/login",
    pollIntervalMs: 10,
    timeoutMs: 1000,
    onError: (err) => {
      errored = err;
    },
    createWindow: factory.create,
  });
  await waitForLoad();
  factory.windows[0]._simulateLoadFailure(-105, "ERR_NAME_NOT_RESOLVED");
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(errored, "expected onError to be called");
  assert.match(errored, /-105|加载登录页失败/);
  handle.cancel();
});

test("startLoginWindow fires onError when timeout elapses without login", async () => {
  const factory = makeMockFactory();
  let errored = null;
  startLoginWindow({
    url: "https://music.163.com/login",
    pollIntervalMs: 10,
    timeoutMs: 50,
    onError: (err) => {
      errored = err;
    },
    createWindow: factory.create,
  });
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(errored, "expected timeout error");
  assert.match(errored, /超时/);
});

test("startLoginWindow fires onCancel when the user closes the window", async () => {
  const factory = makeMockFactory();
  let cancelled = false;
  const handle = startLoginWindow({
    url: "https://music.163.com/login",
    pollIntervalMs: 10,
    timeoutMs: 1000,
    onCancel: () => {
      cancelled = true;
    },
    createWindow: factory.create,
  });
  await waitForLoad();
  factory.windows[0]._emitClosed();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(cancelled, true);
  handle.cancel();
});

test("startLoginWindow only fires onSuccess once even if cookies keep being added", async () => {
  const factory = makeMockFactory();
  let successCount = 0;
  let lastCookie = null;
  const handle = startLoginWindow({
    url: "https://music.163.com/login",
    pollIntervalMs: 5,
    timeoutMs: 1000,
    onSuccess: (cookie) => {
      successCount += 1;
      lastCookie = cookie;
    },
    createWindow: factory.create,
  });
  await waitForLoad();
  factory.windows[0]._addCookie("MUSIC_U", "first-token");
  await new Promise((r) => setTimeout(r, 30));
  // Drop additional cookies — these should NOT trigger onSuccess again.
  factory.windows[0]._addCookie("__csrf", "csrf-token");
  factory.windows[0]._addCookie("MUSIC_U", "rotated-token");
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(successCount, 1);
  assert.equal(lastCookie, "MUSIC_U=first-token");
  handle.cancel();
});

test("startLoginWindow picks up MUSIC_A and __MUSIC_U as backup auth markers", async () => {
  const factory = makeMockFactory();
  let successCookie = null;
  const handle = startLoginWindow({
    url: "https://music.163.com/login",
    pollIntervalMs: 10,
    timeoutMs: 1000,
    onSuccess: (cookie) => {
      successCookie = cookie;
    },
    createWindow: factory.create,
  });
  await waitForLoad();
  factory.windows[0]._addCookie("MUSIC_A", "legacy-token");
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(successCookie, "MUSIC_A=legacy-token");
  handle.cancel();
});

test("startLoginWindow cancel() resolves with cancel", async () => {
  const factory = makeMockFactory();
  let cancelled = false;
  let successCookie = null;
  startLoginWindow({
    url: "https://music.163.com/login",
    pollIntervalMs: 10,
    timeoutMs: 1000,
    onCancel: () => {
      cancelled = true;
    },
    onSuccess: (cookie) => {
      successCookie = cookie;
    },
    createWindow: factory.create,
  });
  await waitForLoad();
  factory.windows[0].close();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(cancelled, true);
  assert.equal(successCookie, null);
});

test("startLoginWindow ignores non-music.163.com cookies when filtering", async () => {
  const factory = makeMockFactory();
  let successCookie = null;
  const handle = startLoginWindow({
    url: "https://music.163.com/login",
    pollIntervalMs: 10,
    timeoutMs: 1000,
    onSuccess: (cookie) => {
      successCookie = cookie;
    },
    createWindow: factory.create,
  });
  await waitForLoad();
  // Add a MUSIC_U on a different domain — the helper filters by domain.
  factory.windows[0]._addCookie("MUSIC_U", "other-domain-token", "example.com");
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(successCookie, null);
  handle.cancel();
});
