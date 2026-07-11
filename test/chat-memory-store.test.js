const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  clearAllChatMemory,
  clearChatSummary,
  clearRecentChatMemory,
  defaultChatMemoryState,
  loadChatMemoryState,
  normalizeChatMemoryState,
  saveChatMemoryState,
} = require("../src/chat/chat-memory-store");

test("normalizeChatMemoryState returns safe defaults", () => {
  assert.deepEqual(normalizeChatMemoryState(null), defaultChatMemoryState);
});

test("normalizeChatMemoryState validates profile, summary, messages, and stats", () => {
  const state = normalizeChatMemoryState({
    version: 99,
    profile: {
      displayName: 42,
      relationshipTone: "soft",
      preferences: ["coffee", "", "tea", "coffee"],
      facts: [{ nope: true }, "likes music"],
      avoidances: ["spoilers", null],
    },
    summary: {
      conversation: 12,
      updatedAt: "2026-07-10T08:00:00.000Z",
    },
    recentMessages: [
      { role: "user", content: " hi ", createdAt: "2026-07-10T08:00:00.000Z" },
      { role: "bot", content: "nope", createdAt: "bad" },
      { role: "assistant", content: "", createdAt: "2026-07-10T08:00:01.000Z" },
      { role: "assistant", content: "hello", createdAt: "2026-07-10T08:00:02.000Z" },
    ],
    stats: {
      compressCount: "4",
      lastCompressedAt: "2026-07-10T09:00:00.000Z",
    },
  });

  assert.equal(state.version, 2);
  assert.equal(state.profile.displayName, "");
  assert.equal(state.profile.relationshipTone, "soft");
  assert.deepEqual(state.profile.preferences, ["coffee", "tea"]);
  assert.deepEqual(state.profile.facts, ["likes music"]);
  assert.deepEqual(state.profile.avoidances, ["spoilers"]);
  assert.equal(state.summary.conversation, "");
  assert.equal(state.summary.updatedAt, "2026-07-10T08:00:00.000Z");
  assert.deepEqual(state.recentMessages, [
    { role: "user", content: " hi ", createdAt: "2026-07-10T08:00:00.000Z" },
    { role: "assistant", content: "hello", createdAt: "2026-07-10T08:00:02.000Z" },
  ]);
  assert.equal(state.stats.compressCount, 4);
  assert.equal(state.stats.lastCompressedAt, "2026-07-10T09:00:00.000Z");
});

test("normalizeChatMemoryState migrates legacy profile data into v2 entries", () => {
  const state = normalizeChatMemoryState({
    version: 1,
    profile: {
      relationshipTone: "warm",
      preferences: ["tea"],
      facts: ["works from home"],
      avoidances: ["spoilers"],
    },
  });

  assert.equal(state.version, 2);
  assert.deepEqual(state.memories.map(({ category, content, pinned }) => ({ category, content, pinned })), [
    { category: "relationship", content: "warm", pinned: false },
    { category: "preference", content: "tea", pinned: false },
    { category: "fact", content: "works from home", pinned: false },
    { category: "avoidance", content: "spoilers", pinned: false },
  ]);
});

test("memory entries are trimmed, deduplicated, and rebuild the legacy profile", () => {
  const state = normalizeChatMemoryState({
    memories: [
      { id: "a", category: "preference", content: " Tea ", pinned: true },
      { id: "b", category: "preference", content: "tea", pinned: false },
      { id: "c", category: "fact", content: "likes music", pinned: false },
      { id: "d", category: "invalid", content: "discard", pinned: false },
    ],
  });

  assert.deepEqual(state.memories.map((memory) => memory.content), ["Tea", "likes music"]);
  assert.equal(state.memories[0].pinned, true);
  assert.deepEqual(state.profile.preferences, ["Tea"]);
  assert.deepEqual(state.profile.facts, ["likes music"]);
});

test("saveChatMemoryState and loadChatMemoryState round trip atomically", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deskpet-chat-memory-"));
  const file = path.join(dir, "chat-memory.json");
  const saved = saveChatMemoryState(file, {
    profile: {
      relationshipTone: "playful",
      preferences: ["tea"],
    },
    summary: {
      conversation: "Old summary",
      updatedAt: "2026-07-10T08:00:00.000Z",
    },
    recentMessages: [
      { role: "user", content: "hello", createdAt: "2026-07-10T08:01:00.000Z" },
    ],
  });

  assert.deepEqual(loadChatMemoryState(file), saved);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test("loadChatMemoryState recovers from a corrupt file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deskpet-chat-memory-"));
  const file = path.join(dir, "chat-memory.json");
  fs.writeFileSync(file, "{broken", "utf8");

  assert.deepEqual(loadChatMemoryState(file), defaultChatMemoryState);
});

test("clearRecentChatMemory preserves long-term memory and clears recent history", () => {
  const cleared = clearRecentChatMemory({
    profile: {
      relationshipTone: "warm",
      preferences: ["music"],
      facts: ["user likes tea"],
    },
    summary: {
      conversation: "Older context",
      updatedAt: "2026-07-10T08:00:00.000Z",
    },
    recentMessages: [
      { role: "user", content: "hello", createdAt: "2026-07-10T09:00:00.000Z" },
    ],
    stats: {
      compressCount: 2,
      lastCompressedAt: "2026-07-10T09:30:00.000Z",
    },
  });

  assert.deepEqual(cleared.profile.preferences, ["music"]);
  assert.equal(cleared.summary.conversation, "Older context");
  assert.deepEqual(cleared.recentMessages, []);
  assert.equal(cleared.stats.compressCount, 2);
});

test("clearAllChatMemory resets to default state", () => {
  assert.deepEqual(clearAllChatMemory({
    profile: { preferences: ["music"] },
    recentMessages: [{ role: "user", content: "x", createdAt: "2026-07-10T09:00:00.000Z" }],
  }), defaultChatMemoryState);
});

test("clearChatSummary preserves long-term entries", () => {
  const state = clearChatSummary({
    memories: [{ id: "memory-1", category: "fact", content: "likes tea", pinned: true }],
    summary: { conversation: "old context", updatedAt: "2026-07-10T08:00:00.000Z" },
  });

  assert.equal(state.summary.conversation, "");
  assert.deepEqual(state.memories.map((memory) => memory.content), ["likes tea"]);
});
