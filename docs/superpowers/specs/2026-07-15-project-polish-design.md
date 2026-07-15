# DeskPet Balanced Project Polish Design

**Date:** 2026-07-15

## Objective

Improve DeskPet's visible layout, interaction quality, maintainability, repository structure, and release hygiene without replacing Electron, rewriting the NetEase protocol layer, or breaking persisted user data.

The selected direction is a balanced refactor: preserve mature behavior and data contracts, redesign high-friction UI surfaces, extract high-change responsibilities from oversized files, remove reproducible or obsolete files, update documentation, and rebuild only the final installer and portable executable.

## Success Criteria

1. The desktop layer remains lightweight and does not obscure the pet or work area.
2. Settings use one clear navigation hierarchy with no configuration hidden in history views or context-menu subtrees.
3. Music playlists, focus controls, and asynchronous operations have consistent spacing, states, and feedback.
4. `renderer.js`, `styles.css`, and `main.js` lose clearly bounded responsibilities without changing public IPC or persisted data formats.
5. All files removed from the repository or workspace are either reproducible, obsolete, ignored local references, or proven unreferenced.
6. The final `release/` directory contains only a newly built Windows installer and a newly built single-file portable executable.
7. Unit, contract, smoke, E2E, release-audit, and packaged-artifact checks pass.

## Scope

### Included

- Desktop widget layout, control spacing, bubbles, empty states, and feedback hierarchy.
- Standalone settings navigation and section layout.
- Embedded and standalone NetEase panel playlist presentation.
- Focus configuration and session-control presentation.
- Shared asynchronous operation feedback.
- Targeted extraction from renderer, main-process, and stylesheet hotspots.
- Dead-file and generated-output cleanup.
- README, build, architecture, and repository-structure documentation.
- Fresh Windows installer and portable builds.

### Excluded

- Replacing Electron or the current plain JavaScript renderer stack.
- Reimplementing NetEase encryption, authentication, or playback protocols.
- Changing saved settings, encrypted cookies, chat memory, playback history, or focus-history formats.
- Adding a new backend service or bundled personal API configuration.
- A complete visual rebrand or replacement of pet frame assets.

## Experience Design

### Desktop Layer

The transparent desktop surface contains only the pet, short status bubbles, optional clock/focus widgets, and the music status bar. Complex controls and forms remain in dedicated windows.

- Chat replies remain separate from short status bubbles.
- Status bubbles anchor near the pet and avoid the music bar and screen edges.
- Music controls use stable icon buttons with equal hit areas and no hover-induced layout changes.
- Progress, current lyrics, and secondary lyrics use a predictable vertical order.
- Hidden, floating, and music-bar display modes stay mutually exclusive.
- Click-through changes pointer behavior only; it never hides a visible widget.

### Settings Center

The settings window uses one left navigation rail with these sections:

1. Appearance
2. Widgets
3. Music
4. Focus
5. AI
6. Data

Each section uses unframed rows separated by subtle dividers. Repeated nested cards are removed. A row contains a label and description on the left and the appropriate control on the right. Destructive data actions remain in the Data section and require confirmation.

Context and tray menus retain only frequent commands and visibility/click-through recovery actions. They do not duplicate full configuration forms.

### Music Panel

The panel follows a list-first operational layout:

- Compact account header with one login/account entry.
- Stable segmented navigation for search, playlists, recommendations, private FM, queue, and history.
- Playlist rows use a fixed cover size, title, song count, owner, and one clear open action.
- Playlist details expose play-all and shuffle at the section header rather than per-row duplication.
- Loading, success, authentication failure, unavailable music, and retry states use the same feedback component.
- Buttons enter a busy state during mutations to prevent duplicate requests.

### Focus Experience

The focus section presents task name, recent tasks, cycle durations, round count, companion behavior, and reminder settings in a single configuration surface.

Current-session controls remain available from the desktop widget, context menu, and tray. All surfaces consume the same focus snapshot and therefore share labels, disabled states, and manual-transition behavior.

### Feedback Rules

All asynchronous operations follow one state model:

- `idle`: normal command state.
- `pending`: command disabled with visible progress.
- `success`: concise confirmation that expires automatically.
- `error`: readable reason plus retry or recovery action where possible.

Console output remains diagnostic only. User-relevant failures must be visible in the relevant window without exposing cookies, API keys, or signed media URLs.

## Architecture Design

### Renderer Responsibilities

`renderer.js` remains the bootstrap and cross-feature coordinator, but high-change behavior moves behind focused modules:

