const assert = require("node:assert/strict");
const test = require("node:test");

const { shouldIgnorePetMouseEvents } = require("../src/renderer/pointer-action-policy");

test("music status click-through does not make the pet window globally click-through", () => {
  assert.equal(shouldIgnorePetMouseEvents({ petClickThroughEnabled: false, musicStatusClickThroughEnabled: true }), false);
  assert.equal(shouldIgnorePetMouseEvents({ petClickThroughEnabled: true, musicStatusClickThroughEnabled: false }), true);
  assert.equal(shouldIgnorePetMouseEvents({ petClickThroughEnabled: true, musicStatusClickThroughEnabled: true }), true);
});
