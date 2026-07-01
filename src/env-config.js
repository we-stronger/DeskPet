const defaultFs = require("node:fs");

const KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

function stripSurroundingQuotes(value) {
  if (value.length >= 2) {
    const first = value.charCodeAt(0);
    const last = value.charCodeAt(value.length - 1);
    if ((first === 34 && last === 34) || (first === 39 && last === 39)) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function loadEnvConfig({
  envPath,
  fs = defaultFs,
  assignToEnv = Object.assign,
} = {}) {
  let text;
  try {
    text = fs.readFileSync(envPath, "utf8");
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return {};
    }
    throw error;
  }

  const parsed = {};
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    if (!KEY_PATTERN.test(key)) {
      continue;
    }
    const value = stripSurroundingQuotes(line.slice(eqIndex + 1).trim());
    parsed[key] = value;
  }

  assignToEnv.call(null, process.env, parsed);
  return parsed;
}

module.exports = { loadEnvConfig };
