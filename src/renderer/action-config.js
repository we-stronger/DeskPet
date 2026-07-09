(function attachActionConfig(root) {
  const actions = {
    idle: { frames: 8, fps: 5, loop: true },
    blink: { frames: 4, fps: 7, loop: false, next: "idle" },
    tap: { frames: 6, fps: 7, loop: false, next: "idle" },
    happy: { frames: 8, fps: 6, loop: false, next: "idle" },
    sleep: { frames: 6, fps: 4, loop: true },
    walk: { frames: 8, fps: 6, loop: true },
    // Music: persistent animation like sleep. Play the 6-frame intro
    // once, then alternate frames 3 and 5 forever. Frames 1, 2, 4, 6
    // had background-removal artifacts (horizontal stripes) so we
    // skip them in the steady-state loop while keeping them for the
    // intro so the animation still feels natural at the start.
    music: { frames: 6, fps: 6, loop: true, loopFrames: [3, 5] },
    pout: { frames: 6, fps: 6, loop: false, next: "idle" },
    drag: { frames: 1, fps: 0, loop: true },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { actions };
  }
  root.DeskpetActionConfig = { actions };
})(typeof window !== "undefined" ? window : globalThis);
