# Technical Documentation

This document describes the current Desk Pet codebase after cleanup. It focuses on runtime structure, module ownership, data flow, and test coverage.

## Runtime Overview

Desk Pet is an Electron app with three layers:

1. Main process: owns the native window, tray, persistent settings, and IPC handlers.
2. Preload bridge: exposes a small safe API from Electron IPC to the renderer.
3. Renderer: plays PNG frame sequences, handles pointer interaction, displays settings UI, and manages pet behavior state.

The renderer loads frames from `frames/<action>/<action>_<nn>.png`. The window remains fixed at 760x760; user size changes only affect the rendered pet image inside the fixed transparent window. This prevents the previous left-click and drag growth bug from returning.

## Important Paths

| Path | Purpose |
| --- | --- |
| `src/main.js` | Electron main process entrypoint. Creates the transparent pet window, tray menu, context menu, settings persistence, and IPC handlers. |
| `src/main/window-manager.js` | Reuses auxiliary BrowserWindows and centralizes their ready/show/load lifecycle. |
| `src/main/menu-runtime.js` | Rebuilds the tray menu from the latest settings snapshot. |
| `src/main/focus-system.js` | Owns sanitized native focus notifications and Windows resume reconciliation. |
| `src/main/ipc/settings-ipc.js` | Registers normalized settings read/write IPC handlers. |
| `src/preload.js` | Context-isolated IPC bridge exposed as `window.deskpet`. |
| `src/pet-settings-store.js` | Loads, normalizes, and saves persisted settings. |
| `src/pet-menu-template.js` | Builds context and tray menu templates. |
| `src/window-position.js` | Clamps saved startup positions onto a visible display. |
| `src/window-move-policy.js` | Computes active movement and reports blocked edges for walk turn-around. |
| `src/window-size-policy.js` | Defines and enforces the fixed 512x512 Electron window size. |
| `src/renderer/index.html` | Renderer DOM: pet image, mood bubble, and settings panel. |
| `src/renderer/styles/` | Scoped base, pet, widget, music, chat, and settings styles. |
| `src/renderer/renderer.js` | Renderer orchestration: animation playback, pointer events, commands, settings UI, state saving, and auto behavior. |
| `src/renderer/action-config.js` | Frame counts, fps, looping, and next-action rules. |
| `src/renderer/animation-controller.js` | Pure animation state machine and frame path builder. |
| `src/renderer/pet-state-controller.js` | Pet mood, affinity, energy, sleep, combo, Feed/Pet, and auto action decisions. |
| `src/renderer/focus-session-controller.js` | Single source of truth for focus phases, manual transitions, wall-clock recovery, cycle progress, and focus history. |
| `src/renderer/focus-pet-bridge.js` | Maps focus events to priority-aware pet actions, quiet mode, and short status bubbles. |
| `src/renderer/focus-statistics.js` | Separates completed focus, interrupted focus, and breaks for summaries and cycle progress. |
| `src/renderer/focus-runtime.js` | Owns focus-controller subscriptions, persistence boundaries, and restored-session notifications. |
| `src/renderer/music-status-runtime.js` | Owns the audio-state subscription boundary and seek lifecycle. |
| `src/renderer/pet-interaction-runtime.js` | Coordinates drag classification, tap feedback, and focus action restoration. |
| `src/renderer/widget-runtime.js` | Provides shared visibility, presentation, drag, and persistence boundaries for widgets. |
| `src/renderer/operation-feedback.js` | Shared async loading, success, error, and retry feedback surface. |
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

1. Electron resolves its normal per-user `userData` directory (`desk-play-pet` in source runs and `DeskPet` when packaged).
2. `loadPetSettings()` reads `deskpet-settings.json` from that directory or returns defaults.
3. `createPetWindow()` creates a fixed 760x760 transparent, frameless window.
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

1. Creates `AnimationController`, `DragController`, `PetStateController`, `FocusRuntime`, `FocusPetBridge`, `PetInteractionRuntime`, `MusicStatusRuntime`, `WidgetRuntime`, and `WalkMovementRunner`.
2. `renderFrame()` sets the current PNG path and applies an explicit pixel box with `applyPetVisualStyle()`.
3. Pointer down locks the current visual box and pauses timers.
4. `PetInteractionRuntime` routes pointer movement through the action policy, starts drag mode after threshold, and moves the native window through IPC.
5. Pointer up restores the focus-aware ambient action, updates pet state for taps, shows bubbles, and resumes timers.
6. Idle timer calls `petState.tick()` to trigger sleep, walk, happy, or pout.
7. Settings panel input updates renderer state and persists settings through the normalized settings IPC runtime.

## Focus Session Flow

`FocusSessionController` owns the complete focus state. Renderer controls, context
menus, tray menus, history, statistics, and notifications consume its serializable
snapshot instead of maintaining separate timer flags.

Phases are `idle`, `focus`, `short-break`, `long-break`, `waiting-for-break`, and
`waiting-for-focus`. Timed phases can be `running` or `paused`; waiting phases do
not count down. Completion always enters a waiting phase, so the next timer starts
only after an explicit user command.

The persisted snapshot stores a version, phase, status, task, planned duration,
wall-clock `endsAt`, paused remaining time, completed round count, and suggested
break phase. A running timer that expires while the app is closed or Windows is
suspended is reconciled into the matching waiting phase once, without duplicating
history. The main process also sends `focus:reconcile` on `powerMonitor` resume.

`FocusPetBridge` applies behavior priorities in this order: ambient, focus,
interaction, phase completion, and drag. Revision tokens prevent stale one-shot
callbacks from restoring an older action. A drag release resolves the current
focus/music/sleep action again instead of always returning to idle.

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
- `focusDurationMinutes`, `breakDurationMinutes`, and `longBreakDurationMinutes`
- `focusRoundsBeforeLongBreak`
- `focusNotificationsEnabled`, `focusSoundEnabled`, `focusPetReactionsEnabled`, and `focusConfirmInterrupt`
- versioned `focusSession`
- normalized `focusRecords` with completed/interrupted/skipped outcomes

User data is never stored inside the application package or repository. Legacy
`.runtime/` content remains ignored and is not included in release artifacts.

## Tests

Run all tests:

```powershell
npm.cmd test
```

Run Electron smoke:

```powershell
npm.cmd run smoke
```

Run the release-sensitive-data audit with:

```powershell
npm.cmd run audit:release
```

Renderer documents use a strict local Content Security Policy. Playback requests
are coordinated so superseded requests cannot commit stale queue or history
state.

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
