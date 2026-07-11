const assert = require("node:assert/strict");
const test = require("node:test");

const { createChatMemoryController } = require("../src/chat/chat-memory-controller");

function createMemoryHarness(initialState = null) {
  let state = initialState;
  return {
    loadState: () => state,
    saveState: (_path, nextState) => {
      state = nextState;
      return nextState;
    },
    read: () => state,
  };
}

test("remembered mode builds context from system prompt, memory, summary, recent messages, and current user input", async () => {
  const harness = createMemoryHarness({
    profile: {
      relationshipTone: "warm",
      preferences: ["music"],
      facts: ["user likes tea"],
      avoidances: ["spoilers"],
    },
    summary: {
      conversation: "You already discussed work stress.",
      updatedAt: "2026-07-10T08:00:00.000Z",
    },
    recentMessages: [
      { role: "user", content: "hi", createdAt: "2026-07-10T08:01:00.000Z" },
      { role: "assistant", content: "hello", createdAt: "2026-07-10T08:01:01.000Z" },
    ],
  });
  const calls = [];
  const controller = createChatMemoryController({
    statePath: "memory.json",
    systemPrompt: "Be kind.",
    loadState: harness.loadState,
    saveState: harness.saveState,
    chat: async (messages) => {
      calls.push(messages);
      return { success: true, content: "How can I help?" };
    },
    summarize: async () => ({ success: true }),
    now: () => "2026-07-10T08:02:00.000Z",
  });

  const result = await controller.sendMessage({
    mode: "remembered",
    text: "remember me",
  });

  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    { role: "system", content: "Be kind." },
    {
      role: "system",
      content: [
        "Long-term memory:",
        "Relationship tone: warm",
        "Preferences: music",
        "Facts: user likes tea",
        "Avoid: spoilers",
        "Summary: You already discussed work stress.",
      ].join("\n"),
    },
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
    { role: "user", content: "remember me" },
  ]);
  assert.deepEqual(result.state.recentMessages.map((item) => item.content), [
    "hi",
    "hello",
    "remember me",
    "How can I help?",
  ]);
});

test("temporary mode only uses window-scoped history and does not persist", async () => {
  const harness = createMemoryHarness({
    profile: { facts: ["persistent fact"] },
    recentMessages: [
      { role: "user", content: "persisted", createdAt: "2026-07-10T08:01:00.000Z" },
    ],
  });
  const calls = [];
  const controller = createChatMemoryController({
    statePath: "memory.json",
    systemPrompt: "Be kind.",
    loadState: harness.loadState,
    saveState: harness.saveState,
    chat: async (messages) => {
      calls.push(messages);
      return { success: true, content: "temp reply" };
    },
    summarize: async () => ({ success: true }),
    now: () => "2026-07-10T08:02:00.000Z",
  });

  const result = await controller.sendMessage({
    mode: "temporary",
    text: "temp question",
    temporaryMessages: [
      { role: "user", content: "temp hello" },
      { role: "assistant", content: "temp hi" },
    ],
  });

  assert.equal(result.success, true);
  assert.deepEqual(calls[0], [
    { role: "system", content: "Be kind." },
    { role: "user", content: "temp hello" },
    { role: "assistant", content: "temp hi" },
    { role: "user", content: "temp question" },
  ]);
  assert.deepEqual(harness.read().recentMessages.map((item) => item.content), ["persisted"]);
  assert.equal(result.state, null);
});

test("remembered mode compresses older messages and keeps the newest raw turns", async () => {
  const harness = createMemoryHarness({
    recentMessages: [
      { role: "user", content: "u1", createdAt: "2026-07-10T08:00:00.000Z" },
      { role: "assistant", content: "a1", createdAt: "2026-07-10T08:00:01.000Z" },
      { role: "user", content: "u2", createdAt: "2026-07-10T08:00:02.000Z" },
      { role: "assistant", content: "a2", createdAt: "2026-07-10T08:00:03.000Z" },
    ],
  });
  const controller = createChatMemoryController({
    statePath: "memory.json",
    loadState: harness.loadState,
    saveState: harness.saveState,
    chat: async () => ({ success: true, content: "a3" }),
    summarize: async ({ messages }) => ({
      success: true,
      summary: "compressed",
      profile: { facts: [`count:${messages.length}`] },
    }),
    now: () => "2026-07-10T08:01:00.000Z",
    recentMessageLimit: 4,
    preserveRecentMessageCount: 2,
  });

  const result = await controller.sendMessage({
    mode: "remembered",
    text: "u3",
  });

  assert.equal(result.success, true);
  assert.equal(result.state.summary.conversation, "compressed");
  assert.deepEqual(result.state.profile.facts, ["count:4"]);
  assert.deepEqual(result.state.recentMessages.map((item) => item.content), ["a2", "u3", "a3"]);
  assert.equal(result.state.stats.compressCount, 1);
});

