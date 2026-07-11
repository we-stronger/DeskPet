const fs = require("node:fs");
const path = require("node:path");

const MAX_RECENT_MESSAGES = 24;
const MAX_LIST_ITEMS = 32;
const MEMORY_CATEGORIES = new Set(["preference", "fact", "avoidance", "relationship"]);
const MAX_MEMORY_ITEMS = 64;
const MAX_MEMORY_CONTENT_LENGTH = 280;
const MAX_SUMMARY_LENGTH = 1600;

const defaultChatMemoryState = Object.freeze({
  version: 2,
  profile: Object.freeze({
    displayName: "",
    relationshipTone: "",
    preferences: Object.freeze([]),
    facts: Object.freeze([]),
    avoidances: Object.freeze([]),
  }),
  summary: Object.freeze({
    conversation: "",
    updatedAt: "",
  }),
  recentMessages: Object.freeze([]),
  memories: Object.freeze([]),
  stats: Object.freeze({
    compressCount: 0,
    lastCompressedAt: "",
  }),
});

function normalizeIsoString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
    if (normalized.length >= MAX_LIST_ITEMS) break;
  }
  return normalized;
}

function normalizeProfile(profile = {}) {
  if (!profile || typeof profile !== "object") {
    return { ...defaultChatMemoryState.profile };
  }
  return {
    displayName: typeof profile.displayName === "string" ? profile.displayName.trim() : "",
    relationshipTone: typeof profile.relationshipTone === "string" ? profile.relationshipTone.trim() : "",
    preferences: normalizeStringList(profile.preferences),
    facts: normalizeStringList(profile.facts),
    avoidances: normalizeStringList(profile.avoidances),
  };
}

function normalizeSummary(summary = {}) {
  if (!summary || typeof summary !== "object") {
    return { ...defaultChatMemoryState.summary };
  }
  return {
    conversation: typeof summary.conversation === "string"
      ? summary.conversation.slice(-MAX_SUMMARY_LENGTH)
      : "",
    updatedAt: normalizeIsoString(summary.updatedAt),
  };
}

function createMemoryId(index = 0) {
  return `memory-${Date.now().toString(36)}-${index}`;
}

function normalizeMemoryEntry(entry, index = 0) {
  if (!entry || typeof entry !== "object" || !MEMORY_CATEGORIES.has(entry.category)) {
    return null;
  }
  const content = typeof entry.content === "string"
    ? entry.content.trim().slice(0, MAX_MEMORY_CONTENT_LENGTH)
    : "";
  if (!content) {
    return null;
  }
  return {
    id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : createMemoryId(index),
    category: entry.category,
    content,
    pinned: entry.pinned === true,
    createdAt: normalizeIsoString(entry.createdAt),
    updatedAt: normalizeIsoString(entry.updatedAt),
  };
}

function legacyProfileMemoryEntries(profile) {
  const normalized = normalizeProfile(profile);
  return [
    ...(normalized.relationshipTone ? [{ category: "relationship", content: normalized.relationshipTone }] : []),
    ...normalized.preferences.map((content) => ({ category: "preference", content })),
    ...normalized.facts.map((content) => ({ category: "fact", content })),
    ...normalized.avoidances.map((content) => ({ category: "avoidance", content })),
  ];
}

function normalizeMemoryEntries(entries, legacyProfile = {}) {
  const source = Array.isArray(entries) ? entries : legacyProfileMemoryEntries(legacyProfile);
  const seen = new Set();
  const normalized = [];
  for (let index = 0; index < source.length; index += 1) {
    const memory = normalizeMemoryEntry(source[index], index);
    if (!memory) continue;
    const key = `${memory.category}:${memory.content.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(memory);
    if (normalized.length >= MAX_MEMORY_ITEMS) break;
  }
  return normalized;
}

function buildProfileFromMemories(memories, fallbackProfile = {}) {
  const fallback = normalizeProfile(fallbackProfile);
  const normalized = Array.isArray(memories) ? memories : [];
  const contentsFor = (category) => normalized
    .filter((memory) => memory.category === category)
    .map((memory) => memory.content);
  return {
    displayName: fallback.displayName,
    relationshipTone: contentsFor("relationship")[0] || "",
    preferences: contentsFor("preference"),
    facts: contentsFor("fact"),
    avoidances: contentsFor("avoidance"),
  };
}

function normalizeRecentMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }
  if (typeof message.content !== "string" || !message.content) {
    return null;
  }
  return {
    role: message.role,
    content: message.content,
    createdAt: normalizeIsoString(message.createdAt),
  };
}

function normalizeRecentMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .map(normalizeRecentMessage)
    .filter(Boolean)
    .slice(-MAX_RECENT_MESSAGES);
}

function normalizeStats(stats = {}) {
  if (!stats || typeof stats !== "object") {
    return { ...defaultChatMemoryState.stats };
  }
  const compressCount = Number(stats.compressCount);
  return {
    compressCount: Number.isFinite(compressCount) && compressCount >= 0
      ? Math.round(compressCount)
      : 0,
    lastCompressedAt: normalizeIsoString(stats.lastCompressedAt),
  };
}

function normalizeChatMemoryState(state = {}) {
  if (!state || typeof state !== "object") {
    return {
      version: 2,
      profile: { ...defaultChatMemoryState.profile },
      summary: { ...defaultChatMemoryState.summary },
      recentMessages: [],
      memories: [],
      stats: { ...defaultChatMemoryState.stats },
    };
  }
  const memories = normalizeMemoryEntries(state.memories, state.profile);
  return {
    version: 2,
    profile: buildProfileFromMemories(memories, state.profile),
    summary: normalizeSummary(state.summary),
    recentMessages: normalizeRecentMessages(state.recentMessages),
    memories,
    stats: normalizeStats(state.stats),
  };
}

function loadChatMemoryState(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return normalizeChatMemoryState(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT" && error.name !== "SyntaxError") {
      throw error;
    }
    return normalizeChatMemoryState();
  }
}

function saveChatMemoryState(filePath, state) {
  const normalized = normalizeChatMemoryState(state);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
  return normalized;
}

function clearRecentChatMemory(state) {
  const normalized = normalizeChatMemoryState(state);
  return {
    ...normalized,
    recentMessages: [],
  };
}

function clearChatSummary(state) {
  return normalizeChatMemoryState({
    ...state,
    summary: { conversation: "", updatedAt: "" },
  });
}

function clearAllChatMemory() {
  return normalizeChatMemoryState();
}

module.exports = {
  MEMORY_CATEGORIES,
  buildProfileFromMemories,
  clearAllChatMemory,
  clearChatSummary,
  clearRecentChatMemory,
  createMemoryId,
  defaultChatMemoryState,
  loadChatMemoryState,
  normalizeMemoryEntries,
  normalizeMemoryEntry,
  normalizeChatMemoryState,
  saveChatMemoryState,
};
