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

test("plays intro frames once then cycles through loopFrames forever", () => {
  const musicActions = {
    music: { frames: 6, fps: 6, loop: true, loopFrames: [3, 5] },
    idle: { frames: 1, fps: 1, loop: true },
  };
  const controller = new AnimationController({ actions: musicActions, assetRoot: "../../frames" });
  controller.start("music");

  const seen = [];
  // Capture enough frames to play the 6-frame intro + many loop iterations.
  for (let i = 0; i < 16; i += 1) {
    seen.push(controller.frame);
    controller.advance();
  }

  // Intro: 1, 2, 3, 4, 5, 6 (currentFrame starts at 1; advance takes it to 2 first)
  assert.deepEqual(seen.slice(0, 6), [1, 2, 3, 4, 5, 6]);
  // After frame 6, switch to cycling loopFrames: 3, 5, 3, 5, ...
  assert.deepEqual(seen.slice(6, 16), [3, 5, 3, 5, 3, 5, 3, 5, 3, 5]);
  assert.equal(controller.action, "music", "music action stays current (no .next fallback)");
});

test("restarting an action with loopFrames resets to intro mode", () => {
  const musicActions = {
    music: { frames: 6, fps: 6, loop: true, loopFrames: [3, 5] },
    idle: { frames: 1, fps: 1, loop: true },
  };
  const controller = new AnimationController({ actions: musicActions, assetRoot: "../../frames" });
  controller.start("music");
  // Advance past the intro into loopFrames mode.
  for (let i = 0; i < 7; i += 1) controller.advance();
  assert.equal(controller.frame, 5, "should be in loopFrames mode by now");
  // Re-starting music resets to frame 1 and intro mode.
  controller.start("music");
  assert.equal(controller.frame, 1);
  // First advance should go to frame 2 (intro), not skip to loopFrames.
  controller.advance();
  assert.equal(controller.frame, 2);
});

test("actions without loopFrames still loop the standard 1..N pattern", () => {
  const controller = new AnimationController({ actions, assetRoot: "../../frames" });
  controller.start("drag");
  const seen = [];
  for (let i = 0; i < 10; i += 1) {
    seen.push(controller.frame);
    controller.advance();
  }
  // drag has frames:4, loop:true. Pattern: 1,2,3,4,1,2,3,4,1,2.
  assert.deepEqual(seen, [1, 2, 3, 4, 1, 2, 3, 4, 1, 2]);
});

test("ignores an empty loopFrames array and falls back to standard 1..N loop", () => {
  const fallbackActions = {
    odd: { frames: 3, fps: 6, loop: true, loopFrames: [] },
    idle: { frames: 1, fps: 1, loop: true },
  };
  const controller = new AnimationController({ actions: fallbackActions, assetRoot: "../../frames" });
  controller.start("odd");
  const seen = [];
  for (let i = 0; i < 8; i += 1) {
    seen.push(controller.frame);
    controller.advance();
  }
  // Empty loopFrames → standard loop: 1,2,3,1,2,3,1,2.
  assert.deepEqual(seen, [1, 2, 3, 1, 2, 3, 1, 2]);
});

