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
  interaction.find((item) => item.label === "💬 和我聊聊…").click();
  template.find((item) => item.label === "↺ 恢复默认").click();
  template.find((item) => item.label === "⏻ 退出").click();
  assert.deepEqual(commands, ["feed", "pet", "gift", "milktea", "chat:open", "restore-defaults", "quit"]);
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
    "📋 查看专注记录",
  ]);

  focusMenu.filter((item) => typeof item.click === "function").forEach((item) => item.click());
  assert.deepEqual(commands, [
    "focus:start",
    "break:start",
    "focus:toggle-pause",
    "focus:end",
    "focus:reset",
    "settings:open-records",
  ]);
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
    "↔ 重置尺寸",
    "⏱ 重置速度",
    "📍 重置位置",
    "↺ 恢复默认",
    "⏻ 退出",
  ]);

  template.find((item) => item.label === "↔ 重置尺寸").click();
  template.find((item) => item.label === "📍 重置位置").click();
  assert.deepEqual(commands, ["size:100", "reset-position"]);
});

test("music submenu exposes play/pause/next/previous/search/open-netease commands", () => {
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
    "☁ 打开网易云音乐",
  ]);

  musicMenu.filter((item) => typeof item.click === "function").forEach((item) => item.click());
  assert.deepEqual(commands, [
    "music:play-pause",
    "music:next",
    "music:previous",
    "music:open-panel",
    "music:open-search",
    "music:open-playlists",
    "music:open-netease",
  ]);
});
