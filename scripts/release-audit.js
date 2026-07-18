const fs = require("node:fs");
const path = require("node:path");

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".md", ".txt", ".yml", ".yaml"]);
const PACKAGE_ROOTS = Object.freeze(["package.json", "src", "frames"]);
const SKIP_DIRECTORIES = new Set([
  ".git",
  ".codex",
  ".agents",
  "node_modules",
  "release",
  "dist",
  "coverage",
  "test",
  "tests",
  "docs",
]);

const PATTERNS = Object.freeze([
  { type: "cookie", pattern: /(?:MUSIC_U|__MUSIC_U|MUSIC_A)\s*=\s*[A-Za-z0-9%._~+/=-]{20,}/i },
  { type: "api-key", pattern: /(?:api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}|Authorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]{16,})/i },
  { type: "machine-path", pattern: /(?:[A-Z]:\\(?:Users|SOFT|VibeCoding)\\|\\Users\\|\/Users\/|\/home\/)/i },
  { type: "runtime-file", pattern: /(?:\.runtime[\\/]|netease-session\.json|deskpet-settings\.json)/i },
]);

function auditText(text) {
  const source = String(text || "");
  return PATTERNS
    .filter(({ pattern }) => pattern.test(source))
    .map(({ type }) => ({ type }));
}

function classifyFindings(findings) {
  return [...new Set((Array.isArray(findings) ? findings : []).map((item) => item.type).filter(Boolean))];
}

function isTextFile(relative) {
  const basename = path.basename(relative).toLowerCase();
  return TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase())
    || basename === ".env"
    || basename.startsWith(".env.");
}

function publishTextFiles(rootDir) {
  const files = [];

  function walk(directory) {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (_error) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relative = path.relative(rootDir, fullPath);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name.toLowerCase())) walk(fullPath);
        continue;
      }
      if (entry.isFile() && isTextFile(relative)) files.push(relative);
    }
  }

  for (const relativeRoot of PACKAGE_ROOTS) {
    const fullPath = path.join(rootDir, relativeRoot);
    if (!fs.existsSync(fullPath)) continue;
    if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
    else if (isTextFile(relativeRoot)) files.push(relativeRoot);
  }
  return files;
}

function auditFiles(rootDir) {
  const findings = [];
  for (const relative of publishTextFiles(rootDir)) {
    if (/^(?:test|docs)[\\/]/i.test(relative)) continue;
    const fullPath = path.join(rootDir, relative);
    let content;
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch (_error) {
      continue;
    }
    const contentFindings = auditText(content).filter(({ type }) => type !== "runtime-file");
    const pathFindings = /(?:\.runtime[\\/]|netease-session\.json|deskpet-settings\.json)/i.test(relative)
      ? [{ type: "runtime-file" }]
      : [];
    for (const type of classifyFindings([...contentFindings, ...pathFindings])) {
      findings.push({ file: relative, type });
    }
  }
  return findings;
}

function main() {
  const rootDir = path.resolve(__dirname, "..");
  const findings = auditFiles(rootDir);
  if (!findings.length) {
    console.log("Release audit passed: no sensitive data patterns found.");
    return 0;
  }
  console.error("Release audit failed:");
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.type}`);
  return 1;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  auditFiles,
  auditText,
  classifyFindings,
  publishTextFiles,
};
