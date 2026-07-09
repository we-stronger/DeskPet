# DeskPet Quality Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair corrupted Chinese text and remove duplicated renderer playback fallback logic without expanding DeskPet's music feature scope.

**Architecture:** Keep the main/preload IPC contract unchanged. Add a focused renderer playback helper that both the compact music panel and standalone music window call with injected dependencies.

**Tech Stack:** Electron, plain browser JavaScript modules loaded by script tags, Node `node:test`, Node `assert/strict`, PowerShell on Windows.

---

## Confirmed Design

This pass stabilizes the current implementation before adding more NetEase Cloud Music features.

Included:

- Replace mojibake Chinese strings in the music UI, related renderer helpers, comments, and tests with readable UTF-8 Chinese.
- Keep existing IPC channel names and NetEase endpoints unchanged.
- Extract shared renderer-side song playback policy so the in-pet music panel and standalone music window use the same fallback behavior.
- Add focused tests that fail on mojibake regressions and cover the shared playback policy.

Excluded:

- New NetEase APIs or music features.
- Major visual redesign of the panel or standalone window.
- Changes to the fixed 512x512 pet window policy.
- New runtime dependencies.

## File Structure

- Create `src/renderer/music-playback-service.js`: pure renderer helper attached as `window.DeskpetMusicPlaybackService`, also exportable under Node tests.
- Modify `src/renderer/index.html`: load `music-playback-service.js` after `audio-player.js` and before `music-panel.js`.
- Modify `src/renderer/music.html`: load `music-playback-service.js` before `music.js`; fix readable Chinese labels.
- Modify `src/renderer/music-panel.js`: replace duplicated fallback code with calls to the helper; fix readable Chinese UI text.
- Modify `src/renderer/music.js`: replace duplicated fallback code with calls to the helper; fix readable Chinese UI text.
- Modify `src/renderer/music-search-view.js` and `src/renderer/music-playlist-view.js`: fix readable Chinese render strings.
- Modify `src/music/netease-client.js` and `src/media-control.js`: fix mojibake comments and default display strings while preserving behavior.
- Modify tests under `test/`: add playback helper tests, add mojibake integrity test, and update existing Chinese assertions.

## Tasks

### Task 1: Add Failing Text Integrity Test

**Files:**
- Create: `test/text-integrity.test.js`

- [ ] **Step 1: Write the failing test**

Write a test that scans selected files for known mojibake markers: `缃戞槗`, `鎼滅储`, `姝屽崟`, `鐧诲綍`, `鈫`, `馃`, `鉁`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/text-integrity.test.js`

Expected: FAIL listing existing mojibake markers such as `缃戞槗`.

### Task 2: Add Failing Playback Helper Tests

**Files:**
- Create: `test/music-playback-service.test.js`

- [ ] **Step 1: Write tests for `playSongWithFallback(songId, deps)`**

Cover silent NetEase success, spawn-to-audio fallback, audio-unavailable-to-browser fallback, and empty ids.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/music-playback-service.test.js`

Expected: FAIL because `src/renderer/music-playback-service.js` does not exist yet.

### Task 3: Implement Shared Playback Helper

**Files:**
- Create: `src/renderer/music-playback-service.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/music.html`

- [ ] **Step 1: Add helper implementation**

Create `playSongWithFallback(songId, deps)` with injected `bridge`, `audioPlayer`, `setStatus`, and `logger`. Keep normal failures as returned objects.

- [ ] **Step 2: Load helper in renderer HTML**

Add `<script src="./music-playback-service.js"></script>` after `audio-player.js` in both the pet renderer and standalone music window.

- [ ] **Step 3: Run playback helper test**

Run: `node --test test/music-playback-service.test.js`

Expected: PASS.

### Task 4: Replace Duplicated Host Playback Code

**Files:**
- Modify: `src/renderer/music-panel.js`
- Modify: `src/renderer/music.js`

- [ ] **Step 1: Replace local fallback functions**

Use `root.DeskpetMusicPlaybackService.playSongWithFallback(id, { bridge, audioPlayer: root.DeskpetAudioPlayer, setStatus, logger: root.console })`.

- [ ] **Step 2: Preserve host-specific feedback**

Keep panel bubble messages in `music-panel.js`. Keep standalone status-only behavior in `music.js`.

- [ ] **Step 3: Run focused tests**

Run: `node --test test/music-playback-service.test.js test/renderer-script-loading.test.js`

Expected: PASS.

### Task 5: Repair Mojibake Text

**Files:**
- Modify: listed checked files from Task 1

- [ ] **Step 1: Convert corrupted Chinese text to readable UTF-8**

Examples:
- `缃戞槗浜戦煶涔?` -> `网易云音乐`
- `鎼滅储` -> `搜索`
- `姝屽崟` -> `歌单`
- `鐧诲綍` -> `登录`
- `鈫?杩斿洖` -> `← 返回`

- [ ] **Step 2: Update tests to assert readable Chinese**

Use strings such as `没有找到结果`, `晴天`, `叶惠美`, `可打开`, `返回歌单`.

- [ ] **Step 3: Run text integrity and renderer view tests**

Run: `node --test test/text-integrity.test.js test/music-views.test.js test/ui-redesign-contract.test.js`

Expected: PASS.

### Task 6: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run all tests**

Run: `npm.cmd test`

Expected: all Node tests pass.

- [ ] **Step 2: Run syntax checks if full suite exposes file-specific failures**

Run: `node --check src/renderer/music-panel.js`

Expected: no syntax errors.

## Self-Review

Spec coverage:
- Corrupted Chinese text is covered by Tasks 1 and 5.
- Duplicated playback policy is covered by Tasks 2 through 4.
- Existing IPC and feature scope remain stable because the plan changes only renderer helper wiring and text.

Placeholder scan:
- No TBD/TODO placeholders remain.

Type consistency:
- The helper API is consistently named `playSongWithFallback(songId, deps)` in tests and implementation tasks.
