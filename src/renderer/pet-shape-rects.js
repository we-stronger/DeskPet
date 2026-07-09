(function attachPetShapeRects(root) {
  const hitTest = root.DeskpetPetHitTest || (typeof require === "function" ? require("./pet-hit-test") : null);

  function roundRect(rect) {
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    };
  }

  function unionBoundingBoxes(boxes) {
    const valid = (Array.isArray(boxes) ? boxes : [])
      .filter((box) => box
        && Number.isFinite(box.x)
        && Number.isFinite(box.y)
        && Number.isFinite(box.width)
        && Number.isFinite(box.height)
        && box.width > 0
        && box.height > 0);
    if (!valid.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const box of valid) {
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  function mapBoundingBoxToPetRect({ bbox, imageSize, petRect, mirrored = false } = {}) {
    if (!bbox || !imageSize || !petRect || petRect.width <= 0 || petRect.height <= 0) return [];
    const imgW = imageSize.width;
    const imgH = imageSize.height || imgW;
    if (!imgW || !imgH) return [];

    const scale = Math.min(petRect.width / imgW, petRect.height / imgH);
    const renderedW = imgW * scale;
    const renderedH = imgH * scale;
    const offsetX = (petRect.width - renderedW) / 2;
    const offsetY = (petRect.height - renderedH) / 2;
    const sourceX = mirrored ? (imgW - bbox.x - bbox.width) : bbox.x;

    return [roundRect({
      x: petRect.left + offsetX + sourceX * scale,
      y: petRect.top + offsetY + bbox.y * scale,
      width: bbox.width * scale,
      height: bbox.height * scale,
    })];
  }

  function computePetShapeRects({ imageData, petRect, mirrored = false } = {}) {
    if (!hitTest || typeof hitTest.computeOpaqueBoundingBox !== "function") return [];
    if (!imageData) return [];
    const bbox = hitTest.computeOpaqueBoundingBox(imageData);
    return mapBoundingBoxToPetRect({
      bbox,
      imageSize: { width: imageData.width, height: imageData.height || imageData.width },
      petRect,
      mirrored,
    });
  }

  const api = {
    computePetShapeRects,
    mapBoundingBoxToPetRect,
    unionBoundingBoxes,
  };

  if (root) {
    root.DeskpetPetShapeRects = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
