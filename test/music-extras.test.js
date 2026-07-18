// Unit tests for the music controller's wrapper methods that route
// the standalone-window features (daily rec, top charts, lyrics, FM)
// through the saved cookie.
const assert = require("node:assert/strict");
const test = require("node:test");

const { createMusicController } = require("../src/music/music-controller");

function makeFakeStore(session) {
  return {
    loadSession: () => session ? { success: true, session } : { success: false, error: "not-logged-in" },
    saveSession: () => ({ success: true }),
    clearSession: () => ({ success: true }),
  };
}

function makeClient(overrides = {}) {
  return {
    getDailyRecommend: async () => ({ success: true, songs: [{ id: 1, name: "x", artists: [], album: "", duration: 0 }] }),
    getTopCharts: async () => ({ success: true, charts: [{ id: 19723756, name: "热歌榜", coverImgUrl: "", playCount: 0, trackCount: 200 }] }),
    getLyric: async (id) => ({ success: true, lyric: `[00:01.00]song ${id}`, tlyric: "" }),
    getFmSong: async () => ({ success: true, song: { id: 99, name: "fm", artists: [], album: "", duration: 0 } }),
    ...overrides,
  };
}

test("controller.getDailyRecommend returns not-logged-in when no session", async () => {
  const ctrl = createMusicController({
    client: makeClient(),
    sessionStore: makeFakeStore(null),
  });
  const result = await ctrl.getDailyRecommend();
  assert.equal(result.success, false);
  assert.equal(result.error, "not-logged-in");
});

test("controller.getDailyRecommend forwards cookie and returns songs", async () => {
  const calls = [];
  const client = {
    getDailyRecommend: async ({ cookie }) => {
      calls.push(cookie);
      return { success: true, songs: [{ id: 1, name: "x" }] };
    },
  };
  const ctrl = createMusicController({
    client,
    sessionStore: makeFakeStore({ cookie: "MUSIC_U=u1" }),
  });
  const result = await ctrl.getDailyRecommend();
  assert.equal(result.success, true);
  assert.equal(calls[0], "MUSIC_U=u1");
});

test("controller.getTopCharts works without a session (public endpoint)", async () => {
  const calls = [];
  const client = {
    getTopCharts: async ({ cookie }) => {
      calls.push(cookie);
      return { success: true, charts: [] };
    },
  };
  const ctrl = createMusicController({
    client,
    sessionStore: makeFakeStore(null),
  });
  // The user isn't logged in but the controller still tries — getTopCharts
  // is a public endpoint and we pass whatever cookie we have.
  const result = await ctrl.getTopCharts();
  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  // No session → no cookie passed (or empty string).
  assert.equal(calls[0] || "", "");
});

test("controller.getLyric forwards the songId and cookie", async () => {
  const calls = [];
  const client = {
    getLyric: async (id, { cookie }) => {
      calls.push({ id, cookie });
      return { success: true, lyric: "[00:00.00]x", tlyric: "" };
    },
  };
  const ctrl = createMusicController({
    client,
    sessionStore: makeFakeStore({ cookie: "MUSIC_U=u2" }),
  });
  const result = await ctrl.getLyric(42);
  assert.equal(result.success, true);
  assert.equal(calls[0].id, 42);
  assert.equal(calls[0].cookie, "MUSIC_U=u2");
});

test("controller.fetchSongUrl forwards the songId and saved cookie", async () => {
  const calls = [];
  const client = {
    fetchSongUrl: async (id, { cookie }) => {
      calls.push({ id, cookie });
      return { success: true, url: "https://example.com/song.mp3" };
    },
  };
  const ctrl = createMusicController({
    client,
    sessionStore: makeFakeStore({ cookie: "MUSIC_U=u-song" }),
  });
  const result = await ctrl.fetchSongUrl(42);
  assert.equal(result.success, true);
  assert.equal(result.url, "https://example.com/song.mp3");
  assert.deepEqual(calls[0], { id: 42, cookie: "MUSIC_U=u-song" });
});

test("controller.fetchSongUrl can still use the public endpoint without login", async () => {
  const calls = [];
  const client = {
    fetchSongUrl: async (id, { cookie }) => {
      calls.push({ id, cookie });
      return { success: true, url: "https://example.com/public.mp3" };
    },
  };
  const ctrl = createMusicController({
    client,
    sessionStore: makeFakeStore(null),
  });
  const result = await ctrl.fetchSongUrl(7);
  assert.equal(result.success, true);
  assert.deepEqual(calls[0], { id: 7, cookie: "" });
});

test("controller.getFmSong returns not-logged-in when no session", async () => {
  const ctrl = createMusicController({
    client: makeClient(),
    sessionStore: makeFakeStore(null),
  });
  const result = await ctrl.getFmSong();
  assert.equal(result.success, false);
  assert.equal(result.error, "not-logged-in");
});

