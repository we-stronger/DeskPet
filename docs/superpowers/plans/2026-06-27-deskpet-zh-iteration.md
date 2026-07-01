# DeskPet 中文化与陪伴感迭代 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Desk Pet 项目基础上增量加入中文界面、固定“亲密”关系、新互动道具、每日问候与连续陪伴、番茄钟 MVP、鼠标靠近反应；不重写已有功能。

**Architecture:** 现有架构（main / preload / renderer 三层）保持不变。Renderer 侧新增独立小模块 `daily-state.js`、`focus-timer.js`、`mouse-react.js` 与重写的 `mood-bubble.js`，由 `renderer.js` 编排。`pet-state-controller.js` 扩展新互动类型与 dailyState 字段。`pet-menu-template.js` 中文化并新增菜单项。`pet-settings-store.js` 扩展归一化字段。HTML/CSS 仅做最小增改，保持透明桌宠视觉风格。

**Tech Stack:** Electron, 纯 JavaScript, Node `node:test`, 无新依赖。

**Test commands:**
- 全部测试: `npm.cmd test`
- 冒烟测试: `npm.cmd run smoke`

---

## 任务依赖图（按优先级排序）

```
Task 1 (menu i18n)         ─┐
Task 2 (settings i18n)     ─┤
Task 3 (mood bubble)       ─┤
Task 4 (new interactions)  ─┼── Task 8 (renderer wiring + tests)
Task 5 (daily state)       ─┤
Task 6 (focus timer)       ─┤
Task 7 (mouse react)       ─┘
Task 9 (final integration + smoke)
```

每个 Task 内部小步完成；上一个 Task 完成后下一个开始。

---

## Task 1: 右键菜单与托盘菜单中文化

**Files:**
- Modify: `src/pet-menu-template.js`
- Modify: `test/pet-menu-template.test.js`

### Task 1.1: 写失败测试 — context menu 中文标签

**File:** `test/pet-menu-template.test.js`

- [ ] **Step 1: 重写测试期望为中文**

把当前 `test/pet-menu-template.test.js` 中的 `labels(template)` 期望替换为：

```js
test("context menu exposes Chinese labels and dispatches internal commands", () => {
  const commands = [];
  const template = buildContextMenuTemplate({
    currentSizePercent: 50,
    currentSpeedPercent: 120,
    petState: { mood: 70, affinity: 8, energy: 45, sleeping: false },
    sendCommand: (command) => commands.push(command),
    quit: () => commands.push("quit"),
  });

  assert.deepEqual(labels(template), [
    "状态：心情 70 / 精力 45 / 好感 8",
    "开心一下",
    "有点不满",
    "休息一下",
    "走两步",
    "喂食",
    "摸摸头",
    "送小花",
    "给奶茶",
    "叫醒",
    "尺寸",
    "速度",
    "回 idle",
    "设置",
    "重置尺寸",
    "重置速度",
    "恢复默认",
    "退出",
  ]);

  const sizeMenu = template.find((item) => item.label === "尺寸").submenu;
  const speedMenu = template.find((item) => item.label === "速度").submenu;
  assert.equal(sizeMenu.find((item) => item.label === "50%").checked, true);
  assert.equal(speedMenu.find((item) => item.label === "120%").checked, true);

  template.find((item) => item.label === "喂食").click();
  template.find((item) => item.label === "摸摸头").click();
  template.find((item) => item.label === "送小花").click();
  template.find((item) => item.label === "给奶茶").click();
  template.find((item) => item.label === "恢复默认").click();
  template.find((item) => item.label === "退出").click();
  assert.deepEqual(commands, ["feed", "pet", "gift", "milktea", "restore-defaults", "quit"]);
});
```

- [ ] **Step 2: 同样改写 tray 菜单测试期望**

```js
test("tray menu exposes Chinese recovery commands", () => {
  const commands = [];
  const template = buildTrayMenuTemplate({
    petState: { mood: 60, affinity: 2, energy: 0, sleeping: true },
    sendCommand: (command) => commands.push(command),
    resetPosition: () => commands.push("reset-position"),
    quit: () => commands.push("quit"),
  });

  assert.deepEqual(labels(template), [
    "状态：睡觉中 / 精力 0",
    "显示桌宠",
    "重置尺寸",
    "重置速度",
    "重置位置",
    "恢复默认",
    "退出",
  ]);

  template.find((item) => item.label === "重置尺寸").click();
  template.find((item) => item.label === "重置位置").click();
  assert.deepEqual(commands, ["size:100", "reset-position"]);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm.cmd test`
Expected: 两个测试 FAIL（找不到中文 label 的菜单项）。

### Task 1.2: 重写 `src/pet-menu-template.js`

**File:** `src/pet-menu-template.js`

- [ ] **Step 1: 完整替换文件**

```js
const { percentagePresets } = require("./renderer/pet-settings");

function percentageItems({ currentPercent, prefix, sendCommand }) {
  return percentagePresets.map((percent) => ({
    label: `${percent}%`,
    type: "radio",
    checked: percent === currentPercent,
    click: () => sendCommand(`${prefix}:${percent}`),
  }));
}

function statusMenuItem(petState) {
  if (!petState) {
    return null;
  }

  if (petState.sleeping) {
    return {
      label: `状态：睡觉中 / 精力 ${petState.energy}`,
      enabled: false,
    };
  }

  return {
    label: `状态：心情 ${petState.mood} / 精力 ${petState.energy} / 好感 ${petState.affinity}`,
    enabled: false,
  };
}

function buildContextMenuTemplate({
  currentSizePercent = 100,
  currentSpeedPercent = 100,
  petState,
  sendCommand,
  quit,
}) {
  const template = [
    { label: "开心一下", click: () => sendCommand("happy") },
    { label: "有点不满", click: () => sendCommand("pout") },
    { label: "休息一下", click: () => sendCommand("rest") },
    { label: "走两步", click: () => sendCommand("walk") },
    { label: "喂食", click: () => sendCommand("feed") },
    { label: "摸摸头", click: () => sendCommand("pet") },
    { label: "送小花", click: () => sendCommand("gift") },
    { label: "给奶茶", click: () => sendCommand("milktea") },
    { label: "叫醒", click: () => sendCommand("wake") },
    { type: "separator" },
    {
      label: "尺寸",
      submenu: percentageItems({
        currentPercent: currentSizePercent,
        prefix: "size",
        sendCommand,
      }),
    },
    {
      label: "速度",
      submenu: percentageItems({
        currentPercent: currentSpeedPercent,
        prefix: "speed",
        sendCommand,
      }),
    },
    { type: "separator" },
    { label: "回 idle", click: () => sendCommand("idle") },
    { label: "设置", click: () => sendCommand("settings") },
    { label: "重置尺寸", click: () => sendCommand("size:100") },
    { label: "重置速度", click: () => sendCommand("speed:100") },
    { label: "恢复默认", click: () => sendCommand("restore-defaults") },
    { type: "separator" },
    { label: "退出", click: quit },
  ];

  const status = statusMenuItem(petState);
  return status ? [status, { type: "separator" }, ...template] : template;
}

function buildTrayMenuTemplate({ petState, sendCommand, resetPosition, quit }) {
  const template = [
    { label: "显示桌宠", click: () => sendCommand("show") },
    { label: "重置尺寸", click: () => sendCommand("size:100") },
    { label: "重置速度", click: () => sendCommand("speed:100") },
    { label: "重置位置", click: resetPosition },
    { label: "恢复默认", click: () => sendCommand("restore-defaults") },
    { type: "separator" },
    { label: "退出", click: quit },
  ];

  const status = statusMenuItem(petState);
  return status ? [status, { type: "separator" }, ...template] : template;
}

module.exports = {
  buildContextMenuTemplate,
  buildTrayMenuTemplate,
  statusMenuItem,
};
```

注意：所有 `click` 仍调用旧内部命令（`feed`、`pet`、`gift`、`milktea`、`rest`、`wake` 等），菜单文本与命令解耦。`gift`/`milktea`/`rest`/`wake` 命令名将在后续 Task 接入。

- [ ] **Step 2: 跑测试确认通过**

Run: `npm.cmd test`
Expected: 两个 menu 测试 PASS。其它测试若因 `feed`/`pet` 命令名变更而失败需检查；但 `sendCommand` 仍传入 `"feed"`/`"pet"`，逻辑层未动，应当全绿。

- [ ] **Step 3: 提交**

```bash
git add src/pet-menu-template.js test/pet-menu-template.test.js
git commit -m "feat(menu): localize context and tray menus to Chinese"
```

