const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { elements, hasAttribute, parseHtml } = require("./helpers/html-fixture");

const modulePath = path.join(__dirname, "..", "src", "renderer", "operation-feedback.js");
const rendererDir = path.join(__dirname, "..", "src", "renderer");

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.dataset = {};
    this.hidden = false;
    this.children = [];
    this.attributes = new Map();
    this.attributeWrites = [];
    this.listeners = new Map();
    this._textContent = "";
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join("");
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    this.attributeWrites.push({ name, value: String(value) });
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  click() {
    this.listeners.get("click")?.({ currentTarget: this });
  }

  querySelector(selector) {
    if (selector === "button") {
      return this.children.find((child) => child.tagName === "BUTTON") || null;
    }
    return null;
  }
}

function createHost() {
  const document = {
    createElement(tagName) {
      return new FakeElement(tagName, document);
    },
  };
  return new FakeElement("div", document);
}

function createTimers({ honorCancel = true } = {}) {
  let nextId = 1;
  const entries = [];
  return {
    entries,
    schedule(callback, durationMs) {
      const entry = { id: nextId++, callback, durationMs, canceled: false };
      entries.push(entry);
      return entry.id;
    },
    cancel(id) {
      const entry = entries.find((candidate) => candidate.id === id);
      if (entry && honorCancel) entry.canceled = true;
    },
    fire(index) {
      entries[index].callback();
    },
  };
}

test("CommonJS and browser UMD expose OperationFeedback", () => {
  const OperationFeedback = require(modulePath);
  assert.equal(typeof OperationFeedback, "function");

  const context = { setTimeout, clearTimeout };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(modulePath, "utf8"), context);
  assert.equal(typeof context.OperationFeedback, "function");
});

test("idle keeps an empty live region in the accessibility tree", () => {
  const OperationFeedback = require(modulePath);
  const host = createHost();

  new OperationFeedback({ host });

  assert.equal(host.dataset.state, "idle");
  assert.equal(host.textContent, "");
  assert.equal(host.hidden, false);
});

test("every renderer feedback host is present from page load", () => {
  for (const name of ["index.html", "settings.html", "music.html", "music-search.html", "chat.html"]) {
    const document = parseHtml(fs.readFileSync(path.join(rendererDir, name), "utf8"));
    const hosts = elements(document).filter((node) => hasAttribute(node, "data-operation-feedback"));

    assert.equal(hosts.length, 1, `${name} should contain exactly one operation feedback host`);
    assert.equal(hasAttribute(hosts[0], "hidden"), false, `${name} feedback host must not be hidden`);
  }
});

test("pending renders an accessible busy status", () => {
  const OperationFeedback = require(modulePath);
  const host = createHost();
  const feedback = new OperationFeedback({ host });

  feedback.pending("Loading playlist");

  assert.equal(host.textContent, "Loading playlist");
  assert.equal(host.dataset.state, "pending");
  assert.equal(host.getAttribute("role"), "status");
  assert.equal(host.getAttribute("aria-live"), "polite");
  assert.equal(host.getAttribute("aria-busy"), "true");
  assert.equal(host.hidden, false);
});

test("pending releases aria-busy after its content is rendered", async () => {
  const OperationFeedback = require(modulePath);
  const host = createHost();
  const feedback = new OperationFeedback({ host });

  feedback.pending("Loading playlist");
  assert.equal(host.getAttribute("aria-busy"), "true");

  await Promise.resolve();

  assert.equal(host.getAttribute("aria-busy"), "false");
  assert.equal(host.dataset.state, "pending");
  assert.equal(host.textContent, "Loading playlist");
  assert.equal(host.hidden, false);
});

test("a stale pending microtask does not modify newer feedback", async () => {
  const OperationFeedback = require(modulePath);
  const host = createHost();
  const feedback = new OperationFeedback({ host });
  host.attributeWrites = [];

  feedback.pending("Loading first playlist");
  feedback.pending("Loading second playlist");
  assert.equal(host.getAttribute("aria-busy"), "true");

  await Promise.resolve();

  assert.deepEqual(
    host.attributeWrites.filter(({ name }) => name === "aria-busy").map(({ value }) => value),
    ["true", "true", "false"]
  );
  assert.equal(host.dataset.state, "pending");
  assert.equal(host.textContent, "Loading second playlist");
});

test("success clears after its default timeout", () => {
  const OperationFeedback = require(modulePath);
  const host = createHost();
  const timers = createTimers();
  const feedback = new OperationFeedback({
    host,
    schedule: timers.schedule,
    cancel: timers.cancel,
  });

  feedback.success("Saved");

  assert.equal(host.dataset.state, "success");
  assert.equal(host.getAttribute("aria-busy"), "false");
  assert.equal(timers.entries[0].durationMs, 2200);
  timers.fire(0);
  assert.equal(host.dataset.state, "idle");
  assert.equal(host.hidden, false);
  assert.equal(host.textContent, "");
  assert.deepEqual(feedback.snapshot(), { state: "idle", message: "", actionLabel: "" });
});

