const assert = require("node:assert/strict");
const test = require("node:test");

const { createWindowManager } = require("../src/main/window-manager");
const { createTrayMenuRuntime } = require("../src/main/menu-runtime");
const { registerSettingsIpc } = require("../src/main/ipc/settings-ipc");
const { registerFocusSystem } = require("../src/main/focus-system");

function createFakeWindow() {
  const events = new Map();
  return {
    minimized: false,
    visible: false,
    focused: false,
    removedMenu: false,
    loaded: null,
    isDestroyed() { return false; },
    isMinimized() { return this.minimized; },
    restore() { this.minimized = false; },
    show() { this.visible = true; },
    focus() { this.focused = true; },
    removeMenu() { this.removedMenu = true; },
    once(name, listener) { events.set(name, listener); },
    on(name, listener) { events.set(name, listener); },
    loadURL(url) { this.loaded = url; return Promise.resolve(); },
    emit(name) { events.get(name)?.(); },
  };
}

test("window manager reuses visible windows and creates browser windows from declarative entries", () => {
  const created = [];
  const BrowserWindow = function BrowserWindow(options) {
    const window = createFakeWindow();
    window.options = options;
    created.push(window);
    return window;
  };
  const manager = createWindowManager({ BrowserWindow, resolveUrl: (file) => `file://${file}` });
  let current;
  const entry = {
    get: () => current,
    set: (window) => { current = window; },
    windowOptions: { width: 400, show: false },
    rendererPath: "renderer/settings.html",
  };
  const first = manager.open(entry);
  first.emit("ready-to-show");
  const reused = manager.open(entry);
  assert.equal(created.length, 1);
  assert.equal(reused, first);
  assert.equal(first.removedMenu, true);
  assert.equal(first.loaded, "file://renderer/settings.html");
  assert.equal(first.visible, true);
  assert.equal(first.focused, true);
  first.emit("closed");
  assert.equal(current, undefined);
});

test("tray runtime rebuilds its menu from current settings", () => {
  const applied = [];
  const menu = { buildFromTemplate: (template) => ({ template }) };
  const tray = { setContextMenu: (value) => applied.push(value) };
  let state = { clockEnabled: true };
  const runtime = createTrayMenuRuntime({
    Menu: menu,
    buildTemplate: (snapshot) => [{ label: snapshot.clockEnabled ? "clock on" : "clock off" }],
    getState: () => state,
  });
  runtime.setTray(tray);
  runtime.refresh();
  state = { clockEnabled: false };
  runtime.refresh();
  assert.equal(applied.length, 2);
  assert.equal(applied[1].template[0].label, "clock off");
});

test("settings IPC normalizes, persists, refreshes the tray, and broadcasts auxiliary updates", async () => {
  const handlers = new Map();
  const ipcMain = { handle: (name, listener) => handlers.set(name, listener) };
  let state = { opacity: 100 };
  let refreshes = 0;
  let broadcasts = 0;
  const petWindow = { webContents: { id: "pet" } };
  registerSettingsIpc({
    ipcMain,
    getSettings: () => state,
    persistSettings: (next) => { state = { ...next, persisted: true }; return state; },
    normalizeSettings: (next) => ({ ...next, opacity: Math.min(100, Math.max(20, Number(next.opacity) || 100)) }),
    refreshTray: () => { refreshes += 1; },
    sendSettingsToPet: () => { broadcasts += 1; },
    getPetWindow: () => petWindow,
  });
  const updated = await handlers.get("settings:update")({ sender: { id: "settings" } }, { opacity: 10 });
  assert.deepEqual(updated, { opacity: 20, persisted: true });
  assert.equal(refreshes, 1);
  assert.equal(broadcasts, 1);
  assert.deepEqual(await handlers.get("settings:get")(), { opacity: 20, persisted: true });
});

test("focus system sanitizes notifications and reconciles focus after resume", async () => {
  const handlers = new Map();
  const listeners = new Map();
  const shown = [];
  class Notification {
    static isSupported() { return true; }
    constructor(payload) { this.payload = payload; shown.push(payload); }
    show() {}
  }
  const focus = registerFocusSystem({
    ipcMain: { handle: (name, listener) => handlers.set(name, listener) },
    Notification,
    powerMonitor: { on: (name, listener) => listeners.set(name, listener), removeListener: (name) => listeners.delete(name) },
    sendCommand: (command) => shown.push({ command }),
  });
  const result = await handlers.get("focus:notify")(null, { title: " x ", body: " y ", silent: false });
  assert.deepEqual(result, { success: true });
  assert.deepEqual(shown[0], { title: "x", body: "y", silent: false });
  listeners.get("resume")();
  assert.deepEqual(shown[1], { command: "focus:reconcile" });
  focus.destroy();
  assert.equal(listeners.has("resume"), false);
});
