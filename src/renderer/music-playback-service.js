(function attachMusicPlaybackService(root) {
  const DIRECT_AUDIO_FAILURE_COOLDOWN_MS = 120000;
  const HISTORY_MAX = 50;
  let directAudioDisabledUntil = 0;
  let currentQueue = [];
  let currentQueueIndex = -1;
  let currentQueuePlaylistId = "";
  let playMode = "sequence";
  let history = [];
  let stateBridge = null;
  let unsubscribeState = null;

  function isValidSongId(songId) {
    if (typeof songId === "string") return songId.trim() !== "";
    return Number.isFinite(songId);
  }

  function nowMs(deps) {
    return deps && typeof deps.now === "function" ? deps.now() : Date.now();
  }

  function noteDirectAudioFailure(deps) {
    directAudioDisabledUntil = nowMs(deps) + DIRECT_AUDIO_FAILURE_COOLDOWN_MS;
  }

  function normalizeQueueItem(item) {
    if (!item || !isValidSongId(item.id)) return null;
    return {
      id: String(item.id),
      title: typeof item.title === "string" ? item.title : "",
      artist: typeof item.artist === "string" ? item.artist : "",
      playlistId: item.playlistId == null ? "" : String(item.playlistId),
      liked: item.liked === true,
    };
  }

  function normalizeMode(mode) {
    return mode === "shuffle" || mode === "heartbeat" || mode === "repeat-one" ? mode : "sequence";
  }

  function cloneQueueItem(item) {
    if (!item) return null;
    const cloned = {
      id: item.id,
      title: item.title || "",
      artist: item.artist || "",
      playlistId: item.playlistId || "",
      liked: item.liked === true,
    };
    if (item.playedAt) cloned.playedAt = item.playedAt;
    return cloned;
  }

  function recordHistory(songId, meta = {}, deps = {}) {
    const id = String(songId);
    const fromQueue = currentQueue.find((item) => item.id === id);
    const item = normalizeQueueItem({
      id,
      title: meta.title || (fromQueue && fromQueue.title) || "",
      artist: meta.artist || (fromQueue && fromQueue.artist) || "",
      playlistId: (fromQueue && fromQueue.playlistId) || "",
      liked: meta.liked === true || (fromQueue && fromQueue.liked === true),
    });
    if (!item) return;
    item.playedAt = new Date(nowMs(deps)).toISOString();
    history = [item, ...history.filter((entry) => entry.id !== item.id)].slice(0, HISTORY_MAX);
  }

  function hydratePlaybackState(state = {}) {
    const source = state && typeof state === "object" ? state : {};
    playMode = normalizeMode(source.mode);
    currentQueue = Array.isArray(source.queue)
      ? source.queue.map(normalizeQueueItem).filter(Boolean)
      : [];
    const requestedIndex = Number(source.currentIndex);
    currentQueueIndex = currentQueue.length
      ? Math.max(0, Math.min(
        currentQueue.length - 1,
        Number.isInteger(requestedIndex) ? requestedIndex : 0,
      ))
      : -1;
    const current = currentQueue[currentQueueIndex];
    currentQueuePlaylistId = current && current.playlistId ? current.playlistId : "";
    const seen = new Set();
    history = (Array.isArray(source.history) ? source.history : [])
      .map((entry) => {
        const item = normalizeQueueItem(entry);
        if (item && typeof entry.playedAt === "string") item.playedAt = entry.playedAt;
        return item;
      })
      .filter((item) => {
        if (!item || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .slice(0, HISTORY_MAX);
    return getPlaybackState();
  }

  async function syncPlaybackState(bridge = stateBridge) {
    if (!bridge || typeof bridge.getMusicPlaybackState !== "function") {
      return getPlaybackState();
    }
    stateBridge = bridge;
    const state = await bridge.getMusicPlaybackState().catch(() => null);
    return state ? hydratePlaybackState(state) : getPlaybackState();
  }

  async function persistPlaybackState(bridge = stateBridge) {
    if (!bridge || typeof bridge.updateMusicPlaybackState !== "function") {
      return { success: true, state: getPlaybackState(), persisted: false };
    }
    stateBridge = bridge;
    const result = await bridge.updateMusicPlaybackState(getPlaybackState()).catch(() => null);
    if (result && result.success && result.state) hydratePlaybackState(result.state);
    return result || { success: false, error: "playback-state-save-failed" };
  }

  function connectPlaybackState(bridge) {
    if (!bridge) return Promise.resolve(getPlaybackState());
    stateBridge = bridge;
    if (unsubscribeState) {
      unsubscribeState();
      unsubscribeState = null;
    }
    if (typeof bridge.onMusicPlaybackStateChanged === "function") {
      unsubscribeState = bridge.onMusicPlaybackStateChanged((state) => {
        hydratePlaybackState(state);
      });
    }
    return syncPlaybackState(bridge);
  }

  function rememberQueue(queue, songId, mode, playlistId) {
    if (mode) playMode = normalizeMode(mode);
    if (playlistId !== undefined && playlistId !== null && playlistId !== "") {
      currentQueuePlaylistId = String(playlistId);
    }
    if (!Array.isArray(queue)) return;
    const normalized = queue.map(normalizeQueueItem).filter(Boolean);
    if (!normalized.length) return;
    currentQueue = normalized;
    const id = String(songId);
    const index = currentQueue.findIndex((item) => item.id === id);
    currentQueueIndex = index >= 0 ? index : 0;
    const current = currentQueue[currentQueueIndex];
    if (!currentQueuePlaylistId && current && current.playlistId) {
      currentQueuePlaylistId = current.playlistId;
    }
  }

  function updateQueueIndex(songId) {
    if (!currentQueue.length) return;
    const index = currentQueue.findIndex((item) => item.id === String(songId));
    if (index >= 0) currentQueueIndex = index;
  }

  function queueMeta(item) {
    return {
      title: item.title || "",
      artist: item.artist || "",
      liked: item.liked === true,
    };
  }

  function randomIndex(length, deps) {
    const random = deps && typeof deps.random === "function" ? deps.random : Math.random;
    const value = Number(random());
    const normalized = Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0;
    return Math.floor(normalized * length);
  }

  function adjacentIndex(offset, deps = {}) {
    if (!currentQueue.length || currentQueueIndex < 0) return -1;
    if (playMode === "repeat-one" && offset > 0) {
      return currentQueueIndex;
    }
    if ((playMode === "shuffle" || playMode === "heartbeat") && offset > 0) {
      if (currentQueue.length === 1) return currentQueueIndex;
      const picked = randomIndex(currentQueue.length, deps);
      return picked === currentQueueIndex ? (picked + 1) % currentQueue.length : picked;
    }
    return (currentQueueIndex + offset + currentQueue.length) % currentQueue.length;
  }

  function previousHistoryIndex() {
    if (!currentQueue.length || history.length < 2) return -1;
    const previous = history[1];
    if (!previous || !isValidSongId(previous.id)) return -1;
    return currentQueue.findIndex((item) => item.id === String(previous.id));
  }

  function shouldUseAudioFallback(result) {
    return !(result && result.success) || result.method === "spawn" || result.method === "running-instance";
  }

  async function fetchLyrics(songId, bridge) {
    if (!bridge || typeof bridge.getSongLyric !== "function") {
      return { lyric: "", tlyric: "" };
    }
    const result = await bridge.getSongLyric(songId).catch(() => null);
    if (!(result && result.success)) return { lyric: "", tlyric: "" };
    return {
      lyric: typeof result.lyric === "string" ? result.lyric : "",
      tlyric: typeof result.tlyric === "string" ? result.tlyric : "",
    };
  }

  async function openOriginalSongFallback(songId, previousError, deps) {
    const bridge = deps && deps.bridge ? deps.bridge : {};
    const logger = deps && deps.logger;
    const setStatus = deps && deps.setStatus;

    if (typeof bridge.openMusicSong !== "function") {
      return { success: false, error: previousError || "open-song-unavailable", songId };
    }
    if (logger && typeof logger.warn === "function") {
      logger.warn("[music-playback] using browser fallback", JSON.stringify({
        songId: String(songId),
        previousError: previousError || null,
      }));
    }
    if (typeof setStatus === "function") {
      setStatus("正在使用浏览器保底打开网易云...", "info");
    }
    const opened = await bridge.openMusicSong(songId).catch(() => null);
    if (opened && opened.success) {
      return { ...opened, songId, fallback: "browser-open" };
    }
    return {
      success: false,
      error: (opened && opened.error) || previousError || "open-failed",
      songId,
    };
  }

  async function playDirectAudio(songId, deps, { openFallbackOnFailure = false } = {}) {
    const bridge = deps && deps.bridge ? deps.bridge : {};
    const audioPlayer = deps && deps.audioPlayer;
    const setStatus = deps && deps.setStatus;

    if (nowMs(deps) < directAudioDisabledUntil) {
      return { success: false, error: "direct-audio-disabled", songId };
    }
    if (typeof bridge.fetchSongUrl !== "function") {
      return openFallbackOnFailure
        ? openOriginalSongFallback(songId, "fetch-url-unavailable", deps)
        : { success: false, error: "fetch-url-unavailable", songId };
    }
    if (typeof setStatus === "function") {
      setStatus("正在后台播放...", "info");
    }
    const urlResult = await bridge.fetchSongUrl(songId).catch(() => null);
    if (!(urlResult && urlResult.success && urlResult.url)) {
      const error = (urlResult && urlResult.error) || "no-audio-url";
      return openFallbackOnFailure
        ? openOriginalSongFallback(songId, error, deps)
        : { success: false, error, songId };
    }
    const lyrics = await fetchLyrics(songId, bridge);
    const meta = {
      ...(deps && deps.meta && typeof deps.meta === "object" ? deps.meta : {}),
      ...lyrics,
      songId,
    };
    if (typeof bridge.playAudioUrlInPet === "function") {
      const hosted = await bridge.playAudioUrlInPet({
        ...meta,
        url: urlResult.url,
        songId,
      }).catch(() => null);
      if (hosted && hosted.success) {
        return { ...hosted, songId, method: hosted.method || "audio-host" };
      }
      noteDirectAudioFailure(deps);
      return openFallbackOnFailure
        ? openOriginalSongFallback(songId, (hosted && hosted.error) || "audio-host-failed", deps)
        : { success: false, error: (hosted && hosted.error) || "audio-host-failed", songId };
    }
    if (!audioPlayer || typeof audioPlayer.playUrl !== "function") {
      return openFallbackOnFailure
        ? openOriginalSongFallback(songId, "audio-player-unavailable", deps)
        : { success: false, error: "audio-player-unavailable", songId };
    }
    const audioResult = await audioPlayer.playUrl(urlResult.url, meta);
    if (audioResult && audioResult.success) {
      return { ...audioResult, songId, method: "audio" };
    }
    noteDirectAudioFailure(deps);
    const error = (audioResult && audioResult.error) || "audio-play-failed";
    return openFallbackOnFailure
      ? openOriginalSongFallback(songId, error, deps)
      : { success: false, error, songId };
  }

  async function playSongWithFallback(songId, deps = {}) {
    if (!isValidSongId(songId)) {
      return { success: false, error: "invalid-id" };
    }
    rememberQueue(deps.queue, songId, deps.mode, deps.playlistId);
    updateQueueIndex(songId);
    const result = await playDirectAudio(songId, deps, { openFallbackOnFailure: false });
    if (result && result.success) {
      recordHistory(songId, deps.meta, deps);
      await persistPlaybackState(deps.bridge);
    }
    return result;
  }

  function songToQueueItem(song, playlistId) {
    if (!song || !isValidSongId(song.id)) return null;
    const artist = Array.isArray(song.artists)
      ? song.artists.filter(Boolean).join(" / ")
      : (typeof song.artist === "string" ? song.artist : "");
    return normalizeQueueItem({
      id: song.id,
      title: song.name || song.title || "",
      artist,
      playlistId,
      liked: song.liked === true,
    });
  }

  async function playIntelligenceNext(deps = {}) {
    const bridge = deps && deps.bridge ? deps.bridge : {};
    const current = currentQueue[currentQueueIndex];
    const playlistId = deps.playlistId || currentQueuePlaylistId || (current && current.playlistId);
    if (!current || !playlistId || typeof bridge.getIntelligenceList !== "function") {
      return null;
    }
    const result = await bridge.getIntelligenceList({
      songId: current.id,
      playlistId,
      count: 20,
    }).catch(() => null);
    if (!(result && result.success && Array.isArray(result.songs) && result.songs.length)) {
      return null;
    }
    const next = songToQueueItem(result.songs[0], playlistId);
    if (!next) return null;
    currentQueue = [next, ...currentQueue.filter((item) => item.id !== next.id)];
    currentQueueIndex = 0;
    currentQueuePlaylistId = String(playlistId);
    return playSongWithFallback(next.id, {
      ...deps,
      queue: currentQueue,
      playlistId,
      meta: queueMeta(next),
    });
  }

  async function playAdjacent(offset, deps = {}) {
    await syncPlaybackState(deps.bridge);
    if (!currentQueue.length || currentQueueIndex < 0) {
      return { success: false, error: "no-queue" };
    }
    if (playMode === "heartbeat" && offset > 0) {
      const intelligenceResult = await playIntelligenceNext(deps);
      if (intelligenceResult) return intelligenceResult;
    }
    const historyIndex = offset < 0 && (playMode === "shuffle" || playMode === "heartbeat")
      ? previousHistoryIndex()
      : -1;
    const nextIndex = historyIndex >= 0 ? historyIndex : adjacentIndex(offset, deps);
    const next = currentQueue[nextIndex];
    if (!next) {
      return { success: false, error: "no-queue" };
    }
    currentQueueIndex = nextIndex;
    return playSongWithFallback(next.id, {
      ...deps,
      queue: currentQueue,
      meta: queueMeta(next),
    });
  }

  function playNext(deps = {}) {
    return playAdjacent(1, deps);
  }

  function playPrevious(deps = {}) {
    return playAdjacent(-1, deps);
  }

  function setPlaybackMode(mode, deps = {}) {
    playMode = normalizeMode(mode);
    persistPlaybackState(deps.bridge || stateBridge).catch(() => {});
    return { success: true, mode: playMode };
  }

  function cyclePlaybackMode(deps = {}) {
    const modes = ["sequence", "shuffle", "repeat-one", "heartbeat"];
    const current = modes.indexOf(playMode);
    const next = modes[(current + 1) % modes.length] || "sequence";
    return setPlaybackMode(next, deps);
  }

  function getPlaybackState() {
    return {
      mode: playMode,
      queue: currentQueue.map(cloneQueueItem),
      currentIndex: currentQueueIndex,
      current: cloneQueueItem(currentQueue[currentQueueIndex]),
      history: history.map(cloneQueueItem),
    };
  }

  function getPlaybackCapabilities() {
    const hasQueue = currentQueue.length > 0 && currentQueueIndex >= 0;
    return {
      hasQueue,
      canPlayPrevious: hasQueue,
      canPlayNext: hasQueue,
    };
  }

  async function removeHistoryItem(songId, bridge = stateBridge) {
    if (!bridge || typeof bridge.removeMusicHistoryItem !== "function") {
      return { success: false, error: "history-remove-unavailable" };
    }
    stateBridge = bridge;
    const result = await bridge.removeMusicHistoryItem(songId).catch(() => null);
    if (result && result.success && result.state) hydratePlaybackState(result.state);
    return result || { success: false, error: "history-remove-failed" };
  }

  async function clearHistory(bridge = stateBridge) {
    if (!bridge || typeof bridge.clearMusicHistory !== "function") {
      return { success: false, error: "history-clear-unavailable" };
    }
    stateBridge = bridge;
    const result = await bridge.clearMusicHistory().catch(() => null);
    if (result && result.success && result.state) hydratePlaybackState(result.state);
    return result || { success: false, error: "history-clear-failed" };
  }

  const api = {
    clearHistory,
    connectPlaybackState,
    hydratePlaybackState,
    playNext,
    playPrevious,
    playSongWithFallback,
    setPlaybackMode,
    cyclePlaybackMode,
    getPlaybackCapabilities,
    getPlaybackState,
    removeHistoryItem,
    syncPlaybackState,
    shouldUseAudioFallback,
  };

  if (root) {
    root.DeskpetMusicPlaybackService = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
