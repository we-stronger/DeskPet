(function attachWidgetCoordination(root) {
  const widgetState = typeof require === "function"
    ? require("./widget-state")
    : root.DeskpetWidgetState;

  function clampPosition(position = {}, size = {}, stage = {}) {
    const width = Math.max(0, Number(size.width) || 0);
    const height = Math.max(0, Number(size.height) || 0);
    const stageWidth = Math.max(width, Number(stage.width) || 0);
    const stageHeight = Math.max(height, Number(stage.height) || 0);
    return {
      x: Math.max(0, Math.min(stageWidth - width, Math.round(Number(position.x) || 0))),
      y: Math.max(0, Math.min(stageHeight - height, Math.round(Number(position.y) || 0))),
    };
  }

  function overlaps(a, aSize, b, bSize, gap = 8) {
    return a.x < b.x + bSize.width + gap
      && a.x + aSize.width + gap > b.x
      && a.y < b.y + bSize.height + gap
      && a.y + aSize.height + gap > b.y;
  }

  function firstFreePosition(candidates, size, stage, occupied) {
    const saved = clampPosition(candidates[candidates.length - 1], size, stage);
    return candidates
      .map((candidate) => clampPosition(candidate, size, stage))
      .find((candidate) => occupied.every((item) => !overlaps(candidate, size, item.position, item.size))) || saved;
  }

  function resolveWidgetLayout({ stage, widgets = [] } = {}) {
    const result = {};
    const occupied = [];
    const ordered = (Array.isArray(widgets) ? widgets : [])
      .map((widget) => widgetState.normalizeWidgetState(widget))
      .filter((widget) => widget.visible && widget.id && widget.size)
      .slice()
      .sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));

    for (const widget of ordered) {
      const saved = clampPosition(widget.position, widget.size, stage);
      const candidates = [saved];
      for (const item of occupied) {
        candidates.push(
          { x: item.position.x, y: item.position.y - widget.size.height - 8 },
          { x: item.position.x + item.size.width + 8, y: item.position.y },
        );
      }
      result[widget.id] = firstFreePosition(candidates, widget.size, stage, occupied);
      occupied.push({ position: result[widget.id], size: widget.size });
    }
    return result;
  }

  function resolveWidgetPositions({ stage, music, focus, clock } = {}) {
    return resolveWidgetLayout({
      stage,
      widgets: [
        { id: "music", priority: 0, ...music },
        { id: "focus", priority: 1, ...focus },
        { id: "clock", priority: 2, ...clock },
      ],
    });
  }

  const api = { clampPosition, overlaps, resolveWidgetLayout, resolveWidgetPositions };
  if (root) root.DeskpetWidgetCoordination = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
