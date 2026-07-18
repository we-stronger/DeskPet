const fs = require("node:fs");
const path = require("node:path");

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
  focusDurationMinutes: 25,
  breakDurationMinutes: 5,
  longBreakDurationMinutes: 15,
  focusRoundsBeforeLongBreak: 4,
  focusNotificationsEnabled: true,
  focusSoundEnabled: false,
  focusPetReactionsEnabled: true,
  focusConfirmInterrupt: true,
  focusSession: null,
  pendingTaskName: "",
  focusRecords: Object.freeze([]),
  clockEnabled: true,
  clockOpacityPercent: 100,
  clockDisplayMode: "floating",
  focusIndicatorEnabled: true,
  focusDisplayMode: "floating",
  petClickThroughEnabled: false,
  musicStatusClickThroughEnabled: false,
  musicStatusOpacityPercent: 100,
  // User-saved top-left position (CSS pixels relative to the pet's
  // #stage) of the in-pet music panel. null = use the built-in default
  // (top-right of the stage). Persisted across restarts so the user
  // doesn't have to re-drag it every time.
  musicPanelPosition: null,
  // User-saved top-left position of the clock widget. When set, the
  // renderer skips the auto-anchor placement and pins the clock at
  // this position instead. null = auto-anchor as before.
  clockPosition: null,
  // User-saved top-left position of the compact focus indicator.
  // null = bottom-right default.
  focusIndicatorPosition: null,
  // User-saved top-left position of the compact music status bar.
  // null = bottom-left default.
  musicStatusPosition: null,
  musicLyricStyle: Object.freeze({
    color: "#243044",
    fontSize: 12,
    controlSize: 31,
  }),
  // LLM (ZhipuAI / GLM) configuration. Configured via the in-app
  // settings window (storage survives across restarts and uninstall
  // because NSIS is set to deleteAppDataOnUninstall:false). The
  // .env-based loading path was removed for packaged builds; this
  // object is now the single source of truth.
  llm: Object.freeze({
    apiKey: "",
    model: "glm-4-flash",
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    systemPrompt: "",
  }),
});

const FOCUS_RECORD_MAX = 500;
const TASK_NAME_MAX = 60;
const FOCUS_SESSION_VERSION = 1;
const FOCUS_PHASES = new Set([
  "focus",
  "short-break",
  "long-break",
  "waiting-for-break",
  "waiting-for-focus",
]);
const FOCUS_STATUSES = new Set(["running", "paused", "waiting"]);
const FOCUS_RESULTS = new Set(["completed", "interrupted", "skipped"]);

function normalizePercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 200) {
    return 100;
  }
  return Math.round(percent);
}

function normalizeOpacityPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 20 || percent > 100) {
    return defaultPetSettings.opacityPercent;
  }
  return Math.round(percent);
}

function normalizeMusicStatusOpacityPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 20 || percent > 100) {
    return defaultPetSettings.musicStatusOpacityPercent;
  }
  return Math.round(percent);
}

function normalizeClockOpacityPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 20 || percent > 100) {
    return defaultPetSettings.clockOpacityPercent;
  }
  return Math.round(percent);
}

function normalizePosition(position) {
  if (!position || typeof position !== "object") {
    return null;
  }

  const x = Number(position.x);
  const y = Number(position.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x: Math.round(x), y: Math.round(y) };
}

// For the in-pet widgets (music panel, clock). Identical validation
// to normalizePosition but kept as a separate function so the two
// fields don't accidentally share bounds if the pet window size
// changes in the future. Returns null for missing/invalid input so
// callers fall back to their built-in default position.
function normalizeLlmSettings(llm) {
  const defaults = defaultPetSettings.llm;
  if (!llm || typeof llm !== "object") {
    return { ...defaults };
  }
  return {
    apiKey: typeof llm.apiKey === "string" ? llm.apiKey : defaults.apiKey,
    model: typeof llm.model === "string" && llm.model.trim()
      ? llm.model.trim()
      : defaults.model,
    endpoint: typeof llm.endpoint === "string" && llm.endpoint.trim()
      ? llm.endpoint.trim()
      : defaults.endpoint,
    systemPrompt: typeof llm.systemPrompt === "string"
      ? llm.systemPrompt
      : defaults.systemPrompt,
  };
}

function normalizeMusicLyricStyle(style) {
  const defaults = defaultPetSettings.musicLyricStyle;
  if (!style || typeof style !== "object") {
    return { ...defaults };
  }
  const color = typeof style.color === "string" && /^#[0-9a-f]{6}$/i.test(style.color.trim())
    ? style.color.trim()
    : defaults.color;
  const fontSizeNumber = Number(style.fontSize);
  const fontSize = Number.isFinite(fontSizeNumber) && fontSizeNumber >= 10 && fontSizeNumber <= 22
    ? Math.round(fontSizeNumber)
    : defaults.fontSize;
  const controlSizeNumber = Number(style.controlSize);
  const controlSize = Number.isFinite(controlSizeNumber) && controlSizeNumber >= 24 && controlSizeNumber <= 44
    ? Math.round(controlSizeNumber)
    : defaults.controlSize;
  return { color, fontSize, controlSize };
}

