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
      this.speedMultiplier = 1;
    }

    start(action) {
      if (!this.actions[action]) {
        throw new Error(`Unknown action: ${action}`);
      }
      this.action = action;
      this.frame = 1;
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

      if (this.frame < config.frames) {
        this.frame += 1;
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
