const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PET_WINDOW_SIZE,
  shouldRestorePetWindowSize,
} = require("../src/window-size-policy");

test("defines a fixed pet window size", () => {
  assert.deepEqual(PET_WINDOW_SIZE, { width: 760, height: 760 });
});

test("detects unexpected window size changes", () => {
  assert.equal(shouldRestorePetWindowSize([760, 760]), false);
  assert.equal(shouldRestorePetWindowSize([761, 760]), true);
  assert.equal(shouldRestorePetWindowSize([760, 640]), true);
});
