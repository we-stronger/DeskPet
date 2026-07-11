# Chat Memory And Music Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the pet's music animation after temporary interruptions and add persistent remembered chat with compression plus a window-scoped temporary chat mode.

**Architecture:** A new main-process chat memory store and controller own persisted recent messages, summary text, and structured long-term facts under Electron `userData`. The renderer chat window becomes a thin UI over IPC-backed remembered chat, while temporary mode keeps window-local state only. The pet renderer adds a single action-recovery path so drag and temporary animations resume `music`, `sleep`, or `idle` consistently.

**Tech Stack:** Electron IPC, CommonJS, browser JavaScript, Node `fs`, Node built-in test runner

---

### Task 1: Add The Chat Memory Store

**Files:**
- Create: `src/chat/chat-memory-store.js`
- Test: `test/chat-memory-store.test.js`

- [ ] **Step 1: Write the failing store tests**

Cover:
- default empty state when the file is missing
- normalization of `profile`, `summary`, `recentMessages`, and `stats`
- atomic save/load round-trip
- corrupt JSON fallback
- clearing recent history while preserving long-term memory
- clearing the whole memory state

- [ ] **Step 2: Run the focused store tests and verify failure**

Run: `node --test test/chat-memory-store.test.js`

Expected: FAIL because `src/chat/chat-memory-store.js` does not exist yet.

- [ ] **Step 3: Implement the store**

Export:
- `defaultChatMemoryState`
- `normalizeChatMemoryState`
- `loadChatMemoryState`
- `saveChatMemoryState`
- `clearRecentChatMemory`
- `clearAllChatMemory`

Persist with `writeFileSync(tmp)` + `renameSync`, matching existing store behavior in this repo.

- [ ] **Step 4: Run the focused store tests**

Run: `node --test test/chat-memory-store.test.js`

Expected: PASS.

### Task 2: Add The Chat Memory Controller And IPC

**Files:**
- Create: `src/chat/chat-memory-controller.js`
- Modify: `src/main.js`
- Modify: `src/preload.js`
- Test: `test/chat-memory-controller.test.js`

- [ ] **Step 1: Write failing controller tests**

Cover:
- remembered mode builds context from system prompt, long-term memory, summary, recent messages, and the current user message
- temporary mode only uses the in-window temporary history plus the current user message
- remembered mode persists user and assistant replies
- threshold overflow triggers compression and preserves the newest raw turns
- compression failure falls back without breaking the chat response
- clear-recent preserves `profile`
- clear-all resets everything

- [ ] **Step 2: Run the focused controller tests and verify failure**

Run: `node --test test/chat-memory-controller.test.js`

Expected: FAIL because the controller module and IPC behavior do not exist yet.

- [ ] **Step 3: Implement the controller**

Add a controller that:
- reads and writes `chat-memory-state.json` under `app.getPath("userData")`
- exposes remembered chat submission
- builds the model input in the order defined by the spec
- appends new turns into `recentMessages`
- triggers compression when message-count or text-size thresholds are exceeded
- calls a pluggable summarizer function for compression
- falls back to a simple text summary when compression fails

- [ ] **Step 4: Wire main-process IPC**

Add handlers in `src/main.js` and bridge methods in `src/preload.js` for:
- `chat:get-state`
- `chat:set-mode`
- `chat:send`
- `chat:clear-recent`
- `chat:clear-all`
- `chat:get-memory-summary`

Keep the old `llm:chat` path untouched for any existing callers not migrated by this feature.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/chat-memory-controller.test.js test/llm-client.test.js`

Expected: PASS.

### Task 3: Update The Chat Window For Remembered And Temporary Modes

**Files:**
- Modify: `src/renderer/chat.html`
- Modify: `src/renderer/chat.js`
- Modify: `src/renderer/styles.css`
- Test: `test/chat-ui-memory-mode.test.js`

- [ ] **Step 1: Write failing chat UI tests**

Assert that the chat window now contains:
- remembered/temporary mode controls
- a visible mode description
- clear temporary session action
- clear remembered history action
- clear all memory action
- long-term summary entry point

Also assert:
- temporary mode keeps multi-turn history in renderer memory
- switching back to remembered mode reloads persisted chat state from the bridge

- [ ] **Step 2: Run the focused UI tests and verify failure**

Run: `node --test test/chat-ui-memory-mode.test.js`

Expected: FAIL because the current chat window has only the send form and bubble toggle.

- [ ] **Step 3: Implement the renderer UI**

Change `chat.js` to:
- fetch remembered state on boot
- render remembered history from main-process state
- keep a separate in-memory array for temporary mode
- submit messages through the new `deskpet.sendChatMessage(...)` bridge
- switch modes without mixing remembered history and temporary history

Update `chat.html` and `styles.css` so the new controls fit the existing quiet utility look of the window.

- [ ] **Step 4: Run focused UI tests**

Run: `node --test test/chat-ui-memory-mode.test.js`

Expected: PASS.

### Task 4: Restore Music Animation After Interruptions

**Files:**
- Modify: `src/renderer/renderer.js`
- Test: `test/renderer-music-recovery.test.js`

- [ ] **Step 1: Write failing renderer recovery tests**

Cover:
- drag end restores `music` when the audio player reports `playing`
- drag end restores `sleep` when the pet is sleeping and no music is playing
- drag end restores `idle` otherwise
- temporary visual feedback timeout uses the same recovery logic instead of hard-coded `idle`

- [ ] **Step 2: Run the focused renderer tests and verify failure**

Run: `node --test test/renderer-music-recovery.test.js`

Expected: FAIL because the renderer currently hard-codes `play("idle")` after drag and temporary actions.

- [ ] **Step 3: Implement the recovery helper**

Add a single helper in `renderer.js` that decides the post-interruption action in this order:
- `music` when local audio is currently playing
- `sleep` when the pet state is sleeping
- `idle` otherwise

Use the helper in drag end and temporary-action expiry paths.

- [ ] **Step 4: Run focused renderer tests**

Run: `node --test test/renderer-music-recovery.test.js test/audio-player.test.js`

Expected: PASS.

### Task 5: Full Verification

**Files:**
- Modify only if verification reveals a regression.

- [ ] **Step 1: Run syntax checks**

Run: `node --check src/chat/chat-memory-store.js`

Run: `node --check src/chat/chat-memory-controller.js`

Run: `node --check src/renderer/chat.js`

Run: `node --check src/renderer/renderer.js`

Expected: all commands exit 0.

- [ ] **Step 2: Run the full test suite**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 3: Run Electron smoke**

Run: `npm.cmd run smoke`

Expected: exits 0 and logs `renderer loaded`.
