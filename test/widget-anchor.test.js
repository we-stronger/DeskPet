const assert = require("node:assert/strict");
const test = require("node:test");

const { computeWidgetAnchor } = require("../src/renderer/widget-anchor");

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

// 512x512 image with a sleep-like silhouette: ~470×380 opaque block at the
// bottom, leaving only a top margin of ~120px. Used to reproduce the case
// where the clock widget overlaps the pet body because the top-margin
// anchor is computed at center of the margin and the bbox top varies frame
// to frame.
function makeSleepLikeImage({ height = 512, width = 512, top = 120, left = 24, right = 24, bottom = 8 }) {
  const W = width;
  const H = height;
  const matrix = Array.from({ length: H }, () => new Array(W).fill(0));
  const x0 = left;
  const x1 = W - right;
  const y0 = top;
  const y1 = H - bottom - 1;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      matrix[y][x] = 200;
    }
  }
  return makeImageData(matrix);
}

function bboxOf(imageData) {
  const W = imageData.width;
  const H = imageData.height;
  const px = imageData.data;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (px[(y * W + x) * 4 + 3] >= 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function emptyMarginsOf(bbox, width, height) {
  const ms = [];
  if (bbox.y > 0) ms.push({ side: "top", x: 0, y: 0, width, height: bbox.y });
  const bottomY = bbox.y + bbox.height;
  if (bottomY < height) ms.push({ side: "bottom", x: 0, y: bottomY, width, height: height - bottomY });
  if (bbox.x > 0) ms.push({ side: "left", x: 0, y: bbox.y, width: bbox.x, height: bbox.height });
  const rightX = bbox.x + bbox.width;
  if (rightX < width) ms.push({ side: "right", x: rightX, y: bbox.y, width: width - rightX, height: bbox.height });
  return ms;
}

test("clock anchor fits inside top margin of a sleep-like sprite without overlapping the bbox", () => {
  const image = makeSleepLikeImage({ top: 120, left: 24, right: 24, bottom: 8 });
  const bbox = bboxOf(image);
  const margins = emptyMarginsOf(bbox, image.width, image.height);
  // Sleep-like: left.width=24, right.width=24 (both too narrow), top.height=120
  const widgetSize = { width: 70, height: 50 };

  const anchor = computeWidgetAnchor({
    role: "clock",
    widgetSize,
    imageData: image,
    margins,
    bbox,
    padding: 4,
  });

  assert.ok(anchor, "should return an anchor");
  assert.equal(anchor.side, "top", "should pick the top margin when L/R are too narrow");
  // Top-left of the widget must be safely above the bbox top with padding
  assert.ok(anchor.y + widgetSize.height + 4 <= bbox.y,
    `clock bottom (${anchor.y + widgetSize.height}) + padding must be ≤ bbox top (${bbox.y})`);
  // Should not be pressed against the canvas edge either
  assert.ok(anchor.y >= 4, "should leave canvas-edge padding above the widget");
});

test("clock anchor center is preserved — widget center sits inside the chosen margin", () => {
  const image = makeSleepLikeImage({ top: 120, left: 24, right: 24, bottom: 8 });
  const bbox = bboxOf(image);
  const margins = emptyMarginsOf(bbox, image.width, image.height);
  const widgetSize = { width: 70, height: 50 };

  const anchor = computeWidgetAnchor({
    role: "clock",
    widgetSize,
    imageData: image,
    margins,
    bbox,
    padding: 4,
  });

  assert.ok(anchor);
  // horizontal centre of widget is within the top margin's horizontal span
  assert.ok(anchor.x >= widgetSize.width / 2 && anchor.x <= image.width - widgetSize.width / 2);
});

test("clock anchor leaves a >= 8px buffer to bbox top even when bbox grows taller", () => {
  // Simulate worst-case sleep frame: bbox.top = 105
  const image = makeSleepLikeImage({ top: 105, left: 20, right: 20, bottom: 8 });
  const bbox = bboxOf(image);
  const margins = emptyMarginsOf(bbox, image.width, image.height);
  const widgetSize = { width: 70, height: 50 };

  const anchor = computeWidgetAnchor({
    role: "clock",
    widgetSize,
    imageData: image,
    margins,
    bbox,
    padding: 4,
  });

  assert.ok(anchor);
  // Should leave 8px buffer between widget bottom and bbox top, so the clock
  // never overlaps the pet even when the sleep animation breathes inward.
  assert.ok(anchor.y + widgetSize.height + 8 <= bbox.y,
    `worst-case sleep frame: clock bottom (${anchor.y + widgetSize.height}) + 8 ≤ bbox top (${bbox.y})`);
});

test("clock anchor falls back to an outside-pet corner when no in-image margin fits", () => {
  // Full-bleed image: no opaque margins anywhere
  const matrix = Array.from({ length: 512 }, () => new Array(512).fill(200));
  const image = makeImageData(matrix);
  const bbox = bboxOf(image);
  const margins = emptyMarginsOf(bbox, image.width, image.height);
  const widgetSize = { width: 70, height: 50 };

  const anchor = computeWidgetAnchor({
    role: "clock",
    widgetSize,
    imageData: image,
    margins,
    bbox,
    padding: 4,
  });

  assert.ok(anchor);
  // No in-image margin should be selected when the image is fully opaque.
  assert.ok(String(anchor.side).startsWith("outside-"),
    `expected an outside-* side when image is full-bleed, got ${anchor.side}`);
  // The outside anchor coordinates are pet-relative top-left of the widget.
  assert.ok(anchor.x >= 0 && anchor.y >= 0);
});

test("clock prefers left margin over right when both fit (idle pose)", () => {
  // Idle-like: tall narrow, big L/R margins, top is small
  const image = makeSleepLikeImage({ top: 16, bottom: 8, left: 146, right: 146 });
  const bbox = bboxOf(image);
  const margins = emptyMarginsOf(bbox, image.width, image.height);
  const widgetSize = { width: 70, height: 50 };

  const anchor = computeWidgetAnchor({
    role: "clock",
    widgetSize,
    imageData: image,
    margins,
    bbox,
    padding: 4,
  });

  assert.ok(anchor);
  assert.equal(anchor.side, "left", "idle pose: clock should use the left margin");
  // Anchor x is the widget's center (CSS centres via translateX(-50%)),
  // so the widget's right edge is anchor.x + widgetSize.width / 2.
  const widgetRight = anchor.x + widgetSize.width / 2;
  assert.ok(widgetRight + 4 <= bbox.x,
    `widget right edge + padding (${widgetRight + 4}) must clear bbox left (${bbox.x})`);
});

test("bubble prefers right margin over left when both fit (idle pose)", () => {
  const image = makeSleepLikeImage({ top: 16, bottom: 8, left: 146, right: 146 });
  const bbox = bboxOf(image);
  const margins = emptyMarginsOf(bbox, image.width, image.height);
  const widgetSize = { width: 96, height: 32 };

  const anchor = computeWidgetAnchor({
    role: "bubble",
    widgetSize,
    imageData: image,
    margins,
    bbox,
    padding: 4,
  });

  assert.ok(anchor);
  assert.equal(anchor.side, "pet-top-right", "bubble should use the dedicated pet top-right anchor");
  assert.ok(anchor.x > bbox.x + bbox.width / 2, "bubble should sit on the pet's right side");
  assert.ok(anchor.y >= bbox.y, "bubble should stay near the pet's upper body instead of floating above the sprite");
});

test("bubble top-right anchor clamps back inside the stage when the pet is close to the right edge", () => {
  const bbox = { x: 390, y: 30, width: 96, height: 360 };
  const widgetSize = { width: 180, height: 78 };

  const anchor = computeWidgetAnchor({
    role: "bubble",
    widgetSize,
    imageData: { width: 512, height: 512 },
    margins: [],
    bbox,
    padding: 4,
  });

  assert.ok(anchor);
  assert.equal(anchor.side, "pet-top-right");
  assert.ok(anchor.x <= 512 - widgetSize.width - 4,
    `bubble left edge (${anchor.x}) must stay inside the stage width`);
});

test("bubble top-right anchor stays within a 6-14px preferred gap before clamping", () => {
  const bbox = { x: 120, y: 40, width: 150, height: 380 };
  const anchor = computeWidgetAnchor({
    role: "bubble",
    widgetSize: { width: 180, height: 78 },
    imageData: { width: 512, height: 512 },
    margins: [],
    bbox,
    padding: 4,
  });

  const gap = anchor.x - (bbox.x + bbox.width);
  assert.ok(gap >= 6, `expected at least 6px of space, got ${gap}`);
  assert.ok(gap <= 14, `expected at most 14px of space, got ${gap}`);
});

test("bubble and clock do not share a side on idle pose", () => {
  const image = makeSleepLikeImage({ top: 16, bottom: 8, left: 146, right: 146 });
  const bbox = bboxOf(image);
  const margins = emptyMarginsOf(bbox, image.width, image.height);

  const bubbleAnchor = computeWidgetAnchor({
    role: "bubble",
    widgetSize: { width: 96, height: 32 },
    imageData: image,
    margins,
    bbox,
    padding: 4,
  });
  // The caller knows bubble picked right; clock should be told to exclude right.
  const excludeSide = bubbleAnchor && bubbleAnchor.side;
  const clockAnchor = computeWidgetAnchor({
    role: "clock",
    widgetSize: { width: 70, height: 50 },
    imageData: image,
    margins,
    bbox,
    padding: 4,
    excludeSide,
  });

  assert.ok(bubbleAnchor && clockAnchor);
  assert.notEqual(clockAnchor.side, bubbleAnchor.side,
    "clock should not collide with bubble on the same margin");
});
