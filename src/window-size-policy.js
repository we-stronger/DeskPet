const PET_WINDOW_SIZE = Object.freeze({ width: 512, height: 512 });

function shouldRestorePetWindowSize(size) {
  return size[0] !== PET_WINDOW_SIZE.width || size[1] !== PET_WINDOW_SIZE.height;
}

function enforcePetWindowSize(window) {
  window.setMinimumSize(PET_WINDOW_SIZE.width, PET_WINDOW_SIZE.height);
  window.setMaximumSize(PET_WINDOW_SIZE.width, PET_WINDOW_SIZE.height);
  const size = window.getSize();
  if (shouldRestorePetWindowSize(size)) {
    window.setSize(PET_WINDOW_SIZE.width, PET_WINDOW_SIZE.height, false);
  }
}

module.exports = {
  PET_WINDOW_SIZE,
  enforcePetWindowSize,
  shouldRestorePetWindowSize,
};
