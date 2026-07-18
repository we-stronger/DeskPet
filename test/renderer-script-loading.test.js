// Guard against the music panel silently breaking when its view modules
// aren't loaded before it captures `root.DeskpetMusicSearchView` /
// `root.DeskpetMusicPlaylistView` at module init. The current bug:
// index.html loads music-panel.js but not its two view dependencies,
// so a click on "扫码登录" throws inside setContent() when it tries to
// `searchView.escapeHtml(...)`.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

function extractScriptTags(html) {
  const tags = [];
  const re = /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}

function indexOf(arr, name) {
  return arr.findIndex((entry) => entry === name || entry.endsWith(`/${name}`));
}

test("renderer index.html loads music-panel with both view modules first", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  const tags = extractScriptTags(html);

  const panelIdx = indexOf(tags, "music-panel.js");
  const searchIdx = indexOf(tags, "music-search-view.js");
  const playlistIdx = indexOf(tags, "music-playlist-view.js");

  assert.ok(panelIdx >= 0, "index.html must load music-panel.js");
  assert.ok(searchIdx >= 0, "index.html must load music-search-view.js — without it, music-panel crashes on QR render");
  assert.ok(playlistIdx >= 0, "index.html must load music-playlist-view.js — without it, music-panel crashes when showing playlists");
  assert.ok(searchIdx < panelIdx, "music-search-view.js must load before music-panel.js");
  assert.ok(playlistIdx < panelIdx, "music-playlist-view.js must load before music-panel.js");
});

test("renderer index.html keeps the existing core scripts in order", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  const tags = extractScriptTags(html);

  // Animation + drag + state must come before renderer.js so its IIFE
  // sees them on window.
  const animationIdx = indexOf(tags, "animation-controller.js");
  const stateIdx = indexOf(tags, "pet-state-controller.js");
  const rendererIdx = indexOf(tags, "renderer.js");
  assert.ok(animationIdx >= 0 && stateIdx >= 0 && rendererIdx >= 0, "core scripts must all be loaded");
  assert.ok(animationIdx < stateIdx, "animation-controller must load before pet-state-controller");
  assert.ok(stateIdx < rendererIdx, "pet-state-controller must load before renderer.js");
});

test("renderer index.html loads shared music command policy before renderer", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  const tags = extractScriptTags(html);

  const musicCommandIdx = indexOf(tags, "../music-command.js");
  const rendererIdx = indexOf(tags, "renderer.js");

  assert.ok(musicCommandIdx >= 0, "index.html must load music-command.js for music feedback visuals");
  assert.ok(rendererIdx >= 0, "index.html must load renderer.js");
  assert.ok(musicCommandIdx < rendererIdx, "music-command.js must load before renderer.js");
});

test("renderer index.html loads shape and music status helpers before renderer", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  const tags = extractScriptTags(html);

  const shapeIdx = indexOf(tags, "pet-shape-rects.js");
  const musicStatusIdx = indexOf(tags, "music-status-view.js");
  const rendererIdx = indexOf(tags, "renderer.js");

  assert.ok(shapeIdx >= 0, "index.html must load pet-shape-rects.js");
  assert.ok(musicStatusIdx >= 0, "index.html must load music-status-view.js");
  assert.ok(rendererIdx >= 0, "index.html must load renderer.js");
  assert.ok(shapeIdx < rendererIdx, "pet-shape-rects.js must load before renderer.js");
  assert.ok(musicStatusIdx < rendererIdx, "music-status-view.js must load before renderer.js");
});

test("renderer index.html loads the CSP-safe runtime style helper before renderer", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  const tags = extractScriptTags(html);
  const runtimeStyleIdx = indexOf(tags, "runtime-style.js");
  const rendererIdx = indexOf(tags, "renderer.js");
  assert.ok(runtimeStyleIdx >= 0, "index.html must load runtime-style.js");
  assert.ok(runtimeStyleIdx < rendererIdx, "runtime-style.js must load before renderer.js");
});

