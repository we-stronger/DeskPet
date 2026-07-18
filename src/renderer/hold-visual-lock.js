(function attachHoldVisualLock(root) {
  function createHoldVisualLock(element) {
    let locked = false;
    const runtimeStyle = typeof document !== "undefined"
      ? root.DeskpetRuntimeStyle?.createRuntimeStyleManager?.(document)
      : null;

    function lock() {
      if (locked) {
        return;
      }

      const rect = element.getBoundingClientRect();
      if (runtimeStyle) {
        runtimeStyle.apply(element, "pet-hold-lock", {
          width: `${Math.round(rect.width)}px`,
          height: `${Math.round(rect.height)}px`,
          transform: "none",
          transition: "none",
        });
      } else {
        element.style.width = `${Math.round(rect.width)}px`;
        element.style.height = `${Math.round(rect.height)}px`;
        element.style.transform = "none";
        element.style.transition = "none";
      }
      locked = true;
    }

    function unlock() {
      if (!locked) {
        return;
      }

      if (runtimeStyle) runtimeStyle.clear(element, "pet-hold-lock");
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
