const assert = require("node:assert/strict");
const test = require("node:test");

const {
  visualBoxForScale,
} = require("../src/renderer/pet-visual-style");

test("computes a centered visual box without transform scaling", () => {
  assert.deepEqual(visualBoxForScale({ width: 512, height: 512 }, 1), {
    width: 512,
    height: 512,
    left: 0,
    bottom: 0,
  });

  assert.deepEqual(visualBoxForScale({ width: 512, height: 512 }, 0.5), {
    width: 256,
    height: 256,
    left: 128,
    bottom: 0,
  });
});

test("centers the pet vertically when the transparent stage is larger than the base sprite", () => {
  assert.deepEqual(visualBoxForScale({ width: 640, height: 640 }, 0.8), {
    width: 512,
    height: 512,
    left: 64,
    bottom: 64,
  });
});

test("clamps visual box scale instead of allowing unbounded growth", () => {
  assert.deepEqual(visualBoxForScale({ width: 512, height: 512 }, 99), {
    width: 1024,
    height: 1024,
    left: -256,
    bottom: 0,
  });

  assert.deepEqual(visualBoxForScale({ width: 512, height: 512 }, -1), {
    width: 0,
    height: 0,
    left: 256,
    bottom: 0,
  });
});
