# First Phase Stability and Security Design

## Goal

Improve DeskPet reliability by making in-pet playback authoritative, preventing stale playback requests from overwriting newer state, classifying media errors, strengthening renderer security, and preventing credentials or local runtime data from entering releases.

## Scope

This phase covers playback request coordination, playback-state persistence boundaries, media error normalization, CSP/security checks, sensitive-data release audits, and text-encoding cleanup. It does not redesign the music UI, change the NetEase API contract, or add new playlist features.

## Architecture

The renderer music playback service remains the playback orchestrator. Each play request receives a monotonically increasing request id and an abort signal. Only the current request may update audio, lyrics, history, queue position, or user-visible status. A superseded request returns a normal cancellation result and never triggers browser/client fallback.

The in-pet audio host remains the primary playback path. Browser or NetEase client opening is treated as an explicit user action only. Automatic failure handling returns a normalized error category to the UI instead of launching another player. Main-process persistence continues to own durable playback state and must merge history defensively when renderer state is stale.

## Data Flow

1. Renderer receives a play command and cancels the previous request.
2. Renderer asks the main process for a fresh audio URL.
3. Renderer fetches lyrics only for the current request.
4. Renderer asks the audio host to play the URL with request metadata.
5. On success, the current request records history, queue position, and state.
6. On failure, the result is mapped to `auth`, `forbidden`, `not-found`, `network`, `cancelled`, or `unsupported`.
7. Main process persists only the accepted current state and broadcasts it to open windows.

## Error Contract

Playback results use this shape:

```js
{
  success: false,
  error: "forbidden",
  message: "The current song cannot be played right now",
  retryable: false,
  songId: "..."
}
```

The supported categories are:

- `auth`: login is required or the session expired.
- `forbidden`: the resource returned 403 or the account lacks permission.
- `not-found`: the resource or song does not exist.
- `network`: timeout, connection reset, or transport failure.
- `cancelled`: a newer request superseded the operation.
- `unsupported`: no compatible audio source is available.

## Security and Release Checks

- Add a strict CSP to every local renderer document.
- Keep `contextIsolation: true` and `nodeIntegration: false`.
- Avoid new `executeJavaScript` use; existing use is limited to the explicit web-player path.
- Add a testable audit helper that scans tracked and release-bound files for `.env`, cookies, `MUSIC_U`, API keys, runtime data, and machine-specific paths.
- Keep `.runtime`, `release`, `node_modules`, `api-enhanced-main`, and local guidance files ignored.

## Encoding Rules

All maintained source, HTML, CSS, Markdown, and user-facing strings must be UTF-8. Known mojibake in window titles, status messages, comments, and build documentation will be replaced with correct text. A text-integrity test will reject known mojibake markers.

## Testing

Before implementation, add failing tests for:

- a newer play request cancelling an older request;
- a cancelled request not writing history or queue state;
- HTTP 401, 403, 404 and transport failures mapping to the documented categories;
- direct playback failure not opening the browser/client automatically;
- strict CSP presence in every renderer HTML file;
- release audit rejection of credential and runtime-data patterns;
- absence of known mojibake markers in maintained files.

After implementation, run:

```powershell
npm.cmd test
npm.cmd run smoke
```
