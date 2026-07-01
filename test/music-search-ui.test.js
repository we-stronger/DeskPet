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

