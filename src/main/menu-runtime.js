function createTrayMenuRuntime({ Menu, buildTemplate, getState } = {}) {
  let tray;

  function setTray(nextTray) {
    tray = nextTray;
  }

  function refresh() {
    if (!tray || !Menu || typeof buildTemplate !== "function") return false;
    const template = buildTemplate(getState?.() || {});
    tray.setContextMenu(Menu.buildFromTemplate(template));
    return true;
  }

  return { setTray, refresh };
}

module.exports = { createTrayMenuRuntime };
