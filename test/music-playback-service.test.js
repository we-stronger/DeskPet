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
  assert.equal(result.error, "no-audio-url");
  assert.deepEqual(calls, [["fetchSongUrl", "789"]]);
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
