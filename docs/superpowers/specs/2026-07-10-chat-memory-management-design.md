# Chat Memory Management Design

## Goal

Improve Desk Pet's remembered-chat experience without weakening the existing temporary-chat privacy boundary. Long-term memories must be useful, inspectable, editable, and safe to compact as conversations grow.

## Scope

This phase covers only chat memory. It preserves the existing remembered and temporary modes, existing LLM configuration, and current persisted `chat-memory-state.json` data. Music and general visual redesign are intentionally deferred to later phases.

## Chosen Approach

Use automatic extraction with user-controlled review:

- The application continues to derive stable preferences, facts, and relationship signals from remembered conversations.
- Each long-term item is persisted as an individual memory entry rather than only as an opaque string list.
- Users can inspect, add, edit, delete, search, filter, and pin memory entries from the chat window.
- Temporary conversations remain window-local and never update persisted history, summaries, profiles, or entries.

This keeps continuity during ordinary use while giving the user a direct correction path when a generated memory is inaccurate or no longer relevant.

## Data Model And Migration

`chat-memory-state.json` advances from version 1 to version 2. Version 2 retains all current fields and adds `memories`:

```json
{
  "version": 2,
  "profile": {
    "displayName": "",
    "relationshipTone": "",
    "preferences": [],
    "facts": [],
    "avoidances": []
  },
  "summary": {
    "conversation": "",
    "updatedAt": ""
  },
  "recentMessages": [],
  "memories": [
    {
      "id": "memory-...",
      "category": "preference",
      "content": "",
      "pinned": false,
      "createdAt": "",
      "updatedAt": ""
    }
  ],
  "stats": {
    "compressCount": 0,
    "lastCompressedAt": ""
  }
}
```

Allowed categories are `preference`, `fact`, `avoidance`, and `relationship`. Memory content is trimmed, deduplicated case-insensitively within a category, and capped at a bounded count and bounded character length. IDs are generated locally, and invalid legacy data is normalized rather than rejected.

On first load of a version 1 file, non-empty values in `profile.preferences`, `profile.facts`, `profile.avoidances`, and `profile.relationshipTone` are converted into unpinned entries. The legacy profile fields remain populated for compatibility with the existing summary prompt, but are rebuilt from entries before saving so the two representations cannot drift.

## Memory Lifecycle

1. In remembered mode, the controller sends the system prompt, selected long-term memory, the rolling summary, recent messages, and the new user message to the configured LLM.
2. After a successful response, raw turns are persisted and the controller checks the existing count and character budgets.
3. When compression is needed, the summarizer receives the prior summary, current profile, current memory entries, and the older message chunk.
4. The summarizer returns a concise rolling summary plus proposed memory entries. The controller normalizes and merges entries by category/content.
5. Pinned entries are never removed or overwritten by automatic compression. A matching proposed entry can refresh only its timestamp.
6. If summarization fails or returns malformed JSON, the reply still succeeds and the controller uses the existing fallback summary without adding automatic memories.

The summary has an explicit maximum length. Older summary text is compacted before persistence so it cannot consume an unbounded portion of the next LLM request.

## Context Budget

Remembered-mode context is assembled in this stable order:

1. Configured pet system prompt.
2. Pinned memory entries, grouped by category.
3. Unpinned memory entries, grouped by category.
4. Rolling conversation summary.
5. Most recent raw conversation turns.
6. Current user message.

The controller applies a total character budget. It keeps the system prompt and pinned entries first, then retains as many ordinary entries, summary characters, and newest raw turns as fit. This preserves the user-controlled facts before expendable context.

Temporary mode uses only the configured system prompt, the current window's temporary history, and the current user message. It never reads or changes persisted memory state.

## User Experience

The chat window gains a memory-management drawer or panel reached from its existing memory-summary area. It provides:

- A concise memory count and a non-intrusive status after a remembered reply, such as whether memory was refreshed.
- Category filters and a search field.
- Per-entry edit, delete, and pin controls.
- A form to add a memory manually, including category selection.
- Explicit cleanup actions: clear recent conversation turns, clear the rolling summary, and clear all remembered data.

Destructive actions require confirmation. Long entries wrap cleanly, controls remain keyboard accessible, and empty/search-empty states explain what is absent without obscuring the chat history.

## Main-Process Interface

The existing chat IPC methods remain. New narrow operations expose memory management without making the renderer responsible for persistence:

- `chat:list-memories` with optional `query` and `category`.
- `chat:create-memory` with `category`, `content`, and optional `pinned`.
- `chat:update-memory` with `id` and allowed fields.
- `chat:delete-memory` with `id`.
- `chat:clear-summary`.

Each operation returns `{ success, state }` or `{ success, error }`. The preload bridge validates the small argument shapes through the existing IPC boundary pattern.

## Error Handling

- Invalid memory input receives a stable, renderer-friendly error code and does not write state.
- A missing memory ID returns `memory-not-found` without affecting other data.
- Corrupt on-disk state falls back through existing normalization, then saves a valid version 2 state after the next mutation.
- A failed summarizer cannot block the user-facing reply or erase memory.
- The UI surfaces actions as inline status text, avoiding blocking dialogs except for clear/delete confirmations.

## Test Strategy

Add focused Node tests for:

- Version 1 to version 2 migration and memory normalization.
- Entry creation, edit, delete, search, filter, pinning, deduplication, and profile synchronization.
- Compression merge behavior, pinned-entry protection, malformed summarizer fallback, and context-budget ordering.
- Main/preload IPC contract additions.
- Chat window memory controls, temporary-mode isolation, and confirmation-driven destructive actions.

Run targeted tests, the full `npm.cmd test` suite, syntax checks for touched JavaScript, and the Electron smoke test before considering the phase complete.
