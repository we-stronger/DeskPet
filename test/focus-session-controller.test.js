const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FocusSessionController,
  FocusSessionPhase,
  FocusSessionStatus,
} = require("../src/renderer/focus-session-controller");

function createController(overrides = {}) {
  let now = 1_000_000;
  let idSequence = 0;
  const controller = new FocusSessionController({
    now: () => now,
    createId: (prefix) => `${prefix}-${++idSequence}`,
    focusDurationMs: 1000,
    shortBreakDurationMs: 200,
    longBreakDurationMs: 500,
    roundsBeforeLongBreak: 2,
    ...overrides,
  });
  return {
    controller,
    advance(ms) { now += ms; },
    now() { return now; },
  };
}

test("starts with one serializable idle snapshot", () => {
  const { controller } = createController();
  assert.deepEqual(controller.snapshot(), {
    version: 1,
    revision: 0,
    sessionId: null,
    taskName: "",
    phase: FocusSessionPhase.Idle,
    status: FocusSessionStatus.Idle,
    startedAt: null,
    phaseStartedAt: null,
    endsAt: null,
    pausedRemainingMs: null,
    remainingMs: 1000,
    plannedDurationMs: 1000,
    completedFocusRounds: 0,
    roundsBeforeLongBreak: 2,
    focusDurationMs: 1000,
    shortBreakDurationMs: 200,
    longBreakDurationMs: 500,
    suggestedBreakPhase: null,
    updatedAt: 1_000_000,
  });
  assert.deepEqual(controller.records(), []);
});

test("starts focus and publishes a running snapshot", () => {
  const { controller, now } = createController();
  const snapshots = [];
  controller.subscribe((snapshot) => snapshots.push(snapshot));

  const result = controller.startFocus({ taskName: "Write tests" });

  assert.equal(result.success, true);
  assert.equal(result.snapshot.phase, FocusSessionPhase.Focus);
  assert.equal(result.snapshot.status, FocusSessionStatus.Running);
  assert.equal(result.snapshot.taskName, "Write tests");
  assert.equal(result.snapshot.startedAt, now());
  assert.equal(result.snapshot.endsAt, now() + 1000);
  assert.equal(snapshots.at(-1).revision, 1);
});

test("pause and resume preserve remaining wall-clock time", () => {
  const { controller, advance, now } = createController();
  controller.startFocus({ taskName: "Pause safely" });
  advance(350);

  assert.equal(controller.pause().success, true);
  assert.equal(controller.snapshot().status, FocusSessionStatus.Paused);
  assert.equal(controller.snapshot().pausedRemainingMs, 650);
  advance(5000);
  assert.equal(controller.snapshot().remainingMs, 650);

  assert.equal(controller.resume().success, true);
  assert.equal(controller.snapshot().endsAt, now() + 650);
  advance(649);
  assert.equal(controller.tick().finished, false);
});

test("focus completion records once and waits for manual break start", () => {
  const { controller, advance } = createController();
  controller.startFocus({ taskName: "Reliable completion" });
  advance(1000);

  const first = controller.tick();
  const second = controller.tick();

  assert.equal(first.finished, true);
  assert.equal(second.finished, false);
  assert.equal(controller.snapshot().phase, FocusSessionPhase.WaitingForBreak);
  assert.equal(controller.snapshot().status, FocusSessionStatus.Waiting);
  assert.equal(controller.snapshot().suggestedBreakPhase, FocusSessionPhase.ShortBreak);
  assert.equal(controller.snapshot().completedFocusRounds, 1);
  assert.equal(controller.records().length, 1);
  assert.equal(controller.records()[0].result, "completed");
  assert.equal(controller.records()[0].phase, FocusSessionPhase.Focus);
});

test("starts the suggested break only after explicit command", () => {
  const { controller, advance } = createController();
  controller.startFocus({ taskName: "Manual transition" });
  advance(1000);
  controller.tick();

  const result = controller.startSuggestedBreak();

  assert.equal(result.success, true);
  assert.equal(controller.snapshot().phase, FocusSessionPhase.ShortBreak);
  assert.equal(controller.snapshot().status, FocusSessionStatus.Running);
  assert.equal(controller.snapshot().remainingMs, 200);
  advance(200);
  controller.tick();
  assert.equal(controller.snapshot().phase, FocusSessionPhase.WaitingForFocus);
  assert.equal(controller.snapshot().status, FocusSessionStatus.Waiting);
});

test("can start a standalone short break from idle", () => {
  const { controller, advance } = createController();
  const result = controller.startBreak();

  assert.equal(result.success, true);
  assert.equal(controller.snapshot().phase, FocusSessionPhase.ShortBreak);
  assert.equal(controller.snapshot().remainingMs, 200);
  advance(200);
  controller.tick();
  assert.equal(controller.snapshot().phase, FocusSessionPhase.WaitingForFocus);
});

test("suggests a long break after the configured focus round", () => {
  const { controller, advance } = createController();
  controller.startFocus({ taskName: "Round one" });
  advance(1000);
  controller.tick();
  controller.startSuggestedBreak();
  advance(200);
  controller.tick();
  controller.startFocus({ taskName: "Round two" });
  advance(1000);
  controller.tick();

  assert.equal(controller.snapshot().completedFocusRounds, 2);
  assert.equal(controller.snapshot().suggestedBreakPhase, FocusSessionPhase.LongBreak);
  controller.startSuggestedBreak();
  assert.equal(controller.snapshot().phase, FocusSessionPhase.LongBreak);
  assert.equal(controller.snapshot().remainingMs, 500);
});

