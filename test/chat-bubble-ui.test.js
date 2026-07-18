const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("renderer keeps chat replies in a separate queued bubble", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src", "renderer", "styles", "pet.css"), "utf8");

  assert.match(html, /id="chat-reply-bubble"/);
  assert.match(renderer, /chatReplyBubble/);
  assert.match(renderer, /chatBubbleQueue/);
  assert.match(renderer, /showChatReplyBubble/);
  assert.match(styles, /\.chat-reply-bubble/);
  assert.match(styles, /white-space:\s*pre-wrap/);
});
