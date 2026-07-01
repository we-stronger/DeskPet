const MIN_VISIBLE_PIXELS = 120;

function normalizeDisplays(displays) {
  if (!Array.isArray(displays) || displays.length === 0) {
    return [{ x: 0, y: 0, width: 1280, height: 720 }];
  }
  return displays.map((display) => display.workArea || display);
}

function visiblePixels(position, display, windowSize) {
  const left = Math.max(position.x, display.x);
  const top = Math.max(position.y, display.y);
  const right = Math.min(position.x + windowSize.width, display.x + display.width);
  const bottom = Math.min(position.y + windowSize.height, display.y + display.height);

  return {
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function isMostlyVisible(position, displays, windowSize) {
  return displays.some((display) => {
    const visible = visiblePixels(position, display, windowSize);
    return visible.width >= MIN_VISIBLE_PIXELS && visible.height >= MIN_VISIBLE_PIXELS;
  });
}

function clampToDisplay(position, display, windowSize) {
  const maxX = display.x + Math.max(0, display.width - windowSize.width);
  const maxY = display.y + Math.max(0, display.height - windowSize.height);
  return {
    x: Math.min(Math.max(Math.round(position.x), display.x), maxX),
    y: Math.min(Math.max(Math.round(position.y), display.y), maxY),
  };
}

function centerInDisplay(display, windowSize) {
  return {
    x: Math.round(display.x + (display.width - windowSize.width) / 2),
    y: Math.round(display.y + (display.height - windowSize.height) / 2),
  };
}

function primaryVisibleDisplay(displays) {
  return displays.find((display) => (
    display.x <= 0
    && display.y <= 0
    && display.x + display.width > 0
    && display.y + display.height > 0
  )) || displays.find((display) => display.x >= 0 && display.y >= 0) || displays[0];
}

function clampPositionToVisibleArea(position, rawDisplays, windowSize) {
  const displays = normalizeDisplays(rawDisplays);
  const primaryDisplay = primaryVisibleDisplay(displays);

  if (!position || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) {
    return centerInDisplay(primaryDisplay, windowSize);
  }

  const normalizedPosition = {
    x: Math.round(Number(position.x)),
    y: Math.round(Number(position.y)),
  };

  const isOnPrimaryDisplay = (
    normalizedPosition.x >= primaryDisplay.x
    && normalizedPosition.y >= primaryDisplay.y
    && isMostlyVisible(normalizedPosition, [primaryDisplay], windowSize)
  );

  if (isOnPrimaryDisplay) {
    return normalizedPosition;
  }

  return clampToDisplay(normalizedPosition, primaryDisplay, windowSize);
}

module.exports = {
  clampPositionToVisibleArea,
  normalizeDisplays,
};
