const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizePetSettings } = require("../src/pet-settings-store");

test("normalizePetSettings persists clock and focus widget display modes", () => {
  const settings = normalizePetSettings({
    clockEnabled: false,
    focusIndicatorEnabled: false,
    clockDisplayMode: "music",
    focusDisplayMode: "music",
  });

  assert.equal(settings.clockEnabled, false);
  assert.equal(settings.focusIndicatorEnabled, false);
  assert.equal(settings.clockDisplayMode, "music");
  assert.equal(settings.focusDisplayMode, "music");
});

test("normalizePetSettings rejects invalid widget display modes", () => {
  const settings = normalizePetSettings({
    clockDisplayMode: "sidebar",
    focusDisplayMode: "dock",
  });

  assert.equal(settings.clockDisplayMode, "floating");
  assert.equal(settings.focusDisplayMode, "floating");
});

test("settings panel exposes display, click-through, and music status opacity controls", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "index.html"), "utf8");

  assert.match(html, /id="clock-display-mode-input"/);
  assert.match(html, /id="focus-display-mode-input"/);
  assert.match(html, /id="pet-click-through-input"/);
  assert.match(html, /id="music-status-click-through-input"/);
  assert.match(html, /id="music-status-opacity-input"/);
  assert.match(html, /settings-section--display/);
});

test("AI settings use freeform model and endpoint inputs", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "settings.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "settings.js"), "utf8");

  assert.match(html, /<input id="settings-llm-model" type="text"/);
  assert.match(html, /<input id="settings-llm-endpoint" type="text"/);
  assert.doesNotMatch(html, /<select id="settings-llm-model"/);
  assert.doesNotMatch(js, /ALLOWED_MODELS/);
});

test("standalone settings window exposes display and click-through controls", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "settings.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "settings.js"), "utf8");

  for (const id of [
    "settings-clock-display-mode",
    "settings-focus-display-mode",
    "settings-clock-enabled",
    "settings-focus-indicator-enabled",
    "settings-pet-click-through",
    "settings-music-status-click-through",
    "settings-music-status-opacity",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should be in standalone settings`);
    assert.match(js, new RegExp(id.replace(/-/g, "[-]")), `${id} should be wired in settings.js`);
  }
});
