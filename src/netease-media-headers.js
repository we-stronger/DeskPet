const NETEASE_REFERER = "https://music.163.com/";
const NETEASE_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function shouldPatchNeteaseMediaRequest(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === "music.126.net" || hostname.endsWith(".music.126.net");
  } catch (_error) {
    return false;
  }
}

function setHeaderCaseInsensitive(headers, name, value) {
  for (const existing of Object.keys(headers)) {
    if (existing.toLowerCase() === name.toLowerCase() && existing !== name) {
      delete headers[existing];
    }
  }
  headers[name] = value;
}

function buildNeteaseMediaHeaders(details = {}) {
  const requestHeaders = { ...(details.requestHeaders || {}) };
  if (!shouldPatchNeteaseMediaRequest(details.url)) {
    return { requestHeaders };
  }

  setHeaderCaseInsensitive(requestHeaders, "Referer", NETEASE_REFERER);
  setHeaderCaseInsensitive(requestHeaders, "User-Agent", NETEASE_BROWSER_UA);
  return { requestHeaders };
}

module.exports = {
  NETEASE_BROWSER_UA,
  NETEASE_REFERER,
  buildNeteaseMediaHeaders,
  shouldPatchNeteaseMediaRequest,
};
