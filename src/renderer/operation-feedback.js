(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.OperationFeedback = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizeTimer(callback, method) {
    const timerRoot = globalThis;
    const timer = typeof callback === "function"
      ? callback
      : (...args) => timerRoot[method](...args);
    // Do not call a timer via an instance property: Chromium's window timers
    // reject arbitrary receivers with "Illegal invocation".
    return (...args) => timer(...args);
  }

  class OperationFeedback {
    constructor({ host, schedule = null, cancel = null } = {}) {
      this.host = host || null;
      this.schedule = normalizeTimer(schedule, "setTimeout");
      this.cancel = normalizeTimer(cancel, "clearTimeout");
      this.revision = 0;
      this.timerId = null;
      this.state = "idle";
      this.message = "";
      this.actionLabel = "";
      this.onAction = null;
      this.render();
    }

    pending(message) {
      this.setFeedback("pending", message);
    }

    success(message, { durationMs = 2200 } = {}) {
      this.setFeedback("success", message, { durationMs });
    }

    error(message, { actionLabel = "", onAction = null } = {}) {
      this.setFeedback("error", message, { actionLabel, onAction });
    }

    info(message, { durationMs = 0 } = {}) {
      this.setFeedback("info", message, { durationMs });
    }

    clear() {
      this.beginRevision();
      this.state = "idle";
      this.message = "";
      this.actionLabel = "";
      this.onAction = null;
      this.render();
    }

    snapshot() {
      return {
        state: this.state,
        message: this.message,
        actionLabel: this.actionLabel,
      };
    }

    setFeedback(state, message, { durationMs = 0, actionLabel = "", onAction = null } = {}) {
      const revision = this.beginRevision();
      this.state = state;
      this.message = String(message ?? "");
      this.actionLabel = String(actionLabel ?? "");
      this.onAction = typeof onAction === "function" ? onAction : null;
      this.render();

      if (durationMs > 0) {
        let callbackRan = false;
        const timerId = this.schedule(() => {
          callbackRan = true;
          if (this.revision !== revision) return;
          this.timerId = null;
          this.clear();
        }, durationMs);
        if (!callbackRan && this.revision === revision) {
          this.timerId = timerId;
        }
      }
    }

    beginRevision() {
      this.revision += 1;
      if (this.timerId !== null) {
        this.cancel(this.timerId);
        this.timerId = null;
      }
      return this.revision;
    }

    render() {
      if (!this.host) return;

      const host = this.host;
      const revision = this.revision;
      host.dataset.state = this.state;
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-busy", this.state === "pending" ? "true" : "false");
      host.hidden = false;
      host.textContent = this.message;

      if (this.actionLabel && this.onAction) {
        const document = host.ownerDocument;
        if (!document || typeof document.createElement !== "function") return;
        const button = document.createElement("button");
        button.setAttribute("type", "button");
        button.textContent = this.actionLabel;
        button.addEventListener("click", () => this.onAction());
        host.appendChild(button);
      }

      if (this.state === "pending") {
        queueMicrotask(() => {
          if (this.host !== host || this.revision !== revision || this.state !== "pending") return;
          host.setAttribute("aria-busy", "false");
        });
      }
    }
  }

  return OperationFeedback;
});
