# Chat Memory Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Desk Pet remembered chat an editable, pin-aware long-term memory store with bounded context and a usable management surface, while keeping temporary chat completely non-persistent.

**Architecture:** Extend the existing file-backed chat state from version 1 to version 2 with normalized memory entries and compatibility-derived legacy profile fields. Keep persistence and LLM-context decisions in the main-process store/controller, expose narrow management IPC operations through the preload bridge, and keep the chat window as an IPC-driven view. The renderer never writes memory files directly.

**Tech Stack:** Electron, CommonJS, Node `fs`, browser JavaScript/CSS/HTML, Node built-in `node:test`.

**Git constraint:** The working tree already has unrelated uncommitted changes in `src/main.js`, `src/preload.js`, `src/renderer/chat.js`, `src/renderer/chat.html`, and `src/renderer/styles.css`. Preserve those changes. Do not use reset/checkout or create implementation commits unless staged hunks have been inspected and contain only this plan's changes.

---

### Task 1: Migrate The Store To Entry-Based Memory

**Files:**
- Modify: `src/chat/chat-memory-store.js`
- Modify: `test/chat-memory-store.test.js`

- [ ] **Step 1: Add failing version-2 and entry-normalization tests**

Add tests that lock the migration and user-editable entry behavior:

```js
test("normalizeChatMemoryState migrates legacy profile data into v2 entries", () => {
  const state = normalizeChatMemoryState({
    version: 1,
    profile: {
      relationshipTone: "warm",
      preferences: ["tea"],
      facts: ["works from home"],
      avoidances: ["spoilers"],
    },
  });

  assert.equal(state.version, 2);
  assert.deepEqual(state.memories.map(({ category, content, pinned }) => ({ category, content, pinned })), [
    { category: "relationship", content: "warm", pinned: false },
    { category: "preference", content: "tea", pinned: false },
    { category: "fact", content: "works from home", pinned: false },
    { category: "avoidance", content: "spoilers", pinned: false },
  ]);
});

test("memory entries are trimmed, deduplicated, capped, and rebuild the legacy profile", () => {
  const state = normalizeChatMemoryState({
    memories: [
      { id: "a", category: "preference", content: " Tea ", pinned: true },
      { id: "b", category: "preference", content: "tea", pinned: false },
      { id: "c", category: "fact", content: "likes music", pinned: false },
      { id: "d", category: "invalid", content: "discard", pinned: false },
    ],
  });

  assert.deepEqual(state.memories.map((memory) => memory.content), ["Tea", "likes music"]);
  assert.equal(state.memories[0].pinned, true);
  assert.deepEqual(state.profile.preferences, ["Tea"]);
  assert.deepEqual(state.profile.facts, ["likes music"]);
});
```

- [ ] **Step 2: Run the focused store test to verify the red state**

Run: `node --test test/chat-memory-store.test.js`

Expected: FAIL because the current store returns version 1 and has no `memories` field.

- [ ] **Step 3: Implement version-2 normalization and memory helpers**

In `src/chat/chat-memory-store.js`:

1. Change `defaultChatMemoryState.version` to `2` and add `memories: Object.freeze([])`.
2. Add constants:

```js
const MEMORY_CATEGORIES = new Set(["preference", "fact", "avoidance", "relationship"]);
const MAX_MEMORY_ITEMS = 64;
const MAX_MEMORY_CONTENT_LENGTH = 280;
const MAX_SUMMARY_LENGTH = 1600;
```

3. Add and export these pure helpers:

```js
function createMemoryId(index = 0) {
  return `memory-${Date.now().toString(36)}-${index}`;
}

function normalizeMemoryEntry(entry, index = 0) {
  if (!entry || typeof entry !== "object" || !MEMORY_CATEGORIES.has(entry.category)) return null;
  const content = typeof entry.content === "string" ? entry.content.trim().slice(0, MAX_MEMORY_CONTENT_LENGTH) : "";
  if (!content) return null;
  return {
    id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : createMemoryId(index),
    category: entry.category,
    content,
    pinned: entry.pinned === true,
    createdAt: normalizeIsoString(entry.createdAt),
    updatedAt: normalizeIsoString(entry.updatedAt),
  };
}
```

