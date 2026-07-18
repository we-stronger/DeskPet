(function attachWidgetState(root) {
  const DISPLAY_MODES = new Set(["floating", "music", "hidden"]);

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizePosition(position, fallback = { x: 0, y: 0 }) {
    if (!position || typeof position !== "object") {
      return { x: fallback.x, y: fallback.y };
    }
    return {
      x: Math.round(finiteNumber(position.x, fallback.x)),
      y: Math.round(finiteNumber(position.y, fallback.y)),
    };
  }

  function normalizeSize(size, fallback = { width: 1, height: 1 }) {
    return {
      width: Math.max(1, Math.round(finiteNumber(size && size.width, fallback.width))),
      height: Math.max(1, Math.round(finiteNumber(size && size.height, fallback.height))),
    };
  }

  function normalizeOpacity(value, fallback = 1) {
    return Math.max(0.2, Math.min(1, finiteNumber(value, fallback)));
  }

  function normalizeWidgetState(input = {}, defaults = {}) {
    const source = input && typeof input === "object" ? input : {};
    const base = defaults && typeof defaults === "object" ? defaults : {};
    const id = String(source.id ?? base.id ?? "").trim();
    const displayMode = DISPLAY_MODES.has(source.displayMode)
      ? source.displayMode
      : (DISPLAY_MODES.has(base.displayMode) ? base.displayMode : "floating");
    return {
      id,
      visible: source.visible !== undefined ? source.visible === true : base.visible !== false,
      position: normalizePosition(source.position ?? base.position),
      size: normalizeSize(source.size ?? base.size),
      opacity: normalizeOpacity(source.opacity ?? base.opacity),
      alwaysOnTop: source.alwaysOnTop !== undefined
        ? source.alwaysOnTop === true
        : base.alwaysOnTop !== false,
      clickThrough: source.clickThrough === true || (source.clickThrough === undefined && base.clickThrough === true),
      draggable: source.draggable !== undefined ? source.draggable === true : base.draggable !== false,
      displayMode,
      priority: Math.round(finiteNumber(source.priority, finiteNumber(base.priority, 0))),
    };
  }

  function normalizeWidgetRegistry(input = {}) {
    const entries = Array.isArray(input)
      ? input.map((widget) => [widget && widget.id, widget])
      : Object.entries(input && typeof input === "object" ? input : {});
    const result = {};
    for (const [key, value] of entries) {
      const state = normalizeWidgetState({ ...(value || {}), id: value?.id ?? key });
      if (state.id) result[state.id] = state;
    }
    return result;
  }

  const api = { DISPLAY_MODES: [...DISPLAY_MODES], normalizeWidgetState, normalizeWidgetRegistry };
  if (root) root.DeskpetWidgetState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
