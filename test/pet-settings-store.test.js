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
      pendingTaskName: "",
      focusRecords: [],
      clockEnabled: true,
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
    pendingTaskName: "",
    focusRecords: [],
    clockEnabled: true,
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
    pendingTaskName: "",
    focusRecords: [],
    clockEnabled: true,
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

test("normalizes focus records and caps the array at 50 entries", () => {
  const records = Array.from({ length: 55 }, (_, i) => ({
    task: `task ${i}`,
    focusDurationMs: 1500000 + i,
    completedAt: new Date(2026, 0, 1, 10, i).toISOString(),
  }));
  records.push({ task: "invalid", focusDurationMs: -1, completedAt: "" });
  records.push(null);
  const normalized = normalizePetSettings({ focusRecords: records });
  assert.equal(normalized.focusRecords.length, 50);
  assert.equal(normalized.focusRecords[0].task, "task 5");
  assert.equal(normalized.focusRecords[49].task, "task 54");
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
