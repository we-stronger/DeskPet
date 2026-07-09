const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildNeteaseMediaHeaders,
  shouldPatchNeteaseMediaRequest,
} = require("../src/netease-media-headers");

test("shouldPatchNeteaseMediaRequest only matches NetEase CDN media hosts", () => {
  assert.equal(shouldPatchNeteaseMediaRequest("http://m704.music.126.net/path/song.mp3"), true);
  assert.equal(shouldPatchNeteaseMediaRequest("https://music.126.net/path/song.mp3"), true);
  assert.equal(shouldPatchNeteaseMediaRequest("https://music.163.com/song?id=1"), false);
  assert.equal(shouldPatchNeteaseMediaRequest("https://example.com/music.126.net/song.mp3"), false);
});

test("buildNeteaseMediaHeaders adds anti-hotlink headers without dropping range", () => {
  const result = buildNeteaseMediaHeaders({
    url: "http://m704.music.126.net/path/song.mp3",
    requestHeaders: {
      Range: "bytes=0-",
      "User-Agent": "Electron",
    },
  });

  assert.equal(result.requestHeaders.Referer, "https://music.163.com/");
  assert.match(result.requestHeaders["User-Agent"], /Mozilla\/5\.0/);
  assert.equal(result.requestHeaders.Range, "bytes=0-");
});

test("buildNeteaseMediaHeaders leaves non-NetEase requests unchanged", () => {
  const headers = { Range: "bytes=0-" };
  const result = buildNeteaseMediaHeaders({
    url: "https://example.com/song.mp3",
    requestHeaders: headers,
  });

  assert.deepEqual(result.requestHeaders, headers);
});

test("main process installs the NetEase media header patch on Electron web requests", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

  assert.match(mainSource, /buildNeteaseMediaHeaders/);
  assert.match(mainSource, /webRequest\.onBeforeSendHeaders/);
  assert.match(mainSource, /urls:\s*\["\*:\/\/\*\.music\.126\.net\/\*"/);
});
