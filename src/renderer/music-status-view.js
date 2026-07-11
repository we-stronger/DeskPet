(function attachMusicStatusView(root) {
  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderButton(action, label, title, { disabled = false, pressed = null } = {}) {
    const disabledAttrs = disabled ? " disabled aria-disabled=\"true\"" : "";
    const pressedAttr = typeof pressed === "boolean" ? ` aria-pressed="${pressed ? "true" : "false"}"` : "";
    return `<button class="music-status-bar__button" type="button" data-music-action="${action}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"${pressedAttr}${disabledAttrs}>${label}</button>`;
  }

  function normalizeLyricStyle(style = {}) {
    const color = typeof style.color === "string" && /^#[0-9a-f]{6}$/i.test(style.color.trim())
      ? style.color.trim()
      : "#243044";
    const rawSize = Number(style.fontSize);
    const fontSize = Number.isFinite(rawSize) && rawSize >= 10 && rawSize <= 22
      ? Math.round(rawSize)
      : 12;
    const rawControlSize = Number(style.controlSize);
    const controlSize = Number.isFinite(rawControlSize) && rawControlSize >= 24 && rawControlSize <= 44
      ? Math.round(rawControlSize)
      : 31;
    return { color, fontSize, controlSize };
  }

  function modeLabel(mode) {
    if (mode === "shuffle") return "随机";
    if (mode === "repeat-one") return "单曲";
    if (mode === "heartbeat") return "心动";
    return "顺序";
  }

  function modeIcon(mode) {
    if (mode === "shuffle") return "&#128256;";
    if (mode === "repeat-one") return '<span aria-hidden="true">&#8635;</span><small aria-hidden="true">1</small>';
    if (mode === "heartbeat") return "&#9829;";
    return "&#8645;";
  }

  function renderMusicStatusBar({
    title = "网易云音乐",
    artist = "",
    status = "待命",
    lyric = "",
    translation = "",
    playing = false,
    lyricStyle = {},
    playMode = "sequence",
    playbackCapabilities = {},
    songId = "",
    liked = false,
    clockSummary = "",
    focusSummary = "",
  } = {}) {
    const playLabel = playing ? "&#10074;&#10074;" : "&#9654;";
    const playTitle = playing ? "暂停/播放" : "播放/暂停";
    const meta = artist ? `${title} · ${artist}` : title;
    const style = normalizeLyricStyle(lyricStyle);
    const modeText = modeLabel(playMode);
    const modeSymbol = modeIcon(playMode);
    const widgets = [
      clockSummary ? `<span class="music-status-bar__widget music-status-bar__widget--clock">${escapeHtml(clockSummary)}</span>` : "",
      focusSummary ? `<span class="music-status-bar__widget music-status-bar__widget--focus">${escapeHtml(focusSummary)}</span>` : "",
    ].filter(Boolean).join("");
    const lyricHtml = lyric
      ? `<span class="music-status-bar__lyric-line">${escapeHtml(lyric)}</span>${translation ? `<span class="music-status-bar__translation">${escapeHtml(translation)}</span>` : ""}`
      : `<span class="music-status-bar__lyric-line">${escapeHtml(status)}</span>`;
    const songActionDisabled = !songId;
    const likeLabel = liked
      ? '<span class="music-status-bar__like-mark" aria-hidden="true">&#10084;</span>'
      : '<span class="music-status-bar__like-mark" aria-hidden="true">&#9825;</span>';
    return `<div class="music-status-bar__main" style="--music-lyric-color: ${style.color}; --music-lyric-size: ${style.fontSize}px; --music-control-size: ${style.controlSize}px;">
      <span class="music-status-bar__decor" aria-hidden="true"><b>✦</b><b>🍃</b><b>✧</b><b>✦</b><b>✧</b><b>✦</b></span>
      <span class="music-status-bar__sparkles" aria-hidden="true"><i>✧</i><i>✦</i><i>✧</i><i>✦</i></span>
      <div class="music-status-bar__text">
        <strong>${escapeHtml(meta)}</strong>
        <span class="music-status-bar__meta">${escapeHtml(status)} · ${escapeHtml(modeText)}</span>
        ${widgets ? `<span class="music-status-bar__widgets">${widgets}</span>` : ""}
        <span class="music-status-bar__lyric">${lyricHtml}</span>
      </div>
      <div class="music-status-bar__controls">
        ${renderButton("previous", "&#9198;", "上一首", { disabled: playbackCapabilities.canPlayPrevious === false })}
        ${renderButton("playPause", playLabel, playTitle)}
        ${renderButton("next", "&#9197;", "下一首", { disabled: playbackCapabilities.canPlayNext === false })}
        ${renderButton("cycleMode", modeSymbol, `切换播放模式：${modeText}`)}
        ${renderButton("toggleLike", likeLabel, liked ? "从我喜欢删除" : "添加到我喜欢", { pressed: liked, disabled: songActionDisabled })}
        ${renderButton("addToPlaylist", "&#8862;", "添加到歌单", { disabled: songActionDisabled })}
        ${renderButton("openPanel", "&#9635;", "打开音乐面板")}
        ${renderButton("account", "&#128100;", "网易云登录 / 退出登录")}
        ${renderButton("openNetease", "&#9835;", "打开网易云音乐")}
      </div>
    </div>`;
  }

  const api = { renderMusicStatusBar, modeLabel, modeIcon };
  if (root) {
    root.DeskpetMusicStatusView = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
