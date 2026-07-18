const ERROR_MESSAGES = Object.freeze({
  auth: "Login is required to play this song",
  forbidden: "This song is not available for playback",
  "not-found": "The song resource was not found",
  network: "The music service connection failed",
  cancelled: "Playback was superseded by a newer request",
  unsupported: "No compatible audio source is available",
});

const NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENETUNREACH",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ERR_NETWORK",
]);

function statusOf(error) {
  const candidates = [
    error && error.status,
    error && error.statusCode,
    error && error.response && error.response.status,
  ];
  for (const candidate of candidates) {
    const status = Number(candidate);
    if (Number.isInteger(status)) return status;
  }
  return 0;
}

function errorText(error) {
  if (typeof error === "string") return error.toLowerCase();
  if (!error || typeof error !== "object") return "";
  return String(error.error || error.code || error.name || error.message || "").toLowerCase();
}

function normalizeMediaError(error, context = {}) {
  const status = statusOf(error);
  const text = errorText(error);
  let category = "unsupported";

  if (status === 401 || /unauthorized|session-expired|not-logged-in/.test(text)
    || /(?:^|[-_])401(?:$|[-_])/.test(text)) {
    category = "auth";
  } else if (status === 403 || /forbidden|permission|403/.test(text)
    || /(?:^|[-_])403(?:$|[-_])/.test(text)) {
    category = "forbidden";
  } else if (status === 404 || /not-found|no-audio-url|resource-not-found|404/.test(text)) {
    category = "not-found";
  } else if (text === "aborterror" || text === "abort_err" || /cancelled|canceled/.test(text)) {
    category = "cancelled";
  } else if (NETWORK_CODES.has(String(error && error.code || "").toUpperCase())
    || /network|timeout|econnreset|connection reset|fetch failed/.test(text)) {
    category = "network";
  } else if (/audio-unavailable|unsupported|no-compatible-source|not-supported/.test(text)) {
    category = "unsupported";
  }

  return {
    success: false,
    error: category,
    message: ERROR_MESSAGES[category],
    retryable: category === "network" || category === "cancelled",
    ...(context.songId === undefined ? {} : { songId: String(context.songId) }),
  };
}

const api = {
  ERROR_MESSAGES,
  normalizeMediaError,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof globalThis !== "undefined") globalThis.DeskpetMediaError = api;
