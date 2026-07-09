const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("preload exposes an audio host result bridge", () => {
  const source = fs.readFileSync(path.join(root, "src", "preload.js"), "utf8");

  assert.match(source, /reportAudioHostResult\(payload\)/);
  assert.match(source, /ipcRenderer\.invoke\("music:audio-host-result"/);
});

test("main waits for the pet renderer audio host result instead of returning immediate success", () => {
  const source = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");

  assert.match(source, /pendingAudioHostRequests/);
  assert.match(source, /ipcMain\.handle\("music:audio-host-result"/);
  assert.match(source, /requestId/);
  assert.doesNotMatch(source, /return \{ success: true, method: "audio-host", songId: safePayload\.songId \};/);
});

test("pet renderer reports audio host playback failures back to main", () => {
  const source = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");

  assert.match(source, /reportAudioHostResult/);
  assert.match(source, /audio-host-failed/);
});
