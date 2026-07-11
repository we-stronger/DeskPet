# Music Library State Design

## Goal

Make liking, playback history, the active playback queue, and playlist deletion behave consistently in both the compact pet panel and the standalone music window.

## Root Cause

The current heart action calls `/weapi/radio/like`. That endpoint records preference feedback for private FM and is not the normal song-like operation. The bundled `api-enhanced-main` repository exposes `/api/song/like`, `/api/song/like/check`, and `/api/song/like/get` for the actual "My Likes" state.

Playback history and queue data currently live in module-level variables inside each renderer process. The pet window and standalone music window therefore have separate state, and all history disappears when the renderer exits.

## Architecture

Add a main-process `music-playback-store` backed by `music-playback-state.json` under Electron's `userData` directory. The store owns normalized queue, current index, playback mode, and up to 100 unique history entries. Atomic writes use a temporary file followed by rename, matching the existing settings store.

Expose read, update, history-delete, and history-clear IPC operations through preload. Renderer playback services keep a local cache for synchronous controls, but hydrate from and persist to the main-process store. State changes are broadcast to all music renderers so the pet and standalone window converge on one queue.

## Like Behavior

The client uses `/api/song/like` for adding and removing a heart and `/api/song/like/check` for rendering current state. If the mutation endpoint rejects an otherwise valid logged-in session, the controller locates the user's `specialType=5` liked playlist and performs the already verified playlist add/delete operation as a compatibility fallback.

Heart buttons render hollow when unliked and filled red when liked. Clicking toggles state without navigating away.

## History And Queue UI

Both music surfaces expose "Playback Queue" and "Playback History" entries.

- Queue rows mark the current song and the next song.
- Clicking a queue row starts that song without replacing the queue.
- History rows can be replayed or individually removed.
- History provides a clear-all command with confirmation.
- History is capped at 100 unique songs, most recent first.

## Playlist Deletion

Deleting a song from a NetEase playlist opens a confirmation dialog containing the song and playlist names. The API request is sent only after confirmation. Cancel leaves both remote data and the rendered row unchanged.

## Error Handling

Failed mutations keep the previous visual state and display the existing localized status message. Corrupt or missing playback-state files normalize to an empty queue and history. Persistence failures are reported to the caller without interrupting audio already playing.

## Verification

Unit tests cover state normalization and persistence, like endpoint selection and fallback behavior, renderer history/queue operations, and confirmation-before-delete. Existing music tests, full tests, music E2E, and Electron smoke tests run after implementation.
