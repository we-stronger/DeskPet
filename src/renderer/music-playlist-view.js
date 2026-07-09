(function attachMusicPlaylistView(root) {
  const searchView = root.DeskpetMusicSearchView || {
    escapeHtml: (value) => String(value == null ? "" : value),
    renderSongList: () => "",
  };
  const { escapeHtml } = searchView;

  function renderPlaylists(playlists) {
    if (!Array.isArray(playlists) || playlists.length === 0) {
      return '<div class="music-panel-empty">还没有获取到歌单。</div>';
    }
    return `<ul class="music-panel-list music-panel-list--playlists">${playlists.map((playlist) => {
      const id = escapeHtml(playlist.id);
      const cover = playlist.coverImgUrl ? `<img src="${escapeHtml(playlist.coverImgUrl)}" alt="" />` : '<span class="music-panel-cover-placeholder"></span>';
      return `<li class="music-panel-playlist" data-playlist-id="${id}">
        ${cover}
        <div class="music-panel-playlist__main">
          <strong>${escapeHtml(playlist.name)}</strong>
          <span>${escapeHtml(playlist.trackCount || 0)} 首 · ${escapeHtml(playlist.creator || "")}</span>
        </div>
        <button type="button" class="music-panel-open-playlist" data-playlist-id="${id}">查看</button>
      </li>`;
    }).join("")}</ul>`;
  }

  function renderPlaylistDetail(detail) {
    const playlist = detail && detail.playlist;
    const songs = detail && (detail.songs || detail.tracks);
    const playlistName = playlist && playlist.name ? String(playlist.name) : "";
    const isLikedPlaylist = /喜欢|我喜欢|liked/i.test(playlistName);
    const title = playlist
      ? `<div class="music-panel-detail-title">
        <button type="button" class="music-panel-back-btn" data-action="back" aria-label="返回歌单">← 返回</button>
        <span class="music-panel-detail-title__text">${escapeHtml(playlist.name)}<em>${escapeHtml(playlist.trackCount || 0)} 首</em></span>
      </div>`
      : "";
    const controls = `<div class="music-panel-play-modes" aria-label="歌单播放模式">
      <button type="button" class="music-panel-play-mode" data-play-mode="sequence">顺序播放</button>
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
