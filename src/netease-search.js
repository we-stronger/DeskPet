const https = require("node:https");

// NetEase Cloud Music's public (undocumented) search endpoint. No auth
// required for anonymous search; returns JSON with `result.songs[]`.
const SEARCH_ENDPOINT = "https://music.163.com/api/search/get";
const SEARCH_TYPE_SONG = 1;
const SEARCH_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 5000;

// Try these orpheus:// schemes in order when handing a song off to the
// desktop client. Different NetEase builds register different sub-routes;
// the bare `orpheus://` simply opens the app and lets the user navigate.
// We try the most common variants first, then less common ones.
const ORPHEUS_PLAY_TARGETS = [
  (id) => `orpheus://nm/song?id=${encodeURIComponent(id)}&type=song`,
  (id) => `orpheus://nm/song?id=${encodeURIComponent(id)}`,
  (id) => `orpheus://song?id=${encodeURIComponent(id)}`,
  (id) => `orpheus://play?songid=${encodeURIComponent(id)}`,
  (id) => `orpheus://play?id=${encodeURIComponent(id)}`,
  (id) => `orpheus://radio/song?id=${encodeURIComponent(id)}`,
  (id) => `orpheus://music/song?id=${encodeURIComponent(id)}`,
];

// orpheus:// routes that put a search query into NetEase itself, ordered
// most-documented first. The exact route differs across NetEase versions;
// we try several so the user lands on NetEase's search page with the query
// pre-filled even when one route isn't registered on their machine.
const ORPHEUS_SEARCH_TARGETS = [
  (query) => `orpheus://search?keyword=${encodeURIComponent(query)}`,
  (query) => `orpheus://search/songs?keyword=${encodeURIComponent(query)}`,
  (query) => `orpheus://discover/search?keyword=${encodeURIComponent(query)}`,
  (query) => `orpheus://discover/search/songs?keyword=${encodeURIComponent(query)}`,
];

function buildSearchWebUrl(query) {
  const q = encodeURIComponent(query);
  return `https://music.163.com/#/search/m/?s=${q}&type=${SEARCH_TYPE_SONG}`;
}

function buildSongWebUrl(id) {
  return `https://music.163.com/#/song?id=${encodeURIComponent(id)}`;
}

function buildSongOrpheusTargets(id) {
  return ORPHEUS_PLAY_TARGETS.map((make) => make(id));
}

function buildSearchOrpheusTargets(query) {
  return ORPHEUS_SEARCH_TARGETS.map((make) => make(query));
}

// Wrap an orpheus target into the command-line argv registered by NetEase.
// The local protocol handler is `cloudmusic.exe --webcmd="%1"`; passing the
// raw URL as argv[0] starts the process but does not reliably route the song.
function buildCloudMusicArgv(url) {
  return [`--webcmd=${url}`];
}

function normalizeSong(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = raw.id;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!Number.isFinite(id) || !name) {
    return null;
  }
  const artists = Array.isArray(raw.artists)
    ? raw.artists
        .map((a) => (a && typeof a.name === "string" ? a.name.trim() : ""))
        .filter(Boolean)
    : [];
  const album = raw.album && typeof raw.album.name === "string"
    ? raw.album.name.trim()
    : "";
  const durationMs = Number.isFinite(raw.duration) ? raw.duration : null;
  return { id, name, artists, album, durationMs };
}

function parseSearchResponse(payload) {
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch (_error) {
    return { success: false, error: "invalid-json" };
  }
  if (!parsed || parsed.code !== 200 || !parsed.result || !Array.isArray(parsed.result.songs)) {
    return { success: false, error: "unexpected-shape", code: parsed && parsed.code };
  }
  const songs = parsed.result.songs.map(normalizeSong).filter(Boolean);
  return { success: true, songs };
}