- **Pet runtime:** animation selection, direct interactions, ambient recovery, and drag-release behavior.
- **Widget runtime:** registry, visibility, display mode, opacity, click-through, dragging, collision coordination, and persisted position updates.
- **Focus runtime:** controller wiring, session events, view rendering, notification requests, records, and settings synchronization.
- **Music status runtime:** audio-state subscription, status rendering, seek behavior, and compact controls.
- **Feedback runtime:** shared pending/success/error UI primitives for renderer windows.

Pure existing modules such as `FocusSessionController`, `FocusPetBridge`, `WidgetState`, and `MusicPlaybackService` retain their public contracts. Extraction is incremental: each new runtime receives dependencies explicitly and is covered by a focused test before renderer wiring changes.

### Main Process Responsibilities

`main.js` remains the Electron bootstrap. Low-coupling responsibilities move into main-process helpers:

- Window creation and reuse policy.
- Tray and context-menu refresh inputs.
- Focus notification and resume reconciliation.
- IPC registration grouped by pet/settings, music, chat, and system concerns.

Existing IPC channel names remain unchanged. Helpers receive `BrowserWindow`, stores, controllers, and callbacks as dependencies rather than importing mutable global state.

### Stylesheet Responsibilities

The current shared stylesheet is split by load surface and responsibility:

- Base tokens, reset, typography, and reusable controls.
- Pet stage, bubbles, and animation surface.
- Widgets and music status bar.
- Settings window.
- Music/search windows.
- Chat window.

Each HTML document loads base styles plus only the surface styles it needs. Runtime positioning continues through the CSP-safe runtime stylesheet manager; new inline style mutations are not introduced.

## Data Compatibility

No migration is required for current persisted data. The following contracts remain compatible:

- Pet settings and widget positions.
- Focus session and focus records.
- Music queue, history, login session, and liked-song state.
- Chat memory and AI endpoint/model configuration.

New UI-only preferences, if needed, are normalized with defaults in `pet-settings-store.js`. Unknown or malformed values fall back safely.

## Cleanup Policy

Deletion is evidence-based. Before deletion, references are checked in source, tests, scripts, package metadata, and documentation.

### Remove Before Rebuild

- Entire existing `release/` directory, including unpacked apps, audit copies, old ZIP files, blockmaps, builder diagnostics, and duplicate executables.
- Legacy `.runtime/` repository-local user-data directory after confirming current Electron `userData` is used.
- `.venv/` after removing the final unreferenced Python asset-processing script.
- Local `api-enhanced-main/` reference clone after replacing any remaining local references with upstream links.
- Ignored local agent/tool directories that have no product role.
- Obsolete probes, sprite-splitting tools, and unreferenced asset-generation scripts.
- Superseded generated implementation plans and specifications once their durable architecture information is incorporated into maintained documentation.

### Keep

- Runtime animation frames and application icons.
- Music E2E scripts referenced by package scripts.
- Release sensitive-data audit.
- Current tests and fixtures.
- README, BUILD, TECHNICAL, and the new maintained documentation index.
- Current design and implementation documents needed for active work.

### Final Release Contents

After verification, rebuild and retain only:

- `DeskPet-Setup-0.1.0.exe`
- `DeskPet-Portable-0.1.0.exe`

Temporary unpacked output and builder metadata are removed only after both retained artifacts pass audit and launch checks.

## Error Handling

- UI modules convert technical errors into consistent user-facing messages.
- Main-process optional notifications and tray refreshes fail without crashing the app.
- Extraction keeps fallback behavior until each new module is wired and tested.
- Cleanup stops if a candidate file has a runtime, test, package, or documented reference.
- Packaging stops on audit, test, or smoke failure; old release artifacts are not reused as substitutes.

## Verification

1. Focused tests for each extracted runtime and layout contract.
2. Full `npm.cmd test` run.
3. `npm.cmd run smoke` outside the filesystem sandbox.
4. Music panel and music-listen E2E checks where credentials/network availability permit.
5. `npm.cmd run audit:release` before packaging.
6. `npm.cmd run dist:win` for fresh installer and portable artifacts.
7. Inspect packaged file lists and run the release audit against final artifacts.
8. Launch both retained executables on the local Windows environment.
9. `git diff --check` and a final ignored/untracked-file audit.

## Implementation Order

1. Add regression contracts for layout, feedback, and module boundaries.
2. Introduce shared feedback and scoped style foundations.
3. Refine desktop widgets, settings, music panel, and focus layouts.
4. Extract renderer runtimes while preserving existing APIs.
5. Extract low-coupling main-process helpers and IPC registration.
6. Update maintained documentation and repository map.
7. Remove proven dead files and all old release output.
8. Run full verification, rebuild Windows artifacts, re-audit, and remove temporary packaging output.

