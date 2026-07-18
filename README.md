# Desk Pet

A transparent Electron desktop pet that plays PNG sequence animations from `frames/` and supports lightweight interaction, persistent settings, and automatic behavior.

## Quick Start

Install dependencies once:

```powershell
npm.cmd install
```

Run the pet:

```powershell
npm.cmd start
```

Run tests:

```powershell
npm.cmd test
npm.cmd run smoke
npm.cmd run audit:release
```

Build Windows installer and portable releases:

```powershell
npm.cmd run dist:win
```

PowerShell may block `npm.ps1` on some Windows machines. Use `npm.cmd` as shown above.

## Current Features

- Transparent always-on-top desktop pet window with a fixed 760x760 interaction canvas.
- PNG sequence animations: idle, blink, tap, happy, sleep, walk, pout, and drag.
- Left click tap feedback.
- Rapid tap combo tracking; too many quick taps trigger pout feedback.
- Drag the pet window without visual growth or scaling drift.
- Right-click context menu for actions, Feed, Pet, music, settings, reset, and quit.
- Feed restores energy and increases affinity.
- Pet improves mood and affinity.
- Mood bubbles for interaction feedback: tap, happy, sleep, pout, feed, and pet.
- Automatic behavior based on mood, affinity, energy, and idle time.
- Automatic walking with screen-edge turn-around and left-facing mirror.
- Sleep mode after long idle time or low energy; sleep recovers energy.
- Focus companion with configurable focus/short-break/long-break cycles, manual phase transitions, and persistent completed/interrupted records.
- Draggable date/time widget.
- Built-in NetEase Cloud Music panel with search, playlists, private FM, QR login, and logout.
- In-pet music playback with lyric fetching, lyric translation display, and queue-aware previous/next controls.
- Draggable music status bar with play/pause, previous, next, music panel, account panel, and NetEase action buttons.
- Music status bar appearance settings for lyric color, lyric size, and control button size.
- AI chat window with locally stored ZhipuAI / GLM settings.
- Settings panel for size, speed, opacity, focus durations, lyric style, and AI credentials.
- Settings panel also shows mood, energy, affinity, current action, combo, streak, and focus status.
- Tray menu for recovery actions if the pet is hidden or paused.
- Tray quick controls for the active focus session, music panel, clock/focus visibility, and independent click-through settings.
- Shared widget collision coordination for the clock, focus indicator, and music status bar.
- Animation frame preloading to reduce transition flashes during action changes.
- Persistent settings stored in Electron's per-user `userData` directory in both development and packaged builds.

## Focus Companion

The focus cycle never starts the next phase automatically. After a focus or break
finishes, Desk Pet enters a waiting state and asks the user to start the suggested
short break, long break, or next focus round. The default cycle is four focus
rounds before a long break, and all durations and the round count are configurable.

- Start, pause, resume, interrupt, skip, and reset controls are available from the pet, context menu, and tray.
- Ending a focus early can require confirmation and is stored as an interrupted record instead of a completed round.
- Completed focus, interrupted focus, and break records remain distinct in history and statistics.
- Active and paused sessions persist using wall-clock end times. Restarting or resuming Windows reconciles elapsed time and restores the correct waiting state.
- Phase completion can trigger a pet reaction, a status bubble, and a non-focusing system notification.
- Dragging the pet temporarily takes priority over focus animation; releasing it restores the focus-appropriate action.

## Project Structure

```text
DeskPet/
  frames/                 Runtime PNG animation frames only
    idle/                 idle_01.png ... idle_08.png
    blink/                blink_01.png ... blink_04.png
    tap/                  tap_01.png ... tap_06.png
    happy/                happy_01.png ... happy_08.png
    sleep/                sleep_01.png ... sleep_06.png
    walk/                 walk_01.png ... walk_08.png
    pout/                 pout_01.png ... pout_06.png
    drag/                 drag_01.png ... drag_04.png
  src/
    main.js               Electron entrypoint and feature-specific IPC
    main/                 Reusable native-window, tray, focus, and IPC runtimes
    renderer/             Pet, widget, focus, music, and chat browser runtimes
    music/                NetEase API client, login, playback, and persistence
  scripts/                Node launch helpers
  test/                   Node test suite
  docs/                   Architecture, build, and maintenance notes
  photo.png               Tray icon source
  package.json            npm scripts and dependency metadata
```

## Frame Assets

Runtime frames live in `frames/<action>/<action>_<nn>.png`.

| Action | Frames | Notes |
| --- | ---: | --- |
| idle | 8 | Default loop |
| blink | 4 | One-shot, returns to idle |
| tap | 6 | Click feedback |
| happy | 8 | One-shot positive feedback |
| sleep | 6 | Loop, rendered at reduced action scale |
| walk | 8 | Loop, moves the window and mirrors when walking left |
| pout | 6 | One-shot annoyed feedback |
| drag | 4 | Runtime currently holds the first drag frame for stable dragging |

Historical sprite sheets, split manifests, generated reports, and backup folders have been removed. Add new runtime frames directly under the relevant action folder, or regenerate externally and copy only the final PNG sequence into `frames/`.

## Verification

Use the normal test suite after code or asset changes:

```powershell
npm.cmd test
npm.cmd run smoke
```

`npm.cmd run smoke` starts Electron in smoke-test mode and exits after the renderer loads. Windows may print Chromium `os_crypt` warnings; those are not app failures if the smoke log says `renderer loaded`.

`npm.cmd run audit:release` checks the files selected for the Electron package for
credential values, runtime data, and machine-specific paths without printing secret
contents. The `pack`, `dist`, and `dist:win` commands run this audit before packaging.

## Packaging

Installer and portable output are written to `release/`:

```powershell
npm.cmd run pack      # audited unpacked app for local inspection
npm.cmd run dist:win  # NSIS installer + portable distribution
```

Portable releases are distributed as a ZIP archive containing the complete
unpacked application folder. Extract the folder before launching `DeskPet.exe`;
it does not require Node.js or a separate runtime installation. User settings,
encrypted NetEase session data, and local AI credentials remain outside the
packaged application.

See `docs/BUILD.md` for packaging details and packaged data paths.
