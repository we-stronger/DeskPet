const assert = require("node:assert/strict");
const test = require("node:test");

const { Clock } = require("../src/renderer/clock");

test("formats time and date using the provided clock", () => {
  const fixed = new Date(2026, 5, 27, 14, 5, 0);
  const clock = new Clock({ now: () => fixed });
  assert.equal(clock.formatTime(), "14:05");
  assert.equal(clock.formatDate(), "06/27 周六");
  assert.equal(clock.format(), "06/27 周六 14:05");
});

test("pads single-digit hours and minutes", () => {
  const fixed = new Date(2026, 0, 1, 3, 7, 0);
  const clock = new Clock({ now: () => fixed });
  assert.equal(clock.formatTime(), "03:07");
  assert.equal(clock.formatDate(), "01/01 周四");
});

test("uses Sunday as weekday 一 (zh)", () => {
  const fixed = new Date(2026, 5, 28, 12, 0, 0);
  const clock = new Clock({ now: () => fixed });
  assert.equal(clock.formatDate(), "06/28 周日");
});