const assert = require("node:assert/strict");
const test = require("node:test");

const { visualActionForPointerResult } = require("../src/renderer/pointer-action-policy");

test("does not switch visual action while the pointer is held or dragged", () => {
  assert.equal(visualActionForPointerResult({ type: "press" }), null);
  assert.equal(visualActionForPointerResult({ type: "pending" }), null);
  assert.equal(visualActionForPointerResult({ type: "drag-move" }), null);
});

test("starts drag visual action only after movement crosses the drag threshold", () => {
  assert.equal(visualActionForPointerResult({ type: "drag-start" }), "drag");
});

test("switches visual action only after pointer release is classified", () => {
  assert.equal(visualActionForPointerResult({ type: "click" }), "tap");
  assert.equal(visualActionForPointerResult({ type: "drag-end" }), "idle");
});