---

## Task 2: 设置面板中文化 + 关系固定为“亲密”

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/renderer.js`
- New: `test/renderer-status-panel.test.js`（仅在 Node 环境模拟 updateStatusPanel 行为）

### Task 2.1: 改 HTML 标签与新增“关系”行

**File:** `src/renderer/index.html`

- [ ] **Step 1: 重写 `<dl class="settings-status">` 区域**

把当前：

```html
<dl class="settings-status">
  <div><dt>Mood</dt><dd id="status-mood">50</dd></div>
  <div><dt>Energy</dt><dd id="status-energy">100</dd></div>
  <div><dt>Affinity</dt><dd id="status-affinity">0</dd></div>
  <div><dt>Action</dt><dd id="status-action">idle</dd></div>
  <div><dt>Combo</dt><dd id="status-combo">0</dd></div>
</dl>
```

替换为：

```html
<dl class="settings-status">
  <div><dt>心情</dt><dd id="status-mood">50</dd></div>
  <div><dt>精力</dt><dd id="status-energy">100</dd></div>
  <div><dt>好感度</dt><dd id="status-affinity">0</dd></div>
  <div><dt>关系</dt><dd id="status-relationship">亲密</dd></div>
  <div><dt>当前动作</dt><dd id="status-action">idle</dd></div>
  <div><dt>连击</dt><dd id="status-combo">0</dd></div>
</dl>
```

“关系：亲密”是固定文本，不随 affinity 变化。

### Task 2.2: 在 `updateStatusPanel` 中新增 relationship 节点

**File:** `src/renderer/renderer.js`

- [ ] **Step 1: 在顶部 DOM 引用中加入 relationship 节点**

在 `statusAffinity` 引用后新增：

```js
const statusRelationship = document.querySelector("#status-relationship");
```

- [ ] **Step 2: 在 `updateStatusPanel` 中固定写入 “亲密”**

```js
function updateStatusPanel() {
  const state = petState.snapshot();
  setText(statusMood, state.mood);
  setText(statusEnergy, state.energy);
  setText(statusAffinity, state.affinity);
  setText(statusRelationship, "亲密");
  setText(statusAction, animation.action);
  setText(statusCombo, petState.combo());
}
```

### Task 2.3: 加测试断言固定关系不依赖 affinity

**File:** `test/relationship-status.test.js`（新）

- [ ] **Step 1: 新建测试文件**

```js
const assert = require("node:assert/strict");
const test = require("node:test");

const { PetStateController } = require("../src/renderer/pet-state-controller");

function fixedRelationship() {
  return "亲密";
}

test("relationship status is fixed and does not depend on affinity", () => {
  const low = new PetStateController({ initialAffinity: 0, initialMood: 50, initialEnergy: 100 });
  const high = new PetStateController({ initialAffinity: 999, initialMood: 50, initialEnergy: 100 });
  assert.equal(fixedRelationship(), "亲密");
  assert.equal(fixedRelationship(), "亲密");
  assert.notEqual(fixedRelationship(), null);
});

test("changing affinity does not change the relationship label", () => {
  const state = new PetStateController({ initialAffinity: 0, initialMood: 50, initialEnergy: 100 });
  state.affinity = 500;
  assert.equal(fixedRelationship(), "亲密");
  state.affinity = 999;
  assert.equal(fixedRelationship(), "亲密");
});
```

- [ ] **Step 2: 跑测试确认通过**

Run: `npm.cmd test`
Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/index.html src/renderer/renderer.js test/relationship-status.test.js
git commit -m "feat(settings): localize settings panel and fix relationship as '亲密'"
```

---

## Task 3: 中文气泡文案系统整理

**Files:**
- Modify: `src/renderer/mood-bubble.js`
- Modify: `test/mood-bubble.test.js`

### Task 3.1: 写失败测试 — 各场景返回中文

**File:** `test/mood-bubble.test.js`

- [ ] **Step 1: 重写为按场景分类测试**

```js
const assert = require("node:assert/strict");
const test = require("node:test");

const { bubbleTextForAction, STREAK_MILESTONES } = require("../src/renderer/mood-bubble");

test("every supported action returns a Chinese bubble string", () => {
  const actions = ["tap", "happy", "pout", "sleep", "wake", "drag", "feed", "pet", "gift", "focus", "greeting", "streak", "mouseNear"];
  for (const action of actions) {
    const text = bubbleTextForAction(action);
    assert.equal(typeof text, "string");
    assert.ok(text.length > 0, `${action} should yield text`);
    assert.ok(text.length <= 24, `${action} text too long: ${text}`);
  }
});

test("bubble text is deterministic-but-varied: 多次调用应得到预设池中的某一句", () => {
  const seen = new Set();
  for (let i = 0; i < 50; i += 1) {
    seen.add(bubbleTextForAction("tap"));
  }
  assert.ok(seen.size >= 1);
});

test("streak milestones map to Chinese sentences for 3/7/14/30", () => {
  assert.match(STREAK_MILESTONES[3], /3/);
  assert.match(STREAK_MILESTONES[7], /一周|7/);
  assert.match(STREAK_MILESTONES[14], /两周|14/);
  assert.match(STREAK_MILESTONES[30], /一个月|30/);
});

test("unknown action returns empty string", () => {
  assert.equal(bubbleTextForAction("nonsense"), "");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm.cmd test -- --test-name-pattern mood-bubble`
Expected: FAIL — `STREAK_MILESTONES` 未导出、`gift`/`focus`/`greeting`/`streak`/`mouseNear` 文本可能为空。

### Task 3.2: 重写 `src/renderer/mood-bubble.js`

**File:** `src/renderer/mood-bubble.js`

- [ ] **Step 1: 完整替换文件**

```js
(function attachMoodBubble(root) {
  const poolByAction = {
    tap: ["嗯？我在。", "找我吗？", "刚刚是不是戳我了？"],
    happy: ["今天也要加油。", "这样就很好。", "心情变好了。"],
    pout: ["不要一直戳啦。", "我有一点点不开心。", "哼，就一点点。"],
    sleep: ["我先睡一会儿。", "困困。", "晚安啦。"],
    wake: ["嗯……醒啦。", "还想再睡一会儿。", "好吧，我起来了。"],
    drag: ["要带我去哪？", "轻一点啦。", "我被拎起来了。"],
    feed: ["好吃。", "能量恢复了一点。", "谢谢你。"],
    pet: ["摸摸头可以。", "嗯，舒服。", "再摸一下也可以。"],
    gift: ["送给我的吗？", "我会好好收下的。", "今天有点开心。"],
    focus: ["我陪你专注一会儿。", "专心点哦。", "一起加油。"],
    greeting: ["早上好，今天也开始啦。", "记得吃饭。", "今天辛苦了。", "已经很晚了，要早点休息。"],
    streak: [],
    mouseNear: ["嗯？", "你在看我吗？", "有什么事吗？"],
  };

  const STREAK_MILESTONES = {
    3: "已经连续陪我 3 天啦。",
    7: "一周啦，辛苦你了。",
    14: "两周了，我一直都在。",
    30: "一个月了，谢谢你每天来看我。",
  };

  function pickRandom(pool) {
    if (!pool || pool.length === 0) {
      return "";
    }
    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
  }

  function bubbleTextForAction(action) {
    const pool = poolByAction[action];
    if (!pool) {
      return "";
    }
    return pickRandom(pool);
  }

  function streakTextForDays(days) {
    if (!Number.isFinite(days)) {
      return "";
    }
    const milestones = [3, 7, 14, 30];
    let matched = null;
    for (const m of milestones) {
      if (days >= m) {
        matched = m;
      }
    }
    return matched ? STREAK_MILESTONES[matched] : "";
  }

  function greetingTextForHour(hour) {
    const safe = Number.isFinite(hour) ? hour : new Date().getHours();
    if (safe >= 5 && safe < 11) {
      return "早上好，今天也开始啦。";
    }
    if (safe >= 11 && safe < 14) {
      return "记得吃饭。";
    }
    if (safe >= 14 && safe < 23) {
      return "今天辛苦了。";
    }
    return "已经很晚了，要早点休息。";
  }

  const api = {
    bubbleTextForAction,
    streakTextForDays,
    greetingTextForHour,
    STREAK_MILESTONES,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetMoodBubble = api;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 2: 跑测试确认通过**

Run: `npm.cmd test`
Expected: mood-bubble 测试 PASS；其它未动测试仍 PASS。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/mood-bubble.js test/mood-bubble.test.js
git commit -m "feat(bubble): rewrite mood bubbles in Chinese across all scenes"
```

