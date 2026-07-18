(function attachPointerActionPolicy(root) {
  function visualActionForPointerResult(result) {
    if (!result || typeof result.type !== "string") {
      return null;
    }

    if (result.type === "click") {
      return "tap";
    }

    if (result.type === "drag-start") {
      return "drag";
    }

    if (result.type === "drag-end") {
      return "idle";
    }

    return null;
  }

  function shouldIgnorePetMouseEvents({ petClickThroughEnabled = false } = {}) {
    return petClickThroughEnabled === true;
  }

  const api = { shouldIgnorePetMouseEvents, visualActionForPointerResult };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetPointerActionPolicy = api;
})(typeof window !== "undefined" ? window : globalThis);