function normalizeWidgetPosition(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

function normalizeStateNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeFocusDurationMinutes(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeFocusRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }
  const task = typeof record.task === "string"
    ? record.task.slice(0, TASK_NAME_MAX)
    : typeof record.taskName === "string"
      ? record.taskName.slice(0, TASK_NAME_MAX)
      : "";
  const focusDurationMs = Number(record.focusDurationMs);
  const completedAt = typeof record.completedAt === "string" ? record.completedAt : "";
  const richRecord = typeof record.id === "string"
    && record.id
    && typeof record.sessionId === "string"
    && record.sessionId
    && FOCUS_PHASES.has(record.phase)
    && FOCUS_RESULTS.has(record.result);
  if (richRecord) {
    const plannedDurationMs = Number(record.plannedDurationMs);
    const actualDurationMs = Number(record.actualDurationMs);
    const startedAt = Number(record.startedAt);
    if (!Number.isFinite(plannedDurationMs) || plannedDurationMs <= 0
      || !Number.isFinite(actualDurationMs) || actualDurationMs < 0
      || !Number.isFinite(focusDurationMs) || focusDurationMs < 0
      || !Number.isFinite(startedAt)) {
      return null;
    }
    return {
      id: record.id,
      transitionKey: typeof record.transitionKey === "string" ? record.transitionKey : "",
      sessionId: record.sessionId,
      task,
      taskName: typeof record.taskName === "string" ? record.taskName.slice(0, TASK_NAME_MAX) : task,
      phase: record.phase,
      result: record.result,
      plannedDurationMs,
      actualDurationMs,
      focusDurationMs,
      startedAt,
      completedAt,
      roundNumber: Math.max(0, Math.round(Number(record.roundNumber) || 0)),
    };
  }
  if (!Number.isFinite(focusDurationMs) || focusDurationMs <= 0) {
    return null;
  }
  return { task, focusDurationMs, completedAt };
}

function normalizeFocusRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }
  const normalized = records
    .map(normalizeFocusRecord)
    .filter(Boolean);
  return normalized.slice(-FOCUS_RECORD_MAX);
}

function normalizeWidgetDisplayMode(value) {
  return value === "music" || value === "hidden" ? value : "floating";
}

function normalizeFocusSession(session) {
  if (!session || typeof session !== "object" || session.version !== FOCUS_SESSION_VERSION) {
    return null;
  }
  if (typeof session.sessionId !== "string" || !session.sessionId
    || !FOCUS_PHASES.has(session.phase)
    || !FOCUS_STATUSES.has(session.status)) {
    return null;
  }
  const requiredNumbers = [
    "startedAt",
    "phaseStartedAt",
    "plannedDurationMs",
    "focusDurationMs",
    "shortBreakDurationMs",
    "longBreakDurationMs",
    "roundsBeforeLongBreak",
    "completedFocusRounds",
    "updatedAt",
  ];
  if (requiredNumbers.some((key) => !Number.isFinite(Number(session[key])))) {
    return null;
  }
  const endsAt = session.endsAt == null ? null : Number(session.endsAt);
  const pausedRemainingMs = session.pausedRemainingMs == null
    ? null
    : Number(session.pausedRemainingMs);
  if ((endsAt != null && !Number.isFinite(endsAt))
    || (pausedRemainingMs != null && !Number.isFinite(pausedRemainingMs))) {
    return null;
  }
  const suggestedBreakPhase = session.suggestedBreakPhase === "short-break"
    || session.suggestedBreakPhase === "long-break"
    ? session.suggestedBreakPhase
    : null;
  return {
    version: FOCUS_SESSION_VERSION,
    revision: Math.max(0, Math.round(Number(session.revision) || 0)),
    sessionId: session.sessionId,
    taskName: typeof session.taskName === "string" ? session.taskName.slice(0, TASK_NAME_MAX) : "",
    phase: session.phase,
    status: session.status,
    startedAt: Number(session.startedAt),
    phaseStartedAt: Number(session.phaseStartedAt),
    endsAt,
    pausedRemainingMs,
    plannedDurationMs: Number(session.plannedDurationMs),
    completedFocusRounds: Math.max(0, Math.round(Number(session.completedFocusRounds))),
    roundsBeforeLongBreak: Math.max(1, Math.round(Number(session.roundsBeforeLongBreak))),
    focusDurationMs: Number(session.focusDurationMs),
    shortBreakDurationMs: Number(session.shortBreakDurationMs),
    longBreakDurationMs: Number(session.longBreakDurationMs),
    suggestedBreakPhase,
    updatedAt: Number(session.updatedAt),
  };
}

