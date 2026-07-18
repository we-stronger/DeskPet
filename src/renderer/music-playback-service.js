(function attachMusicPlaybackService(root) {
  const mediaError = typeof require === "function"
    ? require("../music/media-error")
    : (root.DeskpetMediaError || {});
  const DIRECT_AUDIO_FAILURE_COOLDOWN_MS = 120000;
  const HISTORY_MAX = 50;
  let directAudioDisabledUntil = 0;
  let currentQueue = [];
  let currentQueueIndex = -1;
  let currentQueuePlaylistId = "";
  let shuffleQueueSignature = "";
  let shuffleOrder = [];
  let shuffleCursor = -1;
  let playMode = "sequence";
  let history = [];
  let stateBridge = null;
  let unsubscribeState = null;
  const stateListeners = new Set();
  let activePlayRequestId = 0;

  function cancelledResult(songId) {
    return {
      success: false,
      error: "cancelled",
      retryable: false,
      songId: String(songId),
    };
  }

  function notifyStateListeners() {
    const state = getPlaybackState();
    for (const listener of stateListeners) {
      try {
        listener(state);
      } catch (_error) {
        // A view subscriber must not break playback state updates.
      }
    }
  }

  function isCurrentPlayRequest(requestId) {
    return requestId === activePlayRequestId;
  }

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
    const normalized = {
      id: String(item.id),
      title: typeof item.title === "string" ? item.title : "",
      artist: typeof item.artist === "string" ? item.artist : "",
      playlistId: item.playlistId == null ? "" : String(item.playlistId),
      liked: item.liked === true,
    };
    if (typeof item.source === "string" && item.source.trim()) normalized.source = item.source.trim();
    if (typeof item.coverUrl === "string" && /^https?:\/\//i.test(item.coverUrl.trim())) normalized.coverUrl = item.coverUrl.trim();
    if (item.playable === false) normalized.playable = false;
    if (typeof item.error === "string" && item.error.trim()) normalized.error = item.error.trim();
    return normalized;
  }

  function normalizeMode(mode) {
    return mode === "shuffle" || mode === "heartbeat" || mode === "repeat-one" ? mode : "sequence";
  }

  function queueSignature(queue) {
    return (Array.isArray(queue) ? queue : []).map((item) => String(item.id)).join("|");
  }

  function resetShuffleOrder() {
    shuffleQueueSignature = "";
    shuffleOrder = [];
    shuffleCursor = -1;
  }

  function ensureShuffleOrder(deps = {}) {
    const signature = queueSignature(currentQueue);
    if (signature !== shuffleQueueSignature || shuffleOrder.length !== currentQueue.length) {
      const remaining = currentQueue.map((_item, index) => index).filter((index) => index !== currentQueueIndex);
      shuffleOrder = currentQueueIndex >= 0 ? [currentQueueIndex] : [];
      while (remaining.length) {
        const picked = randomIndex(remaining.length, deps);
        shuffleOrder.push(remaining.splice(picked, 1)[0]);
      }
      shuffleQueueSignature = signature;
      shuffleCursor = shuffleOrder.indexOf(currentQueueIndex);
    } else {
      const currentCursor = shuffleOrder.indexOf(currentQueueIndex);
      if (currentCursor >= 0) shuffleCursor = currentCursor;
    }
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
    if (item.source) cloned.source = item.source;
    if (item.playable === false) cloned.playable = false;
    if (item.error) cloned.error = item.error;
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
    const hydratedQueue = Array.isArray(source.queue)
      ? source.queue.map(normalizeQueueItem).filter(Boolean)
      : [];
    const hydratedSignature = queueSignature(hydratedQueue);
    if (hydratedSignature !== shuffleQueueSignature) resetShuffleOrder();
    currentQueue = hydratedQueue;
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
    notifyStateListeners();
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
      notifyStateListeners();
      return { success: true, state: getPlaybackState(), persisted: false };
    }
    stateBridge = bridge;
    const result = await bridge.updateMusicPlaybackState(getPlaybackState()).catch(() => null);
    if (result && result.success && result.state) hydratePlaybackState(result.state);
    else notifyStateListeners();
    return result || { success: false, error: "playback-state-save-failed" };
  }

  function onStateChange(listener) {
    if (typeof listener !== "function") return () => {};
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
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
    const nextSignature = queueSignature(normalized);
    if (nextSignature !== shuffleQueueSignature) resetShuffleOrder();
    currentQueue = normalized;
    const id = String(songId);
    const index = currentQueue.findIndex((item) => item.id === id);
    currentQueueIndex = index >= 0 ? index : 0;
    const current = currentQueue[currentQueueIndex];
    if (!currentQueuePlaylistId && current && current.playlistId) {
      currentQueuePlaylistId = current.playlistId;
    }
    if (playMode === "shuffle" && shuffleOrder.length) {
      const cursor = shuffleOrder.indexOf(currentQueueIndex);
      if (cursor >= 0) shuffleCursor = cursor;
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
      coverUrl: item.coverUrl || "",
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
      ensureShuffleOrder(deps);
      if (shuffleCursor < 0) return currentQueueIndex;
      shuffleCursor = (shuffleCursor + 1) % shuffleOrder.length;
      return shuffleOrder[shuffleCursor];
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

  async function playDirectAudioOnce(songId, deps, { requestId } = {}) {
    const bridge = deps && deps.bridge ? deps.bridge : {};
    const audioPlayer = deps && deps.audioPlayer;
    const setStatus = deps && deps.setStatus;

    if (typeof bridge.fetchSongUrl !== "function") {
      return mediaError.normalizeMediaError("fetch-url-unavailable", { songId });
    }
    if (typeof setStatus === "function") {
      setStatus("正在后台播放...", "info");
    }
    const urlResult = await bridge.fetchSongUrl(songId).catch((error) => ({ error }));
    if (!isCurrentPlayRequest(requestId)) return cancelledResult(songId);
    if (!(urlResult && urlResult.success && urlResult.url)) {
      return mediaError.normalizeMediaError(urlResult && (urlResult.error || urlResult), { songId });
    }
    const lyrics = await fetchLyrics(songId, bridge);
    if (!isCurrentPlayRequest(requestId)) return cancelledResult(songId);
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
      if (!isCurrentPlayRequest(requestId)) return cancelledResult(songId);
      if (hosted && hosted.success) {
        return { ...hosted, songId, method: hosted.method || "audio-host" };
      }
      return mediaError.normalizeMediaError(hosted && hosted.error || "audio-host-failed", { songId });
    }
    if (!audioPlayer || typeof audioPlayer.playUrl !== "function") {
      return mediaError.normalizeMediaError("audio-player-unavailable", { songId });
    }
    const audioResult = await audioPlayer.playUrl(urlResult.url, meta);
    if (!isCurrentPlayRequest(requestId)) return cancelledResult(songId);
    if (audioResult && audioResult.success) {
      return { ...audioResult, songId, method: "audio" };
    }
    const error = (audioResult && audioResult.error) || "audio-play-failed";
    return mediaError.normalizeMediaError(error, { songId });
  }

  function canRetryPlayback(result) {
    return result && !result.success
      && result.error !== "auth"
      && result.error !== "cancelled"
      && result.error !== "invalid-id";
  }

  async function playDirectAudio(songId, deps, options = {}) {
    let result = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      result = await playDirectAudioOnce(songId, deps, options);
      if (result && (result.success || result.error === "cancelled" || !canRetryPlayback(result))) {
        return result;
      }
      if (typeof deps?.setStatus === "function") {
        deps.setStatus("正在刷新音频地址…", "info");
      }
    }
    noteDirectAudioFailure(deps);
    return result || mediaError.normalizeMediaError("audio-unavailable", { songId });
  }

  function canSkipFailedSong(result) {
    return Boolean(result && !result.success && ["forbidden", "not-found", "network", "unsupported"].includes(result.error));
  }

  function markPermanentFailure(songId, result) {
    if (!result || result.success || !["forbidden", "not-found", "unsupported"].includes(result.error)) {
      return false;
    }
    const item = currentQueue.find((entry) => entry.id === String(songId));
    if (!item) return false;
    item.playable = false;
    item.error = result.error;
    return true;
  }

  async function playSongWithFallback(songId, deps = {}) {
    if (!isValidSongId(songId)) {
      return { success: false, error: "invalid-id" };
    }
    const requestId = ++activePlayRequestId;
    rememberQueue(deps.queue, songId, deps.mode, deps.playlistId);
    updateQueueIndex(songId);
    const result = await playDirectAudio(songId, deps, { requestId });
    if (result && result.success && isCurrentPlayRequest(requestId)) {
      recordHistory(songId, deps.meta, deps);
      await persistPlaybackState(deps.bridge);
    } else if (result && !result.success && isCurrentPlayRequest(requestId)
      && markPermanentFailure(songId, result)) {
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
      coverUrl: song.coverUrl || song.coverImgUrl || "",
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
    let nextIndex = historyIndex >= 0 ? historyIndex : adjacentIndex(offset, deps);
    let lastResult = null;
    for (let attempts = 0; attempts < currentQueue.length; attempts += 1) {
      const next = currentQueue[nextIndex];
      if (!next) return lastResult || { success: false, error: "no-queue" };
      currentQueueIndex = nextIndex;
      lastResult = await playSongWithFallback(next.id, {
        ...deps,
        queue: currentQueue,
        meta: queueMeta(next),
      });
      if (lastResult.success || offset < 0 || !canSkipFailedSong(lastResult)) return lastResult;
      nextIndex = adjacentIndex(1, deps);
    }
    return lastResult || { success: false, error: "no-queue" };
  }

  function playNext(deps = {}) {
    return playAdjacent(1, deps);
  }

  function playPrevious(deps = {}) {
    return playAdjacent(-1, deps);
  }

  function setPlaybackMode(mode, deps = {}) {
    playMode = normalizeMode(mode);
    notifyStateListeners();
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
    onStateChange,
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
