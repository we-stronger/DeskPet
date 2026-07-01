(function attachHoldVisualLock(root) {
  function createHoldVisualLock(element) {
    let locked = false;
    let previousStyle = null;

    function lock() {
      if (locked) {
        return;
      }

      const rect = element.getBoundingClientRect();
      previousStyle = {
        width: element.style.width,
        height: element.style.height,
        left: element.style.left,
        bottom: element.style.bottom,
        transform: element.style.transform,
        transition: element.style.transition,
      };

      element.style.width = `${Math.round(rect.width)}px`;
      element.style.height = `${Math.round(rect.height)}px`;
      element.style.transform = "none";
      element.style.transition = "none";
      locked = true;
    }

    function unlock() {
      if (!locked) {
        return;
      }

      if (previousStyle) {
        element.style.width = previousStyle.width;
        element.style.height = previousStyle.height;
        element.style.left = previousStyle.left;
        element.style.bottom = previousStyle.bottom;
        element.style.transform = previousStyle.transform;
        element.style.transition = previousStyle.transition;
      }

      previousStyle = null;
      locked = false;
    }

    function isLocked() {
      return locked;
    }

    return { isLocked, lock, unlock };
  }

  const api = { createHoldVisualLock };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetHoldVisualLock = api;
})(typeof window !== "undefined" ? window : globalThis);