function normalizePetState(state = {}) {
  if (!state || typeof state !== "object") {
    return {
      ...defaultPetSettings.petState,
      dailyState: { ...defaultPetSettings.petState.dailyState },
    };
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
    focusDurationMinutes: normalizeFocusDurationMinutes(
      settings.focusDurationMinutes,
      defaultPetSettings.focusDurationMinutes,
      1,
      180,
    ),
    breakDurationMinutes: normalizeFocusDurationMinutes(
      settings.breakDurationMinutes,
      defaultPetSettings.breakDurationMinutes,
      1,
      60,
    ),
    longBreakDurationMinutes: normalizeFocusDurationMinutes(
      settings.longBreakDurationMinutes,
      defaultPetSettings.longBreakDurationMinutes,
      1,
      120,
    ),
    focusRoundsBeforeLongBreak: normalizeFocusDurationMinutes(
      settings.focusRoundsBeforeLongBreak,
      defaultPetSettings.focusRoundsBeforeLongBreak,
      1,
      12,
    ),
    focusNotificationsEnabled: typeof settings.focusNotificationsEnabled === "boolean"
      ? settings.focusNotificationsEnabled
      : defaultPetSettings.focusNotificationsEnabled,
    focusSoundEnabled: typeof settings.focusSoundEnabled === "boolean"
      ? settings.focusSoundEnabled
      : defaultPetSettings.focusSoundEnabled,
    focusPetReactionsEnabled: typeof settings.focusPetReactionsEnabled === "boolean"
      ? settings.focusPetReactionsEnabled
      : defaultPetSettings.focusPetReactionsEnabled,
    focusConfirmInterrupt: typeof settings.focusConfirmInterrupt === "boolean"
      ? settings.focusConfirmInterrupt
      : defaultPetSettings.focusConfirmInterrupt,
    focusSession: normalizeFocusSession(settings.focusSession),
    pendingTaskName: typeof settings.pendingTaskName === "string"
      ? settings.pendingTaskName.slice(0, TASK_NAME_MAX)
      : defaultPetSettings.pendingTaskName,
    focusRecords: normalizeFocusRecords(settings.focusRecords),
    clockEnabled: typeof settings.clockEnabled === "boolean"
      ? settings.clockEnabled
      : defaultPetSettings.clockEnabled,
    clockOpacityPercent: normalizeClockOpacityPercent(settings.clockOpacityPercent),
    clockDisplayMode: normalizeWidgetDisplayMode(settings.clockDisplayMode),
    focusIndicatorEnabled: typeof settings.focusIndicatorEnabled === "boolean"
      ? settings.focusIndicatorEnabled
      : defaultPetSettings.focusIndicatorEnabled,
    focusDisplayMode: normalizeWidgetDisplayMode(settings.focusDisplayMode),
    petClickThroughEnabled: typeof settings.petClickThroughEnabled === "boolean"
      ? settings.petClickThroughEnabled
      : defaultPetSettings.petClickThroughEnabled,
    musicStatusClickThroughEnabled: typeof settings.musicStatusClickThroughEnabled === "boolean"
      ? settings.musicStatusClickThroughEnabled
      : defaultPetSettings.musicStatusClickThroughEnabled,
    musicStatusOpacityPercent: normalizeMusicStatusOpacityPercent(settings.musicStatusOpacityPercent),
    musicPanelPosition: normalizeWidgetPosition(settings.musicPanelPosition),
    clockPosition: normalizeWidgetPosition(settings.clockPosition),
    focusIndicatorPosition: normalizeWidgetPosition(settings.focusIndicatorPosition),
    musicStatusPosition: normalizeWidgetPosition(settings.musicStatusPosition),
    musicLyricStyle: normalizeMusicLyricStyle(settings.musicLyricStyle),
    llm: normalizeLlmSettings(settings.llm),
  };
}

function loadPetSettings(settingsPath) {
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    return normalizePetSettings(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT" && error.name !== "SyntaxError") {
      throw error;
    }
    return normalizePetSettings(defaultPetSettings);
  }
}

function savePetSettings(settingsPath, settings) {
  const normalized = normalizePetSettings(settings);
  const dir = path.dirname(settingsPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${settingsPath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, settingsPath);
  return normalized;
}

module.exports = {
  defaultPetSettings,
  loadPetSettings,
  normalizePetState,
  normalizePetSettings,
  normalizeOpacityPercent,
  savePetSettings,
};
