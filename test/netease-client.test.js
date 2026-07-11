// Unit tests for the NetEase JSON API client. Mocks the HTTPS request so
// we can exercise response parsing for every error shape without hitting
// the network. Covers:
//   - Happy paths (search / profile / playlists / playlist detail)
//   - Unexpected-shape diagnostic logging (label + keys + code, no values)
//   - Non-JSON response preview logging
const assert = require("node:assert/strict");
const test = require("node:test");

const client = require("../src/music/netease-client");

function fakeResponse({ statusCode = 200, body, headers = {} } = {}) {
  return {
    statusCode,
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers,
  };
}

// Mirrors the real `defaultRequest` in netease-client.js: tries to
// JSON.parse the body, emits the same diagnostic warning on non-JSON
// bodies, and resolves with json=null in that case.
function fakeRequest(responses) {
  const calls = [];
  let i = 0;
  async function fn(opts) {
    calls.push(opts);
    const r = responses[i] || responses[responses.length - 1];
    i += 1;
    if (r instanceof Error) throw r;
    const body = r.body;
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    let json = null;
    try {
      json = JSON.parse(bodyStr);
    } catch (_e) {
      console.warn(`[netease-client] non-json response status=${r.statusCode} path=${opts.path} preview=${JSON.stringify(bodyStr.slice(0, 200))}`);
      json = null;
    }
    return { statusCode: r.statusCode, headers: r.headers, body: bodyStr, json };
  }
  return { calls, fn };
}

async function captureWarn(fn) {
  const original = console.warn;
  const lines = [];
  console.warn = (...args) => lines.push(args.join(" "));
  try {
    return { result: await fn(), lines };
  } finally {
    console.warn = original;
  }
}

// -- happy paths --

test("search returns songs from a normal response", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        result: {
          songs: [
            { id: 1, name: "Song A", ar: [{ name: "Artist A" }], al: { name: "Album A" }, dt: 1000 },
          ],
        },
      },
    }),
  ]);
  const result = await client.search("song", { request: fn });
  assert.equal(result.success, true);
  assert.equal(result.songs.length, 1);
  assert.equal(result.songs[0].name, "Song A");
  assert.equal(result.songs[0].artists[0], "Artist A");
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].path, /^\/api\/search\/get/);
});

test("getProfile returns a profile from the standard response", async () => {
  const { fn } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        profile: { userId: 42, nickname: "Alice", avatarUrl: "http://x" },
        account: { id: 42, userName: "alice_login" },
      },
    }),
  ]);
  const result = await client.getProfile("MUSIC_U=abc", { request: fn });
  assert.equal(result.success, true);
  assert.equal(result.profile.userId, 42);
  assert.equal(result.profile.nickname, "Alice");
});

test("getProfile falls back to account.id when profile.userId is missing", async () => {
  const { fn } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        profile: { nickname: "Alice" }, // userId absent
        account: { id: 99 },
      },
    }),
  ]);
  const result = await client.getProfile("MUSIC_U=abc", { request: fn });
  assert.equal(result.success, true);
  assert.equal(result.profile.userId, 99);
  assert.equal(result.profile.nickname, "Alice");
});

test("getProfile falls back to account.userName when profile.nickname is missing", async () => {
  const { fn } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        profile: { userId: 7 }, // nickname absent
        account: { id: 7, userName: "login_name" },
      },
    }),
  ]);
  const result = await client.getProfile("MUSIC_U=abc", { request: fn });
  assert.equal(result.success, true);
  assert.equal(result.profile.userId, 7);
  assert.equal(result.profile.nickname, "login_name");
});

test("getProfile unwraps a {data: {account, profile}} wrapper", async () => {
  const { fn } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        data: {
          account: { id: 11 },
          profile: { userId: 11, nickname: "Bob" },
        },
      },
    }),
  ]);
  const result = await client.getProfile("MUSIC_U=abc", { request: fn });
  assert.equal(result.success, true);
  assert.equal(result.profile.userId, 11);
  assert.equal(result.profile.nickname, "Bob");
});

