const assert = require("node:assert/strict");
const test = require("node:test");
const { EventEmitter } = require("node:events");

const {
  VK_CODES,
  APP_COMMANDS,
  NETEASE_CLASS_NAMES,
  buildKeybdScript,
  runPowerShell,
  sendMediaKey,
} = require("../src/media-control");

test("VK_CODES maps actions to the documented media virtual keys", () => {
  assert.equal(VK_CODES.playPause, 0xb3, "VK_MEDIA_PLAY_PAUSE");
  assert.equal(VK_CODES.next, 0xb0, "VK_MEDIA_NEXT_TRACK");
  assert.equal(VK_CODES.previous, 0xb1, "VK_MEDIA_PREV_TRACK");
  assert.equal(Object.keys(VK_CODES).length, 3, "only the three media actions are mapped");
});

test("APP_COMMANDS maps actions to the documented APPCOMMAND media codes", () => {
  assert.equal(APP_COMMANDS.playPause, 14, "APPCOMMAND_MEDIA_PLAY_PAUSE");
  assert.equal(APP_COMMANDS.next, 11, "APPCOMMAND_MEDIA_NEXTTRACK");
  assert.equal(APP_COMMANDS.previous, 12, "APPCOMMAND_MEDIA_PREVIOUSTRACK");
  assert.equal(Object.keys(APP_COMMANDS).length, 3, "only the three media actions are mapped");
});

test("NETEASE_CLASS_NAMES lists known NetEase main-window class names", () => {
  assert.ok(NETEASE_CLASS_NAMES.includes("OrpheusBrowser"), "current NetEase main window");
  assert.ok(NETEASE_CLASS_NAMES.length >= 2, "at least one fallback class name");
});

test("buildKeybdScript targets NetEase via FindWindow/EnumWindows and falls back to keybd_event", () => {
  const script = buildKeybdScript(14, 0xb3);
  assert.ok(script.includes("FindWindowW"), "should look up the NetEase window by class name");
  assert.ok(script.includes("OrpheusBrowser"), "should look up the OrpheusBrowser class");
  assert.ok(script.includes("OrpheusMainForm"), "should look up OrpheusMainForm");
  assert.ok(script.includes("GetAncestor"), "should walk up to the top-level ancestor for play/pause");
  assert.ok(script.includes("GA_ROOT"), "should request the root ancestor (GA_ROOT=2)");
  assert.ok(script.includes("EnumWindows"), "should enumerate top-level windows to find NetEase by title");
  assert.ok(script.includes("网易云音乐"), "should match NetEase windows by their Chinese title");
  assert.ok(script.indexOf("OrpheusMainForm") < script.indexOf("OrpheusBrowser"), "main form should be tried before the CEF child");
  assert.ok(script.includes("SendMessage"), "should call SendMessage");
  assert.ok(script.includes("WM_APPCOMMAND"), "should send WM_APPCOMMAND");
  assert.ok(script.includes("keybd_event"), "should fall back to keybd_event when NetEase is not found");
  assert.ok(script.includes("KEYEVENTF_EXTENDEDKEY"), "should mark the keybd_event as an extended key");
  assert.ok(script.includes("AttachThreadInput"), "play/pause should use the AttachThreadInput trick to bypass focus stealing prevention");
  assert.ok(script.includes("SetForegroundWindow"), "play/pause should force NetEase to foreground so the media key reaches it");
  assert.ok(script.includes("BringWindowToTop"), "play/pause should also bring NetEase to top as a belt-and-braces measure");
  assert.ok(script.includes("SW_RESTORE"), "play/pause should restore NetEase if minimized");
  assert.ok(script.includes("AllowSetForegroundWindow"), "play/pause should bypass Windows focus-stealing prevention");
  assert.ok(script.includes("appCommand == 14"), "the foreground+keybd path should only run for play/pause");
  assert.ok(script.includes("VK_SPACE"), "play/pause should send Space (NetEase's default 播放/暂停 hotkey) instead of the media key");
  assert.ok(script.includes("[MediaKeySender]::Send(14, 179);"), "should call Send with appCommand=14 and vk=0xB3");
  assert.ok(!script.includes("__APP__"), "app-command placeholder should be replaced");
  assert.ok(!script.includes("__VK__"), "virtual-key placeholder should be replaced");
});

