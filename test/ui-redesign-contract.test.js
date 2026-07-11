const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { buildContextMenuTemplate } = require("../src/pet-menu-template");

const root = path.join(__dirname, "..");

function actionableCommands(items) {
  const commands = [];
  const walk = (list) => {
    for (const item of list) {
      if (!item || item.type === "separator") continue;
      if (typeof item.click === "function") {
        item.click();
      }
      if (Array.isArray(item.submenu)) walk(item.submenu);
    }
  };
  return { commands, walk };
}

test("context menu is grouped into compact feature sections", () => {
  const commands = [];
  const template = buildContextMenuTemplate({
    currentSizePercent: 100,
    currentSpeedPercent: 100,
    petState: { mood: 70, affinity: 8, energy: 45, sleeping: false },
    sendCommand: (command) => commands.push(command),
    quit: () => commands.push("quit"),
  });

  const labels = template.filter((item) => item.type !== "separator").map((item) => item.label);
  assert.ok(labels.includes("✨ 互动"), "互动 items should collapse into one submenu");
  assert.ok(labels.includes("⏱ 专注"), "focus controls should be a compact submenu entry");
  assert.ok(labels.includes("🎵 音乐"), "music controls should be a compact submenu entry");
  assert.ok(labels.length <= 11, "top-level context menu should stay short");
  assert.ok(!labels.includes("开心一下"), "individual interaction items should not stay top-level");

  const interaction = template.find((item) => item.label === "✨ 互动");
  assert.ok(Array.isArray(interaction.submenu), "互动 should expose grouped actions");
  interaction.submenu.filter((item) => typeof item.click === "function").forEach((item) => item.click());
  assert.ok(commands.includes("happy"));
  assert.ok(commands.includes("feed"));
  assert.ok(commands.includes("pet"));
});

