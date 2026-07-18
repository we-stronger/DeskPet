const assert = require("node:assert/strict");
const test = require("node:test");

const { createRuntimeStyleManager } = require("../src/renderer/runtime-style");

function createFakeDocument() {
  const rules = [];
  const sheet = {
    href: "file:///DeskPet/src/renderer/styles/base.css",
    cssRules: rules,
    insertRule(rule, index) {
      rules.splice(index, 0, { cssText: rule });
    },
    deleteRule(index) {
      rules.splice(index, 1);
    },
  };
  return {
    styleSheets: [sheet],
    sheet,
  };
}

function createElement(attributes = {}) {
  return {
    attributes: { ...attributes },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttributeNames() { return Object.keys(this.attributes); },
    removeAttribute(name) { delete this.attributes[name]; },
  };
}

test("runtime style manager returns false when clearing without a stylesheet", () => {
  const manager = createRuntimeStyleManager({ styleSheets: [] });
  let result;

  assert.doesNotThrow(() => { result = manager.clear(createElement()); });
  assert.equal(result, false);
});

test("runtime style manager tolerates an inaccessible cssRules getter", () => {
  const sheet = {
    href: "file:///DeskPet/src/renderer/styles/base.css",
    get cssRules() {
      const error = new Error("Stylesheet rules are not accessible");
      error.name = "SecurityError";
      throw error;
    },
    insertRule() {
      throw new Error("insertRule should not be reached");
    },
  };
  const manager = createRuntimeStyleManager({ styleSheets: [sheet] });
  const element = createElement({ "data-runtime-style-pet-box": "true" });
  let applyResult;
  let clearResult;

  assert.doesNotThrow(() => { applyResult = manager.apply(element, "pet-box", { left: "12px" }); });
  assert.equal(applyResult, false);
  assert.doesNotThrow(() => { clearResult = manager.clear(element); });
  assert.equal(clearResult, false);
});

test("failed rule insertion preserves the previous runtime rule", () => {
  const rules = [{ cssText: "[data-runtime-style-music-status]{left:20px}" }];
  let deleteCalls = 0;
  const sheet = {
    href: "file:///DeskPet/src/renderer/styles/widgets.css",
    cssRules: rules,
    insertRule() {
      throw new Error("Stylesheet is read-only");
    },
    deleteRule() {
      deleteCalls += 1;
      rules.splice(0, 1);
    },
  };
  const manager = createRuntimeStyleManager({ styleSheets: [sheet] });
  const element = createElement({ "data-runtime-style-music-status": "true" });
  let result;

  assert.doesNotThrow(() => { result = manager.apply(element, "music-status", { left: "40px" }); });
  assert.equal(result, false);
  assert.equal(deleteCalls, 0);
  assert.deepEqual(rules.map((rule) => rule.cssText), ["[data-runtime-style-music-status]{left:20px}"]);
});

test("runtime rule updates insert the replacement before deleting the old rule", () => {
  const events = [];
  const rules = [{ cssText: "[data-runtime-style-pet-box]{left:12px}" }];
  const sheet = {
    href: "file:///DeskPet/src/renderer/styles/pet.css",
    cssRules: rules,
    insertRule(rule, index) {
      events.push("insert");
      rules.splice(index, 0, { cssText: rule });
    },
    deleteRule(index) {
      events.push("delete");
      rules.splice(index, 1);
    },
  };
  const manager = createRuntimeStyleManager({ styleSheets: [sheet] });
  const element = createElement({ "data-runtime-style-pet-box": "true" });

  assert.equal(manager.apply(element, "pet-box", { left: "24px" }), true);
  assert.deepEqual(events, ["insert", "delete"]);
  assert.equal(rules.length, 1);
  assert.match(rules[0].cssText, /left:24px/);
});

test("a failed old-rule deletion keeps the inserted replacement effective", () => {
  const rules = [{ cssText: "[data-runtime-style-pet-box]{left:12px}" }];
  const sheet = {
    href: "file:///DeskPet/src/renderer/styles/pet.css",
    cssRules: rules,
    insertRule(rule, index) {
      rules.splice(index, 0, { cssText: rule });
    },
    deleteRule() {
      throw new Error("Rule deletion is blocked");
    },
  };
  const manager = createRuntimeStyleManager({ styleSheets: [sheet] });
  const element = createElement({ "data-runtime-style-pet-box": "true" });
  let result;

  assert.doesNotThrow(() => { result = manager.apply(element, "pet-box", { left: "36px" }); });
  assert.equal(result, true);
  assert.equal(rules.length, 2);
  assert.match(rules.at(-1).cssText, /left:36px/);
});

test("runtime style manager applies dynamic styles through an external stylesheet rule", () => {
  const document = createFakeDocument();
  const manager = createRuntimeStyleManager(document);
  const element = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttributeNames() { return Object.keys(this.attributes); },
    removeAttribute(name) {
      delete this.attributes[name];
    },
  };

  manager.apply(element, "pet-box", {
    left: "12px",
    top: "8px",
    opacity: "0.8",
  });

  assert.equal(element.attributes["data-runtime-style-pet-box"], "true");
  assert.match(document.sheet.cssRules[0].cssText, /\[data-runtime-style-pet-box\]/);
  assert.match(document.sheet.cssRules[0].cssText, /left:12px/);
  assert.match(document.sheet.cssRules[0].cssText, /opacity:0\.8/);
  assert.equal(Object.prototype.hasOwnProperty.call(element, "style"), false);
});

test("runtime style manager raises specificity for id-backed elements", () => {
  const document = createFakeDocument();
  const manager = createRuntimeStyleManager(document);
  const element = {
    id: "pet",
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttributeNames() { return Object.keys(this.attributes); },
    removeAttribute(name) { delete this.attributes[name]; },
  };

  manager.apply(element, "pet-visual", { width: "256px" });

  assert.match(document.sheet.cssRules[0].cssText, /#pet\[data-runtime-style-pet-visual\]/);
});

test("runtime style manager replaces and clears a rule without inline styles", () => {
  const document = createFakeDocument();
  const manager = createRuntimeStyleManager(document);
  const element = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttributeNames() { return Object.keys(this.attributes); },
    removeAttribute(name) {
      delete this.attributes[name];
    },
  };

  manager.apply(element, "music-status", { left: "20px" });
  manager.apply(element, "music-status", { left: "40px", top: "10px" });
  assert.equal(document.sheet.cssRules.length, 1);
  assert.match(document.sheet.cssRules[0].cssText, /left:40px/);
  assert.doesNotMatch(document.sheet.cssRules[0].cssText, /left:20px/);

  manager.clear(element);
  assert.equal(element.attributes["data-runtime-style-music-status"], undefined);
  assert.equal(document.sheet.cssRules.length, 0);
});
