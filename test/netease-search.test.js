const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildSearchWebUrl,
  buildSongWebUrl,
  buildSongOrpheusTargets,
  buildSearchOrpheusTargets,
  buildCloudMusicArgv,
  normalizeSong,
  parseSearchResponse,
  searchSongs,
  SEARCH_TYPE_SONG,
  SEARCH_LIMIT,
} = require("../src/netease-search");

test("buildSearchWebUrl encodes the query and pins the song type", () => {
  const url = buildSearchWebUrl("周杰伦 晴天");
  assert.ok(url.startsWith("https://music.163.com/#/search/m/?"), "uses the web search URL");
  assert.ok(url.includes(encodeURIComponent("周杰伦 晴天")), "encodes the Chinese query");
  assert.ok(url.includes(`type=${SEARCH_TYPE_SONG}`), "pins the search type to songs");
});

test("buildSongWebUrl encodes the song id", () => {
  assert.equal(buildSongWebUrl(123), "https://music.163.com/#/song?id=123");
  assert.equal(buildSongWebUrl("a b"), "https://music.163.com/#/song?id=a%20b");
});

test("buildSongOrpheusTargets returns the known orpheus play schemes", () => {
  const targets = buildSongOrpheusTargets(42);
  assert.deepEqual(targets, [
    "orpheus://nm/song?id=42&type=song",
    "orpheus://nm/song?id=42",
    "orpheus://song?id=42",
    "orpheus://play?songid=42",
    "orpheus://play?id=42",
    "orpheus://radio/song?id=42",
    "orpheus://music/song?id=42",
  ]);
});

test("buildSongOrpheusTargets encodes ids with special characters", () => {
  const targets = buildSongOrpheusTargets("a b/中文");
  assert.ok(targets.every((t) => t.includes("a%20b%2F%E4%B8%AD%E6%96%87")));
});