Implement `normalizeMemoryEntries(entries, legacyProfile)` by using `entries` when it is an array; otherwise build a source array from the version-1 profile in relationship/preference/fact/avoidance order. Normalize every entry, deduplicate on `${category}:${content.toLocaleLowerCase()}`, retain the first normalized occurrence, and stop at `MAX_MEMORY_ITEMS`. Implement `buildProfileFromMemories(memories, fallbackProfile)` so `displayName` comes from `normalizeProfile(fallbackProfile)`, the relationship field uses the first relationship entry, and preference/fact/avoidance fields are category-filtered content arrays. Truncate `summary.conversation` to `MAX_SUMMARY_LENGTH` in `normalizeSummary`.

4. Make `normalizeChatMemoryState` always produce version 2, call `normalizeMemoryEntries`, then rebuild `profile` from the normalized entries. Keep `displayName` from the legacy profile because it has no entry category in this phase.
5. Add store-level operations for controller reuse:

```js
function clearChatSummary(state) {
  return normalizeChatMemoryState({
    ...state,
    summary: { conversation: "", updatedAt: "" },
  });
}
```

Export `MEMORY_CATEGORIES`, `buildProfileFromMemories`, `clearChatSummary`, `normalizeMemoryEntries`, and `normalizeMemoryEntry` with the existing APIs.

- [ ] **Step 4: Add persistence and cleanup regression tests**

Extend the existing atomic save/load test so it saves at least one pinned version-2 entry and verifies its ID, category, timestamps, and pin state survive a round trip. Add a test that `clearRecentChatMemory` and `clearChatSummary` preserve `memories`, while `clearAllChatMemory` empties them.

- [ ] **Step 5: Run the focused store suite**

Run: `node --test test/chat-memory-store.test.js`

Expected: PASS.

### Task 2: Add Bounded, Pin-Aware Controller Behavior

**Files:**
- Modify: `src/chat/chat-memory-controller.js`
- Modify: `test/chat-memory-controller.test.js`

- [ ] **Step 1: Add failing controller tests for context ordering and entry lifecycle**

Add executable tests for these contracts:

```js
test("remembered context puts pinned entries before ordinary entries, summary, and raw turns", async () => {
  const harness = createMemoryHarness({
    memories: [
      { id: "pinned", category: "fact", content: "User likes tea", pinned: true },
      { id: "ordinary", category: "preference", content: "Calm music", pinned: false },
    ],
    summary: { conversation: "Discussed work stress." },
    recentMessages: [{ role: "assistant", content: "Earlier reply" }],
  });
  const calls = [];
  const controller = createChatMemoryController({
    statePath: "memory.json", loadState: harness.loadState, saveState: harness.saveState,
    chat: async (messages) => { calls.push(messages); return { success: true, content: "Reply" }; },
  });

  await controller.sendMessage({ mode: "remembered", text: "Question" });
  const context = calls[0][0].content;
  assert.ok(context.indexOf("User likes tea") < context.indexOf("Calm music"));
  assert.ok(context.indexOf("Calm music") < context.indexOf("Discussed work stress."));
  assert.ok(calls[0].some((message) => message.content === "Earlier reply"));
});

test("compression merges proposed entries without overwriting pinned content", async () => {
  const harness = createMemoryHarness({
    memories: [{ id: "fixed", category: "fact", content: "Works remotely", pinned: true }],
    recentMessages: [
      { role: "user", content: "one" }, { role: "assistant", content: "two" },
      { role: "user", content: "three" }, { role: "assistant", content: "four" },
    ],
  });
  const controller = createChatMemoryController({
    statePath: "memory.json", loadState: harness.loadState, saveState: harness.saveState,
    chat: async () => ({ success: true, content: "five" }),
    summarize: async () => ({ success: true, summary: "short", memories: [
      { category: "fact", content: "Works remotely" },
      { category: "preference", content: "Likes piano" },
    ] }),
    recentMessageLimit: 4, preserveRecentMessageCount: 2,
  });

  const result = await controller.sendMessage({ mode: "remembered", text: "latest" });
  assert.equal(result.state.memories.find((item) => item.id === "fixed").pinned, true);
  assert.ok(result.state.memories.some((item) => item.content === "Likes piano"));
});

test("temporary chat never reads or persists long-term entries", async () => {
  const harness = createMemoryHarness({ memories: [{ id: "fact", category: "fact", content: "Private", pinned: true }] });
  const calls = [];
  const controller = createChatMemoryController({
    statePath: "memory.json", loadState: harness.loadState, saveState: harness.saveState,
    chat: async (messages) => { calls.push(messages); return { success: true, content: "temp" }; },
  });

  await controller.sendMessage({ mode: "temporary", text: "hello", temporaryMessages: [] });
  assert.equal(calls[0].some((message) => message.content.includes("Private")), false);
  assert.equal(harness.read().memories[0].content, "Private");
});
```

