const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { actions } = require("../src/renderer/action-config");
const root = path.join(__dirname, "..");

test("uses slower desktop-pet animation rates", () => {
  assert.equal(actions.idle.fps, 5);
  assert.equal(actions.blink.fps, 7);
  assert.equal(actions.tap.fps, 7);
  assert.equal(actions.happy.fps, 6);
  assert.equal(actions.sleep.fps, 4);
  assert.equal(actions.walk.fps, 6);
  assert.equal(actions.music.fps, 6);
  assert.equal(actions.drag.fps, 0);
});

test("keeps drag visually stable by holding a single frame", () => {
  assert.equal(actions.drag.frames, 1);
  assert.equal(actions.drag.fps, 0);
  assert.equal(actions.drag.loop, true);
});

test("defines music as a six-frame looping action", () => {
  assert.deepEqual(actions.music, { frames: 6, fps: 6, loop: true });
});

test("every configured action has matching PNG frame files", () => {
  for (const [action, config] of Object.entries(actions)) {
    for (let frame = 1; frame <= config.frames; frame += 1) {
      const frameName = String(frame).padStart(2, "0");
      const filename = path.join(root, "frames", action, `${action}_${frameName}.png`);
      assert.equal(fs.existsSync(filename), true, `${action} frame ${frameName} is missing`);
    }
  }
});
