const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  defaultPetSettings,
  loadPetSettings,
  normalizePetSettings,
  savePetSettings,
} = require("../src/pet-settings-store");

test("normalizes missing and invalid settings to safe defaults", () => {
  assert.deepEqual(normalizePetSettings({}), defaultPetSettings);
  assert.deepEqual(
    normalizePetSettings({
      sizePercent: 150,
      speedPercent: 0,
      position: { x: 24.8, y: 80.2 },
      alwaysOnTop: false,
      petState: { mood: 70, affinity: 5, energy: 30, sleeping: true },
      autoBehaviorEnabled: false,
      autoWalkEnabled: false,
      opacityPercent: 55,
    }),
    {
      sizePercent: 150,
      speedPercent: 0,
      position: { x: 25, y: 80 },
      alwaysOnTop: false,
      petState: {
        mood: 70,
        affinity: 5,
        energy: 30,
        sleeping: true,
        dailyState: {
          lastActiveDate: null,
          dailyTapCount: 0,
          dailyFeedCount: 0,
          dailyPetCount: 0,
          streakDays: 0,
          lastGreetingDate: null,
        },
      },
      autoBehaviorEnabled: false,
      autoWalkEnabled: false,
      opacityPercent: 55,
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
      focusRecords: [],
      clockEnabled: true,
      clockOpacityPercent: 100,
      clockDisplayMode: "floating",
      focusIndicatorEnabled: true,
      focusDisplayMode: "floating",
      petClickThroughEnabled: false,
      musicStatusClickThroughEnabled: false,
      musicStatusOpacityPercent: 100,
      musicPanelPosition: null,
      clockPosition: null,
      focusIndicatorPosition: null,
      musicStatusPosition: null,
      musicLyricStyle: {
        color: "#243044",
        fontSize: 12,
        controlSize: 31,
      },
      llm: {
        apiKey: "",
        model: "glm-4-flash",
        endpoint: "https://open.bigmodel.cn/api/paas/v4",
        systemPrompt: "",
      },
    },
  );
  assert.deepEqual(
    normalizePetSettings({
      sizePercent: -20,
      speedPercent: 500,
      position: { x: Number.NaN, y: "bad" },
      alwaysOnTop: "yes",
    }),
    defaultPetSettings,
  );
});

test("loads defaults when the settings file does not exist", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deskpet-settings-"));
  const settingsPath = path.join(dir, "settings.json");

  assert.deepEqual(loadPetSettings(settingsPath), defaultPetSettings);
});

test("loads and saves normalized settings as JSON", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deskpet-settings-"));
  const settingsPath = path.join(dir, "settings.json");

  savePetSettings(settingsPath, {
    sizePercent: 25,
    speedPercent: 125,
    position: { x: 12.2, y: 98.9 },
    alwaysOnTop: true,
    petState: { mood: 120, affinity: 4.4, energy: -10, sleeping: "no" },
    autoBehaviorEnabled: "yes",
    autoWalkEnabled: false,
    opacityPercent: 8,
  });

  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, "utf8")), {
    sizePercent: 25,
    speedPercent: 125,
    position: { x: 12, y: 99 },
    alwaysOnTop: true,
    petState: {
      mood: 100,
      affinity: 4,
      energy: 0,
      sleeping: false,
      dailyState: {
        lastActiveDate: null,
        dailyTapCount: 0,
        dailyFeedCount: 0,
        dailyPetCount: 0,
        streakDays: 0,
        lastGreetingDate: null,
      },
    },
    autoBehaviorEnabled: true,
    autoWalkEnabled: false,
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
    focusRecords: [],
    clockEnabled: true,
    clockOpacityPercent: 100,
    clockDisplayMode: "floating",
    focusIndicatorEnabled: true,
    focusDisplayMode: "floating",
    petClickThroughEnabled: false,
    musicStatusClickThroughEnabled: false,
    musicStatusOpacityPercent: 100,
    musicPanelPosition: null,
    clockPosition: null,
    focusIndicatorPosition: null,
    musicStatusPosition: null,
    musicLyricStyle: {
      color: "#243044",
      fontSize: 12,
      controlSize: 31,
    },
    llm: {
      apiKey: "",
      model: "glm-4-flash",
      endpoint: "https://open.bigmodel.cn/api/paas/v4",
      systemPrompt: "",
    },
  });
  assert.deepEqual(loadPetSettings(settingsPath), {
    sizePercent: 25,
    speedPercent: 125,
    position: { x: 12, y: 99 },
    alwaysOnTop: true,
    petState: {
      mood: 100,
      affinity: 4,
      energy: 0,
      sleeping: false,
      dailyState: {
        lastActiveDate: null,
        dailyTapCount: 0,
        dailyFeedCount: 0,
        dailyPetCount: 0,
        streakDays: 0,
        lastGreetingDate: null,
      },
    },
    autoBehaviorEnabled: true,
    autoWalkEnabled: false,
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
    focusRecords: [],
    clockEnabled: true,
    clockOpacityPercent: 100,
    clockDisplayMode: "floating",
    focusIndicatorEnabled: true,
    focusDisplayMode: "floating",
    petClickThroughEnabled: false,
    musicStatusClickThroughEnabled: false,
    musicStatusOpacityPercent: 100,
    musicPanelPosition: null,
    clockPosition: null,
    focusIndicatorPosition: null,
    musicStatusPosition: null,
    musicLyricStyle: {
      color: "#243044",
      fontSize: 12,
      controlSize: 31,
    },
    llm: {
      apiKey: "",
      model: "glm-4-flash",
      endpoint: "https://open.bigmodel.cn/api/paas/v4",
      systemPrompt: "",
    },
  });
});

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