test("runPowerShell spawns powershell with windowsHide and the script as -Command", () => {
  const calls = [];
  const fakeChild = new EventEmitter();
  fakeChild.stderr = new EventEmitter();
  fakeChild.stdout = new EventEmitter();
  const spawn = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    queueMicrotask(() => fakeChild.emit("exit", 0));
    return fakeChild;
  };

  return runPowerShell("echo hi", { spawn }).then(() => {
    assert.equal(calls.length, 1);
    const { cmd, args, options } = calls[0];
    assert.equal(cmd, "powershell");
    assert.equal(args[0], "-NoProfile");
    assert.equal(args[1], "-NonInteractive");
    assert.equal(args[2], "-ExecutionPolicy");
    assert.equal(args[3], "Bypass");
    assert.equal(args[4], "-Command");
    assert.equal(args[5], "echo hi");
    assert.equal(options.windowsHide, true, "should hide the PowerShell window");
  });
});

test("runPowerShell rejects when the child exits with a non-zero code", () => {
  const fakeChild = new EventEmitter();
  fakeChild.stderr = new EventEmitter();
  fakeChild.stderr.on("data", () => {});
  fakeChild.stdout = new EventEmitter();
  fakeChild.stdout.on("data", () => {});
  const spawn = () => {
    queueMicrotask(() => {
      fakeChild.stderr.emit("data", "boom");
      fakeChild.emit("exit", 1);
    });
    return fakeChild;
  };

  return runPowerShell("bad", { spawn }).then(
    () => assert.fail("should have rejected"),
    (err) => {
      assert.match(err.message, /exited with code 1/);
      assert.match(err.message, /boom/);
    },
  );
});

test("sendMediaKey dispatches the matching app-command and virtual key for each action", () => {
  const calls = [];
  const makeSpawn = (expectedAppCommand, expectedVk) => () => {
    const fakeChild = new EventEmitter();
    fakeChild.stderr = new EventEmitter();
    fakeChild.stdout = new EventEmitter();
    calls.push({ expectedAppCommand, expectedVk });
    queueMicrotask(() => fakeChild.emit("exit", 0));
    return fakeChild;
  };

  return Promise.all([
    sendMediaKey("playPause", { spawn: makeSpawn(14, 0xb3) }),
    sendMediaKey("next", { spawn: makeSpawn(11, 0xb0) }),
    sendMediaKey("previous", { spawn: makeSpawn(12, 0xb1) }),
  ]).then((results) => {
    assert.deepEqual(calls, [
      { expectedAppCommand: 14, expectedVk: 0xb3 },
      { expectedAppCommand: 11, expectedVk: 0xb0 },
      { expectedAppCommand: 12, expectedVk: 0xb1 },
    ]);
    assert.deepEqual(results.map((r) => r.action), ["playPause", "next", "previous"]);
    assert.deepEqual(results.map((r) => r.appCommand), [14, 11, 12]);
    assert.deepEqual(results.map((r) => r.vk), [0xb3, 0xb0, 0xb1]);
  });
});

test("sendMediaKey throws on an unknown action without spawning anything", () => {
  const calls = [];
  const spawn = () => {
    calls.push("spawned");
    const fakeChild = new EventEmitter();
    fakeChild.stderr = new EventEmitter();
    fakeChild.stdout = new EventEmitter();
    return fakeChild;
  };

  return sendMediaKey("bogus", { spawn }).then(
    () => assert.fail("should have thrown"),
    (err) => {
      assert.match(err.message, /Unknown media action: bogus/);
      assert.deepEqual(calls, [], "spawn should not be called for unknown actions");
    },
  );
});

test("the play/pause script actually runs in a real PowerShell process (Windows only)", { skip: process.platform !== "win32" }, async () => {
  // Unit tests prove the script is wired up; this proves PowerShell itself
  // accepts the script (Add-Type compiles, FindWindowW links, no syntax
  // errors). The NetEase-targeting branch is a no-op when NetEase isn't
  // installed; the keybd_event fallback then runs harmlessly.
  const script = buildKeybdScript(APP_COMMANDS.playPause, VK_CODES.playPause);
  const result = await runPowerShell(script, { windowsHide: true });
  assert.equal(result.code, 0, "PowerShell should exit 0 when running the media-key script");
  assert.equal(result.stderr, "", "PowerShell should produce no stderr");
});
