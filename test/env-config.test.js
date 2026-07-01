const assert = require("node:assert/strict");
const test = require("node:test");

const { loadEnvConfig } = require("../src/env-config");

function makeFs(text) {
  return {
    readFileSync() {
      return text;
    },
  };
}

function makeFsThatThrows(code) {
  return {
    readFileSync() {
      const error = new Error(`ENOENT: no such file or directory`);
      error.code = code;
      throw error;
    },
  };
}

test("parses simple KEY=VALUE lines", () => {
  const parsed = loadEnvConfig({
    envPath: "/fake/.env",
    fs: makeFs("FOO=bar\nBAZ=qux"),
    assignToEnv() {
      /* no-op */
    },
  });
  assert.deepEqual(parsed, { FOO: "bar", BAZ: "qux" });
});

test("ignores blank lines and # comments", () => {
  const parsed = loadEnvConfig({
    envPath: "/fake/.env",
    fs: makeFs("# header\n\nFOO=bar\n  # indented\nBAZ=qux"),
    assignToEnv() {
      /* no-op */
    },
  });
  assert.deepEqual(parsed, { FOO: "bar", BAZ: "qux" });
});

test("strips surrounding double and single quotes", () => {
  const parsed = loadEnvConfig({
    envPath: "/fake/.env",
    fs: makeFs('FOO="hello world"\nBAR=\'a b\''),
    assignToEnv() {
      /* no-op */
    },
  });
  assert.deepEqual(parsed, { FOO: "hello world", BAR: "a b" });
});

test("skips lines without =", () => {
  const parsed = loadEnvConfig({
    envPath: "/fake/.env",
    fs: makeFs("JUST_TEXT\nFOO=bar"),
    assignToEnv() {
      /* no-op */
    },
  });
  assert.deepEqual(parsed, { FOO: "bar" });
});

test("skips invalid key names", () => {
  const parsed = loadEnvConfig({
    envPath: "/fake/.env",
    fs: makeFs("lowercase=bad\n1FOO=bad\nFOO-BAR=bad\nFOO=ok"),
    assignToEnv() {
      /* no-op */
    },
  });
  assert.deepEqual(parsed, { FOO: "ok" });
});

test("returns empty object and does not throw when file is missing", () => {
  let called = false;
  const parsed = loadEnvConfig({
    envPath: "/fake/.env",
    fs: makeFsThatThrows("ENOENT"),
    assignToEnv() {
      called = true;
    },
  });
  assert.deepEqual(parsed, {});
  assert.equal(called, false);
});

test("calls assignToEnv with process.env and the parsed object", () => {
  let receivedTarget = null;
  let receivedSource = null;
  loadEnvConfig({
    envPath: "/fake/.env",
    fs: makeFs("FOO=bar\nBAZ=qux"),
    assignToEnv(target, source) {
      receivedTarget = target;
      receivedSource = source;
    },
  });
  assert.equal(receivedTarget, process.env);
  assert.deepEqual(receivedSource, { FOO: "bar", BAZ: "qux" });
});

test("assigns the parsed values into process.env when using the default assignToEnv", () => {
  const sentinelKey = "__DESKPET_TEST_DEFAULT_ASSIGN__";
  const sentinelValue = "sentinel-value-123";
  delete process.env[sentinelKey];

  loadEnvConfig({
    envPath: "/fake/.env",
    fs: makeFs(`${sentinelKey}=${sentinelValue}`),
  });

  assert.equal(process.env[sentinelKey], sentinelValue);
  delete process.env[sentinelKey];
});
