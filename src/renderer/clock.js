(function attachClock(root) {
  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

  class Clock {
    constructor({ now = () => new Date() } = {}) {
      this.now = now;
    }

    pad(value) {
      return String(value).padStart(2, "0");
    }

    formatTime(date) {
      const d = date || this.now();
      return `${this.pad(d.getHours())}:${this.pad(d.getMinutes())}`;
    }

    formatDate(date) {
      const d = date || this.now();
      const w = WEEKDAYS[d.getDay()];
      return `${this.pad(d.getMonth() + 1)}/${this.pad(d.getDate())} 周${w}`;
    }

    format(date) {
      return `${this.formatDate(date)} ${this.formatTime(date)}`;
    }
  }

  const api = { Clock };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetClock = api;
})(typeof window !== "undefined" ? window : globalThis);