test("interrupting focus preserves elapsed time without incrementing completed rounds", () => {
  const { controller, advance } = createController();
  controller.startFocus({ taskName: "Interrupted task" });
  advance(400);

  const result = controller.interruptFocus();

  assert.equal(result.success, true);
  assert.equal(controller.snapshot().phase, FocusSessionPhase.Idle);
  assert.equal(controller.snapshot().completedFocusRounds, 0);
  assert.equal(controller.records().length, 1);
  assert.equal(controller.records()[0].result, "interrupted");
  assert.equal(controller.records()[0].actualDurationMs, 400);
});

test("rejects commands that are invalid for the current state", () => {
  const { controller } = createController();
  assert.deepEqual(controller.pause(), {
    success: false,
    code: "not-running",
    message: "当前没有可暂停的专注或休息。",
    snapshot: controller.snapshot(),
  });
  assert.equal(controller.startSuggestedBreak().code, "break-not-ready");
  assert.equal(controller.interruptFocus().code, "focus-not-active");
});

test("restores a running focus session from its wall-clock end time", () => {
  let now = 20_000;
  const controller = new FocusSessionController({
    now: () => now,
    focusDurationMs: 1000,
    shortBreakDurationMs: 200,
    longBreakDurationMs: 500,
    roundsBeforeLongBreak: 2,
    initialSession: {
      version: 1,
      revision: 4,
      sessionId: "session-restored",
      taskName: "Restore me",
      phase: "focus",
      status: "running",
      startedAt: 19_000,
      phaseStartedAt: 19_400,
      endsAt: 20_400,
      pausedRemainingMs: null,
      plannedDurationMs: 1000,
      completedFocusRounds: 1,
      roundsBeforeLongBreak: 2,
      focusDurationMs: 1000,
      shortBreakDurationMs: 200,
      longBreakDurationMs: 500,
      suggestedBreakPhase: null,
      updatedAt: 19_500,
    },
  });

  assert.equal(controller.snapshot().phase, FocusSessionPhase.Focus);
  assert.equal(controller.snapshot().remainingMs, 400);
  assert.equal(controller.snapshot().completedFocusRounds, 1);
  now += 399;
  assert.equal(controller.tick().finished, false);
});

test("restores a paused session without consuming paused time", () => {
  let now = 30_000;
  const controller = new FocusSessionController({
    now: () => now,
    initialSession: {
      version: 1,
      revision: 2,
      sessionId: "paused-session",
      taskName: "Paused task",
      phase: "focus",
      status: "paused",
      startedAt: 25_000,
      phaseStartedAt: 25_000,
      endsAt: null,
      pausedRemainingMs: 700,
      plannedDurationMs: 1000,
      completedFocusRounds: 0,
      roundsBeforeLongBreak: 2,
      focusDurationMs: 1000,
      shortBreakDurationMs: 200,
      longBreakDurationMs: 500,
      suggestedBreakPhase: null,
      updatedAt: 26_000,
    },
  });

  now += 10_000;
  assert.equal(controller.snapshot().remainingMs, 700);
  controller.resume();
  assert.equal(controller.snapshot().endsAt, now + 700);
});

test("expired restored focus completes once and waits for a break", () => {
  const persisted = [];
  const initialSession = {
    version: 1,
    revision: 3,
    sessionId: "expired-session",
    taskName: "Expired focus",
    phase: "focus",
    status: "running",
    startedAt: 40_000,
    phaseStartedAt: 40_000,
    endsAt: 41_000,
    pausedRemainingMs: null,
    plannedDurationMs: 1000,
    completedFocusRounds: 0,
    roundsBeforeLongBreak: 2,
    focusDurationMs: 1000,
    shortBreakDurationMs: 200,
    longBreakDurationMs: 500,
    suggestedBreakPhase: null,
    updatedAt: 40_500,
  };
  const controller = new FocusSessionController({
    now: () => 42_000,
    initialSession,
    createId: (prefix) => `${prefix}-restored`,
    onPersist: (payload) => persisted.push(payload),
  });

  assert.equal(controller.snapshot().phase, FocusSessionPhase.WaitingForBreak);
  assert.equal(controller.snapshot().completedFocusRounds, 1);
  assert.equal(controller.records().length, 1);
  assert.equal(controller.tick().finished, false);
  assert.equal(controller.records().length, 1);
  assert.equal(persisted.length, 1);
});

test("invalid or future restored sessions fall back to idle", () => {
  const future = new FocusSessionController({
    focusDurationMs: 1234,
    initialSession: { version: 99, phase: "focus", status: "running", endsAt: 999999 },
  });
  const malformed = new FocusSessionController({
    focusDurationMs: 1234,
    initialSession: { version: 1, phase: "focus", status: "running", endsAt: "later" },
  });

  assert.equal(future.snapshot().phase, FocusSessionPhase.Idle);
  assert.equal(future.snapshot().remainingMs, 1234);
  assert.equal(malformed.snapshot().phase, FocusSessionPhase.Idle);
});

test("unfinished display ticks do not persist the session every second", () => {
  const persisted = [];
  const { controller, advance } = createController({
    onPersist: (payload) => persisted.push(payload),
  });
  controller.startFocus({ taskName: "Low write volume" });
  assert.equal(persisted.length, 1);
  advance(100);
  controller.tick();
  advance(100);
  controller.tick();
  assert.equal(persisted.length, 1);
});

test("clearing records updates the controller source of truth", () => {
  const { controller, advance } = createController();
  controller.startFocus({ taskName: "Recorded" });
  advance(1000);
  controller.tick();
  assert.equal(controller.records().length, 1);

  controller.clearRecords();

  assert.deepEqual(controller.records(), []);
});
