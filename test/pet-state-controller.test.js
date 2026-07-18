const assert = require("node:assert/strict");
const test = require("node:test");

const { PetStateController } = require("../src/renderer/pet-state-controller");

test("tap increases mood and returns tap feedback", () => {
  const state = new PetStateController({ now: () => 1000 });

  const result = state.interact("tap");

  assert.equal(result.action, "tap");
  assert.equal(result.mood, 55);
  assert.equal(result.affinity, 1);
});

test("repeated taps eventually trigger happy feedback", () => {
  const state = new PetStateController({ now: () => 1000 });

  let result;
  for (let i = 0; i < 6; i += 1) {
    result = state.interact("tap");
  }

  assert.equal(result.action, "happy");
  assert.equal(result.mood, 80);
});

test("tracks tap combo and resets it after a quiet interval", () => {
  let time = 1000;
  const state = new PetStateController({
    comboResetMs: 1200,
    now: () => time,
  });

  assert.equal(state.interact("tap").combo, 1);
  time = 1600;
  assert.equal(state.interact("tap").combo, 2);
  time = 4000;
  assert.equal(state.interact("tap").combo, 1);
});

test("too many rapid taps trigger cute pout feedback", () => {
  let time = 1000;
  const state = new PetStateController({
    comboResetMs: 2000,
    now: () => time,
  });

  let result;
  for (let i = 0; i < 8; i += 1) {
    time += 100;
    result = state.interact("tap");
  }

  assert.equal(result.action, "pout");
  assert.equal(result.combo, 8);
});
test("enters sleep after idle timeout and wakes on interaction", () => {
  let time = 0;
  const state = new PetStateController({
    sleepAfterMs: 3000,
    now: () => time,
  });

  time = 3001;
  assert.deepEqual(state.tick(), { action: "sleep" });

  time = 3500;
  assert.deepEqual(state.interact("tap"), {
    action: "idle",
    mood: 50,
    affinity: 0,
    energy: 100,
  });
});

test("can request a random walk only while awake and idle", () => {
  const state = new PetStateController({
    random: () => 0.01,
    walkChance: 0.02,
  });

  assert.deepEqual(state.tick(), { action: "walk" });
});

test("focus context suppresses random walking and keeps a quiet idle action", () => {
  const state = new PetStateController({
    now: () => 1000,
    random: () => 0,
    walkChance: 1,
  });

  assert.deepEqual(state.tick({ focusActive: true }), { action: "idle", reason: "focus" });
});

test("uses a cooldown between random walk requests", () => {
  let time = 0;
  const state = new PetStateController({
    random: () => 0.01,
    walkChance: 0.02,
    walkCooldownMs: 5000,
    now: () => time,
  });

  assert.deepEqual(state.tick(), { action: "walk" });
  time = 1000;
  assert.deepEqual(state.tick(), { action: "idle" });
  time = 6000;
  assert.deepEqual(state.tick(), { action: "walk" });
});

test("tracks energy and sleeps when energy is low", () => {
  let time = 0;
  const state = new PetStateController({
    initialEnergy: 2,
    energyDrainPerTick: 1,
    sleepAfterMs: 999999,
    random: () => 1,
    now: () => time,
  });

  assert.deepEqual(state.tick(), { action: "idle" });
  time = 1000;
  assert.deepEqual(state.tick(), { action: "sleep" });
  assert.equal(state.energy, 0);

  time = 2000;
  assert.deepEqual(state.interact("tap"), {
    action: "idle",
    mood: 50,
    affinity: 0,
    energy: 25,
  });
});

test("reduces energy on interaction and increases affinity", () => {
  const state = new PetStateController({
    initialEnergy: 100,
    interactionEnergyCost: 8,
    now: () => 1000,
  });

  assert.deepEqual(state.interact("happy"), {
    action: "happy",
    mood: 60,
    affinity: 2,
    energy: 92,
  });
});

test("feed restores energy and petting improves mood and affinity", () => {
  const state = new PetStateController({
    initialMood: 40,
    initialAffinity: 3,
    initialEnergy: 50,
    now: () => 1000,
  });

  assert.deepEqual(state.interact("feed"), {
    action: "happy",
    mood: 43,
    affinity: 4,
    energy: 75,
    combo: 0,
  });

  assert.deepEqual(state.interact("pet"), {
    action: "happy",
    mood: 51,
    affinity: 6,
    energy: 74,
    combo: 0,
  });
});
test("recovers energy while sleeping", () => {
  const state = new PetStateController({
    initialEnergy: 20,
    initialSleeping: true,
    sleepEnergyRecoveryPerTick: 15,
  });

  assert.deepEqual(state.tick(), { action: "sleep" });
  assert.equal(state.energy, 35);
});

