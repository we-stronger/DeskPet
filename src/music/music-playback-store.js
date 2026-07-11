const fs = require("node:fs");
const path = require("node:path");

const HISTORY_MAX = 100;
const PLAYBACK_MODES = new Set(["sequence", "shuffle", "repeat-one", "heartbeat"]);

function normalizeItem(item, { history = false } = {}) {
  if (!item || (typeof item.id !== "string" && typeof item.id !== "number")) return null;
  const id = String(item.id).trim();
  if (!id) return null;
  const normalized = {
    id,
    title: typeof item.title === "string" ? item.title : "",
    artist: typeof item.artist === "string" ? item.artist : "",
    playlistId: item.playlistId == null ? "" : String(item.playlistId),
  };
  if (history) {
    normalized.playedAt = typeof item.playedAt === "string" ? item.playedAt : "";
  }
  return normalized;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const seen = new Set();
  const result = [];
  for (const entry of history) {
    const item = normalizeItem(entry, { history: true });
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
    if (result.length >= HISTORY_MAX) break;
  }
  return result;
}

function normalizePlaybackState(state = {}) {
  const source = state && typeof state === "object" ? state : {};
  const queue = Array.isArray(source.queue)
    ? source.queue.map((item) => normalizeItem(item)).filter(Boolean)
    : [];
  const requestedIndex = Number(source.currentIndex);
  const currentIndex = queue.length
    ? Math.max(0, Math.min(queue.length - 1, Number.isInteger(requestedIndex) ? requestedIndex : 0))
    : -1;
  return {
    mode: PLAYBACK_MODES.has(source.mode) ? source.mode : "sequence",
    queue,
    currentIndex,
    history: normalizeHistory(source.history),
  };
}

function loadPlaybackState(filePath) {
  try {
    return normalizePlaybackState(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT" && error.name !== "SyntaxError") throw error;
    return normalizePlaybackState();
  }
}

function savePlaybackState(filePath, state) {
  const normalized = normalizePlaybackState(state);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
  return normalized;
}

function removeHistoryEntry(state, songId) {
  const normalized = normalizePlaybackState(state);
  const id = String(songId == null ? "" : songId);
  return {
    ...normalized,
    history: normalized.history.filter((item) => item.id !== id),
  };
}

function clearHistory(state) {
  return {
    ...normalizePlaybackState(state),
    history: [],
  };
}

function mergePlaybackStateForPersistence(currentState, nextState) {
  const current = normalizePlaybackState(currentState);
  const next = normalizePlaybackState(nextState);
  if (current.history.length && !next.history.length) {
    return {
      ...next,
      history: current.history,
    };
  }
  return next;
}

module.exports = {
  HISTORY_MAX,
  clearHistory,
  loadPlaybackState,
  mergePlaybackStateForPersistence,
  normalizePlaybackState,
  removeHistoryEntry,
  savePlaybackState,
};
