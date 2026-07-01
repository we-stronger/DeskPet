(function attachMusicPanel(root) {
  if (typeof document === "undefined") return;

  const bridge = root.deskpet || {};
  const searchView = root.DeskpetMusicSearchView;
  const playlistView = root.DeskpetMusicPlaylistView;
  const dragApi = root.DeskpetWidgetDrag;
  let panel = null;
  let loginWindowOpen = false;
  let currentView = "home";

  // The panel lives inside the pet's #stage (a 512x512 box) and is
  // positioned via style.left / style.top. The default mirrors the
  // previous top-right layout: 512 − 340 panel width − 12 right
  // margin = 160. currentPosition is the user-saved override; null
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
    const widthMax = Math.max(0, 512 - PANEL_WIDTH);
    // Read the live panel height so a tall playlist (or a collapsed
    // search bar) clamps to the right value. Fall back to a
    // reasonable default if the panel isn't in the DOM yet.
    const height = panel ? (panel.getBoundingClientRect().height || 0) : 200;
    const heightMax = Math.max(0, 512 - Math.max(PANEL_MIN_VISIBLE, height));
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
    notifyShapeChanged();
  }

  function close() {
    // Don't tear down the login window here — the user may still be
    // completing login in it. Just hide the panel; the window keeps
    // detecting cookies on its own.
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
    actions.innerHTML = `<div class="music-panel-searchbar">
        <input id="music-panel-search-input" type="search" placeholder="输入歌曲或歌手" />
        <button id="music-panel-search-btn" type="button">搜索</button>
      </div>
      <div class="music-panel-action-row">
        <button id="music-panel-playlists-btn" type="button">我的歌单</button>
        <button id="music-panel-open-window-btn" type="button">在新窗口中打开</button>
        <button id="music-panel-logout-btn" type="button">退出登录</button>
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
    actions.innerHTML = `<div class="music-panel-action-row"><button id="music-panel-login-btn" type="button">扫码登录</button></div>`;
    bindActionBar();
    return false;
  }

  function bindActionBar() {
    panel.querySelector("#music-panel-login-btn")?.addEventListener("click", startQrLogin);
    panel.querySelector("#music-panel-logout-btn")?.addEventListener("click", logout);
    panel.querySelector("#music-panel-playlists-btn")?.addEventListener("click", () => showPlaylists());
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

  function bindContentActions() {
    panel.querySelectorAll(".music-panel-open-song").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-song-id");
        if (!id) return;
        const result = typeof bridge.openMusicSong === "function"
          ? await bridge.openMusicSong(id).catch(() => null)
          : typeof bridge.openExternal === "function"
            ? await bridge.openExternal(`https://music.163.com/#/song?id=${encodeURIComponent(id)}`).catch(() => null)
            : null;
        if (result && result.success) {
          setStatus("帮你打开这首歌。", "ok");
          bubble("帮你打开这首歌。");
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

  async function startQrLogin() {
    // The main process owns the login window — it polls the window's
    // session cookies for MUSIC_U so we detect login via QR scan, phone,
    // or email. We just kick off the flow and wait for the
    // `music:login-completed` command to arrive on the pet:command bus.
    setStatus("正在准备扫码登录...", "info");
    setContent('<div class="music-panel-qr music-panel-loading">正在打开登录窗口...</div>');
    const result = await bridge.createNeteaseQrKey().catch(() => null);
    if (!result || !result.success) {
      setStatus(statusText((result && result.error) || "open-failed"), "error");
      setContent('<div class="music-panel-empty">登录窗口打开失败。</div>');
      bubble("登录窗口打开失败。");
      return;
    }
    loginWindowOpen = true;
    bubble("扫码登录就可以啦。");
    setStatus("等待登录", "info");
    setContent(`<div class="music-panel-qr">
      <p class="music-panel-qr-hint">登录窗口已打开。在窗口里扫码、用手机号或邮箱登录都行，完成后这里会自动刷新。</p>
      <p class="music-panel-qr-status">等待登录...</p>
      <button id="music-panel-refresh-qr" type="button">重新打开登录窗口</button>
    </div>`);
    panel.querySelector("#music-panel-refresh-qr")?.addEventListener("click", startQrLogin);
  }

  async function logout() {
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
    setStatus("正在获取歌单歌曲...", "info");
    setContent('<div class="music-panel-loading">加载歌单详情...</div>');
    const result = await bridge.getPlaylistDetail(playlistId).catch(() => null);
    if (!result || !result.success) {
      setStatus(statusText((result && result.error) || "network-error"), "error");
      setContent('<div class="music-panel-empty">获取歌单详情失败。</div>');
      bubble("好像没连上。");
      return;
    }
    setStatus("想听哪一首？", "ok");
    setContent(playlistView.renderPlaylistDetail(result));
    bubble("想听哪一首？");
  }

  async function open(view = "home") {
    ensurePanel();
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

  root.DeskpetMusicPanel = { open, close, notifyLoginFailed, setPosition };
})(typeof window !== "undefined" ? window : globalThis);