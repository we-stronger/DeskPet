# Interaction And UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten pet feedback bubbles and make music, chat, focus, and time interactions visually consistent, conflict-free, and explicit about loading, empty, and failure states.

**Architecture:** Keep playback and persistence ownership where it is today. Add small pure helpers for bubble and widget coordination, expose queue capabilities from the existing playback service, and have renderer surfaces render availability from that state. The fixed 512x512 pet window remains unchanged.

**Tech Stack:** Electron, CommonJS, browser JavaScript/CSS/HTML, Node built-in `node:test`.

**Git constraint:** The target renderer, music, styles, and test files already contain unrelated uncommitted changes. Preserve them; inspect staged hunks before any implementation commit and do not reset or checkout files.

---

### Task 1: Tighten The Bubble Anchor

**Files:**
- Modify: `src/renderer/widget-anchor.js`
- Modify: `test/widget-anchor.test.js`

- [ ] **Step 1: Add a failing preferred-gap test**

```js
test("bubble top-right anchor stays within a 6-14px preferred gap before clamping", () => {
  const bbox = { x: 120, y: 40, width: 150, height: 380 };
  const anchor = computeWidgetAnchor({
    role: "bubble",
    widgetSize: { width: 180, height: 78 },
    imageData: { width: 512, height: 512 },
    margins: [],
    bbox,
    padding: 4,
  });

  assert.ok(anchor.x - (bbox.x + bbox.width) >= 6);
  assert.ok(anchor.x - (bbox.x + bbox.width) <= 14);
});
```

- [ ] **Step 2: Run the anchor test in red state**

Run: `node --test test/widget-anchor.test.js`

Expected: FAIL because `anchorBubbleTopRight` currently uses a 16-28px gap.

- [ ] **Step 3: Change only the preferred horizontal gap**

In `anchorBubbleTopRight`, replace the offset calculation with:

```js
const xOffset = clamp(Math.round(bbox.width * 0.06), 6, 14);
```

Do not change the existing top offset or stage clamp calculation.

- [ ] **Step 4: Verify the anchor suite**

Run: `node --test test/widget-anchor.test.js`

Expected: PASS, including the existing right-edge clamp test.

### Task 2: Resolve Persistent Widget Collisions

**Files:**
- Create: `src/renderer/widget-coordination.js`
- Modify: `src/renderer/renderer.js`
- Create: `test/widget-coordination.test.js`

- [ ] **Step 1: Write failing pure-layout tests**

```js
test("resolveWidgetPositions keeps music fixed and shifts a colliding focus indicator", () => {
  const result = resolveWidgetPositions({
    stage: { width: 512, height: 512 },
    music: { visible: true, position: { x: 12, y: 420 }, size: { width: 260, height: 96 } },
    focus: { visible: true, position: { x: 12, y: 420 }, size: { width: 126, height: 34 } },
    clock: { visible: false },
  });

  assert.deepEqual(result.music, { x: 12, y: 416 });
  assert.notDeepEqual(result.focus, result.music);
  assert.ok(result.focus.y < result.music.y);
});
```

Add a second test where an explicit non-overlapping saved position is returned unchanged and a third where a hidden widget has no result entry.

- [ ] **Step 2: Run the new layout test in red state**

Run: `node --test test/widget-coordination.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure coordinator**

Create `src/renderer/widget-coordination.js` exporting:

```js
function clampPosition(position, size, stage) {
  return {
    x: Math.max(0, Math.min(stage.width - size.width, Math.round(position.x))),
    y: Math.max(0, Math.min(stage.height - size.height, Math.round(position.y))),
  };
}

function overlaps(a, aSize, b, bSize, gap = 8) {
  return a.x < b.x + bSize.width + gap && a.x + aSize.width + gap > b.x
    && a.y < b.y + bSize.height + gap && a.y + aSize.height + gap > b.y;
}

