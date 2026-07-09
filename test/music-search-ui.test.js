const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buttonLabelForPlayState,
  statusMessageForSearch,
  statusMessageForPlayResult,
  nextPlayUiState,
} = require("../src/renderer/music-search");

const root = path.join(__dirname, "..");

test("music search window copy is readable Chinese, not mojibake", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "music-search.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "src", "renderer", "music-search.js"), "utf8");
  assert.match(html, /音乐搜索/);
  assert.match(html, /输入歌曲或歌手/);
  assert.match(html, /搜索歌曲/);
  assert.doesNotMatch(html + js, /�|鎼|闊|缃|鈥|涓|杈|路/);
});

test("music search exposes concise Chinese status messages", () => {
  assert.equal(statusMessageForSearch("empty"), "请输入要搜索的歌曲或歌手。");
  assert.equal(statusMessageForSearch("loading", "晴天"), "正在搜索“晴天”...");
  assert.equal(statusMessageForSearch("none", "晴天"), "没有找到“晴天”的相关结果，已为你打开网易云搜索。");
  assert.equal(statusMessageForSearch("ok", "晴天", { count: 3 }), "找到 3 首“晴天”，点击播放交给网易云。");
});

test("music search maps play progress to row state and button text", () => {
  assert.equal(buttonLabelForPlayState("idle"), "播放");
  assert.equal(buttonLabelForPlayState("playing"), "打开中");
  assert.equal(buttonLabelForPlayState("done"), "已打开");
  assert.equal(buttonLabelForPlayState("error"), "重试");
  assert.deepEqual(nextPlayUiState({ success: true, method: "web" }), { state: "done", tone: "ok" });
  assert.deepEqual(nextPlayUiState({ success: false, error: "failed" }), { state: "error", tone: "error" });
});

test("music search play result messages are readable and method-aware", () => {
  assert.equal(statusMessageForPlayResult({ success: true, method: "scheme" }), "已在网易云客户端中打开歌曲。");
  assert.equal(statusMessageForPlayResult({ success: true, method: "web" }), "已在浏览器中打开网易云歌曲页。");
  assert.equal(statusMessageForPlayResult({ success: false, error: "invalid-id" }), "播放失败：invalid-id");
});
test("music search uses the dedicated NetEase search bridge instead of one hardcoded scheme", () => {
  const js = fs.readFileSync(path.join(root, "src", "renderer", "music-search.js"), "utf8");
  assert.match(js, /openSearchInNetEase\(trimmed\)/);
  assert.doesNotMatch(js, /orpheus:\/\/search\?keyword=\$\{encodeURIComponent\(trimmed\)\}/);
});

