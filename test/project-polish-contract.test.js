const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  attributeValue,
  elements,
  hasAttribute,
  parseHtml,
  section,
} = require("./helpers/html-fixture");

const root = path.join(__dirname, "..");

test("HTML fixture queries ignore tags inside comments", () => {
  const document = parseHtml(`
    <!-- <section data-panel="commented"></section> -->
    <section data-panel="real"></section>
  `);

  assert.deepEqual(
    elements(document, { tagName: "section" })
      .map((node) => attributeValue(node, "data-panel")),
    ["real"]
  );
});

test("HTML fixture attributes do not leak out of quoted values", () => {
  const document = parseHtml(`
    <div title='data-panel="fake"' data-panel="real"></div>
  `);

  assert.equal(section(document, "data-panel", "fake"), null);
  assert.equal(
    attributeValue(section(document, "data-panel", "real"), "title"),
    'data-panel="fake"'
  );
});

test("HTML fixture sections preserve nested element boundaries", () => {
  const document = parseHtml(`
    <section data-panel="outer">
      <section data-panel="inner"><span id="nested"></span></section>
      <span id="sibling"></span>
    </section>
  `);
  const outer = section(document, "data-panel", "outer");

  assert.equal(section(outer, "data-panel", "inner")?.tagName, "section");
  assert.deepEqual(
    elements(outer, { tagName: "span" }).map((node) => attributeValue(node, "id")),
    ["nested", "sibling"]
  );
});

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function cssRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"))?.[1] || "";
}

