const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildProxyTrackUrl,
  buildUpstreamHeaders,
  createTrackRegistry,
} = require("../src/netease-audio-proxy");

test("buildProxyTrackUrl creates a loopback audio URL for a registered track", () => {
  const url = buildProxyTrackUrl({ port: 49152, id: "track_1" });

  assert.equal(url, "http://127.0.0.1:49152/audio/track_1");
});

test("buildUpstreamHeaders forwards range and avoids a referer for NetEase CDN audio", () => {
  const headers = buildUpstreamHeaders({
    range: "bytes=1024-",
    userAgent: "Electron",
  });

  assert.equal(headers.Range, "bytes=1024-");
  assert.match(headers["User-Agent"], /Mozilla\/5\.0/);
  assert.equal("Referer" in headers, false);
});

test("track registry stores and retrieves generated tracks without exposing raw URLs in ids", () => {
  const registry = createTrackRegistry({ now: () => 1000 });
  const track = registry.add("https://m704.music.126.net/private/song.mp3?authSecret=hidden");

  assert.match(track.id, /^track_/);
  assert.doesNotMatch(track.id, /authSecret/);
  assert.equal(registry.get(track.id).url, "https://m704.music.126.net/private/song.mp3?authSecret=hidden");
});
