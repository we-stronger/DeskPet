(function attachPetHitTest(root) {
  // Alpha threshold below which a pixel is considered "empty" (click-through).
  // 16/255 鈮?6% 鈥?generous enough that anti-aliased edges count as solid so
  // the user can click the silhouette even where the rim fades out, but
  // tight enough that the surrounding transparent area stays click-through.
  const DEFAULT_ALPHA_THRESHOLD = 16;

  // Pure helper: sample alpha at integer pixel (px, py) from a flat RGBA
  // Uint8ClampedArray (the data of an ImageData). Returns true if the
  // pixel is at or above the threshold.
  function isPixelOpaque(buffer, width, px, py, threshold = DEFAULT_ALPHA_THRESHOLD) {
    if (!buffer || !Number.isFinite(width) || width <= 0) return false;
    if (px < 0 || py < 0) return false;
    const offset = (Math.floor(py) * width + Math.floor(px)) * 4;
    if (offset < 0 || offset + 3 >= buffer.length) return false;
    return buffer[offset + 3] >= threshold;
  }

  // Same as above but takes an ImageData-like { data, width } object.
  function isImageDataPixelOpaque(imageData, px, py, threshold) {
    if (!imageData || !imageData.data) return false;
    return isPixelOpaque(imageData.data, imageData.width, px, py, threshold);
  }

  // Walk every pixel and return the bounding box of the opaque region.
  // Used to compute the BrowserWindow's clickable region via setShape().
  // The returned rect is in image pixel coordinates (inclusive of minX/minY,
  // inclusive of maxX/maxY as the last opaque pixel). When the image has
  // no opaque pixels, returns null so the caller can clear the shape.
  function computeOpaqueBoundingBox(imageData, threshold = DEFAULT_ALPHA_THRESHOLD) {
    if (!imageData || !imageData.data) return null;
    const width = Number(imageData.width);
    const height = Number(imageData.height) || width;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    if (width <= 0 || height <= 0) return null;
    const data = imageData.data;
    if (!data || data.length < width * height * 4) return null;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x += 1) {
        if (data[(rowOffset + x) * 4 + 3] >= threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;
    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }
  function computeOpaqueRunRects(imageData, {
    threshold = DEFAULT_ALPHA_THRESHOLD,
    minRunWidth = 1,
    maxRects = 900,
  } = {}) {
    if (!imageData || !imageData.data) return [];
    const width = Number(imageData.width);
    const height = Number(imageData.height) || width;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return [];
    if (width <= 0 || height <= 0) return [];
    const data = imageData.data;
    if (!data || data.length < width * height * 4) return [];

    const active = new Map();
    const finished = [];
    const minWidth = Math.max(1, Math.round(Number(minRunWidth) || 1));

    for (let y = 0; y < height; y += 1) {
      const rowRuns = [];
      let x = 0;
      while (x < width) {
        while (x < width && data[(y * width + x) * 4 + 3] < threshold) x += 1;
        if (x >= width) break;
        const start = x;
        while (x < width && data[(y * width + x) * 4 + 3] >= threshold) x += 1;
        const runWidth = x - start;
        if (runWidth >= minWidth) {
          rowRuns.push({ x: start, y, width: runWidth, height: 1 });
        }
      }

      const nextActive = new Map();
      for (const run of rowRuns) {
        const key = `${run.x}:${run.width}`;
        const previous = active.get(key);
        if (previous) {
          previous.height += 1;
          nextActive.set(key, previous);
        } else {
          nextActive.set(key, run);
        }
      }

      for (const [key, rect] of active.entries()) {
        if (!nextActive.has(key)) {
          finished.push(rect);
        }
      }
      active.clear();
      for (const [key, rect] of nextActive.entries()) {
        active.set(key, rect);
      }
    }

    for (const rect of active.values()) {
      finished.push(rect);
    }

    const limit = Math.max(1, Math.round(Number(maxRects) || 900));
    if (finished.length <= limit) {
      return finished;
    }
    const bbox = computeOpaqueBoundingBox(imageData, threshold);
    return bbox ? [bbox] : [];
  }

  // Compute the four "empty margins" around the opaque silhouette: top,
  // bottom, left, right strips of fully-transparent (or below-threshold)
  // pixels that border the image edges. Used to place UI widgets (mood
  // bubble, clock) so they don't overlap the character.
  //
  // The returned margins are in image coordinates, each as a rect:
  //   { side: 'top'|'bottom'|'left'|'right', x, y, width, height }
  // When the image has no opaque pixels, returns an empty array.
  function computeEmptyMargins(imageData, threshold = DEFAULT_ALPHA_THRESHOLD) {
    const bbox = computeOpaqueBoundingBox(imageData, threshold);
    if (!bbox) return [];
    const width = Number(imageData.width);
    const height = Number(imageData.height) || width;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return [];
    if (width <= 0 || height <= 0) return [];
    const margins = [];
    if (bbox.y > 0) {
      margins.push({ side: "top", x: 0, y: 0, width, height: bbox.y });
    }
    const bottomY = bbox.y + bbox.height;
    if (bottomY < height) {
      margins.push({ side: "bottom", x: 0, y: bottomY, width, height: height - bottomY });
    }
    if (bbox.x > 0) {
      margins.push({ side: "left", x: 0, y: bbox.y, width: bbox.x, height: bbox.height });
    }
    const rightX = bbox.x + bbox.width;
    if (rightX < width) {
      margins.push({ side: "right", x: rightX, y: bbox.y, width: width - rightX, height: bbox.height });
    }
    return margins;
  }

  // Map a cursor position (in stage CSS pixels, e.g. event.offsetX/offsetY)
  // to the corresponding pixel in the source image. The pet sprite uses
  // object-fit: contain inside the stage, so the image is scaled down and
  // centered within the stage when it isn't filling it. We compute the
  // visible rect first, then map.
  //
  // stageSize: { width, height } of the stage element
  // imageSize: { width, height } of the source image (typically 512脳512)
  // cursor: { x, y } in stage coordinates
  // Returns: { x, y } in image coordinates, or null if outside the image rect
  function mapCursorToImagePixel(stageSize, imageSize, cursor) {
    if (!stageSize || !imageSize || !cursor) return null;
    const sw = Number(stageSize.width) || 0;
    const sh = Number(stageSize.height) || 0;
    const iw = Number(imageSize.width) || 0;
    const ih = Number(imageSize.height) || 0;
    if (sw <= 0 || sh <= 0 || iw <= 0 || ih <= 0) return null;

    const scale = Math.min(sw / iw, sh / ih);
    const renderedW = iw * scale;
    const renderedH = ih * scale;
    const offsetX = (sw - renderedW) / 2;
    const offsetY = (sh - renderedH) / 2;

    const localX = cursor.x - offsetX;
    const localY = cursor.y - offsetY;
    if (localX < 0 || localY < 0 || localX >= renderedW || localY >= renderedH) {
      return null;
    }
    return {
      x: Math.min(iw - 1, Math.max(0, (localX / scale))),
      y: Math.min(ih - 1, Math.max(0, (localY / scale))),
    };
  }

  // Loader abstraction. In the renderer, `deps.loader(src)` should return
  // a Promise<{ data: Uint8ClampedArray, width, height }>. In tests, a
  // fake loader can return canned data.
  function createHitTester({
    loader,
    threshold = DEFAULT_ALPHA_THRESHOLD,
    maxCacheEntries = 256,
  } = {}) {
    if (typeof loader !== "function") {
      throw new Error("createHitTester requires a loader(src) function");
    }
    const cache = new Map(); // src -> ImageData-like | Promise
    const inflight = new Map(); // src -> Promise (deduplicates concurrent loads)

    function getCached(src) {
      const entry = cache.get(src);
      if (entry && !(entry instanceof Promise)) return entry;
      return null;
    }

    function remember(src, imageData) {
      if (cache.size >= maxCacheEntries) {
        // Drop the oldest entry (Map preserves insertion order).
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      cache.set(src, imageData);
      inflight.delete(src);
    }

    function load(src) {
      if (!src) return Promise.resolve(null);
      const cached = cache.get(src);
      if (cached && !(cached instanceof Promise)) return Promise.resolve(cached);
      if (inflight.has(src)) return inflight.get(src);
      const p = Promise.resolve()
        .then(() => loader(src))
        .then((imageData) => {
          if (imageData && imageData.data && Number.isFinite(imageData.width)) {
            remember(src, imageData);
            return imageData;
          }
          return null;
        })
        .catch(() => {
          inflight.delete(src);
          return null;
        });
      inflight.set(src, p);
      return p;
    }

    function isOpaqueAt(src, stageSize, cursor) {
      const imageData = getCached(src);
      if (!imageData) return false;
      const imageSize = { width: imageData.width, height: imageData.height || imageData.width };
      const pixel = mapCursorToImagePixel(stageSize, imageSize, cursor);
      if (!pixel) return false;
      return isImageDataPixelOpaque(imageData, pixel.x, pixel.y, threshold);
    }

    function clearCache() {
      cache.clear();
      inflight.clear();
    }

    return { load, isOpaqueAt, clearCache };
  }

  const api = {
    DEFAULT_ALPHA_THRESHOLD,
    computeOpaqueBoundingBox,
    computeOpaqueRunRects,
    computeEmptyMargins,
    createHitTester,
    isPixelOpaque,
    isImageDataPixelOpaque,
    mapCursorToImagePixel,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetPetHitTest = api;
})(typeof window !== "undefined" ? window : globalThis);
