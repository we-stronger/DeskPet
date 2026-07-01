function buildElectronArgs({ appArgs }) {
  return [".", ...appArgs];
}

module.exports = {
  buildElectronArgs,
};
