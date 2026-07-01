# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Common Commands

Use `npm.cmd` on Windows PowerShell (not `npm` or `npm.ps1`):

- **Install:** `npm.cmd install`
- **Run app:** `npm.cmd start` (uses `scripts/start-electron.js`)
- **Smoke test:** `npm.cmd run smoke` (starts Electron, exits after renderer loads — verifies boot path; ignores `os_crypt` Chromium warnings as long as log shows `renderer loaded`)
- **All tests:** `npm.cmd test` (uses Node's built-in `node --test` runner)
- **Single test:** `node --test test/<name>.test.js`
- **Single E2E music test:** `npm.cmd run e2e:music`
- **Syntax check a file:** `node --check <file>`

## Architecture

Electron app with three layers, communicating via `window.deskpet` IPC bridge exposed in `src/preload.js`:

1. **Main process** (`src/main.js`) — owns the native window, tray, persistent settings, IPC handlers. Creates a fixed 512x512 transparent frameless pet window plus optional child windows (music search, chat).
2. **Preload bridge** (`src/preload.js`) — `contextBridge.exposeInMainWorld("deskpet", {...})` exposes ~25 IPC methods (`moveBy`, `setSize`, `searchMusic`, `chat`, `onCommand`, etc.) plus a command listener.
3. **Renderer** (`src/renderer/renderer.js` + modules) — plays PNG frame sequences from `frames/<action>/<action>_<nn>.png`, handles pointer interaction, settings UI, pet behavior state, focus timer, music panel, chat.

### Fixed window rule

Pet window is always 512x512 (enforced by `src/window-size-policy.js` via min/max + restore). User size/opacity settings only affect the rendered image inside the fixed transparent window. Do NOT make the window resizable — this prevents a historical left-click/drag growth regression.

### Renderer module loading

`src/renderer/index.html` loads scripts in this strict order — pure logic classes first, then orchestration:

```
animation-controller → drag-controller → daily-state → pet-state-controller →
pointer-action-policy → action-config → pet-settings → pet-visual-style →
hold-visual-lock → pet-hit-test → walk-movement → mood-bubble → focus-timer →
mouse-react → clock → widget-anchor → renderer → music-search-view →
music-playlist-view → music-panel
```

Each module exposes a `window.Deskpet*` namespace (e.g. `window.DeskpetMoodBubble`, `window.DeskpetFocusTimer`) consumed by `renderer.js`. `test/renderer-script-loading.test.js` enforces this order.

### Pet state model

`PetStateController` owns non-visual logic in renderer:
- `mood` 0–100, `affinity` 0–999, `energy` 0–100, `sleeping` boolean, `tapCombo` (transient).
- Settings also carry `dailyState` (streak, daily counters), `focusRecords`, focus/break durations.

Interactions: tap (mood+/affinity+, energy−), feed (energy+), pet (mood+/affinity+, energy− minimal), happy/pout (one-shots), sleep tick (energy+).

### Music / LLM subsystems

- **Music** lives under `src/music/` (`netease-client.js`, `netease-auth.js`, `netease-weapi.js`, `netease-web-login.js`, `music-session-store.js`, `music-controller.js`) plus `src/netease-search.js`. `MusicController` wraps search, profile, playlists, QR login. Renderer UI is `music-panel.js` / `music-search-view.js` / `music-playlist-view.js`.
- **LLM chat** uses `src/llm-client.js` (ZhipuAI / GLM). Credentials via `.env` (gitignored) — see `.env.example`. `src/env-config.js` loads it. Chat UI in `chat.html` / `chat.js`.
- Both subsystems are reachable via IPC through `window.deskpet.*` methods.

### Persistence

Settings live at `.runtime/user-data/deskpet-settings.json` (`.runtime/` is gitignored). `src/pet-settings-store.js` provides `defaultPetSettings`, `normalizePetSettings`, `savePetSettings` — always normalize before writing (defends against corrupt/legacy settings).

## Frame Asset Contract

Every action listed in `src/renderer/action-config.js` must have matching files at `frames/<action>/<action>_01.png ... <action>_NN.png`. Current: idle 8, blink 4, tap 6, happy 8, sleep 6, walk 8, pout 6, drag 4. `drag` is held at frame 1 for stable drag visuals. Add new frames directly under the action folder — historical sprite sheets, split manifests, and Python split scripts have been removed.

## Tests

`npm.cmd test` runs Node's built-in `node --test`. Tests are co-located by topic (e.g. `pet-state-controller.test.js`, `music-search-ui.test.js`, `netease-weapi.test.js`). New logic should add a co-located test using `node:test` and `node:assert/strict` (matches existing style). Pure logic modules are tested in isolation; UI tests use `node --check` and DOM stubs. The `e2e-music-panel.js` script under `scripts/` is an Electron-driven E2E check (`npm.cmd run e2e:music`).

## Additional Documentation

- `docs/TECHNICAL.md` — full module ownership table, data flow diagrams, persistence fields, and test group list.
- `docs/superpowers/plans/2026-06-27-deskpet-zh-iteration.md` — historical implementation plan for the Chinese-language iteration (i18n menus, daily greeting, focus timer, mouse-react, daily state).