// Pure helpers for placing floating UI widgets (mood bubble, clock) inside
// or outside the pet's silhouette without overlapping the character body.
//
// The critical contract: when placed inside a margin, the widget is pushed
// to the canvas-facing edge (not the bbox-facing edge). The bbox varies
// frame to frame during sleep/walk animations, so hugging the pet instead
// of the canvas edge causes the widget to overlap the character body.

const ROLE_WIDGET_SIZE = {
  bubble: { width: 96, height: 32 },
  clock:  { width: 70, height: 50 },
};

function marginFits(margin, widgetSize, padding) {
  return margin.width >= widgetSize.width + padding * 2
      && margin.height >= widgetSize.height + padding * 2;
}

function pickFittingMargin(margins, excludeSide, preferredSides, widgetSize, padding) {
  for (const side of preferredSides) {
    const m = margins.find((mm) => mm.side === side && mm.side !== excludeSide && marginFits(mm, widgetSize, padding));
    if (m) return m;
  }
  const fallback = margins.find((mm) => mm.side !== excludeSide && marginFits(mm, widgetSize, padding));
  return fallback || null;
}

function anchorInsideMargin(margin, widgetSize, padding) {
  return {
    side: margin.side,
    x: margin.x + margin.width / 2,
    y: margin.y + padding,
  };
}

function anchorOutsidePet(bbox, imageWidth, imageHeight, widgetSize, padding) {
  const candidates = [
    { side: "outside-tl", x: padding + widgetSize.width / 2, y: padding },
    { side: "outside-tr", x: imageWidth - padding - widgetSize.width / 2, y: padding },
    { side: "outside-bl", x: padding + widgetSize.width / 2, y: imageHeight - widgetSize.height - padding },
    { side: "outside-br", x: imageWidth - padding - widgetSize.width / 2, y: imageHeight - widgetSize.height - padding },
  ];
  const score = (c) => {
    const widgetLeft = c.x - widgetSize.width / 2;
    const widgetRight = c.x + widgetSize.width / 2;
    const widgetTop = c.y;
    const widgetBottom = c.y + widgetSize.height;
    const bx0 = bbox.x, by0 = bbox.y, bx1 = bbox.x + bbox.width, by1 = bbox.y + bbox.height;
    if (widgetRight >= bx0 && widgetLeft <= bx1 && widgetBottom >= by0 && widgetTop <= by1) return -Infinity;
    const dx = widgetRight < bx0 ? bx0 - widgetRight : (widgetLeft > bx1 ? widgetLeft - bx1 : 0);
    const dy = widgetBottom < by0 ? by0 - widgetBottom : (widgetTop > by1 ? widgetTop - by1 : 0);
    return dx + dy;
  };
  return candidates.slice().sort((a, b) => score(b) - score(a))[0];
}

// Returns { side, x, y }. x is the widget's horizontal centre (callers rely
// on CSS `transform: translateX(-50%)` to centre on it); y is the widget's
// top-left in image/pet-relative pixels. side is one of
// 'top'|'bottom'|'left'|'right' or 'outside-tl'|'outside-tr'|'outside-bl'|'outside-br'.
function computeWidgetAnchor({
  role = "clock",
  widgetSize,
  margins,
  bbox,
  imageData,
  padding = 4,
  excludeSide,
}) {
  const effectiveSize = widgetSize || ROLE_WIDGET_SIZE[role] || { width: 60, height: 40 };
  if (!bbox || !margins) return null;
  const imgW = imageData && imageData.width
    ? imageData.width
    : (bbox.x + bbox.width + 100);
  const imgH = imageData && (imageData.height || imageData.width)
    ? (imageData.height || imageData.width)
    : (bbox.y + bbox.height + 100);

  // Bubble defaults to right, clock to left; both can fall back to top when
  // L/R are too small (e.g. during sleep).
  const preferred = role === "bubble"
    ? ["right", "left", "top", "bottom"]
    : ["left", "right", "top", "bottom"];

  const margin = pickFittingMargin(margins, excludeSide, preferred, effectiveSize, padding);
  if (margin) return anchorInsideMargin(margin, effectiveSize, padding);

  // Nothing in-image fits — push the widget outside the pet at the corner
  // with the most clearance from the bbox.
  return anchorOutsidePet(bbox, imgW, imgH, effectiveSize, padding);
}

const api = { computeWidgetAnchor, ROLE_WIDGET_SIZE };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof window !== "undefined") {
  window.DeskpetWidgetAnchor = api;
}
