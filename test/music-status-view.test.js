const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { renderMusicStatusBar } = require("../src/renderer/music-status-view");

function readRendererStyles(...names) {
  return names
    .map((name) => fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "styles", `${name}.css`), "utf8"))
    .join("\n");
}

test("renderMusicStatusBar keeps one account entry for the NetEase panel", () => {
  const html = renderMusicStatusBar({ title: "NetEase Music", status: "Paused", playing: false });

  assert.match(html, /data-music-action="previous"/);
  assert.match(html, /data-music-action="playPause"/);
  assert.match(html, /data-music-action="next"/);
  assert.match(html, /data-music-action="toggleLike"/);
  assert.match(html, /data-music-action="addToPlaylist"/);
  assert.match(html, /data-music-action="account"/);
  assert.doesNotMatch(html, /data-music-action="openPanel"/);
  assert.doesNotMatch(html, /data-music-action="openNetease"/);
  assert.match(html, /NetEase Music/);
  assert.match(html, /Paused/);
  assert.match(html, /❧|🍃/);
});

test("renderMusicStatusBar separates liked song control from heartbeat play mode", () => {
  const html = renderMusicStatusBar({
    title: "Song",
    status: "Playing",
    playMode: "heartbeat",
    liked: true,
  });

  assert.match(html, /data-music-action="toggleLike"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /data-music-action="cycleMode"[\s\S]*&#9829;/);
  assert.match(html, /data-music-action="toggleLike"[\s\S]*&#10084;/);
  assert.match(html, /class="music-status-bar__like-mark"/);
});

test("renderMusicStatusBar can embed clock and focus summaries", () => {
  const html = renderMusicStatusBar({
    title: "Song",
    status: "Playing",
    clockSummary: "07/11 周六 14:20",
    focusSummary: "专注 12:34 · 写代码",
  });

  assert.match(html, /class="music-status-bar__widgets"/);
  assert.match(html, /07\/11/);
  assert.match(html, /专注 12:34/);
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
  const css = readRendererStyles("widgets");

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
  assert.match(html, /class="music-status-bar__lyric-line(?:\s|\")/);
  assert.match(html, /class="music-status-bar__translation"/);
  assert.match(html, /Song Title.*Artist Name/);
  assert.doesNotMatch(html, /I did not think we would get to pull it apart \/ Never thought/);
  assert.match(html, /I did not think we would get to pull it apart[\s\S]*Never thought we would separate this world/);
});

test("renderMusicStatusBar renders current and upcoming lyric rows with distinct states", () => {
  const html = renderMusicStatusBar({
    lyric: "current lyric",
    translation: "current translation",
    nextLyric: "upcoming lyric",
    nextTranslation: "upcoming translation",
  });

  assert.match(html, /class="music-status-bar__lyric-line is-current"[^>]*>current lyric/);
  assert.match(html, /class="music-status-bar__lyric-line is-upcoming"[^>]*>upcoming lyric/);
  assert.match(html, /current translation/);
  assert.match(html, /upcoming translation/);
});

test("renderMusicStatusBar exposes user lyric values as data attributes for CSP-safe styling", () => {
  const html = renderMusicStatusBar({
    title: "Song",
    lyric: "line",
    lyricStyle: { color: "#7c3aed", fontSize: 16, controlSize: 38 },
  });

  assert.match(html, /data-lyric-color="#7c3aed"/);
  assert.match(html, /data-lyric-size="16"/);
  assert.match(html, /data-control-size="38"/);
  assert.doesNotMatch(html, /\sstyle=/i);
});

test("renderMusicStatusBar includes cover art and a bounded progress indicator", () => {
  const html = renderMusicStatusBar({
    title: "Song",
    coverUrl: "https://example.com/cover.jpg",
    currentTime: 30,
    duration: 120,
    playMode: "shuffle",
  });

  assert.match(html, /class="music-status-bar__cover"/);
  assert.match(html, /data-cover-url="https:\/\/example\.com\/cover\.jpg"/);
  assert.match(html, /class="music-status-bar__progress"/);
  assert.match(html, /data-progress="25"/);
  assert.match(html, /随机/);
  assert.doesNotMatch(html, /\sstyle=/i);
});

test("renderMusicStatusBar exposes a readable current-time and duration label", () => {
  const html = renderMusicStatusBar({ currentTime: 65, duration: 180 });

  assert.match(html, /class="music-status-bar__progress-time"/);
  assert.match(html, />1:05 \/ 3:00</);
  assert.match(html, /data-duration="180"/);
});

test("music status CSS exposes decorative lyric controls styling", () => {
  const css = readRendererStyles("widgets");

  assert.match(css, /\.music-status-bar::before/);
  assert.match(css, /\.music-status-bar__sparkles/);
  assert.match(css, /\.music-status-bar__decor/);
  assert.match(css, /\.music-status-bar__controls[\s\S]*justify-content:\s*center/);
  assert.match(css, /\.music-status-bar__button::after/);
  assert.match(css, /var\(--music-lyric-color/);
  assert.match(css, /var\(--music-lyric-size/);
  assert.match(css, /var\(--music-control-size/);
  assert.match(css, /music-status-bar__lyric-line\.is-current/);
  assert.match(css, /music-status-bar__lyric-line\.is-upcoming/);
  assert.match(css, /\.music-status-bar__button:disabled/);
  assert.match(css, /\.music-status-bar__controls[\s\S]*grid-template-columns:\s*repeat\(7,/);
  assert.match(css, /\.music-status-bar__widgets/);
  assert.match(css, /data-music-action="toggleLike"/);
});

test("music panel CSS hides unavailable cover placeholders", () => {
  const css = readRendererStyles("music");

  assert.match(css, /music-panel-cover-placeholder\[hidden\][\s\S]*display:\s*none\s*!important/);
});
