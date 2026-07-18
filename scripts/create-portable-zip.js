const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function portableArchivePlan({ outputDir, version }) {
  const stageDir = path.join(outputDir, ".portable-stage");
  return {
    sourceDir: path.join(outputDir, "win-unpacked"),
    applicationDir: path.join(stageDir, "DeskPet"),
    stageDir,
    archivePath: path.join(outputDir, `DeskPet-Portable-${version}-win.zip`),
  };
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function createPortableArchive({ rootDir = path.resolve(__dirname, ".."), run = spawnSync } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  const outputDir = path.join(rootDir, pkg.build?.directories?.output || "release");
  const plan = portableArchivePlan({ outputDir, version: pkg.version });
  if (!fs.existsSync(plan.sourceDir)) {
    throw new Error(`Missing unpacked Windows build: ${plan.sourceDir}`);
  }
  if (!fs.existsSync(path.join(plan.sourceDir, "DeskPet.exe"))) {
    throw new Error(`Missing DeskPet.exe in unpacked build: ${plan.sourceDir}`);
  }

  fs.rmSync(plan.stageDir, { recursive: true, force: true });
  fs.rmSync(plan.archivePath, { force: true });
  fs.mkdirSync(plan.stageDir, { recursive: true });
  try {
    fs.cpSync(plan.sourceDir, plan.applicationDir, { recursive: true, errorOnExist: true });
    const command = `Compress-Archive -LiteralPath ${quotePowerShellLiteral(plan.applicationDir)} -DestinationPath ${quotePowerShellLiteral(plan.archivePath)} -Force`;
    const result = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
      cwd: rootDir,
      stdio: "inherit",
    });
    if (result.error || result.status !== 0 || !fs.existsSync(plan.archivePath)) {
      throw result.error || new Error("Portable archive creation failed");
    }
    return plan.archivePath;
  } finally {
    fs.rmSync(plan.stageDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    const archive = createPortableArchive();
    console.log(`Portable archive created: ${archive}`);
  } catch (error) {
    console.error(`Portable archive failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { createPortableArchive, portableArchivePlan, quotePowerShellLiteral };
