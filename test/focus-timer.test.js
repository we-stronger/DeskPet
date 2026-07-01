const assert = require("node:assert/strict");
const test = require("node:test");

const { FocusTimer, FocusPhase } = require("../src/renderer/focus-timer");

test("starts in idle phase", () => {
  const timer = new FocusTimer();
  assert.equal(timer.phase, FocusPhase.Idle);
  assert.equal(timer.remainingMs, 25 * 60 * 1000);
});

test("startFocus transitions to focus phase and counts down", () => {
  let now = 0;
  const timer = new FocusTimer({ now: () => now });
  timer.startFocus();
  assert.equal(timer.phase, FocusPhase.Focus);
  now = 60_000;
  assert.equal(timer.remainingMs, 24 * 60 * 1000);
});

test("tick advances focus and emits finish at zero", () => {
  let now = 0;
  let focusFinished = 0;
  let breakFinished = 0;
  const timer = new FocusTimer({
    now: () => now,
    focusDurationMs: 1000,
    breakDurationMs: 500,
  });
  timer.onFocusEnd(() => focusFinished += 1);
  timer.onBreakEnd(() => breakFinished += 1);
  timer.startFocus();
  now = 999;
  assert.deepEqual(timer.tick(), { phase: FocusPhase.Focus, finished: false });
  now = 1000;
  const r = timer.tick();
  assert.equal(r.finished, true);
  assert.equal(r.phase, FocusPhase.Focus);
  assert.equal(focusFinished, 1);
});

test("pause stops counting, resume continues", () => {
  let now = 0;
  const timer = new FocusTimer({
    now: () => now,
    focusDurationMs: 10_000,
  });
  timer.startFocus();
  now = 4000;
  timer.pause();
  now = 9000;
  assert.equal(timer.remainingMs, 6000);
  timer.resume();
  now = 12_000;
  assert.equal(timer.remainingMs, 3000);
});

test("reset returns to idle with full focus duration", () => {
  let now = 0;
  const timer = new FocusTimer({ now: () => now, focusDurationMs: 25 * 60 * 1000 });
  timer.startFocus();
  timer.startBreak();
  timer.reset();
  assert.equal(timer.phase, FocusPhase.Idle);
  assert.equal(timer.remainingMs, 25 * 60 * 1000);
});

test("startBreak sets phase to break", () => {
  const timer = new FocusTimer();
  timer.startBreak();
  assert.equal(timer.phase, FocusPhase.Break);
  assert.equal(timer.remainingMs, 5 * 60 * 1000);
});

test("focus does not auto-tick without explicit tick()", () => {
  let now = 0;
  const timer = new FocusTimer({ now: () => now });
  timer.startFocus();
  now = 100000;
  assert.equal(timer.phase, FocusPhase.Focus);
});

test("startFocus accepts a custom duration override", () => {
  let now = 0;
  const timer = new FocusTimer({ now: () => now, focusDurationMs: 25 * 60 * 1000 });
  timer.startFocus(45 * 60 * 1000);
  assert.equal(timer.phase, FocusPhase.Focus);
  assert.equal(timer.remainingMs, 45 * 60 * 1000);
});

test("startBreak accepts a custom duration override", () => {
  let now = 0;
  const timer = new FocusTimer({ now: () => now, breakDurationMs: 5 * 60 * 1000 });
  timer.startBreak(10 * 60 * 1000);
  assert.equal(timer.phase, FocusPhase.Break);
  assert.equal(timer.remainingMs, 10 * 60 * 1000);
});

test("setDurations updates defaults when idle and stays intact while running", () => {
  let now = 0;
  const timer = new FocusTimer({ now: () => now, focusDurationMs: 25 * 60 * 1000 });
  timer.setDurations({ focusDurationMs: 50 * 60 * 1000, breakDurationMs: 8 * 60 * 1000 });
  assert.equal(timer.remainingMs, 50 * 60 * 1000);

  timer.startFocus();
  assert.equal(timer.remainingMs, 50 * 60 * 1000);
  now = 5 * 60 * 1000;
  timer.setDurations({ focusDurationMs: 999 * 60 * 1000 });
  assert.equal(timer.remainingMs, 45 * 60 * 1000);
});