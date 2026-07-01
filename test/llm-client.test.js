const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildChatRequest,
  parseChatResponse,
  chat,
  resolveChatEndpoint,
  CHAT_ENDPOINT,
  DEFAULT_MODEL,
} = require("../src/llm-client");

// 1. buildChatRequest includes model, all messages, and Authorization header
test("buildChatRequest includes model, all messages, and Authorization header", () => {
  const req = buildChatRequest({
    messages: [{ role: "user", content: "hi" }],
    model: "glm-4-flash",
    apiKey: "secret",
  });
  assert.equal(req.url, "https://open.bigmodel.cn/api/paas/v4/chat/completions");
  assert.equal(req.headers["Authorization"], "Bearer secret");
  assert.equal(req.headers["Content-Type"], "application/json");
  const body = JSON.parse(req.body);
  assert.equal(body.model, "glm-4-flash");
  assert.equal(body.messages[0].content, "hi");
});

// 2. buildChatRequest prepends system message when systemPrompt is provided
test("buildChatRequest prepends system message when systemPrompt is provided", () => {
  const req = buildChatRequest({
    messages: [{ role: "user", content: "hi" }],
    model: "glm-4-flash",
    apiKey: "secret",
    systemPrompt: "be cute",
  });
  const body = JSON.parse(req.body);
  assert.deepEqual(body.messages[0], { role: "system", content: "be cute" });
  assert.equal(body.messages[1].content, "hi");
});

// 3. buildChatRequest omits system message when systemPrompt is empty/null
test("buildChatRequest omits system message when systemPrompt is empty/null", () => {
  const req = buildChatRequest({
    messages: [{ role: "user", content: "hi" }],
    model: "glm-4-flash",
    apiKey: "secret",
  });
  const body = JSON.parse(req.body);
  assert.equal(body.messages[0].content, "hi");
  assert.equal(body.messages[0].role, "user");
});

// 4. buildChatRequest filters out messages with invalid role / empty content
test("buildChatRequest filters out messages with invalid role / empty content", () => {
  const req = buildChatRequest({
    messages: [
      { role: "user", content: "keep" },
      { role: "bot", content: "x" },
      { role: "user", content: "" },
      { role: "user", content: null },
      { role: "user", content: "   " },
      null,
    ],
    model: "glm-4-flash",
    apiKey: "secret",
  });
  const body = JSON.parse(req.body);
  assert.deepEqual(body.messages, [{ role: "user", content: "keep" }]);
});

// 5. buildChatRequest throws "no-valid-messages" when filtering leaves nothing
test("buildChatRequest throws no-valid-messages when filtering leaves nothing", () => {
  assert.throws(
    () =>
      buildChatRequest({
        messages: [{ role: "user", content: "" }],
        model: "glm-4-flash",
        apiKey: "secret",
      }),
    /no-valid-messages/,
  );
});

// 6. parseChatResponse happy path extracts content and usage
test("parseChatResponse happy path extracts content and usage", () => {
  const payload = JSON.stringify({
    choices: [{ message: { role: "assistant", content: "  hello  " } }],
    usage: { total_tokens: 42 },
  });
  const result = parseChatResponse(payload);
  assert.equal(result.success, true);
  assert.equal(result.content, "hello");
  assert.equal(result.usage.total_tokens, 42);
});

// 7. parseChatResponse returns unexpected-shape for empty choices / missing message / empty content
test("parseChatResponse returns unexpected-shape for empty choices / missing message / empty content", () => {
  const a = parseChatResponse(JSON.stringify({ choices: [] }));
  assert.equal(a.success, false);
  assert.equal(a.error, "unexpected-shape");

  const b = parseChatResponse(JSON.stringify({ choices: [{}] }));
  assert.equal(b.success, false);
  assert.equal(b.error, "unexpected-shape");

  const c = parseChatResponse(
    JSON.stringify({ choices: [{ message: { role: "assistant", content: "" } }] }),
  );
  assert.equal(c.success, false);
  assert.equal(c.error, "unexpected-shape");
});

// 8. parseChatResponse returns auth-failed for { error: { code: 401, message: "..." } }
test("parseChatResponse returns auth-failed for code 401", () => {
  const result = parseChatResponse(
    JSON.stringify({ error: { code: 401, message: "bad key" } }),
  );
  assert.equal(result.error, "auth-failed");
  assert.equal(result.code, 401);
});

// 9. parseChatResponse returns rate-limited for 429 and server-error for 5xx
test("parseChatResponse returns rate-limited for 429 and server-error for 5xx", () => {
  const r429 = parseChatResponse(
    JSON.stringify({ error: { code: 429, message: "slow down" } }),
  );
  assert.equal(r429.error, "rate-limited");
  assert.equal(r429.code, 429);

  const r5xx = parseChatResponse(
    JSON.stringify({ error: { code: 503, message: "down" } }),
  );
  assert.equal(r5xx.error, "server-error");
  assert.equal(r5xx.code, 503);
});

// 10. parseChatResponse returns invalid-json for non-JSON
test("parseChatResponse returns invalid-json for non-JSON", () => {
  const result = parseChatResponse("not json");
  assert.equal(result.error, "invalid-json");
});

