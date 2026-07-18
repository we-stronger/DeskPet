const assert = require("node:assert/strict");
const test = require("node:test");

const { createFramePreloader } = require("../src/renderer/frame-preload");

test("frame preloader deduplicates image creation and marks frames ready", async () => {
  const images = [];
  class FakeImage {
    constructor() {
      images.push(this);
    }
    set src(value) {
      this.url = value;
      queueMicrotask(() => this.onload?.());
    }
  }
  const preloader = createFramePreloader({ ImageCtor: FakeImage });
  const first = preloader.preload("frames/idle/idle_01.png");
  const second = preloader.preload("frames/idle/idle_01.png");

  assert.equal(images.length, 1);
  await Promise.all([first, second]);
  assert.equal(preloader.has("frames/idle/idle_01.png"), true);
});

test("frame preloader exposes readiness so renderers can keep the previous frame until the next is loaded", async () => {
  const pending = [];
  class FakeImage {
    set src(value) {
      pending.push({ value, image: this });
    }
  }
  const preloader = createFramePreloader({ ImageCtor: FakeImage });
  const promise = preloader.preload("frame-2.png");
  assert.equal(preloader.isReady("frame-2.png"), false);
  pending[0].image.onload();
  assert.equal(await promise, true);
  assert.equal(preloader.isReady("frame-2.png"), true);
});
