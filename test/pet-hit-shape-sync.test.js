// Tests for the stale-frame discard logic in refreshPetShape. The renderer
// kicks off an async hit-test for every frame; without discarding stale
// resolves, a slow decode can apply the wrong frame's clickable shape to
// the currently-rendered image, causing visible flicker on transitions.
const assert = require("node:assert/strict");
const test = require("node:test");

// Re-implement the same contract the renderer uses, so we can test the
// race-condition logic without booting a full renderer DOM.
function makeRefreshPetShape({ animation, hitTester, updatePetShape }) {
  let lastShapeFrameSrc = null;
  function refreshPetShape() {
    const src = animation.currentFramePath();
    lastShapeFrameSrc = src;
    hitTester.load(src).then((imageData) => {
      if (lastShapeFrameSrc !== src) return;
      updatePetShape({ src, imageData });
    }).catch(() => {
      if (lastShapeFrameSrc !== src) return;
      updatePetShape({ src, imageData: null });
    });
  }
  return refreshPetShape;
}

function makeHitTester() {
  const pending = new Map();
  return {
    pending,
    load(src) {
      if (!pending.has(src)) {
        const { promise, resolve, reject } = Promise.withResolvers();
        pending.set(src, { resolve, reject });
        return promise;
      }
      // Should never get here in practice — load is called once per src.
      throw new Error("duplicate load for " + src);
    },
  };
}

const flush = () => new Promise((r) => setImmediate(r));

test("discards stale hit-test results when the animation has advanced", async () => {
  const updates = [];
  const animation = {
    currentFramePath() {
      return this.action + "/" + this.frame + ".png";
    },
    action: "idle",
    frame: 1,
  };
  const hitTester = makeHitTester();
  const refresh = makeRefreshPetShape({
    animation,
    hitTester,
    updatePetShape: (u) => updates.push(u),
  });
  // Tick 1: renderer issues refresh for idle/1.png.
  animation.action = "idle"; animation.frame = 1;
  refresh();
  // Animation advances BEFORE the previous promise resolves.
  animation.action = "idle"; animation.frame = 2;
  refresh();
  // Resolve idle/1.png FIRST (out of order).
  hitTester.pending.get("idle/1.png").resolve("stale-data");
  await flush();
  hitTester.pending.get("idle/2.png").resolve("current-data");
  await flush();
  // Only the current-frame update must have applied.
  assert.equal(updates.length, 1);
  assert.equal(updates[0].src, "idle/2.png");
  assert.equal(updates[0].imageData, "current-data");
});

test("applies the result when no frame advance has happened", async () => {
  const updates = [];
  const animation = {
    currentFramePath() { return this.action + "/" + this.frame + ".png"; },
    action: "walk",
    frame: 3,
  };
  const hitTester = makeHitTester();
  const refresh = makeRefreshPetShape({
    animation,
    hitTester,
    updatePetShape: (u) => updates.push(u),
  });
  refresh();
  hitTester.pending.get("walk/3.png").resolve("decoded");
  await flush();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].src, "walk/3.png");
  assert.equal(updates[0].imageData, "decoded");
});

test("does not call updatePetShape(null) when the in-flight load rejects late", async () => {
  const updates = [];
  const animation = {
    currentFramePath() { return this.action + "/" + this.frame + ".png"; },
    action: "idle",
    frame: 1,
  };
  const hitTester = makeHitTester();
  const refresh = makeRefreshPetShape({
    animation,
    hitTester,
    updatePetShape: (u) => updates.push(u),
  });
  animation.action = "idle"; animation.frame = 1;
  refresh();
  // Advance frame and issue another refresh BEFORE the first rejects.
  animation.action = "idle"; animation.frame = 2;
  refresh();
  hitTester.pending.get("idle/1.png").reject(new Error("decode-failed"));
  await flush();
  hitTester.pending.get("idle/2.png").resolve("ok");
  await flush();
  // Only the live frame's resolve should fire updatePetShape. The stale
  // rejection must NOT have reset the shape to null.
  assert.equal(updates.length, 1);
  assert.equal(updates[0].src, "idle/2.png");
  assert.equal(updates[0].imageData, "ok");
});

test("multiple stale resolves are all discarded; only the latest applies", async () => {
  const updates = [];
  const animation = {
    currentFramePath() { return this.action + "/" + this.frame + ".png"; },
    action: "walk",
    frame: 1,
  };
  const hitTester = makeHitTester();
  const refresh = makeRefreshPetShape({
    animation,
    hitTester,
    updatePetShape: (u) => updates.push(u),
  });
  // Five rapid frame advances.
  for (let i = 1; i <= 5; i += 1) {
    animation.frame = i;
    refresh();
  }
  // Resolve all but the last in arbitrary order.
  hitTester.pending.get("walk/2.png").resolve("two");
  hitTester.pending.get("walk/4.png").resolve("four");
  hitTester.pending.get("walk/1.png").resolve("one");
  hitTester.pending.get("walk/3.png").resolve("three");
  await flush();
  // Only walk/5 is current; it hasn't resolved yet, so no update has fired.
  assert.equal(updates.length, 0);
  hitTester.pending.get("walk/5.png").resolve("five");
  await flush();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].src, "walk/5.png");
  assert.equal(updates[0].imageData, "five");
});