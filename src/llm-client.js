const https = require("node:https");

const CHAT_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const DEFAULT_MODEL = "glm-4-flash";
const REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_SYSTEM_PROMPT =
  '你是一个可爱的桌面宠物桌宠，性格温和、话不多、回答简洁（一般1-2句话）。用第一人称称呼自己为"我"，称呼用户为"你"。语气亲切、俏皮，但不要过度使用表情符号。';

const VALID_ROLES = new Set(["system", "user", "assistant"]);

function resolveChatEndpoint(endpoint) {
  const trimmed = String(endpoint == null ? "" : endpoint).trim();
  if (!trimmed) {
    return CHAT_ENDPOINT;
  }
  // Already a full chat-completions URL — leave it alone.
  if (/\/chat\/completions\/?$/i.test(trimmed)) {
    return trimmed;
  }
  // Bare /v4 (with or without trailing slash) — append the path. Mirrors the
  // Python reference's behavior so users can paste the short form from the
  // Zhipu docs without having to know the full path.
  if (/\/v4\/?$/i.test(trimmed)) {
    return trimmed.replace(/\/v4\/?$/, "/v4/chat/completions");
  }
  return trimmed;
}

function isValidMessage(msg) {
  if (!msg || typeof msg !== "object") return false;
  if (!VALID_ROLES.has(msg.role)) return false;
  if (typeof msg.content !== "string") return false;
  if (msg.content.trim() === "") return false;
  return true;
}

function buildChatRequest({ messages, model, systemPrompt, apiKey, endpoint }) {
  const url = endpoint || CHAT_ENDPOINT;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": "Mozilla/5.0",
    Accept: "application/json",
  };

  // Make a shallow copy so we never mutate the caller's array.
  const filtered = Array.isArray(messages)
    ? messages.filter(isValidMessage)
    : [];

  if (filtered.length === 0) {
    throw new Error("no-valid-messages");
  }

  const finalMessages =
    typeof systemPrompt === "string" && systemPrompt.trim() !== ""
      ? [{ role: "system", content: systemPrompt }, ...filtered]
      : filtered;

  const body = JSON.stringify({ model, messages: finalMessages });
  return { url, headers, body };
}

function parseChatResponse(payload) {
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch (_error) {
    return { success: false, error: "invalid-json" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { success: false, error: "unexpected-shape" };
  }

  // ZhipuAI error envelope: { error: { code, message } }
  if (parsed.error && typeof parsed.error === "object") {
    const code = parsed.error.code;
    if (code === 401) {
      return { success: false, error: "auth-failed", code };
    }
    if (code === 429) {
      return { success: false, error: "rate-limited", code };
    }
    if (typeof code === "number" && code >= 500 && code < 600) {
      return { success: false, error: "server-error", code };
    }
    // Other error codes fall through to the success-shape check below,
    // which will likely reject them as unexpected-shape. That's fine.
  }

  // Success envelope: { choices: [{ message: { role, content } }], usage }
  if (
    !Array.isArray(parsed.choices) ||
    parsed.choices.length === 0 ||
    !parsed.choices[0] ||
    !parsed.choices[0].message ||
    typeof parsed.choices[0].message.content !== "string" ||
    parsed.choices[0].message.content.trim() === ""
  ) {
    return { success: false, error: "unexpected-shape" };
  }

  const content = parsed.choices[0].message.content.trim();
  return {
    success: true,
    content,
    usage: parsed.usage || null,
    raw: parsed,
  };
}

function defaultPostJson(url, body, { headers = {}, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyBuf = Buffer.from(body, "utf8");
    const requestHeaders = {
      "User-Agent": "Mozilla/5.0",
      ...headers,
    };
    requestHeaders["Content-Length"] = bodyBuf.length;

    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        path: u.pathname + u.search,
        port: u.port || 443,
        headers: requestHeaders,
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

async function chat(messages, deps = {}) {
  if (!Array.isArray(messages)) {
    return { success: false, error: "invalid-messages", messages: [] };
  }
  if (messages.length === 0) {
    return { success: false, error: "empty-messages", messages: [] };
  }

  const apiKey = deps.apiKey || process.env.ZHIPUAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "missing-api-key" };
  }

  const model = deps.model || process.env.ZHIPUAI_MODEL || DEFAULT_MODEL;
  const endpoint = resolveChatEndpoint(deps.endpoint || process.env.ZHIPUAI_ENDPOINT);
  // Respect an explicit deps.systemPrompt (including empty string) before
  // falling back to env or default. Using "in" lets a caller opt out of
  // a system prompt by passing an empty string.
  const systemPrompt =
    "systemPrompt" in deps
      ? deps.systemPrompt
      : process.env.ZHIPUAI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;

  const post = deps.postJson || defaultPostJson;

  let req;
  try {
    req = buildChatRequest({ messages, model, apiKey, endpoint, systemPrompt });
  } catch (error) {
    return { success: false, error: (error && error.message) || "build-failed" };
  }

  try {
    const { body: payload } = await post(req.url, req.body, {
      headers: req.headers,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    return parseChatResponse(payload);
  } catch (error) {
    return { success: false, error: (error && error.message) || "network-error" };
  }
}

module.exports = {
  CHAT_ENDPOINT,
  DEFAULT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  REQUEST_TIMEOUT_MS,
  resolveChatEndpoint,
  buildChatRequest,
  parseChatResponse,
  defaultPostJson,
  chat,
};
