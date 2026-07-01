const assert = require("node:assert/strict");
const test = require("node:test");

const {
  computeMovedWindowPosition,
  computeWindowMove,
} = require("../src/window-move-policy");

const displays = [
  { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
];
const windowSize = { width: 512, height: 512 };

test("moves a window by a delta and rounds fractional movement", () => {
  assert.deepEqual(
    computeMovedWindowPosition({
      currentPosition: { x: 100, y: 120 },
      delta: { dx: 10.4, dy: 20.6 },
      displays,
      windowSize,
    }),
    { x: 110, y: 141 },
  );
});

test("does not clamp drag: the pet follows the cursor even past the screen edge", () => {
  // The user wants the pet to be draggable across the whole desktop.
  // If they drag past the right/bottom edge, the pet goes there — we
  // don't pull it back to a "safe" position. The old clamp made the
  // drag feel "stuck" at the edge.
  assert.deepEqual(
    computeMovedWindowPosition({
      currentPosition: { x: 1400, y: 560 },
      delta: { dx: 100, dy: 100 },
      displays,
      windowSize,
    }),
    { x: 1500, y: 660 },
  );
});

test("allows the pet to be parked fully off-screen when the drag takes it there", () => {
  // Drag way past the right/bottom edge. Previously the clamp pulled
  // the pet back to the display-anchored bottom-right corner (1920-512,
  // 1080-512). The user wants no clamp: the pet should sit wherever
  // they dragged it to, even if that's off the visible desktop.
  const result = computeMovedWindowPosition({
    currentPosition: { x: 100, y: 100 },
    delta: { dx: 3000, dy: 3000 },
    displays,
    windowSize,
  });
  assert.equal(result.x, 3100);
  assert.equal(result.y, 3100);
});

test("reports blockedX/blockedY so auto-walk can still turn around at display edges", () => {
  // Even though the drag itself is unclamped, the auto-walk system
  // (src/renderer/walk-movement.js) needs to know when a step would
  // push the pet past the edge of its current display so it can
  // turn around. We still compute those flags here.
  assert.deepEqual(
    computeWindowMove({
      currentPosition: { x: 100, y: 100 },
      delta: { dx: 3000, dy: 3000 },
      displays,
      windowSize,
    }),
    {
      position: { x: 3100, y: 3100 },
      requestedPosition: { x: 3100, y: 3100 },
      blockedX: true,
      blockedY: true,
    },
  );
});

test("blocks auto-walk at the right edge when the pet is at the edge", () => {
  // Pet is currently at (1400, 100) — its right edge sits exactly at
  // the display's right edge (1400 + 512 = 1920). A small rightward
  // step would push the right edge past the display, so blockedX
  // should be true even though the position itself is reachable.
  const result = computeWindowMove({
    currentPosition: { x: 1400, y: 100 },
    delta: { dx: 8, dy: 0 },
    displays,
    windowSize,
  });
  assert.equal(result.position.x, 1408);
  assert.equal(result.blockedX, true);
  assert.equal(result.blockedY, false);
});

test("does not block auto-walk when the pet is well inside the display", () => {
  // Standard walk step inside the display — neither axis would go
  // past the edge, so the walker should keep going in its current
  // direction.
  const result = computeWindowMove({
    currentPosition: { x: 500, y: 300 },
    delta: { dx: 8, dy: 0 },
    displays,
    windowSize,
  });
  assert.equal(result.position.x, 508);
  assert.equal(result.blockedX, false);
  assert.equal(result.blockedY, false);
});
