const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const renderer = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "renderer.js"), "utf8");

test("renderer delegates audio status subscriptions to MusicStatusRuntime", () => {
  assert.match(renderer, /new window\.DeskpetMusicStatusRuntime\.MusicStatusRuntime/);
  assert.match(renderer, /musicStatusRuntime\.start\(/);
});

test("renderer delegates pet pointer lifecycle to PetInteractionRuntime", () => {
  assert.match(renderer, /new window\.DeskpetPetInteractionRuntime\.PetInteractionRuntime/);
  assert.match(renderer, /petInteractionRuntime\.pointerDown\(event\)/);
  assert.match(renderer, /petInteractionRuntime\.pointerUp\(event\)/);
});
