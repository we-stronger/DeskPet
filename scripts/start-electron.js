const { spawn } = require("node:child_process");
const electronPath = require("electron");
const { buildElectronArgs } = require("./electron-launch-options");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, buildElectronArgs({ appArgs: process.argv.slice(2) }), {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
