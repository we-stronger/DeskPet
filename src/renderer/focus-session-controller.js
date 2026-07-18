(function attachFocusSessionController(root) {
  const timerApi = root.DeskpetFocusTimer
    || (typeof require === "function" ? require("./focus-timer") : null);

  if (!timerApi || typeof timerApi.FocusTimer !== "function") {
    throw new Error("FocusSessionController requires FocusTimer");
  }

  const { FocusTimer } = timerApi;

  const FocusSessionPhase = Object.freeze({
    Idle: "idle",
    Focus: "focus",
    ShortBreak: "short-break",
    LongBreak: "long-break",
    WaitingForBreak: "waiting-for-break",
    WaitingForFocus: "waiting-for-focus",
  });

  const FocusSessionStatus = Object.freeze({
    Idle: "idle",
    Running: "running",
    Paused: "paused",
    Waiting: "waiting",
  });

  const DEFAULT_FOCUS_MS = 25 * 60 * 1000;
  const DEFAULT_SHORT_BREAK_MS = 5 * 60 * 1000;
  const DEFAULT_LONG_BREAK_MS = 15 * 60 * 1000;
  const DEFAULT_ROUNDS_BEFORE_LONG_BREAK = 4;
  const SESSION_VERSION = 1;

  function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function positiveInteger(value, fallback) {
    return Math.max(1, Math.round(positiveNumber(value, fallback)));
  }

  function text(value, maxLength = 60) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  class FocusSessionController {
    constructor({
      focusDurationMs = DEFAULT_FOCUS_MS,
      shortBreakDurationMs = DEFAULT_SHORT_BREAK_MS,
      longBreakDurationMs = DEFAULT_LONG_BREAK_MS,
      roundsBeforeLongBreak = DEFAULT_ROUNDS_BEFORE_LONG_BREAK,
      now = () => Date.now(),
      createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      initialSession = null,
      initialRecords = [],
      onPersist = null,
    } = {}) {
      this.now = now;
      this.createId = createId;
      this.focusDurationMs = positiveNumber(focusDurationMs, DEFAULT_FOCUS_MS);
      this.shortBreakDurationMs = positiveNumber(shortBreakDurationMs, DEFAULT_SHORT_BREAK_MS);
      this.longBreakDurationMs = positiveNumber(longBreakDurationMs, DEFAULT_LONG_BREAK_MS);
      this.roundsBeforeLongBreak = positiveInteger(
        roundsBeforeLongBreak,
        DEFAULT_ROUNDS_BEFORE_LONG_BREAK,
      );
      this.timer = new FocusTimer({
        focusDurationMs: this.focusDurationMs,
        breakDurationMs: this.shortBreakDurationMs,
        now,
      });
      this._records = Array.isArray(initialRecords) ? initialRecords.map(clone) : [];
      this._subscribers = new Set();
      this._eventListeners = new Set();
      this._onPersist = typeof onPersist === "function" ? onPersist : null;
      this.revision = 0;
      this.sessionId = null;
      this.taskName = "";
      this.phase = FocusSessionPhase.Idle;
      this.status = FocusSessionStatus.Idle;
      this.startedAt = null;
      this.phaseStartedAt = null;
      this.endsAt = null;
      this.pausedRemainingMs = null;
      this.plannedDurationMs = this.focusDurationMs;
      this.completedFocusRounds = 0;
      this.suggestedBreakPhase = null;
      this.updatedAt = this.now();
      this._restore(initialSession);
    }

    snapshot() {
      return {
        version: SESSION_VERSION,
        revision: this.revision,
        sessionId: this.sessionId,
        taskName: this.taskName,
        phase: this.phase,
        status: this.status,
        startedAt: this.startedAt,
        phaseStartedAt: this.phaseStartedAt,
        endsAt: this.endsAt,
        pausedRemainingMs: this.pausedRemainingMs,
        remainingMs: this._remainingMs(),
        plannedDurationMs: this.plannedDurationMs,
        completedFocusRounds: this.completedFocusRounds,
        roundsBeforeLongBreak: this.roundsBeforeLongBreak,
        focusDurationMs: this.focusDurationMs,
        shortBreakDurationMs: this.shortBreakDurationMs,
        longBreakDurationMs: this.longBreakDurationMs,
        suggestedBreakPhase: this.suggestedBreakPhase,
        updatedAt: this.updatedAt,
      };
    }

    records() {
      return this._records.map(clone);
    }

    clearRecords() {
      this._records = [];
      return this._commit("records-cleared");
    }

    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      this._subscribers.add(listener);
      listener(this.snapshot());
      return () => this._subscribers.delete(listener);
    }

    onEvent(listener) {
      if (typeof listener !== "function") return () => {};
      this._eventListeners.add(listener);
      return () => this._eventListeners.delete(listener);
    }

    startFocus({ taskName, durationMs } = {}) {
      const canContinueCycle = this.phase === FocusSessionPhase.WaitingForFocus;
      if (this.status === FocusSessionStatus.Running || this.status === FocusSessionStatus.Paused) {
        return this._failure("phase-active", "请先结束当前专注或休息。");
      }
      if (this.phase === FocusSessionPhase.WaitingForBreak) {
        return this._failure("break-not-finished", "请先开始或跳过本轮休息。");
      }

      const currentTime = this.now();
      if (!canContinueCycle || !this.sessionId) {
        this.sessionId = this.createId("focus-session");
        this.startedAt = currentTime;
        this.completedFocusRounds = 0;
      }
      this.taskName = text(taskName) || this.taskName;
      this.phase = FocusSessionPhase.Focus;
      this.status = FocusSessionStatus.Running;
      this.phaseStartedAt = currentTime;
      this.plannedDurationMs = positiveNumber(durationMs, this.focusDurationMs);
      this.endsAt = currentTime + this.plannedDurationMs;
      this.pausedRemainingMs = null;
      this.suggestedBreakPhase = null;
      this.timer.startFocus(this.plannedDurationMs);
      return this._commit("focus-started");
    }

    startSuggestedBreak() {
      if (this.phase !== FocusSessionPhase.WaitingForBreak || !this.suggestedBreakPhase) {
        return this._failure("break-not-ready", "当前没有待开始的休息。");
      }
      const phase = this.suggestedBreakPhase;
      const duration = phase === FocusSessionPhase.LongBreak
        ? this.longBreakDurationMs
        : this.shortBreakDurationMs;
      const currentTime = this.now();
      this.phase = phase;
      this.status = FocusSessionStatus.Running;
      this.phaseStartedAt = currentTime;
      this.plannedDurationMs = duration;
      this.endsAt = currentTime + duration;
      this.pausedRemainingMs = null;
      this.suggestedBreakPhase = null;
      this.timer.startBreak(duration);
      return this._commit("break-started");
    }

    startBreak({ longBreak = false, durationMs, taskName } = {}) {
      if (this.phase === FocusSessionPhase.WaitingForBreak) {
        return this.startSuggestedBreak();
      }
      if (this.status === FocusSessionStatus.Running || this.status === FocusSessionStatus.Paused) {
        return this._failure("phase-active", "请先结束当前专注或休息。");
      }
      const currentTime = this.now();
      if (!this.sessionId) {
        this.sessionId = this.createId("focus-session");
        this.startedAt = currentTime;
        this.completedFocusRounds = 0;
      }
      this.taskName = text(taskName) || this.taskName;
      this.phase = longBreak ? FocusSessionPhase.LongBreak : FocusSessionPhase.ShortBreak;
      this.status = FocusSessionStatus.Running;
      this.phaseStartedAt = currentTime;
      this.plannedDurationMs = positiveNumber(
        durationMs,
        longBreak ? this.longBreakDurationMs : this.shortBreakDurationMs,
      );
      this.endsAt = currentTime + this.plannedDurationMs;
      this.pausedRemainingMs = null;
      this.suggestedBreakPhase = null;
      this.timer.startBreak(this.plannedDurationMs);
      return this._commit("break-started");
    }

    pause() {
      if (this.status !== FocusSessionStatus.Running || !this._isTimedPhase()) {
        return this._failure("not-running", "当前没有可暂停的专注或休息。");
      }
      this.timer.pause();
      this.pausedRemainingMs = this.timer.remainingMs;
      this.endsAt = null;
      this.status = FocusSessionStatus.Paused;
      return this._commit("phase-paused");
    }

    resume() {
      if (this.status !== FocusSessionStatus.Paused || !this._isTimedPhase()) {
        return this._failure("not-paused", "当前没有已暂停的专注或休息。");
      }
      this.timer.resume();
      this.endsAt = this.timer.endAt;
      this.pausedRemainingMs = null;
      this.status = FocusSessionStatus.Running;
      return this._commit("phase-resumed");
    }

    interruptFocus() {
      if (this.phase !== FocusSessionPhase.Focus
        || (this.status !== FocusSessionStatus.Running && this.status !== FocusSessionStatus.Paused)) {
        return this._failure("focus-not-active", "当前没有可结束的专注。");
      }
      const actualDurationMs = Math.max(0, this.plannedDurationMs - this._remainingMs());
      this._appendRecord("interrupted", actualDurationMs);
      this._resetSession();
      return this._commit("session-interrupted");
    }

    skipBreak() {
      if (this.phase === FocusSessionPhase.WaitingForBreak) {
        this.phase = FocusSessionPhase.WaitingForFocus;
        this.status = FocusSessionStatus.Waiting;
        this.suggestedBreakPhase = null;
        this.endsAt = null;
        this.pausedRemainingMs = null;
        return this._commit("break-skipped");
      }
      if (!this._isBreakPhase()) {
        return this._failure("break-not-active", "当前没有可跳过的休息。");
      }
      const actualDurationMs = Math.max(0, this.plannedDurationMs - this._remainingMs());
      this._appendRecord("skipped", actualDurationMs);
      this.timer.reset();
      this.phase = FocusSessionPhase.WaitingForFocus;
      this.status = FocusSessionStatus.Waiting;
      this.endsAt = null;
      this.pausedRemainingMs = null;
      this.suggestedBreakPhase = null;
      return this._commit("break-skipped");
    }

    reset() {
      this._resetSession();
      return this._commit("session-reset");
    }

    tick() {
      if (this.status !== FocusSessionStatus.Running || !this._isTimedPhase()) {
        return { finished: false, snapshot: this.snapshot() };
      }
      const result = this.timer.tick();
      if (!result.finished) {
        return { finished: false, snapshot: this.snapshot() };
      }

      const finishedPhase = this.phase;
      this._appendRecord("completed", this.plannedDurationMs);
      this.endsAt = null;
      this.pausedRemainingMs = null;
      if (finishedPhase === FocusSessionPhase.Focus) {
        this.completedFocusRounds += 1;
        this.suggestedBreakPhase = this.completedFocusRounds % this.roundsBeforeLongBreak === 0
          ? FocusSessionPhase.LongBreak
          : FocusSessionPhase.ShortBreak;
        this.phase = FocusSessionPhase.WaitingForBreak;
      } else {
        this.suggestedBreakPhase = null;
        this.phase = FocusSessionPhase.WaitingForFocus;
      }
      this.status = FocusSessionStatus.Waiting;
      const committed = this._commit("phase-completed");
      return { finished: true, snapshot: committed.snapshot };
    }

    _remainingMs() {
      if (this.status === FocusSessionStatus.Paused) {
        return Math.max(0, Number(this.pausedRemainingMs) || 0);
      }
      if (this.status === FocusSessionStatus.Running && Number.isFinite(this.endsAt)) {
        return Math.max(0, this.endsAt - this.now());
      }
      if (this.phase === FocusSessionPhase.Idle) {
        return this.focusDurationMs;
      }
      return 0;
    }

    _isTimedPhase() {
      return this.phase === FocusSessionPhase.Focus || this._isBreakPhase();
    }

    _isBreakPhase() {
      return this.phase === FocusSessionPhase.ShortBreak
        || this.phase === FocusSessionPhase.LongBreak;
    }

    _appendRecord(result, actualDurationMs) {
      const completedAt = this.now();
      const transitionKey = [this.sessionId, this.phase, this.phaseStartedAt, result].join(":");
      if (this._records.some((record) => record.transitionKey === transitionKey)) {
        return false;
      }
      this._records.push({
        id: this.createId("focus-record"),
        transitionKey,
        sessionId: this.sessionId,
        task: this.taskName,
        taskName: this.taskName,
        phase: this.phase,
        result,
        plannedDurationMs: this.plannedDurationMs,
        actualDurationMs: Math.max(0, Number(actualDurationMs) || 0),
        focusDurationMs: this.phase === FocusSessionPhase.Focus
          ? Math.max(0, Number(actualDurationMs) || 0)
          : 0,
        startedAt: this.phaseStartedAt,
        completedAt: new Date(completedAt).toISOString(),
        roundNumber: this.completedFocusRounds + (this.phase === FocusSessionPhase.Focus ? 1 : 0),
      });
      return true;
    }

    _restore(session) {
      if (!this._isRestorableSession(session)) return;

      this.focusDurationMs = positiveNumber(session.focusDurationMs, this.focusDurationMs);
      this.shortBreakDurationMs = positiveNumber(
        session.shortBreakDurationMs,
        this.shortBreakDurationMs,
      );
      this.longBreakDurationMs = positiveNumber(session.longBreakDurationMs, this.longBreakDurationMs);
      this.roundsBeforeLongBreak = positiveInteger(
        session.roundsBeforeLongBreak,
        this.roundsBeforeLongBreak,
      );
      this.timer.setDurations({
        focusDurationMs: this.focusDurationMs,
        breakDurationMs: this.shortBreakDurationMs,
      });
      this.revision = Math.max(0, Math.round(Number(session.revision) || 0));
      this.sessionId = session.sessionId;
      this.taskName = text(session.taskName);
      this.phase = session.phase;
      this.status = session.status;
      this.startedAt = Number(session.startedAt);
      this.phaseStartedAt = Number(session.phaseStartedAt);
      this.endsAt = session.endsAt == null ? null : Number(session.endsAt);
      this.pausedRemainingMs = session.pausedRemainingMs == null
        ? null
        : Number(session.pausedRemainingMs);
      this.plannedDurationMs = positiveNumber(
        session.plannedDurationMs,
        this._durationForPhase(session.phase),
      );
      this.completedFocusRounds = Math.max(0, Math.round(Number(session.completedFocusRounds) || 0));
      this.suggestedBreakPhase = session.suggestedBreakPhase === FocusSessionPhase.LongBreak
        ? FocusSessionPhase.LongBreak
        : session.suggestedBreakPhase === FocusSessionPhase.ShortBreak
          ? FocusSessionPhase.ShortBreak
          : null;
      this.updatedAt = Number.isFinite(Number(session.updatedAt))
        ? Number(session.updatedAt)
        : this.now();

      if (this.status === FocusSessionStatus.Waiting) return;

      if (this.status === FocusSessionStatus.Paused) {
        this._startTimerForPhase(this.pausedRemainingMs);
        this.timer.pause();
        return;
      }

      const remainingMs = this.endsAt - this.now();
      if (remainingMs > 0) {
        this._startTimerForPhase(remainingMs);
        return;
      }

      const finishedPhase = this.phase;
      this._appendRecord("completed", this.plannedDurationMs);
      this.endsAt = null;
      this.pausedRemainingMs = null;
      if (finishedPhase === FocusSessionPhase.Focus) {
        this.completedFocusRounds += 1;
        this.suggestedBreakPhase = this.completedFocusRounds % this.roundsBeforeLongBreak === 0
          ? FocusSessionPhase.LongBreak
          : FocusSessionPhase.ShortBreak;
        this.phase = FocusSessionPhase.WaitingForBreak;
      } else {
        this.suggestedBreakPhase = null;
        this.phase = FocusSessionPhase.WaitingForFocus;
      }
      this.status = FocusSessionStatus.Waiting;
      this._commit("phase-completed-restored");
    }

    _isRestorableSession(session) {
      if (!session || typeof session !== "object" || session.version !== SESSION_VERSION) {
        return false;
      }
      if (typeof session.sessionId !== "string" || !session.sessionId) return false;
      const timedPhase = session.phase === FocusSessionPhase.Focus
        || session.phase === FocusSessionPhase.ShortBreak
        || session.phase === FocusSessionPhase.LongBreak;
      const waitingPhase = session.phase === FocusSessionPhase.WaitingForBreak
        || session.phase === FocusSessionPhase.WaitingForFocus;
      if (!Number.isFinite(Number(session.startedAt)) || !Number.isFinite(Number(session.phaseStartedAt))) {
        return false;
      }
      if (session.status === FocusSessionStatus.Running) {
        return timedPhase && Number.isFinite(Number(session.endsAt));
      }
      if (session.status === FocusSessionStatus.Paused) {
        return timedPhase && positiveNumber(session.pausedRemainingMs, 0) > 0;
      }
      return session.status === FocusSessionStatus.Waiting && waitingPhase;
    }

    _durationForPhase(phase) {
      if (phase === FocusSessionPhase.LongBreak) return this.longBreakDurationMs;
      if (phase === FocusSessionPhase.ShortBreak) return this.shortBreakDurationMs;
      return this.focusDurationMs;
    }

    _startTimerForPhase(durationMs) {
      if (this.phase === FocusSessionPhase.Focus) {
        this.timer.startFocus(durationMs);
      } else {
        this.timer.startBreak(durationMs);
      }
    }

    _resetSession() {
      this.timer.reset();
      this.sessionId = null;
      this.taskName = "";
      this.phase = FocusSessionPhase.Idle;
      this.status = FocusSessionStatus.Idle;
      this.startedAt = null;
      this.phaseStartedAt = null;
      this.endsAt = null;
      this.pausedRemainingMs = null;
      this.plannedDurationMs = this.focusDurationMs;
      this.completedFocusRounds = 0;
      this.suggestedBreakPhase = null;
    }

    _failure(code, message) {
      return { success: false, code, message, snapshot: this.snapshot() };
    }

    _commit(eventType) {
      this.revision += 1;
      this.updatedAt = this.now();
      const snapshot = this.snapshot();
      const payload = { type: eventType, snapshot, records: this.records() };
      for (const listener of this._subscribers) listener(snapshot);
      for (const listener of this._eventListeners) listener(payload);
      if (this._onPersist) this._onPersist(payload);
      return { success: true, snapshot };
    }
  }

  const api = {
    FocusSessionController,
    FocusSessionPhase,
    FocusSessionStatus,
    SESSION_VERSION,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DeskpetFocusSession = api;
})(typeof window !== "undefined" ? window : globalThis);
