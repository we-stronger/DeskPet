const https = require("node:https");
const { URLSearchParams } = require("node:url");

const API_BASE = "https://music.163.com";
const REQUEST_TIMEOUT_MS = 8000;

function normalizeArtistList(raw) {
  const list = Array.isArray(raw && raw.ar) ? raw.ar : Array.isArray(raw && raw.artists) ? raw.artists : [];
  return list.map((item) => (item && typeof item.name === "string" ? item.name.trim() : "")).filter(Boolean);
}

function normalizeSong(raw, privilege) {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.id;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if ((typeof id !== "number" && typeof id !== "string") || !name) return null;
  const albumObj = raw.al || raw.album || {};
  const duration = Number.isFinite(raw.dt) ? raw.dt : Number.isFinite(raw.duration) ? raw.duration : null;
  const fee = privilege && Number.isFinite(privilege.fee) ? privilege.fee : raw.fee;
  const playable = !(privilege && privilege.st < 0) && fee !== 4;
  return {
    id,
    name,
    artists: normalizeArtistList(raw),
    album: typeof albumObj.name === "string" ? albumObj.name.trim() : "",
    duration,
    playable,
  };
}

function normalizePlaylist(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.id;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if ((typeof id !== "number" && typeof id !== "string") || !name) return null;
  return {
    id,
    name,
    trackCount: Number.isFinite(raw.trackCount) ? raw.trackCount : 0,
    coverImgUrl: typeof raw.coverImgUrl === "string" ? raw.coverImgUrl : "",
    creator: raw.creator && typeof raw.creator.nickname === "string" ? raw.creator.nickname : "",
  };
}

// NetEase's /api/nuser/account/get response shape has shifted over time —
// current responses put the user id in `profile.userId` (or `account.id`
// as a duplicate) and the display name in `profile.nickname`, but the
// field can be missing from `profile` while still being present in
// `account`. The legacy shape also wrapped everything in a `data` field.
// This helper accepts all three layouts and falls back to whichever
// source has the data, so a partial response (e.g. account only, no
// profile) still produces a usable profile object.
function normalizeProfile(raw) {
  if (!raw || typeof raw !== "object") return null;
  // Unwrap a `data: {...}` wrapper if the response is in that shape.
  const body = raw.data && typeof raw.data === "object" ? raw.data : raw;
  const profileObj = body.profile && typeof body.profile === "object" ? body.profile : body;
  const accountObj = body.account && typeof body.account === "object" ? body.account : null;
  // userId can come from profile.userId, account.id, or account.userId.
  const candidates = [
    profileObj && profileObj.userId,
    accountObj && accountObj.id,
    accountObj && accountObj.userId,
  ];
  const userId = candidates.find((v) => typeof v === "number" || typeof v === "string");
  if (userId === undefined) return null;
  const nickname = (profileObj && profileObj.nickname)
    || (accountObj && (accountObj.userName || accountObj.nickname))
    || "网易云用户";
  const avatarUrl = (profileObj && profileObj.avatarUrl) || "";
  return { userId, nickname, avatarUrl };
}

