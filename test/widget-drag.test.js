// Unit tests for the small drag helper used by the in-pet music panel
// and the clock widget. We stub DOM-ish objects (add/removeEventListener,
// getBoundingClientRect) so the helper runs in pure node — no jsdom
// dependency. The helper attaches pointermove/pointerup/pointercancel
// to `window` (NOT the handle) so that click events on child elements
// of the handle — e.g. the close button in the music panel header —
// still fire when the user just clicks them.
const assert = require("node:assert/strict");
const test = require("node:test");

const { attachWidgetDrag } = require("../src/renderer/widget-drag");

function makeFakeWindow() {
  const handlers = {};
  return {
    handlers,
    addEventListener(name, fn) { handlers[name] = fn; },
    removeEventListener(name) { delete handlers[name]; },
  };
}

function makeWidget(opts = {}) {
  const handlers = {};
  const widget = {
    style: {},
    addEventListener(name, fn) { handlers[name] = fn; },
    removeEventListener(name) { delete handlers[name]; },
    parentElement: opts.parent || {
      getBoundingClientRect() { return { left: 0, top: 0 }; },
    },
    getBoundingClientRect() {
      return opts.rect || { left: 50, top: 80, right: 90, bottom: 120 };
    },
  };
  return { widget, handlers };
}

function fire(handlers, name, event) {
  assert.ok(handlers[name], `expected handler for ${name}`);
  handlers[name](event);
}

test("drag past threshold reports the new offset and persists on release", () => {
  const fakeWindow = makeFakeWindow();
  const { widget, handlers } = makeWidget();
  let onMoveArgs = null;
  let onEndArgs = null;
  attachWidgetDrag(widget, {
    win: fakeWindow,
    onMove: (args) => { onMoveArgs = args; },
    onEnd: (args) => { onEndArgs = args; },
  });

  fire(handlers, "pointerdown", { button: 0, pointerId: 1, clientX: 100, clientY: 100, stopPropagation() {} });
  // Window-level listeners are installed on pointerdown (not
  // setPointerCapture) so the close button inside the header still
  // gets its click event when the user just clicks it.
  assert.ok(fakeWindow.handlers.pointermove, "pointermove should be on window");
  assert.ok(fakeWindow.handlers.pointerup, "pointerup should be on window");
  assert.ok(fakeWindow.handlers.pointercancel, "pointercancel should be on window");

  // Small jitter (under the 4px threshold) must NOT trigger drag.
  fire(fakeWindow.handlers, "pointermove", { pointerId: 1, clientX: 101, clientY: 100 });
  assert.equal(onMoveArgs, null);

  // Past threshold, drag-move fires with the new top-left relative to
  // the parent (widget's bounding rect is left:50,top:80; parent is
  // (0,0), so currentOffset() returns (50, 80)).
  fire(fakeWindow.handlers, "pointermove", { pointerId: 1, clientX: 140, clientY: 130 });
  assert.equal(onMoveArgs.x, 90);
  assert.equal(onMoveArgs.y, 110);

  // Releasing past threshold fires onEnd with the final top-left and
  // suppresses the trailing click (preventDefault on pointerup).
  let prevented = false;
  fire(fakeWindow.handlers, "pointerup", { pointerId: 1, preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(onEndArgs.x, 90);
  assert.equal(onEndArgs.y, 110);
  assert.equal(prevented, true);
  // Listeners are removed on release.
  assert.equal(fakeWindow.handlers.pointermove, undefined);
  assert.equal(fakeWindow.handlers.pointerup, undefined);
});

test("click (sub-threshold movement) does not fire onEnd so button clicks still work", () => {
  const fakeWindow = makeFakeWindow();
  const { widget, handlers } = makeWidget();
  let onEndCalls = 0;
  attachWidgetDrag(widget, {
    win: fakeWindow,
    onEnd: () => { onEndCalls += 1; },
  });

  fire(handlers, "pointerdown", { button: 0, pointerId: 7, clientX: 50, clientY: 50, stopPropagation() {} });
  // 2px movement stays under the 4px threshold — this is the path
  // taken when the user just clicks a button on the handle.
  fire(fakeWindow.handlers, "pointermove", { pointerId: 7, clientX: 52, clientY: 51 });
  let prevented = false;
  fire(fakeWindow.handlers, "pointerup", { pointerId: 7, preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(onEndCalls, 0);
  assert.equal(prevented, false);
});

test("ignores right-clicks so no window listeners are installed", () => {
  const fakeWindow = makeFakeWindow();
  const { widget, handlers } = makeWidget();
  let onMoveCalls = 0;
  attachWidgetDrag(widget, {
    win: fakeWindow,
    onMove: () => { onMoveCalls += 1; },
  });

  // Right-click with pointerType="mouse" must not start a drag —
  // no window listeners should be installed, and a stray pointermove
  // elsewhere should not be picked up either.
  fire(handlers, "pointerdown", { button: 2, pointerType: "mouse", pointerId: 1, clientX: 10, clientY: 10, stopPropagation() {} });
  assert.equal(fakeWindow.handlers.pointermove, undefined);
  assert.equal(fakeWindow.handlers.pointerup, undefined);
  assert.equal(onMoveCalls, 0);
});

test("ignores pointermove events from a different pointer", () => {
  const fakeWindow = makeFakeWindow();
  const { widget, handlers } = makeWidget();
  let onMoveCalls = 0;
  attachWidgetDrag(widget, {
    win: fakeWindow,
    onMove: () => { onMoveCalls += 1; },
  });

  fire(handlers, "pointerdown", { button: 0, pointerId: 1, clientX: 50, clientY: 50, stopPropagation() {} });
  // A move from a different pointer id is ignored.
  fire(fakeWindow.handlers, "pointermove", { pointerId: 999, clientX: 200, clientY: 200 });
  assert.equal(onMoveCalls, 0);
});

test("returns a detach function that removes all listeners", () => {
  const fakeWindow = makeFakeWindow();
  const { widget, handlers } = makeWidget();
  const detach = attachWidgetDrag(widget, { win: fakeWindow });
  detach();
  assert.equal(handlers.pointerdown, undefined);
  // Window-level listeners are not installed until pointerdown fires,
  // so there's nothing to remove there yet — we just verify the
  // pointerdown handler on the handle is gone.
});

test("non-element input is a no-op and detach is still safe to call", () => {
  const detach = attachWidgetDrag(null, { onMove() { throw new Error("should not be called"); } });
  assert.equal(typeof detach, "function");
  detach();
});
