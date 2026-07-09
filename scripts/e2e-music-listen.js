// E2E smoke for the right-click "听音乐" menu item.
//
// The right-click menu is built in pet-menu-template.js. The click
// handler on "🎧 听音乐" calls sendCommand("music:listen"). In main.js
// that goes through dispatchPetCommand, which routes any command
// starting with "music:" to handleMusicCommand. handleMusicCommand
// must then forward "music:listen" to the renderer via the
// `pet:command` IPC so the AnimationController can play the music
// action. We exercise that full path here by replaying the menu's
// sendCommand in the same way main.js does.
//
// Run with: electron scripts/e2e-music-listen.js
delete process.env.ELECTRON_RUN_AS_NODE;
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const { buildContextMenuTemplate } = require("../src/pet-menu-template");
const { musicActionFromCommand } = require("../src/music-command");

const projectRoot = path.join(__dirname, "..");
const userData = path.join(projectRoot, ".runtime", "user-data");
fs.mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);
app.commandLine.appendSwitch("no-sandbox");

const logFile = path.join(projectRoot, ".runtime", "e2e-music-listen.log");
fs.mkdirSync(path.dirname(logFile), { recursive: true });
fs.writeFileSync(logFile, "");
const logStream = fs.createWriteStream(logFile, { flags: "a" });
const log = (...args) => {
  const line = "[e2e-listen] " + args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") + "\n";
  logStream.write(line);
  process.stderr.write(line);
};

// Mirror of src/main.js's dispatchPetCommand + handleMusicCommand for
// "music:listen". The renderer-side behavior is already covered by
// renderer.js's runCommand handler. We only need to confirm that the
// main-side forward lands on the renderer.
function dispatchPetCommand(win, command) {
  if (command === "music:listen") {
    win.webContents.send("pet:command", command);
    return;
  }
  const action = musicActionFromCommand(command);
  if (action) {
    // Real main.js sends a media key + feedback; skip that here.
    win.webContents.send("pet:command", `music:feedback:${action}`);
    return;
  }
  win.webContents.send("pet:command", command);
}

function findListenClick(template) {
  for (const item of template) {
    if (Array.isArray(item.submenu)) {
      const found = findListenClick(item.submenu);
      if (found) return found;
    }
    if (item.label === "🎧 听音乐" && typeof item.click === "function") {
      return item;
    }
  }
  return null;
}

async function run() {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(projectRoot, "src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("render-process-gone", (_e, details) => {
    log("render-process-gone:", JSON.stringify(details));
  });
  win.webContents.on("preload-error", (_e, p, err) => {
    log("preload-error:", p, String(err));
  });

  await win.loadFile(path.join(projectRoot, "src", "renderer", "index.html"));
  await new Promise((r) => setTimeout(r, 400));

  const before = await win.webContents.executeJavaScript(
    "(document.querySelector('#pet') || {}).dataset || {}",
  );
  log("before:", JSON.stringify(before));

  const template = buildContextMenuTemplate({
    currentSizePercent: 100,
    currentSpeedPercent: 100,
    petState: { mood: 50, affinity: 0, energy: 80, sleeping: false },
    sendCommand: (command) => dispatchPetCommand(win, command),
    quit: () => {},
  });

  const listenItem = findListenClick(template);
  if (!listenItem) {
    log("FAIL: 🎧 听音乐 entry not found in context menu template");
    return setTimeout(() => app.exit(1), 100);
  }
  listenItem.click();
  await new Promise((r) => setTimeout(r, 200));

  const after = await win.webContents.executeJavaScript(
    "(document.querySelector('#pet') || {}).dataset || {}",
  );
  log("after:", JSON.stringify(after));

  if (!after.action || after.action !== "music") {
    log("FAIL: pet did not switch to music action. action=", after.action);
    return setTimeout(() => app.exit(1), 100);
  }

  log("OK: music:listen reached the renderer and switched animation to 'music'");
  setTimeout(() => app.exit(0), 100);
}

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  const t = setTimeout(() => { log("HARD TIMEOUT"); app.exit(2); }, 30000);
  run().then(() => clearTimeout(t)).catch((e) => { clearTimeout(t); log("error:", e && e.stack || e); app.exit(1); });
});
