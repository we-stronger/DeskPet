(function attachPetStateController(root) {
  const DailyState =
    (root.DeskpetDailyState && root.DeskpetDailyState.DailyState) ||
    (typeof require === "function" ? require("./daily-state").DailyState : null);
  if (!DailyState) {
    throw new Error("PetStateController requires DailyState; ensure daily-state.js is loaded first");
  }

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function normalizeState(state = {}) {
    return {
      mood: clampNumber(state.mood, 50, 0, 100),
      affinity: clampNumber(state.affinity, 0, 0, 999),
      energy: clampNumber(state.energy, 100, 0, 100),
      sleeping: state.sleeping === true,
    };
  }

  class PetStateController {
    constructor({
      initialMood = 50,
      initialAffinity = 0,
      initialEnergy = 100,
      initialSleeping = false,
      initialState = null,
      sleepAfterMs = 5 * 60 * 1000,
      walkChance = 0.08,
      walkCooldownMs = 45000,
      energyDrainPerTick = 0,
      sleepEnergyRecoveryPerTick = 6,
      happyMoodThreshold = 85,
      happyAffinityThreshold = 5,
      poutMoodThreshold = 20,
      interactionEnergyCost = 4,
      wakeEnergy = 25,
      comboResetMs = 1800,
      poutComboThreshold = 8,
      now = () => Date.now(),
      random = () => Math.random(),
    } = {}) {
      const restoredState = normalizeState(initialState || {
        mood: initialMood,
        affinity: initialAffinity,
        energy: initialEnergy,
        sleeping: initialSleeping,
      });

      this.mood = restoredState.mood;
      this.affinity = restoredState.affinity;
      this.energy = restoredState.energy;
      this.sleepAfterMs = sleepAfterMs;
      this.walkChance = walkChance;
      this.walkCooldownMs = walkCooldownMs;
      this.energyDrainPerTick = energyDrainPerTick;
      this.sleepEnergyRecoveryPerTick = sleepEnergyRecoveryPerTick;
      this.happyMoodThreshold = happyMoodThreshold;
      this.happyAffinityThreshold = happyAffinityThreshold;
      this.poutMoodThreshold = poutMoodThreshold;
      this.interactionEnergyCost = interactionEnergyCost;
      this.wakeEnergy = wakeEnergy;
      this.comboResetMs = comboResetMs;
      this.poutComboThreshold = poutComboThreshold;
      this.now = now;
      this.random = random;
      this.lastInteractionAt = this.now();
      this.lastWalkAt = Number.NEGATIVE_INFINITY;
      this.lastTapAt = Number.NEGATIVE_INFINITY;
      this.tapCombo = 0;
      this.sleeping = restoredState.sleeping;
      this.dailyState = new DailyState({
        now,
        initialState: (initialState && initialState.dailyState) || null,
      });
    }

    snapshot() {
      return {
        mood: this.mood,
        affinity: this.affinity,
        energy: this.energy,
        sleeping: this.sleeping,
        dailyState: this.dailyState.snapshot(),
      };
    }

    combo() {
      return this.tapCombo;
    }

    loadState(state) {
      const restoredState = normalizeState(state);
      this.mood = restoredState.mood;
      this.affinity = restoredState.affinity;
      this.energy = restoredState.energy;
      this.sleeping = restoredState.sleeping;
      this.lastInteractionAt = this.now();
      this.resetCombo();
      return this.snapshot();
    }

    result(action, includeCombo = false) {
      const result = {
        action,
        mood: this.mood,
        affinity: this.affinity,
        energy: this.energy,
      };
      if (includeCombo) {
        result.combo = this.tapCombo;
      }
      return result;
    }

    resetCombo() {
      this.tapCombo = 0;
      this.lastTapAt = Number.NEGATIVE_INFINITY;
    }

    bumpDaily(kind) {
      if (kind === "tap") this.dailyState.recordTap();
      if (kind === "feed") this.dailyState.recordFeed();
      if (kind === "pet") this.dailyState.recordPet();
    }

    updateTapCombo() {
      const currentTime = this.now();
      if (currentTime - this.lastTapAt <= this.comboResetMs) {
        this.tapCombo += 1;
      } else {
        this.tapCombo = 1;
      }
      this.lastTapAt = currentTime;
      return this.tapCombo;
    }

    changeEnergy(delta) {
      this.energy = Math.max(0, Math.min(100, this.energy + delta));
    }

    interact(kind, ctx = {}) {
      this.lastInteractionAt = this.now();

      if (kind === "wake") {
        if (!this.sleeping) {
          return this.result("idle");
        }
        if (this.energy < this.wakeEnergy) {
          const r = this.result("sleep");
          r.bubble = "wake-sleepy";
          return r;
        }
        this.sleeping = false;
        this.lastInteractionAt = this.now();
        this.resetCombo();
        const r = this.result("idle");
        r.bubble = "wake-normal";
        return r;
      }

      if (this.sleeping) {
        this.sleeping = false;
        this.energy = Math.max(this.energy, this.wakeEnergy);
        this.resetCombo();
        return this.result("idle");
      }

      if (kind === "tap") {
        const combo = this.updateTapCombo();
        this.mood = Math.min(100, this.mood + 5);
        this.affinity = Math.min(999, this.affinity + 1);
        this.changeEnergy(-this.interactionEnergyCost);
        this.bumpDaily("tap");
        if (combo >= this.poutComboThreshold) {
          return this.result("pout", true);
        }
        return this.result(this.mood >= 80 ? "happy" : "tap", true);
      }

      if (kind === "feed") {
        this.resetCombo();
        this.mood = Math.min(100, this.mood + 3);
        this.affinity = Math.min(999, this.affinity + 1);
        this.changeEnergy(25);
        this.bumpDaily("feed");
        return this.result("happy", true);
      }

      if (kind === "pet") {
        this.resetCombo();
        this.mood = Math.min(100, this.mood + 8);
        this.affinity = Math.min(999, this.affinity + 2);
        this.changeEnergy(-1);
        this.bumpDaily("pet");
        return this.result("happy", true);
      }

      if (kind === "pout") {
        this.resetCombo();
        this.mood = Math.max(0, this.mood - 10);
        this.affinity = Math.max(0, this.affinity - 1);
        this.changeEnergy(-this.interactionEnergyCost);
        return this.result("pout");
      }

      if (kind === "happy") {
        this.resetCombo();
        this.mood = Math.min(100, this.mood + 10);
        this.affinity = Math.min(999, this.affinity + 2);
        this.changeEnergy(-this.interactionEnergyCost);
        return this.result("happy");
      }

      if (kind === "gift") {
        this.mood = Math.min(100, this.mood + 8);
        this.affinity = Math.min(999, this.affinity + 4);
        this.resetCombo();
        return this.result("happy", true);
      }

      if (kind === "milktea") {
        const hour = Number.isFinite(ctx.hour) ? ctx.hour : new Date().getHours();
        const lateNight = hour >= 23 || hour < 5;
        this.mood = Math.min(100, this.mood + 6);
        this.affinity = Math.min(999, this.affinity + 2);
        this.changeEnergy(8);
        this.resetCombo();
        const r = this.result("happy", true);
        r.lateNight = lateNight;
        return r;
      }

      if (kind === "rest") {
        this.sleeping = true;
        this.resetCombo();
        return this.result("sleep");
      }

      return this.result("idle");
    }

    tick(context = {}) {
      if (this.sleeping) {
        this.changeEnergy(this.sleepEnergyRecoveryPerTick);
        return { action: "sleep" };
      }

      this.changeEnergy(-this.energyDrainPerTick);
      if (this.energy <= 0) {
        this.sleeping = true;
        this.resetCombo();
        return { action: "sleep" };
      }

      if (this.now() - this.lastInteractionAt > this.sleepAfterMs) {
        this.sleeping = true;
        this.resetCombo();
        return { action: "sleep" };
      }

      if (context.focusActive === true) {
        return { action: "idle", reason: "focus" };
      }

      if (this.mood <= this.poutMoodThreshold) {
        return { action: "pout" };
      }

      if (this.mood >= this.happyMoodThreshold && this.affinity >= this.happyAffinityThreshold) {
        return { action: "happy" };
      }

      if (this.now() - this.lastWalkAt >= this.walkCooldownMs && this.random() < this.walkChance) {
        this.lastWalkAt = this.now();
        return { action: "walk" };
      }

      return { action: "idle" };
    }

    forceSleep() {
      this.sleeping = true;
      this.resetCombo();
      return this.result("sleep");
    }

    wake() {
      this.sleeping = false;
      this.lastInteractionAt = this.now();
      return this.result("idle");
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { PetStateController, normalizeState };
  }
  root.PetStateController = PetStateController;
})(typeof window !== "undefined" ? window : globalThis);
