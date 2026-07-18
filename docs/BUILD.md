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
npm.cmd run pack          # audited unpacked build — release\win-unpacked\DeskPet.exe
npm.cmd run dist:win      # NSIS installer + Windows portable executable
```

`pack` is faster and good for verifying the build without generating installer
artifacts. The produced binary can be launched directly for smoke testing.

`dist:win` produces the installer and an Electron portable intermediate.

## Portable delivery

The supported portable release is a ZIP archive containing the complete audited
`win-unpacked` application folder, named `DeskPet-Portable-<version>-win.zip`.
Do not distribute a bare portable executable: users must extract the folder and
start `DeskPet.exe` inside it. The unpacked folder bundles Electron and does
not require Node.js on the target machine.

## What the installer does

Output: `release\DeskPet-Setup-<version>.exe` (NSIS) plus the portable ZIP
created from the audited unpacked application folder.

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

Before packaging, run `npm.cmd run audit:release` to check the actual package
inputs (`package.json`, `src`, and `frames`) for cookies, API credentials,
runtime files, and machine paths. `pack` and `dist:win` run this audit
automatically.

## Dev-mode vs packaged paths

The packaged build uses Electron's standard `app.getPath("userData")` which
resolves to `%APPDATA%\desk-play-pet\`. The legacy `.runtime/user-data/`
dev-only override was removed — it was unwritable inside `app.asar`.

The tray icon is loaded from `process.resourcesPath\photo.png` in packaged
builds (where electron-builder copies it via `extraResources`) and from
`photo.png` next to `package.json` in dev.
