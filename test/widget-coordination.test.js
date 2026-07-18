const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveWidgetPositions } = require("../src/renderer/widget-coordination");
const { normalizeWidgetState, normalizeWidgetRegistry } = require("../src/renderer/widget-state");

test("normalizeWidgetState provides one safe state shape for every widget", () => {
  assert.deepEqual(normalizeWidgetState({
    id: "music",
    visible: true,
    position: { x: 12.4, y: 18.8 },
    size: { width: 240, height: 96 },
    opacity: 0.64,
    alwaysOnTop: true,
    clickThrough: true,
    draggable: true,
    displayMode: "floating",
  }), {
    id: "music",
    visible: true,
    position: { x: 12, y: 19 },
    size: { width: 240, height: 96 },
    opacity: 0.64,
    alwaysOnTop: true,
    clickThrough: true,
    draggable: true,
    displayMode: "floating",
    priority: 0,
  });
});

test("normalizeWidgetRegistry accepts object maps and removes invalid ids", () => {
  const registry = normalizeWidgetRegistry({
    music: { visible: true, size: { width: 200, height: 80 } },
    focus: { visible: false },
    "": { visible: true },
  });
  assert.equal(registry.music.id, "music");
  assert.equal(registry.focus.visible, false);
  assert.equal(Object.prototype.hasOwnProperty.call(registry, ""), false);
});

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

test("resolveWidgetLayout uses one generic collision-aware widget registry", () => {
  const { resolveWidgetLayout } = require("../src/renderer/widget-coordination");
  const result = resolveWidgetLayout({
    stage: { width: 512, height: 512 },
    widgets: [
      { id: "music", visible: true, priority: 0, position: { x: 12, y: 420 }, size: { width: 260, height: 96 } },
      { id: "focus", visible: true, priority: 1, position: { x: 12, y: 420 }, size: { width: 126, height: 34 } },
      { id: "clock", visible: true, priority: 2, position: { x: 12, y: 420 }, size: { width: 76, height: 50 } },
    ],
  });

  assert.deepEqual(result.music, { x: 12, y: 416 });
  assert.ok(result.focus.y < result.music.y || result.focus.x > result.music.x);
  assert.ok(result.clock.y < result.music.y || result.clock.x > result.music.x);
});