function resolveWidgetPositions({ stage, music, focus, clock }) {
  const result = {};
  if (music && music.visible) result.music = clampPosition(music.position, music.size, stage);
  if (focus && focus.visible) {
    const saved = clampPosition(focus.position, focus.size, stage);
    const candidates = result.music
      ? [{ x: result.music.x, y: result.music.y - focus.size.height - 8 },
        { x: result.music.x + music.size.width + 8, y: result.music.y }, saved]
      : [saved];
    result.focus = candidates.map((item) => clampPosition(item, focus.size, stage))
      .find((item) => !result.music || !overlaps(item, focus.size, result.music, music.size)) || saved;
  }
  if (clock && clock.visible) {
    const saved = clampPosition(clock.position, clock.size, stage);
    const candidates = [saved, { x: 8, y: 8 }, { x: stage.width - clock.size.width - 8, y: 8 }];
    result.clock = candidates.map((item) => clampPosition(item, clock.size, stage)).find((item) =>
      (!result.music || !overlaps(item, clock.size, result.music, music.size))
      && (!result.focus || !overlaps(item, clock.size, result.focus, focus.size))) || saved;
  }
  return result;
}
```

`resolveWidgetPositions` clamps the visible music widget first, then tries focus above music, then beside music, and finally its clamped saved position. It places clock after both and tries its clamped saved position, upper-left, then upper-right. It omits hidden widgets.

- [ ] **Step 4: Integrate only automatic placement in `renderer.js`**

Load the module from `index.html` before `renderer.js`. In `syncWidgetPositions`, pass the stage dimensions and current widget visibility/positions to `resolveWidgetPositions`. Apply returned positions only when that widget is not being dragged. Keep existing drag persistence fields (`clockPosition`, `focusIndicatorPosition`, `musicStatusPosition`) unchanged.

- [ ] **Step 5: Verify focused layout tests**

Run: `node --test test/widget-coordination.test.js test/widget-anchor.test.js`

Expected: PASS.

### Task 3: Make Music Controls Reflect Queue Availability

**Files:**
- Modify: `src/renderer/music-playback-service.js`
- Modify: `src/renderer/music-status-view.js`
- Modify: `src/renderer/renderer.js`
- Modify: `test/music-playback-service.test.js`
- Modify: `test/music-status-view.test.js`

- [ ] **Step 1: Add failing queue-capability tests**

```js
test("getPlaybackCapabilities disables adjacent controls without a queue", () => {
  service.hydratePlaybackState({ queue: [], currentIndex: -1 });
  assert.deepEqual(service.getPlaybackCapabilities(), {
    hasQueue: false,
    canPlayPrevious: false,
    canPlayNext: false,
  });
});

