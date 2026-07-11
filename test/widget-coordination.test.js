const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveWidgetPositions } = require("../src/renderer/widget-coordination");

test("resolveWidgetPositions keeps music fixed and shifts a colliding focus indicator", () => {
  const result = resolveWidgetPositions({
    stage: { width: 512, height: 512 },
    music: { visible: true, position: { x: 12, y: 420 }, size: { width: 260, height: 96 } },
    focus: { visible: true, position: { x: 12, y: 420 }, size: { width: 126, height: 34 } },
    clock: { visible: false },
  });

  assert.deepEqual(result.music, { x: 12, y: 416 });
  assert.ok(result.focus.y < result.music.y);
  assert.notDeepEqual(result.focus, result.music);
});

test("resolveWidgetPositions preserves a non-overlapping saved position", () => {
  const result = resolveWidgetPositions({
    stage: { width: 512, height: 512 },
    music: { visible: true, position: { x: 12, y: 400 }, size: { width: 260, height: 96 } },
    focus: { visible: true, position: { x: 340, y: 40 }, size: { width: 126, height: 34 } },
    clock: { visible: false },
  });

  assert.deepEqual(result.focus, { x: 340, y: 40 });
});

test("resolveWidgetPositions omits hidden widgets", () => {
  const result = resolveWidgetPositions({
    stage: { width: 512, height: 512 },
    music: { visible: false },
    focus: { visible: false },
    clock: { visible: true, position: { x: 12, y: 12 }, size: { width: 76, height: 50 } },
  });

  assert.deepEqual(result, { clock: { x: 12, y: 12 } });
});
