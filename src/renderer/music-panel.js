(function attachMusicPanel(root) {
  if (typeof document === "undefined") return;

  const bridge = root.deskpet || {};
  const searchView = root.DeskpetMusicSearchView;
  const playlistView = root.DeskpetMusicPlaylistView;
  const dragApi = root.DeskpetWidgetDrag;
  let panel = null;
  let loginWindowOpen = false;
  let currentView = "home";
  let currentPlaylistId = "";
  let currentPlaylistName = "";
  let currentPlaylistIsLiked = false;
  let pendingAddSong = null;
  let qrPollTimer = 0;

  // The panel lives inside the pet's #stage and is
  // positioned via style.left / style.top. The default mirrors the
  // previous top-right layout. currentPosition is the user-saved override; null
  // means "use the default".
  const DEFAULT_PANEL_POSITION = Object.freeze({ x: 160, y: 12 });
  // Panel width is fixed at 340px. Height varies with content (the
  // panel can grow to 488px when showing a full playlist), so the
  // bottom clamp has to be measured at move time — not a constant.
  // We at least require 16px of the top edge to stay on stage so the
  // header (with the drag handle and close button) is always grabbable.
  const PANEL_WIDTH = 340;
  const PANEL_MIN_VISIBLE = 16;
  let currentPosition = null;

  function clampPanelPosition({ x, y }) {
    const stage = document.querySelector("#stage");
    const stageWidth = stage ? (stage.clientWidth || 512) : 512;
    const stageHeight = stage ? (stage.clientHeight || 512) : 512;
    const widthMax = Math.max(0, stageWidth - PANEL_WIDTH);
    // Read the live panel height so a tall playlist (or a collapsed
    // search bar) clamps to the right value. Fall back to a
    // reasonable default if the panel isn't in the DOM yet.
    const height = panel ? (panel.getBoundingClientRect().height || 0) : 200;
    const heightMax = Math.max(0, stageHeight - Math.max(PANEL_MIN_VISIBLE, height));
    return {
      x: Math.max(0, Math.min(widthMax, Math.round(x))),
      y: Math.max(0, Math.min(heightMax, Math.round(y))),
    };
  }

  function applyPanelPosition() {
    if (!panel) return;
    const pos = currentPosition || DEFAULT_PANEL_POSITION;
    panel.style.left = `${pos.x}px`;
    panel.style.top = `${pos.y}px`;
    panel.style.right = "auto";
  }

  // Called by the renderer when a saved position arrives via the
  // `settings:` command (e.g. right after the user restarts the
  // app). `pos` is null when the user has no saved position.
  function setPosition(pos) {
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
      currentPosition = null;
    } else {
      currentPosition = clampPanelPosition(pos);
    }
    if (panel) applyPanelPosition();
  }

  function notifyShapeChanged() {
    window.dispatchEvent(new CustomEvent("deskpet:shape-changed"));
  }

  function bubble(text) {
    if (typeof bridge.showChatReplyInBubble === "function") {
      bridge.showChatReplyInBubble(text).catch(() => {});
    }
  }

  function markLoginWindowClosed() {
    loginWindowOpen = false;
    stopQrPolling();
  }

  function stopQrPolling() {
    if (qrPollTimer) {
      clearTimeout(qrPollTimer);
      qrPollTimer = 0;
    }
  }

  function statusText(error) {
    const map = {
      "not-logged-in": "请先扫码登录。",
      "session-expired": "登录状态过期了。",
      "safe-storage-unavailable": "当前系统不可用安全存储，本次登录不会在重启后保留。",
      "network-error": "好像没连上。",
      "empty-keyword": "想听什么？",
      "empty-playlist-id": "没有选中歌单。",
      "open-failed": "打开网易云失败。",
    };
    return map[error] || (error ? `操作失败：${error}` : "操作失败。");
  }

  function escapeHtml(value) {
    if (searchView && typeof searchView.escapeHtml === "function") {
      return searchView.escapeHtml(value);
    }
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function artistFromSongRow(row) {
    const text = row?.querySelector("span")?.textContent || "";
    return text.split(/[·璺]/)[0].trim();
  }

  function queueFromCurrentSongList() {
    if (!panel) return [];
    return Array.from(panel.querySelectorAll(".music-panel-song[data-song-id]")).map((item) => ({
      id: item.getAttribute("data-song-id") || "",
      title: item.querySelector("strong")?.textContent?.trim() || "",
      artist: artistFromSongRow(item),
      playlistId: currentPlaylistId,
      liked: item.querySelector(".music-panel-like-song")?.getAttribute("aria-pressed") === "true" || /喜欢/.test(currentPlaylistName || ""),
    })).filter((item) => item.id);
  }

  function songListFromQueue(queue) {
    return (Array.isArray(queue) ? queue : []).map((item) => ({
      id: item.id,
      name: item.title || "未命名歌曲",
      artists: item.artist ? [item.artist] : [],
      album: "播放历史",
      duration: 0,
      playable: true,
    }));
  }

  function setStatus(text, tone) {
    const el = panel && panel.querySelector("#music-panel-status");
    if (!el) return;
    el.textContent = text || "";
    if (tone) el.dataset.tone = tone;
    else delete el.dataset.tone;
  }

  function setContent(html) {
    const el = panel && panel.querySelector("#music-panel-content");
    if (!el) return;
    el.innerHTML = html;
    bindContentActions();
    refreshLikedButtons();
    notifyShapeChanged();
  }

  function close() {
    stopQrPolling();
    if (panel) panel.hidden = true;
    notifyShapeChanged();
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "music-panel";
    panel.className = "music-panel";
    panel.setAttribute("aria-label", "网易云音乐");
    panel.hidden = true;
    panel.innerHTML = `<div class="music-panel__header">
      <div class="music-panel__title"><strong>网易云音乐</strong><span id="music-panel-profile">未登录</span></div>
      <button id="music-panel-close" class="settings-close" type="button" aria-label="关闭音乐面板">
        <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16"><path d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
    </div>
    <div id="music-panel-status" class="music-panel-status" aria-live="polite"></div>
    <div id="music-panel-actions" class="music-panel-actions"></div>
    <div id="music-panel-content" class="music-panel-content"></div>`;
    document.querySelector("#stage")?.appendChild(panel);
    panel.querySelector("#music-panel-close")?.addEventListener("click", close);
    // The pet's #stage element captures pointerdown with setPointerCapture
    // and starts drag/tap interaction, which swallows clicks on anything
    // inside it. Stop the events at the panel boundary so buttons here
    // respond normally and right-clicks open this panel's menu instead of
    // the pet's global menu. Mirrors the settings panel's wiring in
    // src/renderer/renderer.js.
    panel.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    panel.addEventListener("contextmenu", (event) => {
      event.stopPropagation();
    });

    // Make the header draggable. The close button remains a normal
    // click target because the drag helper only fires drag-end after
    // the pointer moves past its threshold (4px) — a quick click
    // stays a click.
    if (dragApi && typeof dragApi.attachWidgetDrag === "function") {
      const header = panel.querySelector(".music-panel__header");
      if (header) {
        dragApi.attachWidgetDrag(panel, {
          handle: header,
          threshold: 4,
          onStart: () => {
            panel.classList.add("is-dragging");
          },
          onMove: ({ x, y }) => {
            const clamped = clampPanelPosition({ x, y });
            panel.style.left = `${clamped.x}px`;
            panel.style.top = `${clamped.y}px`;
            panel.style.right = "auto";
          },
          onEnd: ({ x, y }) => {
            panel.classList.remove("is-dragging");
            const clamped = clampPanelPosition({ x, y });
            currentPosition = clamped;
            // Persist the new top-left. settings:update goes through
            // main.js, which writes to disk; the renderer receives the
            // updated settings via the `settings:` command, but the
            // position is already applied locally so no flicker.
            if (typeof bridge.updateSettings === "function") {
              bridge.updateSettings({ musicPanelPosition: clamped }).catch(() => {});
            }
            notifyShapeChanged();
          },
        });
      }
    }

    applyPanelPosition();
    return panel;
  }

  // Renders the action bar (search input + my playlists + pop-out +
  // logout) for a logged-in user. Always sets the same HTML so the
  // layout is stable across the "fresh login" and "panel reopened"
  // cases.
  function setLoggedInActions(nickname) {
    const profileLabel = panel.querySelector("#music-panel-profile");
    const actions = panel.querySelector("#music-panel-actions");
    if (profileLabel) profileLabel.textContent = nickname || "已登录";
    if (!actions) return;
    actions.innerHTML = `<div class="music-panel-session-row">
        <span>账号：${nickname ? escapeHtml(nickname) : "已登录"}</span>
        <button id="music-panel-logout-btn" type="button">退出登录</button>
      </div>
      <div class="music-panel-searchbar">
        <input id="music-panel-search-input" type="search" placeholder="输入歌曲或歌手" />
        <button id="music-panel-search-btn" type="button">搜索</button>
      </div>
      <div class="music-panel-action-row">
        <button id="music-panel-playlists-btn" type="button">我的歌单</button>
        <button id="music-panel-queue-btn" type="button">播放队列</button>
        <button id="music-panel-history-btn" type="button">播放历史</button>
        <button id="music-panel-open-window-btn" type="button">在新窗口中打开</button>
      </div>`;
    bindActionBar();
  }

  async function refreshProfile() {
    const profileLabel = panel.querySelector("#music-panel-profile");
    const actions = panel.querySelector("#music-panel-actions");
    // Distinguish "user has a session but the profile fetch failed"
    // from "user is logged out" by checking session status separately.
    // Without this distinction, a flaky network call would make the
    // panel flip back to the login button right after a successful
    // login, which is exactly the "panel is blank after login" bug.
    const session = typeof bridge.getMusicSessionStatus === "function"
      ? await bridge.getMusicSessionStatus().catch(() => null)
      : null;
    const sessionLoggedIn = !!(session && session.loggedIn);
    const profile = typeof bridge.getProfile === "function" ? await bridge.getProfile().catch(() => null) : null;
    console.debug("[music-panel] refreshProfile session=", JSON.stringify(session), "profile=", JSON.stringify(profile).slice(0, 200));
    if (profile && profile.success && profile.profile) {
      setLoggedInActions(profile.profile.nickname || "已登录");
      return true;
    }
    if (sessionLoggedIn) {
      // Network/API error after login. The cookie is still valid (the
      // main process just saved it) so the user IS logged in — they
      // just can't see their nickname yet. Still show the search bar
      // so they can use the panel, and surface the error in the status
      // line.
      if (profile && profile.error) {
        console.warn("[music-panel] getProfile failed:", profile.error);
      }
      setLoggedInActions(null);
      return true;
    }
    profileLabel.textContent = "未登录";
    actions.innerHTML = `<div class="music-panel-login-card">
        <div>
          <strong>登录网易云音乐</strong>
          <span>扫码后可以查看歌单、私人 FM 和推荐内容。</span>
        </div>
        <button id="music-panel-login-btn" type="button">扫码登录</button>
      </div>`;
    bindActionBar();
    return false;
  }

  function bindActionBar() {
    panel.querySelector("#music-panel-login-btn")?.addEventListener("click", startQrLogin);
    panel.querySelector("#music-panel-logout-btn")?.addEventListener("click", logout);
    panel.querySelector("#music-panel-playlists-btn")?.addEventListener("click", () => showPlaylists());
    panel.querySelector("#music-panel-queue-btn")?.addEventListener("click", () => showPlaybackQueue());
    panel.querySelector("#music-panel-history-btn")?.addEventListener("click", () => showPlaybackHistory());
    panel.querySelector("#music-panel-search-btn")?.addEventListener("click", () => runSearch());
    // Pop the music UI out into a standalone resizable window. Close
    // the in-pet panel first so the pet animation isn't covered while
    // the user is using the standalone window — the compact panel is
    // meant to be a launcher, not a duplicate of the standalone UI.
    panel.querySelector("#music-panel-open-window-btn")?.addEventListener("click", () => {
      bridge.openMusicWindow?.().catch(() => {});
      close();
    });
    panel.querySelector("#music-panel-search-input")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch();
      }
    });
  }

  function songFromActionButton(button) {
    const id = button && button.getAttribute("data-song-id");
    const row = button && button.closest(".music-panel-song");
    const likeButton = row?.querySelector(".music-panel-like-song[data-song-id]");
    return {
      id,
      title: row?.querySelector("strong")?.textContent?.trim() || "",
      artist: artistFromSongRow(row),
      liked: likeButton?.getAttribute("aria-pressed") === "true" || currentPlaylistIsLiked,
    };
  }

  function confirmPlaylistSongRemoval(song) {
    const songName = song && (song.title || song.id) ? (song.title || song.id) : "这首歌";
    const playlistName = currentPlaylistName || "当前歌单";
    return root.confirm(`确定从歌单中删除“${songName}”吗？\n歌单：${playlistName}`);
  }

  function setLikedButtonState(button, liked) {
    button.setAttribute("aria-pressed", liked ? "true" : "false");
    button.classList.toggle("is-liked", liked);
    button.textContent = liked ? "♥" : "♡";
    button.title = liked ? "取消喜欢" : "加入我喜欢";
    button.setAttribute("aria-label", button.title);
  }

  async function refreshLikedButtons() {
    if (!panel || typeof bridge.checkLikedSongs !== "function") return;
    const buttons = Array.from(panel.querySelectorAll(".music-panel-like-song[data-song-id]"));
    if (!buttons.length) return;
    const ids = buttons.map((button) => button.getAttribute("data-song-id")).filter(Boolean);
    const result = await bridge.checkLikedSongs(ids).catch(() => null);
    if (!(result && result.success && result.liked)) return;
    for (const button of buttons) {
      const id = button.getAttribute("data-song-id");
      setLikedButtonState(button, result.liked[id] === true);
    }
  }

  async function showAddToPlaylistChooser(song) {
    if (!song || !song.id) return;
    pendingAddSong = song;
    setStatus("正在加载歌单...", "info");
    const result = await bridge.getUserPlaylists?.().catch(() => null);
    if (!(result && result.success && Array.isArray(result.playlists))) {
      setStatus(statusText((result && result.error) || "network-error"), "error");
      return;
    }
    const rows = result.playlists
      .filter((playlist) => playlist.editable !== false)
      .map((playlist) => {
        const id = escapeHtml(playlist.id);
        const name = escapeHtml(playlist.name || "未命名歌单");
        const count = escapeHtml(playlist.trackCount || 0);
        return `<button type="button" class="music-panel-add-target" data-playlist-id="${id}">
          <strong>${name}</strong><span>${count} 首</span>
        </button>`;
      }).join("");
    setStatus(`选择要加入的歌单：${song.title || song.id}`, "info");
    setContent(`<div class="music-panel-add-chooser">
      <button type="button" class="music-panel-back-btn" data-action="back">返回</button>
      ${rows || '<div class="music-panel-empty">没有可用歌单。</div>'}
    </div>`);
  }

  function bindContentActions() {
    panel.querySelectorAll(".music-panel-play-mode").forEach((button) => {
      button.addEventListener("click", () => playVisibleQueue(button.getAttribute("data-play-mode")));
    });
    panel.querySelectorAll(".music-panel-like-song").forEach((button) => {
      button.addEventListener("click", async () => {
        const song = songFromActionButton(button);
        if (!song.id || typeof bridge.likeSong !== "function") return;
        const nextLiked = button.getAttribute("aria-pressed") !== "true";
        const result = await bridge.likeSong(song.id, nextLiked).catch(() => null);
        if (result && result.success) setLikedButtonState(button, nextLiked);
        setStatus(
          result && result.success ? (nextLiked ? "已加入我喜欢。" : "已取消喜欢。") : statusText((result && result.error) || "open-failed"),
          result && result.success ? "ok" : "error",
        );
      });
    });
    panel.querySelectorAll(".music-playback-play").forEach((button) => {
      button.addEventListener("click", () => playPlaybackItem(button));
    });
    panel.querySelectorAll(".music-history-delete").forEach((button) => {
      button.addEventListener("click", async () => {
        const result = await root.DeskpetMusicPlaybackService?.removeHistoryItem(
          button.getAttribute("data-song-id"),
          bridge,
        );
        if (result && result.success) await showPlaybackHistory();
        else setStatus(statusText((result && result.error) || "open-failed"), "error");
      });
    });
    panel.querySelector(".music-history-clear")?.addEventListener("click", async () => {
      if (!root.confirm("确定清空全部播放历史吗？")) return;
      const result = await root.DeskpetMusicPlaybackService?.clearHistory(bridge);
      if (result && result.success) await showPlaybackHistory();
      else setStatus(statusText((result && result.error) || "open-failed"), "error");
    });
    panel.querySelectorAll(".music-panel-add-song").forEach((button) => {
      button.addEventListener("click", () => showAddToPlaylistChooser(songFromActionButton(button)));
    });
    panel.querySelectorAll(".music-panel-remove-song").forEach((button) => {
      button.addEventListener("click", async () => {
        const song = songFromActionButton(button);
        if (!song.id) return;
        if (!currentPlaylistId || typeof bridge.manipulatePlaylistTracks !== "function") {
          setStatus("请先打开某个歌单后再删除歌曲。", "info");
          return;
        }
        if (!confirmPlaylistSongRemoval(song)) return;
        const result = await bridge.manipulatePlaylistTracks({ op: "del", playlistId: currentPlaylistId, songIds: [song.id] }).catch(() => null);
        if (result && result.success) {
          button.closest(".music-panel-song")?.remove();
          setStatus("已从歌单删除。", "ok");
          notifyShapeChanged();
        } else {
          setStatus(statusText((result && result.error) || "open-failed"), "error");
        }
      });
    });
    panel.querySelectorAll(".music-panel-add-target").forEach((button) => {
      button.addEventListener("click", async () => {
        const playlistId = button.getAttribute("data-playlist-id");
        if (!pendingAddSong || !playlistId || typeof bridge.manipulatePlaylistTracks !== "function") return;
        const result = await bridge.manipulatePlaylistTracks({ op: "add", playlistId, songIds: [pendingAddSong.id] }).catch(() => null);
        if (result && result.success) {
          pendingAddSong = null;
          await showPlaylists();
          setStatus("已加入歌单。", "ok");
        } else {
          setStatus(statusText((result && result.error) || "open-failed"), "error");
        }
      });
    });
    panel.querySelectorAll(".music-panel-open-song").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-song-id");
        if (!id) return;
        const row = button.closest(".music-panel-song");
        const song = songFromActionButton(button);
        const title = song.title;
        const artist = song.artist;
        const result = await root.DeskpetMusicPlaybackService.playSongWithFallback(id, {
          bridge,
          audioPlayer: root.DeskpetAudioPlayer,
          queue: queueFromCurrentSongList(),
          playlistId: currentPlaylistId,
          meta: { title, artist, liked: song.liked === true },
          setStatus,
          logger: root.console,
        });
        if (result && result.success) {
          const isAudioPlayback = result.method === "audio" || result.method === "audio-host" || result.method === "web-player";
          const visibleWebFallback = result.method === "web-player-visible";
          const message = visibleWebFallback
            ? "已打开网易云网页播放器，请在窗口内确认播放。"
            : (isAudioPlayback ? "正在后台播放这首歌。" : "帮你打开这首歌。");
          setStatus(message, visibleWebFallback ? "info" : "ok");
          bubble(message);
        } else {
          setStatus(statusText((result && result.error) || "open-failed"), "error");
          bubble("打开网易云失败。");
        }
      });
    });
    panel.querySelectorAll(".music-panel-open-playlist").forEach((button) => {
      button.addEventListener("click", () => showPlaylistDetail(button.getAttribute("data-playlist-id")));
    });
    // The back button is rendered inside `renderPlaylistDetail`'s
    // title row. Clicking it returns to the playlist list (re-fetches
    // so the list reflects any out-of-band changes).
    panel.querySelectorAll(".music-panel-back-btn").forEach((button) => {
      button.addEventListener("click", () => showPlaylists());
    });
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
      queue,
      mode: normalizedMode,
      playlistId: currentPlaylistId,
      meta: { title: first.title, artist: first.artist, liked: first.liked === true },
      setStatus,
      logger: root.console,
    });
    if (result && result.success) {
      const label = normalizedMode === "shuffle" ? "随机播放" : (normalizedMode === "heartbeat" ? "心动模式" : "顺序播放");
      setStatus(`${label}已开始。`, "ok");
      bubble(`${label}已开始。`);
    } else {
      setStatus(statusText((result && result.error) || "open-failed"), "error");
    }
  }

  async function playPlaybackItem(button) {
    const service = root.DeskpetMusicPlaybackService;
    if (!service) return;
    const id = button.getAttribute("data-song-id");
    const row = button.closest(".music-playback-row");
    const state = service.getPlaybackState();
    const kind = row?.closest("[data-playback-kind]")?.getAttribute("data-playback-kind");
    const item = (kind === "history" ? state.history : state.queue).find((entry) => entry.id === id);
    if (!item) return;
    const result = await service.playSongWithFallback(id, {
      bridge,
      audioPlayer: root.DeskpetAudioPlayer,
      queue: kind === "queue" ? state.queue : undefined,
      mode: state.mode,
      playlistId: item.playlistId,
      meta: { title: item.title, artist: item.artist, liked: item.liked === true },
      setStatus,
      logger: root.console,
    });
    if (result && result.success) {
      setStatus(`正在播放：${item.title || "未命名歌曲"}`, "ok");
      if (kind === "queue") await showPlaybackQueue();
    } else {
      setStatus(statusText((result && result.error) || "open-failed"), "error");
    }
  }

  async function showPlaybackQueue() {
    currentPlaylistId = "";
    currentPlaylistName = "";
    currentPlaylistIsLiked = false;
    const service = root.DeskpetMusicPlaybackService;
    const state = service ? await service.syncPlaybackState(bridge) : { queue: [], currentIndex: -1 };
    setStatus(state.queue.length ? `队列中有 ${state.queue.length} 首歌曲。` : "播放队列为空。", state.queue.length ? "ok" : "empty");
    setContent(searchView.renderPlaybackList(state.queue, { kind: "queue", currentIndex: state.currentIndex }));
  }

  async function showPlaybackHistory() {
    currentPlaylistId = "";
    currentPlaylistName = "";
    currentPlaylistIsLiked = false;
    const service = root.DeskpetMusicPlaybackService;
    const state = service ? await service.syncPlaybackState(bridge) : { history: [] };
    const history = state.history || [];
    setStatus(history.length ? "这是最近播放。" : "还没有播放历史。", history.length ? "ok" : "empty");
    setContent(searchView.renderPlaybackList(history, { kind: "history" }));
  }

  async function startQrLogin() {
    stopQrPolling();
    setStatus("正在准备扫码登录...", "info");
    setContent('<div class="music-panel-qr music-panel-loading">正在生成二维码...</div>');
    const keyResult = await bridge.createNeteaseQrKey().catch(() => null);
    if (!keyResult || !keyResult.success || !keyResult.key) {
      setStatus(statusText((keyResult && keyResult.error) || "open-failed"), "error");
      setContent('<div class="music-panel-empty">二维码生成失败。</div>');
      bubble("二维码生成失败。");
      return;
    }
    const imageResult = typeof bridge.createNeteaseQrImage === "function"
      ? await bridge.createNeteaseQrImage(keyResult.key).catch(() => null)
      : null;
    const qrUrl = (imageResult && imageResult.success && imageResult.qrUrl) || keyResult.qrUrl;
    if (!qrUrl) {
      setStatus("二维码生成失败。", "error");
      setContent('<div class="music-panel-empty">二维码生成失败。</div>');
      return;
    }
    loginWindowOpen = true;
    bubble("打开网易云音乐 App 扫码登录。");
    setStatus("等待扫码", "info");
    setContent(`<div class="music-panel-qr">
      <img id="music-panel-qr-image" src="${qrUrl}" alt="网易云音乐登录二维码" />
      <p class="music-panel-qr-hint">使用网易云音乐 App 扫码确认登录。</p>
      <p id="music-panel-qr-status" class="music-panel-qr-status">等待扫码...</p>
      <button id="music-panel-refresh-qr" type="button">刷新二维码</button>
    </div>`);
    panel.querySelector("#music-panel-refresh-qr")?.addEventListener("click", startQrLogin);
    qrPollTimer = setTimeout(() => pollQrLogin(keyResult.key), 1200);
  }

  async function pollQrLogin(key) {
    qrPollTimer = 0;
    if (!loginWindowOpen || !key) return;
    const result = typeof bridge.checkNeteaseQr === "function"
      ? await bridge.checkNeteaseQr(key).catch(() => null)
      : null;
    const statusEl = panel && panel.querySelector("#music-panel-qr-status");
    if (!result || !result.success) {
      const message = statusText((result && result.error) || "network-error");
      if (statusEl) statusEl.textContent = message;
      setStatus(message, "error");
      qrPollTimer = setTimeout(() => pollQrLogin(key), 2400);
      return;
    }
    if (result.status === "ok") {
      markLoginWindowClosed();
      await refreshProfile();
      setStatus("登录成功。", "ok");
      setContent('<div class="music-panel-empty">登录成功，可以搜索音乐或查看歌单。</div>');
      bubble("登录成功。");
      return;
    }
    if (result.status === "expired") {
      markLoginWindowClosed();
      setStatus("二维码已过期。", "error");
      if (statusEl) statusEl.textContent = "二维码已过期，请刷新。";
      return;
    }
    const waitingText = result.status === "waiting-for-confirm" ? "请在手机上确认登录..." : "等待扫码...";
    if (statusEl) statusEl.textContent = waitingText;
    setStatus(waitingText, "info");
    qrPollTimer = setTimeout(() => pollQrLogin(key), 1800);
  }

  async function logout() {
    stopQrPolling();
    await bridge.logoutMusic?.().catch(() => null);
    await refreshProfile();
    setStatus("已退出登录。", "info");
    setContent('<div class="music-panel-empty">已清除本地登录态。</div>');
  }

  async function runSearch() {
    const input = panel.querySelector("#music-panel-search-input");
    const keyword = input && input.value.trim();
    if (!keyword) {
      setStatus("想听什么？", "info");
      bubble("想听什么？");
      return;
    }
    currentView = "search";
    currentPlaylistId = "";
    currentPlaylistName = "";
    currentPlaylistIsLiked = false;
    setStatus("我帮你找找。", "info");
    const result = await bridge.searchMusic(keyword, 20).catch(() => null);
    if (!result || !result.success) {
      setStatus(statusText((result && result.error) || "network-error"), "error");
      setContent(searchView.renderSongList([], { emptyText: "没有找到结果。" }));
      bubble("没有找到结果。");
      return;
    }
    setStatus(result.songs.length ? "找到这些歌。" : "没有找到结果。", result.songs.length ? "ok" : "empty");
    setContent(searchView.renderSongList(result.songs, { emptyText: "没有找到结果。" }));
    bubble(result.songs.length ? "找到这些歌。" : "没有找到结果。");
  }

  async function showPlaylists() {
    currentView = "playlists";
    currentPlaylistId = "";
    currentPlaylistName = "";
    currentPlaylistIsLiked = false;
    setStatus("正在获取歌单...", "info");
    setContent('<div class="music-panel-loading">加载歌单中...</div>');
    const result = await bridge.getUserPlaylists().catch((err) => {
      console.warn("[music-panel] getUserPlaylists threw:", err);
      return null;
    });
    // Diagnostic — renderer's DevTools console shows the actual error
    // code NetEase returned, so we can pair it with the main-process log
    // in `netease-client.js` to figure out what's broken.
    console.warn("[music-panel] getUserPlaylists result:", JSON.stringify(result));
    if (!result || !result.success) {
      setStatus(statusText((result && result.error) || "network-error"), "error");
      setContent('<div class="music-panel-empty">请先扫码登录后查看歌单。</div>');
      bubble((result && result.error) === "not-logged-in" ? "登录状态过期了。" : "好像没连上。");
      return;
    }
    setStatus("这是你的歌单。", "ok");
    setContent(playlistView.renderPlaylists(result.playlists));
    bubble("这是你的歌单。");
  }

  async function showPlaylistDetail(playlistId) {
    if (!playlistId) return;
    currentPlaylistId = String(playlistId);
    currentPlaylistIsLiked = false;
    setStatus("正在获取歌单歌曲...", "info");
    setContent('<div class="music-panel-loading">加载歌单详情...</div>');
    const result = await bridge.getPlaylistDetail(playlistId).catch(() => null);
    if (!result || !result.success) {
      setStatus(statusText((result && result.error) || "network-error"), "error");
      setContent('<div class="music-panel-empty">获取歌单详情失败。</div>');
      bubble("好像没连上。");
      return;
    }
    currentPlaylistName = result.playlist?.name || "";
    currentPlaylistIsLiked = result.playlist?.specialType === 5 || /喜欢/.test(currentPlaylistName || "");
    setStatus("想听哪一首？", "ok");
    setContent(playlistView.renderPlaylistDetail(result));
    bubble("想听哪一首？");
  }

  async function open(view = "home") {
    ensurePanel();
    await root.DeskpetMusicPlaybackService?.connectPlaybackState(bridge);
    panel.hidden = false;
    currentView = view || "home";
    setStatus("", null);
    const loggedIn = await refreshProfile();
    // Surface a trace in the renderer console when running with
    // DevTools open (`DESKPET_DEVTOOLS=1`) so we can confirm in the
    // field which branch the panel ended up in.
    console.debug("[music-panel] open() view=", view, "loggedIn=", loggedIn, "loginWindowOpen=", loginWindowOpen);
    // If the login window is open and we just became logged in, the
    // `music:login-completed` command triggered this open(). Show the
    // success message instead of the default landing copy.
    if (loggedIn && loginWindowOpen) {
      markLoginWindowClosed();
      setStatus("登录成功！", "ok");
      setContent('<div class="music-panel-empty">登录成功，可以搜索音乐或查看歌单。</div>');
      bubble("登录成功啦。");
      notifyShapeChanged();
      return;
    }
    // If refreshProfile() reported we're logged in but the loginWindow
    // flag was already cleared (e.g. the renderer was reloaded mid-flow,
    // or the user opened the panel again right after the success event
    // fired), make sure the actions/content still reflect the logged-in
    // state instead of falling into the default copy.
    if (loggedIn) {
      setStatus("", null);
      setContent('<div class="music-panel-empty">可以搜索音乐，或者查看我的歌单。</div>');
      notifyShapeChanged();
      return;
    }
    if (currentView === "search") {
      if (!loggedIn) setContent('<div class="music-panel-empty">可以直接搜索，也可以扫码登录后查看歌单。</div>');
      else setContent('<div class="music-panel-empty">输入歌曲或歌手开始搜索。</div>');
    } else if (currentView === "playlists") {
      if (loggedIn) await showPlaylists();
      else {
        setStatus("请先扫码登录。", "info");
        setContent('<div class="music-panel-empty">查看我的歌单需要先扫码登录。</div>');
      }
    } else {
      setContent(loggedIn
        ? '<div class="music-panel-empty">可以搜索音乐，或者查看我的歌单。</div>'
        : '<div class="music-panel-empty">扫码登录后可以查看你的网易云歌单。</div>');
    }
    notifyShapeChanged();
  }

  function notifyLoginFailed() {
    markLoginWindowClosed();
    if (!panel) return;
    setStatus("扫码登录失败了，再试一次。", "error");
    setContent('<div class="music-panel-empty">扫码登录失败，请重新打开扫码窗口。</div>');
    bubble("扫码登录失败了。");
    notifyShapeChanged();
  }

  async function addSongToPlaylist(song) {
    ensurePanel();
    panel.hidden = false;
    currentView = "playlists";
    await refreshProfile();
    return showAddToPlaylistChooser(song);
  }

  root.DeskpetMusicPanel = { open, close, notifyLoginFailed, setPosition, addSongToPlaylist };
})(typeof window !== "undefined" ? window : globalThis);