Also add tests for `createMemory`, `updateMemory`, `deleteMemory`, `listMemories({ query, category })`, `clearSummary`, a missing ID returning `memory-not-found`, and a total context budget that keeps pinned entries and the newest user message.

- [ ] **Step 2: Run the focused controller test to verify the red state**

Run: `node --test test/chat-memory-controller.test.js`

Expected: FAIL because the controller currently exposes no entry CRUD, no list filtering, and no pin-aware context budget.

- [ ] **Step 3: Add context and memory-operation helpers**

In `src/chat/chat-memory-controller.js`, add bounded defaults:

```js
const DEFAULT_CONTEXT_CHARACTER_LIMIT = 5200;
const DEFAULT_SUMMARY_CHARACTER_LIMIT = 1600;
```

Add pure helpers that are exported for focused testing:

```js
function filterMemoryEntries(memories, { query = "", category = "" } = {}) {
  const needle = String(query).trim().toLocaleLowerCase();
  return memories.filter((memory) => (!category || memory.category === category)
    && (!needle || memory.content.toLocaleLowerCase().includes(needle)));
}

function mergeMemoryEntries(current, proposed, now) {
  const merged = [...current];
  for (const candidate of proposed) {
    const match = merged.find((item) => item.category === candidate.category
      && item.content.toLocaleLowerCase() === candidate.content.toLocaleLowerCase());
    if (match) {
      match.updatedAt = now();
    } else {
      merged.push({ ...candidate, pinned: false, createdAt: now(), updatedAt: now() });
    }
  }
  return merged;
}
```

Implement `formatMemoryEntries(memories)` with literal labels `Pinned memories`, `Other memories`, and category labels `Preferences`, `Facts`, `Avoid`, and `Relationship tone`. Implement `buildMemorySystemMessage(state, options)` with pinned entries first, ordinary entries second, and `Summary: ${state.summary.conversation}` last. Implement `buildRememberedMessages({ systemPrompt, state, text, characterLimit })` so it always retains the configured system prompt (when present), the current user message, and all pinned entries that fit the explicit character limit. It then adds ordinary entries, summary, and newest raw turns from newest to oldest until the limit is reached, returning raw turns in chronological conversation order. A section that does not fit is omitted rather than split mid-message.

- [ ] **Step 4: Extend compression without weakening reply delivery**

Change `compressStateIfNeeded` so the summarizer receives `memories` in addition to `messages`, `summary`, and `profile`, and accepts this response shape:

```js
{
  success: true,
  summary: "Concise rolling context",
  profile: { displayName: "" },
  memories: [
    { category: "preference", content: "prefers calm music" },
  ],
}
```