test("getPlaybackCapabilities enables both adjacent controls for a queued song", () => {
  service.hydratePlaybackState({ queue: [{ id: "1", title: "A" }], currentIndex: 0 });
  assert.equal(service.getPlaybackCapabilities().canPlayNext, true);
  assert.equal(service.getPlaybackCapabilities().canPlayPrevious, true);
});
```

Add a status-view assertion that disabled controls render `disabled aria-disabled="true"` and keep their title text.

- [ ] **Step 2: Run music focused tests in red state**

Run: `node --test test/music-playback-service.test.js test/music-status-view.test.js`

Expected: FAIL because the service has no capability API and the status renderer has no disabled-button contract.

- [ ] **Step 3: Implement capability and disabled control rendering**

In `music-playback-service.js` add:

```js
function getPlaybackCapabilities() {
  const hasQueue = currentQueue.length > 0 && currentQueueIndex >= 0;
  return { hasQueue, canPlayPrevious: hasQueue, canPlayNext: hasQueue };
}
```

Export it through the existing `api`. In `music-status-view.js`, change `renderButton` to accept `{ disabled = false }` and emit `disabled aria-disabled="true"` when disabled. Pass the renderer-provided queue capabilities to previous/next buttons.

In `renderer.js`, derive capabilities from `DeskpetMusicPlaybackService.getPlaybackCapabilities()` whenever the music status bar is rendered. When a disabled previous/next button is clicked through an older DOM surface, show `播放列表为空。` and do not invoke `playNext` or `playPrevious`.

- [ ] **Step 4: Verify music focused tests**

Run: `node --test test/music-playback-service.test.js test/music-status-view.test.js test/renderer-music-recovery.test.js`

Expected: PASS.

### Task 4: Polish Chat And Focus Interaction States

**Files:**
- Modify: `src/renderer/chat.js`
- Modify: `src/renderer/chat.html`
- Modify: `src/renderer/renderer.js`
- Modify: `src/renderer/styles.css`
- Modify: `test/chat-ui-memory-mode.test.js`
- Modify: `test/ui-redesign-contract.test.js`

- [ ] **Step 1: Add failing UI contract tests**

Add assertions that the chat renderer has a single `setMemoryControlsDisabled(disabled)` helper, calls it while a memory mutation is in flight, and does not issue a memory-management bridge call when `chatMode === "temporary"`. Add CSS assertions for `.chat-memory-entry__action:disabled`, `.music-status-bar__button:disabled`, and `.focus-indicator.is-paused`.

- [ ] **Step 2: Run UI tests in red state**

Run: `node --test test/chat-ui-memory-mode.test.js test/ui-redesign-contract.test.js`

Expected: FAIL because the shared disabled-state hooks are absent.

- [ ] **Step 3: Add local busy states and concise feedback**

In `chat.js`, implement:

```js
function setMemoryControlsDisabled(disabled) {
  [memoryToggle, memoryQueryInput, memoryCategorySelect, memoryNewCategory,
    memoryNewContent, memoryNewPinned, clearSummaryButton]
    .filter(Boolean)
    .forEach((element) => { element.disabled = disabled; });
}
```

Wrap `applyMemoryMutation` in `setMemoryControlsDisabled(true)` / `finally { setMemoryControlsDisabled(false); }`. Preserve the existing row-level action click target and the existing error status wording. In temporary mode, keep the panel closed and do not call any memory bridge except the remembered-state reload that occurs after switching back.

In `renderer.js`, update focus start, pause/resume, reset, and end handlers to set one short status/bubble message and update button `aria-pressed`/disabled state from `focusTimer.phase`. Do not create new native windows or change timer persistence.

- [ ] **Step 4: Add responsive disabled, busy, and long-text styles**

In `styles.css`, add visible disabled rules using opacity plus `cursor: not-allowed`, preserve fixed button dimensions, and use `overflow-wrap: anywhere` for memory/focus status content. Keep the existing token palette and 8px-or-less control radius.

- [ ] **Step 5: Verify chat/focus UI tests**

Run: `node --test test/chat-ui-memory-mode.test.js test/ui-redesign-contract.test.js test/focus-timer.test.js`

Expected: PASS.

### Task 5: Full Verification

**Files:**
- Modify only if a listed verification command identifies a regression.

- [ ] **Step 1: Run syntax checks**

```powershell
node --check src/renderer/widget-anchor.js
node --check src/renderer/widget-coordination.js
node --check src/renderer/music-playback-service.js
node --check src/renderer/music-status-view.js
node --check src/renderer/renderer.js
node --check src/renderer/chat.js
```

Expected: every command exits 0.

- [ ] **Step 2: Run all focused tests**

```powershell
node --test test/widget-anchor.test.js test/widget-coordination.test.js test/music-playback-service.test.js test/music-status-view.test.js test/chat-ui-memory-mode.test.js test/ui-redesign-contract.test.js
```

Expected: all tests pass.

- [ ] **Step 3: Run complete automated verification**

Run: `npm.cmd test`

Expected: zero failures.

- [ ] **Step 4: Run Electron smoke verification**

Run: `npm.cmd run smoke`

Expected: exit 0 and output containing `renderer loaded`.

- [ ] **Step 5: Manual acceptance**

Run `npm.cmd start` and verify: the bubble sits close to the character without clipping at the right stage edge; music previous/next disable for an empty queue; music, focus, and clock can be dragged apart; temporary chat cannot open memory management; and long labels do not overlap controls.
