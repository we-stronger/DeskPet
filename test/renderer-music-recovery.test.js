const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("renderer centralizes post-interruption recovery for music, sleep, and idle", () => {
  const source = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");

  assert.match(source, /function recoverAmbientAction\(\)/);
  assert.match(source, /DeskpetAudioPlayer/);
  assert.match(source, /audioPlayer && typeof audioPlayer\.getState === "function"/);
  assert.match(source, /if \(audioState && audioState\.playing\)\s*{\s*play\("music"\)/s);
  assert.match(source, /if \(petState\.sleeping\)\s*{\s*play\("sleep"\)/s);
  assert.match(source, /play\("idle"\);/);
});

test("drag end and temporary actions reuse the same ambient recovery helper", () => {
  const source = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");

  assert.match(source, /temporaryActionTimer = setTimeout\(\(\) => \{[\s\S]*recoverAmbientAction\(\)/);
  assert.match(source, /else if \(releaseAction === "idle"\) \{[\s\S]*recoverAmbientAction\(\);/);
  assert.doesNotMatch(source, /else if \(releaseAction === "idle"\) \{[\s\S]*play\("idle"\);/);
});
