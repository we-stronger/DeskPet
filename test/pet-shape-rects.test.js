const assert = require("node:assert/strict");
const test = require("node:test");

const {
  computePetShapeRects,
  unionBoundingBoxes,
} = require("../src/renderer/pet-shape-rects");

function makeImageData(matrix) {
  const height = matrix.length;
  const width = matrix[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[(y * width + x) * 4 + 3] = matrix[y][x];
    }
  }
  return { data, width, height };
}

test("computePetShapeRects uses one stable sprite bounding rect instead of horizontal run strips", () => {
  const imageData = makeImageData([
    [255, 255, 0, 0, 255, 255],
    [255, 255, 0, 0, 255, 255],
    [0, 0, 0, 0, 0, 0],
    [0, 255, 255, 255, 0, 0],
  ]);

  const rects = computePetShapeRects({
    imageData,
    petRect: { left: 10, top: 20, width: 60, height: 40 },
    mirrored: false,
  });

  assert.deepEqual(rects, [
    { x: 10, y: 20, width: 60, height: 40 },
  ]);
});

test("computePetShapeRects maps a centered contain-fit sprite bounding box", () => {
  const imageData = makeImageData([
    [0, 0, 0, 0],
    [0, 255, 255, 0],
    [0, 255, 255, 0],
    [0, 0, 0, 0],
  ]);

  const rects = computePetShapeRects({
    imageData,
    petRect: { left: 0, top: 0, width: 80, height: 40 },
    mirrored: false,
  });

  assert.deepEqual(rects, [
    { x: 30, y: 10, width: 20, height: 20 },
  ]);
});

test("computePetShapeRects mirrors the bounding box horizontally", () => {
  const imageData = makeImageData([
    [255, 255, 0, 0],
    [255, 255, 0, 0],
  ]);

  const rects = computePetShapeRects({
    imageData,
    petRect: { left: 0, top: 0, width: 40, height: 20 },
    mirrored: true,
  });

  assert.deepEqual(rects, [
    { x: 20, y: 0, width: 20, height: 20 },
  ]);
});

test("unionBoundingBoxes creates a stable action-level box across frames", () => {
  const box = unionBoundingBoxes([
    { x: 10, y: 20, width: 90, height: 180 },
    { x: 8, y: 24, width: 96, height: 170 },
    null,
    { x: 14, y: 18, width: 82, height: 184 },
  ]);

  assert.deepEqual(box, { x: 8, y: 18, width: 96, height: 184 });
});