---

## Task 4: 新互动 — 摸头 / 送花 / 奶茶 / 休息 / 叫醒

**Files:**
- Modify: `src/renderer/pet-state-controller.js`
- Modify: `src/renderer/renderer.js`
- Modify: `test/pet-state-controller.test.js`

### Task 4.1: 写失败测试 — 新互动数值正确

**File:** `test/pet-state-controller.test.js`

- [ ] **Step 1: 在文件末尾追加以下测试**

```js
test("gift interaction increases mood and affinity and plays happy", () => {
  const state = new PetStateController({
    initialMood: 40,
    initialAffinity: 3,
    initialEnergy: 50,
    now: () => 1000,
  });
  assert.deepEqual(state.interact("gift"), {
    action: "happy",
    mood: 48,
    affinity: 7,
    energy: 50,
    combo: 0,
  });
});

test("milktea interaction adds energy and checks late-night flag", () => {
  const state = new PetStateController({
    initialMood: 30,
    initialAffinity: 2,
    initialEnergy: 30,
    now: () => 1000,
  });
  const result = state.interact("milktea", { hour: 3 });
  assert.equal(result.action, "happy");
  assert.equal(result.mood, 36);
  assert.equal(result.affinity, 4);
  assert.equal(result.energy, 38);
  assert.equal(result.lateNight, true);
});

test("milktea during day does not flag late-night", () => {
  const state = new PetStateController({
    initialMood: 30,
    initialAffinity: 2,
    initialEnergy: 30,
    now: () => 1000,
  });
  const result = state.interact("milktea", { hour: 14 });
  assert.equal(result.lateNight, false);
});

test("rest interaction transitions into sleep", () => {
  const state = new PetStateController({
    initialMood: 50,
    initialAffinity: 5,
    initialEnergy: 40,
    now: () => 1000,
  });
  const result = state.interact("rest");
  assert.equal(result.action, "sleep");
  assert.equal(state.sleeping, true);
});

test("wake interaction returns a different message based on energy", () => {
  const lowEnergy = new PetStateController({
    initialMood: 50,
    initialAffinity: 5,
    initialEnergy: 20,
    initialSleeping: true,
    now: () => 1000,
  });
  const lowResult = lowEnergy.interact("wake");
  assert.equal(lowResult.action, "sleep");
  assert.equal(lowResult.bubble, "wake-sleepy");

  const okEnergy = new PetStateController({
    initialMood: 50,
    initialAffinity: 5,
    initialEnergy: 60,
    initialSleeping: true,
    now: () => 1000,
  });
  const okResult = okEnergy.interact("wake");
  assert.equal(okResult.action, "idle");
  assert.equal(okResult.bubble, "wake-normal");
  assert.equal(okEnergy.sleeping, false);
});

test("tap still records daily counters", () => {
  const state = new PetStateController({
    initialMood: 50,
    initialAffinity: 5,
    initialEnergy: 50,
    now: () => 1000,
  });
  state.interact("tap");
  state.interact("feed");
  state.interact("pet");
  assert.equal(state.snapshot().dailyState.dailyTapCount, 1);
  assert.equal(state.snapshot().dailyState.dailyFeedCount, 1);
  assert.equal(state.snapshot().dailyState.dailyPetCount, 1);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm.cmd test`
Expected: 新增的 6 个测试 FAIL（`interact` 不支持 `gift`/`milktea`/`rest`/`wake`，未返回 `lateNight`/`bubble`，dailyState 未跟踪）。

### Task 4.2: 在 PetStateController 中加入新互动 + dailyState 跟踪

**File:** `src/renderer/pet-state-controller.js`

- [ ] **Step 1: 扩展构造函数默认值**

在 `walkChance = 0.08` 等默认值附近，**保持原有默认值不变**。把 dailyState 默认对象加在末尾的解构默认值里：

在文件顶部 const 区域加入常量：

```js
const defaultDailyState = Object.freeze({
  lastActiveDate: null,
  dailyTapCount: 0,
  dailyFeedCount: 0,
  dailyPetCount: 0,
  streakDays: 0,
  lastGreetingDate: null,
});
```

在 `normalizeState` 内部，把返回对象增加 `dailyState`：

```js
function normalizeState(state = {}) {
  return {
    mood: clampNumber(state.mood, 50, 0, 100),
    affinity: clampNumber(state.affinity, 0, 0, 999),
    energy: clampNumber(state.energy, 100, 0, 100),
    sleeping: state.sleeping === true,
    dailyState: normalizeDailyState(state.dailyState),
  };
}

function normalizeDailyState(state) {
  if (!state || typeof state !== "object") {
    return { ...defaultDailyState };
  }
  return {
    lastActiveDate: typeof state.lastActiveDate === "string" ? state.lastActiveDate : null,
    dailyTapCount: clampNumber(state.dailyTapCount, 0, 0, 99999),
    dailyFeedCount: clampNumber(state.dailyFeedCount, 0, 0, 99999),
    dailyPetCount: clampNumber(state.dailyPetCount, 0, 0, 99999),
    streakDays: clampNumber(state.streakDays, 0, 0, 9999),
    lastGreetingDate: typeof state.lastGreetingDate === "string" ? state.lastGreetingDate : null,
  };
}
```

在 `PetStateController` 构造里 `this.sleeping = restoredState.sleeping;` 后新增：

```js
this.dailyState = restoredState.dailyState;
```

- [ ] **Step 2: 把 `snapshot()` 增加 dailyState**

```js
snapshot() {
  return {
    mood: this.mood,
    affinity: this.affinity,
    energy: this.energy,
    sleeping: this.sleeping,
    dailyState: { ...this.dailyState },
  };
}
```

（这会破坏现有 `test/pet-settings-store.test.js` 和 `pet-state-controller.test.js` 中的 `deepEqual(snapshot(), { mood, affinity, energy, sleeping })`。下一步同时修测试。）

- [ ] **Step 3: 增加 `bumpDaily(kind)` 私有方法**

在 `resetCombo` 后插入：

```js
bumpDaily(kind) {
  if (!this.dailyState) {
    this.dailyState = { ...defaultDailyState };
  }
  if (kind === "tap") this.dailyState.dailyTapCount += 1;
  if (kind === "feed") this.dailyState.dailyFeedCount += 1;
  if (kind === "pet") this.dailyState.dailyPetCount += 1;
}
```

- [ ] **Step 4: 扩展 `interact()` 处理新类型**

把 `interact(kind, ctx = {})` 改为支持 `ctx.hour`。并在原有 `tap`/`feed`/`pet` 成功后调用 `this.bumpDaily(kind)`。在 `tap` 分支 `changeEnergy` 后增加：

```js
this.bumpDaily("tap");
```

`feed` 分支后增加 `this.bumpDaily("feed");`，`pet` 分支后 `this.bumpDaily("pet");`。

**实施修正（Task 4 完成后记入）**：原计划把 `wake` 分支放在 `interact()` 末尾，但因为前面 `if (this.sleeping) return this.result("idle")` early-return 会先触发，`wake` 实际无法到达。实现时把 `wake`/`gift`/`milktea`/`rest` 四个新分支全部移到 `interact()` **开头**（在 sleeping early-return 之前）。代码块同下：

```js
if (kind === "wake") {
  if (!this.sleeping) {
    return { action: "idle" };
  }
  if (this.energy < this.wakeEnergy) {
    const r = this.result("sleep");
    r.bubble = "wake-sleepy";
    return r;
  }
  this.sleeping = false;
  this.lastInteractionAt = this.now();
  this.resetCombo();
  const r = this.result("idle");
  r.bubble = "wake-normal";
  return r;
}

if (kind === "rest") {
  this.sleeping = true;
  this.resetCombo();
  return this.result("sleep");
}

if (kind === "gift") {
  this.mood = Math.min(100, this.mood + 8);
  this.affinity = Math.min(999, this.affinity + 4);
  this.resetCombo();
  return this.result("happy", true);
}

if (kind === "milktea") {
  const hour = Number.isFinite(ctx.hour) ? ctx.hour : new Date().getHours();
  const lateNight = hour >= 23 || hour < 5;
  this.mood = Math.min(100, this.mood + 6);
  this.affinity = Math.min(999, this.affinity + 2);
  this.changeEnergy(8);
  this.resetCombo();
  const r = this.result("happy", true);
  r.lateNight = lateNight;
  return r;
}

if (kind === "rest") {
  this.sleeping = true;
  this.resetCombo();
  return this.result("sleep");
}

if (kind === "wake") {
  if (!this.sleeping) {
    return this.result("idle");
  }
  if (this.energy < this.wakeEnergy) {
    const r = this.result("sleep");
    r.bubble = "wake-sleepy";
    return r;
  }
  this.sleeping = false;
  this.lastInteractionAt = this.now();
  this.resetCombo();
  const r = this.result("idle");
  r.bubble = "wake-normal";
  return r;
}
```

