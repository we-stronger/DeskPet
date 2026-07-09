const crypto = require("node:crypto");
const http = require("node:http");
const https = require("node:https");

const NETEASE_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const TRACK_TTL_MS = 30 * 60 * 1000;

function buildProxyTrackUrl({ port, id }) {
  return `http://127.0.0.1:${port}/audio/${encodeURIComponent(id)}`;
}

function buildUpstreamHeaders({ range } = {}) {
  const headers = {
    "User-Agent": NETEASE_BROWSER_UA,
    Accept: "*/*",
    Connection: "close",
  };
  if (typeof range === "string" && range.trim()) {
    headers.Range = range.trim();
  }
  return headers;
}

function createTrackRegistry({ now = Date.now } = {}) {
  const tracks = new Map();

  function add(url, meta = {}) {
    const id = `track_${crypto.randomBytes(12).toString("hex")}`;
    const track = {
      id,
      url,
      meta: meta && typeof meta === "object" ? { ...meta } : {},
      createdAt: now(),
    };
    tracks.set(id, track);
    return track;
  }

  function get(id) {
    const track = tracks.get(id);
    if (!track) return null;
    if (now() - track.createdAt > TRACK_TTL_MS) {
      tracks.delete(id);
      return null;
    }
    return track;
  }

  function sweep() {
    const current = now();
    for (const [id, track] of tracks) {
      if (current - track.createdAt > TRACK_TTL_MS) tracks.delete(id);
    }
  }

  return { add, get, sweep };
}

function copyResponseHeaders(upstreamHeaders) {
  const allowed = [
    "accept-ranges",
    "cache-control",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ];
  const headers = {};
  for (const name of allowed) {
    const value = upstreamHeaders[name];
    if (value !== undefined) headers[name] = value;
  }
  return headers;
}

function createNeteaseAudioProxy({
  httpModule = http,
  httpsModule = https,
  logger = console,
  registry = createTrackRegistry(),
} = {}) {
  let server = null;
  let port = 0;

  function handleRequest(req, res) {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    const match = /^\/audio\/([^/]+)$/.exec(requestUrl.pathname);
    if (!match) {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    const track = registry.get(decodeURIComponent(match[1]));
    if (!track || typeof track.url !== "string") {
      res.writeHead(404);
      res.end("track expired");
      return;
    }

    let target;
    try {
      target = new URL(track.url);
    } catch (_error) {
      res.writeHead(502);
      res.end("invalid upstream");
      return;
    }

    const transport = target.protocol === "http:" ? httpModule : httpsModule;
    const upstream = transport.request({
      method: "GET",
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "http:" ? 80 : 443),
      path: `${target.pathname}${target.search}`,
      headers: buildUpstreamHeaders({ range: req.headers.range }),
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, copyResponseHeaders(upstreamRes.headers || {}));
      upstreamRes.pipe(res);
    });

    upstream.on("error", (error) => {
      if (logger && typeof logger.warn === "function") {
        logger.warn("[netease-audio-proxy] upstream failed", error && error.message);
      }
      if (!res.headersSent) res.writeHead(502);
      res.end("upstream failed");
    });
    req.on("close", () => upstream.destroy());
    upstream.end();
  }

  function ensureStarted() {
    if (server && port) return Promise.resolve(port);
    return new Promise((resolve, reject) => {
      server = httpModule.createServer(handleRequest);
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        port = server.address().port;
        server.off("error", reject);
        resolve(port);
      });
    });
  }

  async function createTrack(url, meta = {}) {
    const activePort = await ensureStarted();
    registry.sweep();
    const track = registry.add(url, meta);
    return {
      ...track,
      proxyUrl: buildProxyTrackUrl({ port: activePort, id: track.id }),
    };
  }

  function close() {
    if (!server) return;
    server.close();
    server = null;
    port = 0;
  }

  return { close, createTrack, ensureStarted };
}

module.exports = {
  NETEASE_BROWSER_UA,
  buildProxyTrackUrl,
  buildUpstreamHeaders,
  createNeteaseAudioProxy,
  createTrackRegistry,
};
