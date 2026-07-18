const assert = require("node:assert/strict");
const test = require("node:test");

function loadService() {
  const modulePath = require.resolve("../src/renderer/music-playback-service.js");
  delete require.cache[modulePath];
  return require(modulePath);
}

const service = loadService();

test("playSongWithFallback plays through the in-pet audio host before trying the NetEase client", async () => {
  const calls = [];
  const result = await service.playSongWithFallback("123", {
    bridge: {
      fetchSongUrl: async (id) => {
        calls.push(["fetchSongUrl", id]);
        return { success: true, url: "http://127.0.0.1:4567/audio/abc", proxy: true };
      },
      getSongLyric: async (id) => {
        calls.push(["getSongLyric", id]);
        return { success: true, lyric: "[00:01.00]hello", tlyric: "[00:01.00]你好" };
      },
      playAudioUrlInPet: async (payload) => {
        calls.push(["playAudioUrlInPet", payload]);
        return { success: true, method: "audio-host", songId: payload.songId };
      },
      playSong: async (id) => {
        calls.push(["playSong", id]);
        return { success: true, method: "running-instance", songId: id };
      },
    },
    audioPlayer: {
      playUrl: async () => {
        calls.push(["playUrl"]);
        return { success: true };
      },
    },
    meta: {
      title: "Test song",
      artist: "Test artist",
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.method, "audio-host");
  assert.equal(result.songId, "123");
  assert.deepEqual(calls.map((entry) => entry[0]), [
    "fetchSongUrl",
    "getSongLyric",
    "playAudioUrlInPet",
  ]);
  assert.equal(calls[2][1].url, "http://127.0.0.1:4567/audio/abc");
  assert.equal(calls[2][1].title, "Test song");
  assert.equal(calls[2][1].artist, "Test artist");
  assert.equal(calls[2][1].lyric, "[00:01.00]hello");
  assert.equal(calls[2][1].tlyric, "[00:01.00]你好");
});

test("playSongWithFallback falls back to the renderer audio player when the host bridge is unavailable", async () => {
  const calls = [];
  const result = await service.playSongWithFallback("456", {
    bridge: {
      fetchSongUrl: async (id) => {
        calls.push(["fetchSongUrl", id]);
        return { success: true, url: "http://127.0.0.1:4567/audio/def" };
      },
      getSongLyric: async () => {
        calls.push(["getSongLyric"]);
        return { success: false, error: "no-lyric", lyric: "", tlyric: "" };
      },
    },
    audioPlayer: {
      playUrl: async (url, meta) => {
        calls.push(["playUrl", url, meta]);
        return { success: true, method: "audio", target: url };
      },
    },
    meta: { title: "Fallback song" },
  });

  assert.equal(result.success, true);
  assert.equal(result.method, "audio");
  assert.deepEqual(calls.map((entry) => entry[0]), ["fetchSongUrl", "getSongLyric", "playUrl"]);
  assert.equal(calls[2][1], "http://127.0.0.1:4567/audio/def");
  assert.equal(calls[2][2].title, "Fallback song");
});

test("playSongWithFallback reports URL failures without opening the NetEase client or browser", async () => {
  const calls = [];
  const result = await service.playSongWithFallback("789", {
    bridge: {
      fetchSongUrl: async (id) => {
        calls.push(["fetchSongUrl", id]);
        return { success: false, error: "no-audio-url" };
      },
      playSong: async (id) => {
        calls.push(["playSong", id]);
        return { success: true };
      },
      openMusicSong: async (id) => {
        calls.push(["openMusicSong", id]);
        return { success: true };
      },
    },
    audioPlayer: null,
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "not-found");
  assert.deepEqual(calls, [["fetchSongUrl", "789"], ["fetchSongUrl", "789"]]);
});

test("playSongWithFallback refreshes an expired audio URL once before failing", async () => {
  const localService = loadService();
  let fetchCount = 0;
  const result = await localService.playSongWithFallback("refresh-me", {
    bridge: {
      fetchSongUrl: async () => {
        fetchCount += 1;
        return { success: true, url: `http://127.0.0.1/audio/${fetchCount}` };
      },
      playAudioUrlInPet: async () => fetchCount > 1
        ? { success: true, method: "audio-host" }
        : { success: false, error: "audio-host-failed" },
    },
    queue: [{ id: "refresh-me", title: "Refresh me" }],
  });

  assert.equal(result.success, true);
  assert.equal(fetchCount, 2);
});

test("playNext skips an unavailable queue item and plays the next available song", async () => {
  const localService = loadService();
  const played = [];
  const result = await localService.playSongWithFallback("first", {
    bridge: {
      fetchSongUrl: async (id) => ({ success: true, url: `http://127.0.0.1/audio/${id}` }),
      playAudioUrlInPet: async ({ songId }) => {
        if (songId === "blocked") return { success: false, error: "forbidden" };
        played.push(songId);
        return { success: true, method: "audio-host" };
      },
    },
    queue: [
      { id: "first", title: "First" },
      { id: "blocked", title: "Blocked" },
      { id: "available", title: "Available" },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(result.songId, "first");
  const next = await localService.playNext({
    bridge: {
      fetchSongUrl: async (id) => ({ success: true, url: `http://127.0.0.1/audio/${id}` }),
      playAudioUrlInPet: async ({ songId }) => {
        if (songId === "blocked") return { success: false, error: "forbidden" };
        played.push(songId);
        return { success: true, method: "audio-host" };
      },
    },
    queue: [
      { id: "first", title: "First" },
      { id: "blocked", title: "Blocked" },
      { id: "available", title: "Available" },
    ],
  });

  assert.equal(next.success, true);
  assert.equal(next.songId, "available");
  assert.deepEqual(played, ["first", "available"]);
  const queueState = localService.getPlaybackState().queue;
  assert.equal(queueState[1].playable, false);
  assert.equal(queueState[1].error, "forbidden");
});

test("playSongWithFallback rejects empty ids", async () => {
  const result = await service.playSongWithFallback("", { bridge: {}, audioPlayer: null });
  assert.deepEqual(result, { success: false, error: "invalid-id" });
});

test("playSongWithFallback remembers queue and playNext plays the next song in pet audio", async () => {
  const localService = loadService();
  const calls = [];
  const deps = {
    bridge: {
      fetchSongUrl: async (id) => {
        calls.push(["fetchSongUrl", id]);
        return { success: true, url: `http://127.0.0.1:4567/audio/${id}` };
      },
      getSongLyric: async (id) => {
        calls.push(["getSongLyric", id]);
        return { success: true, lyric: "", tlyric: "" };
      },
    },
    audioPlayer: {
      playUrl: async (url, meta) => {
        calls.push(["playUrl", url, meta]);
        return { success: true, method: "audio" };
      },
    },
    queue: [
      { id: "one", title: "One", artist: "A" },
      { id: "two", title: "Two", artist: "B" },
    ],
    meta: { title: "One", artist: "A" },
  };

  await localService.playSongWithFallback("one", deps);
  const next = await localService.playNext(deps);

  assert.equal(next.success, true);
  assert.equal(next.songId, "two");
  assert.deepEqual(calls.map((entry) => entry[0]), [
    "fetchSongUrl",
    "getSongLyric",
    "playUrl",
    "fetchSongUrl",
    "getSongLyric",
    "playUrl",
  ]);
  assert.equal(calls.at(-1)[2].title, "Two");
  assert.equal(calls.at(-1)[2].artist, "B");
});

test("playPrevious reports no-queue before a playlist-backed song is played", async () => {
  const localService = loadService();
  const result = await localService.playPrevious({ bridge: {}, audioPlayer: null });

  assert.deepEqual(result, { success: false, error: "no-queue" });
});

test("playback capabilities keep adjacent controls unavailable without a queue", () => {
  const localService = loadService();

  assert.deepEqual(localService.getPlaybackCapabilities(), {
    hasQueue: false,
    canPlayPrevious: false,
    canPlayNext: false,
  });
});

test("playback capabilities enable adjacent controls after a queue is restored", () => {
  const localService = loadService();
  localService.hydratePlaybackState({
    queue: [{ id: "one", title: "One" }],
    currentIndex: 0,
  });

  assert.deepEqual(localService.getPlaybackCapabilities(), {
    hasQueue: true,
    canPlayPrevious: true,
    canPlayNext: true,
  });
});

test("playNext can use shuffle mode without replaying the current song", async () => {
  const localService = loadService();
  const played = [];
  const deps = {
    bridge: {
      fetchSongUrl: async (id) => ({ success: true, url: `http://127.0.0.1:4567/audio/${id}` }),
      getSongLyric: async () => ({ success: true, lyric: "", tlyric: "" }),
    },
    audioPlayer: {
      playUrl: async (_url, meta) => {
        played.push(meta.songId);
        return { success: true, method: "audio" };
      },
    },
    random: () => 0.99,
  };

  await localService.playSongWithFallback("one", {
    ...deps,
    mode: "shuffle",
    queue: [
      { id: "one", title: "One" },
      { id: "two", title: "Two" },
      { id: "three", title: "Three" },
    ],
  });
  const result = await localService.playNext(deps);

  assert.equal(result.success, true);
  assert.equal(result.songId, "three");
  assert.deepEqual(played, ["one", "three"]);
});

test("shuffle mode keeps one order for repeated next actions", async () => {
  const localService = loadService();
  const played = [];
  const deps = {
    bridge: {
      fetchSongUrl: async (id) => ({ success: true, url: `http://127.0.0.1:4567/audio/${id}` }),
    },
    audioPlayer: { playUrl: async (_url, meta) => { played.push(meta.songId); return { success: true, method: "audio" }; } },
    random: () => 0.99,
    queue: [
      { id: "one", title: "One" },
      { id: "two", title: "Two" },
      { id: "three", title: "Three" },
    ],
    mode: "shuffle",
  };

  await localService.playSongWithFallback("one", deps);
  await localService.playNext(deps);
  await localService.playNext({ ...deps, random: () => 0 });

  assert.deepEqual(played, ["one", "three", "two"]);
});

test("playPrevious in shuffle mode returns to the actual previous song", async () => {
  const localService = loadService();
  const played = [];
  const deps = {
    bridge: {
      fetchSongUrl: async (id) => ({ success: true, url: `http://127.0.0.1:4567/audio/${id}` }),
      getSongLyric: async () => ({ success: true, lyric: "", tlyric: "" }),
    },
    audioPlayer: {
      playUrl: async (_url, meta) => {
        played.push(meta.songId);
        return { success: true, method: "audio" };
      },
    },
    random: () => 0.99,
  };

  await localService.playSongWithFallback("one", {
    ...deps,
    mode: "shuffle",
    queue: [
      { id: "one", title: "One" },
      { id: "two", title: "Two" },
      { id: "three", title: "Three" },
    ],
  });
  await localService.playNext(deps);
  const previous = await localService.playPrevious(deps);

  assert.equal(previous.success, true);
  assert.equal(previous.songId, "one");
  assert.deepEqual(played, ["one", "three", "one"]);
});

test("playback service records history and exposes current queue state", async () => {
  const localService = loadService();
  const deps = {
    bridge: {
      fetchSongUrl: async (id) => ({ success: true, url: `http://127.0.0.1:4567/audio/${id}` }),
      getSongLyric: async () => ({ success: true, lyric: "", tlyric: "" }),
    },
    audioPlayer: {
      playUrl: async () => ({ success: true, method: "audio" }),
    },
  };

  await localService.playSongWithFallback("one", {
    ...deps,
    mode: "sequence",
    queue: [
      { id: "one", title: "One", artist: "A" },
      { id: "two", title: "Two", artist: "B" },
    ],
  });
  await localService.playNext(deps);

  const state = localService.getPlaybackState();
  assert.equal(state.mode, "sequence");
  assert.equal(state.current.id, "two");
  assert.deepEqual(state.history.map((item) => item.id), ["two", "one"]);
});

test("setPlaybackMode changes queue behavior without starting a new song", async () => {
  const localService = loadService();
  const calls = [];

  const result = localService.setPlaybackMode("shuffle");

  assert.deepEqual(result, { success: true, mode: "shuffle" });
  assert.equal(localService.getPlaybackState().mode, "shuffle");
  assert.deepEqual(calls, []);
});

test("repeat-one mode replays the current song on auto next", async () => {
  const localService = loadService();
  const played = [];
  const deps = {
    bridge: {
      fetchSongUrl: async (id) => ({ success: true, url: `http://127.0.0.1:4567/audio/${id}` }),
      getSongLyric: async () => ({ success: true, lyric: "", tlyric: "" }),
    },
    audioPlayer: {
      playUrl: async (_url, meta) => {
        played.push(meta.songId);
        return { success: true, method: "audio" };
      },
    },
    queue: [
      { id: "one", title: "One" },
      { id: "two", title: "Two" },
    ],
    mode: "repeat-one",
  };

  await localService.playSongWithFallback("one", deps);
  const next = await localService.playNext(deps);

  assert.equal(next.success, true);
  assert.equal(next.songId, "one");
  assert.deepEqual(played, ["one", "one"]);
});

test("heartbeat mode asks NetEase intelligence list before local fallback", async () => {
  const localService = loadService();
  const calls = [];
  const deps = {
    bridge: {
      fetchSongUrl: async (id) => {
        calls.push(["fetchSongUrl", id]);
        return { success: true, url: `http://127.0.0.1:4567/audio/${id}` };
      },
      getSongLyric: async () => ({ success: true, lyric: "", tlyric: "" }),
      getIntelligenceList: async (payload) => {
        calls.push(["getIntelligenceList", payload]);
        return { success: true, songs: [{ id: "smart", name: "Smart", artists: ["AI"] }] };
      },
    },
    audioPlayer: { playUrl: async () => ({ success: true, method: "audio" }) },
    queue: [{ id: "seed", title: "Seed", playlistId: "liked" }],
    playlistId: "liked",
    mode: "heartbeat",
  };

  await localService.playSongWithFallback("seed", deps);
  const result = await localService.playNext(deps);

  assert.equal(result.success, true);
  assert.equal(result.songId, "smart");
  assert.deepEqual(calls[1], ["getIntelligenceList", { songId: "seed", playlistId: "liked", count: 20 }]);
});

test("playback service hydrates queue and history from the shared store", async () => {
  const localService = loadService();
  const state = await localService.syncPlaybackState({
    getMusicPlaybackState: async () => ({
      mode: "shuffle",
      queue: [
        { id: "one", title: "One" },
        { id: "two", title: "Two" },
      ],
      currentIndex: 1,
      history: [{ id: "one", title: "One", playedAt: "2026-07-09T00:00:00.000Z" }],
    }),
  });

  assert.equal(state.mode, "shuffle");
  assert.equal(state.current.id, "two");
  assert.equal(state.history[0].playedAt, "2026-07-09T00:00:00.000Z");
});

test("successful playback persists shared queue and history", async () => {
  const localService = loadService();
  const updates = [];
  const bridge = {
    fetchSongUrl: async () => ({ success: true, url: "http://127.0.0.1/audio" }),
    getSongLyric: async () => ({ success: true, lyric: "", tlyric: "" }),
    updateMusicPlaybackState: async (state) => {
      updates.push(state);
      return { success: true, state };
    },
  };

  await localService.playSongWithFallback("one", {
    bridge,
    audioPlayer: { playUrl: async () => ({ success: true, method: "audio" }) },
    queue: [{ id: "one", title: "One", artist: "A" }],
    meta: { title: "One", artist: "A" },
    now: () => Date.parse("2026-07-09T01:02:03.000Z"),
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].currentIndex, 0);
  assert.equal(updates[0].history[0].playedAt, "2026-07-09T01:02:03.000Z");
});

test("playback state subscribers receive the canonical current song and queue", async () => {
  const localService = loadService();
  const states = [];
  const unsubscribe = localService.onStateChange((state) => states.push(state));
  await localService.playSongWithFallback("one", {
    bridge: {
      fetchSongUrl: async () => ({ success: true, url: "http://127.0.0.1/audio" }),
      playAudioUrlInPet: async () => ({ success: true, method: "audio-host" }),
    },
    queue: [{ id: "one", title: "One" }],
    meta: { title: "One" },
  });
  unsubscribe();

  assert.ok(states.length >= 1);
  assert.equal(states.at(-1).current.id, "one");
  assert.deepEqual(states.at(-1).queue.map((item) => item.id), ["one"]);
});

test("history removal and clear use the shared store result", async () => {
  const localService = loadService();
  localService.hydratePlaybackState({
    history: [{ id: "one" }, { id: "two" }],
  });
  const bridge = {
    removeMusicHistoryItem: async () => ({
      success: true,
      state: { history: [{ id: "two" }] },
    }),
    clearMusicHistory: async () => ({
      success: true,
      state: { history: [] },
    }),
  };

  const removed = await localService.removeHistoryItem("one", bridge);
  assert.equal(removed.success, true);
  assert.deepEqual(localService.getPlaybackState().history.map((item) => item.id), ["two"]);

  const cleared = await localService.clearHistory(bridge);
  assert.equal(cleared.success, true);
  assert.deepEqual(localService.getPlaybackState().history, []);
});

test("a newer play request cancels the older request before it can commit state", async () => {
  const localService = loadService();
  let releaseFirstUrl;
  let fetchCount = 0;
  const updates = [];
  const opened = [];
  const bridge = {
    fetchSongUrl: async (id) => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Promise((resolve) => {
          releaseFirstUrl = () => resolve({ success: true, url: `http://127.0.0.1/audio/${id}` });
        });
      }
      return { success: true, url: `http://127.0.0.1/audio/${id}` };
    },
    getSongLyric: async () => ({ success: true, lyric: "", tlyric: "" }),
    playAudioUrlInPet: async ({ songId }) => ({ success: true, method: "audio-host", songId }),
    updateMusicPlaybackState: async (state) => {
      updates.push(state);
      return { success: true, state };
    },
    openMusicSong: async (id) => {
      opened.push(id);
      return { success: true };
    },
  };

  const first = localService.playSongWithFallback("first", {
    bridge,
    queue: [{ id: "first", title: "First" }],
    meta: { title: "First" },
  });
  await new Promise((resolve) => setImmediate(resolve));

  const second = localService.playSongWithFallback("second", {
    bridge,
    queue: [{ id: "second", title: "Second" }],
    meta: { title: "Second" },
  });
  releaseFirstUrl();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, {
    success: false,
    error: "cancelled",
    retryable: false,
    songId: "first",
  });
  assert.equal(secondResult.success, true);
  assert.equal(secondResult.songId, "second");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].current.id, "second");
  assert.deepEqual(opened, []);
});
