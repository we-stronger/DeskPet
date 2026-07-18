const assert = require("node:assert/strict");
const test = require("node:test");
const { summarizeFocusRecords } = require("../src/renderer/focus-statistics");

test("summarizeFocusRecords calculates today, total, and consecutive focus stats", () => {
  const now = new Date("2026-07-14T12:00:00+08:00");
  const records = [
    { completedAt: "2026-07-14T10:00:00+08:00", focusDurationMs: 25 * 60000 },
    { completedAt: "2026-07-14T09:00:00+08:00", focusDurationMs: 30 * 60000 },
    { completedAt: "2026-07-13T15:00:00+08:00", focusDurationMs: 20 * 60000 },
    { completedAt: "2026-07-12T15:00:00+08:00", focusDurationMs: 15 * 60000 },
  ];
  const summary = summarizeFocusRecords(records, now);
  assert.deepEqual({
    todayCount: summary.todayCount,
    todayDurationMs: summary.todayDurationMs,
    totalCount: summary.totalCount,
    totalDurationMs: summary.totalDurationMs,
    streakDays: summary.streakDays,
  }, {
    todayCount: 2,
    todayDurationMs: 55 * 60000,
    totalCount: 4,
    totalDurationMs: 90 * 60000,
    streakDays: 3,
  });
  assert.equal(summary.interruptedCount, 0);
  assert.equal(summary.cycleProgress, null);
});

test("separates interrupted sessions and break records from completed focus totals", () => {
  const now = new Date("2026-07-14T12:00:00+08:00");
  const records = [
    { task: "Legacy", completedAt: "2026-07-14T08:00:00+08:00", focusDurationMs: 25 * 60000 },
    {
      task: "Playback",
      phase: "focus",
      result: "completed",
      completedAt: "2026-07-14T09:00:00+08:00",
      actualDurationMs: 30 * 60000,
      focusDurationMs: 30 * 60000,
    },
    {
      task: "Playback",
      phase: "focus",
      result: "interrupted",
      completedAt: "2026-07-14T10:00:00+08:00",
      actualDurationMs: 10 * 60000,
      focusDurationMs: 10 * 60000,
    },
    {
      task: "Playback",
      phase: "short-break",
      result: "completed",
      completedAt: "2026-07-14T10:30:00+08:00",
      actualDurationMs: 5 * 60000,
      focusDurationMs: 0,
    },
  ];

  const summary = summarizeFocusRecords(records, now, {
    completedFocusRounds: 1,
    roundsBeforeLongBreak: 4,
  });

  assert.equal(summary.todayCount, 2);
  assert.equal(summary.todayDurationMs, 55 * 60000);
  assert.equal(summary.interruptedCount, 1);
  assert.equal(summary.interruptedDurationMs, 10 * 60000);
  assert.deepEqual(summary.cycleProgress, { completed: 1, total: 4 });
  assert.deepEqual(summary.byTask, [
    { task: "Playback", count: 1, durationMs: 30 * 60000 },
    { task: "Legacy", count: 1, durationMs: 25 * 60000 },
  ]);
  assert.equal(summary.sevenDay.at(-1).count, 2);
  assert.equal(summary.sevenDay.at(-1).durationMs, 55 * 60000);
});

test("cycle progress shows a completed round set while waiting for the long break", () => {
  const summary = summarizeFocusRecords([], new Date("2026-07-14T12:00:00+08:00"), {
    phase: "waiting-for-break",
    suggestedBreakPhase: "long-break",
    completedFocusRounds: 4,
    roundsBeforeLongBreak: 4,
  });

  assert.deepEqual(summary.cycleProgress, { completed: 4, total: 4 });
});
