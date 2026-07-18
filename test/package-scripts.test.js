const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.join(__dirname, "..");

test("npm test only runs this project's test files", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(pkg.scripts.test, "node --test test/*.test.js");
});

test("Windows releases build an unpacked folder and run the release audit first", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const targets = Array.isArray(pkg.build?.win?.target) ? pkg.build.win.target : [];

  assert.ok(targets.some((target) => target && target.target === "nsis"));
  assert.ok(!targets.some((target) => target && target.target === "portable"));
  assert.match(pkg.scripts.pack, /npm(?:\.cmd)? run audit:release/);
  assert.match(pkg.scripts.pack, /electron-builder --win --dir/);
  assert.match(pkg.scripts.dist, /npm(?:\.cmd)? run audit:release/);
  assert.match(pkg.scripts["dist:win"], /npm(?:\.cmd)? run audit:release/);
  assert.match(pkg.scripts["dist:win"], /electron-builder --win nsis/);
  assert.match(pkg.scripts["dist:win"], /electron-builder --win --dir/);
  assert.match(pkg.scripts["dist:win"], /package:portable/);
});

test("portable releases use a stable product-specific ZIP artifact name", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

  assert.equal(
    pkg.scripts["package:portable"],
    "node scripts/create-portable-zip.js"
  );
});

test("portable archive script packages one application folder instead of a bare executable", () => {
  const source = fs.readFileSync(path.join(repoRoot, "scripts", "create-portable-zip.js"), "utf8");

  assert.match(source, /DeskPet-Portable-/);
  assert.match(source, /win-unpacked/);
  assert.match(source, /Compress-Archive/);
  assert.match(source, /DeskPet/);
});
