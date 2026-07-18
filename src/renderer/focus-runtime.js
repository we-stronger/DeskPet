(function attachFocusRuntime(root) {
  class FocusRuntime {
    constructor({ createController, onPersist = () => {}, onEvent = () => {}, onRestoredCompletion = () => {} } = {}) {
      this.createController = createController;
      this.onPersist = onPersist;
      this.onEvent = onEvent;
      this.onRestoredCompletion = onRestoredCompletion;
      this.controller = null;
      this.unsubscribe = null;
      this.unsubscribeEvent = null;
      this.currentSnapshot = null;
      this.hasInitialSnapshot = false;
    }

    load(settings = {}) {
      this.destroy();
      if (typeof this.createController !== "function") return null;
      this.controller = this.createController(settings);
      this.unsubscribe = this.controller.subscribe((snapshot) => {
        const changed = !this.currentSnapshot || snapshot.revision !== this.currentSnapshot.revision;
        this.currentSnapshot = snapshot;
        if (this.hasInitialSnapshot && changed) this.onPersist({ snapshot, records: this.records() });
        this.hasInitialSnapshot = true;
      });
      this.unsubscribeEvent = this.controller.onEvent((event) => this.onEvent(event));
      const previous = settings.focusSession;
      const now = Number(settings.now) || Date.now();
      const restored = this.snapshot();
      if (
        previous
        && previous.status === "running"
        && Number.isFinite(previous.endsAt)
        && previous.endsAt <= now
        && restored?.status === "waiting"
      ) {
        this.onRestoredCompletion(restored);
      }
      return restored;
    }

    command(name, payload = {}) {
      if (!this.controller) return { success: false, code: "not-ready" };
      switch (name) {
        case "start": return this.controller.startFocus({ taskName: payload.taskName });
        case "start-break": return this.controller.startSuggestedBreak?.() || this.controller.startBreak(payload);
        case "pause": return this.controller.pause();
        case "resume": return this.controller.resume();
        case "toggle-pause": return this.snapshot()?.status === "paused" ? this.controller.resume() : this.controller.pause();
        case "end":
          if (this.snapshot()?.phase === "focus") {
            if (typeof payload.confirmInterrupt === "function" && !payload.confirmInterrupt()) return { success: false, cancelled: true };
            return this.controller.interruptFocus();
          }
          return this.controller.skipBreak();
        case "skip-break": return this.controller.skipBreak();
        case "reset": return this.controller.reset();
        case "clear-records": return this.controller.clearRecords();
        default: return { success: false, code: "unknown-command" };
      }
    }

    tick() { return this.controller?.tick?.() || { finished: false, snapshot: this.snapshot() }; }
    snapshot() { return this.controller?.snapshot?.() || this.currentSnapshot || null; }
    records() { return this.controller?.records?.() || []; }
    subscribe(listener) { return this.controller?.subscribe?.(listener) || (() => {}); }

    destroy() {
      this.unsubscribe?.();
      this.unsubscribeEvent?.();
      this.unsubscribe = null;
      this.unsubscribeEvent = null;
      this.controller = null;
      this.currentSnapshot = null;
      this.hasInitialSnapshot = false;
    }
  }
  const api = { FocusRuntime };
  if (root) root.DeskpetFocusRuntime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
