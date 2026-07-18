(function attachFocusStatistics(root) {
  function dayKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  function previousDayKey(key) {
    const parts = String(key).split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return "";
    const date = new Date(parts[0], parts[1] - 1, parts[2] - 1);
    return dayKey(date);
  }

  function focusDuration(record) {
    const preferred = record && record.result
      ? Number(record.actualDurationMs)
      : Number(record && record.focusDurationMs);
    if (Number.isFinite(preferred) && preferred >= 0) return preferred;
    const fallback = Number(record && record.focusDurationMs);
    return Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
  }

  function isFocusRecord(record) {
    return record && (!record.phase || record.phase === "focus");
  }

  function isCompletedFocus(record) {
    return isFocusRecord(record) && (!record.result || record.result === "completed");
  }

  function recentDayKeys(now, count) {
    const current = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(current.getTime())) return [];
    const keys = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      keys.push(dayKey(new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() - offset,
        12,
      )));
    }
    return keys;
  }

  function summarizeFocusRecords(records, now = new Date(), session = null) {
    const valid = (Array.isArray(records) ? records : []).filter((record) => (
      record && dayKey(record.completedAt) && isFocusRecord(record)
    ));
    const completed = valid.filter(isCompletedFocus);
    const interrupted = valid.filter((record) => record.result === "interrupted");
    const today = dayKey(now);
    const todayRecords = completed.filter((record) => dayKey(record.completedAt) === today);
    const days = new Set(completed.map((record) => dayKey(record.completedAt)));
    let streakDays = 0;
    let cursor = today;
    while (cursor && days.has(cursor)) {
      streakDays += 1;
      cursor = previousDayKey(cursor);
    }

    const taskMap = new Map();
    for (const record of completed) {
      const task = String(record.task || record.taskName || "未命名任务");
      const current = taskMap.get(task) || { task, count: 0, durationMs: 0 };
      current.count += 1;
      current.durationMs += focusDuration(record);
      taskMap.set(task, current);
    }

    const sevenDay = recentDayKeys(now, 7).map((key) => {
      const entries = completed.filter((record) => dayKey(record.completedAt) === key);
      return {
        day: key,
        count: entries.length,
        durationMs: entries.reduce((sum, record) => sum + focusDuration(record), 0),
      };
    });

    const completedRounds = Number(session && session.completedFocusRounds);
    const totalRounds = Number(session && session.roundsBeforeLongBreak);
    const normalizedTotalRounds = Math.max(1, Math.round(totalRounds));
    const normalizedCompletedRounds = Math.max(0, Math.round(completedRounds));
    const cycleRemainder = normalizedCompletedRounds % normalizedTotalRounds;
    const waitingForCompletedLongBreakCycle = cycleRemainder === 0
      && normalizedCompletedRounds > 0
      && session?.phase === "waiting-for-break"
      && session?.suggestedBreakPhase === "long-break";
    return {
      todayCount: todayRecords.length,
      todayDurationMs: todayRecords.reduce((sum, record) => sum + focusDuration(record), 0),
      totalCount: completed.length,
      totalDurationMs: completed.reduce((sum, record) => sum + focusDuration(record), 0),
      streakDays,
      interruptedCount: interrupted.length,
      interruptedDurationMs: interrupted.reduce((sum, record) => sum + focusDuration(record), 0),
      sevenDay,
      byTask: [...taskMap.values()].sort((left, right) => (
        right.durationMs - left.durationMs || left.task.localeCompare(right.task)
      )),
      cycleProgress: Number.isFinite(completedRounds) && Number.isFinite(totalRounds) && totalRounds > 0
        ? {
            completed: waitingForCompletedLongBreakCycle ? normalizedTotalRounds : cycleRemainder,
            total: normalizedTotalRounds,
          }
        : null,
    };
  }

  const api = { summarizeFocusRecords };
  if (root) root.DeskpetFocusStatistics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
