const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHoldVisualLock,
} = require("../src/renderer/hold-visual-lock");

function createElementStub(rect) {
  return {
    style: {},
    getBoundingClientRect() {
      return rect;
    },
  };
}

test("freezes and restores the current visual box while the pointer is held", () => {
  const pet = createElementStub({ width: 312.4, height: 420.8, left: 100, bottom: 0 });
  const lock = createHoldVisualLock(pet);

  assert.equal(lock.isLocked(), false);
  lock.lock();

  assert.equal(lock.isLocked(), true);
  assert.equal(pet.style.width, "312px");
  assert.equal(pet.style.height, "421px");
  assert.equal(pet.style.transform, "none");
  assert.equal(pet.style.transition, "none");

  lock.unlock();
  assert.equal(lock.isLocked(), false);
});

test("ignores repeated lock calls so held pointer cannot accumulate visual size", () => {
  const pet = createElementStub({ width: 300, height: 400, left: 0, bottom: 0 });
  const lock = createHoldVisualLock(pet);

  lock.lock();
  pet.getBoundingClientRect = () => ({ width: 999, height: 999, left: 0, bottom: 0 });
  lock.lock();

  assert.equal(pet.style.width, "300px");
  assert.equal(pet.style.height, "400px");
});
