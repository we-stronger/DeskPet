const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildNeteaseSongPageUrl,
  buildNeteaseWebPlayScript,
} = require("../src/netease-web-player");

test("buildNeteaseSongPageUrl builds the official song page", () => {
  assert.equal(buildNeteaseSongPageUrl(42), "https://music.163.com/#/song?id=42");
  assert.equal(buildNeteaseSongPageUrl("a b"), "https://music.163.com/#/song?id=a%20b");
});

test("buildNeteaseWebPlayScript clicks official NetEase play controls", () => {
  const script = buildNeteaseWebPlayScript();

  assert.match(script, /g_iframe/);
  assert.match(script, /data-res-action="play"/);
  assert.match(script, /m-playbar/);
  assert.match(script, /click\(\)/);
});

test("main process exposes the hidden web player fallback", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

  assert.match(source, /openNeteaseWebPlayer/);
  assert.match(source, /ipcMain\.handle\("music:web-play-song"/);
  assert.match(source, /show:\s*false/);
  assert.match(source, /backgroundThrottling:\s*false/);
});

test("main process verifies web playback audibility before reporting playback success", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

  assert.match(source, /waitForWebPlayerAudible/);
  assert.match(source, /isCurrentlyAudible\(\)/);
  assert.match(source, /web-player-visible/);
  assert.match(source, /show\(\)/);
  assert.match(source, /focus\(\)/);
});

test("preload exposes the hidden web player fallback", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "preload.js"), "utf8");

  assert.match(source, /webPlaySong\(id\)/);
  assert.match(source, /ipcRenderer\.invoke\("music:web-play-song"/);
});

test("renderer playback service uses in-pet audio as the song playback owner", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "music-playback-service.js"), "utf8");
  const fetchIndex = source.indexOf("bridge.fetchSongUrl");

  assert.notEqual(fetchIndex, -1);
  assert.doesNotMatch(source, /bridge\.webPlaySong/);
  assert.doesNotMatch(source, /bridge\.playSong\(songId\)/);
  assert.match(source, /playAudioUrlInPet/);
});

test("main process stops embedded web playback before handing a song to the client", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

  assert.match(source, /function closeNeteaseWebPlayer/);
  assert.match(source, /ipcMain\.handle\("music:play-song"[\s\S]*closeNeteaseWebPlayer\(\)/);
});
