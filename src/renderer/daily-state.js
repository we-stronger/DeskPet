(function attachDailyState(root) {
  function toLocalDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function daysBetween(prevString, nextDate) {
    if (!prevString) return null;
    const [y, m, d] = prevString.split("-").map(Number);
    const prev = new Date(y, m - 1, d).getTime();
    return Math.round((nextDate.getTime() - prev) / 86400000);
  }

  class DailyState {
    constructor({ now = () => new Date(), initialState } = {}) {
      this.now = now;
      const today = toLocalDateString(new Date(now()));
      const state = initialState && typeof initialState === "object" ? initialState : {};
      this.lastActiveDate = typeof state.lastActiveDate === "string" ? state.lastActiveDate : null;
      this.dailyTapCount = Number.isFinite(state.dailyTapCount) ? state.dailyTapCount : 0;
      this.dailyFeedCount = Number.isFinite(state.dailyFeedCount) ? state.dailyFeedCount : 0;
      this.dailyPetCount = Number.isFinite(state.dailyPetCount) ? state.dailyPetCount : 0;
      this.streakDays = Number.isFinite(state.streakDays) ? state.streakDays : 0;
      this.lastGreetingDate = typeof state.lastGreetingDate === "string" ? state.lastGreetingDate : null;
      this._today = today;
    }

    touch() {
      const todayDate = new Date(this.now());
      const today = toLocalDateString(todayDate);
      this._today = today;
      if (this.lastActiveDate === today) {
        return this.snapshot();
      }
      const gap = daysBetween(this.lastActiveDate, todayDate);
      if (gap === 1) {
        this.streakDays += 1;
      } else {
        this.streakDays = 1;
      }
      this.lastActiveDate = today;
      this.dailyTapCount = 0;
      this.dailyFeedCount = 0;
      this.dailyPetCount = 0;
      return this.snapshot();
    }

    recordTap() { this.touch(); this.dailyTapCount += 1; }
    recordFeed() { this.touch(); this.dailyFeedCount += 1; }
    recordPet() { this.touch(); this.dailyPetCount += 1; }

    shouldGreet() {
      return this.lastGreetingDate !== this._today;
    }

    markGreeted() {
      this.lastGreetingDate = this._today;
    }

    snapshot() {
      return {
        lastActiveDate: this.lastActiveDate,
        dailyTapCount: this.dailyTapCount,
        dailyFeedCount: this.dailyFeedCount,
        dailyPetCount: this.dailyPetCount,
        streakDays: this.streakDays,
        lastGreetingDate: this.lastGreetingDate,
      };
    }
  }

  const api = { DailyState, toLocalDateString };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetDailyState = api;
})(typeof window !== "undefined" ? window : globalThis);