// 11. chat() rejects non-array messages without network
test("chat rejects non-array messages without network", async () => {
  const failingPostJson = () => {
    throw new Error("should not be called");
  };
  const result = await chat("hi", { postJson: failingPostJson });
  assert.equal(result.error, "invalid-messages");
  assert.deepEqual(result.messages, []);
});

// 12. chat() rejects empty array without network
test("chat rejects empty array without network", async () => {
  const failingPostJson = () => {
    throw new Error("should not be called");
  };
  const result = await chat([], { postJson: failingPostJson });
  assert.equal(result.error, "empty-messages");
  assert.deepEqual(result.messages, []);
});

// 13. chat() returns missing-api-key when no key in deps or env
test("chat returns missing-api-key when no key in deps or env", async () => {
  const saved = process.env.ZHIPUAI_API_KEY;
  delete process.env.ZHIPUAI_API_KEY;
  try {
    const failingPostJson = () => {
      throw new Error("should not be called");
    };
    const result = await chat(
      [{ role: "user", content: "hi" }],
      { postJson: failingPostJson },
    );
    assert.equal(result.error, "missing-api-key");
  } finally {
    if (saved !== undefined) process.env.ZHIPUAI_API_KEY = saved;
  }
});

// 14. chat() uses deps.apiKey over process.env
test("chat uses deps.apiKey over process.env", async () => {
  const saved = process.env.ZHIPUAI_API_KEY;
  process.env.ZHIPUAI_API_KEY = "env-key";
  try {
    let captured;
    const spy = (url, body, opts) => {
      captured = { url, body, opts };
      return Promise.resolve({
        statusCode: 200,
        body: JSON.stringify({
          choices: [{ message: { role: "assistant", content: "ok" } }],
        }),
      });
    };
    await chat([{ role: "user", content: "hi" }], { apiKey: "deps-key", postJson: spy });
    assert.equal(captured.opts.headers["Authorization"], "Bearer deps-key");
  } finally {
    if (saved === undefined) delete process.env.ZHIPUAI_API_KEY;
    else process.env.ZHIPUAI_API_KEY = saved;
  }
});

// 15. chat() sends a POST to CHAT_ENDPOINT with JSON body containing model and messages
test("chat sends a POST to CHAT_ENDPOINT with JSON body containing model and messages", async () => {
  const savedKey = process.env.ZHIPUAI_API_KEY;
  const savedPrompt = process.env.ZHIPUAI_SYSTEM_PROMPT;
  process.env.ZHIPUAI_API_KEY = "key";
  delete process.env.ZHIPUAI_SYSTEM_PROMPT;
  try {
    let captured;
    const spy = (url, body, opts) => {
      captured = { url, body, opts };
      return Promise.resolve({
        statusCode: 200,
        body: JSON.stringify({
          choices: [{ message: { role: "assistant", content: "ok" } }],
        }),
      });
    };
    await chat(
      [{ role: "user", content: "hi" }],
      { postJson: spy, systemPrompt: "" },
    );
    assert.equal(captured.url, CHAT_ENDPOINT);
    const parsed = JSON.parse(captured.body);
    assert.equal(parsed.model, DEFAULT_MODEL);
    assert.equal(parsed.messages[0].content, "hi");
    assert.equal(captured.opts.headers["Content-Type"], "application/json");
  } finally {
    if (savedKey === undefined) delete process.env.ZHIPUAI_API_KEY;
    else process.env.ZHIPUAI_API_KEY = savedKey;
    if (savedPrompt === undefined) delete process.env.ZHIPUAI_SYSTEM_PROMPT;
    else process.env.ZHIPUAI_SYSTEM_PROMPT = savedPrompt;
  }
});

// 16. chat() maps network errors to success:false with the error message
test("chat maps network errors to success:false with the error message", async () => {
  const savedKey = process.env.ZHIPUAI_API_KEY;
  const savedPrompt = process.env.ZHIPUAI_SYSTEM_PROMPT;
  process.env.ZHIPUAI_API_KEY = "key";
  delete process.env.ZHIPUAI_SYSTEM_PROMPT;
  try {
    const failingPostJson = () => Promise.reject(new Error("ENOTFOUND"));
    const result = await chat(
      [{ role: "user", content: "hi" }],
      { postJson: failingPostJson },
    );
    assert.equal(result.success, false);
    assert.equal(result.error, "ENOTFOUND");
  } finally {
    if (savedKey === undefined) delete process.env.ZHIPUAI_API_KEY;
    else process.env.ZHIPUAI_API_KEY = savedKey;
    if (savedPrompt === undefined) delete process.env.ZHIPUAI_SYSTEM_PROMPT;
    else process.env.ZHIPUAI_SYSTEM_PROMPT = savedPrompt;
  }
});

