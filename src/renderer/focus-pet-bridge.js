(function attachFocusPetBridge(root) {
  const PetBehaviorPriority = Object.freeze({
    Ambient: 10,
    Focus: 20,
    Interaction: 40,
    PhaseCompletion: 80,
    Drag: 100,
  });

  class FocusPetBridge {
    constructor({
      now = () => Date.now(),
      interactionBubbleCooldownMs = 1200,
      onBehavior = () => {},
      onBubble = () => {},
      onQuietMode = () => {},
      resolveAmbientAction = () => "idle",
    } = {}) {
      this.now = now;
      this.interactionBubbleCooldownMs = Math.max(0, Number(interactionBubbleCooldownMs) || 0);
      this.onBehavior = onBehavior;
      this.onBubble = onBubble;
      this.onQuietMode = onQuietMode;
      this.resolveAmbientAction = resolveAmbientAction;
      this.current = null;
      this.tokenSequence = 0;
      this.dragging = false;
      this.lastEventKey = "";
      this.lastBubbleAt = new Map();
    }

    handleSessionEvent(event = {}) {
      const snapshot = event.snapshot || {};
      const eventKey = [
        event.type,
        snapshot.sessionId,
        snapshot.revision,
        snapshot.phase,
        snapshot.status,
        snapshot.completedFocusRounds,
        snapshot.updatedAt,
      ].join(":");
      if (eventKey === this.lastEventKey) return { ignored: true, reason: "duplicate-event" };
      this.lastEventKey = eventKey;

      if (event.type === "focus-started" || event.type === "phase-resumed") {
        const focusActive = snapshot.phase === "focus";
        this.onQuietMode(focusActive);
        return this._requestBehavior(
          this._ambientAction(snapshot),
          PetBehaviorPriority.Focus,
          event.type,
        );
      }

      if (event.type === "phase-paused") {
        this.onQuietMode(snapshot.phase === "focus");
        return this._requestBehavior(
          this._ambientAction(snapshot),
          PetBehaviorPriority.Focus,
          event.type,
        );
      }

      if (event.type === "break-started") {
        this.onQuietMode(false);
        const request = this._requestBehavior("idle", PetBehaviorPriority.Focus, event.type);
        this._emitBubble("break-started", snapshot.phase === "long-break"
          ? "长休息开始了，离开屏幕活动一下吧。"
          : "休息一下眼睛和肩膀吧。");
        return request;
      }

      if (event.type === "phase-completed" || event.type === "phase-completed-restored") {
        this.onQuietMode(false);
        const request = this._requestBehavior(
          "happy",
          PetBehaviorPriority.PhaseCompletion,
          event.type,
          true,
        );
        if (snapshot.phase === "waiting-for-break") {
          const label = snapshot.suggestedBreakPhase === "long-break" ? "长休息" : "短休息";
          this._emitBubble("focus-completed", `本轮专注完成，准备好后开始${label}。`, true);
        } else {
          this._emitBubble("break-completed", "休息结束，准备好后再开始下一轮。", true);
        }
        return request;
      }

      if (event.type === "session-interrupted"
        || event.type === "session-reset"
        || event.type === "break-skipped") {
        this.onQuietMode(false);
        return this._requestAmbient(snapshot, event.type);
      }

      return { ignored: true, reason: "unsupported-event" };
    }

    requestInteraction({ action = "idle", bubble = "", bubbleKey = "interaction" } = {}) {
      if (this.dragging) return { ignored: true, reason: "dragging" };
      const request = this._requestBehavior(
        action,
        PetBehaviorPriority.Interaction,
        "interaction",
      );
      if (!request.ignored && bubble) this._emitBubble(bubbleKey, bubble);
      return request;
    }

    beginDrag() {
      this.dragging = true;
      return this._requestBehavior("drag", PetBehaviorPriority.Drag, "drag-started", true);
    }

    endDrag(snapshot = {}) {
      this.dragging = false;
      this.current = null;
      const priority = snapshot.phase === "focus"
        ? PetBehaviorPriority.Focus
        : PetBehaviorPriority.Ambient;
      return this._requestBehavior(this._ambientAction(snapshot), priority, "drag-released", true);
    }

    completeAction(token, snapshot = {}) {
      if (!this.current || this.current.token !== token) return false;
      this.current = null;
      this._requestAmbient(snapshot, "action-completed");
      return true;
    }

    _requestAmbient(snapshot, reason) {
      const priority = snapshot.phase === "focus"
        ? PetBehaviorPriority.Focus
        : PetBehaviorPriority.Ambient;
      return this._requestBehavior(this._ambientAction(snapshot), priority, reason, true);
    }

    _ambientAction(snapshot) {
      const action = this.resolveAmbientAction(snapshot);
      return typeof action === "string" && action ? action : "idle";
    }

    _requestBehavior(action, priority, reason, force = false) {
      if (!force && this.current && this.current.priority > priority) {
        return { ignored: true, reason: "higher-priority-active", current: { ...this.current } };
      }
      const request = {
        action,
        priority,
        reason,
        token: ++this.tokenSequence,
      };
      this.current = request;
      this.onBehavior({ ...request });
      return { ...request };
    }

    _emitBubble(key, bubbleText, force = false) {
      const lastAt = this.lastBubbleAt.get(key);
      if (!force && Number.isFinite(lastAt) && this.now() - lastAt < this.interactionBubbleCooldownMs) {
        return false;
      }
      this.lastBubbleAt.set(key, this.now());
      this.onBubble({ key, text: bubbleText });
      return true;
    }
  }

  const api = { FocusPetBridge, PetBehaviorPriority };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DeskpetFocusPetBridge = api;
})(typeof window !== "undefined" ? window : globalThis);
