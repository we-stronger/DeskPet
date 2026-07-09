(function attachAnimationController(root) {
  class AnimationController {
    constructor({ actions, assetRoot, initialAction = "idle" }) {
      if (!actions || !actions[initialAction]) {
        throw new Error(`Unknown initial action: ${initialAction}`);
      }

      this.actions = actions;
      this.assetRoot = assetRoot.replace(/[\\/]$/, "");
      this.action = initialAction;
      this.frame = 1;
      // -1 = playing intro frames (1..frames). >=0 = cycling through
      // loopFrames[index], used by actions that want to play the intro
      // once and then alternate a subset of frames forever (e.g. music:
      // play 1..6 once, then alternate 3 and 5).
      this.loopFrameIndex = -1;
      this.speedMultiplier = 1;
    }

    start(action) {
      if (!this.actions[action]) {
        throw new Error(`Unknown action: ${action}`);
      }
      this.action = action;
      this.frame = 1;
      this.loopFrameIndex = -1;
    }

    requestBlink() {
      if (this.action !== "idle") {
        return false;
      }
      this.start("blink");
      return true;
    }

    advance() {
      const config = this.actions[this.action];

      // Mode 1: cycling through the loopFrames array (post-intro loop)
      if (this.loopFrameIndex >= 0) {
        this.loopFrameIndex = (this.loopFrameIndex + 1) % config.loopFrames.length;
        this.frame = config.loopFrames[this.loopFrameIndex];
        return;
      }

      // Mode 2: playing intro frames 1..frames
      if (this.frame < config.frames) {
        this.frame += 1;
        return;
      }

      // Just finished frame N. Decide what's next.
      if (config.loop && Array.isArray(config.loopFrames) && config.loopFrames.length > 0) {
        // Start cycling through loopFrames starting from index 0.
        this.loopFrameIndex = 0;
        this.frame = config.loopFrames[0];
        return;
      }

      if (config.loop) {
        this.frame = 1;
        return;
      }

      this.start(config.next || "idle");
    }

    currentFramePath() {
      const frameName = String(this.frame).padStart(2, "0");
      return `${this.assetRoot}/${this.action}/${this.action}_${frameName}.png`;
    }

    setSpeedMultiplier(multiplier) {
      if (!Number.isFinite(multiplier) || multiplier < 0) {
        this.speedMultiplier = 1;
        return;
      }
      this.speedMultiplier = multiplier;
    }

    currentFps() {
      return this.actions[this.action].fps * this.speedMultiplier;
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { AnimationController };
  }
  root.AnimationController = AnimationController;
})(typeof window !== "undefined" ? window : globalThis);
