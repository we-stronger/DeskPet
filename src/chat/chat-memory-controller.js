const {
  clearAllChatMemory,
  clearChatSummary,
  clearRecentChatMemory,
  loadChatMemoryState,
  normalizeMemoryEntries,
  normalizeMemoryEntry,
  normalizeChatMemoryState,
  saveChatMemoryState,
} = require("./chat-memory-store");

const DEFAULT_CONTEXT_CHARACTER_LIMIT = 5200;
const DEFAULT_SUMMARY_CHARACTER_LIMIT = 1600;
const MEMORY_CATEGORY_LABELS = Object.freeze({
  preference: "Preferences",
  fact: "Facts",
  avoidance: "Avoid",
  relationship: "Relationship tone",
});

function normalizeChatMode(mode) {
  return mode === "temporary" ? "temporary" : "remembered";
}

function defaultNow() {
  return new Date().toISOString();
}

function totalMessageCharacters(messages) {
  if (!Array.isArray(messages)) {
    return 0;
  }
  return messages.reduce((sum, message) => sum + String(message && message.content ? message.content : "").length, 0);
}

function formatMemoryEntries(memories) {
  const lines = [];
  for (const category of ["relationship", "preference", "fact", "avoidance"]) {
    const content = memories
      .filter((memory) => memory.category === category)
      .map((memory) => memory.content);
    if (content.length) {
      lines.push(`${MEMORY_CATEGORY_LABELS[category]}: ${content.join(", ")}`);
    }
  }
  return lines;
}

function buildMemorySystemMessage(state, { includeOrdinary = true, includeSummary = true } = {}) {
  const lines = [];
  if (state.profile.displayName) {
    lines.push(`User display name: ${state.profile.displayName}`);
  }
  const memories = Array.isArray(state.memories) ? state.memories : [];
  const pinned = memories.filter((memory) => memory.pinned);
  const ordinary = memories.filter((memory) => !memory.pinned);
  if (pinned.length) {
    lines.push("Pinned memories:");
    lines.push(...formatMemoryEntries(pinned));
  }
  if (includeOrdinary) {
    lines.push(...formatMemoryEntries(ordinary));
  }
  if (includeSummary && state.summary.conversation) {
    lines.push(`Summary: ${state.summary.conversation}`);
  }
  if (!lines.length) {
    return "";
  }
  return `Long-term memory:\n${lines.join("\n")}`;
}

function normalizeContextCharacterLimit(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 256
    ? Math.round(numeric)
    : DEFAULT_CONTEXT_CHARACTER_LIMIT;
}

function totalContextCharacters(messages) {
  return messages.reduce((sum, message) => sum + String(message.content || "").length, 0);
}

function buildRememberedMessages({ systemPrompt, state, text, characterLimit } = {}) {
  const normalized = normalizeChatMemoryState(state);
  const limit = normalizeContextCharacterLimit(characterLimit);
  const leading = [];
  if (systemPrompt) {
    leading.push({ role: "system", content: String(systemPrompt) });
  }
  const currentMessage = { role: "user", content: text };
  const fullMemory = buildMemorySystemMessage(normalized);
  const pinnedMemory = buildMemorySystemMessage(normalized, {
    includeOrdinary: false,
    includeSummary: false,
  });
  const baseCharacters = totalContextCharacters([...leading, currentMessage]);
  let memoryMessage = "";
  if (fullMemory && baseCharacters + fullMemory.length <= limit) {
    memoryMessage = fullMemory;
  } else if (pinnedMemory && baseCharacters + pinnedMemory.length <= limit) {
    memoryMessage = pinnedMemory;
  }
  const messages = [...leading];
  if (memoryMessage) {
    messages.push({ role: "system", content: memoryMessage });
  }

  const recent = normalizeConversationMessages(normalized.recentMessages);
  const selectedRecent = [];
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const candidate = recent[index];
    const candidateCharacters = totalContextCharacters([...messages, ...selectedRecent, candidate, currentMessage]);
    if (candidateCharacters > limit) break;
    selectedRecent.unshift(candidate);
  }
  messages.push(...selectedRecent, currentMessage);
  return messages;
}

function memoryKey(memory) {
  return `${memory.category}:${memory.content.toLocaleLowerCase()}`;
}

