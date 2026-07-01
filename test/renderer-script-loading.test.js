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