test("controller.getFmSong returns a song when logged in", async () => {
  const ctrl = createMusicController({
    client: makeClient(),
    sessionStore: makeFakeStore({ cookie: "MUSIC_U=u3" }),
  });
  const result = await ctrl.getFmSong();
  assert.equal(result.success, true);
  assert.equal(result.song.id, 99);
});

test("controller.getFmSong clears local session on session-expired", async () => {
  const cleared = [];
  const sessionChanges = [];
  const client = {
    getFmSong: async () => ({ success: false, error: "session-expired" }),
  };
  const ctrl = createMusicController({
    client,
    sessionStore: {
      loadSession: () => ({ success: true, session: { cookie: "MUSIC_U=stale" } }),
      saveSession: () => ({ success: true }),
      clearSession: () => { cleared.push(true); return { success: true }; },
    },
    onSessionChanged: (status) => sessionChanges.push(status),
  });
  await ctrl.getFmSong();
  assert.equal(cleared.length, 1);
  assert.equal(sessionChanges.length, 1);
  assert.equal(sessionChanges[0].loggedIn, false);
});

test("controller forwards playlist write operations with saved cookie", async () => {
  const calls = [];
  const ctrl = createMusicController({
    client: {
      manipulatePlaylistTracks: async (payload) => {
        calls.push(payload);
        return { success: true };
      },
    },
    sessionStore: makeFakeStore({ cookie: "MUSIC_U=write" }),
  });

  const result = await ctrl.manipulatePlaylistTracks({ op: "del", playlistId: 1, songIds: [2] });

  assert.equal(result.success, true);
  assert.deepEqual(calls[0], { op: "del", playlistId: 1, songIds: [2], cookie: "MUSIC_U=write" });
});

test("controller refreshes complete browser cookies before playlist writes", async () => {
  const calls = [];
  const saved = [];
  const ctrl = createMusicController({
    client: {
      manipulatePlaylistTracks: async (payload) => {
        calls.push(payload);
        return { success: true };
      },
    },
    sessionStore: {
      loadSession: () => ({ success: true, session: { cookie: "MUSIC_U=old" } }),
      saveSession: (session) => { saved.push(session); return { success: true }; },
      clearSession: () => ({ success: true }),
    },
    sessionCookieProvider: async () => "MUSIC_U=fresh; __csrf=csrf; NMTID=device",
  });

  await ctrl.manipulatePlaylistTracks({ op: "add", playlistId: 1, songIds: [2] });

  assert.equal(calls[0].cookie, "MUSIC_U=fresh; __csrf=csrf; NMTID=device");
  assert.equal(saved[0].cookie, "MUSIC_U=fresh; __csrf=csrf; NMTID=device");
});

test("controller forwards like, intelligence, and FM trash operations", async () => {
  const calls = [];
  const client = {
    likeSong: async (id, like, { cookie }) => {
      calls.push(["like", id, like, cookie]);
      return { success: true };
    },
    getIntelligenceList: async (payload) => {
      calls.push(["intelligence", payload]);
      return { success: true, songs: [] };
    },
    trashFmSong: async (id, { cookie }) => {
      calls.push(["trash", id, cookie]);
      return { success: true };
    },
  };
  const ctrl = createMusicController({
    client,
    sessionStore: makeFakeStore({ cookie: "MUSIC_U=ops" }),
  });

  await ctrl.likeSong(7, true);
  await ctrl.getIntelligenceList({ songId: 7, playlistId: 9, count: 5 });
  await ctrl.trashFmSong(7);

  assert.deepEqual(calls[0], ["like", 7, true, "MUSIC_U=ops"]);
  assert.deepEqual(calls[1], ["intelligence", { songId: 7, playlistId: 9, count: 5, cookie: "MUSIC_U=ops" }]);
  assert.deepEqual(calls[2], ["trash", 7, "MUSIC_U=ops"]);
});

test("controller falls back to the liked playlist when song-like API fails", async () => {
  const calls = [];
  const client = {
    likeSong: async () => ({ success: false, error: "api-401" }),
    getProfile: async () => ({ success: true, profile: { userId: 9, nickname: "User" } }),
    getUserPlaylists: async () => ({
      success: true,
      playlists: [
        { id: 100, name: "Other", specialType: 0, editable: true },
        { id: 200, name: "Liked", specialType: 5, editable: true },
      ],
    }),
    manipulatePlaylistTracks: async (payload) => {
      calls.push(payload);
      return { success: true };
    },
  };
  const ctrl = createMusicController({
    client,
    sessionStore: makeFakeStore({ cookie: "MUSIC_U=ops" }),
  });

  const result = await ctrl.likeSong(7, true);

  assert.equal(result.success, true);
  assert.equal(result.method, "liked-playlist-fallback");
  assert.deepEqual(calls[0], {
    op: "add",
    playlistId: 200,
    songIds: [7],
    cookie: "MUSIC_U=ops",
  });
});
