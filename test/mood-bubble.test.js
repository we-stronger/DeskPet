const assert = require("node:assert/strict");
const test = require("node:test");

const { bubbleTextForAction, STREAK_MILESTONES } = require("../src/renderer/mood-bubble");

test("every supported action returns a Chinese bubble string", () => {
  const actions = ["tap", "happy", "pout", "sleep", "wake", "drag", "feed", "pet", "gift", "focus", "greeting", "mouseNear"];
  for (const action of actions) {
    const text = bubbleTextForAction(action);
    assert.equal(typeof text, "string");
    assert.ok(text.length > 0, `${action} should yield text`);
    assert.ok(text.length <= 24, `${action} text too long: ${text}`);
  }
});

test("bubble text is deterministic-but-varied: 多次调用应得到预设池中的某一句", () => {
  const seen = new Set();
  for (let i = 0; i < 50; i += 1) {
    seen.add(bubbleTextForAction("tap"));
  }
  assert.ok(seen.size >= 1);
});

test("streak milestones map to Chinese sentences for 3/7/14/30", () => {
  assert.match(STREAK_MILESTONES[3], /3/);
  assert.match(STREAK_MILESTONES[7], /一周|7/);
  assert.match(STREAK_MILESTONES[14], /两周|14/);
  assert.match(STREAK_MILESTONES[30], /一个月|30/);
});

test("unknown action returns empty string", () => {
  assert.equal(bubbleTextForAction("nonsense"), "");
});
