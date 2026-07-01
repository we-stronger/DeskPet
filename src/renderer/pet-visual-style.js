(function attachPetVisualStyle(root) {
  const MAX_VISUAL_SCALE = 2;

  function clampScale(scale) {
    const value = Number(scale);
    if (!Number.isFinite(value)) {
      return 1;
    }
    return Math.max(0, Math.min(MAX_VISUAL_SCALE, value));
  }

  function visualBoxForScale(stageSize, scale) {
    const safeScale = clampScale(scale);
    const stageWidth = Math.max(0, Math.round(Number(stageSize.width) || 0));
    const stageHeight = Math.max(0, Math.round(Number(stageSize.height) || 0));
    const width = Math.round(stageWidth * safeScale);
    const height = Math.round(stageHeight * safeScale);

    return {
      width,
      height,
      left: Math.round((stageWidth - width) / 2),
      bottom: 0,
    };
  }

  function applyPetVisualStyle(element, stageSize, scale) {
    const box = visualBoxForScale(stageSize, scale);
    element.style.width = `${box.width}px`;
    element.style.height = `${box.height}px`;
    element.style.left = `${box.left}px`;
    element.style.bottom = `${box.bottom}px`;
    element.style.transform = "none";
    return box;
  }

  const api = {
    applyPetVisualStyle,
    visualBoxForScale,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetVisualStyle = api;
})(typeof window !== "undefined" ? window : globalThis);
