// Unit tests for the renderer view modules. These run under node:test
// without jsdom — we just verify the rendered HTML strings contain the
// expected data and escape user input safely.
const assert = require("node:assert/strict");
const test = require("node:test");

// Stub `window` so the IIFE in each view module can attach its exports
// without blowing up on `document` etc. (We only need the pure renderers,
// not the DOM-side wiring.)
const sandbox = {};
global.window = sandbox;

require("../src/renderer/music-search-view.js");
require("../src/renderer/music-playlist-view.js");

const searchView = sandbox.DeskpetMusicSearchView;
const playlistView = sandbox.DeskpetMusicPlaylistView;

test("escapeHtml neutralizes HTML metacharacters", () => {
  assert.equal(
    searchView.escapeHtml(`<img src=x onerror="alert(1)">&'`),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;",
  );
  assert.equal(searchView.escapeHtml(null), "");
  assert.equal(searchView.escapeHtml(undefined), "");
});

test("formatDuration renders m:ss with leading zero on seconds", () => {
  assert.equal(searchView.formatDuration(0), "--:--");
  assert.equal(searchView.formatDuration(NaN), "--:--");
  assert.equal(searchView.formatDuration(61000), "1:01");
  assert.equal(searchView.formatDuration(3723000), "62:03");
  assert.equal(searchView.formatDuration("180000"), "3:00");
});

test("renderSongList shows the empty state when given no songs", () => {
  const html = searchView.renderSongList([], { emptyText: "没有找到结果。" });
  assert.match(html, /music-panel-empty/);
  assert.match(html, /没有找到结果/);
});

test("renderSongList renders title / artists / album / duration / play tag", () => {
  const html = searchView.renderSongList([
    {
      id: 12345,
      name: "晴天",
      artists: ["Jay"],
      album: "叶惠美",
      duration: 269000,
      playable: true,
    },
  ]);
  assert.match(html, /data-song-id="12345"/);
  assert.match(html, /晴天/);
  assert.match(html, /Jay/);
  assert.match(html, /叶惠美/);
  assert.match(html, /4:29/);
  assert.match(html, /可打开/);
});

test("renderSongList marks restricted songs so users know they may not open", () => {
  const html = searchView.renderSongList([{ id: 1, name: "付费歌曲", artists: ["X"], album: "Y", duration: 1000, playable: false }]);
  assert.match(html, /受限/);
});

test("renderSongList escapes hostile song metadata", () => {
  const html = searchView.renderSongList([{ id: 1, name: "<script>", artists: ["&"], album: "\"", duration: 1000, playable: true }]);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp;/);
  assert.match(html, /&quot;/);
});

test("renderPlaylists shows empty state and includes cover image when present", () => {
  const empty = playlistView.renderPlaylists([]);
  assert.match(empty, /还没有获取到歌单/);

  const html = playlistView.renderPlaylists([
    { id: 7, name: "默认歌单", trackCount: 12, creator: "自己", coverImgUrl: "https://example.com/c.jpg" },
    { id: 8, name: "无封面", trackCount: 0, creator: "", coverImgUrl: "" },
  ]);
  assert.match(html, /data-playlist-id="7"/);
  assert.match(html, /默认歌单/);
  assert.match(html, /12 首 · 自己/);
  assert.match(html, /https:\/\/example\.com\/c\.jpg/);
  assert.match(html, /data-playlist-id="8"/);
  assert.match(html, /music-panel-cover-placeholder/);
});

test("renderPlaylistDetail includes the title and falls back to trackCount", () => {
  const html = playlistView.renderPlaylistDetail({
    playlist: { id: 7, name: "我的精选", trackCount: 3, creator: "自己" },
    songs: [{ id: 1, name: "a", artists: [], album: "", duration: 1000, playable: true }],
  });
  assert.match(html, /我的精选/);
  assert.match(html, /3 首/);
  assert.match(html, /data-song-id="1"/);
});

test("renderPlaylistDetail handles a missing playlist gracefully", () => {
  const html = playlistView.renderPlaylistDetail({ songs: [] });
  assert.match(html, /这张歌单暂时没有歌曲/);
});

test("renderPlaylistDetail includes a back button so users can return to the list", () => {
  const html = playlistView.renderPlaylistDetail({
    playlist: { id: 7, name: "我的精选", trackCount: 3, creator: "自己" },
    songs: [],
  });
  // The back button is the entry point for the host panel's popView()
  // handler — its data-action attribute is the contract.
  assert.match(html, /class="music-panel-back-btn"/);
  assert.match(html, /data-action="back"/);
  assert.match(html, /aria-label="返回歌单"/);
});

test("renderPlaylistDetail back button escapes hostile playlist names", () => {
  const html = playlistView.renderPlaylistDetail({
    playlist: { id: 9, name: "<script>alert(1)</script>", trackCount: 1 },
    songs: [],
  });
  // Make sure the back button itself can't be hijacked by an injected
  // attribute on the title row.
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});