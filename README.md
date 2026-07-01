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
```

PowerShell may block `npm.ps1` on some Windows machines. Use `npm.cmd` as shown above.

## Current Features

- Transparent always-on-top desktop pet window.
- PNG sequence animations: idle, blink, tap, happy, sleep, walk, pout, and drag.
- Left click tap feedback.
- Rapid tap combo tracking; too many quick taps trigger pout feedback.
- Drag the pet window without visual growth or scaling drift.
- Right-click context menu for actions, Feed, Pet, Settings, reset, and quit.
- Feed restores energy and increases affinity.
- Pet improves mood and affinity.
- Mood bubbles for interaction feedback: tap, happy, sleep, pout, feed, and pet.
- Automatic behavior based on mood, affinity, energy, and idle time.
- Automatic walking with screen-edge turn-around and left-facing mirror.
- Sleep mode after long idle time or low energy; sleep recovers energy.
- Settings panel for size, speed, opacity, automatic behavior, and automatic walking.
- Settings panel also shows mood, energy, affinity, current action, and combo.
- Tray menu for recovery actions if the pet is hidden or paused.
- Persistent settings stored in `.runtime/user-data/deskpet-settings.json`.

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
  src/                    Electron main, preload, and renderer code
  scripts/                Node launch helpers
  test/                   Node test suite
  docs/TECHNICAL.md       Code and architecture notes
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
