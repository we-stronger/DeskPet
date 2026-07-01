(function attachMusicCommand(root) {
  const MUSIC_ACTIONS = Object.freeze({
    "play-pause": "playPause",
    playPause: "playPause",
    next: "next",
    previous: "previous",
  });

  const MUSIC_FEEDBACK = Object.freeze({
    playPause: "music:feedback:play-pause",
    next: "music:feedback:next",
    previous: "music:feedback:previous",
  });

  const MUSIC_VISUAL_FEEDBACK = Object.freeze(new Set([
    "music:feedback:play-pause",
    "music:feedback:next",
    "music:feedback:previous",
    "music:feedback:open-success",
    "music:feedback:open-song",
    "music:feedback:login-success",
  ]));

  function musicActionFromCommand(command) {
    if (typeof command !== "string" || !command.startsWith("music:")) {
      return null;
    }
    const rawAction = command.slice("music:".length);
    return MUSIC_ACTIONS[rawAction] || null;
  }

  function musicFeedbackCommandForAction(action) {
    return MUSIC_FEEDBACK[action] || "music:feedback:failed";
  }

  function musicVisualActionForFeedbackCommand(command) {
    if (!MUSIC_VISUAL_FEEDBACK.has(command)) {
      return null;
    }
    return { action: "music", durationMs: 3200 };
  }

  const api = {
    MUSIC_ACTIONS,
    MUSIC_FEEDBACK,
    MUSIC_VISUAL_FEEDBACK,
    musicActionFromCommand,
    musicFeedbackCommandForAction,
    musicVisualActionForFeedbackCommand,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetMusicCommand = api;
})(typeof window !== "undefined" ? window : globalThis);
