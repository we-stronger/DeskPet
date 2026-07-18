const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FocusPetBridge,
  PetBehaviorPriority,
} = require("../src/renderer/focus-pet-bridge");

function createBridge() {
  let now = 1000;
  const behaviors = [];
  const bubbles = [];
  const quietModes = [];
  const bridge = new FocusPetBridge({
    now: () => now,
    interactionBubbleCooldownMs: 800,
    onBehavior: (request) => behaviors.push(request),
    onBubble: (request) => bubbles.push(request),
    onQuietMode: (quiet) => quietModes.push(quiet),
    resolveAmbientAction: () => "idle",
  });
  return {
    bridge,
    behaviors,
    bubbles,
    quietModes,
    advance(ms) { now += ms; },
  };
}

test("focus start enables quiet mode and requests a stable companion action", () => {
  const { bridge, behaviors, quietModes } = createBridge();
  const result = bridge.handleSessionEvent({
    type: "focus-started",
    snapshot: { phase: "focus", status: "running" },
  });

  assert.equal(quietModes.at(-1), true);
  assert.equal(result.action, "idle");
  assert.equal(result.priority, PetBehaviorPriority.Focus);
  assert.equal(behaviors.at(-1).reason, "focus-started");
});

test("focus completion emits one high-priority action and one status bubble", () => {
  const { bridge, behaviors, bubbles } = createBridge();
  const event = {
    type: "phase-completed",
    snapshot: { phase: "waiting-for-break", status: "waiting", suggestedBreakPhase: "short-break" },
  };

  const first = bridge.handleSessionEvent(event);
  const duplicate = bridge.handleSessionEvent(event);

  assert.equal(first.action, "happy");
  assert.equal(first.priority, PetBehaviorPriority.PhaseCompletion);
  assert.equal(duplicate.ignored, true);
  assert.equal(behaviors.length, 1);
  assert.equal(bubbles.length, 1);
  assert.match(bubbles[0].text, /休息/);
});

test("dragging outranks interactions and restores focus behavior on release", () => {
  const { bridge, behaviors } = createBridge();
  const drag = bridge.beginDrag();
  const interaction = bridge.requestInteraction({ action: "happy", bubble: "Hello" });
  const release = bridge.endDrag({ phase: "focus", status: "running" });

  assert.equal(drag.priority, PetBehaviorPriority.Drag);
  assert.equal(interaction.ignored, true);
  assert.equal(release.action, "idle");
  assert.deepEqual(behaviors.map((item) => item.action), ["drag", "idle"]);
});

test("stale action completion cannot restore over a newer behavior", () => {
  const { bridge, behaviors } = createBridge();
  const interaction = bridge.requestInteraction({ action: "happy" });
  const drag = bridge.beginDrag();

  assert.equal(bridge.completeAction(interaction.token, { phase: "idle", status: "idle" }), false);
  assert.equal(bridge.completeAction(drag.token, { phase: "idle", status: "idle" }), true);
  assert.deepEqual(behaviors.map((item) => item.action), ["happy", "drag", "idle"]);
});

test("interaction bubble cooldown suppresses repeated text without dropping the action", () => {
  const { bridge, behaviors, bubbles, advance } = createBridge();
  bridge.requestInteraction({ action: "happy", bubble: "Nice", bubbleKey: "pet" });
  advance(100);
  bridge.requestInteraction({ action: "happy", bubble: "Again", bubbleKey: "pet" });
  advance(800);
  bridge.requestInteraction({ action: "happy", bubble: "Ready", bubbleKey: "pet" });

  assert.equal(behaviors.length, 3);
  assert.deepEqual(bubbles.map((item) => item.text), ["Nice", "Ready"]);
});

test("break completion waits for the user to start focus again", () => {
  const { bridge, bubbles, quietModes } = createBridge();
  bridge.handleSessionEvent({
    type: "phase-completed",
    snapshot: { phase: "waiting-for-focus", status: "waiting" },
  });

  assert.equal(quietModes.at(-1), false);
  assert.match(bubbles.at(-1).text, /下一轮/);
});
