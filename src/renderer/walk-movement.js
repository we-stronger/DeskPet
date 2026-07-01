(function attachWalkMovement(root) {
  class WalkMovement {
    constructor({ stepPx = 3, maxDistancePx = 96, direction = 1 } = {}) {
      this.stepPx = stepPx;
      this.maxDistancePx = maxDistancePx;
      this.walkDirection = direction < 0 ? -1 : 1;
      this.distancePx = 0;
      this.active = false;
    }

    start() {
      this.distancePx = 0;
      this.active = true;
      return { dx: 0, dy: 0, active: this.active };
    }

    step() {
      if (!this.active) {
        return { dx: 0, dy: 0, active: false };
      }

      const remaining = this.maxDistancePx - this.distancePx;
      const distance = Math.min(this.stepPx, Math.max(0, remaining));
      const dx = distance * this.walkDirection;
      this.distancePx += distance;
      this.active = this.distancePx < this.maxDistancePx;
      return { dx, dy: 0, active: this.active };
    }

    direction() {
      return this.walkDirection;
    }

    turnAround() {
      this.walkDirection *= -1;
      return this.walkDirection;
    }

    stop() {
      this.active = false;
      return { dx: 0, dy: 0, active: false };
    }
  }

  class WalkMovementRunner {
    constructor({
      movement = new WalkMovement(),
      moveBy,
      intervalMs = 120,
      setIntervalFn = (callback, ms) => setInterval(callback, ms),
      clearIntervalFn = (id) => clearInterval(id),
    }) {
      this.movement = movement;
      this.moveBy = moveBy;
      this.intervalMs = intervalMs;
      this.setIntervalFn = setIntervalFn;
      this.clearIntervalFn = clearIntervalFn;
      this.timer = 0;
      this.intervalMultiplier = 1;
    }

    start() {
      this.stop();
      this.movement.start();
      this.timer = this.setIntervalFn(() => {
        const result = this.movement.step();
        if (result.dx || result.dy) {
          Promise.resolve(this.moveBy(result.dx, result.dy)).then((moveResult) => {
            if (moveResult?.blockedX) {
              this.movement.turnAround();
            }
          });
        }
        if (!result.active) {
          this.stop();
        }
      }, this.intervalMs * this.intervalMultiplier);
    }

    setReduced(reduced) {
      this.intervalMultiplier = reduced ? 3 : 1;
    }

    stop() {
      if (this.timer) {
        this.clearIntervalFn(this.timer);
      }
      this.timer = 0;
      this.movement.stop();
    }

    direction() {
      return this.movement.direction();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { WalkMovement, WalkMovementRunner };
  }
  root.WalkMovementRunner = WalkMovementRunner;
  root.WalkMovement = WalkMovement;
})(typeof window !== "undefined" ? window : globalThis);
