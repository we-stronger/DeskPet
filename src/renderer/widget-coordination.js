(function attachWidgetCoordination(root) {
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

  function resolveWidgetPositions({ stage, music, focus, clock } = {}) {
    const result = {};
    const occupied = [];
    if (music && music.visible) {
      result.music = clampPosition(music.position, music.size, stage);
      occupied.push({ position: result.music, size: music.size });
    }
    if (focus && focus.visible) {
      const saved = clampPosition(focus.position, focus.size, stage);
      const candidates = result.music
        ? [
          saved,
          { x: result.music.x, y: result.music.y - focus.size.height - 8 },
          { x: result.music.x + music.size.width + 8, y: result.music.y },
        ]
        : [saved];
      result.focus = firstFreePosition(candidates, focus.size, stage, occupied);
      occupied.push({ position: result.focus, size: focus.size });
    }
    if (clock && clock.visible) {
      const saved = clampPosition(clock.position, clock.size, stage);
      result.clock = firstFreePosition([
        saved,
        { x: 8, y: 8 },
        { x: (Number(stage && stage.width) || 0) - clock.size.width - 8, y: 8 },
      ], clock.size, stage, occupied);
    }
    return result;
  }

  const api = { clampPosition, overlaps, resolveWidgetPositions };
  if (root) root.DeskpetWidgetCoordination = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
