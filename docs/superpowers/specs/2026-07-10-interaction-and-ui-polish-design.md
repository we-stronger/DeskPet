# Interaction And UI Polish Design

## Goal

Make Desk Pet's floating feedback, music controls, chat controls, and focus/time widgets feel like one coherent desktop interaction surface. The result must reduce visual overlap, make action outcomes obvious, and keep existing music/chat/pet capabilities intact.

## Scope

This pass covers four connected areas:

1. Move ordinary pet bubbles closer to the character's right edge while preserving stage-boundary safety.
2. Establish consistent feedback behavior for music, chat memory, focus, and time widgets.
3. Improve music queue/control and chat-memory UI states without changing NetEase account or playback architecture.
4. Improve layout resilience for long text, small pet sizes, hidden widgets, and narrow standalone windows.

It does not add new external services, replace the audio backend, redesign the character artwork, or change persisted account credentials.

## Bubble Placement

The dedicated `pet-top-right` bubble anchor remains the sole anchor for chat replies and ordinary feedback (click, focus, music, and settings feedback). Its horizontal gap from the sprite's right edge changes from the current 16-28 pixel range to a 6-14 pixel range in image space. Vertical placement remains near the upper body.

The anchor still clamps within the fixed 512x512 transparent stage. When a character is close to the right edge, clamping takes priority over the preferred gap. The bubble continues to grow toward the right, its tail stays on the character-facing lower-left edge, and no widget placement will move the native window.

## Shared Interaction Rules

All user-triggered controls use the same state model:

- An action starts with a local disabled/busy state only on the initiating control.
- A successful action updates the relevant visible state and gives one concise inline status message or pet bubble, not both unless the user explicitly enabled chat-reply bubbles.
- A failed action leaves prior user data intact, restores the initiating control, and exposes an actionable inline error.
- Destructive operations retain confirmation. Reversible operations such as pin, pause, and queue-mode switch remain immediate.
- Icon-only controls have `title` and `aria-label`; text commands remain for actions that need unambiguous wording.

## Widget Coordination

Time, focus, and music status widgets retain independent drag persistence. The layout coordinator assigns a stable priority when positions collide:

1. The active music status bar owns its saved location.
2. An active focus timer uses its saved location or the opposite side from the music status bar.
3. The clock occupies its saved location or an unoccupied upper margin.
4. Transient bubbles use the pet-top-right anchor and never write a saved location.

Hidden widgets do not reserve layout space. Showing a widget restores its last saved position; if that position is no longer inside the stage, the existing clamp policy corrects it.

## Music Experience

The pet status bar, embedded panel, and standalone music window consume the same persisted playback state. They display current track, playing/paused state, playback mode, and next queued item consistently.

Controls follow these rules:

- Previous/next are disabled with a clear empty-queue status when no valid target exists.
- Play/pause changes only the active Desk Pet audio player and updates every music surface.
- Playback mode switches immediately without restarting the current track.
- Queue, history, favourite, and playlist operations show compact loading/empty/error states and retain prior visible data on a failed request.
- Opening a playlist or search result does not create a second independent playback state.

## Chat Experience

The memory-management surface remains collapsed by default. Its filters, entry actions, and add form use a compact utility layout with fixed-size action controls. Remembered mode presents memory updates as a quiet inline status. Temporary mode disables memory management and makes its non-persistent boundary explicit.

Long memory entries, long song names, and long chat replies wrap or ellipsize according to their task: content wraps, titles ellipsize, and controls retain their dimensions. Confirmations remain for deleting memories and clearing persisted conversation data.

## Visual System

Use existing design tokens (`--surface-*`, `--text-*`, `--accent`, and the current radius scale). Controls share a small set of dimensions, hover/pressed/disabled states, and text hierarchy. Avoid decorative page cards, oversized headings, and non-functional ornaments. Status cues use color plus text, so they remain understandable without color alone.

## Test Strategy

Add or extend focused tests for:

- Bubble anchor preferred gap and right-edge clamp behavior.
- Widget collision/priority decisions as pure layout logic.
- Music control disabled/busy/error behavior and cross-surface state updates.
- Chat temporary-mode control disabling, status feedback, and long-entry layout hooks.
- Existing renderer UI contracts and settings persistence.

Run targeted tests, `npm.cmd test`, JavaScript syntax checks, and `npm.cmd run smoke`. Manual acceptance verifies the bubble around multiple character poses, queue transitions, hidden/shown widgets, and narrow chat/music windows.
