const assert = require("node:assert/strict");
const test = require("node:test");
const { PetInteractionRuntime } = require("../src/renderer/pet-interaction-runtime");

test("PetInteractionRuntime sends taps to pet feedback and drag releases to focus bridge", () => {
  const calls = [];
  const drag = {
    pointerDown: () => ({ type: "down" }),
    pointerMove: () => ({ type: "drag-start" }),
    pointerUp: () => ({ type: "drag-end" }),
  };
  const runtime = new PetInteractionRuntime({
    drag,
    petState: { interact: () => ({ action: "happy" }) },
    focusPetBridge: { beginDrag: () => calls.push("begin"), endDrag: (snapshot) => calls.push(["end", snapshot]), requestInteraction: (value) => calls.push(["tap", value]) },
    currentFocusSnapshot: () => ({ phase: "focus" }),
    onTap: (feedback) => calls.push(["feedback", feedback]),
  });
  runtime.pointerDown({});
  runtime.pointerMove({});
  runtime.pointerUp({});
  assert.deepEqual(calls, ["begin", ["end", { phase: "focus" }]]);

  const tapRuntime = new PetInteractionRuntime({
    drag: { pointerDown() {}, pointerMove: () => ({ type: "tap" }), pointerUp: () => ({ type: "tap" }) },
    petState: { interact: () => ({ action: "happy" }) },
    focusPetBridge: { requestInteraction: (value) => calls.push(["tap", value]) },
    onTap: (feedback) => calls.push(["feedback", feedback]),
  });
  tapRuntime.pointerDown({});
  tapRuntime.pointerUp({});
  assert.deepEqual(calls.slice(-2), [["feedback", { action: "happy" }], ["tap", { action: "happy" }]]);
});

test("PetInteractionRuntime applies the host pointer policy before handling release", () => {
  const calls = [];
  const runtime = new PetInteractionRuntime({
    drag: { pointerUp: () => ({ type: "click" }) },
    petState: { interact: () => ({ action: "happy" }) },
    focusPetBridge: { requestInteraction: (value) => calls.push(value) },
    resolveAction: () => "tap",
  });
  runtime.pointerUp({});
  assert.deepEqual(calls, [{ action: "happy" }]);
});
