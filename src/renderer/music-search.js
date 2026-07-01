(function attachMusicSearch(root) {
  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDuration(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return "";
    const totalSeconds = Math.round(durationMs / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function buttonLabelForPlayState(state) {
    return {
      idle: "播放",
      playing: "打开中",
      done: "已打开",
      error: "重试",
    }[state] || "播放";
  }

  function statusMessageForSearch(kind, query = "", details = {}) {
    const q = String(query || "").trim();
    const quoted = q ? `“${q}”` : "";
    if (kind === "empty") return "请输入要搜索的歌曲或歌手。";
    if (kind === "loading") return `正在搜索${quoted}...`;
    if (kind === "none") return `没有找到${quoted}的相关结果，已为你打开网易云搜索。`;
    if (kind === "ok") return `找到 ${details.count || 0} 首${quoted}，点击播放交给网易云。`;
    if (kind === "failed") return `搜索失败：${details.error || "未知错误"}，已尝试打开网易云搜索。`;
    if (kind === "fallback-client") return "已在网易云客户端中发起搜索。";
    if (kind === "fallback-web") return "已在浏览器中打开网易云搜索。";
    return "";
  }

  function statusMessageForPlayResult(result) {
    if (result && result.success) {
      const methodLabels = {
        scheme: "已在网易云客户端中打开歌曲。",
        spawn: "已通过网易云客户端打开歌曲。",
        "bare-exe": "已打开网易云客户端，请在客户端内确认歌曲。",
        web: "已在浏览器中打开网易云歌曲页。",
        direct: "已在浏览器中打开歌曲直链。",
      };
      return methodLabels[result.method] || "已交给网易云处理。";
    }
    return `播放失败：${(result && result.error) || "未知错误"}`;
  }

  function nextPlayUiState(result) {
    return result && result.success
      ? { state: "done", tone: "ok" }
      : { state: "error", tone: "error" };
  }

  function renderSongItem(song) {
    const title = escapeHtml(song.name || "未命名歌曲");
    const artist = escapeHtml((song.artists || []).join(" / ") || "未知艺人");
    const album = escapeHtml(song.album || "");
    const duration = escapeHtml(formatDuration(song.durationMs));
    const metaParts = [artist, album, duration].filter(Boolean);
    const songId = encodeURIComponent(String(song.id));
    return `<li class="music-search-result" data-song-id="${songId}" data-play-state="idle">
      <div class="music-search-result__main">
        <div class="music-search-result__title">${title}</div>
        <div class="music-search-result__meta">${metaParts.join(" · ")}</div>
      </div>
      <button type="button" class="music-search-result__play" data-song-id="${songId}">${buttonLabelForPlayState("idle")}</button>
    </li>`;
  }

  const api = {
    buttonLabelForPlayState,
    escapeHtml,
    formatDuration,
    nextPlayUiState,
    renderSongItem,
    statusMessageForPlayResult,
    statusMessageForSearch,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetMusicSearch = api;

  if (typeof document === "undefined") {
    return;
  }

  const form = document.querySelector("#music-search-form");
  const input = document.querySelector("#music-search-input");
  const button = document.querySelector("#music-search-button");
  const status = document.querySelector("#music-search-status");
  const results = document.querySelector("#music-search-results");
  const bridge = root.deskpet || {};

  let inFlight = false;
  let playInFlight = false;
  let lastQuery = "";

  function setStatus(message, tone) {
    if (!status) return;
    status.textContent = message || "";
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
  }

  function renderResults(songs) {
    if (!results) return;
    if (!Array.isArray(songs) || songs.length === 0) {
      results.innerHTML = "";
      return;
    }
    results.innerHTML = songs.map(renderSongItem).join("");
  }

  function setResultPlayState(row, state) {
    if (!row) return;
    row.dataset.playState = state;
    row.classList.toggle("is-playing", state === "playing");
    row.classList.toggle("is-done", state === "done");
    row.classList.toggle("is-error", state === "error");
    const playButton = row.querySelector(".music-search-result__play");
    if (playButton) {
      playButton.textContent = buttonLabelForPlayState(state);
      playButton.disabled = state === "playing";
    }
  }

  function resetSiblingPlayStates(activeRow) {
    if (!results) return;
    results.querySelectorAll(".music-search-result").forEach((row) => {
      if (row !== activeRow && row.dataset.playState === "playing") {
        setResultPlayState(row, "idle");
      }
    });
  }

  async function openSearchInNetEaseOrWeb(query) {
    if (typeof query !== "string" || !query.trim()) return;
    const trimmed = query.trim();
    const neteaseResult = typeof bridge.openSearchInNetEase === "function"
      ? await bridge.openSearchInNetEase(trimmed).catch(() => null)
      : null;
    if (neteaseResult && neteaseResult.success) {
      setStatus(
        neteaseResult.method === "web"
          ? statusMessageForSearch("fallback-web")
          : statusMessageForSearch("fallback-client"),
        "info",
      );
      return;
    }
    const webUrl = `https://music.163.com/#/search/m/?s=${encodeURIComponent(trimmed)}&type=1`;
    if (typeof bridge.openExternal === "function") {
      await bridge.openExternal(webUrl).catch(() => {});
      setStatus(statusMessageForSearch("fallback-web"), "info");
    }
  }

  async function runSearch() {
    if (inFlight || !input) return;
    const query = input.value.trim();
    if (!query) {
      lastQuery = "";
      renderResults([]);
      setStatus(statusMessageForSearch("empty"), "info");
      return;
    }
    inFlight = true;
    lastQuery = query;
    if (button) button.disabled = true;
    setStatus(statusMessageForSearch("loading", query), "info");
    renderResults([]);
    try {
      const result = typeof bridge.searchMusic === "function"
        ? await bridge.searchMusic(query)
        : { success: false, error: "bridge-unavailable" };
      if (lastQuery !== query) return;
      if (result && result.success) {
        const songs = Array.isArray(result.songs) ? result.songs : [];
        renderResults(songs);
        if (songs.length === 0) {
          setStatus(statusMessageForSearch("none", query), "empty");
          await openSearchInNetEaseOrWeb(query);
        } else {
          setStatus(statusMessageForSearch("ok", query, { count: songs.length }), "ok");
        }
      } else {
        const error = (result && result.error) ? result.error : "search-failed";
        setStatus(statusMessageForSearch("failed", query, { error }), "error");
        renderResults([]);
        await openSearchInNetEaseOrWeb(query);
      }
    } catch (error) {
      if (lastQuery !== query) return;
      const message = (error && error.message) || "未知错误";
      setStatus(statusMessageForSearch("failed", query, { error: message }), "error");
      renderResults([]);
      await openSearchInNetEaseOrWeb(query);
    } finally {
      inFlight = false;
      if (button) button.disabled = false;
    }
  }

  async function playSongFromResult(songId, row) {
    if (songId === undefined || songId === null || songId === "" || playInFlight) return;
    playInFlight = true;
    resetSiblingPlayStates(row);
    setResultPlayState(row, "playing");
    setStatus("正在唤起网易云...", "info");
    let result = null;
    try {
      result = typeof bridge.playSong === "function"
        ? await bridge.playSong(songId)
        : { success: false, error: "bridge-unavailable" };
      // If the main process failed to hand off the song to a native client,
      // attempt to fetch a direct audio URL and open it in the browser
      // as a fallback so the user still gets playback.
      if (!(result && result.success)) {
        try {
          const urlResult = typeof bridge.fetchSongUrl === "function"
            ? await bridge.fetchSongUrl(songId)
            : null;
          if (urlResult && urlResult.success && urlResult.url && typeof bridge.openExternal === "function") {
            await bridge.openExternal(urlResult.url).catch(() => {});
            result = { success: true, method: "direct", songId };
          }
        } catch (_err) {
          // ignore fallback errors and keep the original result
        }
      }
      if (!(result && result.success) && typeof bridge.fetchSongUrl === "function") {
        setStatus("正在尝试歌曲直链...", "info");
        const urlResult = await bridge.fetchSongUrl(songId).catch(() => null);
        if (urlResult && urlResult.success && urlResult.url && typeof bridge.openExternal === "function") {
          const opened = await bridge.openExternal(urlResult.url).catch(() => null);
          if (opened && opened.success) {
            result = { success: true, method: "direct", songId };
          }
        }
      }
    } catch (error) {
      result = { success: false, error: (error && error.message) || "play-failed" };
    } finally {
      const ui = nextPlayUiState(result);
      setResultPlayState(row, ui.state);
      setStatus(statusMessageForPlayResult(result), ui.tone);
      playInFlight = false;
    }
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      runSearch();
    });
  }
  if (button) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      runSearch();
    });
  }
  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch();
      }
    });
  }
  if (results) {
    results.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const playButton = target.closest(".music-search-result__play");
      const row = target.closest(".music-search-result");
      const songId = (playButton || row)?.getAttribute("data-song-id");
      if (!songId || !row) return;
      playSongFromResult(decodeURIComponent(songId), row);
    });
  }

  if (input) input.focus();
})(typeof window !== "undefined" ? window : globalThis);