function defaultPostJson(url, body, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyBuf = Buffer.from(body, "utf8");
    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        path: u.pathname + u.search,
        port: u.port || 443,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": bodyBuf.length,
          "Referer": "https://music.163.com/",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: text });
            return;
          }
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request-timeout")));
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

async function searchSongs(query, deps = {}) {
  if (typeof query !== "string" || !query.trim()) {
    return { success: false, error: "empty-query", songs: [] };
  }
  const trimmed = query.trim();
  const body = `s=${encodeURIComponent(trimmed)}&type=${SEARCH_TYPE_SONG}&limit=${SEARCH_LIMIT}`;
  const post = deps.postJson || defaultPostJson;
  try {
    const { body: payload } = await post(SEARCH_ENDPOINT, body, { timeoutMs: REQUEST_TIMEOUT_MS });
    const result = parseSearchResponse(payload);
    if (result.success) {
      return { success: true, songs: result.songs };
    }
    return { success: false, error: result.error, songs: [] };
  } catch (error) {
    return { success: false, error: error && error.message ? error.message : "network-error", songs: [] };
  }
}

// Bitrate presets. Higher = better quality. Lossless requires VIP on most
// tracks; 320kbps is a good default that almost always returns a URL.
const BITRATE_PRESETS = Object.freeze({
  standard: 128000,
  high: 192000,
  lossless: 320000,
});
const DEFAULT_BITRATE = BITRATE_PRESETS.lossless;

// NetEase's song-URL endpoint. Returns the actual CDN URL the audio
// stream lives at. The newer endpoint accepts a JSON body and ids[]; the
// older `/api/song/url` endpoint accepts the same id form-urlencoded.
const SONG_URL_ENDPOINT = "https://music.163.com/api/song/enhance/player/url";

function parseSongUrlResponse(payload, requestedId) {
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch (_error) {
    return { success: false, error: "invalid-json" };
  }
  if (!parsed || parsed.code !== 200 || !Array.isArray(parsed.data) || parsed.data.length === 0) {
    return { success: false, error: "unexpected-shape", code: parsed && parsed.code };
  }
  const entry = parsed.data[0];
  if (entry && entry.code !== undefined && entry.code !== 200) {
    return { success: false, error: `code-${entry.code}`, id: entry.id };
  }
  if (!entry || typeof entry.url !== "string" || !entry.url) {
    return { success: false, error: "no-url", id: entry && entry.id };
  }
  return {
    success: true,
    url: entry.url,
    id: entry.id || requestedId,
    br: entry.br || null,
    size: entry.size || null,
    type: entry.type || null,
    expi: entry.expi || null,
  };
}

async function fetchSongUrl(id, deps = {}) {
  if (id === undefined || id === null || id === "") {
    return { success: false, error: "empty-id" };
  }
  const idString = String(id);
  const br = DEFAULT_BITRATE;
  const body = `ids=[${encodeURIComponent(idString)}]&br=${br}`;
  const post = deps.postJson || defaultPostJson;
  try {
    const { body: payload } = await post(SONG_URL_ENDPOINT, body, { timeoutMs: REQUEST_TIMEOUT_MS });
    return parseSongUrlResponse(payload, idString);
  } catch (error) {
    return { success: false, error: error && error.message ? error.message : "network-error" };
  }
}

module.exports = {
  SEARCH_ENDPOINT,
  SEARCH_TYPE_SONG,
  SEARCH_LIMIT,
  SONG_URL_ENDPOINT,
  DEFAULT_BITRATE,
  BITRATE_PRESETS,
  ORPHEUS_PLAY_TARGETS,
  ORPHEUS_SEARCH_TARGETS,
  buildSearchWebUrl,
  buildSongWebUrl,
  buildSongOrpheusTargets,
  buildSearchOrpheusTargets,
  buildCloudMusicArgv,
  normalizeSong,
  parseSearchResponse,
  parseSongUrlResponse,
  defaultPostJson,
  searchSongs,
  fetchSongUrl,
};