test("buildSearchOrpheusTargets returns orpheus search variants for any query", () => {
  const targets = buildSearchOrpheusTargets("周杰伦 晴天");
  assert.equal(targets.length, 4, "should try several search variants");
  assert.ok(targets.every((t) => /^orpheus:\/\//.test(t)));
  assert.ok(targets.every((t) => t.includes("keyword=")));
  assert.ok(targets.every((t) => t.includes(encodeURIComponent("周杰伦 晴天"))));
});

test("buildCloudMusicArgv mirrors the registered NetEase --webcmd protocol argument", () => {
  const argv = buildCloudMusicArgv("orpheus://song?id=42");
  assert.deepEqual(argv, ["--webcmd=orpheus://song?id=42"]);
});

test("normalizeSong keeps well-formed entries and drops broken ones", () => {
  const good = normalizeSong({
    id: 1,
    name: "晴天",
    artists: [{ name: "周杰伦" }, { name: "" }, null, { name: "Jay" }],
    album: { name: "叶惠美" },
    duration: 269000,
  });
  assert.deepEqual(good, {
    id: 1,
    name: "晴天",
    artists: ["周杰伦", "Jay"],
    album: "叶惠美",
    durationMs: 269000,
  });

  assert.equal(normalizeSong(null), null);
  assert.equal(normalizeSong({ id: 1 }), null, "missing name is dropped");
  assert.equal(normalizeSong({ name: "x" }), null, "missing id is dropped");
});

test("parseSearchResponse accepts the documented NetEase envelope", () => {
  const payload = JSON.stringify({
    code: 200,
    result: {
      songs: [
        { id: 1, name: "A", artists: [{ name: "X" }], album: { name: "Y" }, duration: 1000 },
        { id: 2, name: "B", artists: [], album: null, duration: 2000 },
      ],
    },
  });
  const result = parseSearchResponse(payload);
  assert.equal(result.success, true);
  assert.equal(result.songs.length, 2);
  assert.equal(result.songs[0].name, "A");
  assert.equal(result.songs[1].artists.length, 0);
});

test("parseSearchResponse rejects non-200 codes and malformed payloads", () => {
  assert.deepEqual(parseSearchResponse(JSON.stringify({ code: 301 })), {
    success: false,
    error: "unexpected-shape",
    code: 301,
  });
  assert.deepEqual(parseSearchResponse(JSON.stringify({ code: 200 })), {
    success: false,
    error: "unexpected-shape",
    code: 200,
  });
  assert.equal(parseSearchResponse("not json").success, false);
  assert.equal(parseSearchResponse("not json").error, "invalid-json");
});

test("searchSongs rejects empty / whitespace-only queries without hitting the network", async () => {
  const calls = [];
  const postJson = (url, body) => {
    calls.push({ url, body });
    return Promise.resolve({ statusCode: 200, body: "{}" });
  };
  for (const q of ["", "   ", null, undefined, 123]) {
    const r = await searchSongs(q, { postJson });
    assert.equal(r.success, false, `query ${JSON.stringify(q)} should be rejected`);
    assert.equal(r.error, "empty-query");
  }
  assert.equal(calls.length, 0, "the network should not be hit for empty queries");
});

test("searchSongs sends a POST with form-encoded s/type/limit and decodes the response", async () => {
  let captured = null;
  const postJson = (url, body, opts) => {
    captured = { url, body, opts };
    return Promise.resolve({
      statusCode: 200,
      body: JSON.stringify({
        code: 200,
        result: {
          songs: [{ id: 7, name: "晴天", artists: [{ name: "周杰伦" }], album: { name: "叶惠美" }, duration: 269000 }],
        },
      }),
    });
  };

  const r = await searchSongs("  晴天  ", { postJson });
  assert.equal(r.success, true);
  assert.equal(r.songs.length, 1);
  assert.equal(r.songs[0].name, "晴天");
  assert.equal(captured.url, "https://music.163.com/api/search/get");
  assert.ok(captured.body.startsWith(`s=${encodeURIComponent("晴天")}&`), "trims and encodes the query");
  assert.ok(captured.body.includes(`type=${SEARCH_TYPE_SONG}`));
  assert.ok(captured.body.includes(`limit=${SEARCH_LIMIT}`));
});

test("searchSongs maps network failures to success:false with the error message", async () => {
  const postJson = () => Promise.reject(new Error("ENOTFOUND"));
  const r = await searchSongs("foo", { postJson });
  assert.equal(r.success, false);
  assert.equal(r.error, "ENOTFOUND");
  assert.deepEqual(r.songs, []);
});

test("searchSongs returns an empty list when the API responds with no songs", async () => {
  const postJson = () => Promise.resolve({
    statusCode: 200,
    body: JSON.stringify({ code: 200, result: { songs: [] } }),
  });
  const r = await searchSongs("zzz", { postJson });
  assert.equal(r.success, true);
  assert.deepEqual(r.songs, []);
});

const {
  parseSongUrlResponse,
  fetchSongUrl,
  SONG_URL_ENDPOINT,
  DEFAULT_BITRATE,
} = require("../src/netease-search");

test("parseSongUrlResponse accepts a normal response and returns the audio URL", () => {
  const payload = JSON.stringify({
    code: 200,
    data: [
      {
        id: 123,
        url: "https://m7.music.126.net/20240101/abc.mp3",
        br: 320000,
        size: 7834232,
        type: "mp3",
        code: 200,
        expi: 1200,
      },
    ],
  });
  const r = parseSongUrlResponse(payload, "123");
  assert.equal(r.success, true);
  assert.equal(r.url, "https://m7.music.126.net/20240101/abc.mp3");
  assert.equal(r.id, 123);
  assert.equal(r.br, 320000);
});

test("parseSongUrlResponse rejects responses without a usable url", () => {
  const noUrl = JSON.stringify({
    code: 200,
    data: [{ id: 1, url: null, br: 320000, code: 200 }],
  });
  assert.equal(parseSongUrlResponse(noUrl, "1").error, "no-url");

  const vipCode = JSON.stringify({
    code: 200,
    data: [{ id: 1, url: null, br: 320000, code: 4 }],
  });
  assert.equal(parseSongUrlResponse(vipCode, "1").error, "code-4");

  const empty = JSON.stringify({ code: 200, data: [] });
  assert.equal(parseSongUrlResponse(empty, "1").error, "unexpected-shape");

  const badCode = JSON.stringify({ code: 301, data: [] });
  assert.equal(parseSongUrlResponse(badCode, "1").code, 301);

  assert.equal(parseSongUrlResponse("not json").error, "invalid-json");
});

test("fetchSongUrl rejects empty ids without hitting the network", async () => {
  const calls = [];
  const postJson = (url, body) => {
    calls.push({ url, body });
    return Promise.resolve({ statusCode: 200, body: "{}" });
  };
  for (const id of [null, undefined, ""]) {
    const r = await fetchSongUrl(id, { postJson });
    assert.equal(r.success, false, `id ${JSON.stringify(id)} should be rejected`);
    assert.equal(r.error, "empty-id");
  }
  assert.equal(calls.length, 0);
});

test("fetchSongUrl sends ids=[<id>]&br=<bitrate> and parses the response", async () => {
  let captured = null;
  const postJson = (url, body, opts) => {
    captured = { url, body, opts };
    return Promise.resolve({
      statusCode: 200,
      body: JSON.stringify({
        code: 200,
        data: [{ id: 999, url: "https://example.com/song.mp3", br: DEFAULT_BITRATE, size: 1024 }],
      }),
    });
  };
  const r = await fetchSongUrl(999, { postJson });
  assert.equal(r.success, true);
  assert.equal(r.url, "https://example.com/song.mp3");
  assert.equal(r.id, 999);
  assert.equal(captured.url, SONG_URL_ENDPOINT);
  assert.ok(captured.body.startsWith("ids=[999]"), `body should start with ids=[999], got: ${captured.body}`);
  assert.ok(captured.body.includes(`br=${DEFAULT_BITRATE}`));
});

test("fetchSongUrl handles numeric ids and stringified ids identically", async () => {
  const responses = new Map();
  const postJson = (url, body) => {
    responses.set(body, JSON.stringify({
      code: 200,
      data: [{ id: 42, url: `https://example.com/${body}.mp3`, br: DEFAULT_BITRATE }],
    }));
    return Promise.resolve({ statusCode: 200, body: responses.get(body) });
  };
  const r1 = await fetchSongUrl(42, { postJson });
  const r2 = await fetchSongUrl("42", { postJson });
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
});

test("fetchSongUrl maps network failures to success:false with the error message", async () => {
  const postJson = () => Promise.reject(new Error("ENOTFOUND"));
  const r = await fetchSongUrl(1, { postJson });
  assert.equal(r.success, false);
  assert.equal(r.error, "ENOTFOUND");
});