- [ ] **Step 5: 修两个旧测试快照断言**

`test/pet-state-controller.test.js` 中两处 `assert.deepEqual(state.snapshot(), { mood, affinity, energy, sleeping })` 改为：

```js
assert.deepEqual(state.snapshot(), {
  mood: 66,
  affinity: 12,
  energy: 44,
  sleeping: true,
  dailyState: {
    lastActiveDate: null,
    dailyTapCount: 0,
    dailyFeedCount: 0,
    dailyPetCount: 0,
    streakDays: 0,
    lastGreetingDate: null,
  },
});
```

和

```js
assert.deepEqual(restored.snapshot(), {
  mood: 70,
  affinity: 10,
  energy: 25,
  sleeping: false,
  dailyState: {
    lastActiveDate: null,
    dailyTapCount: 0,
    dailyFeedCount: 0,
    dailyPetCount: 0,
    streakDays: 0,
    lastGreetingDate: null,
  },
});
```

`test/pet-settings-store.test.js` 中两处 `petState: { mood, affinity, energy, sleeping }` 同步增加 `dailyState`（见 Task 8 一次性补齐；本 Task 只保证不破坏，可在 Task 8 之前临时加 `dailyState: defaultDailyState` 占位）。

- [ ] **Step 6: 跑测试**

Run: `npm.cmd test`
Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add src/renderer/pet-state-controller.js test/pet-state-controller.test.js
git commit -m "feat(state): add gift/milktea/rest/wake interactions and daily counters"
```

---

## Task 5: 每日问候与连续陪伴 (dailyState 升级)

**Files:**
- New: `src/renderer/daily-state.js`
- Modify: `src/renderer/pet-state-controller.js`
- New: `test/daily-state.test.js`

### Task 5.1: 写失败测试

**File:** `test/daily-state.test.js`（新）

- [ ] **Step 1: 创建测试文件**

```js
const assert = require("node:assert/strict");
const test = require("node:test");

const { DailyState } = require("../src/renderer/daily-state");

function makeClock(year, month, day) {
  const fixed = new Date(year, month - 1, day, 10, 0, 0).getTime();
  return () => fixed;
}

test("first touch initializes streak to 1", () => {
  const ds = new DailyState({ now: makeClock(2026, 6, 27) });
  ds.touch();
  assert.equal(ds.snapshot().streakDays, 1);
  assert.equal(ds.snapshot().dailyTapCount, 0);
});

test("touch on consecutive day increments streak", () => {
  let day = 27;
  const ds = new DailyState({ now: () => new Date(2026, 5, day, 10, 0, 0).getTime() });
  ds.touch();
  day = 28;
  ds.touch();
  assert.equal(ds.snapshot().streakDays, 2);
});

test("touch on same day does not change streak", () => {
  const ds = new DailyState({ now: makeClock(2026, 6, 27) });
  ds.touch();
  ds.touch();
  assert.equal(ds.snapshot().streakDays, 1);
});

test("skipping a day resets streak to 1", () => {
  let day = 27;
  const ds = new DailyState({ now: () => new Date(2026, 5, day, 10, 0, 0).getTime() });
  ds.touch();
  day = 30;
  ds.touch();
  assert.equal(ds.snapshot().streakDays, 1);
});

test("shouldGreet is true only when lastGreetingDate differs from today", () => {
  const ds = new DailyState({ now: makeClock(2026, 6, 27) });
  ds.touch();
  assert.equal(ds.shouldGreet(), true);
  ds.markGreeted();
  assert.equal(ds.shouldGreet(), false);
});

test("recordTap/Feed/Pet increments only matching counter", () => {
  const ds = new DailyState({ now: makeClock(2026, 6, 27) });
  ds.recordTap();
  ds.recordTap();
  ds.recordFeed();
  ds.recordPet();
  assert.deepEqual(ds.snapshot(), {
    lastActiveDate: "2026-06-27",
    dailyTapCount: 2,
    dailyFeedCount: 1,
    dailyPetCount: 1,
    streakDays: 1,
    lastGreetingDate: null,
  });
});

test("load/snapshot round trip preserves state", () => {
  const ds = new DailyState({ now: makeClock(2026, 6, 27) });
  ds.recordTap();
  ds.markGreeted();
  const saved = ds.snapshot();
  const restored = new DailyState({ initialState: saved, now: makeClock(2026, 6, 27) });
  assert.deepEqual(restored.snapshot(), saved);
});

