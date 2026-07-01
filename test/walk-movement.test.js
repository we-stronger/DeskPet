const assert = require("node:assert/strict");
const test = require("node:test");

const { WalkMovement, WalkMovementRunner } = require("../src/renderer/walk-movement");

test("produces small rightward movement steps while walking", () => {
  const movement = new WalkMovement({ stepPx: 3, maxDistancePx: 12 });

  assert.deepEqual(movement.start(), { dx: 0, dy: 0, active: true });
  assert.deepEqual(movement.step(), { dx: 3, dy: 0, active: true });
  assert.deepEqual(movement.step(), { dx: 3, dy: 0, active: true });
  assert.deepEqual(movement.step(), { dx: 3, dy: 0, active: true });
  assert.deepEqual(movement.step(), { dx: 3, dy: 0, active: false });
  assert.deepEqual(movement.step(), { dx: 0, dy: 0, active: false });
});

test("can be stopped before reaching the total movement distance", () => {
  const movement = new WalkMovement({ stepPx: 4, maxDistancePx: 20 });
  movement.start();
  assert.deepEqual(movement.step(), { dx: 4, dy: 0, active: true });
  assert.deepEqual(movement.stop(), { dx: 0, dy: 0, active: false });
  assert.deepEqual(movement.step(), { dx: 0, dy: 0, active: false });
});

test("can walk left and turn around after hitting a boundary", () => {
  const movement = new WalkMovement({ stepPx: 5, maxDistancePx: 20, direction: -1 });

  movement.start();
  assert.deepEqual(movement.step(), { dx: -5, dy: 0, active: true });

  assert.equal(movement.turnAround(), 1);
  assert.deepEqual(movement.step(), { dx: 5, dy: 0, active: true });
});

test("runner sends walk movement steps to the provided move callback", () => {
  const calls = [];
  const intervals = [];
  const cleared = [];
  const runner = new WalkMovementRunner({
    movement: new WalkMovement({ stepPx: 8, maxDistancePx: 24 }),
    moveBy: (dx, dy) => calls.push([dx, dy]),
    setIntervalFn: (callback, ms) => {
      intervals.push({ callback, ms });
      return intervals.length;
    },
    clearIntervalFn: (id) => cleared.push(id),
    intervalMs: 120,
  });

  runner.start();
  assert.equal(intervals[0].ms, 120);

  intervals[0].callback();
  intervals[0].callback();
  intervals[0].callback();
  intervals[0].callback();

  assert.deepEqual(calls, [[8, 0], [8, 0], [8, 0]]);
  assert.deepEqual(cleared, [1]);
});

test("runner turns around when the move callback reports a horizontal boundary", async () => {
  const intervals = [];
  const runner = new WalkMovementRunner({
    movement: new WalkMovement({ stepPx: 8, maxDistancePx: 24 }),
    moveBy: () => Promise.resolve({ blockedX: true }),
    setIntervalFn: (callback) => {
      intervals.push(callback);
      return intervals.length;
    },
    clearIntervalFn: () => {},
  });

  runner.start();
  intervals[0]();
  await Promise.resolve();

  assert.equal(runner.direction(), -1);
});

test("setReduced(true) makes intervalMs 3x slower", () => {
  const intervals = [];
  const runner = new WalkMovementRunner({
    movement: { start() {}, step: () => ({ dx: 0, dy: 0, active: false }), stop() {}, direction: () => 1 },
    moveBy: () => Promise.resolve({ blockedX: false }),
    setIntervalFn: (cb, ms) => { intervals.push(ms); return 1; },
    clearIntervalFn: () => {},
  });
  runner.setReduced(true);
  runner.start();
  assert.equal(intervals[0], 360);
  runner.setReduced(false);
  runner.start();
  assert.equal(intervals[1], 120);
});