test("getProfile returns unexpected-shape and logs inner shape when no userId is found", async () => {
  const { fn } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        account: { userName: "no_id_here" },
        profile: { nickname: "no_id_here_either" },
      },
    }),
  ]);
  const { result, lines } = await captureWarn(() =>
    client.getProfile("MUSIC_U=abc", { request: fn }),
  );
  assert.equal(result.success, false);
  assert.equal(result.error, "unexpected-shape");
  const diag = lines.find((line) => line.includes("getProfile could not extract userId"));
  assert.ok(diag, `expected diagnostic, got: ${lines.join("\n")}`);
  assert.match(diag, /profileKeys=[\w,]*nickname/);
  assert.match(diag, /accountKeys=[\w,]*userName/);
});

test("getUserPlaylists returns parsed playlists", async () => {
  const { fn } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        playlist: [
          { id: 11, name: "P1", trackCount: 5, coverImgUrl: "x", creator: { nickname: "me" } },
          { id: 22, name: "P2", trackCount: 7 },
        ],
      },
    }),
  ]);
  const result = await client.getUserPlaylists(42, { cookie: "MUSIC_U=abc", request: fn });
  assert.equal(result.success, true);
  assert.equal(result.playlists.length, 2);
  assert.equal(result.playlists[0].name, "P1");
});

test("getUserPlaylists marks only owned playlists as editable", async () => {
  const { fn } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        playlist: [
          { id: 11, name: "Mine", creator: { userId: 42, nickname: "me" }, subscribed: false },
          { id: 22, name: "Subscribed", creator: { userId: 7, nickname: "other" }, subscribed: true },
        ],
      },
    }),
  ]);

  const result = await client.getUserPlaylists(42, { cookie: "MUSIC_U=abc", request: fn });

  assert.equal(result.playlists[0].editable, true);
  assert.equal(result.playlists[1].editable, false);
});

test("getPlaylistDetail returns parsed playlist with tracks", async () => {
  const { fn } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        playlist: {
          id: 99,
          name: "Best",
          trackCount: 2,
          tracks: [
            { id: 1, name: "T1", ar: [{ name: "A1" }], al: { name: "AL" }, dt: 100, fee: 0 },
          ],
        },
        privileges: [{ id: 1, st: 0, fee: 0 }],
      },
    }),
  ]);
  const result = await client.getPlaylistDetail(99, { cookie: "MUSIC_U=abc", request: fn });
  assert.equal(result.success, true);
  assert.equal(result.playlist.name, "Best");
  assert.equal(result.songs.length, 1);
});

// -- error / shape paths --

test("getUserPlaylists returns session-expired on code 301", async () => {
  const { fn } = fakeRequest([fakeResponse({ body: { code: 301 } })]);
  const result = await client.getUserPlaylists(42, { cookie: "MUSIC_U=abc", request: fn });
  assert.equal(result.success, false);
  assert.equal(result.error, "session-expired");
});

test("getUserPlaylists logs and returns unexpected-shape on {code:200,playlist:null}", async () => {
  const { fn } = fakeRequest([fakeResponse({ body: { code: 200, playlist: null } })]);
  const { result, lines } = await captureWarn(() =>
    client.getUserPlaylists(42, { cookie: "MUSIC_U=abc", request: fn }),
  );
  assert.equal(result.success, false);
  assert.equal(result.error, "unexpected-shape");
  const diag = lines.find((line) => line.includes("getUserPlaylists"));
  assert.ok(diag, `expected diagnostic line, got: ${lines.join("\n")}`);
  assert.match(diag, /\bplaylist\b/);
  assert.match(diag, /code=200/);
});

