function registerSettingsIpc({
  ipcMain,
  getSettings,
  persistSettings,
  normalizeSettings,
  refreshTray = () => {},
  sendSettingsToPet = () => {},
  getPetWindow = () => null,
} = {}) {
  ipcMain.handle("settings:update", (event, patch = {}) => {
    const normalized = normalizeSettings({ ...(getSettings() || {}), ...(patch || {}) });
    const saved = persistSettings(normalized);
    refreshTray();
    const petWindow = getPetWindow();
    if (!petWindow || event?.sender !== petWindow.webContents) sendSettingsToPet();
    return saved;
  });

  ipcMain.handle("settings:get", () => normalizeSettings(getSettings() || {}));
}

module.exports = { registerSettingsIpc };
