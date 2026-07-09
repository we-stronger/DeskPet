const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("settings:update broadcasts normalized settings to the running pet renderer", () => {
  const source = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");

  assert.match(source, /function sendSettingsToPet\(/);
  assert.match(source, /sendPetCommand\(`settings:\$\{encodeURIComponent\(JSON\.stringify\(appSettings\)\)\}`\)/);
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
