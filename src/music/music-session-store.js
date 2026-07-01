const fs = require("node:fs");
const path = require("node:path");

const SESSION_FILE = path.join(__dirname, "..", "..", ".runtime", "user-data", "netease-session.json");

function defaultSafeStorage() {
  try {
    const electron = require("electron");
    return electron && electron.safeStorage ? electron.safeStorage : null;
  } catch (_error) {
    return null;
  }
}

function createMusicSessionStore({ sessionFile = SESSION_FILE, safeStorage = defaultSafeStorage(), fsImpl = fs } = {}) {
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
  SESSION_FILE,
  createMusicSessionStore,
  saveSession: defaultStore.saveSession,
  loadSession: defaultStore.loadSession,
  clearSession: defaultStore.clearSession,
};