test("getUserPlaylists logs and returns unexpected-shape on a totally foreign shape", async () => {
  const { fn } = fakeRequest([fakeResponse({ body: { foo: 1, bar: [1, 2, 3] } })]);
  const { result, lines } = await captureWarn(() =>
    client.getUserPlaylists(42, { cookie: "MUSIC_U=abc", request: fn }),
  );
  assert.equal(result.success, false);
  assert.equal(result.error, "unexpected-shape");
  const diag = lines.find((line) => line.includes("getUserPlaylists"));
  assert.ok(diag);
  assert.match(diag, /\b(foo|bar)\b.*\b(foo|bar)\b/);
});

test("getProfile logs and returns unexpected-shape when profile is missing entirely", async () => {
  const { fn } = fakeRequest([fakeResponse({ body: { code: 200, account: {} } })]);
  const { result, lines } = await captureWarn(() =>
    client.getProfile("MUSIC_U=abc", { request: fn }),
  );
  assert.equal(result.success, false);
  assert.equal(result.error, "unexpected-shape");
  // Should fall back through profile -> account.id; with no id either
  // the inner-shape diagnostic fires.
  const diag = lines.find((line) => line.includes("could not extract userId"));
  assert.ok(diag, `expected diagnostic, got: ${lines.join("\n")}`);
});

test("non-JSON responses are surfaced with status + preview", async () => {
  const { fn } = fakeRequest([fakeResponse({ statusCode: 302, body: "<html>redirect</html>" })]);
  const { result, lines } = await captureWarn(() =>
    client.getProfile("MUSIC_U=abc", { request: fn }),
  );
  assert.equal(result.success, false);
  // Either session-expired if a redirect is involved, or unexpected-shape.
  assert.ok(["session-expired", "unexpected-shape", "network-error"].includes(result.error));
  const diag = lines.find((line) => line.includes("non-json response"));
  assert.ok(diag, `expected non-json diagnostic, got: ${lines.join("\n")}`);
  assert.match(diag, /status=302/);
  assert.match(diag, /path=\/api\/nuser\/account\/get/);
});

test("network errors are surfaced as ECONNRESET", async () => {
  const { fn } = fakeRequest([new Error("ECONNRESET")]);
  const result = await client.getProfile("MUSIC_U=abc", { request: fn });
  assert.equal(result.success, false);
  assert.equal(result.error, "ECONNRESET");
});

test("getUserPlaylists rejects empty userId without hitting the network", async () => {
  const { fn, calls } = fakeRequest([]);
  const result = await client.getUserPlaylists(undefined, { cookie: "MUSIC_U=abc", request: fn });
  assert.equal(result.success, false);
  assert.equal(result.error, "empty-user-id");
  assert.equal(calls.length, 0);
});

test("getPlaylistDetail rejects empty playlistId", async () => {
  const { fn, calls } = fakeRequest([]);
  const result = await client.getPlaylistDetail(undefined, { cookie: "MUSIC_U=abc", request: fn });
  assert.equal(result.success, false);
  assert.equal(result.error, "empty-playlist-id");
  assert.equal(calls.length, 0);
});

// -- new extras: daily rec, charts, lyrics, FM --

test("extractCsrf pulls __csrf out of a NetEase cookie string", () => {
  assert.equal(client.extractCsrf("MUSIC_U=abc; __csrf=token-xyz; NMTID=zzz"), "token-xyz");
  assert.equal(client.extractCsrf("__csrf=alone"), "alone");
  assert.equal(client.extractCsrf("MUSIC_U=abc"), "");
  assert.equal(client.extractCsrf(""), "");
  assert.equal(client.extractCsrf(null), "");
  // Values with `=` in them shouldn't be split.
  assert.equal(client.extractCsrf("__csrf=abc=def=="), "abc=def==");
});

test("getDailyRecommend posts csrf_token and returns data.dailySongs", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        data: {
          dailySongs: [
            { id: 1, name: "Song 1", ar: [{ name: "A1" }], al: { name: "AL" }, dt: 1000 },
            { id: 2, name: "Song 2", ar: [{ name: "A2" }], al: { name: "AL" }, dt: 2000 },
          ],
        },
      },
    }),
  ]);
  const result = await client.getDailyRecommend({
    cookie: "MUSIC_U=abc; __csrf=csrf-tok",
    request: fn,
  });
  assert.equal(result.success, true);
  assert.equal(result.songs.length, 2);
  assert.equal(result.songs[0].name, "Song 1");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].path, "/api/v1/discovery/recommend/songs");
  assert.equal(calls[0].body, "csrf_token=csrf-tok");
});

