function sanitizeText(value, fallback, maxLength) {
  if (typeof value !== "string") return fallback;
  const text = value.trim().slice(0, maxLength);
  return text || fallback;
}

function registerFocusSystem({ ipcMain, Notification, powerMonitor, sendCommand } = {}) {
  const reconcile = () => sendCommand?.("focus:reconcile");
  powerMonitor?.on?.("resume", reconcile);
  ipcMain.handle("focus:notify", (_event, payload = {}) => {
    if (!Notification?.isSupported?.()) return { success: false, error: "notifications-not-supported" };
    const notification = new Notification({
      title: sanitizeText(payload.title, "DeskPet focus reminder", 80),
      body: sanitizeText(payload.body, "", 240),
      silent: payload.silent !== false,
    });
    notification.show();
    return { success: true };
  });
  return {
    destroy() {
      powerMonitor?.removeListener?.("resume", reconcile);
    },
  };
}

module.exports = { registerFocusSystem, sanitizeText };
