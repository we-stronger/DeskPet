const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("settings:update broadcasts normalized settings to the running pet renderer", () => {
  const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
  const source = fs.readFileSync(path.join(root, "src", "main", "ipc", "settings-ipc.js"), "utf8");

  assert.match(main, /function sendSettingsToPet\(/);
  assert.match(main, /registerSettingsIpc\(/);
  assert.match(
    source,
    /ipcMain\.handle\("settings:update"[\s\S]*sendSettingsToPet\(\)/,
    "settings:update must immediately notify the renderer, not only persist to disk",
  );
});

test("preload exposes compact music controls for the draggable music status bar", () => {
  const source = fs.readFileSync(path.join(root, "src", "preload.js"), "utf8");

  assert.match(source, /controlMusic\(action\)/);
  assert.match(source, /ipcRenderer\.invoke\("music:control"/);
  assert.match(source, /openMusicWindow\(\)/);
});

test("settings window exposes lyric color and size controls", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "settings.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "src", "renderer", "settings.js"), "utf8");

  assert.match(html, /id="settings-lyric-color"/);
  assert.match(html, /id="settings-lyric-size"/);
  assert.match(html, /id="settings-control-size"/);
  assert.match(js, /musicLyricStyle/);
  assert.match(js, /settings-lyric-color/);
  assert.match(js, /settings-lyric-size/);
  assert.match(js, /settings-control-size/);
});

test("standalone focus settings owns task naming and recent task choices", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "settings.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "src", "renderer", "settings.js"), "utf8");

  assert.match(html, /id="settings-focus-task"/);
  assert.match(html, /id="settings-focus-recent-tasks"/);
  assert.match(js, /pendingTaskName/);
  assert.match(js, /settings-focus-task/);
  assert.match(js, /settings-focus-recent-tasks/);
});

test("standalone settings owns display, automation, and focus records controls", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "settings.html"), "utf8");
  assert.match(html, /id="settings-clock-enabled"/);
  assert.match(html, /id="settings-opacity"/);
  assert.match(html, /id="settings-auto-behavior"/);
  assert.match(html, /id="settings-focus-records"/);
});

test("renderer applies lyric style settings and uses an expanded drag area for music status", () => {
  const source = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");

  assert.match(source, /musicLyricStyle/);
  assert.match(source, /applyMusicLyricStyle/);
  assert.match(source, /clampMusicStatusPosition/);
  assert.match(source, /MUSIC_STATUS_DRAG_EXTRA_BOTTOM/);
});

test("renderer routes previous and next through the in-pet playback queue first", () => {
  const source = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");

  assert.match(source, /DeskpetMusicPlaybackService\.playNext/);
  assert.match(source, /DeskpetMusicPlaybackService\.playPrevious/);
  assert.match(source, /queueResult && queueResult\.success/);
});
