const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildContextMenuTemplate,
  buildTrayMenuTemplate,
} = require("../src/pet-menu-template");

function labels(items) {
  return items.filter((item) => item.type !== "separator").map((item) => item.label);
}

function submenu(template, label) {
  const item = template.find((entry) => entry.label === label);
  assert.ok(item && Array.isArray(item.submenu), `${label} submenu should exist`);
  return item.submenu;
}

test("context menu exposes compact grouped sections and dispatches core commands", () => {
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
    "✨ 互动",
    "🎚 外观",
    "⏱ 专注",
    "📌 任务",
    "🎵 音乐",
    "🏠 回到 idle",
    "⚙ 设置",
    "↺ 恢复默认",
    "⏻ 退出",
  ]);

  const interaction = submenu(template, "✨ 互动");
  assert.deepEqual(labels(interaction), [
    "😊 开心",
    "😤 不满",
    "🌙 休息",
    "🚶 走走",
    "🎧 听音乐",
    "🍪 喂食",
    "✋ 摸摸头",
    "🌸 送花",
    "🧋 奶茶",
    "💬 和我聊聊…",
  ]);

  interaction.find((item) => item.label === "🍪 喂食").click();
  interaction.find((item) => item.label === "✋ 摸摸头").click();
  interaction.find((item) => item.label === "🌸 送花").click();
  interaction.find((item) => item.label === "🧋 奶茶").click();
  interaction.find((item) => item.label === "🎧 听音乐").click();
  interaction.find((item) => item.label === "💬 和我聊聊…").click();
  template.find((item) => item.label === "↺ 恢复默认").click();
  template.find((item) => item.label === "⏻ 退出").click();
  assert.deepEqual(commands, ["feed", "pet", "gift", "milktea", "music:listen", "chat:open", "restore-defaults", "quit"]);
});

test("context menu swaps rest for wake inside the interaction submenu when sleeping", () => {
  const template = buildContextMenuTemplate({
    petState: { mood: 50, affinity: 0, energy: 5, sleeping: true },
    sendCommand: () => {},
    quit: () => {},
  });

  const interactionLabels = labels(submenu(template, "✨ 互动"));
  assert.ok(interactionLabels.includes("☀ 叫醒"), "wake should appear when sleeping");
  assert.ok(!interactionLabels.includes("🌙 休息"), "rest should be hidden when sleeping");
});

test("appearance submenu exposes percentage radio menus and reset commands", () => {
  const commands = [];
  const template = buildContextMenuTemplate({
    currentSizePercent: 50,
    currentSpeedPercent: 120,
    petState: { mood: 50, affinity: 0, energy: 80, sleeping: false },
    sendCommand: (command) => commands.push(command),
    quit: () => {},
  });

  const appearance = submenu(template, "🎚 外观");
  const sizeMenu = submenu(appearance, "尺寸");
  const speedMenu = submenu(appearance, "速度");
  assert.equal(sizeMenu.find((item) => item.label === "50%").checked, true);
  assert.equal(speedMenu.find((item) => item.label === "120%").checked, true);

  appearance.find((item) => item.label === "↔ 重置尺寸").click();
  appearance.find((item) => item.label === "⏱ 重置速度").click();
  assert.deepEqual(commands, ["size:100", "speed:100"]);
});

test("focus submenu exposes timer summary and start/pause/reset commands", () => {
  const commands = [];
  const template = buildContextMenuTemplate({
    petState: { mood: 50, affinity: 0, energy: 80, sleeping: false },
    sendCommand: (command) => commands.push(command),
    quit: () => {},
  });

  const focusMenu = submenu(template, "⏱ 专注");
  assert.deepEqual(labels(focusMenu), [
    "当前任务：（未命名）",
    "专注 25 分 / 休息 5 分",
    "今日还没有专注记录",
    "▶ 开始专注（25 分钟）",
    "☕ 开始休息（5 分钟）",
    "⏸ 暂停 / 继续",
    "■ 结束专注",
    "↺ 重置",
  ]);

  focusMenu.filter((item) => typeof item.click === "function").forEach((item) => item.click());
  assert.deepEqual(commands, [
    "focus:start",
    "break:start",
    "focus:toggle-pause",
    "focus:end",
    "focus:reset",
  ]);
});

test("focus submenu keeps configuration out of the records entry", () => {
  const template = buildContextMenuTemplate({
    petState: { mood: 50, affinity: 0, energy: 80, sleeping: false },
    sendCommand: () => {},
    quit: () => {},
  });

  const focusLabels = labels(submenu(template, "⏱ 专注"));
  assert.ok(!focusLabels.includes("📋 查看专注记录"));
  assert.ok(!focusLabels.includes("⚙ 专注设置"));
  assert.ok(!focusLabels.includes("显示设置"));
});

