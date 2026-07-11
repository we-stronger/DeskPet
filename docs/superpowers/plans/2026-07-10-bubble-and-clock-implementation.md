# Bubble And Clock Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all regular pet state bubbles to a stable top-right speech-bubble layout and keep the date/time widget explicitly hideable through persisted settings.

**Architecture:** Keep the existing single `#mood-bubble` instance, but split bubble placement into a dedicated top-right anchor path instead of reusing the old generic margin-first placement. Preserve the existing `clockEnabled` persistence flow and add regression coverage around renderer behavior and widget-anchor math.

**Tech Stack:** Electron renderer, plain browser DOM, Node `node:test`, `node:assert/strict`

---

### Task 1: Add failing tests for the new bubble anchor behavior

**Files:**
- Modify: `test/widget-anchor.test.js`
- Modify: `src/renderer/widget-anchor.js`

- [ ] **Step 1: Write the failing test**

```js
test("bubble anchor uses a dedicated top-right outside position tied to the pet bbox", () => {
  const image = makeSleepLikeImage({ top: 16, bottom: 8, left: 146, right: 146 });
  const bbox = bboxOf(image);
  const margins = emptyMarginsOf(bbox, image.width, image.height);

  const anchor = computeWidgetAnchor({
    role: "bubble",
    widgetSize: { width: 140, height: 72 },
    imageData: image,
    margins,
    bbox,
    padding: 4,
  });

  assert.ok(anchor);
  assert.equal(anchor.side, "pet-top-right");
  assert.ok(anchor.x > bbox.x + bbox.width / 2, "bubble should sit to the right of the pet center");
  assert.ok(anchor.y >= bbox.y - 12, "bubble should not float far above the pet");
});

test("bubble anchor clamps back inside the stage when the pet is near the right edge", () => {
  const bbox = { x: 380, y: 36, width: 110, height: 360 };
  const anchor = computeWidgetAnchor({
    role: "bubble",
    widgetSize: { width: 160, height: 80 },
    imageData: { width: 512, height: 512 },
    margins: [],
    bbox,
    padding: 4,
  });

  assert.ok(anchor);
  assert.equal(anchor.side, "pet-top-right");
  assert.ok(anchor.x <= 512 - 80 - 4, "bubble center should be clamped inside the stage");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/widget-anchor.test.js`  
Expected: FAIL because `computeWidgetAnchor()` still returns `right` / `outside-*` instead of `pet-top-right`.

- [ ] **Step 3: Write minimal implementation**

```js
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function anchorBubbleTopRight(bbox, imageWidth, imageHeight, widgetSize, padding) {
  const xOffset = clamp(Math.round(bbox.width * 0.14), 18, 34);
  const yOffset = clamp(Math.round(bbox.height * 0.06), 10, 26);
  const minCenterX = widgetSize.width / 2 + padding;
  const maxCenterX = imageWidth - widgetSize.width / 2 - padding;
  const minY = padding;
  const maxY = imageHeight - widgetSize.height - padding;
  return {
    side: "pet-top-right",
    x: clamp(bbox.x + bbox.width + xOffset, minCenterX, maxCenterX),
    y: clamp(bbox.y + yOffset, minY, maxY),
  };
}

function computeWidgetAnchor(options) {
  const { role = "clock", bbox, imageData, widgetSize } = options;
  const effectiveSize = widgetSize || ROLE_WIDGET_SIZE[role] || { width: 60, height: 40 };
  const imgW = imageData?.width || (bbox.x + bbox.width + 100);
  const imgH = imageData?.height || imageData?.width || (bbox.y + bbox.height + 100);

  if (role === "bubble" && bbox) {
    return anchorBubbleTopRight(bbox, imgW, imgH, effectiveSize, options.padding ?? 4);
  }

  // existing clock / fallback logic stays here
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/widget-anchor.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add test/widget-anchor.test.js src/renderer/widget-anchor.js
git commit -m "test: pin bubble anchor to pet top-right"
```

### Task 2: Add renderer regression coverage for the clock toggle and bubble placement contract

**Files:**
- Modify: `test/renderer-script-loading.test.js`
- Create or Modify: `test/settings-live-sync.test.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/renderer.js`