test("renderer index.html loads the unified widget runtime after its dependencies and before renderer", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  const tags = extractScriptTags(html);
  const stateIdx = indexOf(tags, "widget-state.js");
  const coordinationIdx = indexOf(tags, "widget-coordination.js");
  const dragIdx = indexOf(tags, "widget-drag.js");
  const runtimeIdx = indexOf(tags, "widget-runtime.js");
  const rendererIdx = indexOf(tags, "renderer.js");

  assert.ok(runtimeIdx >= 0, "index.html must load widget-runtime.js");
  assert.ok(stateIdx < runtimeIdx, "widget state must load before widget runtime");
  assert.ok(coordinationIdx < runtimeIdx, "widget coordination must load before widget runtime");
  assert.ok(dragIdx < runtimeIdx, "widget drag must load before widget runtime");
  assert.ok(runtimeIdx < rendererIdx, "widget runtime must load before renderer.js");
});

test("renderer index.html loads focused renderer runtimes before bootstrap", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  const tags = extractScriptTags(html);
  const rendererIdx = indexOf(tags, "renderer.js");
  for (const runtime of ["focus-runtime.js", "music-status-runtime.js", "pet-interaction-runtime.js"]) {
    const index = indexOf(tags, runtime);
    assert.ok(index >= 0, `${runtime} must be loaded`);
    assert.ok(index < rendererIdx, `${runtime} must load before renderer.js`);
  }
});

test("renderer loads focus session and pet bridge modules before renderer", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  const tags = extractScriptTags(html);
  const timerIdx = indexOf(tags, "focus-timer.js");
  const sessionIdx = indexOf(tags, "focus-session-controller.js");
  const petBridgeIdx = indexOf(tags, "focus-pet-bridge.js");
  const rendererIdx = indexOf(tags, "renderer.js");

  assert.ok(timerIdx >= 0, "focus timer must be loaded");
  assert.ok(sessionIdx > timerIdx, "focus session controller must load after focus timer");
  assert.ok(petBridgeIdx > sessionIdx, "focus pet bridge must load after session controller");
  assert.ok(petBridgeIdx < rendererIdx, "focus modules must load before renderer.js");
});

test("runtime style helper loads before visual style and hold lock modules", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  const tags = extractScriptTags(html);
  const runtimeStyleIdx = indexOf(tags, "runtime-style.js");
  assert.ok(runtimeStyleIdx < indexOf(tags, "pet-visual-style.js"));
  assert.ok(runtimeStyleIdx < indexOf(tags, "hold-visual-lock.js"));
});

test("music pages load hidden audio fallback before playback scripts", () => {
  const cases = [
    { file: "index.html", host: "music-panel.js" },
    { file: "music.html", host: "music.js" },
    { file: "music-search.html", host: "music-search.js" },
  ];

  for (const { file, host } of cases) {
    const html = fs.readFileSync(path.join(root, "src", "renderer", file), "utf8");
    const tags = extractScriptTags(html);
    const audioIdx = indexOf(tags, "audio-player.js");
    const hostIdx = indexOf(tags, host);

    assert.ok(audioIdx >= 0, `${file} must load audio-player.js`);
    assert.ok(hostIdx >= 0, `${file} must load ${host}`);
    assert.ok(audioIdx < hostIdx, `${file} must load audio-player.js before ${host}`);
  }
});

test("music pages load shared playback service before music hosts", () => {
  const cases = [
    { file: "index.html", host: "music-panel.js" },
    { file: "music.html", host: "music.js" },
  ];

  for (const { file, host } of cases) {
    const html = fs.readFileSync(path.join(root, "src", "renderer", file), "utf8");
    const tags = extractScriptTags(html);
    const audioIdx = indexOf(tags, "audio-player.js");
    const serviceIdx = indexOf(tags, "music-playback-service.js");
    const hostIdx = indexOf(tags, host);

    assert.ok(audioIdx >= 0, `${file} must load audio-player.js`);
    assert.ok(serviceIdx >= 0, `${file} must load music-playback-service.js`);
    assert.ok(hostIdx >= 0, `${file} must load ${host}`);
    assert.ok(audioIdx < serviceIdx, `${file} must load audio-player.js before music-playback-service.js`);
    assert.ok(serviceIdx < hostIdx, `${file} must load music-playback-service.js before ${host}`);
  }
});

test("renderer updates music progress without rebuilding buttons on every timeupdate", () => {
  const source = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");

  assert.match(source, /lastMusicStatusRenderKey/);
  assert.match(source, /musicStatusRenderKey/);
  assert.match(source, /updateMusicProgressDisplay/);
});
