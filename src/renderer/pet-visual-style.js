(function attachPetVisualStyle(root) {
  const MAX_VISUAL_SCALE = 2;
  const BASE_VISUAL_SIZE = 512;
  const runtimeStyle = typeof document !== "undefined"
    ? root.DeskpetRuntimeStyle?.createRuntimeStyleManager?.(document)
    : null;

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
      bottom: stageHeight > BASE_VISUAL_SIZE && height > 0
        ? Math.max(0, Math.round((stageHeight - height) / 2))
        : 0,
    };
  }

  function applyPetVisualStyle(element, stageSize, scale) {
    const box = visualBoxForScale(stageSize, scale);
    if (runtimeStyle) {
      runtimeStyle.apply(element, "pet-visual", {
        width: `${box.width}px`,
        height: `${box.height}px`,
        left: `${box.left}px`,
        bottom: `${box.bottom}px`,
        transform: "none",
      });
    } else {
      element.style.width = `${box.width}px`;
      element.style.height = `${box.height}px`;
      element.style.left = `${box.left}px`;
      element.style.bottom = `${box.bottom}px`;
      element.style.transform = "none";
    }
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
