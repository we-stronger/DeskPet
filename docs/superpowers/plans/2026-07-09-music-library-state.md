# Music Library State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix NetEase heart toggling, persist editable playback history, expose the shared playback queue, and require confirmation before playlist deletion.

**Architecture:** A new main-process JSON store owns playback state and synchronizes renderer windows through IPC. NetEase song-like APIs provide normal heart semantics with the liked playlist mutation endpoint as a compatibility fallback.

**Tech Stack:** Electron IPC, CommonJS, browser JavaScript, Node `fs`, Node built-in test runner

---

### Task 1: Correct NetEase Like Semantics

**Files:**
- Modify: `src/music/netease-client.js`
- Modify: `src/music/music-controller.js`
- Test: `test/netease-client.test.js`
- Test: `test/music-extras.test.js`

- [ ] **Step 1: Write failing client tests**

Add tests asserting that `likeSong` posts `trackId`, `userid`, and `like` to `/api/song/like` without the `os=pc` cookie addition, and that `checkLikedSongs` posts song IDs to `/api/song/like/check`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --test test/netease-client.test.js test/music-extras.test.js`

Expected: FAIL because the client still calls `/weapi/radio/like` and has no liked-state check.

- [ ] **Step 3: Implement the client and controller behavior**

Preserve `specialType` in normalized playlists, call the song-like endpoints, and let the controller fall back to `manipulatePlaylistTracks` against the `specialType=5` playlist when the primary mutation fails.

- [ ] **Step 4: Run the focused tests**

Run: `node --test test/netease-client.test.js test/music-extras.test.js`

Expected: PASS.

### Task 2: Add The Persistent Playback Store

**Files:**
- Create: `src/music/music-playback-store.js`
- Modify: `src/main.js`
- Modify: `src/preload.js`
- Create: `test/music-playback-store.test.js`

- [ ] **Step 1: Write failing store tests**

Cover empty defaults, queue normalization, mode validation, 100-entry history limit, unique most-recent history ordering, atomic save/load, individual history deletion, and clear-all.

- [ ] **Step 2: Run the store tests and verify failure**

Run: `node --test test/music-playback-store.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the store**

Export `normalizePlaybackState`, `loadPlaybackState`, `savePlaybackState`, `removeHistoryEntry`, and `clearHistory`. Store fields are `mode`, `queue`, `currentIndex`, and `history`; history items include `playedAt`.

- [ ] **Step 4: Add IPC**

Register `music:playback-state:get`, `music:playback-state:update`, `music:playback-history:remove`, and `music:playback-history:clear`. Broadcast normalized changes to live pet and music windows.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/music-playback-store.test.js test/renderer-script-loading.test.js`

Expected: PASS.

### Task 3: Synchronize Playback Service State

**Files:**
- Modify: `src/renderer/music-playback-service.js`
- Modify: `src/renderer/renderer.js`
- Test: `test/music-playback-service.test.js`
- Test: `test/settings-live-sync.test.js`

- [ ] **Step 1: Write failing synchronization tests**

Test hydration from persisted state, persistence after successful playback, mode persistence without restarting audio, history removal, and queue import before automatic next/previous controls.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test test/music-playback-service.test.js test/settings-live-sync.test.js`

Expected: FAIL because the service only holds module-local state.

- [ ] **Step 3: Implement synchronization methods**

Add `hydratePlaybackState`, `syncPlaybackState`, `removeHistoryItem`, and `clearHistory`. Persist queue/history after successful playback and persist mode immediately. Subscribe to main-process state broadcasts.

- [ ] **Step 4: Synchronize pet controls**

Before automatic end-of-track advance and explicit previous/next commands, hydrate the pet renderer service from the main-process state.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/music-playback-service.test.js test/settings-live-sync.test.js`

Expected: PASS.

### Task 4: Add Queue And Editable History UI

**Files:**
- Modify: `src/renderer/music-search-view.js`
- Modify: `src/renderer/music-panel.js`
- Modify: `src/renderer/music.html`
- Modify: `src/renderer/music.js`
- Modify: `src/renderer/styles.css`
- Test: `test/music-search-ui.test.js`

- [ ] **Step 1: Write failing UI contract tests**

Assert that both windows expose queue/history actions, current and next markers, replay controls, per-entry history delete, and confirmed clear-all.

- [ ] **Step 2: Run the UI tests and verify failure**

Run: `node --test test/music-search-ui.test.js`

Expected: FAIL because queue views and history mutation controls are absent.

- [ ] **Step 3: Implement shared list rendering**

Render playback lists with explicit variants: queue rows show current/next labels; history rows show replay and trash icon actions. Keep controls stable at narrow panel widths.

- [ ] **Step 4: Bind both renderer surfaces**

Load persisted state before rendering queue/history, play selected queue/history rows through the existing playback service, remove history rows only after a successful store update, and confirm clear-all.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/music-search-ui.test.js test/music-playback-service.test.js`

Expected: PASS.

### Task 5: Confirm Playlist Song Deletion

**Files:**
- Modify: `src/renderer/music-panel.js`
- Modify: `src/renderer/music.js`
- Modify: `src/renderer/styles.css`
- Test: `test/music-search-ui.test.js`

- [ ] **Step 1: Write failing confirmation tests**

Assert that compact and standalone delete handlers request confirmation before invoking `manipulatePlaylistTracks`, include the song name, and do not remove the row on cancel or API failure.

- [ ] **Step 2: Run the UI tests and verify failure**

Run: `node --test test/music-search-ui.test.js`

Expected: FAIL because deletion currently calls the API immediately.

- [ ] **Step 3: Implement confirmation dialogs**

Use a compact native `<dialog>` with cancel and destructive confirm actions. Populate song and playlist names via `textContent`; invoke the existing delete request only from the confirm action.

- [ ] **Step 4: Run focused tests**

Run: `node --test test/music-search-ui.test.js`

Expected: PASS.

### Task 6: Full Verification

**Files:**
- Modify only if verification reveals a regression.

- [ ] **Step 1: Run syntax checks**

Run: `node --check src/music/music-playback-store.js`

Run: `node --check src/music/netease-client.js`

Run: `node --check src/renderer/music-playback-service.js`

Run: `node --check src/renderer/music-panel.js`

Run: `node --check src/renderer/music.js`

Expected: all commands exit 0.

- [ ] **Step 2: Run all tests**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 3: Run Electron music E2E**

Run: `npm.cmd run e2e:music`

Expected: exits 0 with music panel renderer loaded and no fatal error.

- [ ] **Step 4: Run Electron smoke**

Run: `npm.cmd run smoke`

Expected: exits 0 and logs `renderer loaded`.
