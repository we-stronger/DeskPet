const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("compact music panel renders QR login in-place and polls QR status", () => {
  const source = fs.readFileSync(path.join(root, "src", "renderer", "music-panel.js"), "utf8");

  assert.match(source, /createNeteaseQrKey/);
  assert.match(source, /createNeteaseQrImage/);
  assert.match(source, /checkNeteaseQr/);
  assert.match(source, /id="music-panel-qr-image"/);
  assert.match(source, /setTimeout\(\(\) => pollQrLogin/);
});

test("compact music panel exposes obvious login and logout actions", () => {
  const source = fs.readFileSync(path.join(root, "src", "renderer", "music-panel.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "src", "renderer", "styles.css"), "utf8");

  assert.match(source, /music-panel-login-card/);
  assert.match(source, /music-panel-login-btn/);
  assert.match(source, /扫码登录/);
  assert.match(source, /music-panel-logout-btn/);
  assert.match(source, /退出登录/);
  assert.match(css, /\.music-panel-login-card/);
  assert.match(css, /\.music-panel-session-row/);
});

test("main process QR IPC returns a key and checks NetEase QR status directly", () => {
  const source = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");

  assert.match(source, /ipcMain\.handle\("music:qr-create-key"[\s\S]*auth\.createQrKey/);
  assert.match(source, /ipcMain\.handle\("music:qr-check"[\s\S]*auth\.checkQrStatus/);
  assert.match(source, /completeQrLogin\(result\.cookie\)/);
  assert.doesNotMatch(source, /ipcMain\.handle\("music:qr-check"[\s\S]*waiting-for-scan"[\s\S]*\}\);/);
});