test("OperationFeedback invokes injected timer functions without using feedback as their receiver", () => {
  const OperationFeedback = require(modulePath);
  const host = createHost();
  const calls = [];
  const schedule = function schedule(callback, delay) {
    "use strict";
    assert.equal(this, undefined);
    calls.push({ callback, delay });
    return 9;
  };
  const cancel = function cancel(timerId) {
    "use strict";
    assert.equal(this, undefined);
    calls.push({ timerId });
  };
  const feedback = new OperationFeedback({ host, schedule, cancel });

  assert.doesNotThrow(() => feedback.success("Saved"));
  assert.equal(calls[0].delay, 2200);
  feedback.clear();
  assert.equal(calls[1].timerId, 9);
});

test("a synchronous scheduler clears without a TDZ or stale timer id", () => {
  const OperationFeedback = require(modulePath);
  const host = createHost();
  const canceled = [];
  const feedback = new OperationFeedback({
    host,
    schedule(callback) {
      callback();
      return 41;
    },
    cancel(id) {
      canceled.push(id);
    },
  });

  assert.doesNotThrow(() => feedback.success("Saved", { durationMs: 100 }));
  assert.deepEqual(feedback.snapshot(), { state: "idle", message: "", actionLabel: "" });
  assert.equal(host.hidden, false);

  feedback.pending("Next operation");
  assert.deepEqual(canceled, []);
  assert.equal(host.dataset.state, "pending");
});

test("error remains visible without scheduling a timeout", () => {
  const OperationFeedback = require(modulePath);
  const host = createHost();
  const timers = createTimers();
  const feedback = new OperationFeedback({ host, schedule: timers.schedule, cancel: timers.cancel });

  feedback.error("Network connection failed");

  assert.equal(host.dataset.state, "error");
  assert.equal(host.hidden, false);
  assert.equal(timers.entries.length, 0);
});

test("error retry action invokes its callback without clearing feedback", () => {
  const OperationFeedback = require(modulePath);
  const host = createHost();
  const feedback = new OperationFeedback({ host });
  let calls = 0;

  feedback.error("Network connection failed", {
    actionLabel: "Retry",
    onAction() {
      calls += 1;
    },
  });

  const button = host.querySelector("button");
  assert.ok(button);
  assert.equal(button.getAttribute("type"), "button");
  assert.equal(button.textContent, "Retry");
  button.click();
  assert.equal(calls, 1);
  assert.equal(host.dataset.state, "error");
  assert.equal(host.hidden, false);
});

test("an old timeout cannot clear newer feedback", () => {
  const OperationFeedback = require(modulePath);
  const host = createHost();
  const timers = createTimers({ honorCancel: false });
  const feedback = new OperationFeedback({ host, schedule: timers.schedule, cancel: timers.cancel });

  feedback.success("First", { durationMs: 10 });
  feedback.pending("Second");
  timers.fire(0);

  assert.equal(host.textContent, "Second");
  assert.equal(host.dataset.state, "pending");
  assert.equal(host.hidden, false);
});

test("info persists by default and honors a positive duration", () => {
  const OperationFeedback = require(modulePath);
  const host = createHost();
  const timers = createTimers();
  const feedback = new OperationFeedback({ host, schedule: timers.schedule, cancel: timers.cancel });

  feedback.info("Choose a playlist");
  assert.equal(timers.entries.length, 0);
  assert.equal(host.dataset.state, "info");

  feedback.info("Copied", { durationMs: 500 });
  assert.equal(timers.entries[0].durationMs, 500);
  timers.fire(0);
  assert.equal(host.dataset.state, "idle");
  assert.equal(host.textContent, "");
  assert.equal(host.hidden, false);
});

test("clear cancels a timeout and resets the host", () => {
  const OperationFeedback = require(modulePath);
  const host = createHost();
  const timers = createTimers();
  const feedback = new OperationFeedback({ host, schedule: timers.schedule, cancel: timers.cancel });

  feedback.success("Saved", { durationMs: 100 });
  feedback.clear();

  assert.equal(timers.entries[0].canceled, true);
  assert.equal(host.dataset.state, "idle");
  assert.equal(host.getAttribute("aria-busy"), "false");
  assert.equal(host.hidden, false);
  assert.equal(host.textContent, "");
});

test("snapshot returns current serializable state", () => {
  const OperationFeedback = require(modulePath);
  const feedback = new OperationFeedback({ host: createHost() });

  feedback.error("Request failed", { actionLabel: "Retry", onAction() {} });

  assert.deepEqual(feedback.snapshot(), {
    state: "error",
    message: "Request failed",
    actionLabel: "Retry",
  });
});

test("all methods are safe without a host and snapshot still updates", () => {
  const OperationFeedback = require(modulePath);
  const timers = createTimers();
  const feedback = new OperationFeedback({ schedule: timers.schedule, cancel: timers.cancel });

  assert.doesNotThrow(() => feedback.pending("Loading"));
  assert.deepEqual(feedback.snapshot(), { state: "pending", message: "Loading", actionLabel: "" });
  assert.doesNotThrow(() => feedback.success("Saved", { durationMs: 0 }));
  assert.doesNotThrow(() => feedback.error("Failed", { actionLabel: "Retry", onAction() {} }));
  assert.doesNotThrow(() => feedback.info("Note"));
  assert.deepEqual(feedback.snapshot(), { state: "info", message: "Note", actionLabel: "" });
  assert.doesNotThrow(() => feedback.clear());
  assert.deepEqual(feedback.snapshot(), { state: "idle", message: "", actionLabel: "" });
});
