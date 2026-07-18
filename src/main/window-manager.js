function createWindowManager({ BrowserWindow, resolveUrl, onLoadError = () => {} } = {}) {
  function open(entry = {}) {
    const existing = entry.get?.();
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized?.()) existing.restore();
      existing.show?.();
      existing.focus?.();
      return existing;
    }

    const window = new BrowserWindow(entry.windowOptions || {});
    entry.set?.(window);
    if (entry.removeMenu !== false) window.removeMenu?.();
    window.once?.("ready-to-show", () => {
      if (!window.isDestroyed?.()) window.show?.();
    });
    window.on?.("closed", () => entry.set?.(undefined));
    const target = resolveUrl(entry.rendererPath);
    window.loadURL(target).catch((error) => onLoadError(entry.name || entry.rendererPath, error));
    return window;
  }

  return { open };
}

module.exports = { createWindowManager };
