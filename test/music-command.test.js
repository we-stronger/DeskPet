const assert = require("node:assert/strict");
const test = require("node:test");

const {
  musicActionFromCommand,
  musicFeedbackCommandForAction,
  musicVisualActionForFeedbackCommand,
} = require("../src/music-command");

test("maps the context-menu play/pause command to the media-control action", () => {
  assert.equal(musicActionFromCommand("music:play-pause"), "playPause");
});

test("maps next and previous music commands without changing their action names", () => {
  assert.equal(musicActionFromCommand("music:next"), "next");
  assert.equal(musicActionFromCommand("music:previous"), "previous");
});

test("rejects unknown music commands", () => {
  assert.equal(musicActionFromCommand("music:stop"), null);
  assert.equal(musicActionFromCommand("happy"), null);
});

test("maps media-control actions to renderer feedback commands", () => {
  assert.equal(musicFeedbackCommandForAction("playPause"), "music:feedback:play-pause");
  assert.equal(musicFeedbackCommandForAction("next"), "music:feedback:next");
  assert.equal(musicFeedbackCommandForAction("previous"), "music:feedback:previous");
  assert.equal(musicFeedbackCommandForAction("stop"), "music:feedback:failed");
});

test("maps successful music feedback commands to the listening animation", () => {
  assert.deepEqual(musicVisualActionForFeedbackCommand("music:feedback:play-pause"), {
    action: "music",
    durationMs: 3200,
  });
  assert.deepEqual(musicVisualActionForFeedbackCommand("music:feedback:next"), {
    action: "music",
    durationMs: 3200,
  });
  assert.deepEqual(musicVisualActionForFeedbackCommand("music:feedback:previous"), {
    action: "music",
    durationMs: 3200,
  });
  assert.deepEqual(musicVisualActionForFeedbackCommand("music:feedback:open-song"), {
    action: "music",
    durationMs: 3200,
  });
  assert.deepEqual(musicVisualActionForFeedbackCommand("music:feedback:open-success"), {
    action: "music",
    durationMs: 3200,
  });
});

test("does not play the listening animation for failed music feedback", () => {
  assert.equal(musicVisualActionForFeedbackCommand("music:feedback:open-failed"), null);
  assert.equal(musicVisualActionForFeedbackCommand("music:feedback:error"), null);
  assert.equal(musicVisualActionForFeedbackCommand("music:feedback:failed"), null);
  assert.equal(musicVisualActionForFeedbackCommand("music:feedback:qr-expired"), null);
  assert.equal(musicVisualActionForFeedbackCommand("idle"), null);
});
