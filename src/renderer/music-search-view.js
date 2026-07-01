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
      return `<li class="music-panel-song" data-song-id="${id}">
        <div class="music-panel-song__main">
          <strong>${title}</strong>
          <span>${artists} · ${album} · ${duration} · ${playable}</span>
        </div>
        <button type="button" class="music-panel-open-song" data-song-id="${id}">打开</button>
      </li>`;
    }).join("")}</ul>`;
  }

  root.DeskpetMusicSearchView = {
    escapeHtml,
    formatDuration,
    renderSongList,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.DeskpetMusicSearchView;
  }
})(typeof window !== "undefined" ? window : globalThis);