const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("focus notifications are created in main without focusing the pet window", () => {
  const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
  const focusSystem = fs.readFileSync(path.join(root, "src", "main", "focus-system.js"), "utf8");
  const preload = fs.readFileSync(path.join(root, "src", "preload.js"), "utf8");

  assert.match(preload, /showFocusNotification\(payload\)/);
  assert.match(preload, /ipcRenderer\.invoke\("focus:notify"/);
  assert.match(main, /registerFocusSystem\(/);
  assert.match(focusSystem, /ipcMain\.handle\("focus:notify"/);
  assert.match(focusSystem, /new Notification\(/);
  const handler = focusSystem.slice(focusSystem.indexOf('ipcMain.handle("focus:notify"'), focusSystem.indexOf('ipcMain.handle("focus:notify"') + 1200);
  assert.doesNotMatch(handler, /petWindow\.(show|focus|restore)\(/);
});

test("system resume asks the renderer to reconcile wall-clock focus state", () => {
  const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
  const focusSystem = fs.readFileSync(path.join(root, "src", "main", "focus-system.js"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");

  assert.match(main, /registerFocusSystem\(/);
  assert.match(focusSystem, /powerMonitor\?\.on\?\.\("resume"/);
  assert.match(focusSystem, /sendCommand\?\.\("focus:reconcile"\)/);
  assert.match(renderer, /command === "focus:reconcile"/);
});
