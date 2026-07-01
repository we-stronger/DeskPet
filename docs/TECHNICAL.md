# Technical Documentation

This document describes the current Desk Pet codebase after cleanup. It focuses on runtime structure, module ownership, data flow, and test coverage.

## Runtime Overview

Desk Pet is an Electron app with three layers:

1. Main process: owns the native window, tray, persistent settings, and IPC handlers.
2. Preload bridge: exposes a small safe API from Electron IPC to the renderer.
3. Renderer: plays PNG frame sequences, handles pointer interaction, displays settings UI, and manages pet behavior state.

The renderer loads frames from `frames/<action>/<action>_<nn>.png`. The window remains fixed at 512x512; user size changes only affect the rendered pet image inside the fixed transparent window. This prevents the previous left-click and drag growth bug from returning.

## Important Paths

| Path | Purpose |
| --- | --- |
| `src/main.js` | Electron main process entrypoint. Creates the transparent pet window, tray menu, context menu, settings persistence, and IPC handlers. |
| `src/preload.js` | Context-isolated IPC bridge exposed as `window.deskpet`. |
| `src/pet-settings-store.js` | Loads, normalizes, and saves persisted settings. |
| `src/pet-menu-template.js` | Builds context and tray menu templates. |
| `src/window-position.js` | Clamps saved startup positions onto a visible display. |
| `src/window-move-policy.js` | Computes active movement and reports blocked edges for walk turn-around. |
| `src/window-size-policy.js` | Defines and enforces the fixed 512x512 Electron window size. |
| `src/renderer/index.html` | Renderer DOM: pet image, mood bubble, and settings panel. |
| `src/renderer/styles.css` | Transparent stage, pet visual positioning, settings panel, and mood bubble styles. |
| `src/renderer/renderer.js` | Renderer orchestration: animation playback, pointer events, commands, settings UI, state saving, and auto behavior. |
| `src/renderer/action-config.js` | Frame counts, fps, looping, and next-action rules. |
| `src/renderer/animation-controller.js` | Pure animation state machine and frame path builder. |
| `src/renderer/pet-state-controller.js` | Pet mood, affinity, energy, sleep, combo, Feed/Pet, and auto action decisions. |
| `src/renderer/pet-settings.js` | Percentage helpers and per-action display scale corrections. |
| `src/renderer/pet-visual-style.js` | Computes explicit pet image box dimensions without CSS transform scaling. |
| `src/renderer/hold-visual-lock.js` | Freezes the visual box while the pointer is held to prevent growth during click/drag. |
| `src/renderer/drag-controller.js` | Classifies pointer movement into click, drag-start, drag-move, and drag-end. |
| `src/renderer/pointer-action-policy.js` | Maps pointer classifications to visual actions. |
| `src/renderer/walk-movement.js` | Produces walk movement steps and flips direction when the main process reports a horizontal edge. |
| `src/renderer/mood-bubble.js` | Maps actions to compact bubble text. |
| `scripts/start-electron.js` | Starts Electron with app-safe launch arguments. |
| `scripts/electron-launch-options.js` | Keeps smoke-test CLI flags in the app argument space. |
| `frames/` | Final runtime PNG frame sequences only. |
| `test/` | Node `node:test` coverage for core behavior and policies. |

## Main Process Data Flow

1. `src/main.js` sets Electron `userData` to `.runtime/user-data`.
2. `loadPetSettings()` reads `.runtime/user-data/deskpet-settings.json` or returns defaults.
3. `createPetWindow()` creates a fixed 512x512 transparent, frameless window.
4. Startup position is normalized by `clampPositionToVisibleArea()`.
5. After renderer load, main sends:
   - `settings:<json>`
   - `size:<percent>`
   - `speed:<percent>`
   - `pet-state:<json>`
6. Renderer sends updates through `settings:update`.
7. Main saves normalized settings and refreshes the tray menu.

## Renderer Data Flow

`renderer.js` coordinates the browser-side app:

1. Creates `AnimationController`, `DragController`, `PetStateController`, and `WalkMovementRunner`.
2. `renderFrame()` sets the current PNG path and applies an explicit pixel box with `applyPetVisualStyle()`.
3. Pointer down locks the current visual box and pauses timers.
4. Pointer move starts drag mode after threshold and moves the native window through IPC.
5. Pointer up classifies tap vs drag-end, updates pet state, shows bubbles, and resumes timers.
6. Idle timer calls `petState.tick()` to trigger sleep, walk, happy, or pout.
7. Settings panel input updates renderer state and persists settings through IPC.

## Pet State Rules

`PetStateController` owns non-visual pet logic:

- `mood`: 0 to 100.
- `affinity`: 0 to 999.
- `energy`: 0 to 100.
- `sleeping`: boolean.
- `tapCombo`: transient rapid-click count, not persisted.

Interaction effects:

| Interaction | Effect |
| --- | --- |
| tap | Increases mood and affinity, costs energy, increments combo. |
| repeated tap | At high combo, returns `pout`. |
| feed | Restores energy, slightly increases mood and affinity. |
| pet | Increases mood and affinity, costs minimal energy. |
| happy | Increases mood and affinity, costs energy. |
| pout | Lowers mood and affinity, costs energy. |
| sleep tick | Recovers energy. |

## Asset Contract

Every action configured in `src/renderer/action-config.js` must have matching files:

```text
frames/<action>/<action>_01.png
frames/<action>/<action>_02.png
...
```

The current actions and counts are:

| Action | Count |
| --- | ---: |
| idle | 8 |
| blink | 4 |
| tap | 6 |
| happy | 8 |
| sleep | 6 |
| walk | 8 |
| pout | 6 |
| drag | 4 |

Note: `drag` is configured as one held frame in `action-config.js` to keep drag visuals stable. Extra drag frames remain available for future animation changes.

## Persistence

Settings are normalized by `src/pet-settings-store.js` before saving. Persisted fields:

- `sizePercent`
- `speedPercent`
- `position`
- `alwaysOnTop`
- `petState`
- `autoBehaviorEnabled`
- `autoWalkEnabled`
- `opacityPercent`

Runtime files under `.runtime/` are generated and ignored by git.

## Tests

Run all tests:

```powershell
npm.cmd test
```

Run Electron smoke:

```powershell
npm.cmd run smoke
```

Test groups:

- Animation and frame path behavior.
- Pointer and drag classification.
- Visual size stability.
- Pet state and interaction rules.
- Menu construction.
- Settings normalization and persistence.
- Window size, position, and movement policies.
- Electron launch argument handling.

## Cleanup Notes

The repository now keeps only final runtime assets. Removed items include:

- Historical sprite sheet source images.
- Split manifests and split reports.
- Python split scripts and tests.
- Generated backup folders.
- Runtime cache directories.
- Old planning/spec documents generated during development.

If new frame sheets are generated later, split them outside the app directory or copy only the final PNG sequence into `frames/<action>/`.
