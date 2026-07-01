const { normalizeDisplays } = require("./window-position");

// Pick the display whose work area overlaps the pet's bounding box
// the most. Used to know which display's edge the auto-walk should
// turn around at. Falls back to the first display if the pet is
// entirely off every display (e.g. dragged way past the right edge).
function pickDisplayFor(position, displays, windowSize) {
  let best = null;
  let bestOverlap = -1;
  for (const display of displays) {
    const left = Math.max(position.x, display.x);
    const top = Math.max(position.y, display.y);
    const right = Math.min(position.x + windowSize.width, display.x + display.width);
    const bottom = Math.min(position.y + windowSize.height, display.y + display.height);
    const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = display;
    }
  }
  return best || displays[0];
}

function computeMovedWindowPosition({
  currentPosition,
  delta,
  displays,
  windowSize,
}) {
  return computeWindowMove({
    currentPosition,
    delta,
    displays,
    windowSize,
  }).position;
}

function computeWindowMove({
  currentPosition,
  delta,
  displays,
  windowSize,
}) {
  const currentX = Number(currentPosition?.x);
  const currentY = Number(currentPosition?.y);
  const dx = Number(delta?.dx);
  const dy = Number(delta?.dy);

  const nextPosition = {
    x: Math.round((Number.isFinite(currentX) ? currentX : 0) + (Number.isFinite(dx) ? dx : 0)),
    y: Math.round((Number.isFinite(currentY) ? currentY : 0) + (Number.isFinite(dy) ? dy : 0)),
  };

  // No clamp here: the user wants the pet draggable across the whole
  // desktop without being pulled back when it nears an edge. If they
  // drag the pet off the screen, the pet goes off the screen — they
  // asked for full freedom of movement.
  //
  // We still compute `blockedX` / `blockedY` so the auto-walk system
  // (`src/renderer/walk-movement.js`) can tell when a step would
  // push the pet past the edge of the display it's currently on and
  // turn around. The drag handler ignores these flags and just sets
  // the position as requested.
  const normDisplays = normalizeDisplays(displays);
  const refX = Number.isFinite(currentX) ? currentX : 0;
  const refY = Number.isFinite(currentY) ? currentY : 0;
  const currentDisplay = pickDisplayFor({ x: refX, y: refY }, normDisplays, windowSize);
  let blockedX = false;
  let blockedY = false;
  if (currentDisplay) {
    const minX = currentDisplay.x;
    const maxX = currentDisplay.x + currentDisplay.width;
    const minY = currentDisplay.y;
    const maxY = currentDisplay.y + currentDisplay.height;
    // `>=` (not `>`) so the walk turns around the instant the pet's
    // edge reaches the display edge, rather than overshooting by one
    // step. The pet's top-left can still legitimately sit at
    // (maxX - width, …) — only the NEXT step past that is blocked.
    if (nextPosition.x < minX || nextPosition.x + windowSize.width >= maxX) blockedX = true;
    if (nextPosition.y < minY || nextPosition.y + windowSize.height >= maxY) blockedY = true;
  }

  return {
    position: nextPosition,
    requestedPosition: nextPosition,
    blockedX,
    blockedY,
  };
}

module.exports = {
  computeMovedWindowPosition,
  computeWindowMove,
};
