# Building the DeskPet installer

This guide is for the developer who maintains DeskPet. End users only need the
built installer — they don't run these commands.

## Prerequisites

- Node.js 18 or newer
- Windows 10 / 11 (electron-builder can also produce installers for macOS /
  Linux, but this project is verified on Windows only)
- A clone of the repository with `npm.cmd install` already run

## Build commands

From the project root:

```powershell
npm.cmd run pack          # quick sanity build, no installer — release\win-unpacked\DeskPet.exe
npm.cmd run dist:win      # full installer build — release\DeskPet-Setup-0.1.0.exe
```

`pack` is faster and good for verifying the build works without paying
for the NSIS packaging step. The produced binary can be launched directly
for smoke testing.

`dist:win` produces the actual installer that ships to end users.

## What the installer does

Output: `release\DeskPet-Setup-0.1.0.exe` (NSIS, ~80–120 MB).

- Single per-user install (no admin required)
- Start Menu shortcut: **DeskPet**
- Desktop shortcut: **DeskPet**
- Optional desktop quick-launch
- Uninstaller under **Settings → Apps**
- Settings + NetEase session data are preserved on uninstall
  (`deleteAppDataOnUninstall: false`)

## End-user first-run

After installation, the only steps that need a Windows user action are:

1. **Pet** — appears immediately, no setup needed.
2. **Music** — clicking a song in the built-in music panel detects NetEase Cloud
   Music (if installed) and routes playback there silently. If NetEase isn't
   installed, the web URL fallback opens in the user's default browser. No
   configuration required.
3. **AI Chat (ZhipuAI / GLM)** — optional. Right-click the pet → ⚙ 设置 →
   🤖 AI 设置 → paste API key → 保存. The key is stored locally in
   `%APPDATA%\desk-play-pet\deskpet-settings.json`.

## Persistence paths

- **Settings** (LLM credentials, pet state, focus records, etc.):
  `%APPDATA%\desk-play-pet\deskpet-settings.json`
- **NetEase login cookie** (encrypted via Electron `safeStorage`):
  `%APPDATA%\desk-play-pet\netease-session.json`

Both survive uninstall and re-install.

## Dev-mode vs packaged paths

The packaged build uses Electron's standard `app.getPath("userData")` which
resolves to `%APPDATA%\desk-play-pet\`. The legacy `.runtime/user-data/`
dev-only override was removed — it was unwritable inside `app.asar`.

The tray icon is loaded from `process.resourcesPath\photo.png` in packaged
builds (where electron-builder copies it via `extraResources`) and from
`photo.png` next to `package.json` in dev.
