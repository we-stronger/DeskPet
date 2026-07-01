const assert = require("node:assert/strict");
const test = require("node:test");

const { AnimationController } = require("../src/renderer/animation-controller");

const actions = {
  idle: { frames: 8, fps: 8, loop: true },
  blink: { frames: 4, fps: 12, loop: false, next: "idle" },
  tap: { frames: 6, fps: 14, loop: false, next: "idle" },
  drag: { frames: 4, fps: 10, loop: true },
};

test("builds zero-padded PNG frame paths for the active action", () => {
  const controller = new AnimationController({ actions, assetRoot: "../../frames" });

  assert.equal(controller.currentFramePath(), "../../frames/idle/idle_01.png");

  controller.start("tap");
  assert.equal(controller.currentFramePath(), "../../frames/tap/tap_01.png");
});

test("plays a one-shot action once and returns to idle", () => {
  const controller = new AnimationController({ actions, assetRoot: "../../frames" });
  controller.start("tap");

  const seen = [];
  for (let i = 0; i < 7; i += 1) {
    seen.push(controller.currentFramePath());
    controller.advance();
  }

  assert.deepEqual(seen.slice(0, 6), [
    "../../frames/tap/tap_01.png",
    "../../frames/tap/tap_02.png",
    "../../frames/tap/tap_03.png",
    "../../frames/tap/tap_04.png",
    "../../frames/tap/tap_05.png",
    "../../frames/tap/tap_06.png",
  ]);
  assert.equal(seen[6], "../../frames/idle/idle_01.png");
  assert.equal(controller.action, "idle");
});

test("requests blink only while idle and returns to idle afterward", () => {
  const controller = new AnimationController({ actions, assetRoot: "../../frames" });

  assert.equal(controller.requestBlink(), true);
  assert.equal(controller.action, "blink");

  for (let i = 0; i < 4; i += 1) {
    controller.advance();
  }

  assert.equal(controller.action, "idle");
  controller.start("tap");
  assert.equal(controller.requestBlink(), false);
  assert.equal(controller.action, "tap");
});

test("applies a global speed multiplier to current fps", () => {
  const controller = new AnimationController({ actions, assetRoot: "../../frames" });

  assert.equal(controller.currentFps(), 8);
  controller.setSpeedMultiplier(0);
  assert.equal(controller.currentFps(), 0);
  controller.setSpeedMultiplier(0.6);
  assert.equal(controller.currentFps(), 4.8);
  controller.setSpeedMultiplier(1.4);
  assert.equal(controller.currentFps(), 11.2);
});

