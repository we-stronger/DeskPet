const assert = require("node:assert/strict");
const test = require("node:test");
const { FocusRuntime } = require("../src/renderer/focus-runtime");

function createController(initialSnapshot = {}) {
  let snapshot = { revision: 0, phase: "idle", status: "idle", taskName: "", remainingMs: 1500000, ...initialSnapshot };
  const listeners = new Set();
  const events = new Set();
  const calls = [];
  return {
    calls,
    snapshot: () => ({ ...snapshot }),
    records: () => [],
    subscribe(listener) { listeners.add(listener); listener({ ...snapshot }); return () => listeners.delete(listener); },
    onEvent(listener) { events.add(listener); return () => events.delete(listener); },
    emit(next, type = "focus-started") { snapshot = { ...snapshot, ...next, revision: snapshot.revision + 1 }; listeners.forEach((listener) => listener({ ...snapshot })); events.forEach((listener) => listener({ type, snapshot: { ...snapshot } })); },
    startFocus(payload) { calls.push(["startFocus", payload]); return { success: true }; },
    startBreak(payload) { calls.push(["startBreak", payload]); return { success: true }; },
    startSuggestedBreak() { calls.push(["startSuggestedBreak"]); return { success: true }; },
    pause() { calls.push(["pause"]); return { success: true }; },
    resume() { calls.push(["resume"]); return { success: true }; },
    interruptFocus() { calls.push(["interruptFocus"]); return { success: true }; },
    skipBreak() { calls.push(["skipBreak"]); return { success: true }; },
    reset() { calls.push(["reset"]); return { success: true }; },
    tick() { calls.push(["tick"]); return { success: true }; },
    clearRecords() { calls.push(["clearRecords"]); return { success: true }; },
  };
}

test("FocusRuntime subscribes once, persists snapshots, and routes focus commands", () => {
  const controller = createController();
  const persisted = [];
  const events = [];
  const runtime = new FocusRuntime({
    createController: () => controller,
    onPersist: (payload) => persisted.push(payload),
    onEvent: (event) => events.push(event),
  });
  runtime.load({ focusSession: { phase: "idle" }, focusRecords: [] });
  runtime.load({ focusSession: { phase: "idle" }, focusRecords: [] });
  assert.equal(runtime.snapshot().phase, "idle");

  runtime.command("start", { taskName: "Write tests" });
  controller.emit({ phase: "focus", status: "running", taskName: "Write tests" });
  assert.deepEqual(controller.calls[0], ["startFocus", { taskName: "Write tests" }]);
  assert.equal(persisted.length, 1);
  assert.equal(events.length, 1);

  runtime.command("pause");
  runtime.command("resume");
  runtime.command("end", { confirmInterrupt: () => true });
  runtime.command("clear-records");
  assert.deepEqual(controller.calls.slice(1).map(([name]) => name), ["pause", "resume", "interruptFocus", "clearRecords"]);
  runtime.destroy();
});

test("FocusRuntime restores an expired session only after the controller reaches waiting", () => {
  const controller = createController({ phase: "break", status: "waiting" });
  const restored = [];
  const runtime = new FocusRuntime({ createController: () => controller, onRestoredCompletion: (snapshot) => restored.push(snapshot) });
  runtime.load({ focusSession: { phase: "focus", status: "running", endsAt: 1 }, now: 2 });
  controller.emit({ phase: "focus", status: "running" });
  runtime.command("end", { confirmInterrupt: () => false });
  assert.equal(controller.calls.length, 0);
  assert.equal(restored.length, 1);
  runtime.destroy();
});

test("FocusRuntime does not announce restored completion before restoration succeeds", () => {
  const controller = createController();
  const restored = [];
  const runtime = new FocusRuntime({ createController: () => controller, onRestoredCompletion: (snapshot) => restored.push(snapshot) });
  runtime.load({ focusSession: { phase: "focus", status: "running", endsAt: 1 }, now: 2 });
  assert.equal(restored.length, 0);
  runtime.destroy();
});