// 17. chat() resolves with success:true and content on a normal response
test("chat resolves with success:true and content on a normal response", async () => {
  const savedKey = process.env.ZHIPUAI_API_KEY;
  const savedPrompt = process.env.ZHIPUAI_SYSTEM_PROMPT;
  process.env.ZHIPUAI_API_KEY = "key";
  delete process.env.ZHIPUAI_SYSTEM_PROMPT;
  try {
    const spy = () =>
      Promise.resolve({
        statusCode: 200,
        body: JSON.stringify({
          choices: [{ message: { role: "assistant", content: "你好" } }],
        }),
      });
    const result = await chat([{ role: "user", content: "hi" }], { postJson: spy });
    assert.equal(result.success, true);
    assert.equal(result.content, "你好");
  } finally {
    if (savedKey === undefined) delete process.env.ZHIPUAI_API_KEY;
    else process.env.ZHIPUAI_API_KEY = savedKey;
    if (savedPrompt === undefined) delete process.env.ZHIPUAI_SYSTEM_PROMPT;
    else process.env.ZHIPUAI_SYSTEM_PROMPT = savedPrompt;
  }
});

// 18. chat() prepends system message when env has ZHIPUAI_SYSTEM_PROMPT and deps.systemPrompt is not set
test("chat prepends system message when env has ZHIPUAI_SYSTEM_PROMPT", async () => {
  const savedKey = process.env.ZHIPUAI_API_KEY;
  const savedPrompt = process.env.ZHIPUAI_SYSTEM_PROMPT;
  process.env.ZHIPUAI_API_KEY = "key";
  process.env.ZHIPUAI_SYSTEM_PROMPT = "you are a frog";
  try {
    let captured;
    const spy = (url, body, opts) => {
      captured = { url, body, opts };
      return Promise.resolve({
        statusCode: 200,
        body: JSON.stringify({
          choices: [{ message: { role: "assistant", content: "ok" } }],
        }),
      });
    };
    await chat([{ role: "user", content: "hi" }], { postJson: spy });
    const parsed = JSON.parse(captured.body);
    assert.deepEqual(parsed.messages[0], { role: "system", content: "you are a frog" });
    assert.equal(parsed.messages[1].content, "hi");
  } finally {
    if (savedKey === undefined) delete process.env.ZHIPUAI_API_KEY;
    else process.env.ZHIPUAI_API_KEY = savedKey;
    if (savedPrompt === undefined) delete process.env.ZHIPUAI_SYSTEM_PROMPT;
    else process.env.ZHIPUAI_SYSTEM_PROMPT = savedPrompt;
  }
});

// resolveChatEndpoint: appends /chat/completions for the short /v4 form.
test("resolveChatEndpoint appends /chat/completions when endpoint ends with /v4", () => {
  assert.equal(
    resolveChatEndpoint("https://open.bigmodel.cn/api/paas/v4"),
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  );
  assert.equal(
    resolveChatEndpoint("https://open.bigmodel.cn/api/paas/v4/"),
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  );
});

test("resolveChatEndpoint leaves endpoint unchanged when it already ends with /chat/completions", () => {
  assert.equal(
    resolveChatEndpoint("https://open.bigmodel.cn/api/paas/v4/chat/completions"),
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  );
  assert.equal(
    resolveChatEndpoint("https://open.bigmodel.cn/api/paas/v4/chat/completions/"),
    "https://open.bigmodel.cn/api/paas/v4/chat/completions/",
  );
});

test("resolveChatEndpoint falls back to CHAT_ENDPOINT for empty / nullish input", () => {
  assert.equal(resolveChatEndpoint(""), CHAT_ENDPOINT);
  assert.equal(resolveChatEndpoint(null), CHAT_ENDPOINT);
  assert.equal(resolveChatEndpoint(undefined), CHAT_ENDPOINT);
  assert.equal(resolveChatEndpoint("   "), CHAT_ENDPOINT);
});

test("chat appends /chat/completions when ZHIPUAI_ENDPOINT env ends with /v4", async () => {
  const savedKey = process.env.ZHIPUAI_API_KEY;
  const savedEndpoint = process.env.ZHIPUAI_ENDPOINT;
  const savedPrompt = process.env.ZHIPUAI_SYSTEM_PROMPT;
  process.env.ZHIPUAI_API_KEY = "key";
  process.env.ZHIPUAI_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4";
  delete process.env.ZHIPUAI_SYSTEM_PROMPT;
  try {
    let capturedUrl = null;
    const postJson = (url) => {
      capturedUrl = url;
      return Promise.resolve({
        statusCode: 200,
        body: JSON.stringify({
          choices: [{ message: { role: "assistant", content: "hi" } }],
        }),
      });
    };
    await chat([{ role: "user", content: "hi" }], { postJson });
    assert.equal(
      capturedUrl,
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    );
  } finally {
    if (savedKey === undefined) delete process.env.ZHIPUAI_API_KEY;
    else process.env.ZHIPUAI_API_KEY = savedKey;
    if (savedEndpoint === undefined) delete process.env.ZHIPUAI_ENDPOINT;
    else process.env.ZHIPUAI_ENDPOINT = savedEndpoint;
    if (savedPrompt === undefined) delete process.env.ZHIPUAI_SYSTEM_PROMPT;
    else process.env.ZHIPUAI_SYSTEM_PROMPT = savedPrompt;
  }
});
