const assert = require("node:assert/strict");
const test = require("node:test");

const { DragController } = require("../src/renderer/drag-controller");

test("treats a pointer press and release under threshold as a click", () => {
  const controller = new DragController({ threshold: 6 });

  assert.deepEqual(controller.pointerDown({ screenX: 100, screenY: 120 }), { type: "press" });
  assert.deepEqual(controller.pointerMove({ screenX: 103, screenY: 124 }), { type: "pending" });
  assert.deepEqual(controller.pointerUp(), { type: "click" });
});

test("starts dragging after threshold and reports movement deltas", () => {
  const controller = new DragController({ threshold: 6 });

  controller.pointerDown({ screenX: 100, screenY: 120 });

  assert.deepEqual(controller.pointerMove({ screenX: 108, screenY: 120 }), {
    type: "drag-start",
    dx: 8,
    dy: 0,
  });
  assert.deepEqual(controller.pointerMove({ screenX: 111, screenY: 126 }), {
    type: "drag-move",
    dx: 3,
    dy: 6,
  });
  assert.deepEqual(controller.pointerUp(), { type: "drag-end" });
});
