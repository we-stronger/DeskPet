const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("music widget exposes a visible click-through state without hiding the widget", () => {
  const renderer = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src", "renderer", "styles", "widgets.css"), "utf8");

  assert.match(renderer, /musicStatusBar\.dataset\.clickThrough/);
  assert.match(renderer, /setAttribute\(\s*"aria-label"[\s\S]*?穿透/);
  assert.match(styles, /music-status-bar\[data-click-through="true"\]/);
  assert.match(styles, /pointer-events:\s*none/);
});