test("compression failure falls back to a simple summary without breaking the reply", async () => {
  const harness = createMemoryHarness({
    recentMessages: [
      { role: "user", content: "old user", createdAt: "2026-07-10T08:00:00.000Z" },
      { role: "assistant", content: "old assistant", createdAt: "2026-07-10T08:00:01.000Z" },
      { role: "user", content: "new user", createdAt: "2026-07-10T08:00:02.000Z" },
      { role: "assistant", content: "new assistant", createdAt: "2026-07-10T08:00:03.000Z" },
    ],
  });
  const controller = createChatMemoryController({
    statePath: "memory.json",
    loadState: harness.loadState,
    saveState: harness.saveState,
    chat: async () => ({ success: true, content: "reply" }),
    summarize: async () => {
      throw new Error("summary failed");
    },
    now: () => "2026-07-10T08:01:00.000Z",
    recentMessageLimit: 4,
    preserveRecentMessageCount: 2,
  });

  const result = await controller.sendMessage({
    mode: "remembered",
    text: "latest",
  });

  assert.equal(result.success, true);
  assert.match(result.state.summary.conversation, /old user/);
  assert.deepEqual(result.state.recentMessages.map((item) => item.content), [
    "new assistant",
    "latest",
    "reply",
  ]);
});

test("clearRecent preserves profile while clearAll resets memory", () => {
  const harness = createMemoryHarness({
    profile: { preferences: ["music"] },
    summary: { conversation: "older summary" },
    recentMessages: [{ role: "user", content: "hello", createdAt: "2026-07-10T08:00:00.000Z" }],
  });
  const controller = createChatMemoryController({
    statePath: "memory.json",
    loadState: harness.loadState,
    saveState: harness.saveState,
    chat: async () => ({ success: true, content: "unused" }),
    summarize: async () => ({ success: true }),
    now: () => "2026-07-10T08:01:00.000Z",
  });

  const clearedRecent = controller.clearRecentMemory();
  assert.deepEqual(clearedRecent.profile.preferences, ["music"]);
  assert.deepEqual(clearedRecent.recentMessages, []);

  const clearedAll = controller.clearAllMemory();
  assert.deepEqual(clearedAll.profile.preferences, []);
  assert.equal(clearedAll.summary.conversation, "");
});

test("remembered context puts pinned entries ahead of ordinary entries and summary", async () => {
  const harness = createMemoryHarness({
    memories: [
      { id: "pinned", category: "fact", content: "User likes tea", pinned: true },
      { id: "ordinary", category: "preference", content: "Calm music", pinned: false },
    ],
    summary: { conversation: "Discussed work stress." },
    recentMessages: [{ role: "assistant", content: "Earlier reply" }],
  });
  const calls = [];
  const controller = createChatMemoryController({
    statePath: "memory.json",
    loadState: harness.loadState,
    saveState: harness.saveState,
    chat: async (messages) => {
      calls.push(messages);
      return { success: true, content: "Reply" };
    },
  });

  await controller.sendMessage({ mode: "remembered", text: "Question" });

  const context = calls[0][0].content;
  assert.ok(context.indexOf("Pinned memories") >= 0);
  assert.ok(context.indexOf("User likes tea") < context.indexOf("Calm music"));
  assert.ok(context.indexOf("Calm music") < context.indexOf("Discussed work stress."));
  assert.ok(calls[0].some((message) => message.content === "Earlier reply"));
});

test("compression adds proposed entries while preserving pinned entries", async () => {
  const harness = createMemoryHarness({
    memories: [{ id: "fixed", category: "fact", content: "Works remotely", pinned: true }],
    recentMessages: [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
      { role: "assistant", content: "four" },
    ],
  });
  const controller = createChatMemoryController({
    statePath: "memory.json",
    loadState: harness.loadState,
    saveState: harness.saveState,
    chat: async () => ({ success: true, content: "five" }),
    summarize: async () => ({
      success: true,
      summary: "short",
      memories: [
        { category: "fact", content: "Works remotely" },
        { category: "preference", content: "Likes piano" },
      ],
    }),
    recentMessageLimit: 4,
    preserveRecentMessageCount: 2,
  });

  const result = await controller.sendMessage({ mode: "remembered", text: "latest" });

  assert.equal(result.state.memories.find((memory) => memory.id === "fixed").pinned, true);
  assert.ok(result.state.memories.some((memory) => memory.content === "Likes piano"));
  assert.equal(result.memoryUpdated, true);
});

test("memory operations filter, edit, delete, and clear only the summary", () => {
  const harness = createMemoryHarness({
    memories: [
      { id: "tea", category: "preference", content: "tea", pinned: false },
      { id: "fact", category: "fact", content: "works remotely", pinned: true },
    ],
    summary: { conversation: "previous context" },
  });
  const controller = createChatMemoryController({
    statePath: "memory.json",
    loadState: harness.loadState,
    saveState: harness.saveState,
    chat: async () => ({ success: true, content: "unused" }),
    now: () => "2026-07-10T10:00:00.000Z",
  });

  assert.deepEqual(controller.listMemories({ query: "remote" }).map((memory) => memory.id), ["fact"]);
  const created = controller.createMemory({ category: "avoidance", content: "spoilers", pinned: true });
  assert.equal(created.success, true);
  const updated = controller.updateMemory({ id: "tea", content: "green tea", pinned: true });
  assert.equal(updated.memory.content, "green tea");
  assert.equal(updated.memory.pinned, true);
  assert.equal(controller.deleteMemory("tea").success, true);
  assert.deepEqual(controller.clearSummary().summary, { conversation: "", updatedAt: "" });
  assert.equal(controller.deleteMemory("missing").error, "memory-not-found");
});
