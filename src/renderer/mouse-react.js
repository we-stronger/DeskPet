(function attachMouseReact(root) {
  const pool = ["嗯？", "你在看我吗？", "有什么事吗？"];

  class MouseReact {
    constructor({
      cooldownMs = 20000,
      longHoverMs = 5000,
      now = () => Date.now(),
      random = () => Math.random(),
    } = {}) {
      this.cooldownMs = cooldownMs;
      this.longHoverMs = longHoverMs;
      this.now = now;
      this.random = random;
      this._lastReactionAt = Number.NEGATIVE_INFINITY;
      this._firstSeenAt = null;
    }

    reset() {
      this._lastReactionAt = Number.NEGATIVE_INFINITY;
      this._firstSeenAt = null;
    }

    notifyPointerInside({ mood = 50 } = {}) {
      const t = this.now();
      if (this._lastReactionAt === Number.NEGATIVE_INFINITY) {
        this._lastReactionAt = t;
        this._firstSeenAt = t;
        return null;
      }
      if (this._firstSeenAt === null) {
        this._firstSeenAt = t;
      }
      if (t - this._lastReactionAt < this.cooldownMs) {
        return null;
      }
      if (t - this._firstSeenAt >= this.longHoverMs) {
        this._lastReactionAt = t;
        this._firstSeenAt = null;
        const tone = mood >= 70 ? "happy" : mood <= 30 ? "pout" : "neutral";
        return { kind: "escalate", tone };
      }
      this._lastReactionAt = t;
      this._firstSeenAt = null;
      const idx = Math.floor(this.random() * pool.length);
      return { kind: "react", text: pool[idx] };
    }
  }

  const api = { MouseReact };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetMouseReact = api;
})(typeof window !== "undefined" ? window : globalThis);
