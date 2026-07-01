// Regression test for the "music panel buttons don't respond, pet reacts instead"
// bug. The renderer's #stage element captures pointerdown with setPointerCapture
// and starts the drag/pet interaction. Any panel inside the stage must call
// event.stopPropagation() on pointerdown and contextmenu so the pet doesn't
// swallow the click — otherwise the panel button's `click` handler never fires.
//
// The settings panel does this in src/renderer/renderer.js; the music panel must
// do the same on its own root element, since it is created lazily after boot.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const musicPanelSrc = fs.readFileSync(
  path.join(root, "src", "renderer", "music-panel.js"),
  "utf8",
);

test("music panel stops pointerdown propagation so the pet's drag handler doesn't swallow clicks", () => {
  // We look for a pointerdown listener that calls stopPropagation, attached
  // to the panel element itself (or any stable ancestor inside the panel).
  // The simplest, most defensive implementation is `panel.addEventListener("pointerdown", ...)`
  // containing stopPropagation, mirroring how the settings panel works.
  assert.match(
    musicPanelSrc,
    /panel\.addEventListener\(\s*["']pointerdown["']\s*,\s*\(?event\)?\s*=>\s*\{[\s\S]*?stopPropagation\(\)/,
    "music-panel.js must call event.stopPropagation() on a panel-level pointerdown listener",
  );
});

test("music panel stops contextmenu propagation so right-clicks open the panel, not the pet menu", () => {
  assert.match(
    musicPanelSrc,
    /panel\.addEventListener\(\s*["']contextmenu["']\s*,\s*\(?event\)?\s*=>\s*\{[\s\S]*?stopPropagation\(\)/,
    "music-panel.js must call event.stopPropagation() on a panel-level contextmenu listener",
  );
});

test("music panel still keeps the close button working (defensive — close must call .hidden=true)", () => {
  // Sanity check that the panel's own close button listener is wired up.
  assert.match(
    musicPanelSrc,
    /panel\.querySelector\(["']#music-panel-close["']\)\?\.addEventListener\(\s*["']click["']\s*,\s*close\)/,
  );
  assert.match(musicPanelSrc, /function\s+close\s*\(\s*\)/);
  assert.match(musicPanelSrc, /panel\.hidden\s*=\s*true/);
});