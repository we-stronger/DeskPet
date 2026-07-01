// Unit tests for the QR login helper. Mocks the HTTPS request so we can
// exercise response parsing for every NetEase status code without hitting
// the network.
const assert = require("node:assert/strict");
const test = require("node:test");

const auth = require("../src/music/netease-auth");

function fakeResponse({ statusCode = 200, body, headers = {} } = {}) {
  return {
    statusCode,
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers,
  };
}

function fakeRequest(responses) {
  const calls = [];
  let i = 0;
  return {
    calls,
    fn: async (opts) => {
      calls.push(opts);
      const r = responses[i] || responses[responses.length - 1];
      i += 1;
      if (r instanceof Error) throw r;
      // Mirror what the real defaultRequest does: parse the body string
      // into a `json` field so the auth code can read res.json.code.
      let json = null;
      if (typeof r.body === "string") {
        try { json = JSON.parse(r.body); } catch (_e) { json = null; }
      } else if (r.body && typeof r.body === "object") {
        json = r.body;
      }
      return { statusCode: r.statusCode, headers: r.headers, body: r.body, json };
    },
  };
}

// -- createQrKey tests --

test("createQrKey returns unikey and qrUrl from the new endpoint shape", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({ body: { data: { unikey: "abc-123" }, code: 200 } }),
  ]);
  const result = await auth.createQrKey({ request: fn });
  assert.equal(result.success, true);
  assert.equal(result.key, "abc-123");
  assert.equal(result.qrUrl, "https://music.163.com/login?codekey=abc-123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/login/qrcode/unikey");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body, "type=3");
});

test("createQrKey accepts the legacy flat shape `{unikey}` from the new endpoint", async () => {
  const { fn } = fakeRequest([
    fakeResponse({ body: { unikey: "flat-key", code: 200 } }),
  ]);
  const result = await auth.createQrKey({ request: fn });
  assert.equal(result.success, true);
  assert.equal(result.key, "flat-key");
});

test("createQrKey accepts the alternative codeKey field name", async () => {
  const { fn } = fakeRequest([
    fakeResponse({ body: { data: { codeKey: "alt-key" }, code: 200 } }),
  ]);
  const result = await auth.createQrKey({ request: fn });
  assert.equal(result.success, true);
  assert.equal(result.key, "alt-key");
});

test("createQrKey falls back to the legacy /api/login/qr/key endpoint when the new one returns no key", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({ body: { code: 301, message: "deprecated" } }), // new endpoint shape
    fakeResponse({ body: { data: { unikey: "legacy-key" }, code: 200 } }), // legacy endpoint
  ]);
  const result = await auth.createQrKey({ request: fn });
  assert.equal(result.success, true);
  assert.equal(result.key, "legacy-key");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].path, "/api/login/qrcode/unikey");
  assert.equal(calls[1].path.startsWith("/api/login/qr/key"), true);
  assert.equal(calls[1].method, "GET");
});

test("createQrKey also tries legacy flat shape on the fallback endpoint", async () => {
  const { fn, calls } = fakeRequest([
    fakeResponse({ body: "" }), // new endpoint returns empty
    fakeResponse({ body: { unikey: "flat-legacy" } }),
  ]);
  const result = await auth.createQrKey({ request: fn });
  assert.equal(result.success, true);
  assert.equal(result.key, "flat-legacy");
  assert.equal(calls.length, 2);
});

test("createQrKey fails with no-key when both endpoints return no unikey", async () => {
  const debug = [];
  const { fn } = fakeRequest([
    fakeResponse({ body: { code: 301 } }),
    fakeResponse({ body: { code: 301 } }),
  ]);
  const result = await auth.createQrKey({
    request: fn,
    onDebug: (info) => debug.push(info),
  });
  assert.equal(result.success, false);
  assert.equal(result.error, "no-key");
  // onDebug was called for each attempt.
  assert.equal(debug.length, 2);
  assert.equal(debug[0].endpoint, "qrcode/unikey");
  assert.equal(debug[1].endpoint, "qr/key");
});

test("createQrKey surfaces network errors on the new endpoint then falls through", async () => {
  const debug = [];
  let calls = 0;
  const fn = async () => {
    calls += 1;
    if (calls === 1) throw new Error("ECONNRESET");
    const r = fakeResponse({ body: { data: { unikey: "after-fail" } } });
    let json = null;
    try { json = JSON.parse(r.body); } catch (_e) {}
    return { statusCode: r.statusCode, headers: r.headers, body: r.body, json };
  };
  const result = await auth.createQrKey({
    request: fn,
    onDebug: (info) => debug.push(info),
  });
  assert.equal(result.success, true);
  assert.equal(result.key, "after-fail");
  assert.equal(debug[0].error, "ECONNRESET");
});

test("createQrKey surfaces network errors when both endpoints fail", async () => {
  const fn = async () => { throw new Error("ENOTFOUND"); };
  const result = await auth.createQrKey({ request: fn });
  assert.equal(result.success, false);
  assert.equal(result.error, "no-key");
});

// -- checkQrStatus tests --

test("checkQrStatus maps status code 801 to waiting-for-scan", async () => {
  const { fn } = fakeRequest([fakeResponse({ body: { code: 801 } })]);
  const result = await auth.checkQrStatus("k", { request: fn });
  assert.equal(result.success, true);
  assert.equal(result.status, "waiting-for-scan");
});

