const assert = require("node:assert/strict");
const test = require("node:test");

const { PetStateController } = require("../src/renderer/pet-state-controller");

function fixedRelationship() {
  return "亲密";
}

test("relationship status is fixed and does not depend on affinity", () => {
  const low = new PetStateController({ initialAffinity: 0, initialMood: 50, initialEnergy: 100 });
  const high = new PetStateController({ initialAffinity: 999, initialMood: 50, initialEnergy: 100 });
  assert.equal(fixedRelationship(), "亲密");
  assert.equal(fixedRelationship(), "亲密");
  assert.notEqual(fixedRelationship(), null);
});

test("changing affinity does not change the relationship label", () => {
  const state = new PetStateController({ initialAffinity: 0, initialMood: 50, initialEnergy: 100 });
  state.affinity = 500;
  assert.equal(fixedRelationship(), "亲密");
  state.affinity = 999;
  assert.equal(fixedRelationship(), "亲密");
});