- [ ] **Step 1: Write the failing tests**

```js
test("renderer index keeps the clock toggle input available in the settings panel", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  assert.match(html, /id="clock-enabled-input"/);
});

test("behavior settings keep clockEnabled when updating unrelated fields", async () => {
  const updates = [];
  const bridge = { updateSettings: async (payload) => updates.push(payload) };
  const state = { clockEnabled: false };

  await saveBehaviorSettingsLikeRenderer(bridge, state, { autoWalkEnabled: true });

  assert.deepEqual(updates.at(-1), {
    autoWalkEnabled: true,
    clockEnabled: false,
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/renderer-script-loading.test.js test/settings-live-sync.test.js`  
Expected: at least one FAIL because there is no focused regression coverage for `clockEnabled` persistence path.

- [ ] **Step 3: Write minimal implementation**

```js
function saveBehaviorSettings() {
  if (!bridge || typeof bridge.updateSettings !== "function") {
    return;
  }
  queueSettingsUpdate({
    autoBehaviorEnabled,
    autoWalkEnabled,
    mouseReactEnabled,
    dailyGreetingEnabled,
    clockEnabled,
  });
}
```

```html
<label class="settings-panel__check">
  <input id="clock-enabled-input" type="checkbox" checked />
  <span>日期时间</span>
</label>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/renderer-script-loading.test.js test/settings-live-sync.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add test/renderer-script-loading.test.js test/settings-live-sync.test.js src/renderer/index.html src/renderer/renderer.js
git commit -m "test: cover clock toggle persistence path"
```

### Task 3: Apply the new bubble visuals and keep all tests green

**Files:**
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/renderer.js`
- Modify: `src/pet-settings-store.js`
- Modify: `test/pet-settings-store.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("normalizes explicit false for clockEnabled", () => {
  const normalized = normalizePetSettings({ clockEnabled: false });
  assert.equal(normalized.clockEnabled, false);
});
```

Add a renderer-level assertion in an existing renderer-focused test file:

```js
test("clock widget hides immediately when clockEnabled is false", () => {
  const clock = { hidden: false, classList: fakeClassList() };
  updateClockWidgetLikeRenderer({ clockEl: clock, clockEnabled: false });
  assert.equal(clock.hidden, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/pet-settings-store.test.js test/settings-live-sync.test.js`  
Expected: FAIL because the helper assertions do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```css
.mood-bubble {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 8;
  max-width: 220px;
  padding: 10px 14px;
  border-radius: 18px;
  transform: translateY(4px) scale(0.98);
}

.mood-bubble::after {
  content: "";
  position: absolute;
  left: 16px;
  bottom: 10px;
  width: 14px;
  height: 14px;
  transform: translate(-55%, 85%) rotate(45deg);
}
```

```js
function placeBubble(anchor) {
  if (!moodBubble || !anchor) return;
  moodBubble.style.left = `${anchor.x}px`;
  moodBubble.style.top = `${anchor.y}px`;
  moodBubble.style.transform = "translateY(0)";
}
```

- [ ] **Step 4: Run targeted tests, then the relevant suite**

Run:
- `node --test test/widget-anchor.test.js`
- `node --test test/pet-settings-store.test.js`
- `npm.cmd test`

Expected:
- targeted tests PASS
- full suite PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles.css src/renderer/renderer.js src/pet-settings-store.js test/pet-settings-store.test.js test/widget-anchor.test.js test/settings-live-sync.test.js
git commit -m "feat: move pet bubbles and preserve clock toggle"
```

## Self-Review

- Spec coverage:
  - 统一状态气泡右上角：Task 1 + Task 3
  - 日期时间块显示/隐藏：Task 2 + Task 3
  - `clockEnabled` 持久化不回退：Task 2 + Task 3
- Placeholder scan:
  - 没有 `TODO` / `TBD`
  - 每个任务都有文件、测试、命令和最小代码
- Type consistency:
  - 统一使用 `clockEnabled`
  - 统一使用 `computeWidgetAnchor()` 作为 bubble 锚点入口
  - 没有引入新的设置字段名
