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
      label: `状态：睡眠中 / 精力 ${petState.energy}`,
      enabled: false,
    };
  }

  return {
    label: `状态：心情 ${petState.mood} / 精力 ${petState.energy} / 好感 ${petState.affinity}`,
    enabled: false,
  };
}

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayFocusSummary(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return null;
  }
  const key = todayKey();
  const todays = records.filter((record) => {
    if (!record || typeof record.completedAt !== "string" || record.completedAt.slice(0, 10) !== key) {
      return false;
    }
    const isFocus = !record.phase || record.phase === "focus";
    const isCompleted = !record.result || record.result === "completed";
    return isFocus && isCompleted;
  });
  if (todays.length === 0) {
    return null;
  }
  const totalMinutes = Math.round(todays.reduce((sum, r) => sum + (r.focusDurationMs || 0), 0) / 60000);
  return { count: todays.length, totalMinutes };
}

function focusSubmenu({
  focusDurationMinutes,
  breakDurationMinutes,
  longBreakDurationMinutes,
  pendingTaskName,
  focusRecords,
  focusSession,
  sendCommand,
}) {
  const session = focusSession && typeof focusSession === "object" ? focusSession : {};
  const phase = typeof session.phase === "string" ? session.phase : "idle";
  const status = typeof session.status === "string" ? session.status : "idle";
  const sessionTaskName = typeof session.taskName === "string" ? session.taskName.trim() : "";
  const taskName = sessionTaskName || (typeof pendingTaskName === "string" ? pendingTaskName.trim() : "");
  const isFocus = phase === "focus";
  const isBreak = phase === "short-break" || phase === "long-break";
  const isWaitingForBreak = phase === "waiting-for-break";
  const isWaitingForFocus = phase === "waiting-for-focus";
  const isTimedPhase = isFocus || isBreak;
  const canStartFocus = phase === "idle" || isWaitingForFocus;
  const canStartBreak = phase === "idle" || isWaitingForBreak;
  const suggestedLongBreak = isWaitingForBreak && session.suggestedBreakPhase === "long-break";
  const breakMinutes = suggestedLongBreak ? longBreakDurationMinutes : breakDurationMinutes;
  const breakKind = suggestedLongBreak ? "长休息" : (isWaitingForBreak ? "短休息" : "休息");
  const pauseLabel = status === "paused"
    ? "▶ 继续"
    : (phase === "idle" ? "⏸ 暂停 / 继续" : "⏸ 暂停");
  const endLabel = isFocus
    ? "■ 提前结束专注"
    : (isBreak || isWaitingForBreak ? "⏭ 跳过本次休息" : "■ 结束专注");
  const taskLabel = taskName
    ? `当前任务：${taskName}`
    : "当前任务：（未命名）";
  const durationLabel = `专注 ${focusDurationMinutes} 分 / 休息 ${breakDurationMinutes} 分`;
  const summary = todayFocusSummary(focusRecords);
  const summaryLabel = summary
    ? `今日已完成 ${summary.count} 次，共 ${summary.totalMinutes} 分钟`
    : "今日还没有专注记录";
  return [
    { label: taskLabel, enabled: false },
    { label: durationLabel, enabled: false },
    { label: summaryLabel, enabled: false },
    { type: "separator" },
    {
      label: `▶ 开始专注（${focusDurationMinutes} 分钟）`,
      enabled: canStartFocus,
      click: () => sendCommand("focus:start"),
    },
    {
      label: `☕ 开始${breakKind}（${breakMinutes} 分钟）`,
      enabled: canStartBreak,
      click: () => sendCommand("break:start"),
    },
    {
      label: pauseLabel,
      enabled: isTimedPhase,
      click: () => sendCommand("focus:toggle-pause"),
    },
    {
      label: endLabel,
      enabled: isFocus || isBreak || isWaitingForBreak,
      click: () => sendCommand("focus:end"),
    },
    {
      label: "↺ 重置",
      enabled: phase !== "idle",
      click: () => sendCommand("focus:reset"),
    },
  ];
}

const TASK_SUBMENU_MAX = 5;

function taskSubmenu({ recentTaskNames, currentTaskName, sendCommand }) {
  const trimmedCurrent = (typeof currentTaskName === "string" ? currentTaskName.trim() : "");
  const items = [
    {
      label: "（无任务）",
      type: "radio",
      checked: !trimmedCurrent,
      click: () => sendCommand("task:clear"),
    },
  ];
  const seen = new Set([""]);
  const list = Array.isArray(recentTaskNames) ? recentTaskNames : [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    items.push({
      label: name,
      type: "radio",
      checked: name === trimmedCurrent,
      click: () => sendCommand(`task:set:${encodeURIComponent(name)}`),
    });
    if (items.length >= TASK_SUBMENU_MAX + 1) break;
  }
  return items;
}

function interactionSubmenu({ sleeping, sendCommand }) {
  return [
    { label: "😊 开心", click: () => sendCommand("happy") },
    { label: "😤 不满", click: () => sendCommand("pout") },
    sleeping
      ? { label: "☀ 叫醒", click: () => sendCommand("wake") }
      : { label: "🌙 休息", click: () => sendCommand("rest") },
    { label: "🚶 走走", click: () => sendCommand("walk") },
    { label: "🎧 听音乐", click: () => sendCommand("music:listen") },
    { type: "separator" },
    { label: "🍪 喂食", click: () => sendCommand("feed") },
    { label: "✋ 摸摸头", click: () => sendCommand("pet") },
    { label: "🌸 送花", click: () => sendCommand("gift") },
    { label: "🧋 奶茶", click: () => sendCommand("milktea") },
    { label: "💬 和我聊聊…", click: () => sendCommand("chat:open") },
  ];
}

