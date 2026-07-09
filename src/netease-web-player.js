function buildNeteaseSongPageUrl(id) {
  return `https://music.163.com/#/song?id=${encodeURIComponent(String(id))}`;
}

function buildNeteaseWebPlayScript() {
  return `
(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const candidatesFor = (doc) => [
    'a[data-res-action="play"]',
    'button[data-res-action="play"]',
    '.u-btni-play',
    '.m-playbar .ply',
    '#g_player .ply',
    'a.ply',
  ].flatMap((selector) => Array.from(doc.querySelectorAll(selector)));
  const tryClick = () => {
    const docs = [document];
    const frame = document.querySelector("#g_iframe");
    if (frame && frame.contentDocument) docs.push(frame.contentDocument);
    for (const doc of docs) {
      const button = candidatesFor(doc).find(visible) || candidatesFor(doc)[0];
      if (button) {
        button.click();
        return true;
      }
    }
    return false;
  };
  return (async () => {
    for (let i = 0; i < 25; i += 1) {
      if (tryClick()) return { success: true, clicked: true };
      await sleep(400);
    }
    return { success: false, error: "play-button-not-found" };
  })();
})()
`;
}

module.exports = {
  buildNeteaseSongPageUrl,
  buildNeteaseWebPlayScript,
};