test("getDailyRecommend requires login", async () => {
  const result = await client.getDailyRecommend({ cookie: "" });
  assert.equal(result.success, false);
  assert.equal(result.error, "not-logged-in");
});

test("getTopCharts reads /api/toplist and normalizes each entry", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        list: [
          { id: 19723756, name: "云音乐热歌榜", coverImgUrl: "https://x/1.jpg", playCount: 1e8, trackCount: 200 },
          { id: 3779629, name: "云音乐新歌榜", coverImgUrl: "https://x/2.jpg" },
        ],
      },
    }),
  ]);
  const result = await client.getTopCharts({ request: fn });
  assert.equal(result.success, true);
  assert.equal(result.charts.length, 2);
  assert.equal(result.charts[0].id, 19723756);
  assert.equal(result.charts[0].name, "云音乐热歌榜");
  assert.equal(result.charts[0].trackCount, 200);
  assert.equal(calls[0].path, "/api/toplist");
});

test("getLyric returns lrc + translation text", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        lrc: { lyric: "[00:01.00]第一句\n[00:05.00]第二句" },
        tlyric: { lyric: "[00:01.00]First line" },
      },
    }),
  ]);
  const result = await client.getLyric(42, { cookie: "MUSIC_U=abc", request: fn });
  assert.equal(result.success, true);
  assert.equal(result.lyric.startsWith("[00:01.00]第一句"), true);
  assert.equal(result.tlyric.includes("First line"), true);
  assert.match(calls[0].path, /^\/api\/song\/lyric\?id=42/);
});

test("getLyric rejects empty songId without hitting the network", async () => {
  const { fn, calls } = fakeRequest([]);
  const result = await client.getLyric(undefined, { cookie: "MUSIC_U=abc", request: fn });
  assert.equal(result.success, false);
  assert.equal(result.error, "empty-id");
  assert.equal(calls.length, 0);
});

test("fetchSongUrl posts ids/br with the login cookie and returns the playable URL", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        data: [{ id: 42, url: "https://m7.music.126.net/song.mp3", br: 320000, type: "mp3", code: 200 }],
      },
    }),
  ]);
  const result = await client.fetchSongUrl(42, { cookie: "MUSIC_U=abc", request: fn });
  assert.equal(result.success, true);
  assert.equal(result.url, "https://m7.music.126.net/song.mp3");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].path, "/api/song/enhance/player/url");
  assert.equal(calls[0].body, "ids=%5B42%5D&br=320000");
  assert.equal(calls[0].headers.Cookie, "MUSIC_U=abc; os=pc");
});

test("fetchSongUrl returns no-url when NetEase does not provide a playable URL", async () => {
  const { fn } = fakeRequest([
    fakeResponse({
      body: { code: 200, data: [{ id: 42, url: null, code: 404 }] },
    }),
  ]);
  const result = await client.fetchSongUrl(42, { cookie: "MUSIC_U=abc", request: fn });
  assert.equal(result.success, false);
  assert.equal(result.error, "code-404");
});

test("getFmSong returns the first song from /api/v1/radio/get", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        data: [
          { id: 99, name: "FM Song", ar: [{ name: "FM Artist" }], al: { name: "FM Album" }, dt: 5000 },
        ],
      },
    }),
  ]);
  const result = await client.getFmSong({ cookie: "MUSIC_U=abc", request: fn });
  assert.equal(result.success, true);
  assert.equal(result.song.id, 99);
  assert.equal(result.song.name, "FM Song");
  assert.equal(calls[0].path, "/api/v1/radio/get");
});

