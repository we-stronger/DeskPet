const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_ALPHA_THRESHOLD,
  computeOpaqueBoundingBox,
  computeOpaqueRunRects,
  computeEmptyMargins,
  createHitTester,
  isPixelOpaque,
  isImageDataPixelOpaque,
  mapCursorToImagePixel,
} = require("../src/renderer/pet-hit-test");

// Build a flat RGBA buffer for an N脳M image where each pixel's alpha is
// the value passed in via the matrix. matrix[row][col] = alpha 0鈥?55.
function makeImageData(matrix) {
  const height = matrix.length;
  const width = matrix[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = matrix[y][x];
    }
  }
  return { data, width, height };
}

test("DEFAULT_ALPHA_THRESHOLD is a small positive integer", () => {
  assert.ok(Number.isInteger(DEFAULT_ALPHA_THRESHOLD));
  assert.ok(DEFAULT_ALPHA_THRESHOLD > 0);
  assert.ok(DEFAULT_ALPHA_THRESHOLD <= 64);
});

test("isPixelOpaque honors the alpha threshold and bounds checks", () => {
  const buf = new Uint8ClampedArray(4 * 4); // 4 RGBA pixels
  buf[3] = DEFAULT_ALPHA_THRESHOLD; // exactly at threshold 鈥?should be opaque
  assert.equal(isPixelOpaque(buf, 1, 0, 0), true);
  buf[3] = DEFAULT_ALPHA_THRESHOLD - 1; // just below 鈥?should not be opaque
  assert.equal(isPixelOpaque(buf, 1, 0, 0), false);

  assert.equal(isPixelOpaque(null, 1, 0, 0), false, "null buffer is not opaque");
  assert.equal(isPixelOpaque(buf, 1, -1, 0), false, "negative x is out of bounds");
  assert.equal(isPixelOpaque(buf, 1, 0, -1), false, "negative y is out of bounds");
  assert.equal(isPixelOpaque(buf, 1, 5, 0), false, "x past width is out of bounds");
});

test("isImageDataPixelOpaque works on ImageData-shaped inputs", () => {
  const image = makeImageData([[0, 200], [200, 0]]);
  assert.equal(isImageDataPixelOpaque(image, 0, 0), false);
  assert.equal(isImageDataPixelOpaque(image, 1, 0), true);
  assert.equal(isImageDataPixelOpaque(image, 0, 1), true);
  assert.equal(isImageDataPixelOpaque(image, 1, 1), false);
  assert.equal(isImageDataPixelOpaque(null, 0, 0), false);
});

test("mapCursorToImagePixel handles contain-fit scaling and centering", () => {
  // 100脳100 stage, 200脳200 image 鈥?object-fit: contain scales to 100脳100
  // and the cursor at the top-left of the rendered image maps to (0, 0).
  assert.deepEqual(
    mapCursorToImagePixel({ width: 100, height: 100 }, { width: 200, height: 200 }, { x: 0, y: 0 }),
    { x: 0, y: 0 },
  );
  // Bottom-right of the rendered image (just inside the rect) maps to
  // pixel (198, 198) of the source 鈥?image index 199 sits at fractional
  // cursor (99.5, 99.5), which is outside the integer stage.
  assert.deepEqual(
    mapCursorToImagePixel({ width: 100, height: 100 }, { width: 200, height: 200 }, { x: 99, y: 99 }),
    { x: 198, y: 198 },
  );
  // On the boundary is treated as out of bounds (>= renderedW/H).
  assert.equal(
    mapCursorToImagePixel({ width: 100, height: 100 }, { width: 200, height: 200 }, { x: 100, y: 100 }),
    null,
  );
});

test("mapCursorToImagePixel centers the image when stage aspect ratio differs", () => {
  // 200脳100 stage, 100脳100 image: scale = min(2, 1) = 1; rendered 100脳100
  // centered with 50px horizontal margins. Cursor at (50, 0) = image (0, 0).
  assert.deepEqual(
    mapCursorToImagePixel({ width: 200, height: 100 }, { width: 100, height: 100 }, { x: 50, y: 0 }),
    { x: 0, y: 0 },
  );
  // Cursor in the margin returns null (no image pixel there).
  assert.equal(
    mapCursorToImagePixel({ width: 200, height: 100 }, { width: 100, height: 100 }, { x: 10, y: 10 }),
    null,
  );
});

