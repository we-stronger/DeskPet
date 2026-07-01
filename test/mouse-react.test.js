const assert = require("node:assert/strict");
const test = require("node:test");

const { MouseReact } = require("../src/renderer/mouse-react");

test("returns no reaction before cooldown expires", () => {
  let now = 0;
  const r = new MouseReact({ now: () => now, cooldownMs: 20000, longHoverMs: 100000 });
  assert.equal(r.notifyPointerInside(), null);
  now = 10000;
  assert.equal(r.notifyPointerInside(), null);
});

test("emits a short reaction after cooldown when hover is brief", () => {
  let now = 0;
  const r = new MouseReact({ now: () => now, cooldownMs: 20000, longHoverMs: 100000 });
  r.notifyPointerInside();
  now = 20001;
  const out = r.notifyPointerInside();
  assert.equal(out.kind, "react");
  assert.ok(out.text.length > 0);
});

test("long hover escalates with happy tone for high mood", () => {
  let now = 0;
  const r = new MouseReact({ now: () => now, cooldownMs: 20000, longHoverMs: 5000 });
  r.notifyPointerInside();
  now = 21000;
  const out = r.notifyPointerInside({ mood: 90 });
  assert.equal(out.kind, "escalate");
  assert.equal(out.tone, "happy");
});

test("long hover escalates with pout tone for low mood", () => {
  let now = 0;
  const r = new MouseReact({ now: () => now, cooldownMs: 20000, longHoverMs: 5000 });
  r.notifyPointerInside();
  now = 21000;
  const out = r.notifyPointerInside({ mood: 10 });
  assert.equal(out.kind, "escalate");
  assert.equal(out.tone, "pout");
});

test("reset clears cooldown and hover start time", () => {
  let now = 0;
  const r = new MouseReact({ now: () => now, cooldownMs: 20000 });
  r.notifyPointerInside();
  now = 5000;
  r.reset();
  now = 6000;
  assert.equal(r.notifyPointerInside(), null);
});
