(function attachActionConfig(root) {
  const actions = {
    idle: { frames: 8, fps: 5, loop: true },
    blink: { frames: 4, fps: 7, loop: false, next: "idle" },
    tap: { frames: 6, fps: 7, loop: false, next: "idle" },
    happy: { frames: 8, fps: 6, loop: false, next: "idle" },
    sleep: { frames: 6, fps: 4, loop: true },
    walk: { frames: 8, fps: 6, loop: true },
    music: { frames: 6, fps: 6, loop: true },
    pout: { frames: 6, fps: 6, loop: false, next: "idle" },
    drag: { frames: 1, fps: 0, loop: true },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { actions };
  }
  root.DeskpetActionConfig = { actions };
})(typeof window !== "undefined" ? window : globalThis);