test("clamps focus and break durations and trims the task name", () => {
  const normalized = normalizePetSettings({
    focusDurationMinutes: 999,
    breakDurationMinutes: -3,
    pendingTaskName: "x".repeat(120),
  });
  assert.equal(normalized.focusDurationMinutes, 180);
  assert.equal(normalized.breakDurationMinutes, 1);
  assert.equal(normalized.pendingTaskName.length, 60);
});

test("normalizes focus cycle, reminder, and companion settings", () => {
  const normalized = normalizePetSettings({
    longBreakDurationMinutes: 999,
    focusRoundsBeforeLongBreak: 0,
    focusNotificationsEnabled: false,
    focusSoundEnabled: true,
    focusPetReactionsEnabled: false,
    focusConfirmInterrupt: false,
  });

  assert.equal(normalized.longBreakDurationMinutes, 120);
  assert.equal(normalized.focusRoundsBeforeLongBreak, 1);
  assert.equal(normalized.focusNotificationsEnabled, false);
  assert.equal(normalized.focusSoundEnabled, true);
  assert.equal(normalized.focusPetReactionsEnabled, false);
  assert.equal(normalized.focusConfirmInterrupt, false);
});

test("normalizes a versioned active focus session and rejects future versions", () => {
  const session = {
    version: 1,
    revision: 3,
    sessionId: "session-1",
    taskName: "Persistent task",
    phase: "focus",
    status: "paused",
    startedAt: 1000,
    phaseStartedAt: 1200,
    endsAt: null,
    pausedRemainingMs: 500,
    plannedDurationMs: 1000,
    completedFocusRounds: 1,
    roundsBeforeLongBreak: 4,
    focusDurationMs: 1000,
    shortBreakDurationMs: 200,
    longBreakDurationMs: 500,
    suggestedBreakPhase: null,
    updatedAt: 1500,
  };

  assert.deepEqual(normalizePetSettings({ focusSession: session }).focusSession, session);
  assert.equal(normalizePetSettings({ focusSession: { ...session, version: 2 } }).focusSession, null);
  assert.equal(normalizePetSettings({ focusSession: { ...session, sessionId: "" } }).focusSession, null);
});

test("preserves rich completed, interrupted, and break history records", () => {
  const richRecord = {
    id: "record-1",
    transitionKey: "session-1:focus:1000:interrupted",
    sessionId: "session-1",
    task: "Interrupted task",
    taskName: "Interrupted task",
    phase: "focus",
    result: "interrupted",
    plannedDurationMs: 1000,
    actualDurationMs: 400,
    focusDurationMs: 400,
    startedAt: 1000,
    completedAt: "2026-07-15T10:00:00.000Z",
    roundNumber: 1,
  };
  const breakRecord = {
    ...richRecord,
    id: "record-2",
    transitionKey: "session-1:short-break:2000:completed",
    phase: "short-break",
    result: "completed",
    actualDurationMs: 200,
    focusDurationMs: 0,
  };

  assert.deepEqual(normalizePetSettings({ focusRecords: [richRecord, breakRecord] }).focusRecords, [
    richRecord,
    breakRecord,
  ]);
});

