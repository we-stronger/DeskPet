# DeskPet Architecture

## Ownership

```text
Electron main process
  main.js
    -> native pet window, feature IPC, persistence orchestration
  main/window-manager.js
    -> settings, chat, music, and search window lifecycle
  main/menu-runtime.js
    -> tray menu refresh from current settings
  main/focus-system.js
    -> native focus notification and resume reconciliation
  main/ipc/settings-ipc.js
    -> normalized settings read/write boundary

Preload bridge
  preload.js
    -> explicit, context-isolated renderer IPC APIs

Renderer
  renderer.js
    -> composition root only
  focus-runtime.js
    -> focus subscriptions and persistence
  music-status-runtime.js
    -> audio state and seek lifecycle
  pet-interaction-runtime.js
    -> pointer, drag, tap, and focus restoration
  widget-runtime.js
    -> widget state, presentation, and drag persistence
```

## Data Boundaries

- Main owns disk persistence and native Windows/Electron APIs.
- Preload exposes only declared IPC methods; renderer code has no Node access.
- Renderer runtimes receive dependencies instead of importing Electron globals, so
  they can be tested with Node fakes.
- `renderer.js` composes the runtimes and retains DOM-specific rendering only.
- Music playback state is persisted separately from pet settings. Chat and NetEase
  credentials remain in Electron user data, never in the repository or package.

## Maintenance Rules

1. Add feature logic to a focused module before extending `renderer.js` or `main.js`.
2. Write a Node test before changing a runtime boundary or persistent state contract.
3. Keep styles in the scoped files under `src/renderer/styles/`; use the runtime
   style manager for dynamic presentation values.
4. Run `npm.cmd test`, `npm.cmd run smoke`, and `npm.cmd run audit:release` before a release.
5. Release portable builds as a ZIP of the unpacked application folder, never as a
   bare executable.
