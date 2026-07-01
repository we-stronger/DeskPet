const assert = require("node:assert/strict");
const test = require("node:test");

const { clampPositionToVisibleArea } = require("../src/window-position");

const displays = [
  { x: 0, y: 0, width: 1920, height: 1080 },
];
const windowSize = { width: 512, height: 512 };

test("keeps a visible saved position unchanged", () => {
  assert.deepEqual(
    clampPositionToVisibleArea({ x: 200, y: 160 }, displays, windowSize),
    { x: 200, y: 160 },
  );
});

test("clamps a mostly offscreen saved position back into the visible area", () => {
  assert.deepEqual(
    clampPositionToVisibleArea({ x: -206, y: -504 }, displays, windowSize),
    { x: 0, y: 0 },
  );
});

test("clamps negative coordinates back onto the primary display", () => {
  assert.deepEqual(
    clampPositionToVisibleArea(
      { x: -1200, y: 100 },
      [{ x: -1280, y: 0, width: 1280, height: 1024 }, ...displays],
      windowSize,
    ),
    { x: 0, y: 100 },
  );
});

test("uses the primary display when position data is missing", () => {
  assert.deepEqual(clampPositionToVisibleArea(null, displays, windowSize), { x: 704, y: 284 });
});

test("clamps right and bottom overflow to the primary display", () => {
  assert.deepEqual(
    clampPositionToVisibleArea({ x: 1800, y: 1000 }, displays, windowSize),
    { x: 1408, y: 568 },
  );
});
