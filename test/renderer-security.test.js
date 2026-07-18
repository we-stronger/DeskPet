const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rendererDir = path.join(__dirname, "..", "src", "renderer");

test("every renderer document declares a strict CSP without unsafe-eval", () => {
  const htmlFiles = fs.readdirSync(rendererDir).filter((name) => name.endsWith(".html"));
  assert.ok(htmlFiles.length > 0);
  for (const name of htmlFiles) {
    const html = fs.readFileSync(path.join(rendererDir, name), "utf8");
    const csp = html.match(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/i);
    assert.ok(csp, `${name} is missing Content-Security-Policy`);
    assert.doesNotMatch(csp[0], /unsafe-eval/i, `${name} enables unsafe-eval`);
    assert.doesNotMatch(csp[0], /unsafe-inline/i, `${name} enables unsafe-inline`);
    assert.match(csp[0], /default-src\s+'self'/i, `${name} has no self default-src`);
    assert.match(csp[0], /object-src\s+'none'/i, `${name} has no object-src restriction`);
    assert.match(csp[0], /img-src[^;]*http:\/\/\*\.music\.126\.net/i, `${name} blocks NetEase HTTP cover images`);
    assert.doesNotMatch(csp[0], /frame-ancestors/i, `${name} uses unsupported meta CSP frame-ancestors`);
  }
});

test("renderer documents do not use inline style attributes", () => {
  const htmlFiles = fs.readdirSync(rendererDir).filter((name) => name.endsWith(".html"));

  for (const name of htmlFiles) {
    const html = fs.readFileSync(path.join(rendererDir, name), "utf8");
    assert.doesNotMatch(html, /\sstyle\s*=/i, `${name} contains an inline style attribute`);
  }
});
