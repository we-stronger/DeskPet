const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { portableArchivePlan } = require("../scripts/create-portable-zip");

test("portable archive plan wraps the unpacked app in one DeskPet folder", () => {
  const outputDir = path.join("D:", "build-output");
  const plan = portableArchivePlan({ outputDir, version: "0.1.0" });

  assert.equal(plan.sourceDir, path.join(outputDir, "win-unpacked"));
  assert.equal(plan.applicationDir, path.join(outputDir, ".portable-stage", "DeskPet"));
  assert.equal(plan.archivePath, path.join(outputDir, "DeskPet-Portable-0.1.0-win.zip"));
});
