// Pure dispatch logic for the music:play-song IPC handler. Extracted
// from src/main.js so the policy is unit-testable without spinning up
// Electron. The real handler in main.js is a thin wrapper that wires
// this function up to the actual NetEase opener and shell.openExternal.
//
// Policy:
//   1. Try each known orpheus:// play variant in order. Each call
//      goes through openNeteaseWithUrl with silent=true, which tries
//      the WM_COPYDATA path first (no popup, no browser, no focus
//      steal) and falls back to spawning cloudmusic.exe if NetEase
//      isn't running yet.
//   2. Stop at the first orpheus variant that succeeds.
//   3. If every variant fails, return a client-play-failed result. The
//      caller asked for client playback, so do not silently switch to a
//      browser or embedded web player.
//
// All orpheus variants use silent=true (runPlaySongWithSilent in
// openNeteaseWithUrl) and allowBareExe=false (no bare-exe fallback
// while trying orpheus targets — that's reserved for the cold-start
// case where the user explicitly asked to open NetEase).

async function dispatchPlaySong(id, deps) {
  const { buildSongOrpheusTargets, openNeteaseWithUrl } = deps;
  if (typeof id !== "string" && !Number.isFinite(id)) {
    return { success: false, error: "invalid-id" };
  }
  const orpheusTargets = buildSongOrpheusTargets(id);
  const errors = [];
  for (const target of orpheusTargets) {
    const result = await openNeteaseWithUrl(target, { allowBareExe: false, silent: true });
    if (result.success) {
      return { ...result, songId: id };
    }
    errors.push(result.error || "open-failed");
  }
  return {
    success: false,
    error: "client-play-failed",
    details: errors,
    songId: id,
  };
}

module.exports = { dispatchPlaySong };