When the result is valid, cap the summary, merge proposed entries through `mergeMemoryEntries`, rebuild the compatibility profile via the store normalizer, preserve the raw-turn retention policy, and increment compression stats. When the summarizer throws, returns `success: false`, or returns malformed data, use the existing fallback summary and leave entries unchanged. The successful user reply must still be returned in all three fallback cases.

- [ ] **Step 5: Add controller-owned CRUD operations**

Inside `createChatMemoryController`, implement:

```js
function listMemories(options) {
  return filterMemoryEntries(readState().memories, options);
}

function deleteMemory(id) {
  const state = readState();
  if (!state.memories.some((memory) => memory.id === id)) return { success: false, error: "memory-not-found" };
  return { success: true, state: writeState({ ...state, memories: state.memories.filter((memory) => memory.id !== id) }) };
}

function clearSummary() {
  return writeState(clearChatSummary(readState()));
}
```

Implement `createMemory({ category, content, pinned })` by normalizing a candidate `{ category, content, pinned, createdAt: now(), updatedAt: now() }`; return `{ success: false, error: "invalid-memory" }` when normalization returns null, otherwise append, write state, and return `{ success: true, state, memory }`. Implement `updateMemory({ id, category, content, pinned })` by locating the current entry, merging only supplied fields, preserving `createdAt`, setting `updatedAt: now()`, normalizing it, and replacing it at the original index. Return `memory-not-found` for an unknown ID and `invalid-memory` for invalid fields. Include `memoryUpdated: true | false` on successful remembered sends so the renderer can give quiet feedback after compression.

- [ ] **Step 6: Run the focused controller suite**

Run: `node --test test/chat-memory-controller.test.js`

Expected: PASS.

### Task 3: Wire The Memory API Through Main And Preload

**Files:**
- Modify: `src/main.js`
- Modify: `src/preload.js`
- Modify: `test/chat-ui-memory-mode.test.js`

- [ ] **Step 1: Add failing IPC contract assertions**

In `test/chat-ui-memory-mode.test.js`, add assertions for all new bridge and handler names:

```js
assert.match(preload, /listChatMemories\(options\)\s*{\s*return ipcRenderer\.invoke\("chat:list-memories"/);
assert.match(preload, /createChatMemory\(payload\)\s*{\s*return ipcRenderer\.invoke\("chat:create-memory"/);
assert.match(preload, /updateChatMemory\(payload\)\s*{\s*return ipcRenderer\.invoke\("chat:update-memory"/);
assert.match(preload, /deleteChatMemory\(id\)\s*{\s*return ipcRenderer\.invoke\("chat:delete-memory"/);
assert.match(preload, /clearChatMemorySummary\(\)\s*{\s*return ipcRenderer\.invoke\("chat:clear-summary"/);
```

Add matching `ipcMain.handle(...)` assertions for the five main-process channels.

- [ ] **Step 2: Run the contract test to verify the red state**

Run: `node --test test/chat-ui-memory-mode.test.js`

Expected: FAIL because the IPC channels do not exist yet.

- [ ] **Step 3: Update summary prompting and handlers in the main process**

In `src/main.js`:

1. Extend `buildChatMemorySummarizerPrompt` to receive `memories`, include them in the prompt, and require the response schema:

```text
{"summary":"Rolling context","profile":{"displayName":"","relationshipTone":"","preferences":[],"facts":[],"avoidances":[]},"memories":[{"category":"preference","content":"prefers calm music"}]}
```

2. Pass `memories` from the controller's summarizer callback and return a sanitized `memories` array to the controller.
3. Add handlers following the existing try/catch error-envelope style:

```js
ipcMain.handle("chat:list-memories", async (_event, options = {}) => ({
  success: true,
  memories: getChatMemoryController().listMemories(options),
}));
ipcMain.handle("chat:create-memory", async (_event, payload = {}) => getChatMemoryController().createMemory(payload));
ipcMain.handle("chat:update-memory", async (_event, payload = {}) => getChatMemoryController().updateMemory(payload));
ipcMain.handle("chat:delete-memory", async (_event, { id } = {}) => getChatMemoryController().deleteMemory(id));
ipcMain.handle("chat:clear-summary", async () => ({
  success: true,
  state: getChatMemoryController().clearSummary(),
}));
```

For each handler, convert thrown errors into the same `{ success: false, error }` shape used by existing chat handlers.

- [ ] **Step 4: Add preload bridge methods**

In `src/preload.js`, add direct narrow wrappers adjacent to the existing chat methods:

```js
listChatMemories(options) { return ipcRenderer.invoke("chat:list-memories", options || {}); },
createChatMemory(payload) { return ipcRenderer.invoke("chat:create-memory", payload || {}); },
updateChatMemory(payload) { return ipcRenderer.invoke("chat:update-memory", payload || {}); },
deleteChatMemory(id) { return ipcRenderer.invoke("chat:delete-memory", { id }); },
clearChatMemorySummary() { return ipcRenderer.invoke("chat:clear-summary"); },
```

Do not change `llm:chat` or the existing temporary-chat path.

- [ ] **Step 5: Run the IPC/UI contract test**

Run: `node --test test/chat-ui-memory-mode.test.js`

Expected: the IPC contract assertions pass; later UI assertions may remain red until Task 4.

### Task 4: Build The Chat Memory Management Surface

**Files:**
- Modify: `src/renderer/chat.html`
- Modify: `src/renderer/chat.js`
- Modify: `src/renderer/styles.css`
- Modify: `test/chat-ui-memory-mode.test.js`

- [ ] **Step 1: Add failing UI contract checks**

Extend the chat HTML/CSS test with these required IDs and class hooks:

```js
assert.match(html, /id="chat-memory-toggle"/);
assert.match(html, /id="chat-memory-query"/);
assert.match(html, /id="chat-memory-category"/);
assert.match(html, /id="chat-memory-list"/);
assert.match(html, /id="chat-memory-form"/);
assert.match(html, /id="chat-clear-summary"/);
assert.match(css, /\.chat-memory-panel/);
assert.match(css, /\.chat-memory-entry/);
```

Add source contract checks that `chat.js` calls all five new bridge methods and uses `window.confirm` before delete, summary clear, and all-memory clear.

- [ ] **Step 2: Run the UI contract test to verify the red state**

Run: `node --test test/chat-ui-memory-mode.test.js`

Expected: FAIL because the management panel and its renderer logic do not exist.

- [ ] **Step 3: Add semantic management markup**

In `src/renderer/chat.html`, place a collapsed management panel directly after the existing memory-summary details. It must contain:

```html
<button id="chat-memory-toggle" class="chat-window__memory-btn" type="button" aria-expanded="false" aria-controls="chat-memory-panel">管理记忆</button>
<section id="chat-memory-panel" class="chat-memory-panel" hidden aria-label="记忆管理">
  <div class="chat-memory-panel__toolbar">
    <input id="chat-memory-query" type="search" placeholder="搜索记忆" />
    <select id="chat-memory-category"><option value="">全部类别</option></select>
  </div>
  <ol id="chat-memory-list" class="chat-memory-list"></ol>
  <form id="chat-memory-form" class="chat-memory-form">
    <select id="chat-memory-new-category" aria-label="记忆类别"><option value="preference">偏好</option><option value="fact">事实</option><option value="avoidance">避免</option><option value="relationship">关系</option></select>
    <input id="chat-memory-new-content" required maxlength="280" placeholder="添加一条长期记忆" />
    <label><input id="chat-memory-new-pinned" type="checkbox" /> 固定</label>
    <button type="submit">添加</button>
  </form>
  <button id="chat-clear-summary" class="chat-window__memory-btn" type="button">清空对话摘要</button>
</section>
```