test("checkQrStatus maps string-typed status code 801", async () => {
  const { fn } = fakeRequest([fakeResponse({ body: { code: "801" } })]);
  const result = await auth.checkQrStatus("k", { request: fn });
  assert.equal(result.success, true);
  assert.equal(result.status, "waiting-for-scan");
});

test("checkQrStatus maps status code 802 to waiting-for-confirm", async () => {
  const { fn } = fakeRequest([fakeResponse({ body: { code: 802 } })]);
  const result = await auth.checkQrStatus("k", { request: fn });
  assert.equal(result.success, true);
  assert.equal(result.status, "waiting-for-confirm");
});

test("checkQrStatus maps status code 800 to expired", async () => {
  const { fn } = fakeRequest([fakeResponse({ body: { code: 800 } })]);
  const result = await auth.checkQrStatus("k", { request: fn });
  assert.equal(result.success, true);
  assert.equal(result.status, "expired");
});

test("checkQrStatus returns cookie from response body on 803", async () => {
  const cookie = "MUSIC_U=session-token; __csrf=abc";
  const { fn } = fakeRequest([fakeResponse({ body: { code: 803, cookie } })]);
  const result = await auth.checkQrStatus("k", { request: fn });
  assert.equal(result.success, true);
  assert.equal(result.status, "ok");
  assert.equal(result.cookie, cookie);
});

test("checkQrStatus falls back to Set-Cookie header when 803 body lacks cookie", async () => {
  const headers = {
    "set-cookie": ["MUSIC_U=token; Path=/", "__csrf=abc; Path=/"],
  };
  const { fn } = fakeRequest([fakeResponse({ body: { code: 803 }, headers })]);
  const result = await auth.checkQrStatus("k", { request: fn });
  assert.equal(result.success, true);
  assert.equal(result.status, "ok");
  assert.equal(result.cookie, "MUSIC_U=token; __csrf=abc");
});

test("checkQrStatus returns unknown-code for unexpected codes", async () => {
  const { fn } = fakeRequest([fakeResponse({ body: { code: 999 } })]);
  const result = await auth.checkQrStatus("k", { request: fn });
  assert.equal(result.success, false);
  assert.equal(result.error, "unknown-code");
  assert.equal(result.code, 999);
});

test("checkQrStatus rejects empty key", async () => {
  const result = await auth.checkQrStatus("");
  assert.equal(result.success, false);
  assert.equal(result.error, "empty-key");
});

test("checkQrStatus rejects non-string key", async () => {
  const result = await auth.checkQrStatus(null);
  assert.equal(result.success, false);
  assert.equal(result.error, "empty-key");
});

test("checkQrStatus encodes key in form body", async () => {
  const { fn, calls } = fakeRequest([fakeResponse({ body: { code: 801 } })]);
  await auth.checkQrStatus("key with space/+=", { request: fn });
  assert.equal(calls[0].body, "key=key%20with%20space%2F%2B%3D&type=3");
  assert.equal(calls[0].path, "/api/login/qrcode/client/login");
  assert.equal(calls[0].method, "POST");
});

// -- helpers --

test("buildQrUrl URL-encodes the key", () => {
  assert.equal(auth.buildQrUrl("simple"), "https://music.163.com/login?codekey=simple");
  assert.equal(auth.buildQrUrl("a/b"), "https://music.163.com/login?codekey=a%2Fb");
});

test("extractUnikey accepts data.unikey, flat unikey, data.codeKey, and flat codeKey", () => {
  assert.equal(auth.extractUnikey({ data: { unikey: "a" } }), "a");
  assert.equal(auth.extractUnikey({ unikey: "b" }), "b");
  assert.equal(auth.extractUnikey({ data: { codeKey: "c" } }), "c");
  assert.equal(auth.extractUnikey({ codeKey: "d" }), "d");
  assert.equal(auth.extractUnikey({ data: {} }), null);
  assert.equal(auth.extractUnikey({}), null);
  assert.equal(auth.extractUnikey(null), null);
  assert.equal(auth.extractUnikey("not-object"), null);
});

test("mapStatusCode handles numeric and string inputs", () => {
  assert.equal(auth.mapStatusCode(800), "expired");
  assert.equal(auth.mapStatusCode(801), "waiting-for-scan");
  assert.equal(auth.mapStatusCode(802), "waiting-for-confirm");
  assert.equal(auth.mapStatusCode(803), "ok");
  assert.equal(auth.mapStatusCode("801"), "waiting-for-scan");
  assert.equal(auth.mapStatusCode(999), null);
  assert.equal(auth.mapStatusCode(null), null);
  assert.equal(auth.mapStatusCode("garbage"), null);
});

test("collectCookie prefers the JSON body cookie when present", () => {
  const headers = { "set-cookie": ["FROM_HEADER=v"] };
  assert.equal(
    auth.collectCookie(headers, { cookie: "FROM_BODY=x" }),
    "FROM_BODY=x",
  );
});

test("collectCookie returns empty string when no cookie is present anywhere", () => {
  assert.equal(auth.collectCookie({}, {}), "");
  assert.equal(auth.collectCookie(undefined, undefined), "");
});