function cookieHeaders(cookie) {
  const headers = {
    "User-Agent": "Mozilla/5.0",
    Referer: "https://music.163.com/",
  };
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function requestJson({ method = "GET", path, body = "", cookie, request = defaultRequest } = {}) {
  return request({ method, path, body, headers: cookieHeaders(cookie), timeoutMs: REQUEST_TIMEOUT_MS });
}

function defaultRequest({ method, path, body, headers, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const bodyBuf = body ? Buffer.from(body, "utf8") : null;
    const req = https.request({
      method,
      hostname: "music.163.com",
      path,
      port: 443,
      headers: {
        ...headers,
        ...(bodyBuf ? {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": bodyBuf.length,
        } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, json: JSON.parse(text), body: text });
        } catch (_error) {
          // Non-JSON body (HTML redirect, blank page, etc.). Surface the
          // status + first 200 chars so we can see WHAT NetEase actually
          // returned when shape parsing fails downstream.
          console.warn(`[netease-client] non-json response status=${res.statusCode} path=${path} preview=${JSON.stringify(text.slice(0, 200))}`);
          resolve({ statusCode: res.statusCode, headers: res.headers, json: null, body: text });
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request-timeout")));
    req.on("error", reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

function mapApiError(json, label = "netease") {
  if (json && (json.code === 301 || json.code === 302)) return "session-expired";
  if (json && json.code && json.code !== 200) return `api-${json.code}`;
  // Surface the actual shape in the main-process log so we can diagnose
  // "unexpected-shape" reports without round-tripping the user. We log
  // top-level keys (no values) and the response code so we don't leak
  // cookies or playlist contents into a log file.
  const keys = json && typeof json === "object" ? Object.keys(json) : [];
  const code = json && json.code;
  console.warn(`[netease-client] ${label} unexpected-shape code=${code} keys=${keys.join(",")}`);
  return "unexpected-shape";
}

async function search(keyword, { limit = 20, cookie, request } = {}) {
  if (typeof keyword !== "string" || !keyword.trim()) {
    return { success: false, error: "empty-keyword", songs: [] };
  }
  const body = new URLSearchParams({ s: keyword.trim(), type: "1", limit: String(limit || 20) }).toString();
  try {
    const res = await requestJson({ method: "POST", path: "/api/search/get", body, cookie, request });
    const songs = res.json && res.json.result && Array.isArray(res.json.result.songs)
      ? res.json.result.songs.map((song) => normalizeSong(song)).filter(Boolean)
      : null;
    if (!songs) return { success: false, error: mapApiError(res.json, "search"), songs: [] };
    return { success: true, songs };
  } catch (error) {
    return { success: false, error: (error && error.message) || "network-error", songs: [] };
  }
}

async function getProfile(cookie, { request } = {}) {
  if (!cookie) return { success: false, error: "not-logged-in" };
  try {
    const res = await requestJson({ path: "/api/nuser/account/get", cookie, request });
    // Pass the full response so normalizeProfile can fall back through
    // `data` → `profile` → `account` looking for the user id.
    const profile = normalizeProfile(res.json);
    if (!profile) {
      // Surface the inner shape so we can see which field is missing
      // when normalizeProfile rejects a {code:200} response.
      const json = res.json && typeof res.json === "object" ? res.json : {};
      const body = json.data && typeof json.data === "object" ? json.data : json;
      const profileKeys = body.profile ? Object.keys(body.profile).join(",") : "<none>";
      const accountKeys = body.account ? Object.keys(body.account).join(",") : "<none>";
      console.warn(`[netease-client] getProfile could not extract userId profileKeys=${profileKeys} accountKeys=${accountKeys}`);
      return { success: false, error: mapApiError(res.json, "getProfile") };
    }
    return { success: true, profile };
  } catch (error) {
    return { success: false, error: (error && error.message) || "network-error" };
  }
}

async function getUserPlaylists(userId, { cookie, request, limit = 1000 } = {}) {
  if (!cookie) return { success: false, error: "not-logged-in", playlists: [] };
  if (userId === undefined || userId === null || userId === "") return { success: false, error: "empty-user-id", playlists: [] };
  const path = `/api/user/playlist?uid=${encodeURIComponent(String(userId))}&limit=${encodeURIComponent(String(limit))}&offset=0`;
  try {
    const res = await requestJson({ path, cookie, request });
    const playlists = res.json && Array.isArray(res.json.playlist)
      ? res.json.playlist.map(normalizePlaylist).filter(Boolean)
      : null;
    if (!playlists) return { success: false, error: mapApiError(res.json, "getUserPlaylists"), playlists: [] };
    return { success: true, playlists };
  } catch (error) {
    return { success: false, error: (error && error.message) || "network-error", playlists: [] };
  }
}

async function getPlaylistDetail(playlistId, { cookie, request } = {}) {
  if (!cookie) return { success: false, error: "not-logged-in" };
  if (playlistId === undefined || playlistId === null || playlistId === "") return { success: false, error: "empty-playlist-id" };
  const path = `/api/v6/playlist/detail?id=${encodeURIComponent(String(playlistId))}&n=1000`;
  try {
    const res = await requestJson({ path, cookie, request });
    const playlist = normalizePlaylist(res.json && res.json.playlist);
    if (!playlist || !Array.isArray(res.json.playlist.tracks)) {
      return { success: false, error: mapApiError(res.json, "getPlaylistDetail") };
    }
    const privileges = new Map((Array.isArray(res.json.privileges) ? res.json.privileges : []).map((p) => [p.id, p]));
    const songs = res.json.playlist.tracks
      .map((song) => normalizeSong(song, privileges.get(song.id)))
      .filter(Boolean);
    return { success: true, playlist, songs, tracks: songs };
  } catch (error) {
    return { success: false, error: (error && error.message) || "network-error" };
  }
}

// Pull the `__csrf` value out of a NetEase cookie string. The daily-
// recommend endpoint requires it in the POST body. Cookie strings come
// in like `MUSIC_U=abc; __csrf=def; NMTID=ghi` — we want `def`.
function extractCsrf(cookie) {
  if (typeof cookie !== "string" || !cookie) return "";
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === "__csrf") return rest.join("=");
  }
  return "";
}

function normalizeChart(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.id;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if ((typeof id !== "number" && typeof id !== "string") || !name) return null;
  return {
    id,
    name,
    coverImgUrl: typeof raw.coverImgUrl === "string" ? raw.coverImgUrl : "",
    playCount: Number.isFinite(raw.playCount) ? raw.playCount : 0,
    trackCount: Number.isFinite(raw.trackCount) ? raw.trackCount : 0,
  };
}

// Daily recommendations (每日推荐). NetEase returns ~30 songs selected
// from the user's listening history. Requires login and CSRF token;
// without CSRF the API returns 301/400 and we surface the error.
async function getDailyRecommend({ cookie, request } = {}) {
  if (!cookie) return { success: false, error: "not-logged-in", songs: [] };
  const csrf = extractCsrf(cookie);
  const body = csrf ? `csrf_token=${encodeURIComponent(csrf)}` : "";
  try {
    const res = await requestJson({
      method: "POST",
      path: "/api/v1/discovery/recommend/songs",
      body,
      cookie,
      request,
    });
    const daily = res.json && res.json.data && Array.isArray(res.json.data.dailySongs)
      ? res.json.data.dailySongs
      : null;
    if (!daily) return { success: false, error: mapApiError(res.json, "getDailyRecommend"), songs: [] };
    const songs = daily.map((song) => normalizeSong(song)).filter(Boolean);
    return { success: true, songs };
  } catch (error) {
    return { success: false, error: (error && error.message) || "network-error", songs: [] };
  }
}

// Top charts (热门榜单). Returns a list of official NetEase charts
// (云音乐热歌榜, 云音乐新歌榜, 原创歌曲榜, etc.). Each chart acts like
// a playlist — clicking one calls getPlaylistDetail to get songs.
async function getTopCharts({ cookie, request } = {}) {
  try {
    const res = await requestJson({ path: "/api/toplist", cookie, request });
    const list = res.json && Array.isArray(res.json.list) ? res.json.list : null;
    if (!list) return { success: false, error: mapApiError(res.json, "getTopCharts"), charts: [] };
    const charts = list.map(normalizeChart).filter(Boolean);
    return { success: true, charts };
  } catch (error) {
    return { success: false, error: (error && error.message) || "network-error", charts: [] };
  }
}

// Song lyrics (歌词). Returns LRC-format text with optional Chinese
// translation. We strip the response down to just the raw lyric
// strings — the renderer handles LRC parsing for display.
async function getLyric(songId, { cookie, request } = {}) {
  if (songId === undefined || songId === null || songId === "") {
    return { success: false, error: "empty-id" };
  }
  const path = `/api/song/lyric?id=${encodeURIComponent(String(songId))}&lv=1&kv=1&tv=-1`;
  try {
    const res = await requestJson({ path, cookie, request });
    const lrc = res.json && res.json.lrc && typeof res.json.lrc.lyric === "string"
      ? res.json.lrc.lyric : "";
    const tlyric = res.json && res.json.tlyric && typeof res.json.tlyric.lyric === "string"
      ? res.json.tlyric.lyric : "";
    if (!lrc && !tlyric) {
      return { success: false, error: mapApiError(res.json, "getLyric"), lyric: "", tlyric: "" };
    }
    return { success: true, lyric: lrc, tlyric };
  } catch (error) {
    return { success: false, error: (error && error.message) || "network-error", lyric: "", tlyric: "" };
  }
}

// Personal FM (私人电台). Returns a single song at a time — the
// caller re-invokes to get the next one.
async function getFmSong({ cookie, request } = {}) {
  if (!cookie) return { success: false, error: "not-logged-in" };
  try {
    const res = await requestJson({ path: "/api/v1/radio/get", cookie, request });
    const list = res.json && Array.isArray(res.json.data) ? res.json.data : null;
    if (!list || list.length === 0) {
      return { success: false, error: mapApiError(res.json, "getFmSong") };
    }
    const song = normalizeSong(list[0]);
    if (!song) return { success: false, error: mapApiError(res.json, "getFmSong") };
    return { success: true, song };
  } catch (error) {
    return { success: false, error: (error && error.message) || "network-error" };
  }
}

module.exports = {
  API_BASE,
  normalizeSong,
  normalizePlaylist,
  normalizeProfile,
  normalizeChart,
  extractCsrf,
  search,
  getProfile,
  getProfileFromCookie: getProfile,
  getUserPlaylists,
  getPlaylistDetail,
  getDailyRecommend,
  getTopCharts,
  getLyric,
  getFmSong,
};