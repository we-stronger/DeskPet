const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PET_WINDOW_SIZE,
  shouldRestorePetWindowSize,
} = require("../src/window-size-policy");

test("defines a fixed pet window size", () => {
  assert.deepEqual(PET_WINDOW_SIZE, { width: 512, height: 512 });
});

test("detects unexpected window size changes", () => {
  assert.equal(shouldRestorePetWindowSize([512, 512]), false);
  assert.equal(shouldRestorePetWindowSize([513, 512]), true);
  assert.equal(shouldRestorePetWindowSize([512, 600]), true);
});
