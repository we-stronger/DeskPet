const fs = require("node:fs");
const path = require("node:path");

// Default session-file path. Resolved lazily so we can ask Electron for
// the standard per-user data directory (which works both in dev and
// inside the packaged app.asar where the `__dirname/../../.runtime/...`
// path used to live is read-only).
function defaultSessionFile() {
  try {
    const electron = require("electron");
    if (electron && electron.app && typeof electron.app.getPath === "function") {
      return path.join(electron.app.getPath("userData"), "netease-session.json");
    }
  } catch (_error) {
    // Not running inside Electron (e.g. unit tests on a plain Node
    // process). Fall back to a tmpdir-style location so the file
    // operations still work without depending on app.asar.
  }
  return path.join(__dirname, "..", "..", ".runtime", "user-data", "netease-session.json");
}

function defaultSafeStorage() {
  try {
    const electron = require("electron");
    return electron && electron.safeStorage ? electron.safeStorage : null;
  } catch (_error) {
    return null;
  }
}

function createMusicSessionStore({ sessionFile = defaultSessionFile(), safeStorage = defaultSafeStorage(), fsImpl = fs } = {}) {
  function ensureDir() {
    fsImpl.mkdirSync(path.dirname(sessionFile), { recursive: true });
  }

  function encryptionAvailable() {
    return !!(safeStorage && typeof safeStorage.isEncryptionAvailable === "function" && safeStorage.isEncryptionAvailable());
  }

  function saveSession(sessionObj) {
    const cookie = sessionObj && typeof sessionObj.cookie === "string" ? sessionObj.cookie : "";
    if (!cookie) {
      return { success: false, error: "empty-cookie" };
    }
    if (!encryptionAvailable()) {
      return { success: false, error: "safe-storage-unavailable", persisted: false };
    }
    try {
      ensureDir();
      const raw = JSON.stringify({ cookie, savedAt: new Date().toISOString() });
      const encrypted = safeStorage.encryptString(raw);
      const payload = {
        version: 1,
        encrypted: true,
        encoding: "base64",
        payload: Buffer.from(encrypted).toString("base64"),
      };
      fsImpl.writeFileSync(sessionFile, JSON.stringify(payload, null, 2), "utf8");
      return { success: true, persisted: true };
    } catch (error) {
      return { success: false, error: (error && error.message) || "save-failed", persisted: false };
    }
  }

  function loadSession() {
    try {
      if (!fsImpl.existsSync(sessionFile)) return { success: false, error: "not-found" };
      const payload = JSON.parse(fsImpl.readFileSync(sessionFile, "utf8") || "{}");
      if (!payload || payload.encrypted !== true || typeof payload.payload !== "string") {
        return { success: false, error: "unsupported-session-format" };
      }
      if (!encryptionAvailable()) {
        return { success: false, error: "safe-storage-unavailable" };
      }
      const encrypted = Buffer.from(payload.payload, payload.encoding === "base64" ? "base64" : "utf8");
      const raw = safeStorage.decryptString(encrypted);
      const session = JSON.parse(raw || "{}");
      if (!session.cookie) return { success: false, error: "empty-cookie" };
      return { success: true, session };
    } catch (error) {
      return { success: false, error: (error && error.message) || "load-failed" };
    }
  }

  function clearSession() {
    try {
      if (fsImpl.existsSync(sessionFile)) fsImpl.unlinkSync(sessionFile);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error && error.message) || "clear-failed" };
    }
  }

  return {
    sessionFile,
    encryptionAvailable,
    saveSession,
    loadSession,
    clearSession,
  };
}

const defaultStore = createMusicSessionStore();

module.exports = {
  // Note: SESSION_FILE is now a lazy function. Tests still call
  // createMusicSessionStore directly with an explicit sessionFile
  // override, so removing the eager constant is safe.
  SESSION_FILE: defaultSessionFile(),
  createMusicSessionStore,
  saveSession: defaultStore.saveSession,
  loadSession: defaultStore.loadSession,
  clearSession: defaultStore.clearSession,
};