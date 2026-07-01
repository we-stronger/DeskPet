(function attachPetSettings(root) {
  const percentagePresets = Array.from({ length: 21 }, (_value, index) => index * 10);
  const actionScales = {
    drag: 0.55,
    sleep: 0.5,
  };

  function normalizePercent(value) {
    const percent = Number(value);
    if (!Number.isFinite(percent)) {
      return 100;
    }
    return Math.max(0, Math.min(200, percent));
  }

  function sizePercentToMultiplier(value) {
    return normalizePercent(value) / 100;
  }

  function speedPercentToMultiplier(value) {
    return normalizePercent(value) / 100;
  }

  function actionScaleForAction(action) {
    return actionScales[action] || 1;
  }

  function visibleScaleForAction(percent, action) {
    return sizePercentToMultiplier(percent) * actionScaleForAction(action);
  }

  const api = {
    percentagePresets,
    normalizePercent,
    sizePercentToMultiplier,
    speedPercentToMultiplier,
    actionScaleForAction,
    visibleScaleForAction,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetSettings = api;
})(typeof window !== "undefined" ? window : globalThis);