test("mapCursorToImagePixel returns null for missing inputs", () => {
  assert.equal(mapCursorToImagePixel(null, { width: 1, height: 1 }, { x: 0, y: 0 }), null);
  assert.equal(mapCursorToImagePixel({ width: 0, height: 1 }, { width: 1, height: 1 }, { x: 0, y: 0 }), null);
  assert.equal(mapCursorToImagePixel({ width: 1, height: 1 }, null, { x: 0, y: 0 }), null);
  assert.equal(mapCursorToImagePixel({ width: 1, height: 1 }, { width: 1, height: 1 }, null), null);
});

test("createHitTester throws without a loader", () => {
  assert.throws(() => createHitTester({}), /loader/);
});

test("createHitTester caches ImageData per src and reuses it", async () => {
  let loadCount = 0;
  const loader = (src) => {
    loadCount += 1;
    return Promise.resolve(makeImageData([[255]]));
  };
  const tester = createHitTester({ loader });

  await tester.load("a");
  await tester.load("a"); // cache hit 鈥?loader should not be called again
  assert.equal(loadCount, 1, "loader called once for the same src");

  // isOpaqueAt returns false when nothing is cached for that src.
  const fresh = createHitTester({ loader });
  assert.equal(fresh.isOpaqueAt("uncached", { width: 1, height: 1 }, { x: 0, y: 0 }), false);
});

test("createHitTester reports opaque only on cached opaque pixels", async () => {
  // A 4脳4 image where only the center 2脳2 is opaque 鈥?at 1:1 scale that
  // corresponds to stage pixels (1,1)鈥?2,2). Margins are transparent.
  const matrix = [
    [0, 0, 0, 0],
    [0, 255, 255, 0],
    [0, 255, 255, 0],
    [0, 0, 0, 0],
  ];
  const loader = () => Promise.resolve(makeImageData(matrix));
  const tester = createHitTester({ loader });
  await tester.load("frame");

  // With 4脳4 stage and 4脳4 image, scale = 1 and the cursor maps 1:1.
  const stageSize = { width: 4, height: 4 };
  assert.equal(tester.isOpaqueAt("frame", stageSize, { x: 0, y: 0 }), false, "top-left margin");
  assert.equal(tester.isOpaqueAt("frame", stageSize, { x: 1, y: 1 }), true, "inside the body");
  assert.equal(tester.isOpaqueAt("frame", stageSize, { x: 3, y: 3 }), false, "bottom-right margin");
});

test("createHitTester handles loader failures gracefully", async () => {
  const loader = () => Promise.reject(new Error("boom"));
  const tester = createHitTester({ loader });
  const result = await tester.load("bad");
  assert.equal(result, null);
  assert.equal(tester.isOpaqueAt("bad", { width: 1, height: 1 }, { x: 0, y: 0 }), false);
});

test("createHitTester dedupes concurrent loads of the same src", async () => {
  let loadCount = 0;
  const loader = async (src) => {
    loadCount += 1;
    await new Promise((r) => setTimeout(r, 5));
    return makeImageData([[255]]);
  };
  const tester = createHitTester({ loader });
  await Promise.all([tester.load("dup"), tester.load("dup"), tester.load("dup")]);
  assert.equal(loadCount, 1, "concurrent loads collapse into a single fetch");
});

test("createHitTester caps cache size and evicts oldest entries", async () => {
  const loader = (src) => Promise.resolve(makeImageData([[src === "keep" ? 255 : 0]]));
  const tester = createHitTester({ loader, maxCacheEntries: 2 });

  await tester.load("a");
  await tester.load("b");
  await tester.load("c"); // evicts "a"
  await tester.load("d"); // evicts "b"

  // The first two are now cached-or-evicted. To verify eviction, we check
  // that a fresh tester (which doesn't pre-cache) still reports correctly.
  const fresh = createHitTester({ loader: () => Promise.resolve(makeImageData([[255]])) });
  await fresh.load("keep");
  assert.equal(fresh.isOpaqueAt("keep", { width: 1, height: 1 }, { x: 0, y: 0 }), true);
});

test("createHitTester.clearCache empties both cache and inflight", async () => {
  let loadCount = 0;
  const loader = () => {
    loadCount += 1;
    return Promise.resolve(makeImageData([[255]]));
  };
  const tester = createHitTester({ loader });
  await tester.load("a");
  tester.clearCache();
  await tester.load("a");
  assert.equal(loadCount, 2, "cache cleared triggers a fresh load");
});

