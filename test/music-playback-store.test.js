const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  clearHistory,
  loadPlaybackState,
  normalizePlaybackState,
  removeHistoryEntry,
  savePlaybackState,
} = require("../src/music/music-playback-store");

test("normalizePlaybackState returns safe defaults", () => {
  assert.deepEqual(normalizePlaybackState(null), {
    mode: "sequence",
    queue: [],
    currentIndex: -1,
    history: [],
  });
});

test("normalizePlaybackState validates mode, queue, index, and history", () => {
  const history = Array.from({ length: 105 }, (_, index) => ({
    id: String(index % 101),
    title: `Song ${index}`,
    artist: "Artist",
    playedAt: `2026-07-09T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
  }));
  const state = normalizePlaybackState({
    mode: "invalid",
    queue: [
      { id: 1, title: "One", artist: "A", playlistId: 9 },
      { title: "Missing id" },
    ],
    currentIndex: 99,
    history,
  });

  assert.equal(state.mode, "sequence");
  assert.deepEqual(state.queue, [{ id: "1", title: "One", artist: "A", playlistId: "9" }]);
  assert.equal(state.currentIndex, 0);
  assert.equal(state.history.length, 100);
  assert.equal(new Set(state.history.map((item) => item.id)).size, 100);
});

test("savePlaybackState and loadPlaybackState round trip atomically", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deskpet-playback-"));
  const file = path.join(dir, "state.json");
  const saved = savePlaybackState(file, {
    mode: "shuffle",
    queue: [{ id: 7, title: "Seven" }],
    currentIndex: 0,
    history: [{ id: 7, title: "Seven", playedAt: "2026-07-09T00:00:00.000Z" }],
  });

  assert.deepEqual(loadPlaybackState(file), saved);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test("loadPlaybackState recovers from a corrupt file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deskpet-playback-"));
  const file = path.join(dir, "state.json");
  fs.writeFileSync(file, "{broken", "utf8");

  assert.deepEqual(loadPlaybackState(file), normalizePlaybackState());
});

test("history entries can be removed individually or cleared", () => {
  const state = normalizePlaybackState({
    history: [
      { id: 1, title: "One" },
      { id: 2, title: "Two" },
    ],
  });

  assert.deepEqual(removeHistoryEntry(state, 1).history.map((item) => item.id), ["2"]);
  assert.deepEqual(clearHistory(state).history, []);
});
