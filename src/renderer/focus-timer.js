(function attachFocusTimer(root) {
  const FocusPhase = Object.freeze({
    Idle: "idle",
    Focus: "focus",
    Break: "break",
    PausedFocus: "paused-focus",
    PausedBreak: "paused-break",
  });

  const DEFAULT_FOCUS_MS = 25 * 60 * 1000;
  const DEFAULT_BREAK_MS = 5 * 60 * 1000;

  class FocusTimer {
    constructor({
      focusDurationMs = DEFAULT_FOCUS_MS,
      breakDurationMs = DEFAULT_BREAK_MS,
      now = () => Date.now(),
    } = {}) {
      this.focusDurationMs = focusDurationMs;
      this.breakDurationMs = breakDurationMs;
      this.now = now;
      this.phase = FocusPhase.Idle;
      this.endAt = 0;
      this.remainingOnPause = 0;
      this._focusListeners = [];
      this._breakListeners = [];
      this._reset();
    }

    _reset() {
      this.phase = FocusPhase.Idle;
      this.endAt = 0;
      this.remainingOnPause = this.focusDurationMs;
    }

    get remainingMs() {
      if (this.phase === FocusPhase.PausedFocus || this.phase === FocusPhase.PausedBreak) {
        return this.remainingOnPause;
      }
      if (this.phase === FocusPhase.Idle) {
        return this.focusDurationMs;
      }
      const ms = this.endAt - this.now();
      return Math.max(0, ms);
    }

    startFocus(durationMs) {
      const duration = Number.isFinite(durationMs) && durationMs > 0
        ? durationMs
        : this.focusDurationMs;
      this.phase = FocusPhase.Focus;
      this.endAt = this.now() + duration;
      this.remainingOnPause = duration;
    }

    startBreak(durationMs) {
      const duration = Number.isFinite(durationMs) && durationMs > 0
        ? durationMs
        : this.breakDurationMs;
      this.phase = FocusPhase.Break;
      this.endAt = this.now() + duration;
      this.remainingOnPause = duration;
    }

    pause() {
      if (this.phase === FocusPhase.Focus || this.phase === FocusPhase.Break) {
        this.remainingOnPause = Math.max(0, this.endAt - this.now());
        this.phase = this.phase === FocusPhase.Focus ? FocusPhase.PausedFocus : FocusPhase.PausedBreak;
      }
    }

    resume() {
      if (this.phase === FocusPhase.PausedFocus || this.phase === FocusPhase.PausedBreak) {
        this.phase = this.phase === FocusPhase.PausedFocus ? FocusPhase.Focus : FocusPhase.Break;
        this.endAt = this.now() + this.remainingOnPause;
      }
    }

    reset() {
      this._reset();
    }

    setDurations({ focusDurationMs, breakDurationMs } = {}) {
      if (Number.isFinite(focusDurationMs) && focusDurationMs > 0) {
        this.focusDurationMs = focusDurationMs;
      }
      if (Number.isFinite(breakDurationMs) && breakDurationMs > 0) {
        this.breakDurationMs = breakDurationMs;
      }
      if (this.phase === FocusPhase.Idle) {
        this.remainingOnPause = this.focusDurationMs;
      }
    }

    tick() {
      if (this.phase !== FocusPhase.Focus && this.phase !== FocusPhase.Break) {
        return { phase: this.phase, finished: false };
      }
      const remaining = this.endAt - this.now();
      if (remaining > 0) {
        return { phase: this.phase, finished: false };
      }
      const finishedPhase = this.phase;
      this.phase = FocusPhase.Idle;
      if (finishedPhase === FocusPhase.Focus) {
        for (const fn of this._focusListeners) fn();
      } else {
        for (const fn of this._breakListeners) fn();
      }
      return { phase: finishedPhase, finished: true };
    }

    onFocusEnd(fn) { this._focusListeners.push(fn); }
    onBreakEnd(fn) { this._breakListeners.push(fn); }
  }

  const api = { FocusTimer, FocusPhase };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetFocusTimer = api;
})(typeof window !== "undefined" ? window : globalThis);