test("normalizes focus records and caps the array at 500 entries", () => {
  const records = Array.from({ length: 505 }, (_, i) => ({
    task: `task ${i}`,
    focusDurationMs: 1500000 + i,
    completedAt: new Date(2026, 0, 1, 10, i).toISOString(),
  }));
  records.push({ task: "invalid", focusDurationMs: -1, completedAt: "" });
  records.push(null);
  const normalized = normalizePetSettings({ focusRecords: records });
  assert.equal(normalized.focusRecords.length, 500);
  assert.equal(normalized.focusRecords[0].task, "task 5");
  assert.equal(normalized.focusRecords[499].task, "task 504");
  assert.equal(normalized.focusRecords[0].focusDurationMs, 1500005);
});

test("normalizes user-saved widget positions and drops garbage values", () => {
  // Valid positions round-trip and fractional pixels are rounded to ints.
  const valid = normalizePetSettings({
    musicPanelPosition: { x: 12.4, y: 99.6 },
    clockPosition: { x: 200, y: 8 },
    focusIndicatorPosition: { x: 9.5, y: 301.2 },
    musicStatusPosition: { x: 144.4, y: 455.8 },
  });
  assert.deepEqual(valid.musicPanelPosition, { x: 12, y: 100 });
  assert.deepEqual(valid.clockPosition, { x: 200, y: 8 });
  assert.deepEqual(valid.focusIndicatorPosition, { x: 10, y: 301 });
  assert.deepEqual(valid.musicStatusPosition, { x: 144, y: 456 });

  // Non-finite coords, wrong types, or null all become null so the
  // renderer falls back to the default position rather than placing
  // the widget off-screen.
  const garbage = normalizePetSettings({
    musicPanelPosition: { x: Number.NaN, y: "12" },
    clockPosition: { x: Infinity, y: -Infinity },
    focusIndicatorPosition: { x: "bad", y: 10 },
    musicStatusPosition: { x: 10, y: Number.NaN },
  });
  assert.equal(garbage.musicPanelPosition, null);
  assert.equal(garbage.clockPosition, null);
  assert.equal(garbage.focusIndicatorPosition, null);
  assert.equal(garbage.musicStatusPosition, null);

  // Missing entirely is also null (matches defaultPetSettings).
  const missing = normalizePetSettings({});
  assert.equal(missing.musicPanelPosition, null);
  assert.equal(missing.clockPosition, null);
  assert.equal(missing.focusIndicatorPosition, null);
  assert.equal(missing.musicStatusPosition, null);
});

test("settings default exposes null widget positions so the renderer can fall back", () => {
  assert.equal(defaultPetSettings.musicPanelPosition, null);
  assert.equal(defaultPetSettings.clockPosition, null);
  assert.equal(defaultPetSettings.focusIndicatorPosition, null);
  assert.equal(defaultPetSettings.musicStatusPosition, null);
});

test("normalizes music lyric style settings", () => {
  assert.deepEqual(defaultPetSettings.musicLyricStyle, {
    color: "#243044",
    fontSize: 12,
    controlSize: 31,
  });

  const customized = normalizePetSettings({
    musicLyricStyle: { color: "#7c3aed", fontSize: 17.4, controlSize: 39.2 },
  });
  assert.deepEqual(customized.musicLyricStyle, {
    color: "#7c3aed",
    fontSize: 17,
    controlSize: 39,
  });

  const fallback = normalizePetSettings({
    musicLyricStyle: { color: "javascript:bad", fontSize: 999, controlSize: 8 },
  });
  assert.deepEqual(fallback.musicLyricStyle, defaultPetSettings.musicLyricStyle);
});

test("allows custom AI model names and endpoints", () => {
  const normalized = normalizePetSettings({
    llm: {
      apiKey: "sk-custom",
      model: "qwen-plus",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      systemPrompt: "Use a concise tone.",
    },
  });

  assert.deepEqual(normalized.llm, {
    apiKey: "sk-custom",
    model: "qwen-plus",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    systemPrompt: "Use a concise tone.",
  });
});

test("normalizes click-through and music status opacity settings", () => {
  const customized = normalizePetSettings({
    petClickThroughEnabled: true,
    musicStatusClickThroughEnabled: true,
    musicStatusOpacityPercent: 64.4,
  });

  assert.equal(customized.petClickThroughEnabled, true);
  assert.equal(customized.musicStatusClickThroughEnabled, true);
  assert.equal(customized.musicStatusOpacityPercent, 64);

  const fallback = normalizePetSettings({
    petClickThroughEnabled: "yes",
    musicStatusClickThroughEnabled: "yes",
    musicStatusOpacityPercent: 5,
  });

  assert.equal(fallback.petClickThroughEnabled, false);
  assert.equal(fallback.musicStatusClickThroughEnabled, false);
  assert.equal(fallback.musicStatusOpacityPercent, 100);
});