The add form includes a category select, content input, pin checkbox, and submit button. Per-entry controls are rendered as familiar icon buttons with `aria-label` and `title`: pin/unpin, edit, and delete.

- [ ] **Step 4: Add renderer state and safe DOM rendering**

In `src/renderer/chat.js`:

1. Cache all new elements and track `memoryPanelOpen`, `memoryEntries`, `memoryQuery`, and `memoryCategory`.
2. Implement `refreshMemories()` by calling `bridge.listChatMemories({ query: memoryQuery, category: memoryCategory })` and rendering rows with DOM APIs plus existing `escapeHtml`; never inject memory content unescaped.
3. Implement `renderMemoryEntry(memory)` with category label, wrapped content, pin state, and three action buttons. The edit action uses a small inline form in the selected row, prefilled with the entry's content/category/pin state; submit calls `bridge.updateChatMemory`.
4. Wire add, filter, search, edit, pin, and delete actions to the bridge. Use `window.confirm("删除这条长期记忆？")` before deletion.
5. Wire `chat-clear-summary` to `bridge.clearChatMemorySummary()` behind `window.confirm("清空对话摘要？长期记忆不会删除。")`; refresh the summary and entries after every successful mutation.
6. Update `applyRememberedStateResult` and `refreshMemorySummary` to show `本次对话已更新记忆` only when `result.memoryUpdated === true`, otherwise leave status neutral. Do not show this indicator for temporary mode.
7. Retain existing remembered/temporary switching. In temporary mode, disable the management toggle and leave the panel closed; do not issue list/create/update/delete/clear-summary IPC calls from temporary-mode sends.

- [ ] **Step 5: Style the panel as a compact utility surface**

In `src/renderer/styles.css`, add scoped styles for `.chat-memory-panel`, `.chat-memory-panel__toolbar`, `.chat-memory-list`, `.chat-memory-entry`, `.chat-memory-entry__actions`, and `.chat-memory-form`.

Use the established `--surface-*`, `--text-*`, `--accent`, and radius variables. The panel must scroll internally for large memory sets, use responsive grid/flex constraints so long Chinese or English entry text wraps rather than overlaps controls, and distinguish pinned entries with an accent border plus a small text/icon marker. Do not create nested decorative cards; entry rows are the only framed repeated elements.

- [ ] **Step 6: Run the chat UI test**

Run: `node --test test/chat-ui-memory-mode.test.js`

Expected: PASS.

### Task 5: Verify Integration And Preserve Existing Behavior

**Files:**
- Modify only if a verification command identifies a regression in the files above.

- [ ] **Step 1: Run syntax checks for every touched JavaScript file**

Run:

```powershell
node --check src/chat/chat-memory-store.js
node --check src/chat/chat-memory-controller.js
node --check src/main.js
node --check src/preload.js
node --check src/renderer/chat.js
```

Expected: every command exits with code 0.

- [ ] **Step 2: Run all focused memory tests**

Run:

```powershell
node --test test/chat-memory-store.test.js test/chat-memory-controller.test.js test/chat-ui-memory-mode.test.js
```

Expected: all focused tests pass.

- [ ] **Step 3: Run the full regression suite**

Run: `npm.cmd test`

Expected: all Node tests pass with zero failures.

- [ ] **Step 4: Run Electron smoke verification**

Run: `npm.cmd run smoke`

Expected: exit code 0 and output containing `renderer loaded`.

- [ ] **Step 5: Perform a manual chat-window acceptance pass**

Run the app with `npm.cmd start`, then confirm:

1. Existing remembered state opens without losing history.
2. A manual pinned memory appears first in the management list and survives restart.
3. Edit/delete/clear-summary require confirmation and affect only the stated data.
4. Temporary chat can hold a window-local conversation but leaves remembered history, summary, and entries unchanged after closing the window.
5. Long memory text wraps within the panel, and all controls remain reachable at the minimum chat-window width.
