(function attachAudioPlayer(root) {
  if (!root) return;

  let currentAudio = null;
  let currentSource = "";
  let currentMeta = null;
  let currentLyrics = [];
  let currentLyric = null;
  let isPlaying = false;
  let hasEnded = false;
  const listeners = new Set();

  function parseTimestamp(raw) {
    const match = /^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/.exec(String(raw || "").trim());
    if (!match) return null;
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const fraction = match[3] ? Number(match[3].padEnd(3, "0").slice(0, 3)) / 1000 : 0;
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return minutes * 60 + seconds + fraction;
  }

  function parseLrc(text) {
    if (typeof text !== "string" || !text.trim()) return [];
    const lines = [];
    text.split(/\r?\n/).forEach((line) => {
      const timestamps = [...line.matchAll(/\[([0-9]{1,2}:[0-9]{2}(?:[.:][0-9]{1,3})?)\]/g)];
      if (!timestamps.length) return;
      const lyricText = line.replace(/\[[^\]]+\]/g, "").trim();
      timestamps.forEach((timestamp) => {
        const time = parseTimestamp(timestamp[1]);
        if (time !== null) lines.push({ time, text: lyricText });
      });
    });
    return lines.sort((a, b) => a.time - b.time);
  }

  function mergeLyrics(lyric, tlyric) {
    const primary = parseLrc(lyric);
    const translations = parseLrc(tlyric);
    return primary.map((line) => {
      const translated = translations.find((item) => Math.abs(item.time - line.time) < 0.35);
      return {
        ...line,
        translation: translated && translated.text ? translated.text : "",
      };
    });
  }

  function findCurrentLyric(time) {
    if (!currentLyrics.length || !Number.isFinite(time)) return null;
    let active = null;
    for (const line of currentLyrics) {
      if (line.time <= time + 0.01) active = line;
      else break;
    }
    return active;
  }

  function getState() {
    return {
      source: currentSource,
      playing: isPlaying,
      meta: currentMeta ? { ...currentMeta } : null,
      currentTime: currentAudio && Number.isFinite(currentAudio.currentTime) ? currentAudio.currentTime : 0,
      duration: currentAudio && Number.isFinite(currentAudio.duration) ? currentAudio.duration : 0,
      currentLyric: currentLyric ? { ...currentLyric } : null,
      ended: hasEnded,
    };
  }

  function emitState() {
    const state = getState();
    listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (_error) {
        // Listener failures should not interrupt playback.
      }
    });
  }

  function updateCurrentLyric() {
    const next = findCurrentLyric(currentAudio && Number.isFinite(currentAudio.currentTime)
      ? currentAudio.currentTime
      : 0);
    const changed = JSON.stringify(next || null) !== JSON.stringify(currentLyric || null);
    currentLyric = next;
    if (changed) emitState();
  }

  function stop() {
    if (currentAudio && typeof currentAudio.pause === "function") {
      currentAudio.pause();
    }
    currentAudio = null;
    currentSource = "";
    currentMeta = null;
    currentLyrics = [];
    currentLyric = null;
    isPlaying = false;
    hasEnded = false;
    emitState();
  }

  async function playUrl(url, meta = null) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return { success: false, error: "invalid-url" };
    }
    const AudioCtor = root.Audio;
    if (typeof AudioCtor !== "function") {
      return { success: false, error: "audio-unavailable" };
    }

    stop();
    const audio = new AudioCtor(url);
    audio.preload = "auto";
    currentAudio = audio;
    currentSource = url;
    currentMeta = meta && typeof meta === "object" ? { ...meta } : null;
    currentLyrics = mergeLyrics(currentMeta && currentMeta.lyric, currentMeta && currentMeta.tlyric);
    currentLyric = null;
    hasEnded = false;
    if (typeof audio.addEventListener === "function") {
      audio.addEventListener("timeupdate", updateCurrentLyric);
      audio.addEventListener("ended", () => {
        isPlaying = false;
        hasEnded = true;
        emitState();
      });
      audio.addEventListener("pause", () => {
        isPlaying = false;
        emitState();
      });
      audio.addEventListener("play", () => {
        isPlaying = true;
        hasEnded = false;
        emitState();
      });
    }
    try {
      await audio.play();
      isPlaying = true;
      updateCurrentLyric();
      emitState();
      return { success: true, method: "audio", target: url };
    } catch (error) {
      const logger = root.console || (typeof console !== "undefined" ? console : null);
      if (logger && typeof logger.warn === "function") {
        logger.warn("[audio-player] playUrl failed", (error && error.message) || "audio-play-failed");
      }
      stop();
      return { success: false, error: (error && error.message) || "audio-play-failed" };
    }
  }

  function getCurrentSource() {
    return currentSource;
  }

  async function togglePlayPause() {
    if (!currentAudio || !currentSource) {
      return { success: false, error: "no-current-source", playing: false };
    }
    if (isPlaying && typeof currentAudio.pause === "function") {
      currentAudio.pause();
      isPlaying = false;
      emitState();
      return { success: true, playing: false, method: "audio" };
    }
    if (typeof currentAudio.play !== "function") {
      return { success: false, error: "audio-unavailable", playing: false };
    }
    try {
      await currentAudio.play();
      isPlaying = true;
      emitState();
      return { success: true, playing: true, method: "audio" };
    } catch (error) {
      return { success: false, error: (error && error.message) || "audio-play-failed", playing: false };
    }
  }

  function onStateChange(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  root.DeskpetAudioPlayer = {
    playUrl,
    stop,
    getCurrentSource,
    getState,
    onStateChange,
    togglePlayPause,
  };
})(typeof window !== "undefined" ? window : globalThis);