function appearanceSubmenu({ currentSizePercent, currentSpeedPercent, sendCommand }) {
  return [
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
    { label: "↔ 重置尺寸", click: () => sendCommand("size:100") },
    { label: "⏱ 重置速度", click: () => sendCommand("speed:100") },
  ];
}

function musicSubmenu({ sendCommand }) {
  return [
    { label: "⏯ 播放 / 暂停", click: () => sendCommand("music:play-pause") },
    { label: "⏭ 下一首", click: () => sendCommand("music:next") },
    { label: "⏮ 上一首", click: () => sendCommand("music:previous") },
    { type: "separator" },
    { label: "🎚 打开网易云音乐面板", click: () => sendCommand("music:open-window") },
    { label: "🔍 搜索音乐…", click: () => sendCommand("music:open-search") },
    { label: "📚 我的歌单", click: () => sendCommand("music:open-playlists") },
  ];
}

function buildContextMenuTemplate({
  currentSizePercent = 100,
  currentSpeedPercent = 100,
  petState,
  focusDurationMinutes = 25,
  breakDurationMinutes = 5,
  longBreakDurationMinutes = 15,
  focusRoundsBeforeLongBreak = 4,
  pendingTaskName = "",
  focusRecords = [],
  focusSession = null,
  recentTaskNames = [],
  sendCommand,
  quit,
}) {
  const sleeping = !!(petState && petState.sleeping);
  const template = [
    {
      label: "✨ 互动",
      submenu: interactionSubmenu({ sleeping, sendCommand }),
    },
    {
      label: "🎚 外观",
      submenu: appearanceSubmenu({ currentSizePercent, currentSpeedPercent, sendCommand }),
    },
    {
      label: "⏱ 专注",
      submenu: focusSubmenu({
        focusDurationMinutes,
        breakDurationMinutes,
        longBreakDurationMinutes,
        focusRoundsBeforeLongBreak,
        pendingTaskName,
        focusRecords,
        focusSession,
        sendCommand,
      }),
    },
    {
      label: "📌 任务",
      submenu: taskSubmenu({
        recentTaskNames,
        currentTaskName: pendingTaskName,
        sendCommand,
      }),
    },
    {
      label: "🎵 音乐",
      submenu: musicSubmenu({ sendCommand }),
    },
    { type: "separator" },
    { label: "🏠 回到 idle", click: () => sendCommand("idle") },
    { label: "⚙ 设置", click: () => sendCommand("settings") },
    { label: "↺ 恢复默认", click: () => sendCommand("restore-defaults") },
    { type: "separator" },
    { label: "⏻ 退出", click: quit },
  ];

  const status = statusMenuItem(petState);
  return status ? [status, { type: "separator" }, ...template] : template;
}

function buildTrayMenuTemplate({
  petState,
  sendCommand,
  resetPosition,
  quit,
  clockEnabled = true,
  focusIndicatorEnabled = true,
  petClickThroughEnabled = false,
  musicStatusClickThroughEnabled = false,
  focusDurationMinutes = 25,
  breakDurationMinutes = 5,
  longBreakDurationMinutes = 15,
  focusRoundsBeforeLongBreak = 4,
  pendingTaskName = "",
  focusRecords = [],
  focusSession = null,
}) {
  const template = [
    { label: "👀 显示桌宠", click: () => sendCommand("show") },
    { label: "⚙ 设置", click: () => sendCommand("settings") },
    {
      label: "⏱ 专注",
      submenu: focusSubmenu({
        focusDurationMinutes,
        breakDurationMinutes,
        longBreakDurationMinutes,
        focusRoundsBeforeLongBreak,
        pendingTaskName,
        focusRecords,
        focusSession,
        sendCommand,
      }),
    },
    { label: "↔ 重置尺寸", click: () => sendCommand("size:100") },
    { label: "⏱ 重置速度", click: () => sendCommand("speed:100") },
    { label: "📍 重置位置", click: resetPosition },
    { label: "↺ 恢复默认", click: () => sendCommand("restore-defaults") },
    { type: "separator" },
    { label: "🎵 打开音乐面板", click: () => sendCommand("music:open-panel") },
    { label: "⏱ 显示时间", type: "checkbox", checked: clockEnabled, click: () => sendCommand("clock:toggle") },
    { label: "🎯 显示专注状态", type: "checkbox", checked: focusIndicatorEnabled, click: () => sendCommand("focus-indicator:toggle") },
    { label: "🖱 桌宠鼠标穿透", type: "checkbox", checked: petClickThroughEnabled, click: () => sendCommand("pet-click-through:toggle") },
    { label: "🖱 音乐栏鼠标穿透", type: "checkbox", checked: musicStatusClickThroughEnabled, click: () => sendCommand("music-click-through:toggle") },
    { type: "separator" },
    { label: "⏻ 退出", click: quit },
  ];

  const status = statusMenuItem(petState);
  return status ? [status, { type: "separator" }, ...template] : template;
}

module.exports = {
  buildContextMenuTemplate,
  buildTrayMenuTemplate,
  statusMenuItem,
  taskSubmenu,
  interactionSubmenu,
  appearanceSubmenu,
  musicSubmenu,
  focusSubmenu,
  todayFocusSummary,
  TASK_SUBMENU_MAX,
};
