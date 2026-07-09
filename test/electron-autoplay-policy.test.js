const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("main process allows the pet audio host to play URLs triggered from music windows", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

  assert.match(source, /appendSwitch\("autoplay-policy",\s*"no-user-gesture-required"\)/);
});

test("main process sends pet audio host commands directly to the pet renderer", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

  assert.doesNotMatch(source, /sendPetCommand\(`music:play-audio-url:/);
  assert.match(source, /petWindow\.webContents\.send\([\s\S]*"pet:command"[\s\S]*`music:play-audio-url:/);
});
