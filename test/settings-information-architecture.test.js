const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { repairMojibake } = require("../src/text-normalize");

const {
  attributeValue,
  elements,
  hasClass,
  parseHtml,
} = require("./helpers/html-fixture");

const root = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function findByClass(rootNode, className) {
  return elements(rootNode).filter((node) => hasClass(node, className));
}

class FakeElement {
  constructor(node = null, ownerDocument = null) {
    this.ownerDocument = ownerDocument;
    this.listeners = new Map();
    this.attributes = new Map(Object.entries(node?.attributes || {}));
    this.dataset = {};
    for (const [name, value] of this.attributes) {
      if (name.startsWith("data-")) {
        this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      }
    }
    this.classNames = new Set((this.attributes.get("class") || "").split(/\s+/).filter(Boolean));
    this.classList = {
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classNames.has(name) : Boolean(force);
        if (enabled) this.classNames.add(name);
        else this.classNames.delete(name);
        return enabled;
      },
      contains: (name) => this.classNames.has(name),
    };
    this.hidden = this.attributes.has("hidden");
    this.tabIndex = Number(this.attributes.get("tabindex") || 0);
    this.textContent = "";
    this.innerHTML = "";
    this.value = this.attributes.get("value") || "";
    this.type = this.attributes.get("type") || "";
    this.checked = false;
    this.disabled = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async dispatch(type, init = {}) {
    const event = {
      type,
      key: init.key,
      target: init.target || this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    for (const listener of this.listeners.get(type) || []) {
      await listener(event);
    }
    return event;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  blur() {
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null;
  }

  closest() {
    return null;
  }
}

function createSettingsHarness({ withFeedback = true, getSettings, openMusicWindow, updateSettings } = {}) {
  const fixture = parseHtml(read("src/renderer/settings.html"));
  const allNodes = elements(fixture);
  const document = {
    activeElement: null,
    byId: new Map(),
    tabs: [],
    panels: [],
    feedbackHost: null,
    getElementById(id) { return this.byId.get(id) || null; },
    querySelector(selector) {
      if (selector === "[data-operation-feedback]") return this.feedbackHost;
      if (selector === ".settings-window__nav") return this.navigation;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".settings-window__tab") return this.tabs;
      if (selector === ".settings-window__panel") return this.panels;
      return [];
    },
  };

  for (const node of allNodes) {
    const element = new FakeElement(node, document);
    const id = attributeValue(node, "id");
    if (id) document.byId.set(id, element);
    if (hasClass(node, "settings-window__tab")) document.tabs.push(element);
    if (hasClass(node, "settings-window__panel")) document.panels.push(element);
    if (hasClass(node, "settings-window__nav")) document.navigation = element;
    if (attributeValue(node, "data-operation-feedback") !== null) document.feedbackHost = element;
  }

  const updates = [];
  const feedbackCalls = [];
  const timers = [];
  class FeedbackStub {
    pending(message) { feedbackCalls.push(["pending", message]); }
    success(message) { feedbackCalls.push(["success", message]); }
    error(message) { feedbackCalls.push(["error", message]); }
    info(message) { feedbackCalls.push(["info", message]); }
    clear() { feedbackCalls.push(["clear", ""]); }
  }
  const mediaListeners = [];
  const mediaQuery = {
    matches: false,
    addEventListener(type, listener) {
      if (type === "change") mediaListeners.push(listener);
    },
    setMatches(matches) {
      this.matches = matches;
      for (const listener of mediaListeners) listener({ matches });
    },
  };
  const bridge = {
    async getSettings() { return getSettings ? getSettings() : {}; },
    async updateSettings(patch) {
      updates.push(patch);
      return updateSettings ? updateSettings(patch) : { ...patch };
    },
    openMusicWindow: openMusicWindow || (async () => ({ success: true })),
  };
  const window = {
    deskpet: bridge,
    confirm: () => true,
    matchMedia: () => mediaQuery,
    ...(withFeedback ? { OperationFeedback: FeedbackStub } : {}),
  };
  const context = {
    window,
    document,
    console,
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout() {},
  };
  vm.runInNewContext(read("src/renderer/settings.js"), context, { filename: "settings.js" });
  return { bridge, document, feedbackCalls, mediaQuery, timers, updates };
}

function assertActiveTab(harness, name) {
  for (const tab of harness.document.tabs) {
    const active = tab.dataset.tab === name;
    assert.equal(tab.getAttribute("aria-selected"), active ? "true" : "false");
    assert.equal(tab.tabIndex, active ? 0 : -1);
    assert.equal(tab.classList.contains("is-active"), active);
  }
  for (const panel of harness.document.panels) {
    const active = panel.dataset.panel === name;
    assert.equal(panel.hidden, !active);
    assert.equal(panel.classList.contains("is-active"), active);
  }
}

test("settings controls belong to exactly six ordered panels in one layout", () => {
  const document = parseHtml(read("src/renderer/settings.html"));
  const layouts = findByClass(document, "settings-window__layout");
  assert.equal(layouts.length, 1, "settings should have one navigation layout");

  const layout = layouts[0];
  const panelOrder = ["appearance", "widgets", "music", "focus", "llm", "data"];
  const panels = elements(layout, { attributes: { role: "tabpanel" } });
  assert.deepEqual(
    panels.map((panel) => attributeValue(panel, "data-panel")),
    panelOrder,
  );

  const tabs = elements(layout, { attributes: { role: "tab" } });
  assert.equal(tabs.length, panelOrder.length);
  for (let index = 0; index < panelOrder.length; index += 1) {
    const tab = tabs[index];
    const panel = panels[index];
    assert.equal(attributeValue(tab, "aria-controls"), attributeValue(panel, "id"));
    assert.equal(attributeValue(panel, "aria-labelledby"), attributeValue(tab, "id"));
    assert.equal(
      elements(tab, { attributes: { "aria-hidden": "true" } }).length,
      1,
      `${panelOrder[index]} tab should expose one decorative symbol`,
    );
  }

  const ownership = {
    appearance: [
      "settings-size",
      "settings-speed",
      "settings-opacity",
      "settings-auto-behavior",
      "settings-auto-walk",
      "settings-mouse-react",
      "settings-daily-greeting",
    ],
    widgets: [
      "settings-clock-display-mode",
      "settings-focus-display-mode",
      "settings-clock-enabled",
      "settings-focus-indicator-enabled",
      "settings-clock-opacity",
      "settings-music-status-opacity",
      "settings-pet-click-through",
      "settings-music-status-click-through",
      "settings-reset-widget-positions",
    ],
    music: [
      "settings-lyric-color",
      "settings-lyric-size",
      "settings-control-size",
      "settings-open-music",
      "settings-open-queue",
      "settings-open-history",
    ],
    focus: [
      "settings-focus-task",
      "settings-focus-recent-tasks",
      "settings-focus-min",
      "settings-break-min",
      "settings-long-break-min",
      "settings-focus-rounds",
      "settings-focus-notifications",
      "settings-focus-sound",
      "settings-focus-pet-reactions",
      "settings-focus-confirm-interrupt",
      "settings-focus-records",
      "settings-focus-records-clear",
    ],
    llm: [
      "settings-llm-endpoint",
      "settings-llm-model",
      "settings-llm-apikey",
      "settings-llm-apikey-toggle",
      "settings-llm-prompt",
      "settings-llm-prompt-reset",
      "settings-llm-save",
    ],
    data: ["settings-clear-history", "settings-clear-chat-summary"],
  };

  for (const [panelName, controlIds] of Object.entries(ownership)) {
    const panel = panels.find((candidate) => attributeValue(candidate, "data-panel") === panelName);
    assert.ok(panel, `missing ${panelName} panel`);
    for (const id of controlIds) {
      assert.equal(
        elements(panel, { attributes: { id } }).length,
        1,
        `${id} should belong to ${panelName}`,
      );
      assert.equal(
        elements(layout, { attributes: { id } }).length,
        1,
        `${id} should occur once in the settings layout`,
      );
    }
  }
});

test("settings tabs execute complete keyboard and accessibility behavior", async () => {
  const harness = createSettingsHarness();
  const tab = (name) => harness.document.tabs.find((candidate) => candidate.dataset.tab === name);

  await tab("music").dispatch("click");
  assertActiveTab(harness, "music");

  await tab("appearance").dispatch("keydown", { key: "ArrowUp" });
  assertActiveTab(harness, "data");
  assert.equal(harness.document.activeElement, tab("data"));
  await tab("data").dispatch("keydown", { key: "ArrowDown" });
  assertActiveTab(harness, "appearance");
  await tab("appearance").dispatch("keydown", { key: "ArrowUp" });
  assertActiveTab(harness, "data");
  await tab("data").dispatch("keydown", { key: "ArrowDown" });
  assertActiveTab(harness, "appearance");
  await tab("focus").dispatch("keydown", { key: "Home" });
  assertActiveTab(harness, "appearance");
  await tab("focus").dispatch("keydown", { key: "End" });
  assertActiveTab(harness, "data");
  await tab("music").dispatch("keydown", { key: "Enter" });
  assertActiveTab(harness, "music");
  await tab("focus").dispatch("keydown", { key: " " });
  assertActiveTab(harness, "focus");

  assert.equal(harness.document.navigation.getAttribute("aria-orientation"), "vertical");
  harness.mediaQuery.setMatches(true);
  assert.equal(harness.document.navigation.getAttribute("aria-orientation"), "horizontal");
  harness.mediaQuery.setMatches(false);
  assert.equal(harness.document.navigation.getAttribute("aria-orientation"), "vertical");
});

test("settings tabs only consume direction keys on the active navigation axis", async () => {
  const harness = createSettingsHarness();
  const appearance = harness.document.tabs.find((tab) => tab.dataset.tab === "appearance");

  const verticalOffAxis = await appearance.dispatch("keydown", { key: "ArrowLeft" });
  assert.equal(verticalOffAxis.defaultPrevented, false);
  assertActiveTab(harness, "appearance");

  const verticalOnAxis = await appearance.dispatch("keydown", { key: "ArrowDown" });
  assert.equal(verticalOnAxis.defaultPrevented, true);
  assertActiveTab(harness, "widgets");

  harness.mediaQuery.setMatches(true);
  const horizontalOffAxis = await appearance.dispatch("keydown", { key: "ArrowUp" });
  assert.equal(horizontalOffAxis.defaultPrevented, false);

  const horizontalOnAxis = await appearance.dispatch("keydown", { key: "ArrowRight" });
  assert.equal(horizontalOnAxis.defaultPrevented, true);
  assertActiveTab(harness, "widgets");
});

test("widget reset submits the exact persisted position patch with and without feedback", async () => {
  const expected = {
    musicPanelPosition: null,
    clockPosition: null,
    focusIndicatorPosition: null,
    musicStatusPosition: null,
  };
  for (const withFeedback of [true, false]) {
    const harness = createSettingsHarness({ withFeedback });
    await harness.document.getElementById("settings-reset-widget-positions").dispatch("click");
    assert.deepEqual({ ...harness.updates.at(-1) }, expected);
    assert.match(harness.document.getElementById("settings-status").textContent, /重置/);
    if (withFeedback) {
      assert.equal(harness.feedbackCalls[0][0], "pending");
      assert.equal(harness.feedbackCalls.at(-1)[0], "success");
    }
  }
});

test("music entry reports rejected IPC as an error and restores the button", async () => {
  const harness = createSettingsHarness({
    openMusicWindow: async () => { throw new Error("boom"); },
  });
  const button = harness.document.getElementById("settings-open-music");

  await button.dispatch("click");

  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute("aria-busy"), "false");
  assert.equal(harness.feedbackCalls[0][0], "pending");
  assert.equal(harness.feedbackCalls.at(-1)[0], "error");
  assert.match(harness.document.getElementById("settings-status").textContent, /失败/);
});

