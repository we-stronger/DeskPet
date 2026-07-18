const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

const checkedFiles = [
  "src/renderer/music-panel.js",
  "src/renderer/music.html",
  "src/renderer/music.js",
  "src/renderer/music-search-view.js",
  "src/renderer/music-playlist-view.js",
  "src/renderer/settings.html",
  "src/renderer/settings.js",
  "src/music/netease-client.js",
  "src/media-control.js",
  "test/music-views.test.js",
  "test/renderer-script-loading.test.js",
  "test/ui-redesign-contract.test.js",
];

const mojibakeMarkers = [
  "缃戞槗",
  "鎼滅储",
  "姝屽崟",
  "鐧诲綍",
  "鈫",
  "馃",
  "鉁",
  "鎵撳紑",
  "淇濆瓨",
  "璇诲彇",
  "鎴愬姛",
];

test("selected source files do not contain known Chinese mojibake markers", () => {
  const hits = [];
  for (const relative of checkedFiles) {
    const text = fs.readFileSync(path.join(root, relative), "utf8");
    for (const marker of mojibakeMarkers) {
      if (text.includes(marker)) hits.push(`${relative}: ${marker}`);
    }
  }
  assert.deepEqual(hits, []);
});
