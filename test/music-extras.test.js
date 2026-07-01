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
  });
  await ctrl.getFmSong();
  assert.equal(cleared.length, 1);
});