test("clearing a success summary also clears its tone", async () => {
  const harness = createSettingsHarness({ withFeedback: false });
  await harness.document.getElementById("settings-reset-widget-positions").dispatch("click");
  const status = harness.document.getElementById("settings-status");
  assert.equal(status.dataset.tone, "success");
  const timer = harness.timers.find((entry) => entry.delay === 1800);
  assert.ok(timer);
  timer.callback();
  assert.equal(status.textContent, "");
  assert.equal(status.dataset.tone, undefined);
});

test("an older identical success timeout cannot clear a newer summary", async () => {
  const harness = createSettingsHarness({ withFeedback: false });
  const reset = harness.document.getElementById("settings-reset-widget-positions");
  await reset.dispatch("click");
  await reset.dispatch("click");
  const successTimers = harness.timers.filter((entry) => entry.delay === 1800);
  assert.equal(successTimers.length, 2);
  successTimers[0].callback();
  const status = harness.document.getElementById("settings-status");
  assert.match(status.textContent, /重置/);
  assert.equal(status.dataset.tone, "success");
  successTimers[1].callback();
  assert.equal(status.textContent, "");
  assert.equal(status.dataset.tone, undefined);
});

test("settings load rejection is rendered instead of becoming unhandled", async () => {
  const harness = createSettingsHarness({
    getSettings: async () => { throw new Error("offline"); },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.feedbackCalls.at(-1)[0], "error");
  assert.match(harness.document.getElementById("settings-status").textContent, /offline/);
});

test("a rejected settings save emits one final error feedback", async () => {
  const harness = createSettingsHarness({
    updateSettings: async () => { throw new Error("disk full"); },
  });
  await harness.document.getElementById("settings-reset-widget-positions").dispatch("click");
  assert.equal(harness.feedbackCalls.filter(([state]) => state === "error").length, 1);
  assert.match(harness.feedbackCalls.at(-1)[1], /disk full/);
});

test("recent task labels wrap instead of truncating long task names", () => {
  const css = read("src/renderer/styles/settings.css");
  const match = css.match(/\.settings-window__recent-tasks button\s*\{([\s\S]*?)\}/);
  assert.ok(match);
  assert.match(match[1], /white-space:\s*normal/);
  assert.match(match[1], /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(match[1], /text-overflow:\s*ellipsis/);
});

test("settings operations use shared feedback while retaining a non-live status summary", () => {
  const html = read("src/renderer/settings.html");
  const source = read("src/renderer/settings.js");

  assert.match(source, /new window\.OperationFeedback\s*\(/);
  assert.match(source, /feedback\?\.pending\(/);
  assert.match(source, /feedback\?\.success\(/);
  assert.match(source, /feedback\?\.error\(/);
  assert.match(html, /id="settings-status"[^>]*aria-live="off"/);
});

test("settings user-facing copy contains no known mojibake fragments", () => {
  const source = `${read("src/renderer/settings.html")}\n${read("src/renderer/settings.js")}`;
  for (const fragment of ["鏃犳硶", "姝ｅ湪", "璁剧疆", "闊充箰", "馃"]) {
    assert.doesNotMatch(source, new RegExp(fragment), `remove mojibake fragment ${fragment}`);
  }
  assert.doesNotMatch(source, /512\s*[x脳×]\s*512/i);
  assert.equal(repairMojibake(source), source, "settings copy should not be repairable mojibake");
});
