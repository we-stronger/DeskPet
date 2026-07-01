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
  pendingTaskName: "",
  focusRecords: Object.freeze([]),
  clockEnabled: true,
  // User-saved top-left position (CSS pixels relative to the pet's
  // #stage) of the in-pet music panel. null = use the built-in default
  // (top-right of the stage). Persisted across restarts so the user
  // doesn't have to re-drag it every time.
  musicPanelPosition: null,
  // User-saved top-left position of the clock widget. When set, the
  // renderer skips the auto-anchor placement and pins the clock at
  // this position instead. null = auto-anchor as before.
  clockPosition: null,
});

const FOCUS_RECORD_MAX = 50;
const TASK_NAME_MAX = 60;

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
  const task = typeof record.task === "string" ? record.task.slice(0, TASK_NAME_MAX) : "";
  const focusDurationMs = Number(record.focusDurationMs);
  if (!Number.isFinite(focusDurationMs) || focusDurationMs <= 0) {
    return null;
  }
  const completedAt = typeof record.completedAt === "string" ? record.completedAt : "";
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
    pendingTaskName: typeof settings.pendingTaskName === "string"
      ? settings.pendingTaskName.slice(0, TASK_NAME_MAX)
      : defaultPetSettings.pendingTaskName,
    focusRecords: normalizeFocusRecords(settings.focusRecords),
    clockEnabled: typeof settings.clockEnabled === "boolean"
      ? settings.clockEnabled
      : defaultPetSettings.clockEnabled,
    musicPanelPosition: normalizeWidgetPosition(settings.musicPanelPosition),
    clockPosition: normalizeWidgetPosition(settings.clockPosition),
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