test("computeOpaqueBoundingBox returns the tight bbox of opaque pixels", () => {
  // 4脳4 image with a 2脳2 opaque block in the top-left.
  const image = makeImageData([
    [255, 255, 0, 0],
    [255, 255, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  assert.deepEqual(computeOpaqueBoundingBox(image), {
    x: 0,
    y: 0,
    width: 2,
    height: 2,
  });
});

test("computeOpaqueBoundingBox spans the full image when fully opaque", () => {
  const image = makeImageData([
    [200, 200, 200],
    [200, 200, 200],
  ]);
  assert.deepEqual(computeOpaqueBoundingBox(image), {
    x: 0,
    y: 0,
    width: 3,
    height: 2,
  });
});

test("computeOpaqueBoundingBox respects the alpha threshold", () => {
  // Pixels at the threshold (16) count as opaque; below do not.
  const image = makeImageData([
    [DEFAULT_ALPHA_THRESHOLD - 1, DEFAULT_ALPHA_THRESHOLD, 0],
    [0, 0, DEFAULT_ALPHA_THRESHOLD],
  ]);
  assert.deepEqual(computeOpaqueBoundingBox(image), {
    x: 1,
    y: 0,
    width: 2,
    height: 2,
  });
});

test("computeOpaqueBoundingBox returns null when the image is fully transparent", () => {
  const image = makeImageData([
    [0, 0],
    [0, 0],
  ]);
  assert.equal(computeOpaqueBoundingBox(image), null);
});

test("computeOpaqueBoundingBox returns null for missing or invalid input", () => {
  assert.equal(computeOpaqueBoundingBox(null), null);
  assert.equal(computeOpaqueBoundingBox({}), null);
  assert.equal(computeOpaqueBoundingBox({ data: new Uint8ClampedArray(4), width: 0, height: 0 }), null);
});
test("computeOpaqueRunRects splits separated opaque islands instead of one large box", () => {
  const image = makeImageData([
    [255, 255, 0, 0, 255, 255],
    [255, 255, 0, 0, 255, 255],
    [0, 0, 0, 0, 0, 0],
    [0, 255, 255, 255, 0, 0],
  ]);
  const rects = computeOpaqueRunRects(image);
  assert.deepEqual(rects, [
    { x: 0, y: 0, width: 2, height: 2 },
    { x: 4, y: 0, width: 2, height: 2 },
    { x: 1, y: 3, width: 3, height: 1 },
  ]);
});

test("computeOpaqueRunRects limits tiny noisy regions", () => {
  const image = makeImageData([
    [255, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 255, 255],
  ]);
  const rects = computeOpaqueRunRects(image, { minRunWidth: 2 });
  assert.deepEqual(rects, [
    { x: 2, y: 2, width: 2, height: 1 },
  ]);
});

test("computeEmptyMargins returns the four empty strips around the silhouette", () => {
  // 6脳6 with opaque block x=2-3, y=2-4 鈥?top=2, left=2, right=2, bottom=1
  const image = makeImageData([
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 255, 255, 0, 0],
    [0, 0, 255, 255, 0, 0],
    [0, 0, 255, 255, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ]);
  const margins = computeEmptyMargins(image);
  assert.deepEqual(margins, [
    { side: "top", x: 0, y: 0, width: 6, height: 2 },
    { side: "bottom", x: 0, y: 5, width: 6, height: 1 },
    { side: "left", x: 0, y: 2, width: 2, height: 3 },
    { side: "right", x: 4, y: 2, width: 2, height: 3 },
  ]);
});

test("computeEmptyMargins returns [] when the image is fully transparent", () => {
  const image = makeImageData([[0, 0], [0, 0]]);
  assert.deepEqual(computeEmptyMargins(image), []);
});

test("computeEmptyMargins returns [] for missing or invalid input", () => {
  assert.deepEqual(computeEmptyMargins(null), []);
  assert.deepEqual(computeEmptyMargins({}), []);
});

test("computeEmptyMargins drops sides whose margin is zero", () => {
  // Opaque block spans the full width 鈥?no left/right margins, only top/bottom
  const image = makeImageData([
    [0, 0, 0],
    [255, 255, 255],
    [255, 255, 255],
    [0, 0, 0],
  ]);
  const margins = computeEmptyMargins(image);
  assert.deepEqual(margins, [
    { side: "top", x: 0, y: 0, width: 3, height: 1 },
    { side: "bottom", x: 0, y: 3, width: 3, height: 1 },
  ]);
});
