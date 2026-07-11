const { shell } = require("electron");
const { buildSongWebUrl } = require("../netease-search");
const neteaseClient = require("./netease-client");
const neteaseAuth = require("./netease-auth");
const defaultSessionStore = require("./music-session-store");

function createMusicController({
  client = neteaseClient,
  auth = neteaseAuth,
  sessionStore = defaultSessionStore,
  shellApi = shell,
  sessionCookieProvider = null,
} = {}) {
  let memorySession = null;
  let cachedProfile = null;

  function sessionFromStore() {
    if (memorySession && memorySession.cookie) return { success: true, session: memorySession, persisted: false };
    const loaded = typeof sessionStore.loadSession === "function" ? sessionStore.loadSession() : null;
    if (loaded && loaded.success && loaded.session && loaded.session.cookie) {
      memorySession = loaded.session;
      return { success: true, session: memorySession, persisted: true };
    }
    return { success: false, error: (loaded && loaded.error) || "not-logged-in" };
  }

  function currentCookie() {
    const loaded = sessionFromStore();
    return loaded.success ? loaded.session.cookie : "";
  }

  async function currentWriteCookie() {
    if (typeof sessionCookieProvider !== "function") return currentCookie();
    try {
      const cookie = await sessionCookieProvider();
      if (typeof cookie !== "string" || !/(?:^|;\s*)(?:MUSIC_U|__MUSIC_U|MUSIC_A)=/.test(cookie)) {
        return currentCookie();
      }
      if (cookie !== currentCookie()) {
        memorySession = { cookie };
        if (sessionStore && typeof sessionStore.saveSession === "function") {
          sessionStore.saveSession(memorySession);
        }
      }
      return cookie;
    } catch (_error) {
      return currentCookie();
    }
  }

  function clearLocalSession() {
    memorySession = null;
    cachedProfile = null;
    if (sessionStore && typeof sessionStore.clearSession === "function") {
      return sessionStore.clearSession();
    }
    return { success: true };
  }

  async function searchMusic({ keyword, query, limit } = {}) {
    const term = typeof keyword === "string" ? keyword : query;
    return client.search(term, { limit: Number.isFinite(Number(limit)) ? Number(limit) : 20, cookie: currentCookie() });
  }

  async function getProfile() {
    const cookie = currentCookie();
    if (!cookie) return { success: false, error: "not-logged-in" };
    const result = await client.getProfile(cookie);
    if (result && result.success) {
      cachedProfile = result.profile;
      return result;
    }
    if (result && result.error === "session-expired") {
      clearLocalSession();
    }
    return result || { success: false, error: "profile-failed" };
  }

  async function getUserPlaylists({ userId } = {}) {
    let uid = userId;
    if (!uid) {
      const profile = cachedProfile ? { success: true, profile: cachedProfile } : await getProfile();
      if (!profile.success) return { success: false, error: profile.error || "not-logged-in", playlists: [] };
      uid = profile.profile && profile.profile.userId;
    }
    const cookie = currentCookie();
    if (!cookie) return { success: false, error: "not-logged-in", playlists: [] };
    const result = await client.getUserPlaylists(uid, { cookie });
    if (result && result.error === "session-expired") clearLocalSession();
    return result;
  }

  async function getPlaylistDetail({ playlistId } = {}) {
    const cookie = currentCookie();
    if (!cookie) return { success: false, error: "not-logged-in" };
    const result = await client.getPlaylistDetail(playlistId, { cookie });
    if (result && result.error === "session-expired") clearLocalSession();
    return result;
  }

  async function getDailyRecommend() {
    const cookie = currentCookie();
    if (!cookie) return { success: false, error: "not-logged-in", songs: [] };
    const result = await client.getDailyRecommend({ cookie });
    if (result && result.error === "session-expired") clearLocalSession();
    return result;
  }

  async function getTopCharts() {
    // Top charts are public; no login required. We still pass whatever
    // cookie the user has so NetEase can return localized chart data.
    return client.getTopCharts({ cookie: currentCookie() });
  }

  async function getLyric(songId) {
    return client.getLyric(songId, { cookie: currentCookie() });
  }

  async function fetchSongUrl(songId) {
    return client.fetchSongUrl(songId, { cookie: currentCookie() });
  }

  async function getFmSong() {
    const cookie = currentCookie();
    if (!cookie) return { success: false, error: "not-logged-in" };
    const result = await client.getFmSong({ cookie });
    if (result && result.error === "session-expired") clearLocalSession();
    return result;
  }

  async function manipulatePlaylistTracks({ op, playlistId, songIds } = {}) {
    const cookie = await currentWriteCookie();
    if (!cookie) return { success: false, error: "not-logged-in" };
    const result = await client.manipulatePlaylistTracks({ op, playlistId, songIds, cookie });
    if (result && result.error === "session-expired") clearLocalSession();
    return result;
  }

  async function likeSong(songId, like = true) {
    const cookie = await currentWriteCookie();
    if (!cookie) return { success: false, error: "not-logged-in" };
    let profile = cachedProfile;
    if (!profile && typeof client.getProfile === "function") {
      const profileResult = await client.getProfile(cookie);
      if (profileResult && profileResult.success) {
        profile = profileResult.profile;
        cachedProfile = profile;
      }
    }
    const result = await client.likeSong(songId, like, {
      cookie,
      userId: profile && profile.userId,
    });
    if (result && result.success) return result;
    if (result && result.error === "session-expired") clearLocalSession();
    if (typeof client.getUserPlaylists !== "function"
      || typeof client.manipulatePlaylistTracks !== "function") {
      return result;
    }
    const userId = profile && profile.userId;
    if (userId === undefined || userId === null || userId === "") return result;
    const playlistsResult = await client.getUserPlaylists(userId, { cookie });
    const likedPlaylist = playlistsResult && Array.isArray(playlistsResult.playlists)
      ? playlistsResult.playlists.find((playlist) => Number(playlist.specialType) === 5)
      : null;
    if (!likedPlaylist) return result;
    const fallback = await client.manipulatePlaylistTracks({
      op: like === false ? "del" : "add",
      playlistId: likedPlaylist.id,
      songIds: [songId],
      cookie,
    });
    return fallback && fallback.success
      ? { ...fallback, songId, like: like !== false, method: "liked-playlist-fallback" }
      : (fallback || result);
  }

  async function checkLikedSongs(songIds) {
    const cookie = currentCookie();
    if (!cookie) return { success: false, error: "not-logged-in", liked: {} };
    if (typeof client.checkLikedSongs !== "function") {
      return { success: false, error: "unsupported", liked: {} };
    }
    const result = await client.checkLikedSongs(songIds, { cookie });
    if (result && result.error === "session-expired") clearLocalSession();
    return result;
  }

  async function getIntelligenceList({ songId, playlistId, startSongId, count } = {}) {
    const cookie = currentCookie();
    if (!cookie) return { success: false, error: "not-logged-in", songs: [] };
    const payload = { songId, playlistId, count, cookie };
    if (startSongId !== undefined && startSongId !== null && startSongId !== "") {
      payload.startSongId = startSongId;
    }
    const result = await client.getIntelligenceList(payload);
    if (result && result.error === "session-expired") clearLocalSession();
    return result;
  }

  async function trashFmSong(songId) {
    const cookie = currentCookie();
    if (!cookie) return { success: false, error: "not-logged-in" };
    const result = await client.trashFmSong(songId, { cookie });
    if (result && result.error === "session-expired") clearLocalSession();
    return result;
  }

  async function createQrKey() {
    return auth.createQrKey();
  }

  async function createQrImage({ key } = {}) {
    return auth.createQrImage(key);
  }

  async function checkQrStatus({ key } = {}) {
    const result = await auth.checkQrStatus(key);
    if (!result || !result.success || result.status !== "ok") return result;
    if (!result.cookie) return { ...result, success: false, error: "missing-cookie" };
    memorySession = { cookie: result.cookie };
    cachedProfile = null;
    const saved = sessionStore && typeof sessionStore.saveSession === "function"
      ? sessionStore.saveSession(memorySession)
      : { success: false, error: "session-store-unavailable" };
    return {
      ...result,
      persisted: !!(saved && saved.success),
      warning: saved && saved.success ? null : ((saved && saved.error) || "session-not-persisted"),
    };
  }

  async function openSong({ id } = {}) {
    if (id === undefined || id === null || id === "") return { success: false, error: "empty-id" };
    const url = buildSongWebUrl(id);
    try {
      await shellApi.openExternal(url);
      return { success: true, method: "web", target: url, songId: id };
    } catch (error) {
      return { success: false, error: (error && error.message) || "open-failed", target: url, songId: id };
    }
  }

  // Receive a cookie string captured from the web-login popup window and
  // persist it through the same session-store path the legacy QR flow used.
  // Mirrors the side effects checkQrStatus performed on success.
  function acceptWebLoginCookie(cookieString) {
    if (typeof cookieString !== "string" || !cookieString) {
      return { success: false, error: "empty-cookie" };
    }
    memorySession = { cookie: cookieString };
    cachedProfile = null;
    const saved = sessionStore && typeof sessionStore.saveSession === "function"
      ? sessionStore.saveSession(memorySession)
      : { success: false, error: "session-store-unavailable" };
    return {
      success: true,
      cookie: cookieString,
      persisted: !!(saved && saved.success),
      warning: saved && saved.success ? null : ((saved && saved.error) || "session-not-persisted"),
    };
  }

  async function logout() {
    return clearLocalSession();
  }

  function getSessionStatus() {
    const loaded = sessionFromStore();
    if (!loaded.success) return { success: true, loggedIn: false, error: loaded.error };
    return { success: true, loggedIn: true, persisted: loaded.persisted !== false };
  }

  return {
    searchMusic,
    getProfile,
    getUserPlaylists,
    getPlaylistDetail,
    getDailyRecommend,
    getTopCharts,
    getLyric,
    fetchSongUrl,
    getFmSong,
    manipulatePlaylistTracks,
    likeSong,
    checkLikedSongs,
    getIntelligenceList,
    trashFmSong,
    createQrKey,
    createQrImage,
    checkQrStatus,
    acceptWebLoginCookie,
    openSong,
    logout,
    getSessionStatus,
  };
}

module.exports = {
  createMusicController,
};
