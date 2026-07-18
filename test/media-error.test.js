const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeMediaError } = require("../src/music/media-error");

test("normalizes HTTP media failures into stable categories", () => {
  assert.equal(normalizeMediaError({ status: 401 }).error, "auth");
  assert.equal(normalizeMediaError({ statusCode: 403 }).error, "forbidden");
  assert.equal(normalizeMediaError({ response: { status: 404 } }).error, "not-found");
});

test("normalizes NetEase API-style media error codes", () => {
  assert.equal(normalizeMediaError("code-401").error, "auth");
  assert.equal(normalizeMediaError("api-401").error, "auth");
  assert.equal(normalizeMediaError("code-403").error, "forbidden");
});

test("normalizes transport and cancellation failures", () => {
  assert.equal(normalizeMediaError({ code: "ECONNRESET" }).error, "network");
  assert.equal(normalizeMediaError({ name: "AbortError" }).error, "cancelled");
  assert.equal(normalizeMediaError({ error: "audio-unavailable" }).error, "unsupported");
});