function assertStyles(relativePath, expectedStyles) {
  const document = parseHtml(read(relativePath));
  const heads = elements(document, { tagName: "head" });
  assert.equal(heads.length, 1, `${relativePath} should have exactly one head element`);
  const loadedStyles = elements(heads[0], { tagName: "link" })
    .filter((node) => (attributeValue(node, "rel") || "").toLowerCase().split(/\s+/).includes("stylesheet"))
    .map((node) => attributeValue(node, "href"))
    .filter(Boolean)
    .map((href) => href.replace(/^\.\//, ""));

  assert.deepEqual(
    loadedStyles,
    expectedStyles,
    `${relativePath} should load exactly these stylesheets in order: ${expectedStyles.join(", ")}`
  );
}

function assertFeedbackScriptBeforeController(relativePath, controller) {
  const document = parseHtml(read(relativePath));
  const scripts = elements(document, { tagName: "script" })
    .map((node) => attributeValue(node, "src"))
    .filter(Boolean)
    .map((src) => src.replace(/^\.\//, ""));
  const feedbackIndex = scripts.indexOf("operation-feedback.js");
  const controllerIndex = scripts.indexOf(controller);

  assert.notEqual(controllerIndex, -1, `${relativePath} should load ${controller}`);
  assert.notEqual(feedbackIndex, -1, `${relativePath} should load operation-feedback.js`);
  assert.ok(
    feedbackIndex < controllerIndex,
    `${relativePath} should load operation-feedback.js before ${controller}`
  );
}

function assertFeedbackHost(relativePath) {
  const document = parseHtml(read(relativePath));
  const hosts = elements(document).filter((node) => hasAttribute(node, "data-operation-feedback"));

  assert.ok(
    hosts.some((node) => attributeValue(node, "role") === "status"),
    `${relativePath} should provide a data-operation-feedback host with role="status"`
  );
}

test("pet renderer loads the split UI stylesheets", () => {
  assertStyles("src/renderer/index.html", [
    "styles/base.css",
    "styles/pet.css",
    "styles/widgets.css",
    "styles/settings.css",
    "styles/music.css",
  ]);
});

test("settings renderer loads its shared and page stylesheets", () => {
  assertStyles("src/renderer/settings.html", ["styles/base.css", "styles/settings.css"]);
});

test("music renderer loads its shared and page stylesheets", () => {
  assertStyles("src/renderer/music.html", ["styles/base.css", "styles/music.css"]);
});

test("music search renderer loads its shared and page stylesheets", () => {
  assertStyles("src/renderer/music-search.html", ["styles/base.css", "styles/music.css"]);
});

test("chat renderer loads its shared and page stylesheets", () => {
  assertStyles("src/renderer/chat.html", ["styles/base.css", "styles/chat.css"]);
});

test("split stylesheets replace the legacy renderer stylesheet", () => {
  for (const name of ["base", "pet", "widgets", "settings", "music", "chat"]) {
    assert.equal(
      fs.existsSync(path.join(root, "src", "renderer", "styles", `${name}.css`)),
      true,
      `styles/${name}.css should exist`
    );
  }
  assert.equal(fs.existsSync(path.join(root, "src", "renderer", "styles.css")), false);

  for (const name of fs.readdirSync(path.join(root, "src", "renderer")).filter((entry) => entry.endsWith(".html"))) {
    assert.doesNotMatch(read(path.join("src", "renderer", name)), /(?:\.\/)?styles\.css/i);
  }
});

test("desktop stage document layout lives only in the pet stylesheet", () => {
  const base = read("src/renderer/styles/base.css");
  const pet = read("src/renderer/styles/pet.css");

  assert.doesNotMatch(base, /html,\s*body\s*\{/);
  assert.doesNotMatch(base, /(?:^|\n)body\s*\{/);
  assert.match(pet, /html,\s*body\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*overflow:\s*hidden[^}]*background:\s*transparent[^}]*user-select:\s*none/s);
  assert.match(pet, /(?:^|\n)body\s*\{[^}]*display:\s*grid[^}]*place-items:\s*center/s);
});

test("operation feedback only draws non-idle states", () => {
  const css = read("src/renderer/styles/base.css");
  const idleRule = cssRule(css, ".operation-feedback");
  const visibleRule = cssRule(css, '.operation-feedback[data-state]:not([data-state="idle"])');

  assert.match(idleRule, /position:\s*(?:absolute|fixed)/);
  assert.match(idleRule, /width:\s*1px/);
  assert.match(idleRule, /height:\s*1px/);
  assert.match(idleRule, /padding:\s*0/);
  assert.match(idleRule, /margin:\s*-1px/);
  assert.match(idleRule, /overflow:\s*hidden/);
  assert.match(idleRule, /clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  assert.match(idleRule, /clip-path:\s*inset\(50%\)/);
  assert.match(idleRule, /white-space:\s*nowrap/);
  assert.match(idleRule, /border:\s*0/);
  assert.doesNotMatch(idleRule, /display\s*:\s*none|visibility\s*:\s*hidden/);

  assert.match(visibleRule, /position:\s*fixed/);
  assert.match(visibleRule, /width:\s*auto/);
  assert.match(visibleRule, /height:\s*auto/);
  assert.match(visibleRule, /margin:\s*0/);
  assert.match(visibleRule, /overflow:\s*visible/);
  assert.match(visibleRule, /clip:\s*auto/);
  assert.match(visibleRule, /clip-path:\s*none/);
  assert.match(visibleRule, /white-space:\s*normal/);
  for (const state of ["pending", "success", "error", "info", "retry"]) {
    assert.match(css, new RegExp(`\\.operation-feedback\\[data-state=["']${state}["']\\]`));
  }
  assert.match(css, /\.operation-feedback\[data-state="error"\]\s+button\s*\{/);
  assert.doesNotMatch(css, /\.operation-feedback[^{}]*\{[^{}]*(?:display\s*:\s*none|visibility\s*:\s*hidden)/s);
});

test("shared panel resources live only in the base stylesheet", () => {
  const base = read("src/renderer/styles/base.css");
  const pet = read("src/renderer/styles/pet.css");
  const widgets = read("src/renderer/styles/widgets.css");
  const settings = read("src/renderer/styles/settings.css");
  const music = read("src/renderer/styles/music.css");
  const chat = read("src/renderer/styles/chat.css");
  const styles = { base, pet, widgets, settings, music, chat };
  const musicPanel = read("src/renderer/music-panel.js");

  assert.equal((base.match(/@keyframes\s+panelIn\b/g) || []).length, 1);
  assert.doesNotMatch(settings, /@keyframes\s+panelIn\b/);
  assert.doesNotMatch(music, /@keyframes\s+panelIn\b/);
  assert.match(settings, /animation:\s*panelIn\b/);
  assert.match(music, /animation:\s*panelIn\b/);

  for (const selector of [".settings-close", ".settings-close:hover", ".settings-close:active"]) {
    assert.notEqual(cssRule(styles.base, selector), "", `${selector} should be defined in base.css`);
    assert.equal(
      Object.values(styles).filter((css) => cssRule(css, selector) !== "").length,
      1,
      `${selector} should be defined exactly once`
    );
  }
  assert.match(musicPanel, /class="settings-close"/);
});

for (const [relativePath, controller] of [
  ["src/renderer/index.html", "renderer.js"],
  ["src/renderer/settings.html", "settings.js"],
  ["src/renderer/music.html", "music.js"],
  ["src/renderer/music-search.html", "music-search.js"],
  ["src/renderer/chat.html", "chat.js"],
]) {
  test(`${relativePath} loads shared operation feedback before its controller`, () => {
    assertFeedbackScriptBeforeController(relativePath, controller);
  });
}

for (const relativePath of ["src/renderer/music.html", "src/renderer/music-search.html"]) {
  test(`${relativePath} exposes an accessible operation feedback host`, () => {
    assertFeedbackHost(relativePath);
  });
}
