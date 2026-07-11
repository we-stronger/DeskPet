const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { renderMusicStatusBar } = require("../src/renderer/music-status-view");

test("renderMusicStatusBar includes playback, panel, and app controls", () => {
  const html = renderMusicStatusBar({ title: "NetEase Music", status: "Paused", playing: false });

  assert.match(html, /data-music-action="previous"/);
  assert.match(html, /data-music-action="playPause"/);
  assert.match(html, /data-music-action="next"/);
  assert.match(html, /data-music-action="openPanel"/);
  assert.match(html, /data-music-action="account"/);
  assert.match(html, /data-music-action="openNetease"/);
  assert.match(html, /NetEase Music/);
  assert.match(html, /Paused/);
  assert.match(html, /❧|🍃/);
});

test("renderMusicStatusBar disables adjacent controls when the queue is unavailable", () => {
  const html = renderMusicStatusBar({
    playbackCapabilities: { canPlayPrevious: false, canPlayNext: false },
  });

  assert.match(html, /data-music-action="previous"[^>]*disabled/);
  assert.match(html, /data-music-action="next"[^>]*disabled/);
  assert.doesNotMatch(html, /data-music-action="playPause"[^>]*disabled/);
});

test("music status CSS allows lyric text to wrap instead of clipping one line", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "styles.css"), "utf8");

  assert.match(css, /\.music-status-bar__lyric[\s\S]*white-space:\s*normal/);
  assert.match(css, /\.music-status-bar[\s\S]*width:\s*min\(400px/);
});

test("renderMusicStatusBar separates track metadata from lyric and translation lines", () => {
  const html = renderMusicStatusBar({
    title: "Song Title",
    artist: "Artist Name",
    status: "Playing",
    lyric: "I did not think we would get to pull it apart",
    translation: "Never thought we would separate this world",
    playing: true,
  });

  assert.match(html, /class="music-status-bar__meta"/);
  assert.match(html, /class="music-status-bar__lyric"/);
  assert.match(html, /class="music-status-bar__lyric-line"/);
  assert.match(html, /class="music-status-bar__translation"/);
  assert.match(html, /Song Title.*Artist Name/);
  assert.doesNotMatch(html, /I did not think we would get to pull it apart \/ Never thought/);
  assert.match(html, /I did not think we would get to pull it apart[\s\S]*Never thought we would separate this world/);
});

test("renderMusicStatusBar applies user lyric color and size as CSS variables", () => {
  const html = renderMusicStatusBar({
    title: "Song",
    lyric: "line",
    lyricStyle: { color: "#7c3aed", fontSize: 16, controlSize: 38 },
  });

  assert.match(html, /style="--music-lyric-color: #7c3aed; --music-lyric-size: 16px; --music-control-size: 38px;"/);
});

test("music status CSS exposes decorative lyric controls styling", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "styles.css"), "utf8");

  assert.match(css, /\.music-status-bar::before/);
  assert.match(css, /\.music-status-bar__sparkles/);
  assert.match(css, /\.music-status-bar__decor/);
  assert.match(css, /\.music-status-bar__controls[\s\S]*justify-content:\s*center/);
  assert.match(css, /\.music-status-bar__button::after/);
  assert.match(css, /var\(--music-lyric-color/);
  assert.match(css, /var\(--music-lyric-size/);
  assert.match(css, /var\(--music-control-size/);
  assert.match(css, /\.music-status-bar__button:disabled/);
});