test("getFmSong requires login", async () => {
  const result = await client.getFmSong({ cookie: "" });
  assert.equal(result.success, false);
  assert.equal(result.error, "not-logged-in");
});

test("manipulatePlaylistTracks uses the compatible playlist endpoint for add", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({ body: { code: 200 } }),
  ]);
  const result = await client.manipulatePlaylistTracks({
    op: "add",
    playlistId: 99,
    songIds: [1, "2"],
    cookie: "MUSIC_U=abc",
    request: fn,
  });

  assert.equal(result.success, true);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].path, "/api/playlist/manipulate/tracks");
  assert.equal(calls[0].headers.Cookie, "MUSIC_U=abc");
  assert.match(calls[0].body, /op=add/);
  assert.match(calls[0].body, /pid=99/);
  assert.match(decodeURIComponent(calls[0].body), /trackIds=\["1","2"\]/);
});

test("manipulatePlaylistTracks uses the compatible playlist endpoint for delete", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({ body: { code: 200 } }),
  ]);
  const result = await client.manipulatePlaylistTracks({
    op: "del",
    playlistId: 99,
    songIds: [1],
    cookie: "MUSIC_U=abc",
    request: fn,
  });

  assert.equal(result.success, true);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].path, "/api/playlist/manipulate/tracks");
  assert.match(calls[0].body, /op=del/);
});

test("likeSong uses the normal song-like endpoint", async () => {
  const { fn, calls } = fakeRequest([fakeResponse({ body: { code: 200 } })]);
  const result = await client.likeSong(42, false, {
    userId: 7,
    cookie: "MUSIC_U=abc",
    request: fn,
  });

  assert.equal(result.success, true);
  assert.equal(calls[0].path, "/api/song/like");
  assert.equal(calls[0].headers.Cookie, "MUSIC_U=abc");
  assert.match(calls[0].body, /trackId=42/);
  assert.match(calls[0].body, /userid=7/);
  assert.match(calls[0].body, /like=false/);
});

test("checkLikedSongs returns liked state by song id", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({ body: { code: 200, data: { 42: true, 43: false } } }),
  ]);

  const result = await client.checkLikedSongs([42, 43], {
    cookie: "MUSIC_U=abc",
    request: fn,
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.liked, { 42: true, 43: false });
  assert.equal(calls[0].path, "/api/song/like/check");
  assert.match(decodeURIComponent(calls[0].body), /trackIds=\["42","43"\]/);
});

test("checkLikedSongs accepts ids-array response shape", async () => {
  const { fn } = fakeRequest([
    fakeResponse({ body: { code: 200, ids: [42] } }),
  ]);

  const result = await client.checkLikedSongs([42, 43], {
    cookie: "MUSIC_U=abc",
    request: fn,
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.liked, { 42: true, 43: false });
});

test("getIntelligenceList returns normalized songs from the official playmode endpoint", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({
      body: {
        code: 200,
        data: [
          { songInfo: { id: 7, name: "Smart", ar: [{ name: "A" }], al: { name: "AL" }, dt: 1000 } },
        ],
      },
    }),
  ]);
  const result = await client.getIntelligenceList({
    songId: 1,
    playlistId: 2,
    count: 20,
    cookie: "MUSIC_U=abc",
    request: fn,
  });

  assert.equal(result.success, true);
  assert.equal(result.songs[0].name, "Smart");
  assert.equal(calls[0].path, "/api/playmode/intelligence/list");
  assert.match(calls[0].body, /songId=1/);
  assert.match(calls[0].body, /playlistId=2/);
});

test("trashFmSong posts the FM trash endpoint", async () => {
  const { fn, calls } = fakeRequest([fakeResponse({ body: { code: 200 } })]);
  const result = await client.trashFmSong(42, { cookie: "MUSIC_U=abc", request: fn });

  assert.equal(result.success, true);
  assert.equal(calls[0].path, "/api/radio/trash/add");
  assert.match(calls[0].body, /songId=42/);
});