test("focus submenu reflects the pending task name and today's record count", () => {
  // Use local noon today so the ISO date portion matches the local-date
  // key used by todayFocusSummary, regardless of UTC offset.
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayIso = today.toISOString();
  const template = buildContextMenuTemplate({
    petState: { mood: 50, affinity: 0, energy: 80, sleeping: false },
    focusDurationMinutes: 45,
    breakDurationMinutes: 10,
    pendingTaskName: "写季度规划",
    focusRecords: [
      { task: "写季度规划", focusDurationMs: 45 * 60 * 1000, completedAt: todayIso },
      { task: "code review", focusDurationMs: 25 * 60 * 1000, completedAt: todayIso },
    ],
    sendCommand: () => {},
    quit: () => {},
  });

  const focusLabels = labels(submenu(template, "⏱ 专注"));
  assert.ok(focusLabels.includes("当前任务：写季度规划"));
  assert.ok(focusLabels.includes("专注 45 分 / 休息 10 分"));
  assert.ok(focusLabels.includes("今日已完成 2 次，共 70 分钟"));
  assert.ok(focusLabels.includes("▶ 开始专注（45 分钟）"));
});

test("focus summary excludes interrupted focus and break records", () => {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const completedAt = today.toISOString();
  const template = buildContextMenuTemplate({
    petState: { mood: 50, affinity: 0, energy: 80, sleeping: false },
    focusRecords: [
      { phase: "focus", result: "completed", focusDurationMs: 25 * 60 * 1000, completedAt },
      { phase: "focus", result: "interrupted", focusDurationMs: 10 * 60 * 1000, completedAt },
      { phase: "short-break", result: "completed", focusDurationMs: 5 * 60 * 1000, completedAt },
    ],
    sendCommand: () => {},
    quit: () => {},
  });

  const focusLabels = labels(submenu(template, "⏱ 专注"));
  assert.ok(focusLabels.includes("今日已完成 1 次，共 25 分钟"));
});

test("focus submenu reflects waiting-for-long-break state", () => {
  const template = buildContextMenuTemplate({
    petState: { mood: 50, affinity: 0, energy: 80, sleeping: false },
    longBreakDurationMinutes: 15,
    focusSession: {
      phase: "waiting-for-break",
      status: "waiting",
      taskName: "写季度规划",
      suggestedBreakPhase: "long-break",
    },
    sendCommand: () => {},
    quit: () => {},
  });

  const focusMenu = submenu(template, "⏱ 专注");
  assert.equal(focusMenu.find((item) => item.label.startsWith("当前任务：")).label, "当前任务：写季度规划");
  assert.equal(focusMenu.find((item) => item.label?.startsWith("▶ 开始专注")).enabled, false);
  assert.equal(focusMenu.find((item) => item.label === "☕ 开始长休息（15 分钟）").enabled, true);
  assert.equal(focusMenu.find((item) => item.label === "⏸ 暂停").enabled, false);
  assert.equal(focusMenu.find((item) => item.label === "⏭ 跳过本次休息").enabled, true);
});

test("focus submenu exposes resume for a paused focus session", () => {
  const template = buildContextMenuTemplate({
    petState: { mood: 50, affinity: 0, energy: 80, sleeping: false },
    focusSession: { phase: "focus", status: "paused", taskName: "code review" },
    sendCommand: () => {},
    quit: () => {},
  });

  const focusMenu = submenu(template, "⏱ 专注");
  assert.equal(focusMenu.find((item) => item.label === "▶ 继续").enabled, true);
  assert.equal(focusMenu.find((item) => item.label === "■ 提前结束专注").enabled, true);
  assert.equal(focusMenu.find((item) => item.label?.startsWith("▶ 开始专注")).enabled, false);
});

test("task submenu offers recent task names and dispatches set/clear commands", () => {
  const commands = [];
  const template = buildContextMenuTemplate({
    petState: { mood: 50, affinity: 0, energy: 80, sleeping: false },
    pendingTaskName: "code review",
    recentTaskNames: ["code review", "写文档"],
    sendCommand: (cmd) => commands.push(cmd),
    quit: () => {},
  });

  const taskMenu = submenu(template, "📌 任务");
  assert.deepEqual(labels(taskMenu), ["（无任务）", "code review", "写文档"]);

  const noTask = taskMenu.find((item) => item.label === "（无任务）");
  assert.equal(noTask.checked, false);
  const current = taskMenu.find((item) => item.label === "code review");
  assert.equal(current.checked, true);

  noTask.click();
  current.click();
  taskMenu.find((item) => item.label === "写文档").click();
  assert.deepEqual(commands, [
    "task:clear",
    `task:set:${encodeURIComponent("code review")}`,
    `task:set:${encodeURIComponent("写文档")}`,
  ]);
});

