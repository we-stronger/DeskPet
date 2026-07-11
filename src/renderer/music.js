// Standalone NetEase music window. Mirrors the layout of music-search.html
// and chat.html but pulls in the full music UI: tab bar with five
// surfaces (搜索 / 我的歌单 / 每日推荐 / 热门榜单 / 私人 FM), a back
// button that pops a view stack, and an in-place lyrics overlay for
// the song the user just clicked.
//
// The pet window's compact panel is still a launcher — clicking "在新
// 窗口中打开" there opens this window, but they're independent: each
// window has its own view stack and scroll position.

(function attachMusicWindow(root) {
  if (typeof document === "undefined") return;

  const bridge = root.deskpet || {};
  const searchView = root.DeskpetMusicSearchView;
  const playlistView = root.DeskpetMusicPlaylistView;
  if (!searchView || !playlistView) {
    console.warn("[music-window] view modules missing — did music-search-view.js and music-playlist-view.js load?");
    return;
  }

  // View stack entries are { name, payload }. The back button pops the
  // top entry and re-renders the now-top entry. Pushing happens on
  // tab switches and on drill-downs (playlist → detail, chart →
  // detail, song → lyrics overlay).
  const stack = [];
  let currentTab = "search";
  let fmBusy = false;
  let pendingAddSongId = "";
  let currentPlaylistName = "";

  // --- DOM refs (looked up after DOMContentLoaded) ---
  let tabs = [];
  let searchbar;
  let navrow;
  let backBtn;
  let navTitle;
  let statusEl;
  let contentEl;
  let profileEl;
  let searchInput;

  function setStatus(text, tone) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    if (tone) statusEl.dataset.tone = tone;
    else delete statusEl.dataset.tone;
  }

  function setProfile(text) {
    if (profileEl) profileEl.textContent = text;
  }

  function setContent(html) {
    if (!contentEl) return;
    contentEl.innerHTML = html;
    refreshLikedButtons();
  }

  function setLikedButtonState(button, liked) {
    button.setAttribute("aria-pressed", liked ? "true" : "false");
    button.classList.toggle("is-liked", liked);
    button.textContent = liked ? "♥" : "♡";
    button.title = liked ? "取消喜欢" : "加入我喜欢";
    button.setAttribute("aria-label", button.title);
  }

  async function refreshLikedButtons() {
    if (!contentEl || typeof bridge.checkLikedSongs !== "function") return;
    const buttons = Array.from(contentEl.querySelectorAll(".music-panel-like-song[data-song-id]"));
    if (!buttons.length) return;
    const ids = buttons.map((button) => button.getAttribute("data-song-id")).filter(Boolean);
    const result = await bridge.checkLikedSongs(ids).catch(() => null);
    if (!(result && result.success && result.liked)) return;
    for (const button of buttons) {
      const id = button.getAttribute("data-song-id");
      setLikedButtonState(button, result.liked[id] === true);
    }
  }

  function showSearchbar(visible) {
    if (searchbar) searchbar.hidden = !visible;
  }

  function showNavRow(visible, title) {
    if (!navrow) return;
    navrow.hidden = !visible;
    if (navTitle) navTitle.textContent = title || "";
  }

  function setActiveTab(tabName) {
    currentTab = tabName;
    for (const tab of tabs) {
      const active = tab.dataset.tab === tabName;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    }
  }

  function escapeHtml(value) {
    return searchView.escapeHtml(value);
  }

  function artistFromSongRow(row) {
    const text = row?.querySelector("span")?.textContent || "";
    return text.split(/[·璺]/)[0].trim();
  }

  function queueFromCurrentSongList() {
    if (!contentEl) return [];
    const playlistId = currentPlaylistId();
    return Array.from(contentEl.querySelectorAll(".music-panel-song[data-song-id]")).map((item) => ({
      id: item.getAttribute("data-song-id") || "",
      title: item.querySelector("strong")?.textContent?.trim() || "",
      artist: artistFromSongRow(item),
      playlistId,
    })).filter((item) => item.id);
  }

  function currentPlaylistId() {
    const top = stack[stack.length - 1];
    return top && (top.name === "playlistDetail" || top.name === "chartDetail") ? String(top.id || "") : "";
  }

  // Parse LRC into [{ time: seconds, text }]. Lines without a timestamp
  // are kept as { time: null, text } so they render as section labels.
  function parseLrc(lrc) {
    if (typeof lrc !== "string" || !lrc.trim()) return [];
    const lines = lrc.split(/\r?\n/);
    const out = [];
    const tagRe = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
    for (const line of lines) {
      const matches = [...line.matchAll(tagRe)];
      if (matches.length === 0) {
        const stripped = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, "").trim();
        if (stripped) out.push({ time: null, text: stripped });
        continue;
      }
      // A single line can have multiple timestamps; emit one entry per
      // timestamp pointing at the same trailing text.
      const text = line.replace(tagRe, "").trim();
      for (const m of matches) {
        const min = Number(m[1]);
        const sec = Number(m[2]);
        const ms = m[3] ? Number(m[3].padEnd(3, "0")) / 1000 : 0;
        out.push({ time: min * 60 + sec + ms, text });
      }
    }
    return out.filter((entry) => entry.text);
  }

  // --- View renderers (return HTML strings) ---

  function renderCharts(charts) {
    if (!Array.isArray(charts) || charts.length === 0) {
      return '<div class="music-window__empty">暂时没有榜单数据。</div>';
    }
    return `<ul class="music-window__list music-window__list--charts">${charts.map((chart) => {
      const id = escapeHtml(chart.id);
      const cover = chart.coverImgUrl
        ? `<img src="${escapeHtml(chart.coverImgUrl)}" alt="" loading="lazy" />`
        : '<span class="music-window__cover-placeholder"></span>';
      return `<li class="music-window__chart" data-chart-id="${id}">
        ${cover}
        <div class="music-window__chart__main">
          <strong>${escapeHtml(chart.name)}</strong>
          <span>${escapeHtml(chart.trackCount || 0)} 首</span>
        </div>
        <button type="button" class="music-window__open-chart" data-chart-id="${id}">查看</button>
      </li>`;
    }).join("")}</ul>`;
  }

  function renderLyrics(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return '<div class="music-window__empty">这首歌没有歌词。</div>';
    }
    return `<ol class="music-window__lyrics">${entries.map((entry) => {
      const ts = entry.time == null ? "" : `<span class="music-window__lyric-time">${formatLrcTime(entry.time)}</span>`;
      return `<li${entry.time == null ? ' class="is-meta"' : ""}>${ts}<span>${escapeHtml(entry.text)}</span></li>`;
    }).join("")}</ol>`;
  }

  function formatLrcTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // --- View fetchers (return { html, status, statusTone, searchbar? }) ---

  async function fetchSearch(keyword) {
    if (!keyword) {
      return { html: '<div class="music-window__empty">输入歌曲或歌手开始搜索。</div>', status: "", searchbar: true };
    }
    setStatus("我帮你找找。", "info");
    const result = await bridge.searchMusic(keyword, 30).catch(() => null);
    if (!result || !result.success) {
      return {
        html: searchView.renderSongList([], { emptyText: "没有找到结果。" }),
        status: errorText(result && result.error),
        statusTone: "error",
        searchbar: true,
      };
    }
    return {
      html: searchView.renderSongList(result.songs, { emptyText: "没有找到结果。" }),
      status: result.songs.length ? `找到 ${result.songs.length} 首。` : "没有找到结果。",
      statusTone: result.songs.length ? "ok" : "empty",
      searchbar: true,
    };
  }

  async function fetchPlaylists() {
    setStatus("正在获取歌单...", "info");
    const result = await bridge.getUserPlaylists().catch(() => null);
    if (!result || !result.success) {
      return {
        html: playlistView.renderPlaylists([]),
        status: errorText(result && result.error, "查看歌单需要先扫码登录。"),
        statusTone: (result && result.error) === "not-logged-in" ? "info" : "error",
      };
    }
    return {
      html: playlistView.renderPlaylists(result.playlists),
      status: "这是你的歌单。",
      statusTone: "ok",
    };
  }

  async function fetchAddToPlaylistChooser(songId) {
    setStatus("正在加载歌单...", "info");
    const result = await bridge.getUserPlaylists().catch(() => null);
    if (!result || !result.success || !Array.isArray(result.playlists)) {
      return {
        html: '<div class="music-window__empty">歌单加载失败。</div>',
        status: errorText(result && result.error),
        statusTone: "error",
      };
    }
    const rows = result.playlists
      .filter((playlist) => playlist.editable !== false)
      .map((playlist) => `
        <button type="button" class="music-panel-add-target" data-playlist-id="${escapeHtml(playlist.id)}">
          <strong>${escapeHtml(playlist.name || "未命名歌单")}</strong>
          <span>${escapeHtml(playlist.trackCount || 0)} 首</span>
        </button>`).join("");
    return {
      html: `<div class="music-panel-add-chooser" data-song-id="${escapeHtml(songId)}">
        ${rows || '<div class="music-window__empty">没有可用歌单。</div>'}
      </div>`,
      status: "选择要加入的歌单。",
      statusTone: "info",
    };
  }

  async function fetchPlaybackQueue() {
    const service = root.DeskpetMusicPlaybackService;
    const state = service ? await service.syncPlaybackState(bridge) : { queue: [], currentIndex: -1 };
    return {
      html: searchView.renderPlaybackList(state.queue, { kind: "queue", currentIndex: state.currentIndex }),
      status: state.queue.length ? `队列中有 ${state.queue.length} 首歌曲。` : "播放队列为空。",
      statusTone: state.queue.length ? "ok" : "empty",
    };
  }

  async function fetchPlaybackHistory() {
    const service = root.DeskpetMusicPlaybackService;
    const state = service ? await service.syncPlaybackState(bridge) : { history: [] };
    return {
      html: searchView.renderPlaybackList(state.history, { kind: "history" }),
      status: state.history.length ? "这是最近播放。" : "还没有播放历史。",
      statusTone: state.history.length ? "ok" : "empty",
    };
  }

  async function fetchPlaylistDetail(playlistId) {
    setStatus("正在获取歌单歌曲...", "info");
    const result = await bridge.getPlaylistDetail(playlistId).catch(() => null);
    if (!result || !result.success) {
      return {
        html: '<div class="music-window__empty">获取歌单详情失败。</div>',
        status: errorText(result && result.error),
        statusTone: "error",
      };
    }
    currentPlaylistName = result.playlist?.name || "";
    return {
      html: playlistView.renderPlaylistDetail(result),
      status: `共 ${(result.songs || []).length} 首。`,
      statusTone: "ok",
    };
  }

  async function fetchDaily() {
    setStatus("正在获取每日推荐...", "info");
    const result = await bridge.getDailyRecommend().catch(() => null);
    if (!result || !result.success) {
      return {
        html: searchView.renderSongList([], { emptyText: "请先扫码登录。" }),
        status: errorText(result && result.error, "请先扫码登录。"),
        statusTone: (result && result.error) === "not-logged-in" ? "info" : "error",
      };
    }
    return {
      html: searchView.renderSongList(result.songs, { emptyText: "今日没有推荐。" }),
      status: `今天的 ${result.songs.length} 首推荐。`,
      statusTone: "ok",
    };
  }

  async function fetchCharts() {
    setStatus("正在获取榜单...", "info");
    const result = await bridge.getTopCharts().catch(() => null);
    if (!result || !result.success) {
      return {
        html: '<div class="music-window__empty">榜单加载失败。</div>',
        status: errorText(result && result.error),
        statusTone: "error",
      };
    }
    return {
      html: renderCharts(result.charts),
      status: "这些是当前热门。",
      statusTone: "ok",
    };
  }

  async function fetchChartDetail(chartId) {
    setStatus("正在获取榜单歌曲...", "info");
    // Charts ARE playlists at NetEase — re-use the playlist endpoint
    // so we get the same song normalization + privilege handling.
    const result = await bridge.getPlaylistDetail(chartId).catch(() => null);
    if (!result || !result.success) {
      return {
        html: '<div class="music-window__empty">榜单详情加载失败。</div>',
        status: errorText(result && result.error),
        statusTone: "error",
      };
    }
    currentPlaylistName = result.playlist?.name || "";
    return {
      html: playlistView.renderPlaylistDetail(result),
      status: `共 ${(result.songs || []).length} 首。`,
      statusTone: "ok",
    };
  }

  async function fetchFm() {
    if (fmBusy) return null;
    fmBusy = true;
    setStatus("正在获取下一首...", "info");
    try {
      const result = await bridge.getFmSong().catch(() => null);
      if (!result || !result.success) {
        return {
          html: '<div class="music-window__empty">私人 FM 加载失败。</div>',
          status: errorText(result && result.error, "请先扫码登录。"),
          statusTone: (result && result.error) === "not-logged-in" ? "info" : "error",
        };
      }
      return {
        html: `<div class="music-window__fm-card">
          <div class="music-window__fm-card__label">私人 FM</div>
          <div class="music-window__fm-card__title">${escapeHtml(result.song.name)}</div>
          <div class="music-window__fm-card__meta">${escapeHtml((result.song.artists || []).join(" / ") || "未知艺人")} · ${escapeHtml(result.song.album || "")}</div>
          <div class="music-window__fm-card__actions">
            <button type="button" id="music-window-fm-open" class="music-window__primary-btn" data-song-id="${escapeHtml(result.song.id)}">播放这首歌</button>
            <button type="button" id="music-window-fm-next" class="music-window__primary-btn">下一首</button>
            <button type="button" id="music-window-fm-lyrics" class="music-window__primary-btn" data-song-id="${escapeHtml(result.song.id)}">看歌词</button>
            <button type="button" id="music-window-fm-trash" class="music-window__primary-btn" data-song-id="${escapeHtml(result.song.id)}">不感兴趣</button>
          </div>
        </div>`,
        status: "私人 FM · 一首接一首。",
        statusTone: "ok",
      };
    } finally {
      fmBusy = false;
    }
  }

  function errorText(error, fallback) {
    if (!error) return fallback || "操作失败。";
    const map = {
      "not-logged-in": "请先扫码登录。",
      "session-expired": "登录状态过期了。",
      "network-error": "好像没连上。",
      "empty-keyword": "想听什么？",
      "empty-playlist-id": "没有选中歌单。",
    };
    return map[error] || `操作失败：${error}`;
  }

  // --- View dispatcher: looks at the top of the stack and renders it ---

  async function renderTop() {
    const top = stack[stack.length - 1];
    if (!top) {
      setActiveTab("search");
      showSearchbar(true);
      showNavRow(false);
      const view = await fetchSearch("");
      setContent(view.html);
      setStatus(view.status || "", view.statusTone || null);
      return;
    }
    setActiveTab(top.tab);
    showSearchbar(top.name === "search");
    showNavRow(stack.length > 1, top.navTitle || "");
    let view;
    switch (top.name) {
      case "search":           view = await fetchSearch(top.keyword || ""); break;
      case "playlists":        view = await fetchPlaylists(); break;
      case "addToPlaylist":    view = await fetchAddToPlaylistChooser(top.songId); break;
      case "queue":            view = await fetchPlaybackQueue(); break;
      case "history":          view = await fetchPlaybackHistory(); break;
      case "playlistDetail":   view = await fetchPlaylistDetail(top.id); break;
      case "daily":            view = await fetchDaily(); break;
      case "charts":           view = await fetchCharts(); break;
      case "chartDetail":      view = await fetchChartDetail(top.id); break;
      case "fm":               view = await fetchFm(); break;
      case "lyrics":           view = { html: renderLyrics(top.entries), status: top.songName ? `歌词：${top.songName}` : "歌词", statusTone: "ok" }; break;
      default:                 view = { html: "", status: "" };
    }
    setContent(view.html || "");
    setStatus(view.status || "", view.statusTone || null);
  }

  function pushView(view) {
    stack.push(view);
    renderTop();
  }

  function popView() {
    if (stack.length <= 1) return;
    stack.pop();
    renderTop();
  }

  function resetStack(view) {
    stack.length = 0;
    stack.push(view);
    renderTop();
  }

  // --- Event wiring ---

  function onTabClick(event) {
    const tab = event.currentTarget;
    const name = tab.dataset.tab;
    if (name === currentTab && stack[stack.length - 1] && stack[stack.length - 1].tab === name) return;
    switch (name) {
      case "search":    resetStack({ tab: "search", name: "search", keyword: "" }); break;
      case "playlists": resetStack({ tab: "playlists", name: "playlists" }); break;
      case "daily":     resetStack({ tab: "daily", name: "daily" }); break;
      case "charts":    resetStack({ tab: "charts", name: "charts" }); break;
      case "fm":        resetStack({ tab: "fm", name: "fm" }); break;
    }
  }

  function onContentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const backBtn = target.closest(".music-panel-back-btn");
    if (backBtn) { popView(); return; }
    const openSong = target.closest(".music-panel-open-song");
    if (openSong) { openSongInNetEase(openSong.getAttribute("data-song-id"), openSong.closest(".music-panel-song")); return; }
    const likeSong = target.closest(".music-panel-like-song");
    if (likeSong) { likeCurrentSong(likeSong.getAttribute("data-song-id"), likeSong); return; }
    const playbackSong = target.closest(".music-playback-play");
    if (playbackSong) { playPlaybackItem(playbackSong); return; }
    const deleteHistory = target.closest(".music-history-delete");
    if (deleteHistory) { deleteHistoryItem(deleteHistory.getAttribute("data-song-id")); return; }
    const clearHistory = target.closest(".music-history-clear");
    if (clearHistory) { clearPlaybackHistory(); return; }
    const addSong = target.closest(".music-panel-add-song");
    if (addSong) { showAddToPlaylistChooser(addSong.getAttribute("data-song-id")); return; }
    const addTarget = target.closest(".music-panel-add-target");
    if (addTarget) { addCurrentSongToPlaylist(addTarget.getAttribute("data-playlist-id")); return; }
    const removeSong = target.closest(".music-panel-remove-song");
    if (removeSong) { removeCurrentSongFromPlaylist(removeSong.getAttribute("data-song-id"), removeSong.closest(".music-panel-song")); return; }
    const playMode = target.closest(".music-panel-play-mode");
    if (playMode) { playVisibleQueue(playMode.getAttribute("data-play-mode")); return; }
    const openPlaylist = target.closest(".music-panel-open-playlist");
    if (openPlaylist) {
      pushView({
        tab: "playlists",
        name: "playlistDetail",
        id: openPlaylist.getAttribute("data-playlist-id"),
        navTitle: "歌单详情",
      });
      return;
    }
    const songRow = target.closest(".music-panel-song");
    if (songRow && !openSong) {
      showLyrics(songRow.getAttribute("data-song-id"), songRow);
      return;
    }
    const chartBtn = target.closest(".music-window__open-chart");
    if (chartBtn) {
      pushView({
        tab: "charts",
        name: "chartDetail",
        id: chartBtn.getAttribute("data-chart-id"),
        navTitle: "榜单详情",
      });
      return;
    }
    const chartRow = target.closest(".music-window__chart");
    if (chartRow && !chartBtn) {
      // Clicking the row body also opens the chart.
      pushView({
        tab: "charts",
        name: "chartDetail",
        id: chartRow.getAttribute("data-chart-id"),
        navTitle: "榜单详情",
      });
      return;
    }
    const fmOpen = target.closest("#music-window-fm-open");
    if (fmOpen) { openSongInNetEase(fmOpen.getAttribute("data-song-id"), fmOpen.closest(".music-window__fm-card")); return; }
    const fmNext = target.closest("#music-window-fm-next");
    if (fmNext) { renderTop(); return; }
    const fmLyrics = target.closest("#music-window-fm-lyrics");
    if (fmLyrics) { showLyrics(fmLyrics.getAttribute("data-song-id"), null); return; }
    const fmTrash = target.closest("#music-window-fm-trash");
    if (fmTrash) { trashFmSong(fmTrash.getAttribute("data-song-id")); return; }
  }

  async function likeCurrentSong(id, button) {
    if (!id || typeof bridge.likeSong !== "function") return;
    const nextLiked = button?.getAttribute("aria-pressed") !== "true";
    const result = await bridge.likeSong(id, nextLiked).catch(() => null);
    if (result && result.success && button) setLikedButtonState(button, nextLiked);
    setStatus(
      result && result.success ? (nextLiked ? "已加入我喜欢。" : "已取消喜欢。") : errorText(result && result.error),
      result && result.success ? "ok" : "error",
    );
  }

  async function playPlaybackItem(button) {
    const service = root.DeskpetMusicPlaybackService;
    if (!service) return;
    const id = button.getAttribute("data-song-id");
    const kind = button.closest("[data-playback-kind]")?.getAttribute("data-playback-kind");
    const state = service.getPlaybackState();
    const item = (kind === "history" ? state.history : state.queue).find((entry) => entry.id === id);
    if (!item) return;
    const result = await service.playSongWithFallback(id, {
      bridge,
      audioPlayer: root.DeskpetAudioPlayer,
      queue: kind === "queue" ? state.queue : undefined,
      mode: state.mode,
      playlistId: item.playlistId,
      meta: { title: item.title, artist: item.artist },
      setStatus,
      logger: root.console,
    });
    if (result && result.success) {
      setStatus(`正在播放：${item.title || "未命名歌曲"}`, "ok");
      if (kind === "queue") renderTop();
    } else {
      setStatus(errorText(result && result.error), "error");
    }
  }

  async function deleteHistoryItem(id) {
    const result = await root.DeskpetMusicPlaybackService?.removeHistoryItem(id, bridge);
    if (result && result.success) await renderTop();
    else setStatus(errorText(result && result.error), "error");
  }

  async function clearPlaybackHistory() {
    if (!root.confirm("确定清空全部播放历史吗？")) return;
    const result = await root.DeskpetMusicPlaybackService?.clearHistory(bridge);
    if (result && result.success) await renderTop();
    else setStatus(errorText(result && result.error), "error");
  }

  function showAddToPlaylistChooser(id) {
    if (!id) return;
    pendingAddSongId = String(id);
    pushView({
      tab: currentTab,
      name: "addToPlaylist",
      songId: pendingAddSongId,
      navTitle: "添加到歌单",
    });
  }

  async function addCurrentSongToPlaylist(playlistId) {
    if (!pendingAddSongId || !playlistId || typeof bridge.manipulatePlaylistTracks !== "function") return;
    setStatus("正在加入歌单...", "info");
    const result = await bridge.manipulatePlaylistTracks({
      op: "add",
      playlistId,
      songIds: [pendingAddSongId],
    }).catch(() => null);
    if (result && result.success) {
      pendingAddSongId = "";
      stack.pop();
      await renderTop();
      setStatus("已加入歌单。", "ok");
      return;
    }
    setStatus(errorText(result && result.error), "error");
  }

  async function removeCurrentSongFromPlaylist(id, row) {
    const playlistId = currentPlaylistId();
    if (!id || !playlistId || typeof bridge.manipulatePlaylistTracks !== "function") {
      setStatus("请先打开某个歌单后再删除歌曲。", "info");
      return;
    }
    const songName = row?.querySelector("strong")?.textContent?.trim() || id;
    if (!confirmPlaylistSongRemoval(songName)) return;
    const result = await bridge.manipulatePlaylistTracks({ op: "del", playlistId, songIds: [id] }).catch(() => null);
    if (result && result.success) {
      row?.remove();
      setStatus("已从歌单删除。", "ok");
    } else {
      setStatus(errorText(result && result.error), "error");
    }
  }

  function confirmPlaylistSongRemoval(songName) {
    const playlistName = currentPlaylistName || "当前歌单";
    return root.confirm(`确定从歌单中删除“${songName || "这首歌"}”吗？\n歌单：${playlistName}`);
  }

  async function trashFmSong(id) {
    if (!id || typeof bridge.trashFmSong !== "function") return;
    const result = await bridge.trashFmSong(id).catch(() => null);
    setStatus(result && result.success ? "已减少类似推荐，正在换一首。" : errorText(result && result.error), result && result.success ? "ok" : "error");
    if (result && result.success) renderTop();
  }

  function songMetaFromElement(element) {
    if (!element) return {};
    const title = element.querySelector("strong, .music-window__fm-card__title")?.textContent?.trim() || "";
    const metaText = element.querySelector("span, .music-window__fm-card__meta")?.textContent || "";
    const artist = metaText.split("路")[0].split("·")[0].trim();
    return { title, artist };
  }

  async function openSongInNetEase(id, sourceElement = null) {
    if (!id) return;
    const result = await root.DeskpetMusicPlaybackService.playSongWithFallback(id, {
      bridge,
      audioPlayer: root.DeskpetAudioPlayer,
      queue: queueFromCurrentSongList(),
      playlistId: currentPlaylistId(),
      meta: songMetaFromElement(sourceElement),
      setStatus,
      logger: root.console,
    });
    if (result && result.success) {
      const isAudioPlayback = result.method === "audio" || result.method === "audio-host" || result.method === "web-player";
      const visibleWebFallback = result.method === "web-player-visible";
      const meta = songMetaFromElement(sourceElement);
      const displayName = meta.title ? `：${meta.title}${meta.artist ? ` · ${meta.artist}` : ""}` : "这首歌";
      const message = visibleWebFallback
        ? `已打开网易云网页播放器，请在窗口内确认播放${displayName}`
        : (isAudioPlayback ? `正在播放${displayName}` : `帮你打开${displayName}`);
      setStatus(message, visibleWebFallback ? "info" : "ok");
    } else {
      setStatus(errorText((result && result.error) || "open-failed", "打开网易云失败。"), "error");
    }
  }

  async function playVisibleQueue(mode = "sequence") {
    const queue = queueFromCurrentSongList();
    if (!queue.length || !root.DeskpetMusicPlaybackService) {
      setStatus("当前列表没有可播放歌曲。", "empty");
      return;
    }
    const normalizedMode = mode === "shuffle" || mode === "heartbeat" || mode === "repeat-one" ? mode : "sequence";
    const first = normalizedMode === "sequence"
      ? queue[0]
      : queue[Math.floor(Math.random() * queue.length)] || queue[0];
    const result = await root.DeskpetMusicPlaybackService.playSongWithFallback(first.id, {
      bridge,
      audioPlayer: root.DeskpetAudioPlayer,
      queue: queueFromCurrentSongList(),
      mode: normalizedMode,
      playlistId: currentPlaylistId(),
      meta: { title: first.title, artist: first.artist },
      setStatus,
      logger: root.console,
    });
    if (result && result.success) {
      const label = normalizedMode === "shuffle" ? "随机播放" : (normalizedMode === "heartbeat" ? "心动模式" : "顺序播放");
      setStatus(`${label}已开始。`, "ok");
    } else {
      setStatus(errorText((result && result.error) || "open-failed", "播放失败。"), "error");
    }
  }

  async function showLyrics(songId, songRow) {
    if (!songId) return;
    setStatus("正在获取歌词...", "info");
    const result = await bridge.getSongLyric(songId).catch(() => null);
    const lyric = (result && result.lyric) || "";
    const tlyric = (result && result.tlyric) || "";
    const entries = parseLrc(lyric || tlyric);
    const songName = songRow ? songRow.querySelector("strong")?.textContent || "" : "";
    if (!entries.length) {
      setStatus("这首歌没有歌词。", "empty");
      // Still push the lyrics view so the user sees the empty state.
      pushView({ tab: currentTab, name: "lyrics", entries: [], songName, navTitle: "歌词" });
      return;
    }
    pushView({ tab: currentTab, name: "lyrics", entries, songName, navTitle: "歌词" });
  }

  function onSearchSubmit() {
    if (!searchInput) return;
    const keyword = searchInput.value.trim();
    if (!keyword) {
      setStatus("想听什么？", "info");
      return;
    }
    // Replace any existing search view with the new query.
    stack.length = 0;
    stack.push({ tab: "search", name: "search", keyword, navTitle: `搜索：${keyword}` });
    renderTop();
  }

  async function refreshProfile() {
    const session = typeof bridge.getMusicSessionStatus === "function"
      ? await bridge.getMusicSessionStatus().catch(() => null)
      : null;
    const loggedIn = !!(session && session.loggedIn);
    if (!loggedIn) {
      setProfile("未登录");
      return false;
    }
    const profile = typeof bridge.getProfile === "function"
      ? await bridge.getProfile().catch(() => null)
      : null;
    if (profile && profile.success && profile.profile) {
      setProfile(profile.profile.nickname || "已登录");
      return true;
    }
    setProfile("已登录");
    return true;
  }

  // --- Boot ---

  async function init() {
    tabs = Array.from(document.querySelectorAll(".music-window__tab"));
    searchbar = document.querySelector("[data-searchbar]");
    navrow = document.querySelector("[data-navrow]");
    backBtn = document.querySelector("#music-window-back-btn");
    navTitle = document.querySelector("#music-window-nav-title");
    statusEl = document.querySelector("#music-window-status");
    contentEl = document.querySelector("#music-window-content");
    profileEl = document.querySelector("#music-window-profile");
    searchInput = document.querySelector("#music-window-search-input");

    for (const tab of tabs) {
      tab.addEventListener("click", onTabClick);
    }
    if (backBtn) {
      backBtn.addEventListener("click", popView);
    }
    if (contentEl) {
      contentEl.addEventListener("click", onContentClick);
    }
    if (searchInput) {
      searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSearchSubmit();
        }
      });
    }
    const searchBtn = document.querySelector("#music-window-search-btn");
    if (searchBtn) {
      searchBtn.addEventListener("click", onSearchSubmit);
    }
    document.querySelector("#music-window-queue-btn")?.addEventListener("click", () => {
      resetStack({ tab: currentTab, name: "queue", navTitle: "播放队列" });
    });
    document.querySelector("#music-window-history-btn")?.addEventListener("click", () => {
      resetStack({ tab: currentTab, name: "history", navTitle: "播放历史" });
    });

    // Initial view: empty search.
    await root.DeskpetMusicPlaybackService?.connectPlaybackState(bridge);
    stack.push({ tab: "search", name: "search", keyword: "" });
    refreshProfile();
    renderTop();
    if (searchInput) searchInput.focus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  root.DeskpetMusicWindow = { pushView, popView, resetStack, renderTop };
})(typeof window !== "undefined" ? window : globalThis);