test("serializes and restores pet state", () => {
  const state = new PetStateController({
    initialMood: 66,
    initialAffinity: 12,
    initialEnergy: 44,
    initialSleeping: true,
  });

  assert.deepEqual(state.snapshot(), {
    mood: 66,
    affinity: 12,
    energy: 44,
    sleeping: true,
    dailyState: {
      lastActiveDate: null,
      dailyTapCount: 0,
      dailyFeedCount: 0,
      dailyPetCount: 0,
      streakDays: 0,
      lastGreetingDate: null,
    },
  });

  const restored = new PetStateController({
    initialState: {
      mood: 70.4,
      affinity: 9.8,
      energy: 25.2,
      sleeping: false,
    },
  });

  assert.deepEqual(restored.snapshot(), {
    mood: 70,
    affinity: 10,
    energy: 25,
    sleeping: false,
    dailyState: {
      lastActiveDate: null,
      dailyTapCount: 0,
      dailyFeedCount: 0,
      dailyPetCount: 0,
      streakDays: 0,
      lastGreetingDate: null,
    },
  });
});

test("uses mood and affinity to choose automatic feedback actions", () => {
  const happyState = new PetStateController({
    initialMood: 90,
    initialAffinity: 8,
    sleepAfterMs: 999999,
    random: () => 1,
  });

  assert.deepEqual(happyState.tick(), { action: "happy" });

  const poutState = new PetStateController({
    initialMood: 15,
    initialAffinity: 0,
    sleepAfterMs: 999999,
    random: () => 1,
  });

  assert.deepEqual(poutState.tick(), { action: "pout" });
});

test("gift interaction increases mood and affinity and plays happy", () => {
  const state = new PetStateController({
    initialMood: 40,
    initialAffinity: 3,
    initialEnergy: 50,
    now: () => 1000,
  });
  assert.deepEqual(state.interact("gift"), {
    action: "happy",
    mood: 48,
    affinity: 7,
    energy: 50,
    combo: 0,
  });
});

test("milktea interaction adds energy and checks late-night flag", () => {
  const state = new PetStateController({
    initialMood: 30,
    initialAffinity: 2,
    initialEnergy: 30,
    now: () => 1000,
  });
  const result = state.interact("milktea", { hour: 3 });
  assert.equal(result.action, "happy");
  assert.equal(result.mood, 36);
  assert.equal(result.affinity, 4);
  assert.equal(result.energy, 38);
  assert.equal(result.lateNight, true);
});

test("milktea during day does not flag late-night", () => {
  const state = new PetStateController({
    initialMood: 30,
    initialAffinity: 2,
    initialEnergy: 30,
    now: () => 1000,
  });
  const result = state.interact("milktea", { hour: 14 });
  assert.equal(result.lateNight, false);
});

test("rest interaction transitions into sleep", () => {
  const state = new PetStateController({
    initialMood: 50,
    initialAffinity: 5,
    initialEnergy: 40,
    now: () => 1000,
  });
  const result = state.interact("rest");
  assert.equal(result.action, "sleep");
  assert.equal(state.sleeping, true);
});

test("wake interaction returns a different message based on energy", () => {
  const lowEnergy = new PetStateController({
    initialMood: 50,
    initialAffinity: 5,
    initialEnergy: 20,
    initialSleeping: true,
    now: () => 1000,
  });
  const lowResult = lowEnergy.interact("wake");
  assert.equal(lowResult.action, "sleep");
  assert.equal(lowResult.bubble, "wake-sleepy");

  const okEnergy = new PetStateController({
    initialMood: 50,
    initialAffinity: 5,
    initialEnergy: 60,
    initialSleeping: true,
    now: () => 1000,
  });
  const okResult = okEnergy.interact("wake");
  assert.equal(okResult.action, "idle");
  assert.equal(okResult.bubble, "wake-normal");
  assert.equal(okEnergy.sleeping, false);
});

test("tap still records daily counters", () => {
  const state = new PetStateController({
    initialMood: 50,
    initialAffinity: 5,
    initialEnergy: 50,
    now: () => 1000,
  });
  state.interact("tap");
  state.interact("feed");
  state.interact("pet");
  assert.equal(state.snapshot().dailyState.dailyTapCount, 1);
  assert.equal(state.snapshot().dailyState.dailyFeedCount, 1);
  assert.equal(state.snapshot().dailyState.dailyPetCount, 1);
});