test("in-app music song buttons use the in-pet playback service, not direct web openers", () => {
  const panelJs = fs.readFileSync(path.join(root, "src", "renderer", "music-panel.js"), "utf8");
  const windowJs = fs.readFileSync(path.join(root, "src", "renderer", "music.js"), "utf8");
  const playbackJs = fs.readFileSync(path.join(root, "src", "renderer", "music-playback-service.js"), "utf8");

  assert.match(panelJs, /DeskpetMusicPlaybackService\.playSongWithFallback\(id/);
  assert.doesNotMatch(panelJs, /music\.163\.com\/#\/song/);

  assert.match(windowJs, /DeskpetMusicPlaybackService\.playSongWithFallback\(id/);
  assert.match(playbackJs, /bridge\.fetchSongUrl\(songId\)/);
  assert.match(playbackJs, /playAudioUrlInPet/);
  assert.doesNotMatch(playbackJs, /bridge\.playSong\(songId\)/);
});

test("in-app music treats pet-hosted audio as active background playback", () => {
  const panelJs = fs.readFileSync(path.join(root, "src", "renderer", "music-panel.js"), "utf8");
  const windowJs = fs.readFileSync(path.join(root, "src", "renderer", "music.js"), "utf8");

  assert.match(panelJs, /result\.method === "audio-host"/);
  assert.match(windowJs, /result\.method === "audio-host"/);
  assert.match(panelJs, /result\.method === "web-player"/);
  assert.match(windowJs, /result\.method === "web-player"/);
});

test("in-app music explains visible web player fallback instead of reporting background playback", () => {
  const panelJs = fs.readFileSync(path.join(root, "src", "renderer", "music-panel.js"), "utf8");
  const windowJs = fs.readFileSync(path.join(root, "src", "renderer", "music.js"), "utf8");

  assert.match(panelJs, /result\.method === "web-player-visible"/);
  assert.match(windowJs, /result\.method === "web-player-visible"/);
  assert.match(panelJs, /已打开网易云网页播放器，请在窗口内确认播放。/);
  assert.match(windowJs, /已打开网易云网页播放器，请在窗口内确认播放/);
});

test("music playback falls back to hidden audio instead of opening direct audio URLs in the browser", () => {
  const searchJs = fs.readFileSync(path.join(root, "src", "renderer", "music-search.js"), "utf8");
  const panelJs = fs.readFileSync(path.join(root, "src", "renderer", "music-panel.js"), "utf8");
  const windowJs = fs.readFileSync(path.join(root, "src", "renderer", "music.js"), "utf8");
  const playbackJs = fs.readFileSync(path.join(root, "src", "renderer", "music-playback-service.js"), "utf8");

  assert.match(searchJs, /DeskpetAudioPlayer/);
  assert.doesNotMatch(searchJs, /openExternal\(urlResult\.url\)/);

  assert.match(panelJs, /DeskpetAudioPlayer/);
  assert.match(windowJs, /DeskpetAudioPlayer/);
  assert.match(playbackJs, /fetchLyrics\(songId, bridge\)/);
  assert.match(playbackJs, /audioPlayer\.playUrl\(urlResult\.url, meta\)/);
});

test("music playback uses the original browser/client opener as final fallback", () => {
  const searchJs = fs.readFileSync(path.join(root, "src", "renderer", "music-search.js"), "utf8");
  const playbackJs = fs.readFileSync(path.join(root, "src", "renderer", "music-playback-service.js"), "utf8");

  assert.match(searchJs, /openMusicSong\(songId\)/);
  assert.match(playbackJs, /openMusicSong\(songId\)/);
});

test("music playback logs when it falls back to the original browser/client opener", () => {
  const searchJs = fs.readFileSync(path.join(root, "src", "renderer", "music-search.js"), "utf8");
  const playbackJs = fs.readFileSync(path.join(root, "src", "renderer", "music-playback-service.js"), "utf8");
  const mainJs = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");

  assert.match(searchJs, /\[music-search\] using browser fallback/);
  assert.match(playbackJs, /\[music-playback\] using browser fallback/);
  assert.match(mainJs, /\[music:open-song\] requested id=/);
  assert.match(mainJs, /\[music:open-song\] result=/);
});

test("compact music panel exposes playlist play modes and local playback history", () => {
  const panelJs = fs.readFileSync(path.join(root, "src", "renderer", "music-panel.js"), "utf8");
  const playlistViewJs = fs.readFileSync(path.join(root, "src", "renderer", "music-playlist-view.js"), "utf8");
  const rendererJs = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");

  assert.match(playlistViewJs, /music-panel-play-mode/);
  assert.match(playlistViewJs, /data-play-mode="sequence"/);
  assert.match(playlistViewJs, /data-play-mode="shuffle"/);
  assert.match(playlistViewJs, /data-play-mode="heartbeat"/);
  assert.match(panelJs, /showPlaybackHistory/);
  assert.match(panelJs, /getPlaybackState\(\)\.history/);
  assert.match(rendererJs, /state\.ended/);
  assert.match(rendererJs, /DeskpetMusicPlaybackService\.playNext/);
});

test("standalone music window also passes visible song lists as playback queues", () => {
  const windowJs = fs.readFileSync(path.join(root, "src", "renderer", "music.js"), "utf8");

  assert.match(windowJs, /queueFromCurrentSongList/);
  assert.match(windowJs, /music-panel-play-mode/);
  assert.match(windowJs, /queue:\s*queueFromCurrentSongList/);
});

test("music UI exposes playback mode switching and playlist write actions", () => {
  const preloadJs = fs.readFileSync(path.join(root, "src", "preload.js"), "utf8");
  const mainJs = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
  const panelJs = fs.readFileSync(path.join(root, "src", "renderer", "music-panel.js"), "utf8");
  const statusViewJs = fs.readFileSync(path.join(root, "src", "renderer", "music-status-view.js"), "utf8");

  assert.match(preloadJs, /manipulatePlaylistTracks/);
  assert.match(preloadJs, /likeSong/);
  assert.match(preloadJs, /getIntelligenceList/);
  assert.match(preloadJs, /trashFmSong/);
  assert.match(mainJs, /music:playlist-tracks/);
  assert.match(mainJs, /music:like-song/);
  assert.match(panelJs, /music-panel-add-song/);
  assert.match(panelJs, /music-panel-remove-song/);
  assert.match(panelJs, /music-panel-like-song/);
  assert.match(statusViewJs, /cycleMode/);
});

test("standalone music window uses playlist chooser instead of a prompt", () => {
  const musicJs = fs.readFileSync(path.join(root, "src", "renderer", "music.js"), "utf8");
  const panelJs = fs.readFileSync(path.join(root, "src", "renderer", "music-panel.js"), "utf8");

  assert.doesNotMatch(musicJs, /root\.prompt/);
  assert.match(musicJs, /showAddToPlaylistChooser/);
  assert.match(musicJs, /music-panel-add-target/);
  assert.match(musicJs, /\.filter\(\(playlist\) => playlist\.editable !== false\)/);
  assert.match(panelJs, /\.filter\(\(playlist\) => playlist\.editable !== false\)/);
});

test("music status playback modes render compact icons with accessible labels", () => {
  const statusViewJs = fs.readFileSync(path.join(root, "src", "renderer", "music-status-view.js"), "utf8");

  assert.match(statusViewJs, /function modeIcon/);
  assert.match(statusViewJs, /modeIcon\(playMode\)/);
  assert.match(statusViewJs, /切换播放模式：/);
  assert.doesNotMatch(statusViewJs, /renderButton\("cycleMode", modeText/);
});