function mergeMemoryEntries(current, proposed, now = defaultNow) {
  const merged = Array.isArray(current) ? current.map((memory) => ({ ...memory })) : [];
  for (const candidate of normalizeMemoryEntries(proposed)) {
    const match = merged.find((memory) => memoryKey(memory) === memoryKey(candidate));
    if (match) {
      match.updatedAt = now();
      continue;
    }
    merged.push({
      ...candidate,
      pinned: false,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  return normalizeMemoryEntries(merged);
}

function filterMemoryEntries(memories, { query = "", category = "" } = {}) {
  const needle = String(query || "").trim().toLocaleLowerCase();
  return (Array.isArray(memories) ? memories : []).filter((memory) => (
    (!category || memory.category === category)
    && (!needle || memory.content.toLocaleLowerCase().includes(needle))
  ));
}

function normalizeConversationMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .filter((message) => typeof message.content === "string" && message.content)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function fallbackSummaryText(messages, existingSummary) {
  const flattened = normalizeConversationMessages(messages)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  const parts = [];
  if (existingSummary) {
    parts.push(existingSummary);
  }
  if (flattened) {
    parts.push(flattened);
  }
  return parts.join("\n").trim().slice(-DEFAULT_SUMMARY_CHARACTER_LIMIT);
}

function createChatMemoryController({
  statePath,
  systemPrompt = "",
  loadState = loadChatMemoryState,
  saveState = saveChatMemoryState,
  chat,
  summarize,
  now = defaultNow,
  recentMessageLimit = 12,
  recentCharacterLimit = 2400,
  preserveRecentMessageCount = 6,
  contextCharacterLimit = DEFAULT_CONTEXT_CHARACTER_LIMIT,
} = {}) {
  if (typeof chat !== "function") {
    throw new Error("chat-function-required");
  }

  function currentSystemPrompt() {
    return typeof systemPrompt === "function" ? String(systemPrompt() || "") : String(systemPrompt || "");
  }

  function readState() {
    return normalizeChatMemoryState(loadState(statePath));
  }

  function writeState(state) {
    return normalizeChatMemoryState(saveState(statePath, state));
  }

  function getState() {
    return readState();
  }

  function getMemorySummary() {
    const state = readState();
    return {
      profile: state.profile,
      memories: state.memories,
      summary: state.summary,
      stats: state.stats,
    };
  }

  function setMode(mode) {
    return { success: true, mode: normalizeChatMode(mode) };
  }

  async function compressStateIfNeeded(state) {
    const normalized = normalizeChatMemoryState(state);
    const shouldCompress = normalized.recentMessages.length > recentMessageLimit
      || totalMessageCharacters(normalized.recentMessages) > recentCharacterLimit;
    if (!shouldCompress) {
      return { state: normalized, memoryUpdated: false };
    }

    const keepCount = Math.max(0, preserveRecentMessageCount + 1);
    const splitIndex = Math.max(0, normalized.recentMessages.length - keepCount);
    const toCompress = normalized.recentMessages.slice(0, splitIndex);
    const summarySourceMessages = normalized.recentMessages.slice(
      0,
      Math.min(normalized.recentMessages.length, splitIndex + 1),
    );
    const preserved = normalized.recentMessages.slice(splitIndex);
    if (!toCompress.length) {
      return { state: normalized, memoryUpdated: false };
    }

    let nextSummary = normalized.summary.conversation;
    let nextProfile = normalized.profile;
    let nextMemories = normalized.memories;
    let memoryUpdated = false;
    try {
      if (typeof summarize === "function") {
        const result = await summarize({
          messages: summarySourceMessages,
          summary: normalized.summary.conversation,
          profile: normalized.profile,
          memories: normalized.memories,
        });
        if (result && result.success) {
          if (typeof result.summary === "string" && result.summary.trim()) {
            nextSummary = result.summary.trim();
          }
          if (result.profile && typeof result.profile === "object") {
            nextProfile = {
              ...normalized.profile,
              ...normalizeChatMemoryState({ profile: result.profile }).profile,
            };
          }
          const proposedMemories = Array.isArray(result.memories)
            ? result.memories
            : normalizeMemoryEntries(undefined, result.profile);
          if (proposedMemories.length) {
            nextMemories = mergeMemoryEntries(normalized.memories, proposedMemories, now);
            memoryUpdated = nextMemories.some((memory) => !normalized.memories.some(
              (existing) => existing.id === memory.id && existing.updatedAt === memory.updatedAt,
            ));
          }
        } else {
          nextSummary = fallbackSummaryText(summarySourceMessages, normalized.summary.conversation);
        }
      } else {
        nextSummary = fallbackSummaryText(summarySourceMessages, normalized.summary.conversation);
      }
    } catch (_error) {
      nextSummary = fallbackSummaryText(summarySourceMessages, normalized.summary.conversation);
    }

    return {
      state: normalizeChatMemoryState({
      ...normalized,
      profile: nextProfile,
      memories: nextMemories,
      summary: {
        conversation: nextSummary.slice(-DEFAULT_SUMMARY_CHARACTER_LIMIT),
        updatedAt: now(),
      },
      recentMessages: preserved,
      stats: {
        compressCount: normalized.stats.compressCount + 1,
        lastCompressedAt: now(),
      },
      }),
      memoryUpdated,
    };
  }

  async function sendRememberedMessage(text) {
    const state = readState();
    const activeSystemPrompt = currentSystemPrompt();
    const messages = buildRememberedMessages({
      systemPrompt: activeSystemPrompt,
      state,
      text,
      characterLimit: contextCharacterLimit,
    });

    const reply = await chat(messages);
    if (!(reply && reply.success && typeof reply.content === "string")) {
      return { ...(reply || { success: false, error: "chat-failed" }), state };
    }

    let nextState = normalizeChatMemoryState({
      ...state,
      recentMessages: [
        ...state.recentMessages,
        { role: "user", content: text, createdAt: now() },
        { role: "assistant", content: reply.content, createdAt: now() },
      ],
    });
    const compressed = await compressStateIfNeeded(nextState);
    const savedState = writeState(compressed.state);
    return {
      success: true,
      mode: "remembered",
      content: reply.content,
      memoryUpdated: compressed.memoryUpdated,
      state: savedState,
    };
  }

  async function sendTemporaryMessage(text, temporaryMessages) {
    const messages = [];
    const activeSystemPrompt = currentSystemPrompt();
    if (activeSystemPrompt) {
      messages.push({ role: "system", content: activeSystemPrompt });
    }
    messages.push(...normalizeConversationMessages(temporaryMessages));
    messages.push({ role: "user", content: text });
    const reply = await chat(messages);
    if (!(reply && reply.success && typeof reply.content === "string")) {
      return { ...(reply || { success: false, error: "chat-failed" }), state: null };
    }
    return {
      success: true,
      mode: "temporary",
      content: reply.content,
      state: null,
    };
  }

  async function sendMessage({ mode, text, temporaryMessages } = {}) {
    const normalizedText = typeof text === "string" ? text.trim() : "";
    if (!normalizedText) {
      return { success: false, error: "empty-text", state: normalizeChatMode(mode) === "remembered" ? readState() : null };
    }
    if (normalizeChatMode(mode) === "temporary") {
      return sendTemporaryMessage(normalizedText, temporaryMessages);
    }
    return sendRememberedMessage(normalizedText);
  }

  function clearRecentMemory() {
    return writeState(clearRecentChatMemory(readState()));
  }

  function clearAllMemory() {
    return writeState(clearAllChatMemory());
  }

  function clearSummary() {
    return writeState(clearChatSummary(readState()));
  }

  function listMemories(options) {
    return filterMemoryEntries(readState().memories, options);
  }

  function createMemory({ category, content, pinned } = {}) {
    const state = readState();
    const candidate = normalizeMemoryEntry({
      category,
      content,
      pinned,
      createdAt: now(),
      updatedAt: now(),
    }, state.memories.length);
    if (!candidate) {
      return { success: false, error: "invalid-memory" };
    }
    const nextState = writeState({
      ...state,
      memories: [...state.memories, candidate],
    });
    return {
      success: true,
      state: nextState,
      memory: nextState.memories.find((memory) => memory.id === candidate.id) || candidate,
    };
  }

  function updateMemory({ id, category, content, pinned } = {}) {
    const state = readState();
    const index = state.memories.findIndex((memory) => memory.id === id);
    if (index < 0) {
      return { success: false, error: "memory-not-found" };
    }
    const current = state.memories[index];
    const candidate = normalizeMemoryEntry({
      ...current,
      category: category === undefined ? current.category : category,
      content: content === undefined ? current.content : content,
      pinned: pinned === undefined ? current.pinned : pinned,
      updatedAt: now(),
    }, index);
    if (!candidate) {
      return { success: false, error: "invalid-memory" };
    }
    const nextState = writeState({
      ...state,
      memories: state.memories.map((memory, memoryIndex) => (memoryIndex === index ? candidate : memory)),
    });
    return {
      success: true,
      state: nextState,
      memory: nextState.memories.find((memory) => memory.id === candidate.id) || candidate,
    };
  }

  function deleteMemory(id) {
    const state = readState();
    if (!state.memories.some((memory) => memory.id === id)) {
      return { success: false, error: "memory-not-found" };
    }
    return {
      success: true,
      state: writeState({
        ...state,
        memories: state.memories.filter((memory) => memory.id !== id),
      }),
    };
  }

  return {
    clearAllMemory,
    clearSummary,
    clearRecentMemory,
    createMemory,
    deleteMemory,
    getMemorySummary,
    getState,
    listMemories,
    sendMessage,
    setMode,
    updateMemory,
  };
}

module.exports = {
  buildMemorySystemMessage,
  buildRememberedMessages,
  createChatMemoryController,
  filterMemoryEntries,
  formatMemoryEntries,
  mergeMemoryEntries,
  normalizeChatMode,
};
