const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { auditFiles, auditText, classifyFindings } = require("../scripts/release-audit");

test("release audit accepts ordinary source text", () => {
  assert.deepEqual(auditText("const title = 'DeskPet';"), []);
});

test("release audit detects cookies, API keys, runtime data, and machine paths", () => {
  const findings = classifyFindings(auditText([
    "MUSIC_U=abcdefghijklmnopqrstuvwxyz123456",
    "Authorization: Bearer abcdefghijklmnop",
    "D:\\SOFT\\CloudMusic\\cloudmusic.exe",
    "netease-session.json",
  ].join("\n")));
  assert.deepEqual(findings.sort(), ["api-key", "cookie", "machine-path", "runtime-file"]);
});

test("release audit scans untracked publish candidates", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "deskpet-release-audit-"));
  try {
    fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "src", "untracked-config.js"),
      "const cookie = 'MUSIC_U=abcdefghijklmnopqrstuvwxyz123456';\n",
      "utf8",
    );

    assert.deepEqual(classifyFindings(auditFiles(tempRoot)), ["cookie"]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
