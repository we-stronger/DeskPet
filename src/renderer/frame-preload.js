(function attachFramePreload(root) {
  function createFramePreloader({ ImageCtor } = {}) {
    const Ctor = ImageCtor || (root && root.Image);
    const entries = new Map();
    const ready = new Set();

    function preload(src) {
      if (typeof src !== "string" || !src || typeof Ctor !== "function") {
        return Promise.resolve(false);
      }
      if (entries.has(src)) return entries.get(src);
      const promise = new Promise((resolve) => {
        const image = new Ctor();
        image.onload = () => {
          ready.add(src);
          resolve(true);
        };
        image.onerror = () => resolve(false);
        image.src = src;
      });
      entries.set(src, promise);
      return promise;
    }

    function has(src) {
      return entries.has(src);
    }

    function isReady(src) {
      return ready.has(src);
    }

    function clear() {
      entries.clear();
      ready.clear();
    }

    return { clear, has, isReady, preload };
  }

  const api = { createFramePreloader };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.DeskpetFramePreload = api;
})(typeof window !== "undefined" ? window : globalThis);
