const assert = require("node:assert/strict");
const test = require("node:test");

const { DailyState } = require("../src/renderer/daily-state");

function makeClock(year, month, day) {
  const fixed = new Date(year, month - 1, day, 10, 0, 0).getTime();
  return () => fixed;
}

test("first touch initializes streak to 1", () => {
  const ds = new DailyState({ now: makeClock(2026, 6, 27) });
  ds.touch();
  assert.equal(ds.snapshot().streakDays, 1);
  assert.equal(ds.snapshot().dailyTapCount, 0);
});

test("touch on consecutive day increments streak", () => {
  let day = 27;
  const ds = new DailyState({ now: () => new Date(2026, 5, day, 10, 0, 0).getTime() });
  ds.touch();
  day = 28;
  ds.touch();
  assert.equal(ds.snapshot().streakDays, 2);
});

test("touch on same day does not change streak", () => {
  const ds = new DailyState({ now: makeClock(2026, 6, 27) });
  ds.touch();
  ds.touch();
  assert.equal(ds.snapshot().streakDays, 1);
});

test("skipping a day resets streak to 1", () => {
  let day = 27;
  const ds = new DailyState({ now: () => new Date(2026, 5, day, 10, 0, 0).getTime() });
  ds.touch();
  day = 30;
  ds.touch();
  assert.equal(ds.snapshot().streakDays, 1);
});

test("shouldGreet is true only when lastGreetingDate differs from today", () => {
  const ds = new DailyState({ now: makeClock(2026, 6, 27) });
  ds.touch();
  assert.equal(ds.shouldGreet(), true);
  ds.markGreeted();
  assert.equal(ds.shouldGreet(), false);
});

test("recordTap/Feed/Pet increments only matching counter", () => {
  const ds = new DailyState({ now: makeClock(2026, 6, 27) });
  ds.recordTap();
  ds.recordTap();
  ds.recordFeed();
  ds.recordPet();
  assert.deepEqual(ds.snapshot(), {
    lastActiveDate: "2026-06-27",
    dailyTapCount: 2,
    dailyFeedCount: 1,
    dailyPetCount: 1,
    streakDays: 1,
    lastGreetingDate: null,
  });
});

test("load/snapshot round trip preserves state", () => {
  const ds = new DailyState({ now: makeClock(2026, 6, 27) });
  ds.recordTap();
  ds.markGreeted();
  const saved = ds.snapshot();
  const restored = new DailyState({ initialState: saved, now: makeClock(2026, 6, 27) });
  assert.deepEqual(restored.snapshot(), saved);
});

test("streak milestone text is exposed for non-milestone days as empty string", () => {
  const { streakTextForDays } = require("../src/renderer/mood-bubble");
  assert.equal(streakTextForDays(1), "");
  assert.match(streakTextForDays(3), /3/);
});