test("renderer markup exposes compact settings structure without changing control ids", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  assert.match(html, /class="settings-status-strip"/);
  assert.match(html, /class="settings-section settings-section--appearance"/);
  assert.match(html, /class="settings-section settings-section--automation"/);
  assert.match(html, /id="settings-close"[^>]*aria-label="关闭设置"/);
  assert.match(html, /<svg[^>]+aria-hidden="true"/);
  assert.match(html, /id="settings-panel"/);
  for (const id of [
    "size-input", "speed-input", "opacity-input", "auto-behavior-input", "auto-walk-input",
    "mouse-react-input", "daily-greeting-input", "clock-enabled-input", "focus-start", "focus-reset",
    "clock-display-mode-input", "focus-indicator-enabled-input", "focus-display-mode-input",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should remain available to renderer.js`);
  }
});

test("focus settings expose quick task naming and widget display placement controls", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");

  assert.match(html, /class="focus-task-presets"/);
  assert.match(html, /data-focus-task="学习"/);
  assert.match(html, /data-focus-task="写代码"/);
  assert.match(html, /id="clock-display-mode-input"/);
  assert.match(html, /id="focus-indicator-enabled-input"/);
  assert.match(html, /id="focus-display-mode-input"/);
  assert.match(html, /value="music"[^>]*>歌词栏/);
});

test("glass UI stylesheet defines theme variables and preserves pointer event semantics", () => {
  const css = fs.readFileSync(path.join(root, "src", "renderer", "styles.css"), "utf8");
  const preload = fs.readFileSync(path.join(root, "src", "preload.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
  assert.match(css, /:root\s*{/);
  assert.match(css, /--glass-bg:/);
  assert.match(css, /--glass-border:/);
  assert.match(css, /--shadow-floating:/);
  assert.match(css, /backdrop-filter:\s*blur\(12px\)/);
  assert.match(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.match(css, /#pet\s*{[^}]*pointer-events:\s*auto/s);
  assert.match(css, /\.mood-bubble\s*{[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.clock-widget\s*{[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.settings-panel\s*{[^}]*pointer-events:\s*auto/s);
  assert.match(css, /clip-path:\s*path\(/);
  assert.match(css, /\.music-search-result__play/);
  assert.match(css, /\.music-search-result__title/);
  assert.match(css, /\.music-search-result\.is-playing/);
  assert.match(css, /\.music-search-result\.is-done/);
  assert.match(css, /\.music-search-result\.is-error/);
  const renderer = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");
  assert.match(renderer, /addVisibleUiShapeRect\(rects, settingsPanel\)/);
  assert.match(renderer, /addVisibleUiShapeRect\(rects, moodBubble\)/);
  assert.match(renderer, /addVisibleUiShapeRect\(rects, clockEl\)/);
  assert.match(renderer, /addVisibleUiShapeRect\(rects, focusIndicator\)/);
  assert.match(renderer, /function refreshPetShape\(\)/);
  assert.match(renderer, /bridge\.setPetShape\(rects\)/);
  assert.match(renderer, /pet-top-right/);
  assert.match(renderer, /addVisibleUiShapeRect\(rects, musicStatusBar\)/);
  assert.doesNotMatch(renderer, /imageData && pet && !petClickThroughEnabled/);
  assert.match(renderer, /function applyPetMouseEventsPolicy\(\)/);
  assert.match(renderer, /setPetMouseEventsIgnored\(ignored\)/);
  assert.match(preload, /setPetMouseEventsIgnored/);
  assert.match(main, /pet:set-mouse-events-ignored/);
  assert.match(main, /setIgnoreMouseEvents\(ignored === true,\s*\{\s*forward:\s*true\s*\}\)/);

  // mood-bubble restyle: smaller font, rounded-rectangle (not pill), gradient background
  const bubbleRuleMatch = css.match(/\.mood-bubble\s*{([^}]*)}/);
  assert.ok(bubbleRuleMatch, "should find a .mood-bubble rule");
  const bubbleBody = bubbleRuleMatch[1];
  const fontShorthandMatch = bubbleBody.match(/\bfont:\s*\d+\s+(\d+)px/);
  const fontSizeLonghandMatch = bubbleBody.match(/\bfont-size:\s*(\d+)px/);
  const fontSizeValue = fontShorthandMatch
    ? Number(fontShorthandMatch[1])
    : fontSizeLonghandMatch
      ? Number(fontSizeLonghandMatch[1])
      : null;
  assert.ok(
    fontSizeValue !== null && fontSizeValue <= 14,
    `mood-bubble font-size should be <= 14px, got ${fontSizeValue}`
  );
  const borderRadiusMatch = bubbleBody.match(/\bborder-radius:\s*([^;]+);/);
  assert.ok(borderRadiusMatch, "mood-bubble should declare a border-radius");
  assert.notStrictEqual(
    borderRadiusMatch[1].trim(),
    "999px",
    "mood-bubble should no longer be a pill (999px)"
  );
  const backgroundMatch = bubbleBody.match(/\bbackground:\s*([^;]+);/);
  assert.ok(backgroundMatch, "mood-bubble should declare a background");
  assert.match(
    backgroundMatch[1].toLowerCase(),
    /gradient/,
    "mood-bubble background should use a gradient"
  );
  const maxWidthMatch = bubbleBody.match(/\bmax-width:\s*(\d+)px/);
  assert.ok(maxWidthMatch, "mood-bubble should declare a max-width");
  assert.ok(
    Number(maxWidthMatch[1]) >= 220,
    `mood-bubble should expand for longer lines, got max-width ${maxWidthMatch[1]}px`
  );

  const bubbleAfterMatch = css.match(/\.mood-bubble::after\s*{([^}]*)}/);
  assert.ok(bubbleAfterMatch, "should find a .mood-bubble::after rule");
  const bubbleAfterBody = bubbleAfterMatch[1];
  assert.doesNotMatch(
    bubbleAfterBody,
    /left:\s*50%/,
    "bubble tail should no longer be centered once the bubble moves to the pet's top-right"
  );
});

test("renderer loads and uses persistent widget coordination without replacing sprite anchors", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "index.html"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");

  assert.match(html, /<script src="\.\/widget-coordination\.js"><\/script>/);
  assert.match(renderer, /DeskpetWidgetCoordination/);
  assert.match(renderer, /coordinatePinnedWidgetPositions/);
  assert.match(renderer, /isDraggingFocus/);
  assert.match(renderer, /isDraggingMusic/);
});

test("focus controls expose their active state and block duplicate starts", () => {
  const renderer = fs.readFileSync(path.join(root, "src", "renderer", "renderer.js"), "utf8");

  assert.match(renderer, /focusStart\.disabled\s*=/);
  assert.match(renderer, /breakStart\.disabled\s*=/);
  assert.match(renderer, /focusPause\.disabled\s*=/);
  assert.match(renderer, /setAttribute\("aria-pressed"/);
});





