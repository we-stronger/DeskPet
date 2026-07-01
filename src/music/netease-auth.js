// NetEase login helpers.
//
// The QR login flow talks to NetEase's internal endpoints directly:
//   1. GET  /api/login/qr/key?type=3
//        -> { data: { unikey } }            (the "key" used for polling)
//   2. POST /api/login/qrcode/client/login   { key, type: 3 }
//        -> { code: 800|801|802|803, cookie? }
//           800 = expired, 801 = waiting for scan, 802 = waiting for confirm,
//           803 = success (response body carries the MUSIC_U cookie string).
//
// We try the new endpoint `/api/login/qrcode/unikey` first (used by the
// current api-enhanced-main reference repo). If that returns a non-JSON
// response or no unikey, we fall back to the older `/api/login/qr/key`
// endpoint which is still served by NetEase as of late 2025.
//
// The QR image itself is just a URL the user scans with their phone:
//   https://music.163.com/login?codekey=<unikey>
// The main process opens that URL in the user's default browser so we
// don't need to embed a popup BrowserWindow (which Chromium sometimes
// ERR_ABORTEDs when the SPA hash-redirects).
//
// All requests are plain HTTPS — no weapi encryption.

const https = require("node:https");

const REQUEST_TIMEOUT_MS = 8000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.0.18.203152";

function defaultRequest({ method = "GET", path, body, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const bodyBuf = body ? Buffer.from(body, "utf8") : null;
    const finalHeaders = {
      "User-Agent": BROWSER_UA,
      Referer: "https://music.163.com/",
      ...(bodyBuf ? {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": bodyBuf.length,
      } : {}),
      ...headers,
    };
    const req = https.request({
      method,
      hostname: "music.163.com",
      path,
      port: 443,
      headers: finalHeaders,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch (_error) { json = null; }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: text, json });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request-timeout")));
    req.on("error", reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

function buildQrUrl(key) {
  return `https://music.163.com/login?codekey=${encodeURIComponent(key)}`;
}

// Extract a unikey from a JSON response, tolerating both the new shape
// `{data: {unikey}}` and the legacy flat shape `{unikey}`.
function extractUnikey(json) {
  if (!json || typeof json !== "object") return null;
  if (json.data && typeof json.data === "object" && typeof json.data.unikey === "string") {
    return json.data.unikey;
  }
  if (typeof json.unikey === "string") return json.unikey;
  if (json.data && typeof json.data === "object" && typeof json.data.codeKey === "string") {
    return json.data.codeKey;
  }
  if (typeof json.codeKey === "string") return json.codeKey;
  return null;
}

// Try the new qrcode endpoint first, then the legacy qr/key endpoint.
// Either response shape (`{data:{unikey}}` or flat `{unikey}`) is accepted.
async function createQrKey({
  request = defaultRequest,
  onDebug = () => {},
} = {}) {
  const timestamp = Date.now();

  // Strategy 1: current endpoint used by api-enhanced-main (POST with body).
  try {
    const res = await request({
      method: "POST",
      path: "/api/login/qrcode/unikey",
      body: "type=3",
    });
    onDebug({ endpoint: "qrcode/unikey", status: res.statusCode, body: res.body });
    const key = extractUnikey(res.json);
    if (key) return { success: true, key, qrUrl: buildQrUrl(key) };
  } catch (error) {
    onDebug({ endpoint: "qrcode/unikey", error: error && error.message });
  }

  // Strategy 2: legacy endpoint. Some NetEase regions still answer here.
  try {
    const res = await request({
      method: "GET",
      path: `/api/login/qr/key?type=3&timestamp=${timestamp}`,
    });
    onDebug({ endpoint: "qr/key", status: res.statusCode, body: res.body });
    const key = extractUnikey(res.json);
    if (key) return { success: true, key, qrUrl: buildQrUrl(key) };
  } catch (error) {
    onDebug({ endpoint: "qr/key", error: error && error.message });
  }

  return { success: false, error: "no-key" };
}

function collectCookie(headers, body) {
  // 803 responses include the cookie as a JSON string field. Some server
  // variants also return it via Set-Cookie headers — fall back to that.
  if (body && typeof body.cookie === "string" && body.cookie) {
    return body.cookie;
  }
  const setCookie = headers && headers["set-cookie"];
  if (!Array.isArray(setCookie) || setCookie.length === 0) return "";
  return setCookie
    .map((item) => String(item).split(";")[0])
    .filter(Boolean)
    .join("; ");
}

// Map a numeric/string status code from the polling response to our
// internal status string. Tolerates either numeric (`{code: 801}`) or
// string-shaped responses (`{code: "801"}`).
function mapStatusCode(rawCode) {
  const code = Number(rawCode);
  if (code === 800) return "expired";
  if (code === 801) return "waiting-for-scan";
  if (code === 802) return "waiting-for-confirm";
  if (code === 803) return "ok";
  return null;
}

async function checkQrStatus(key, { request = defaultRequest } = {}) {
  if (!key || typeof key !== "string") {
    return { success: false, error: "empty-key" };
  }
  try {
    const body = `key=${encodeURIComponent(key)}&type=3`;
    const res = await request({
      method: "POST",
      path: "/api/login/qrcode/client/login",
      body,
    });
    const status = mapStatusCode(res.json && res.json.code);
    if (status === "expired") return { success: true, status, message: "二维码已过期" };
    if (status === "waiting-for-scan") return { success: true, status, message: "等待扫码" };
    if (status === "waiting-for-confirm") return { success: true, status, message: "等待确认" };
    if (status === "ok") {
      const cookie = collectCookie(res.headers, res.json);
      return { success: true, status, cookie, message: "登录成功" };
    }
    return { success: false, error: "unknown-code", code: res.json && res.json.code };
  } catch (error) {
    return { success: false, error: (error && error.message) || "network-error" };
  }
}

module.exports = {
  createQrKey,
  checkQrStatus,
  buildQrUrl,
  extractUnikey,
  mapStatusCode,
  collectCookie,
};