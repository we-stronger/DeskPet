const assert = require("node:assert/strict");
const test = require("node:test");

const {
  actionScaleForAction,
  percentagePresets,
  sizePercentToMultiplier,
  speedPercentToMultiplier,
  visibleScaleForAction,
} = require("../src/renderer/pet-settings");

test("provides percentage presets", () => {
  assert.deepEqual(percentagePresets, [
    0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
    110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
  ]);
});

test("converts size percentage into display multiplier", () => {
  assert.equal(sizePercentToMultiplier(0), 0);
  assert.equal(sizePercentToMultiplier(7), 0.07);
  assert.equal(sizePercentToMultiplier(100), 1);
  assert.equal(sizePercentToMultiplier(220), 2);
  assert.equal(sizePercentToMultiplier(-20), 0);
  assert.equal(sizePercentToMultiplier("missing"), 1);
});

test("converts speed percentage into multiplier", () => {
  assert.equal(speedPercentToMultiplier(0), 0);
  assert.equal(speedPercentToMultiplier(50), 0.5);
  assert.equal(speedPercentToMultiplier(100), 1);
  assert.equal(speedPercentToMultiplier(150), 1.5);
  assert.equal(speedPercentToMultiplier("missing"), 1);
});

test("provides per-action display scale corrections", () => {
  assert.equal(actionScaleForAction("idle"), 1);
  assert.equal(actionScaleForAction("sleep"), 0.5);
  assert.equal(actionScaleForAction("drag"), 0.55);
  assert.equal(visibleScaleForAction(50, "idle"), 0.5);
  assert.equal(visibleScaleForAction(50, "sleep"), 0.25);
  assert.equal(visibleScaleForAction(100, "drag"), 0.55);
});
