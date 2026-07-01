const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");

function collectJsFiles(dir) {
  const fs = require("node:fs");
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_e) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "frames") continue;
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        out.push(full);
      }
    }
  }
  return out;
}

test("every JS file in the repo passes node --check", () => {
  const dirs = [
    path.join(repoRoot, "src"),
    path.join(repoRoot, "scripts"),
    path.join(repoRoot, "test"),
  ];
  const files = dirs.flatMap(collectJsFiles);

  assert.ok(files.length > 0, "expected to discover some JS files");

  const failures = [];
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) {
      failures.push({ file, stderr: result.stderr.trim() });
    }
  }

  assert.deepEqual(
    failures,
    [],
    `${failures.length} file(s) failed syntax check:\n` +
      failures.map((f) => `${f.file}\n${f.stderr}`).join("\n\n"),
  );
});