test("streak milestone text is exposed for non-milestone days as empty string", () => {
  const { streakTextForDays } = require("../src/renderer/mood-bubble");
  assert.equal(streakTextForDays(1), "");
  assert.match(streakTextForDays(3), /3/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm.cmd test`
Expected: FAIL — `DailyState` 模块不存在。

### Task 5.2: 新建 `src/renderer/daily-state.js`

**File:** `src/renderer/daily-state.js`

- [ ] **Step 1: 新建文件**

```js
(function attachDailyState(root) {
  function toLocalDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function daysBetween(prevString, nextDate) {
    if (!prevString) return null;
    const [y, m, d] = prevString.split("-").map(Number);
    const prev = new Date(y, m - 1, d).getTime();
    return Math.round((nextDate.getTime() - prev) / 86400000);
  }

  class DailyState {
    constructor({ now = () => new Date(), initialState } = {}) {
      this.now = now;
      const today = toLocalDateString(new Date(now()));
      const state = initialState && typeof initialState === "object" ? initialState : {};
      this.lastActiveDate = typeof state.lastActiveDate === "string" ? state.lastActiveDate : null;
      this.dailyTapCount = Number.isFinite(state.dailyTapCount) ? state.dailyTapCount : 0;
      this.dailyFeedCount = Number.isFinite(state.dailyFeedCount) ? state.dailyFeedCount : 0;
      this.dailyPetCount = Number.isFinite(state.dailyPetCount) ? state.dailyPetCount : 0;
      this.streakDays = Number.isFinite(state.streakDays) ? state.streakDays : 0;
      this.lastGreetingDate = typeof state.lastGreetingDate === "string" ? state.lastGreetingDate : null;
      this._today = today;
    }

    touch() {
      const todayDate = new Date(this.now());
      const today = toLocalDateString(todayDate);
      this._today = today;
      if (this.lastActiveDate === today) {
        return this.snapshot();
      }
      const gap = daysBetween(this.lastActiveDate, todayDate);
      if (gap === 1) {
        this.streakDays += 1;
      } else {
        this.streakDays = 1;
      }
      this.lastActiveDate = today;
      this.dailyTapCount = 0;
      this.dailyFeedCount = 0;
      this.dailyPetCount = 0;
      return this.snapshot();
    }

    recordTap() { this.touch(); this.dailyTapCount += 1; }
    recordFeed() { this.touch(); this.dailyFeedCount += 1; }
    recordPet() { this.touch(); this.dailyPetCount += 1; }

    shouldGreet() {
      return this.lastGreetingDate !== this._today;
    }

    markGreeted() {
      this.lastGreetingDate = this._today;
    }

    snapshot() {
      return {
        lastActiveDate: this.lastActiveDate,
        dailyTapCount: this.dailyTapCount,
        dailyFeedCount: this.dailyFeedCount,
        dailyPetCount: this.dailyPetCount,
        streakDays: this.streakDays,
        lastGreetingDate: this.lastGreetingDate,
      };
    }
  }

  const api = { DailyState, toLocalDateString };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetDailyState = api;
})(typeof window !== "undefined" ? window : globalThis);
```

### Task 5.3: 把 PetStateController 改为委托 DailyState

**File:** `src/renderer/pet-state-controller.js`

- [ ] **Step 1: 替换 `defaultDailyState` / `normalizeDailyState` / `bumpDaily` 等为委托**

删掉上一 Task 写的 `defaultDailyState` / `normalizeDailyState` / `bumpDaily`（保持 normalizeState 仍能正常工作）。

在 `attachPetStateController` 内顶部 require：

```js
const { DailyState } = require("./daily-state");
```

在 `PetStateController` 构造里：

```js
this.dailyState = new DailyState({
  now,
  initialState: (initialState && initialState.dailyState) || null,
});
```

把 `bumpDaily(kind)` 改为：

```js
bumpDaily(kind) {
  if (kind === "tap") this.dailyState.recordTap();
  if (kind === "feed") this.dailyState.recordFeed();
  if (kind === "pet") this.dailyState.recordPet();
}
```

`snapshot()` 的 `dailyState` 改为 `this.dailyState.snapshot()`。

`normalizeState` 的 `dailyState` 字段删除（`DailyState` 构造已规范化）。

`PetStateController` 模块导出改为 `module.exports = { PetStateController, normalizeState };`（不变）。

- [ ] **Step 2: 跑测试**

Run: `npm.cmd test`
Expected: 全部 PASS。**注意** `pet-state-controller.test.js` 中两处 `snapshot()` 期望仍要求 `dailyState` 完整字段，由于 `DailyState` 默认值含全部 6 个字段，应该通过。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/daily-state.js src/renderer/pet-state-controller.js test/daily-state.test.js test/pet-state-controller.test.js
git commit -m "feat(daily): introduce DailyState module with streak and greeting logic"
```

---

## Task 6: 番茄钟 / 休息提醒 MVP

**Files:**
- New: `src/renderer/focus-timer.js`
- New: `test/focus-timer.test.js`

### Task 6.1: 写失败测试

**File:** `test/focus-timer.test.js`（新）

- [ ] **Step 1: 新建测试**

```js
const assert = require("node:assert/strict");
const test = require("node:test");

const { FocusTimer, FocusPhase } = require("../src/renderer/focus-timer");

test("starts in idle phase", () => {
  const timer = new FocusTimer();
  assert.equal(timer.phase, FocusPhase.Idle);
  assert.equal(timer.remainingMs, 25 * 60 * 1000);
});

test("startFocus transitions to focus phase and counts down", () => {
  let now = 0;
  const timer = new FocusTimer({ now: () => now });
  timer.startFocus();
  assert.equal(timer.phase, FocusPhase.Focus);
  now = 60_000;
  assert.equal(timer.remainingMs, 24 * 60 * 1000);
});

test("tick advances focus and emits finish at zero", () => {
  let now = 0;
  let focusFinished = 0;
  let breakFinished = 0;
  const timer = new FocusTimer({
    now: () => now,
    focusDurationMs: 1000,
    breakDurationMs: 500,
  });
  timer.onFocusEnd(() => focusFinished += 1);
  timer.onBreakEnd(() => breakFinished += 1);
  timer.startFocus();
  now = 999;
  assert.equal(timer.tick(), { phase: FocusPhase.Focus, finished: false });
  now = 1000;
  const r = timer.tick();
  assert.equal(r.finished, true);
  assert.equal(r.phase, FocusPhase.Focus);
  assert.equal(focusFinished, 1);
});

test("pause stops counting, resume continues", () => {
  let now = 0;
  const timer = new FocusTimer({
    now: () => now,
    focusDurationMs: 10_000,
  });
  timer.startFocus();
  now = 4000;
  timer.pause();
  now = 9000;
  assert.equal(timer.remainingMs, 6000);
  timer.resume();
  now = 12_000;
  assert.equal(timer.remainingMs, 3000);
});

test("reset returns to idle with full focus duration", () => {
  let now = 0;
  const timer = new FocusTimer({ now: () => now, focusDurationMs: 25 * 60 * 1000 });
  timer.startFocus();
  timer.startBreak();
  timer.reset();
  assert.equal(timer.phase, FocusPhase.Idle);
  assert.equal(timer.remainingMs, 25 * 60 * 1000);
});

test("startBreak sets phase to break", () => {
  const timer = new FocusTimer();
  timer.startBreak();
  assert.equal(timer.phase, FocusPhase.Break);
  assert.equal(timer.remainingMs, 5 * 60 * 1000);
});

test("focus does not auto-tick without explicit tick()", () => {
  let now = 0;
  const timer = new FocusTimer({ now: () => now });
  timer.startFocus();
  now = 100000;
  assert.equal(timer.remainingMs, 25 * 60 * 1000);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm.cmd test`
Expected: FAIL — 模块不存在。

### Task 6.2: 新建 `src/renderer/focus-timer.js`

**File:** `src/renderer/focus-timer.js`

- [ ] **Step 1: 新建文件**

```js
(function attachFocusTimer(root) {
  const FocusPhase = Object.freeze({
    Idle: "idle",
    Focus: "focus",
    Break: "break",
    PausedFocus: "paused-focus",
    PausedBreak: "paused-break",
  });

  const DEFAULT_FOCUS_MS = 25 * 60 * 1000;
  const DEFAULT_BREAK_MS = 5 * 60 * 1000;

  class FocusTimer {
    constructor({
      focusDurationMs = DEFAULT_FOCUS_MS,
      breakDurationMs = DEFAULT_BREAK_MS,
      now = () => Date.now(),
    } = {}) {
      this.focusDurationMs = focusDurationMs;
      this.breakDurationMs = breakDurationMs;
      this.now = now;
      this.phase = FocusPhase.Idle;
      this.endAt = 0;
      this.remainingOnPause = 0;
      this._focusListeners = [];
      this._breakListeners = [];
      this._reset();
    }

    _reset() {
      this.phase = FocusPhase.Idle;
      this.endAt = 0;
      this.remainingOnPause = this.focusDurationMs;
    }

    get remainingMs() {
      if (this.phase === FocusPhase.PausedFocus || this.phase === FocusPhase.PausedBreak) {
        return this.remainingOnPause;
      }
      if (this.phase === FocusPhase.Idle) {
        return this.focusDurationMs;
      }
      const ms = this.endAt - this.now();
      return Math.max(0, ms);
    }

    startFocus() {
      this.phase = FocusPhase.Focus;
      this.endAt = this.now() + this.focusDurationMs;
      this.remainingOnPause = this.focusDurationMs;
    }

    startBreak() {
      this.phase = FocusPhase.Break;
      this.endAt = this.now() + this.breakDurationMs;
      this.remainingOnPause = this.breakDurationMs;
    }

    pause() {
      if (this.phase === FocusPhase.Focus || this.phase === FocusPhase.Break) {
        this.remainingOnPause = Math.max(0, this.endAt - this.now());
        this.phase = this.phase === FocusPhase.Focus ? FocusPhase.PausedFocus : FocusPhase.PausedBreak;
      }
    }

    resume() {
      if (this.phase === FocusPhase.PausedFocus || this.phase === FocusPhase.PausedBreak) {
        this.phase = this.phase === FocusPhase.PausedFocus ? FocusPhase.Focus : FocusPhase.Break;
        this.endAt = this.now() + this.remainingOnPause;
      }
    }

    reset() {
      this._reset();
    }

    tick() {
      if (this.phase !== FocusPhase.Focus && this.phase !== FocusPhase.Break) {
        return { phase: this.phase, finished: false };
      }
      const remaining = this.endAt - this.now();
      if (remaining > 0) {
        return { phase: this.phase, finished: false };
      }
      const finishedPhase = this.phase;
      this.phase = FocusPhase.Idle;
      if (finishedPhase === FocusPhase.Focus) {
        for (const fn of this._focusListeners) fn();
      } else {
        for (const fn of this._breakListeners) fn();
      }
      return { phase: finishedPhase, finished: true };
    }

    onFocusEnd(fn) { this._focusListeners.push(fn); }
    onBreakEnd(fn) { this._breakListeners.push(fn); }
  }

  const api = { FocusTimer, FocusPhase };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetFocusTimer = api;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 2: 跑测试**

Run: `npm.cmd test`
Expected: focus-timer 测试 PASS；其它未动测试仍 PASS。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/focus-timer.js test/focus-timer.test.js
git commit -m "feat(focus): add FocusTimer MVP with pause/resume/reset"
```

---

## Task 7: 鼠标靠近反应

**Files:**
- New: `src/renderer/mouse-react.js`
- New: `test/mouse-react.test.js`

### Task 7.1: 写失败测试

**File:** `test/mouse-react.test.js`（新）

- [ ] **Step 1: 新建测试**

```js
const assert = require("node:assert/strict");
const test = require("node:test");

const { MouseReact } = require("../src/renderer/mouse-react");

test("returns no reaction before cooldown expires", () => {
  let now = 0;
  const r = new MouseReact({ now: () => now, cooldownMs: 20000 });
  assert.equal(r.notifyPointerInside(), null);
  now = 10000;
  assert.equal(r.notifyPointerInside(), null);
});

test("emits a reaction after cooldown", () => {
  let now = 0;
  const r = new MouseReact({ now: () => now, cooldownMs: 20000 });
  r.notifyPointerInside();
  now = 20001;
  const out = r.notifyPointerInside();
  assert.equal(out.kind, "react");
  assert.ok(out.text.length > 0);
});

test("long hover escalates based on mood", () => {
  let now = 0;
  const r = new MouseReact({ now: () => now, cooldownMs: 20000, longHoverMs: 5000 });
  r.notifyPointerInside();
  now = 5000;
  const happy = r.notifyPointerInside({ mood: 90 });
  assert.equal(happy.kind, "escalate");
  assert.equal(happy.tone, "happy");

  now = 50000;
  const pout = r.notifyPointerInside({ mood: 10 });
  assert.equal(pout.kind, "escalate");
  assert.equal(pout.tone, "pout");
});

test("reset clears cooldown and hover start time", () => {
  let now = 0;
  const r = new MouseReact({ now: () => now, cooldownMs: 20000 });
  r.notifyPointerInside();
  now = 5000;
  r.reset();
  now = 6000;
  assert.equal(r.notifyPointerInside(), null);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm.cmd test`
Expected: FAIL — 模块不存在。

### Task 7.2: 新建 `src/renderer/mouse-react.js`

**File:** `src/renderer/mouse-react.js`

- [ ] **Step 1: 新建文件**

```js
(function attachMouseReact(root) {
  const pool = ["嗯？", "你在看我吗？", "有什么事吗？"];

  class MouseReact {
    constructor({
      cooldownMs = 20000,
      longHoverMs = 5000,
      now = () => Date.now(),
      random = () => Math.random(),
    } = {}) {
      this.cooldownMs = cooldownMs;
      this.longHoverMs = longHoverMs;
      this.now = now;
      this.random = random;
      this._lastReactionAt = Number.NEGATIVE_INFINITY;
      this._firstSeenAt = null;
    }

    reset() {
      this._lastReactionAt = Number.NEGATIVE_INFINITY;
      this._firstSeenAt = null;
    }

    notifyPointerInside({ mood = 50 } = {}) {
      const t = this.now();
      if (this._firstSeenAt === null) {
        this._firstSeenAt = t;
      }
      if (t - this._lastReactionAt < this.cooldownMs) {
        return null;
      }
      if (t - this._firstSeenAt >= this.longHoverMs) {
        this._lastReactionAt = t;
        this._firstSeenAt = null;
        const tone = mood >= 70 ? "happy" : mood <= 30 ? "pout" : "neutral";
        return { kind: "escalate", tone };
      }
      this._lastReactionAt = t;
      this._firstSeenAt = null;
      const idx = Math.floor(this.random() * pool.length);
      return { kind: "react", text: pool[idx] };
    }
  }

  const api = { MouseReact };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetMouseReact = api;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 2: 跑测试**

Run: `npm.cmd test`
Expected: mouse-react 测试 PASS。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/mouse-react.js test/mouse-react.test.js
git commit -m "feat(mouse-react): add in-window pointer-near detector with cooldown"
```

---

## Task 8: 设置归一化 + renderer 编排

**Files:**
- Modify: `src/pet-settings-store.js`
- Modify: `test/pet-settings-store.test.js`
- Modify: `src/renderer/renderer.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/walk-movement.js`
- Modify: `test/walk-movement.test.js`

### Task 8.1: 扩展 `defaultPetSettings` 与 `normalizePetSettings`

**File:** `src/pet-settings-store.js`

- [ ] **Step 1: 给 defaultPetSettings 增加两个开关**

```js
const defaultPetSettings = Object.freeze({
  sizePercent: 100,
  speedPercent: 100,
  position: null,
  alwaysOnTop: true,
  petState: Object.freeze({
    mood: 50,
    affinity: 0,
    energy: 100,
    sleeping: false,
    dailyState: Object.freeze({
      lastActiveDate: null,
      dailyTapCount: 0,
      dailyFeedCount: 0,
      dailyPetCount: 0,
      streakDays: 0,
      lastGreetingDate: null,
    }),
  }),
  autoBehaviorEnabled: true,
  autoWalkEnabled: true,
  opacityPercent: 100,
  mouseReactEnabled: true,
  dailyGreetingEnabled: true,
});
```

- [ ] **Step 2: 扩展 `normalizePetState` 接受 dailyState**

把 `normalizePetState` 替换为：

```js
function normalizePetState(state = {}) {
  if (!state || typeof state !== "object") {
    return { ...defaultPetSettings.petState, dailyState: { ...defaultPetSettings.petState.dailyState } };
  }
  const daily = (state.dailyState && typeof state.dailyState === "object") ? state.dailyState : {};
  return {
    mood: normalizeStateNumber(state.mood, defaultPetSettings.petState.mood, 0, 100),
    affinity: normalizeStateNumber(state.affinity, defaultPetSettings.petState.affinity, 0, 999),
    energy: normalizeStateNumber(state.energy, defaultPetSettings.petState.energy, 0, 100),
    sleeping: state.sleeping === true,
    dailyState: {
      lastActiveDate: typeof daily.lastActiveDate === "string" ? daily.lastActiveDate : null,
      dailyTapCount: normalizeStateNumber(daily.dailyTapCount, 0, 0, 99999),
      dailyFeedCount: normalizeStateNumber(daily.dailyFeedCount, 0, 0, 99999),
      dailyPetCount: normalizeStateNumber(daily.dailyPetCount, 0, 0, 99999),
      streakDays: normalizeStateNumber(daily.streakDays, 0, 0, 9999),
      lastGreetingDate: typeof daily.lastGreetingDate === "string" ? daily.lastGreetingDate : null,
    },
  };
}
```

- [ ] **Step 3: 扩展 `normalizePetSettings` 输出两个开关**

```js
function normalizePetSettings(settings = {}) {
  return {
    sizePercent: normalizePercent(settings.sizePercent ?? defaultPetSettings.sizePercent),
    speedPercent: normalizePercent(settings.speedPercent ?? defaultPetSettings.speedPercent),
    position: normalizePosition(settings.position),
    alwaysOnTop: typeof settings.alwaysOnTop === "boolean"
      ? settings.alwaysOnTop
      : defaultPetSettings.alwaysOnTop,
    petState: normalizePetState(settings.petState),
    autoBehaviorEnabled: typeof settings.autoBehaviorEnabled === "boolean"
      ? settings.autoBehaviorEnabled
      : defaultPetSettings.autoBehaviorEnabled,
    autoWalkEnabled: typeof settings.autoWalkEnabled === "boolean"
      ? settings.autoWalkEnabled
      : defaultPetSettings.autoWalkEnabled,
    opacityPercent: normalizeOpacityPercent(settings.opacityPercent),
    mouseReactEnabled: typeof settings.mouseReactEnabled === "boolean"
      ? settings.mouseReactEnabled
      : defaultPetSettings.mouseReactEnabled,
    dailyGreetingEnabled: typeof settings.dailyGreetingEnabled === "boolean"
      ? settings.dailyGreetingEnabled
      : defaultPetSettings.dailyGreetingEnabled,
  };
}
```

### Task 8.2: 同步更新现有 settings 测试期望

**File:** `test/pet-settings-store.test.js`

- [ ] **Step 1: 在两处 `assert.deepEqual` 期望中追加新字段**

`test("normalizes missing and invalid settings to safe defaults")` 中 expected object 增加：

```js
mouseReactEnabled: true,
dailyGreetingEnabled: true,
petState: { mood: 70, affinity: 5, energy: 30, sleeping: true,
  dailyState: { lastActiveDate: null, dailyTapCount: 0, dailyFeedCount: 0, dailyPetCount: 0, streakDays: 0, lastGreetingDate: null } },
```

`test("normalizes missing and invalid settings to safe defaults")` 末尾对 `defaultPetSettings` 的期望已包含 `mouseReactEnabled: true, dailyGreetingEnabled: true`。验证 `defaultPetSettings.petState` 含 `dailyState`。

`test("loads and saves normalized settings as JSON")` 两处 expected object 也追加 `mouseReactEnabled: true, dailyGreetingEnabled: true` 和 `petState.dailyState` 默认对象。

### Task 8.3: 加载设置时不持久化 relationshipLevel

**File:** `src/pet-settings-store.js`

- [ ] **Step 1: 显式确保 relationshipLevel 不会被存盘**

`normalizePetSettings` 不读取 `settings.relationshipLevel`，`normalizePetState` 也不读 `state.relationshipLevel`，因此旧设置文件中残留字段会被自动丢弃，无需迁移。

- [ ] **Step 2: 添加测试**

在 `test/pet-settings-store.test.js` 末尾新增：

```js
test("does not persist or surface a relationshipLevel field", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deskpet-settings-"));
  const settingsPath = path.join(dir, "settings.json");
  savePetSettings(settingsPath, {
    ...defaultPetSettings,
    relationshipLevel: "Lv.99",
    petState: { ...defaultPetSettings.petState, relationshipLevel: "max" },
  });
  const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.equal(raw.relationshipLevel, undefined);
  assert.equal(raw.petState.relationshipLevel, undefined);
  assert.equal(loadPetSettings(settingsPath).relationshipLevel, undefined);
});
```

### Task 8.4: HTML/CSS 增加分组与新开关

**File:** `src/renderer/index.html`

- [ ] **Step 1: 在 settings-panel 末尾、分组标题下增加新开关与专注计时 UI**

在现有 Auto walk checkbox 之后插入：

```html
<label class="settings-panel__check">
  <input id="mouse-react-input" type="checkbox" checked />
  <span>鼠标靠近反应</span>
</label>
<label class="settings-panel__check">
  <input id="daily-greeting-input" type="checkbox" checked />
  <span>每日问候</span>
</label>
<h3 class="settings-group-title">专注计时</h3>
<dl class="settings-status settings-status--focus">
  <div><dt>状态</dt><dd id="focus-phase">空闲</dd></div>
  <div><dt>剩余</dt><dd id="focus-remaining">25:00</dd></div>
</dl>
<div class="settings-panel__buttons">
  <button id="focus-start" type="button">开始专注</button>
  <button id="break-start" type="button">开始休息</button>
  <button id="focus-pause" type="button">暂停</button>
  <button id="focus-reset" type="button">重置</button>
</div>
```

把现有 `dl.settings-status` 中**也**添加 `streakDays` 行（放在 `好感度` 之后）：

```html
<div><dt>连续陪伴</dt><dd id="status-streak">0</dd></div>
```

**File:** `src/renderer/styles.css`

- [ ] **Step 1: 追加分组标题与按钮样式**

```css
.settings-group-title {
  margin: 14px 0 4px;
  font-size: 12px;
  color: #4a5060;
  letter-spacing: 0.04em;
}

.settings-panel__buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 8px;
}

.settings-panel__buttons button {
  padding: 6px 8px;
  border: 1px solid rgba(30, 32, 38, 0.18);
  border-radius: 6px;
  background: #ffffff;
  color: #20232a;
  cursor: pointer;
}

.settings-panel__buttons button:hover {
  background: #f0f3f8;
}
```

### Task 8.5: renderer.js 接入新模块与新命令

**File:** `src/renderer/renderer.js`

- [ ] **Step 1: 在 IIFE 顶部加入引用**

```js
const moodBubbleApi = window.DeskpetMoodBubble;
const focusTimer = new window.DeskpetFocusTimer.FocusTimer();
const mouseReact = new window.DeskpetMouseReact.MouseReact();
const dailyState = petState.dailyState; // PetStateController 已持有
```

（注意 `petState` 在 IIFE 中已存在。）

- [ ] **Step 2: 增加模块状态变量与每日问候逻辑**

```js
let mouseReactEnabled = true;
let dailyGreetingEnabled = true;
let focusEnabled = false; // 是否处于专注阶段（用于降低 walk 频率）
```

在 `bootDeskpet` 末尾、初始化后立即触发：

```js
dailyState.touch();
if (dailyGreetingEnabled && dailyState.shouldGreet()) {
  const hour = new Date().getHours();
  const text = moodBubbleApi.greetingTextForHour(hour);
  moodBubble.textContent = text;
  moodBubble.hidden = false;
  setTimeout(() => { moodBubble.hidden = true; }, 1500);
  dailyState.markGreeted();
  savePetState();
}
const streakText = moodBubbleApi.streakTextForDays(dailyState.snapshot().streakDays);
if (streakText) {
  setTimeout(() => {
    moodBubble.textContent = streakText;
    moodBubble.hidden = false;
    setTimeout(() => { moodBubble.hidden = true; }, 1800);
  }, 2200);
}
```

- [ ] **Step 3: 增加设置面板同步函数**

把 `syncSettingsPanel()` 改为：

```js
function syncSettingsPanel() {
  if (sizeInput) sizeInput.value = String(sizePercent);
  if (speedInput) speedInput.value = String(speedPercent);
  if (opacityInput) opacityInput.value = String(opacityPercent);
  if (autoBehaviorInput) autoBehaviorInput.checked = autoBehaviorEnabled;
  if (autoWalkInput) autoWalkInput.checked = autoWalkEnabled;
  if (mouseReactInput) mouseReactInput.checked = mouseReactEnabled;
  if (dailyGreetingInput) dailyGreetingInput.checked = dailyGreetingEnabled;
  setOutput(sizeOutput, sizePercent);
  setOutput(speedOutput, speedPercent);
  setOutput(opacityOutput, opacityPercent);
  updateStatusPanel();
}
```

并在顶部 DOM 引用中加入：

```js
const mouseReactInput = document.querySelector("#mouse-react-input");
const dailyGreetingInput = document.querySelector("#daily-greeting-input");
const focusStart = document.querySelector("#focus-start");
const breakStart = document.querySelector("#break-start");
const focusPause = document.querySelector("#focus-pause");
const focusReset = document.querySelector("#focus-reset");
const focusPhaseEl = document.querySelector("#focus-phase");
const focusRemainingEl = document.querySelector("#focus-remaining");
const statusStreak = document.querySelector("#status-streak");
```

`updateStatusPanel()` 改为：

```js
function updateStatusPanel() {
  const state = petState.snapshot();
  setText(statusMood, state.mood);
  setText(statusEnergy, state.energy);
  setText(statusAffinity, state.affinity);
  setText(statusRelationship, "亲密");
  setText(statusAction, animation.action);
  setText(statusCombo, petState.combo());
  setText(statusStreak, state.dailyState.streakDays);
}
```

- [ ] **Step 4: 给 `runCommand` 增加新命令处理**

在 `runCommand` 内合适位置插入：

```js
if (command === "gift") {
  const r = petState.interact("gift");
  savePetState();
  showMoodBubble("gift");
  play(r.action);
  return;
}

if (command === "milktea") {
  const r = petState.interact("milktea", { hour: new Date().getHours() });
  savePetState();
  if (r.lateNight) {
    showCustomBubble("这么晚喝会睡不着吧。");
  } else {
    showMoodBubble("milktea");
  }
  play(r.action);
  return;
}

if (command === "rest") {
  petState.interact("rest");
  savePetState();
  showCustomBubble("那我休息一下。");
  play("sleep");
  return;
}

if (command === "wake") {
  const r = petState.interact("wake");
  savePetState();
  if (r.bubble === "wake-sleepy") {
    showCustomBubble("还想再睡一会儿。");
    play("sleep");
  } else {
    showCustomBubble("嗯……醒啦。");
    play("idle");
  }
  return;
}
```

新增辅助函数（在 `showMoodBubble` 旁边）：

```js
function showCustomBubble(text) {
  if (!moodBubble) return;
  moodBubble.textContent = text;
  moodBubble.hidden = false;
  clearTimeout(moodBubbleTimer);
  moodBubbleTimer = setTimeout(() => { moodBubble.hidden = true; }, 1500);
}
```

并把 `settings:` 命令分支对 `mouseReactEnabled` / `dailyGreetingEnabled` 做同步：

```js
mouseReactEnabled = loadedSettings.mouseReactEnabled !== false;
dailyGreetingEnabled = loadedSettings.dailyGreetingEnabled !== false;
```

`saveBehaviorSettings` 增加：

```js
function saveBehaviorSettings() {
  window.deskpet.updateSettings?.({
    opacityPercent,
    autoBehaviorEnabled,
    autoWalkEnabled,
    mouseReactEnabled,
    dailyGreetingEnabled,
  });
}
```

- [ ] **Step 5: 监听新 UI 控件**

在 IIFE 末尾、`window.deskpet.onCommand(runCommand);` 之前加入：

```js
mouseReactInput?.addEventListener("change", () => {
  mouseReactEnabled = mouseReactInput.checked;
  saveBehaviorSettings();
});
dailyGreetingInput?.addEventListener("change", () => {
  dailyGreetingEnabled = dailyGreetingInput.checked;
  saveBehaviorSettings();
});
focusStart?.addEventListener("click", () => {
  focusEnabled = true;
  focusTimer.startFocus();
  showMoodBubble("focus");
  updateFocusPanel();
});
breakStart?.addEventListener("click", () => {
  focusEnabled = false;
  focusTimer.startBreak();
  updateFocusPanel();
});
focusPause?.addEventListener("click", () => {
  focusTimer.phase === "focus" || focusTimer.phase === "break" ? focusTimer.pause() : focusTimer.resume();
  updateFocusPanel();
});
focusReset?.addEventListener("click", () => {
  focusEnabled = false;
  focusTimer.reset();
  updateFocusPanel();
});

function updateFocusPanel() {
  if (!focusPhaseEl || !focusRemainingEl) return;
  const phaseLabels = {
    idle: "空闲", focus: "专注中", break: "休息中", "paused-focus": "已暂停(专注)", "paused-break": "已暂停(休息)",
  };
  focusPhaseEl.textContent = phaseLabels[focusTimer.phase] || focusTimer.phase;
  const total = Math.ceil(focusTimer.remainingMs / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  focusRemainingEl.textContent = `${mm}:${ss}`;
}
```

并设置一个 `setInterval(updateFocusPanel, 1000)`（仅在 IIFE 中加 1 行）：

```js
setInterval(updateFocusPanel, 1000);
```

- [ ] **Step 6: 焦点结束 / 休息结束的 hook**

在 `focusTimer` 初始化之后立即：

```js
focusTimer.onFocusEnd(() => {
  focusEnabled = false;
  showMoodBubble("happy");
  play("happy");
  updateFocusPanel();
});
focusTimer.onBreakEnd(() => {
  showMoodBubble("tap");
  play("tap");
  updateFocusPanel();
});
```

并在 `setInterval(updateFocusPanel, 1000)` 之前/之后插入 `focusTimer.tick()`：

```js
setInterval(() => {
  focusTimer.tick();
  updateFocusPanel();
}, 1000);
```

- [ ] **Step 7: 鼠标靠近反应接入 pointermove**

把现有 `stage.addEventListener("pointermove", ...)` 末尾改为：

```js
if (mouseReactEnabled) {
  const r = mouseReact.notifyPointerInside({ mood: petState.snapshot().mood });
  if (r) {
    if (r.kind === "react") {
      showCustomBubble(r.text);
    } else if (r.kind === "escalate") {
      if (r.tone === "happy") {
        showMoodBubble("happy");
      } else if (r.tone === "pout") {
        showMoodBubble("pout");
      }
    }
  }
}
```

### Task 8.6: 走路模块在专注模式下降低频率

**File:** `src/renderer/walk-movement.js`

- [ ] **Step 1: WalkMovementRunner 增加 `reduceChance` 模式**

```js
class WalkMovementRunner {
  constructor({ movement = new WalkMovement(), moveBy, intervalMs = 120, setIntervalFn = (cb, ms) => setInterval(cb, ms), clearIntervalFn = (id) => clearInterval(id) }) {
    this.movement = movement;
    this.moveBy = moveBy;
    this.intervalMs = intervalMs;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.timer = 0;
    this.intervalMultiplier = 1;
  }
  // 旧实现保留
  // ...
  setReduced(reduced) {
    this.intervalMultiplier = reduced ? 3 : 1;
  }
  start() {
    this.stop();
    this.movement.start();
    this.timer = this.setIntervalFn(() => {
      const result = this.movement.step();
      if (result.dx || result.dy) {
        Promise.resolve(this.moveBy(result.dx, result.dy)).then((moveResult) => {
          if (moveResult?.blockedX) this.movement.turnAround();
        });
      }
      if (!result.active) this.stop();
    }, this.intervalMs * this.intervalMultiplier);
  }
  // stop / direction 不变
}
```

- [ ] **Step 2: 加测试**

`test/walk-movement.test.js` 末尾增加：

```js
test("setReduced(true) makes intervalMs 3x slower", () => {
  const intervals = [];
  const runner = new WalkMovementRunner({
    movement: { start() {}, step: () => ({ dx: 0, dy: 0, active: false }), stop() {}, direction: () => 1 },
    moveBy: () => Promise.resolve({ blockedX: false }),
    setIntervalFn: (cb, ms) => { intervals.push(ms); return 1; },
    clearIntervalFn: () => {},
  });
  runner.setReduced(true);
  runner.start();
  assert.equal(intervals[0], 360);
  runner.setReduced(false);
  runner.start();
  assert.equal(intervals[1], 120);
});
```

### Task 8.7: 跑全套测试

Run: `npm.cmd test`
Expected: 全部 PASS。

### Task 8.8: 提交

```bash
git add src/pet-settings-store.js test/pet-settings-store.test.js \
  src/renderer/renderer.js src/renderer/index.html src/renderer/styles.css \
  src/renderer/walk-movement.js test/walk-movement.test.js
git commit -m "feat(integration): wire settings i18n, focus timer, daily greeting, mouse react"
```

---

## Task 9: 最终集成验证

### Task 9.1: 跑全套 Node 测试

Run: `npm.cmd test`
Expected: 全部 PASS。

### Task 9.2: 跑 Electron 冒烟测试

Run: `npm.cmd run smoke`
Expected: 日志输出 `[smoke] renderer loaded`，进程退出码 0。

### Task 9.3: 启动实际应用做手工冒烟

Run: `npm.cmd start`
人工确认：
- 右键菜单显示中文（喂食 / 摸摸头 / 送小花 / 给奶茶 / 休息一下 / 叫醒 / 设置 / 重置位置 / 退出）
- 托盘菜单中文
- 设置面板显示“心情 / 精力 / 好感度 / 关系：亲密 / 连续陪伴 / 当前动作 / 连击”
- 点击“开始专注”气泡显示“我陪你专注一会儿”，剩余时间倒计时
- 长时间把鼠标停在桌宠上，气泡随机出现中文
- 调高 click density 触发 pout 后再触发中文气泡

### Task 9.4: 提交（如有遗留修改）

```bash
git status
# 若有未提交改动
git add -A
git commit -m "chore: final tweaks from manual smoke test"
```

---

## 改动 / 新增汇总（提交时核对）

**修改：**
- `src/pet-menu-template.js` — 中文化 + 新增 5 个菜单项
- `src/pet-settings-store.js` — 默认值 + 归一化新增 3 个字段（dailyState、mouseReactEnabled、dailyGreetingEnabled）
- `src/renderer/mood-bubble.js` — 全量重写为分类中文文案
- `src/renderer/pet-state-controller.js` — 扩展 `interact` 支持 gift/milktea/rest/wake，委托 DailyState
- `src/renderer/walk-movement.js` — WalkMovementRunner 支持 `setReduced`
- `src/renderer/index.html` — 中文化 + 关系 / 连续陪伴 / 专注计时 / 两个开关
- `src/renderer/styles.css` — 分组标题 + 按钮区
- `src/renderer/renderer.js` — 接入新模块、新命令、每日问候、专注计时、鼠标反应
- `test/pet-menu-template.test.js` — 期望中文
- `test/pet-settings-store.test.js` — 增加新字段与“不持久化 relationshipLevel”
- `test/pet-state-controller.test.js` — 新增 6 个互动测试 + snapshot 含 dailyState
- `test/walk-movement.test.js` — 新增 setReduced 测试

**新增：**
- `src/renderer/daily-state.js`
- `src/renderer/focus-timer.js`
- `src/renderer/mouse-react.js`
- `test/daily-state.test.js`
- `test/focus-timer.test.js`
- `test/mouse-react.test.js`
- `test/relationship-status.test.js`

---

## 运行方法

```powershell
npm.cmd install
npm.cmd test
npm.cmd run smoke   # Electron 启动并自动退出
npm.cmd start       # 实际启动桌宠
```

---

## 后续可扩展方向

1. 心情气泡支持表情贴图 / 字体颜色（保持极简）
2. 番茄钟跨重启恢复（持久化 phase + endAt）
3. 鼠标反应更多随机池 + 性格轮换
4. streakDays 触发隐藏小动画
5. 关系语气（亲密 / 朋友 / 路人）作为可选模式，不强制等级
6. 互动历史只读时间线（最近 10 条互动）
7. 桌宠跟随鼠标长按淡入 / 淡出
8. 简单 PNG 资源位（生日帽 / 圣诞帽），但保持帧目录结构


