(function attachMusicSearchView(root) {
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDuration(ms) {
    if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) return "--:--";
    const total = Math.round(Number(ms) / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function renderSongActions(id) {
    return `<div class="music-panel-song__actions">
        <button type="button" class="music-panel-like-song" data-song-id="${id}" title="加入我喜欢" aria-label="加入我喜欢" aria-pressed="false">♡</button>
        <button type="button" class="music-panel-add-song" data-song-id="${id}" title="加入歌单">＋</button>
        <button type="button" class="music-panel-remove-song" data-song-id="${id}" title="从歌单删除">－</button>
        <button type="button" class="music-panel-open-song" data-song-id="${id}">播放</button>
      </div>`;
  }

  function renderPlaybackList(items, { kind = "queue", currentIndex = -1 } = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      return `<div class="music-panel-empty">${kind === "history" ? "还没有播放历史。" : "播放队列为空。"}</div>`;
    }
    const rows = items.map((item, index) => {
      const id = escapeHtml(item.id);
      const title = escapeHtml(item.title || "未命名歌曲");
      const artist = escapeHtml(item.artist || "未知歌手");
      const source = escapeHtml(item.source || (item.playlistId ? "歌单播放" : "搜索播放"));
      const playedAt = item.playedAt
        ? escapeHtml(new Date(item.playedAt).toLocaleString("zh-CN", { hour12: false }))
        : "";
      const unavailable = item.playable === false
        ? `<span class="music-playback-unavailable">暂不可用${item.error ? `：${escapeHtml(item.error)}` : ""}</span>`
        : "";
      const isCurrent = kind === "queue" && index === currentIndex;
      const isNext = kind === "queue" && index === currentIndex + 1;
      const stateClass = isCurrent ? " is-current" : (isNext ? " is-next" : "");
      const marker = isCurrent
        ? '<span class="music-playback-marker">正在播放</span>'
        : (isNext ? '<span class="music-playback-marker">下一首</span>' : "");
      const deleteButton = kind === "history"
        ? `<button type="button" class="music-history-delete" data-song-id="${id}" title="删除此条记录" aria-label="删除此条记录">⌫</button>`
        : "";
      return `<li class="music-playback-row${stateClass}" data-song-id="${id}">
        <div class="music-playback-row__index">${index + 1}</div>
        <div class="music-playback-row__main">
          <div><strong>${title}</strong>${marker}</div>
          <span>${artist} · ${source}${playedAt ? ` · ${playedAt}` : ""}${unavailable}</span>
        </div>
        <div class="music-playback-row__actions">
          <button type="button" class="music-playback-play" data-song-id="${id}" title="播放" aria-label="播放">▶</button>
          ${deleteButton}
        </div>
      </li>`;
    }).join("");
    const toolbar = kind === "history"
      ? '<div class="music-playback-toolbar"><span>最近播放</span><button type="button" class="music-history-clear">清空</button></div>'
      : '<div class="music-playback-toolbar"><span>当前播放队列</span></div>';
    return `${toolbar}<ol class="music-playback-list" data-playback-kind="${kind}">${rows}</ol>`;
  }

  function renderSongList(songs, { emptyText = "没有找到结果。" } = {}) {
    if (!Array.isArray(songs) || songs.length === 0) {
      return `<div class="music-panel-empty">${escapeHtml(emptyText)}</div>`;
    }
    return `<ul class="music-panel-list music-panel-list--songs">${songs.map((song) => {
      const id = escapeHtml(song.id);
      const title = escapeHtml(song.name || "未命名歌曲");
      const artists = escapeHtml((song.artists || []).join(" / ") || "未知歌手");
      const album = escapeHtml(song.album || "未知专辑");
      const duration = escapeHtml(formatDuration(song.duration));
      const playable = song.playable === false ? "受限" : "可打开";
      const coverUrl = typeof song.coverUrl === "string" && /^https?:\/\//i.test(song.coverUrl) ? escapeHtml(song.coverUrl) : "";
      return `<li class="music-panel-song" data-song-id="${id}"${coverUrl ? ` data-cover-url="${coverUrl}"` : ""}>
        <div class="music-panel-song__main">
          <strong>${title}</strong>
          <span>${artists} · ${album} · ${duration} · ${playable}</span>
        </div>
        ${renderSongActions(id)}
      </li>`;
    }).join("")}</ul>`;
  }

  root.DeskpetMusicSearchView = {
    escapeHtml,
    formatDuration,
    renderPlaybackList,
    renderSongList,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.DeskpetMusicSearchView;
  }
})(typeof window !== "undefined" ? window : globalThis);
