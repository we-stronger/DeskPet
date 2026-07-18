(function attachMusicPlaylistView(root) {
  const searchView = root.DeskpetMusicSearchView || {
    escapeHtml: (value) => String(value == null ? "" : value),
    renderSongList: () => "",
  };
  const { escapeHtml } = searchView;

  function normalizeCoverUrl(value) {
    const url = typeof value === "string" ? value.trim() : "";
    return /^https?:\/\//i.test(url) ? url : "";
  }

  function renderPlaylists(playlists) {
    if (!Array.isArray(playlists) || playlists.length === 0) {
      return '<div class="music-panel-empty">还没有获取到歌单。</div>';
    }
    return `<ul class="music-panel-list music-panel-list--playlists">${playlists.map((playlist) => {
      const id = escapeHtml(playlist.id);
      const coverUrl = normalizeCoverUrl(playlist.coverImgUrl);
      const cover = coverUrl
        ? `<img class="music-panel-playlist__cover" data-cover-url="${escapeHtml(coverUrl)}" src="${escapeHtml(coverUrl)}" alt="" loading="lazy" /><span class="music-panel-cover-placeholder" hidden aria-hidden="true"></span>`
        : '<span class="music-panel-cover-placeholder" aria-hidden="true">♪</span>';
      const name = escapeHtml(playlist.name || "未命名歌单");
      const label = escapeHtml(`Open playlist: ${playlist.name || "Untitled playlist"}`);
      return `<li class="music-panel-playlist-item" data-playlist-id="${id}">
        <article class="music-panel-playlist">
          ${cover}
          <div class="music-panel-playlist__meta">
            <strong>${name}</strong>
            <span>${escapeHtml(playlist.trackCount || 0)} 首 · ${escapeHtml(playlist.creator || "")}</span>
          </div>
          <button type="button" class="music-panel-open-playlist" data-playlist-id="${id}" aria-label="${label}">查看</button>
        </article>
      </li>`;
    }).join("")}</ul>`;
  }

  function renderPlaylistDetail(detail) {
    const playlist = detail && detail.playlist;
    const songs = detail && (detail.songs || detail.tracks);
    const playlistName = playlist && playlist.name ? String(playlist.name) : "";
    const isLikedPlaylist = /喜欢|我喜欢|liked/i.test(playlistName);
    const title = playlist
      ? `<header class="music-panel-detail-summary">
        <button type="button" class="music-panel-back-btn" data-action="back" aria-label="返回歌单">← 返回</button>
        <span class="music-panel-detail-title__text">${escapeHtml(playlist.name)}<em>${escapeHtml(playlist.trackCount || 0)} 首 · ${escapeHtml(playlist.creator || "未知创建者")}</em></span>
      </header>`
      : "";
    const controls = `<div class="music-panel-play-modes" aria-label="歌单播放模式">
      <button type="button" class="music-panel-play-mode music-panel-play-mode--primary" data-play-mode="sequence">播放全部</button>
      <button type="button" class="music-panel-play-mode" data-play-mode="shuffle">随机播放</button>
      <button type="button" class="music-panel-play-mode" data-play-mode="repeat-one">单曲循环</button>
      ${isLikedPlaylist ? '<button type="button" class="music-panel-play-mode music-panel-play-mode--heart" data-play-mode="heartbeat">心动模式</button>' : ""}
    </div>`;
    return `${title}${controls}${searchView.renderSongList(songs, { emptyText: "这张歌单暂时没有歌曲。" })}`;
  }

  root.DeskpetMusicPlaylistView = {
    renderPlaylists,
    renderPlaylistDetail,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.DeskpetMusicPlaylistView;
  }
})(typeof window !== "undefined" ? window : globalThis);
