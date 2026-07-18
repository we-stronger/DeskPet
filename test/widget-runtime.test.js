const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { WidgetRuntime } = require("../src/renderer/widget-runtime");

function createElement() {
  const handlers = {};
  return {
    hidden: false,
    dataset: {},
    style: {},
    classList: {
      values: new Set(),
      toggle(name, enabled) { if (enabled) this.values.add(name); else this.values.delete(name); },
      add(name) { this.values.add(name); },
      remove(name) { this.values.delete(name); },
    },
    setAttribute(name, value) { this[name] = String(value); },
    addEventListener(name, handler) { handlers[name] = handler; },
    removeEventListener(name) { delete handlers[name]; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 80, height: 40 }; },
    parentElement: { getBoundingClientRect() { return { left: 0, top: 0 }; } },
    handlers,
  };
}

test("WidgetRuntime normalizes loaded widget state and applies visibility, opacity, display mode, and click-through", () => {
  const clock = createElement();
  const runtimeStyleCalls = [];
  const policyCalls = [];
  const runtime = new WidgetRuntime({
    elements: { clock: { element: clock, size: { width: 80, height: 40 } } },
    runtimeStyle: { apply: (...args) => runtimeStyleCalls.push(args) },
    onPolicyChange: (id, state) => policyCalls.push({ id, state }),
  });

  runtime.load({ widgets: { clock: { visible: true, position: { x: 12, y: 18 }, opacity: 0.6, clickThrough: true } } });
  assert.deepEqual(runtime.snapshot("clock").position, { x: 12, y: 18 });
  assert.equal(clock.hidden, false);
  assert.equal(clock.dataset.displayMode, "floating");
  assert.equal(clock.dataset.clickThrough, "true");
  assert.ok(clock.classList.values.has("is-click-through"));
  assert.ok(runtimeStyleCalls.length > 0);
  assert.equal(policyCalls.length, 1);

  runtime.setDisplayMode("clock", "hidden");
  assert.equal(clock.hidden, true);
  runtime.setVisible("clock", true);
  runtime.setOpacity("clock", 2);
  runtime.setClickThrough("clock", false);
  assert.equal(runtime.snapshot("clock").opacity, 1);
  assert.equal(clock.dataset.clickThrough, "false");
  runtime.destroy();
});

test("WidgetRuntime resolves collisions, wires drag updates, and persists one debounced snapshot", () => {
  const clock = createElement();
  const focus = createElement();
  const persists = [];
  const dragHandlers = {};
  let scheduled = null;
  const runtime = new WidgetRuntime({
    elements: {
      music: { element: createElement(), size: { width: 260, height: 96 }, priority: 0 },
      focus: { element: focus, size: { width: 126, height: 34 }, priority: 1 },
      clock: { element: clock, size: { width: 80, height: 40 }, priority: 2 },
    },
    dragApi: { attachWidgetDrag(element, options) { dragHandlers[element === clock ? "clock" : "focus"] = options; return () => {}; } },
    coordinationApi: require("../src/renderer/widget-coordination"),
    runtimeStyle: { apply() {} },
    onPersist: (payload) => persists.push(payload),
    schedule: (callback) => { scheduled = callback; return 1; },
    cancel() {},
  });

  runtime.load({ widgets: {
    music: { visible: true, position: { x: 12, y: 420 } },
    focus: { visible: true, position: { x: 12, y: 420 } },
    clock: { visible: true, position: { x: 12, y: 420 } },
  } });
  const layout = runtime.layout({ stage: { width: 512, height: 512 } });
  assert.deepEqual(layout.music, { x: 12, y: 416 });
  assert.notDeepEqual(layout.focus, layout.music);

  dragHandlers.clock.onStart();
  dragHandlers.clock.onMove({ x: 90, y: 42 });
  dragHandlers.clock.onEnd({ x: 91, y: 43 });
  assert.deepEqual(runtime.snapshot("clock").position, { x: 91, y: 43 });
  assert.ok(clock.classList.values.has("is-dragging") === false);
  assert.ok(scheduled, "a persistence callback should be scheduled once");
  scheduled();
  assert.equal(persists.length, 1);
  assert.deepEqual(persists[0].widgets.clock.position, { x: 91, y: 43 });
  runtime.destroy();
});

test("WidgetRuntime invokes injected timer functions without using the runtime as their receiver", () => {
  const calls = [];
  const schedule = function schedule(callback, delay) {
    "use strict";
    assert.equal(this, undefined);
    calls.push({ callback, delay });
    return 7;
  };
  const cancel = function cancel(timerId) {
    "use strict";
    assert.equal(this, undefined);
    calls.push({ timerId });
  };
  const runtime = new WidgetRuntime({
    elements: { music: { element: createElement(), size: { width: 100, height: 40 } } },
    runtimeStyle: { apply() {} },
    schedule,
    cancel,
  });

  runtime.load({ widgets: { music: { position: { x: 12, y: 18 } } } });
  assert.doesNotThrow(() => runtime.update("music", { position: { x: 30, y: 36 } }));
  assert.equal(calls[0].delay, 120);
  runtime.destroy();
});

test("renderer delegates clock, focus, and music drag ownership to WidgetRuntime", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "renderer.js"), "utf8");
  assert.match(source, /new window\.DeskpetWidgetRuntime\.WidgetRuntime\(/);
  assert.match(source, /loadWidgetRuntime\(loadedSettings\)/);
  assert.doesNotMatch(source, /attachWidgetDrag\(clockEl,/);
  assert.doesNotMatch(source, /attachWidgetDrag\(focusIndicator,/);
  assert.doesNotMatch(source, /attachWidgetDrag\(musicStatusBar,/);
});

test("renderer does not let automatic widget coordination overwrite a pinned music position", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "renderer.js"), "utf8");

  assert.match(source, /onDragEnd:\s*\(state\)\s*=>\s*\{\s*musicStatusPosition\s*=\s*state\.position/);
  assert.doesNotMatch(
    source,
    /if\s*\(resolved\.music\s*&&\s*musicStatusBar\s*&&\s*!isDraggingMusic\)[\s\S]*?applyRuntimeStyle\(musicStatusBar,\s*"music-status-position"/,
    "the coordinator may place other widgets around music, but must not rewrite the user's music position",
  );
});
