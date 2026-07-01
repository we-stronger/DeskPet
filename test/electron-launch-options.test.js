const assert = require("node:assert/strict");
const test = require("node:test");

const { buildElectronArgs } = require("../scripts/electron-launch-options");

test("keeps normal Electron launch arguments unchanged", () => {
  assert.deepEqual(buildElectronArgs({ appArgs: [] }), ["."]);
  assert.deepEqual(buildElectronArgs({ appArgs: ["--foo"] }), [".", "--foo"]);
});

test("keeps smoke test launch arguments in app space", () => {
  assert.deepEqual(
    buildElectronArgs({
      appArgs: ["--smoke-test"],
    }),
    [
      ".",
      "--smoke-test",
    ],
  );
});