test("task submenu caps to 5 most-recent task names and dedupes", () => {
  const recent = ["task-1", "task-2", "task-3", "task-4", "task-5", "task-6"];
  const template = buildContextMenuTemplate({
    petState: { mood: 50, affinity: 0, energy: 80, sleeping: false },
    recentTaskNames: recent,
    sendCommand: () => {},
    quit: () => {},
  });

  const taskLabels = labels(submenu(template, "📌 任务"));
  assert.equal(taskLabels.length, 6, "should include （无任务） + 5 recent names");
  assert.equal(taskLabels[0], "（无任务）");
  assert.deepEqual(taskLabels.slice(1), ["task-1", "task-2", "task-3", "task-4", "task-5"]);
});

test("tray menu exposes compact recovery commands", () => {
  const commands = [];
  const template = buildTrayMenuTemplate({
    petState: { mood: 60, affinity: 2, energy: 0, sleeping: true },
    sendCommand: (command) => commands.push(command),
    resetPosition: () => commands.push("reset-position"),
    quit: () => commands.push("quit"),
  });

  assert.deepEqual(labels(template), [
    "状态：睡眠中 / 精力 0",
    "👀 显示桌宠",
    "⚙ 设置",
    "⏱ 专注",
    "↔ 重置尺寸",
    "⏱ 重置速度",
    "📍 重置位置",
    "↺ 恢复默认",
    "🎵 打开音乐面板",
    "⏱ 显示时间",
    "🎯 显示专注状态",
    "🖱 桌宠鼠标穿透",
    "🖱 音乐栏鼠标穿透",
    "⏻ 退出",
  ]);

  template.find((item) => item.label === "↔ 重置尺寸").click();
  template.find((item) => item.label === "⚙ 设置").click();
  template.find((item) => item.label === "📍 重置位置").click();
  template.find((item) => item.label === "🎵 打开音乐面板").click();
  template.find((item) => item.label === "⏱ 显示时间").click();
  template.find((item) => item.label === "🎯 显示专注状态").click();
  template.find((item) => item.label === "🖱 桌宠鼠标穿透").click();
  template.find((item) => item.label === "🖱 音乐栏鼠标穿透").click();
  assert.deepEqual(commands, [
    "size:100",
    "settings",
    "reset-position",
    "music:open-panel",
    "clock:toggle",
    "focus-indicator:toggle",
    "pet-click-through:toggle",
    "music-click-through:toggle",
  ]);
});

test("tray focus submenu uses the persisted session snapshot", () => {
  const commands = [];
  const template = buildTrayMenuTemplate({
    petState: { mood: 60, affinity: 2, energy: 80, sleeping: false },
    focusSession: { phase: "focus", status: "running", taskName: "写代码" },
    pendingTaskName: "写代码",
    sendCommand: (command) => commands.push(command),
    resetPosition: () => {},
    quit: () => {},
  });

  const focusMenu = submenu(template, "⏱ 专注");
  assert.equal(focusMenu.find((item) => item.label === "⏸ 暂停").enabled, true);
  assert.equal(focusMenu.find((item) => item.label === "■ 提前结束专注").enabled, true);
  focusMenu.find((item) => item.label === "⏸ 暂停").click();
  assert.deepEqual(commands, ["focus:toggle-pause"]);
});

test("music submenu exposes in-app music commands without opening the NetEase client", () => {
  const commands = [];
  const template = buildContextMenuTemplate({
    petState: { mood: 50, affinity: 0, energy: 80, sleeping: false },
    sendCommand: (command) => commands.push(command),
    quit: () => {},
  });

  const musicMenu = submenu(template, "🎵 音乐");
  assert.deepEqual(labels(musicMenu), [
    "⏯ 播放 / 暂停",
    "⏭ 下一首",
    "⏮ 上一首",
    "🎚 打开网易云音乐面板",
    "🔍 搜索音乐…",
    "📚 我的歌单",
  ]);

  musicMenu.filter((item) => typeof item.click === "function").forEach((item) => item.click());
  assert.deepEqual(commands, [
    "music:play-pause",
    "music:next",
    "music:previous",
    "music:open-window",
    "music:open-search",
    "music:open-playlists",
  ]);
});
