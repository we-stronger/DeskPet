(function bootDeskpet() {
  const { actions } = window.DeskpetActionConfig;

  const pet = document.querySelector("#pet");
  const moodBubble = document.querySelector("#mood-bubble");
  const stage = document.querySelector("#stage");
  const settingsPanel = document.querySelector("#settings-panel");
  const sizeInput = document.querySelector("#size-input");
  const speedInput = document.querySelector("#speed-input");
  const opacityInput = document.querySelector("#opacity-input");
  const autoBehaviorInput = document.querySelector("#auto-behavior-input");
  const autoWalkInput = document.querySelector("#auto-walk-input");
  const sizeOutput = document.querySelector("#size-output");
  const speedOutput = document.querySelector("#speed-output");
  const opacityOutput = document.querySelector("#opacity-output");
  const settingsClose = document.querySelector("#settings-close");
  const statusMood = document.querySelector("#status-mood");
  const statusEnergy = document.querySelector("#status-energy");
  const statusAffinity = document.querySelector("#status-affinity");
  const statusRelationship = document.querySelector("#status-relationship");
  const statusAction = document.querySelector("#status-action");
  const statusCombo = document.querySelector("#status-combo");
  const mouseReactInput = document.querySelector("#mouse-react-input");
  const dailyGreetingInput = document.querySelector("#daily-greeting-input");
  const focusStart = document.querySelector("#focus-start");
  const breakStart = document.querySelector("#break-start");
  const focusPause = document.querySelector("#focus-pause");
  const focusReset = document.querySelector("#focus-reset");
  const focusPhaseEl = document.querySelector("#focus-phase");
  const focusRemainingEl = document.querySelector("#focus-remaining");
  const statusStreak = document.querySelector("#status-streak");
  const focusIndicator = document.querySelector("#focus-indicator");
  const musicStatusBar = document.querySelector("#music-status-bar");
  const focusDurationInput = document.querySelector("#focus-duration-input");
  const breakDurationInput = document.querySelector("#break-duration-input");
  const taskNameInput = document.querySelector("#task-name-input");
  const focusRecordsEl = document.querySelector("#focus-records");
  const focusRecordsClear = document.querySelector("#focus-records-clear");
  const clockEl = document.querySelector("#clock");
  const clockEnabledInput = document.querySelector("#clock-enabled-input");
  const settings = window.DeskpetSettings;
  const moodBubbleApi = window.DeskpetMoodBubble;
  const pointerPolicy = window.DeskpetPointerActionPolicy;
  const visualStyle = window.DeskpetVisualStyle;
  const bridge = window.deskpet;
  const musicCommand = window.DeskpetMusicCommand;
  const holdVisualLock = window.DeskpetHoldVisualLock.createHoldVisualLock(pet);
  const focusTimer = new window.DeskpetFocusTimer.FocusTimer();
  const mouseReact = new window.DeskpetMouseReact.MouseReact();
  const clock = new window.DeskpetClock.Clock();
  let mouseReactEnabled = true;
  let dailyGreetingEnabled = true;
  let clockEnabled = true;
  let focusActive = false;
  let clockIntervalId = 0;
  const walkMovementRunner = new window.WalkMovementRunner({
    movement: new window.WalkMovement({ stepPx: 8, maxDistancePx: 192 }),
    moveBy: (dx, dy) => window.deskpet.moveBy(dx, dy),
    intervalMs: 120,
  });
  let sizePercent = 100;
  let speedPercent = 100;
  let opacityPercent = 100;
  let autoBehaviorEnabled = true;
  let autoWalkEnabled = true;
  let focusDurationMinutes = 25;
  let breakDurationMinutes = 5;
  let pendingTaskName = "";
  let focusRecords = [];
  let currentFocusTaskName = "";
  let currentFocusDurationMs = 0;
  // Top-left position of the clock widget, in CSS pixels relative to
  // #stage. null = let the auto-anchor place it. The renderer skips
  // the auto-anchor (which would otherwise track the empty margins of
  // the pet sprite) once the user has dragged the clock somewhere.
  let clockPosition = null;
  // True while the user is mid-drag on the clock. syncWidgetPositions
  // must NOT clobber the live drag position by re-applying the
  // pre-drag clockPosition (which is what caused the per-frame
  // flicker). The drag end handler clears the flag and writes the
  // final position to clockPosition.
  let isDraggingClock = false;
  let focusIndicatorPosition = null;
  let musicStatusPosition = null;
  let musicStatusPlaying = false;
  let musicLyricStyle = { color: "#243044", fontSize: 12, controlSize: 31 };
  let musicStatusState = { title: "网易云音乐", artist: "", status: "待命", lyric: "", translation: "" };
  let audioStatusUnsubscribe = null;
  const BASE_PET_VISUAL_SIZE = 512;
  const MUSIC_STATUS_WIDTH = 400;
  const MUSIC_STATUS_HEIGHT = 132;
  const MUSIC_STATUS_DRAG_EXTRA_BOTTOM = 0;
  // The CSS positions the clock with left + transform: translateX(-50%)
  // so the auto-anchor's center-anchored output lines up. clockPosition
  // stores the visual top-left (matching what the drag helper reports
  // via getBoundingClientRect, which is what the user actually sees),
  // so the applied CSS left has to add half the element's width to
  // compensate for the centering. Without this the clock visibly
  // shifts by half its width when the saved position is applied.
  function visualToCssLeft(visualX) {
    // Read the live width so the saved visual position lines up
    // with the CSS centering. Fall back to the layout hint from
    // widget-anchor (76px) when the clock hasn't been laid out yet
    // (e.g. the first applyClockPosition right after boot, before
    // innerHTML has been written).
    const measured = clockEl ? clockEl.getBoundingClientRect().width : 0;
    const w = measured > 0 ? measured : 76;
    return visualX + w / 2;
  }
  function clampClockPosition({ x, y }) {
    return clampStageWidgetPosition({ x, y }, clockEl, 76, 50);
  }
  function clampStageWidgetPosition({ x, y }, element, fallbackWidth, fallbackHeight, { extraBottom = 0 } = {}) {
    const rect = element ? element.getBoundingClientRect() : null;
    const width = rect && rect.width > 0 ? rect.width : fallbackWidth;
    const height = rect && rect.height > 0 ? rect.height : fallbackHeight;
    const stageWidth = stage ? (stage.clientWidth || 512) : 512;
    const stageHeight = stage ? (stage.clientHeight || 512) : 512;
    return {
      x: Math.max(0, Math.min(stageWidth - width, Math.round(x))),
      y: Math.max(0, Math.min(stageHeight - height + extraBottom, Math.round(y))),
    };
  }
  function clampMusicStatusPosition(position) {
    return clampStageWidgetPosition(
      position,
      musicStatusBar,
      MUSIC_STATUS_WIDTH,
      MUSIC_STATUS_HEIGHT,
      { extraBottom: MUSIC_STATUS_DRAG_EXTRA_BOTTOM },
    );
  }
  function normalizeMusicLyricStyle(style = {}) {
    const color = typeof style.color === "string" && /^#[0-9a-f]{6}$/i.test(style.color.trim())
      ? style.color.trim()
      : "#243044";
    const rawSize = Number(style.fontSize);
    const fontSize = Number.isFinite(rawSize) && rawSize >= 10 && rawSize <= 22
      ? Math.round(rawSize)
      : 12;
    const rawControlSize = Number(style.controlSize);
    const controlSize = Number.isFinite(rawControlSize) && rawControlSize >= 24 && rawControlSize <= 44
      ? Math.round(rawControlSize)
      : 31;
    return { color, fontSize, controlSize };
  }
  function applyMusicLyricStyle(style) {
    musicLyricStyle = normalizeMusicLyricStyle(style);
    setMusicStatus(musicStatusState, { playing: musicStatusPlaying });
  }
  function visibleScaleForStage() {
    const stageWidth = stage ? (stage.clientWidth || BASE_PET_VISUAL_SIZE) : BASE_PET_VISUAL_SIZE;
    const stageHeight = stage ? (stage.clientHeight || BASE_PET_VISUAL_SIZE) : BASE_PET_VISUAL_SIZE;
    const fit = Math.min(1, BASE_PET_VISUAL_SIZE / stageWidth, BASE_PET_VISUAL_SIZE / stageHeight);
    return settings.visibleScaleForAction(sizePercent, animation.action) * fit;
  }
  function applyClockPosition() {
    if (!clockEl || !clockPosition) return;
    clockEl.style.left = `${visualToCssLeft(clockPosition.x)}px`;
    clockEl.style.top = `${clockPosition.y}px`;
    clockEl.style.right = "auto";
  }
  function applyFocusIndicatorPosition() {
    if (!focusIndicator || !focusIndicatorPosition) return;
    focusIndicator.style.left = `${focusIndicatorPosition.x}px`;
    focusIndicator.style.top = `${focusIndicatorPosition.y}px`;
    focusIndicator.style.right = "auto";
    focusIndicator.style.bottom = "auto";
  }
  function clearFocusIndicatorPosition() {
    if (!focusIndicator) return;
    focusIndicator.style.left = "";
    focusIndicator.style.top = "";
    focusIndicator.style.right = "";
    focusIndicator.style.bottom = "";
  }
  function applyMusicStatusPosition() {
    if (!musicStatusBar || !musicStatusPosition) return;
    musicStatusBar.style.left = `${musicStatusPosition.x}px`;
    musicStatusBar.style.top = `${musicStatusPosition.y}px`;
    musicStatusBar.style.right = "auto";
    musicStatusBar.style.bottom = "auto";
  }
  function clearMusicStatusPosition() {
    if (!musicStatusBar) return;
    musicStatusBar.style.left = "";
    musicStatusBar.style.top = "";
    musicStatusBar.style.right = "";
    musicStatusBar.style.bottom = "";
  }
  const animation = new window.AnimationController({
    actions,
    assetRoot: "../../frames",
  });
  const drag = new window.DragController({ threshold: 6 });
  const petState = new window.PetStateController({
    sleepAfterMs: 5 * 60 * 1000,
    walkChance: 0.18,
    walkCooldownMs: 45 * 1000,
    energyDrainPerTick: 2,
    interactionEnergyCost: 4,
    wakeEnergy: 35,
  });

  // Pet sprite hit-region: the pet window is a fixed 512闂?12 transparent
  // rectangle, but only the opaque pixels of the current sprite should
  // block clicks (so apps underneath stay clickable on the empty
  // margins). We push the sprite's opaque bounding box to the main
  // process on every frame and let it call BrowserWindow.setShape().
  let lastShapeKey = null;
  let lastShapeFrameSrc = null;
  const actionShapeCache = new Map();
  const actionShapePending = new Map();
  function loadImageData(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          resolve({ data: data.data, width: data.width, height: data.height });
        } catch (_error) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  const hitTester = window.DeskpetPetHitTest.createHitTester({
    loader: loadImageData,
  });

  function framePathForAction(action, frame) {
    const frameName = String(frame).padStart(2, "0");
    return `${animation.assetRoot}/${action}/${action}_${frameName}.png`;
  }

  function primeActionShape(action) {
    if (!action || actionShapeCache.has(action) || actionShapePending.has(action)) return;
    const config = actions[action];
    if (!config || !Number.isFinite(config.frames) || config.frames <= 0) return;
    const paths = Array.from({ length: config.frames }, (_, index) => framePathForAction(action, index + 1));
    const pending = Promise.all(paths.map((src) => hitTester.load(src)))
      .then((frames) => {
        const validFrames = frames.filter((frame) => frame && frame.data && frame.width > 0);
        const boxes = validFrames.map((frame) => window.DeskpetPetHitTest.computeOpaqueBoundingBox(frame));
        const bbox = window.DeskpetPetShapeRects.unionBoundingBoxes(boxes);
        if (bbox && validFrames[0]) {
          actionShapeCache.set(action, {
            bbox,
            imageSize: {
              width: validFrames[0].width,
              height: validFrames[0].height || validFrames[0].width,
            },
          });
          if (animation.action === action) {
            requestAnimationFrame(refreshPetShape);
          }
        }
      })
      .finally(() => {
        actionShapePending.delete(action);
      });
    actionShapePending.set(action, pending);
  }

  function addVisibleUiShapeRect(rects, element) {
    if (!element || element.hidden) return;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;
    const elementRect = element.getBoundingClientRect();
    if (elementRect.width > 0 && elementRect.height > 0) {
      rects.push({
        x: elementRect.left,
        y: elementRect.top,
        width: elementRect.width,
        height: elementRect.height,
      });
    }
  }

  function visibleUiShapeRects() {
    const rects = [];
    addVisibleUiShapeRect(rects, settingsPanel);
    addVisibleUiShapeRect(rects, moodBubble);
    addVisibleUiShapeRect(rects, clockEl);
    addVisibleUiShapeRect(rects, focusIndicator);
    addVisibleUiShapeRect(rects, musicStatusBar);
    addVisibleUiShapeRect(rects, document.querySelector("#music-panel"));
    return rects;
  }

  function updatePetShape(imageData) {
    if (!bridge || typeof bridge.setPetShape !== "function") return;
    const rects = visibleUiShapeRects();
    if (imageData && pet) {
      const petRect = pet.getBoundingClientRect();
      const isMirrored = pet.classList.contains("is-facing-left");
      const actionShape = actionShapeCache.get(animation.action);
      if (actionShape) {
        rects.push(...window.DeskpetPetShapeRects.mapBoundingBoxToPetRect({
          bbox: actionShape.bbox,
          imageSize: actionShape.imageSize,
          petRect,
          mirrored: isMirrored,
        }));
      } else {
        rects.push(...window.DeskpetPetShapeRects.computePetShapeRects({
          imageData,
          petRect,
          mirrored: isMirrored,
        }));
      }
    }
    if (!rects.length) {
      // Transient miss (image data not ready) — keep last valid shape instead
      // of resetting to the full rectangular shape, which on Windows can
      // cause a brief OS-level re-composite flicker. Only fully reset if
      // there has never been a valid shape yet.
      if (!lastShapeKey) {
        bridge.setPetShape(null).catch(() => {});
      }
      return;
    }
    const key = rects
      .map((rect) => `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`)
      .join("|");
    if (key === lastShapeKey) return;
    lastShapeKey = key;
    bridge.setPetShape(rects).catch(() => {});
  }

  function refreshPetShape() {
    const src = animation.currentFramePath();
    // Track the frame this refresh was issued for so we can discard stale
    // results: renderFrame() advances the animation every ~100-200ms but
    // hitTester.load() is async, so a resolve can land after the next frame
    // has already started rendering. Applying the old shape to the new image
    // causes a visible mismatch (especially during walk frame transitions).
    lastShapeFrameSrc = src;
    hitTester.load(src).then((imageData) => {
      if (lastShapeFrameSrc !== src) return;
      syncWidgetPositions(imageData);
      updatePetShape(imageData);
    }).catch(() => {
      if (lastShapeFrameSrc !== src) return;
      updatePetShape(null);
    });
  }
  let frameTimer = 0;
  let blinkTimer = 0;
  let idleTimer = 0;
  let temporaryActionTimer = 0;
  let moodBubbleTimer = 0;

  function setOutput(output, value) {
    if (output) {
      output.value = `${Math.round(value)}%`;
      output.textContent = `${Math.round(value)}%`;
    }
  }

  function updateClockWidget() {
    if (!clockEl) return;
    if (!clockEnabled) {
      clockEl.hidden = true;
      clockEl.classList.remove("is-visible");
      refreshPetShape();
      return;
    }
    const now = new Date();
    clockEl.innerHTML = `<span class="clock-widget__date">${clock.formatDate(now)}</span><span class="clock-widget__time">${clock.formatTime(now)}</span>`;
    clockEl.hidden = false;
    clockEl.classList.add("is-visible");
    requestAnimationFrame(refreshPetShape);
  }

  function startClockInterval() {
    if (clockIntervalId) return;
    updateClockWidget();
    clockIntervalId = setInterval(updateClockWidget, 30 * 1000);
  }

  function setMusicStatus(status, { playing = musicStatusPlaying } = {}) {
    if (!musicStatusBar || !window.DeskpetMusicStatusView) return;
    musicStatusPlaying = playing;
    if (status && typeof status === "object") {
      musicStatusState = { ...musicStatusState, ...status };
    } else {
      musicStatusState = {
        ...musicStatusState,
        status: status || "",
        lyric: "",
        translation: "",
      };
    }
    musicStatusBar.innerHTML = window.DeskpetMusicStatusView.renderMusicStatusBar({
      ...musicStatusState,
      playing: musicStatusPlaying,
      lyricStyle: musicLyricStyle,
      playMode: window.DeskpetMusicPlaybackService?.getPlaybackState?.().mode || "sequence",
    });
    if (musicStatusPosition) applyMusicStatusPosition();
    requestAnimationFrame(refreshPetShape);
  }

  function setMusicPlaybackStatus(text) {
    setMusicStatus(text || "", { playing: musicStatusPlaying });
  }

  function audioStateStatus(state) {
    const meta = state && state.meta ? state.meta : {};
    const lyric = state && state.currentLyric;
    return {
      title: meta.title || "网易云音乐",
      artist: meta.artist || "",
      status: state && state.playing ? "正在播放" : "已暂停",
      lyric: lyric && lyric.text ? lyric.text : "",
      translation: lyric && lyric.translation ? lyric.translation : "",
    };
  }

  function ensureAudioStatusSubscription() {
    if (audioStatusUnsubscribe) return;
    const audioPlayer = window.DeskpetAudioPlayer;
    if (!audioPlayer || typeof audioPlayer.onStateChange !== "function") return;
    audioStatusUnsubscribe = audioPlayer.onStateChange(async (state) => {
      if (!state || !state.source) return;
      if (state.ended && window.DeskpetMusicPlaybackService) {
        const queueResult = await window.DeskpetMusicPlaybackService.playNext({
          bridge,
          audioPlayer: window.DeskpetAudioPlayer,
          setStatus: setMusicPlaybackStatus,
          logger: console,
        }).catch(() => null);
        if (queueResult && queueResult.success) {
          setMusicStatus("下一首", { playing: true });
          play("music");
          return;
        }
      }
      setMusicStatus(audioStateStatus(state), { playing: !!state.playing });
    });
  }

  async function runMusicStatusAction(action) {
    if (!bridge) return;
    if (action === "openPanel" || action === "account") {
      setMusicStatus("打开面板");
      if (window.DeskpetMusicPanel && typeof window.DeskpetMusicPanel.open === "function") {
        window.DeskpetMusicPanel.open("home");
        setMusicStatus(action === "account" ? "账号面板已打开" : "面板已打开");
        return;
      }
      const result = await bridge.openMusicWindow?.().catch(() => null);
      setMusicStatus(result && result.success ? "面板已打开" : "面板打开失败");
      return;
    }
    if (action === "openNetease") {
      setMusicStatus("打开网易云");
      const result = await bridge.openInNetEase?.("orpheus://").catch(() => null);
      setMusicStatus(result && result.success ? "网易云已打开" : "打开失败");
      return;
    }
    if (action === "cycleMode" && window.DeskpetMusicPlaybackService) {
      const result = typeof window.DeskpetMusicPlaybackService.cyclePlaybackMode === "function"
        ? window.DeskpetMusicPlaybackService.cyclePlaybackMode()
        : { success: false };
      const label = window.DeskpetMusicStatusView?.modeLabel?.(result && result.mode) || "顺序";
      setMusicStatus(`播放模式：${label}`, { playing: musicStatusPlaying });
      return;
    }
    const map = {
      playPause: "播放/暂停",
      previous: "上一首",
      next: "下一首",
    };
    if (!map[action]) return;
    if ((action === "previous" || action === "next") && window.DeskpetMusicPlaybackService) {
      const queueResult = action === "next"
        ? await window.DeskpetMusicPlaybackService.playNext({
          bridge,
          audioPlayer: window.DeskpetAudioPlayer,
          setStatus: setMusicPlaybackStatus,
          logger: console,
        }).catch(() => null)
        : await window.DeskpetMusicPlaybackService.playPrevious({
          bridge,
          audioPlayer: window.DeskpetAudioPlayer,
          setStatus: setMusicPlaybackStatus,
          logger: console,
        }).catch(() => null);
      if (queueResult && queueResult.success) {
        setMusicStatus(action === "next" ? "下一首" : "上一首", { playing: true });
        play("music");
        return;
      }
    }
    if (action === "playPause" && window.DeskpetAudioPlayer && typeof window.DeskpetAudioPlayer.togglePlayPause === "function") {
      const state = typeof window.DeskpetAudioPlayer.getState === "function"
        ? window.DeskpetAudioPlayer.getState()
        : null;
      if (state && state.source) {
        const toggled = await window.DeskpetAudioPlayer.togglePlayPause().catch(() => null);
        if (toggled && toggled.success) {
          setMusicStatus(toggled.playing ? "正在播放" : "已暂停", { playing: toggled.playing });
          return;
        }
      }
    }
    setMusicStatus(map[action], {
      playing: action === "playPause" ? !musicStatusPlaying : musicStatusPlaying,
    });
    const result = await bridge.controlMusic?.(action).catch(() => null);
    if (!result || !result.success) {
      setMusicStatus("控制失败", { playing: musicStatusPlaying });
    }
  }

  function clampFocusMinutes(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatRecordTime(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${m}/${d} ${hh}:${mm}`;
  }

  function pushFocusRecord({ task, focusDurationMs }) {
    focusRecords.push({
      task: task || "",
      focusDurationMs: focusDurationMs,
      completedAt: new Date().toISOString(),
    });
    if (focusRecords.length > 50) {
      focusRecords = focusRecords.slice(-50);
    }
  }

  function renderFocusRecords() {
    if (!focusRecordsEl) return;
    if (focusRecords.length === 0) {
      focusRecordsEl.innerHTML = '<li class="focus-records__empty">\u8fd8\u6ca1\u6709\u4e13\u6ce8\u8bb0\u5f55</li>';
      return;
    }
    const items = focusRecords.slice(-10).reverse().map((record) => {
      const task = escapeHtml(record.task || "\u672a\u547d\u540d\u4efb\u52a1");
      const minutes = Math.round(record.focusDurationMs / 60000);
      const time = formatRecordTime(record.completedAt);
      return `<li class="record">
        <span class="record-task">${task}</span>
        <span class="record-duration">${minutes} \u5206\u949f</span>
        <span class="record-time">${time}</span>
      </li>`;
    });
    focusRecordsEl.innerHTML = items.join("");
  }

  function saveFocusSettings() {
    queueSettingsUpdate({
      focusDurationMinutes,
      breakDurationMinutes,
      pendingTaskName,
      focusRecords,
    });
  }

  let pendingSettings = null;
  let settingsFlushTimer = 0;
  function queueSettingsUpdate(partial) {
    pendingSettings = { ...(pendingSettings || {}), ...partial };
    if (settingsFlushTimer) {
      clearTimeout(settingsFlushTimer);
    }
    settingsFlushTimer = setTimeout(flushPendingSettings, 250);
  }

  function flushPendingSettings() {
    settingsFlushTimer = 0;
    if (!pendingSettings) return;
    const payload = pendingSettings;
    pendingSettings = null;
    window.deskpet.updateSettings?.(payload);
  }

  function syncSettingsPanel() {
    if (sizeInput) {
      sizeInput.value = String(sizePercent);
    }
    if (speedInput) {
      speedInput.value = String(speedPercent);
    }
    if (opacityInput) {
      opacityInput.value = String(opacityPercent);
    }
    if (autoBehaviorInput) {
      autoBehaviorInput.checked = autoBehaviorEnabled;
    }
    if (autoWalkInput) {
      autoWalkInput.checked = autoWalkEnabled;
    }
    if (mouseReactInput) {
      mouseReactInput.checked = mouseReactEnabled;
    }
    if (dailyGreetingInput) {
      dailyGreetingInput.checked = dailyGreetingEnabled;
    }
    if (clockEnabledInput) {
      clockEnabledInput.checked = clockEnabled;
    }
    if (focusDurationInput) {
      focusDurationInput.value = String(focusDurationMinutes);
    }
    if (breakDurationInput) {
      breakDurationInput.value = String(breakDurationMinutes);
    }
    if (taskNameInput && document.activeElement !== taskNameInput) {
      taskNameInput.value = pendingTaskName;
    }
    setOutput(sizeOutput, sizePercent);
    setOutput(speedOutput, speedPercent);
    setOutput(opacityOutput, opacityPercent);
    renderFocusRecords();
    updateStatusPanel();
  }

  function setText(element, value) {
    if (element) {
      element.textContent = String(value);
    }
  }

  function updateStatusPanel() {
    const state = petState.snapshot();
    setText(statusMood, state.mood);
    setText(statusEnergy, state.energy);
    setText(statusAffinity, state.affinity);
    setText(statusRelationship, "\u4eb2\u5bc6");
    setText(statusAction, animation.action);
    setText(statusCombo, petState.combo());
    setText(statusStreak, state.dailyState.streakDays);
  }

  function showMoodBubble(action) {
    if (!moodBubble || !moodBubbleApi) {
      return;
    }

    const text = moodBubbleApi.bubbleTextForAction(action);
    if (!text) {
      return;
    }

    moodBubble.textContent = text;
    moodBubble.hidden = false;
    requestAnimationFrame(() => {
      moodBubble.classList.add("is-visible");
      refreshPetShape();
    });
    clearTimeout(moodBubbleTimer);
    moodBubbleTimer = setTimeout(() => {
      moodBubble.classList.remove("is-visible");
      moodBubbleTimer = setTimeout(() => {
        moodBubble.hidden = true;
        refreshPetShape();
      }, 250);
    }, 900);
  }

  function showCustomBubble(text, durationMs) {
    if (!moodBubble) return;
    moodBubble.textContent = text;
    moodBubble.hidden = false;
    requestAnimationFrame(() => {
      moodBubble.classList.add("is-visible");
      refreshPetShape();
    });
    clearTimeout(moodBubbleTimer);
    moodBubbleTimer = setTimeout(() => {
      moodBubble.classList.remove("is-visible");
      moodBubbleTimer = setTimeout(() => {
        moodBubble.hidden = true;
        refreshPetShape();
      }, 250);
    }, Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 1500);
  }

  function applyOpacity() {
    pet.style.opacity = String(Math.max(0.2, Math.min(1, opacityPercent / 100)));
  }

  function applyWalkFacing() {
    const facingLeft = animation.action === "walk" && walkMovementRunner.direction() < 0;
    pet.classList.toggle("is-facing-left", facingLeft);
    pet.style.transform = facingLeft ? "scaleX(-1)" : "none";
  }

  // Position the bubble + clock widgets inside the empty (transparent) margins
  // of the current sprite so they never overlap the character. The image is
  // scaled to fit the pet element with object-fit: contain; we map image
  // margins back to stage coordinates with the same scale + offset math used
  // for the clickable shape. When no in-image margin is large enough to host
  // a widget (e.g. the sleep pose has only a small top strip and the clock
  // would otherwise overlap the bbox that breathes frame-to-frame) the anchor
  // returns an outside-pet corner relative to the pet bounding rect.
  const WIDGET_LAYOUT = {
    bubble: { width: 110, height: 36 },
    clock:  { width: 76, height: 50 },
  };
  function syncWidgetPositions(imageData) {
    if (!pet || !stage) return;
    const petRect = pet.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    if (petRect.width <= 0 || petRect.height <= 0) return;

    const imgW = imageData ? imageData.width : 0;
    const imgH = imageData ? (imageData.height || imageData.width) : 0;
    const fitScale = imgW > 0 && imgH > 0
      ? Math.min(petRect.width / imgW, petRect.height / imgH)
      : 1;
    const offsetX = (petRect.width - imgW * fitScale) / 2;
    const offsetY = (petRect.height - imgH * fitScale) / 2;

    const widgetAnchorApi = window.DeskpetWidgetAnchor;
    let bubbleAnchor = null;
    let clockAnchor = null;
    if (widgetAnchorApi && imageData && imageData.data) {
      const bbox = window.DeskpetPetHitTest.computeOpaqueBoundingBox(imageData);
      const margins = window.DeskpetPetHitTest.computeEmptyMargins(imageData);
      bubbleAnchor = widgetAnchorApi.computeWidgetAnchor({
        role: "bubble",
        widgetSize: WIDGET_LAYOUT.bubble,
        imageData,
        margins,
        bbox,
        padding: 4,
      });
      clockAnchor = widgetAnchorApi.computeWidgetAnchor({
        role: "clock",
        widgetSize: WIDGET_LAYOUT.clock,
        imageData,
        margins,
        bbox,
        padding: 6,
        excludeSide: bubbleAnchor ? bubbleAnchor.side : null,
      });
    }

    // Fallbacks: when the image isn't ready, place widgets in the centre of
    // the pet rect (legacy behaviour). These are CSS-pixel positions, not
    // image-pixel anchor outputs.
    if (!bubbleAnchor) {
      bubbleAnchor = { side: "fallback-centre", x: petRect.width / 2, y: petRect.height * 0.20 };
    }
    if (!clockAnchor) {
      clockAnchor = { side: "fallback-centre", x: petRect.width / 2, y: petRect.height * 0.38 };
    }

    function place(el, anchor) {
      if (!el) return;
      let stageX;
      let stageY;
      if (anchor.side === "fallback-centre") {
        // CSS-pixel centre of pet rect. x is the centre (CSS handles translateX),
        // y is the relative top within the pet rect.
        stageX = petRect.left - stageRect.left + anchor.x;
        stageY = petRect.top - stageRect.top + anchor.y;
      } else if (String(anchor.side).startsWith("outside-")) {
        // Pet-relative outside corner: x is widget centre (CSS translates),
        // y is the widget's top-left in CSS pixels.
        stageX = petRect.left - stageRect.left + anchor.x;
        stageY = petRect.top - stageRect.top + anchor.y;
      } else {
        // Image-space anchor: x = widget centre in image px, y = widget top in image px.
        const imgX = anchor.x;
        const imgY = anchor.y;
        stageX = petRect.left - stageRect.left + offsetX + imgX * fitScale;
        stageY = petRect.top - stageRect.top + offsetY + imgY * fitScale;
      }
      el.style.left = `${stageX}px`;
      el.style.top = `${stageY}px`;
    }

    place(moodBubble, bubbleAnchor);
    if (isDraggingClock) {
      // Mid-drag: the drag handler owns clockEl.style. Don't touch
      // it — that was the source of the strobe between the drag
      // handler's per-move write and this re-application.
      return;
    }
    if (clockPosition) {
      // User dragged the clock — keep it pinned to the saved position
      // instead of letting the auto-anchor track the pet's bbox.
      applyClockPosition();
    } else {
      place(clockEl, clockAnchor);
    }
  }

  function renderFrame() {
    if (holdVisualLock.isLocked()) {
      return;
    }

    pet.src = animation.currentFramePath();
    primeActionShape(animation.action);
    pet.dataset.action = animation.action;
    visualStyle.applyPetVisualStyle(pet, {
      width: stage.clientWidth || 512,
      height: stage.clientHeight || 512,
    }, visibleScaleForStage());
    applyOpacity();
    applyWalkFacing();
    updateStatusPanel();
    syncWidgetPositions();
    // Load the frame's pixels to compute the opaque clickable region,
    // place floating widgets, then push the final visible shape to main.
    refreshPetShape();
  }

  function scheduleFrames() {
    clearInterval(frameTimer);
    if (holdVisualLock.isLocked()) {
      return;
    }

    if (animation.currentFps() <= 0) {
      return;
    }
    frameTimer = setInterval(() => {
      animation.advance();
      renderFrame();
    }, 1000 / animation.currentFps());
  }

  function play(action) {
    clearTimeout(temporaryActionTimer);
    stopWalkMovement();
    animation.start(action);
    renderFrame();
    scheduleFrames();
  }

  function playTemporary(action, durationMs) {
    play(action);
    if (action === "walk") {
      startWalkMovement();
    }
    temporaryActionTimer = setTimeout(() => {
      if (animation.action === action) {
        stopWalkMovement();
        play("idle");
      }
    }, durationMs);
  }

  function startWalkMovement() {
    walkMovementRunner.start();
  }

  function stopWalkMovement() {
    walkMovementRunner.stop();
  }

  function saveVisibleSettings() {
    queueSettingsUpdate({ sizePercent });
  }

  function saveSpeedSettings(speedPercent) {
    queueSettingsUpdate({ speedPercent });
  }

  function saveBehaviorSettings() {
    queueSettingsUpdate({
      opacityPercent,
      autoBehaviorEnabled,
      autoWalkEnabled,
      mouseReactEnabled,
      dailyGreetingEnabled,
      clockEnabled,
    });
  }

  function savePetState() {
    updateStatusPanel();
    queueSettingsUpdate({ petState: petState.snapshot() });
  }

  function restorePetStateFromCommand(command) {
    const encodedState = command.slice("pet-state:".length);
    try {
      petState.loadState(JSON.parse(decodeURIComponent(encodedState)));
      savePetState();
      if (petState.sleeping) {
        play("sleep");
      }
    } catch (_error) {
      savePetState();
    }
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    const delay = 3500 + Math.round(Math.random() * 4500);
    blinkTimer = setTimeout(() => {
      if (animation.requestBlink()) {
        renderFrame();
        scheduleFrames();
      }
      scheduleBlink();
    }, delay);
  }

  function scheduleIdleBehavior() {
    clearInterval(idleTimer);
    idleTimer = setInterval(() => {
      if (animation.action !== "idle" && animation.action !== "sleep") {
        return;
      }

      if (!autoBehaviorEnabled) {
        return;
      }

      const result = petState.tick();
      savePetState();
      if (result.action === "sleep" && animation.action !== "sleep") {
        showMoodBubble("sleep");
        play("sleep");
      } else if (result.action === "walk" && animation.action === "idle" && autoWalkEnabled) {
        playTemporary("walk", 3200);
      } else if ((result.action === "happy" || result.action === "pout") && animation.action === "idle") {
        showMoodBubble(result.action);
        playTemporary(result.action, 1800);
      }
    }, 15000);
  }

  function runCommand(command) {
    if (command.startsWith("chat-reply-bubble:")) {
      const encoded = command.slice("chat-reply-bubble:".length);
      try {
        const text = decodeURIComponent(encoded);
        if (text) showCustomBubble(text, 4500);
      } catch (_error) {
        // Bad encoding 闂?silently ignore.
      }
      return;
    }

    if (command.startsWith("music:play-audio-url:")) {
      const encoded = command.slice("music:play-audio-url:".length);
      try {
        const payload = JSON.parse(decodeURIComponent(encoded));
        const reportAudioHostResult = (result) => {
          if (!payload.requestId || typeof bridge.reportAudioHostResult !== "function") return;
          bridge.reportAudioHostResult({
            requestId: payload.requestId,
            songId: payload.songId || "",
            success: !!(result && result.success),
            error: result && result.error,
          }).catch(() => {});
        };
        if (payload && typeof payload.url === "string" && window.DeskpetAudioPlayer) {
          ensureAudioStatusSubscription();
          window.DeskpetAudioPlayer.playUrl(payload.url, {
            songId: payload.songId || "",
            title: payload.title || "",
            artist: payload.artist || "",
            lyric: payload.lyric || "",
            tlyric: payload.tlyric || "",
          }).then((result) => {
            if (result && result.success) {
              const title = payload.title || "网易云音乐";
              const artist = payload.artist ? ` · ${payload.artist}` : "";
              setMusicStatus(`${title}${artist}`, { playing: true });
              play("music");
              reportAudioHostResult({ success: true });
            } else {
              setMusicStatus("播放失败", { playing: false });
              reportAudioHostResult({
                success: false,
                error: (result && result.error) || "audio-host-failed",
              });
            }
          }).catch(() => {
            setMusicStatus("播放失败", { playing: false });
            reportAudioHostResult({ success: false, error: "audio-host-failed" });
          });
        } else {
          reportAudioHostResult({ success: false, error: "audio-host-failed" });
        }
      } catch (_error) {
        setMusicStatus("播放失败", { playing: false });
      }
      return;
    }

    if (command.startsWith("size:")) {
      sizePercent = settings.normalizePercent(command.slice("size:".length));
      renderFrame();
      syncSettingsPanel();
      saveVisibleSettings();
      return;
    }

    if (command.startsWith("speed:")) {
      speedPercent = settings.normalizePercent(command.slice("speed:".length));
      const multiplier = settings.speedPercentToMultiplier(speedPercent);
      animation.setSpeedMultiplier(multiplier);
      scheduleFrames();
      syncSettingsPanel();
      saveSpeedSettings(speedPercent);
      return;
    }

    if (command === "settings:open-records") {
      settingsPanel.hidden = false;
      syncSettingsPanel();
      requestAnimationFrame(() => {
        if (settingsPanel) {
          settingsPanel.scrollTop = settingsPanel.scrollHeight;
        }
        if (focusRecordsEl) {
          focusRecordsEl.scrollTop = focusRecordsEl.scrollHeight;
        }
        const section = document.querySelector(".focus-records-section");
        if (section) {
          section.scrollIntoView({ behavior: "smooth", block: "end" });
          section.classList.remove("is-highlighted");
          void section.offsetWidth;
          section.classList.add("is-highlighted");
        }
      });
      return;
    }

    if (command.startsWith("settings:")) {
      try {
        const loadedSettings = JSON.parse(decodeURIComponent(command.slice("settings:".length)));
        sizePercent = settings.normalizePercent(loadedSettings.sizePercent);
        speedPercent = settings.normalizePercent(loadedSettings.speedPercent);
        opacityPercent = Math.max(20, Math.min(100, Number(loadedSettings.opacityPercent) || 100));
        autoBehaviorEnabled = loadedSettings.autoBehaviorEnabled !== false;
        autoWalkEnabled = loadedSettings.autoWalkEnabled !== false;
        mouseReactEnabled = loadedSettings.mouseReactEnabled !== false;
        dailyGreetingEnabled = loadedSettings.dailyGreetingEnabled !== false;
        clockEnabled = loadedSettings.clockEnabled !== false;
        focusDurationMinutes = clampFocusMinutes(loadedSettings.focusDurationMinutes, 25, 1, 180);
        breakDurationMinutes = clampFocusMinutes(loadedSettings.breakDurationMinutes, 5, 1, 60);
        pendingTaskName = typeof loadedSettings.pendingTaskName === "string"
          ? loadedSettings.pendingTaskName.slice(0, 60)
          : "";
        focusRecords = Array.isArray(loadedSettings.focusRecords)
          ? loadedSettings.focusRecords
              .filter((r) => r && typeof r === "object" && Number.isFinite(r.focusDurationMs))
              .slice(-50)
          : [];
        // User-saved widget positions. null means "no saved position"
        // — let the auto-anchor place the clock and let the music
        // panel fall back to its default.
        clockPosition = (loadedSettings.clockPosition
          && Number.isFinite(loadedSettings.clockPosition.x)
          && Number.isFinite(loadedSettings.clockPosition.y))
          ? clampClockPosition(loadedSettings.clockPosition)
          : null;
        if (clockPosition) applyClockPosition();
        focusIndicatorPosition = (loadedSettings.focusIndicatorPosition
          && Number.isFinite(loadedSettings.focusIndicatorPosition.x)
          && Number.isFinite(loadedSettings.focusIndicatorPosition.y))
          ? clampStageWidgetPosition(loadedSettings.focusIndicatorPosition, focusIndicator, 126, 34)
          : null;
        if (focusIndicatorPosition) applyFocusIndicatorPosition();
        else clearFocusIndicatorPosition();
        musicStatusPosition = (loadedSettings.musicStatusPosition
          && Number.isFinite(loadedSettings.musicStatusPosition.x)
          && Number.isFinite(loadedSettings.musicStatusPosition.y))
          ? clampMusicStatusPosition(loadedSettings.musicStatusPosition)
          : null;
        if (musicStatusPosition) applyMusicStatusPosition();
        else clearMusicStatusPosition();
        applyMusicLyricStyle(loadedSettings.musicLyricStyle);
        if (window.DeskpetMusicPanel && typeof window.DeskpetMusicPanel.setPosition === "function") {
          window.DeskpetMusicPanel.setPosition(loadedSettings.musicPanelPosition || null);
        }
        animation.setSpeedMultiplier(settings.speedPercentToMultiplier(speedPercent));
        focusTimer.setDurations({
          focusDurationMs: focusDurationMinutes * 60 * 1000,
          breakDurationMs: breakDurationMinutes * 60 * 1000,
        });
        updateClockWidget();
        syncSettingsPanel();
        renderFrame();
      } catch (_error) {
        syncSettingsPanel();
      }
      return;
    }

    if (command === "settings") {
      settingsPanel.hidden = !settingsPanel.hidden;
      syncSettingsPanel();
      requestAnimationFrame(refreshPetShape);
      return;
    }

    if (command === "music:open-panel" || command.startsWith("music:open-panel:")) {
      try {
        const view = command.startsWith("music:open-panel:") ? command.slice("music:open-panel:".length) : "home";
        if (window.DeskpetMusicPanel && typeof window.DeskpetMusicPanel.open === "function") {
          window.DeskpetMusicPanel.open(view);
        }
      } catch (_e) {
        // ignore
      }
      return;
    }

    if (command === "music:login-completed") {
      // The web-login popup finished successfully; reload the panel so the
      // user sees the logged-in UI immediately.
      try {
        if (window.DeskpetMusicPanel && typeof window.DeskpetMusicPanel.open === "function") {
          window.DeskpetMusicPanel.open("home");
        }
      } catch (_e) {
        // ignore
      }
      return;
    }

    if (command === "music:login-failed") {
      try {
        if (window.DeskpetMusicPanel && typeof window.DeskpetMusicPanel.notifyLoginFailed === "function") {
          window.DeskpetMusicPanel.notifyLoginFailed();
        }
      } catch (_e) {
        // ignore
      }
      return;
    }

    if (command.startsWith("pet-state:")) {
      restorePetStateFromCommand(command);
      return;
    }

    if (command === "restore-defaults") {
      sizePercent = 100;
      speedPercent = 100;
      opacityPercent = 100;
      autoBehaviorEnabled = true;
      autoWalkEnabled = true;
      focusDurationMinutes = 25;
      breakDurationMinutes = 5;
      pendingTaskName = "";
      focusRecords = [];
      clockEnabled = true;
      animation.setSpeedMultiplier(1);
      petState.loadState({
        mood: 50,
        affinity: 0,
        energy: 100,
        sleeping: false,
      });
      play("idle");
      pendingSettings = {
        sizePercent: 100,
        speedPercent: 100,
        opacityPercent: 100,
        autoBehaviorEnabled: true,
        autoWalkEnabled: true,
        focusDurationMinutes: 25,
        breakDurationMinutes: 5,
        pendingTaskName: "",
        focusRecords: [],
        clockEnabled: true,
        petState: petState.snapshot(),
      };
      flushPendingSettings();
      syncSettingsPanel();
      return;
    }

    if (command === "idle") {
      stopWalkMovement();
      petState.wake();
      savePetState();
      play("idle");
      return;
    }

    if (command === "sleep") {
      stopWalkMovement();
      petState.forceSleep();
      savePetState();
      play("sleep");
      return;
    }

    if (command === "walk") {
      petState.wake();
      savePetState();
      playTemporary("walk", 3200);
      return;
    }

    if (command === "feed" || command === "pet") {
      const result = petState.interact(command);
      savePetState();
      showMoodBubble(command);
      play(result.action);
      return;
    }

    if (command === "happy" || command === "pout") {
      const result = petState.interact(command);
      savePetState();
      showMoodBubble(result.action);
      play(result.action);
      return;
    }

    if (command === "gift") {
      const r = petState.interact("gift");
      savePetState();
      showMoodBubble("gift");
      play(r.action);
      return;
    }

    if (command === "milktea") {
      const r = petState.interact("milktea", { hour: new Date().getHours() });
      savePetState();
      if (r.lateNight) {
        showCustomBubble("\u8fd9\u4e48\u665a\u559d\u4f1a\u7761\u4e0d\u7740\u5427\u3002");
      } else {
        showMoodBubble("gift");
      }
      play(r.action);
      return;
    }

    if (command === "music:listen") {
      // Persistent listening animation: intro 1-6, then alternate 3-5
      // forever (see action-config.js music.loopFrames). Stays until
      // another action takes over, mirroring how `rest` works.
      play("music");
      return;
    }

    if (command === "rest") {
      if (petState.sleeping) {
        return;
      }
      petState.interact("rest");
      savePetState();
      showCustomBubble("\u90a3\u6211\u4f11\u606f\u4e00\u4e0b\u3002");
      play("sleep");
      return;
    }

    if (command === "wake") {
      if (!petState.sleeping) {
        return;
      }
      const r = petState.interact("wake");
      savePetState();
      if (r.bubble === "wake-sleepy") {
        showCustomBubble("\u8fd8\u60f3\u518d\u7761\u4e00\u4f1a\u513f\u3002");
        play("sleep");
      } else {
        showCustomBubble("\u55ef\u2026\u2026\u9192\u5566\u3002");
        play("idle");
      }
      return;
    }

    if (command === "focus:start") {
      const durationMs = focusDurationMinutes * 60 * 1000;
      currentFocusTaskName = (taskNameInput && taskNameInput.value) ? taskNameInput.value : pendingTaskName;
      currentFocusDurationMs = durationMs;
      focusActive = true;
      walkMovementRunner.setReduced(true);
      focusTimer.startFocus(durationMs);
      showMoodBubble("focus");
      updateFocusPanel();
      return;
    }

    if (command === "break:start") {
      const durationMs = breakDurationMinutes * 60 * 1000;
      focusActive = false;
      walkMovementRunner.setReduced(false);
      focusTimer.startBreak(durationMs);
      showCustomBubble("\u4f11\u606f\u4e00\u4e0b\u3002");
      updateFocusPanel();
      return;
    }

    if (command === "focus:toggle-pause") {
      const phase = focusTimer.phase;
      if (phase === "focus" || phase === "break") {
        focusTimer.pause();
        showCustomBubble(phase === "focus" ? "\u6682\u505c\u4e00\u4e0b\u3002" : "\u4f11\u606f\u6682\u505c\u3002");
      } else if (phase === "paused-focus" || phase === "paused-break") {
        focusTimer.resume();
        showCustomBubble("\u7ee7\u7eed\u3002");
      }
      updateFocusPanel();
      return;
    }

    if (command === "focus:reset") {
      focusActive = false;
      walkMovementRunner.setReduced(false);
      focusTimer.reset();
      showCustomBubble("\u5df2\u91cd\u7f6e\u3002");
      updateFocusPanel();
      return;
    }

    if (command === "focus:end") {
      const phase = focusTimer.phase;
      if (phase === "focus" || phase === "paused-focus") {
        const total = currentFocusDurationMs > 0
          ? currentFocusDurationMs
          : focusDurationMinutes * 60 * 1000;
        const elapsed = Math.max(0, total - focusTimer.remainingMs);
        if (elapsed >= 60 * 1000) {
          pushFocusRecord({
            task: currentFocusTaskName,
            focusDurationMs: elapsed,
          });
          saveFocusSettings();
          renderFocusRecords();
          showCustomBubble(`\u5df2\u8bb0\u5f55 ${Math.round(elapsed / 60000)} \u5206\u949f\u3002`);
        } else {
          showCustomBubble("\u65f6\u95f4\u592a\u77ed\uff0c\u4e0d\u8bb0\u5f55\u3002");
        }
      } else if (phase === "break" || phase === "paused-break") {
        showCustomBubble("\u5df2\u7ed3\u675f\u4f11\u606f\u3002");
      } else {
        return;
      }
      focusActive = false;
      walkMovementRunner.setReduced(false);
      currentFocusTaskName = "";
      currentFocusDurationMs = 0;
      focusTimer.reset();
      updateFocusPanel();
      return;
    }

    if (command === "task:clear") {
      pendingTaskName = "";
      if (taskNameInput) taskNameInput.value = "";
      saveFocusSettings();
      showCustomBubble("\u5df2\u6e05\u7a7a\u4efb\u52a1\u3002");
      return;
    }

    if (command.startsWith("task:set:")) {
      const encoded = command.slice("task:set:".length);
      let name = "";
      try {
        name = decodeURIComponent(encoded).slice(0, 60);
      } catch (_error) {
        name = encoded.slice(0, 60);
      }
      pendingTaskName = name.trim();
      if (taskNameInput) taskNameInput.value = pendingTaskName;
      saveFocusSettings();
      showCustomBubble(pendingTaskName ? `\u4efb\u52a1\uff1a${pendingTaskName}` : "\u5df2\u6e05\u7a7a\u4efb\u52a1\u3002");
      return;
    }

    if (command.startsWith("music:feedback:")) {
      const messages = {
        "music:feedback:play-pause": "\u97f3\u4e50\u5207\u4e00\u4e0b\u3002",
        "music:feedback:next": "\u6362\u4e00\u9996\u3002",
        "music:feedback:previous": "\u56de\u5230\u4e0a\u4e00\u9996\u3002",
        "music:feedback:open-success": "\u6253\u5f00\u7f51\u6613\u4e91\u97f3\u4e50\u3002",
        "music:feedback:open-failed": "\u6ca1\u6709\u627e\u5230\u7f51\u6613\u4e91\u97f3\u4e50\u3002",
        "music:feedback:login-success": "\u767b\u5f55\u6210\u529f\u3002",
        "music:feedback:qr-expired": "\u4e8c\u7ef4\u7801\u8fc7\u671f\u4e86\uff0c\u6362\u4e00\u4e2a\u5427\u3002",
        "music:feedback:open-song": "\u5e2e\u4f60\u6253\u5f00\u8fd9\u9996\u6b4c\u3002",
        "music:feedback:error": "\u597d\u50cf\u6ca1\u8fde\u4e0a\u3002",
        "music:feedback:failed": "\u63a7\u5236\u5931\u8d25\uff0c\u770b\u770b\u522b\u7684\u64ad\u653e\u5668\u3002",
      };
      const text = messages[command] || "\u97f3\u4e50\u63a7\u5236\u51fa\u9519\u4e86\u3002";
      showCustomBubble(text);
      const visual = musicCommand?.musicVisualActionForFeedbackCommand?.(command);
      if (visual) {
        playTemporary(visual.action, visual.durationMs);
      }
      return;
    }
  }

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    drag.pointerDown(event);
    holdVisualLock.lock();
    clearInterval(frameTimer);
    clearTimeout(blinkTimer);
    clearInterval(idleTimer);
  });

  stage.addEventListener("pointermove", (event) => {
    const result = drag.pointerMove(event);

    if (result.type === "drag-start") {
      petState.wake();
      savePetState();
      holdVisualLock.unlock();
      if (pointerPolicy.visualActionForPointerResult(result) === "drag") {
        clearTimeout(blinkTimer);
        clearInterval(idleTimer);
        play("drag");
      }
      window.deskpet.moveBy(result.dx, result.dy);
      return;
    }

    if (result.type === "drag-move") {
      window.deskpet.moveBy(result.dx, result.dy);
    }

    if (mouseReactEnabled) {
      const r = mouseReact.notifyPointerInside({ mood: petState.snapshot().mood });
      if (r) {
        if (r.kind === "react") {
          showCustomBubble(r.text);
        } else if (r.kind === "escalate") {
          if (r.tone === "happy") showMoodBubble("happy");
          else if (r.tone === "pout") showMoodBubble("pout");
        }
      }
    }
  });

  stage.addEventListener("pointerup", (event) => {
    if (stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }

    const result = drag.pointerUp();
    holdVisualLock.unlock();
    const releaseAction = pointerPolicy.visualActionForPointerResult(result);
    if (releaseAction === "tap") {
      const feedback = petState.interact("tap");
      savePetState();
      showMoodBubble(feedback.action);
      play(feedback.action);
    } else if (releaseAction === "idle") {
      petState.wake();
      savePetState();
      play("idle");
    }

    scheduleBlink();
    scheduleIdleBehavior();
  });

  stage.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    window.deskpet.showMenu();
  });

  settingsPanel?.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  settingsPanel?.addEventListener("contextmenu", (event) => {
    event.stopPropagation();
  });
  musicStatusBar?.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  musicStatusBar?.addEventListener("contextmenu", (event) => {
    event.stopPropagation();
  });
  musicStatusBar?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-music-action]");
    if (!button || !musicStatusBar.contains(button)) return;
    event.preventDefault();
    runMusicStatusAction(button.getAttribute("data-music-action"));
  });

  sizeInput?.addEventListener("input", () => runCommand(`size:${sizeInput.value}`));
  speedInput?.addEventListener("input", () => runCommand(`speed:${speedInput.value}`));
  opacityInput?.addEventListener("input", () => {
    opacityPercent = Math.max(20, Math.min(100, Number(opacityInput.value) || 100));
    setOutput(opacityOutput, opacityPercent);
    applyOpacity();
    saveBehaviorSettings();
  });
  autoBehaviorInput?.addEventListener("change", () => {
    autoBehaviorEnabled = autoBehaviorInput.checked;
    saveBehaviorSettings();
  });
  autoWalkInput?.addEventListener("change", () => {
    autoWalkEnabled = autoWalkInput.checked;
    saveBehaviorSettings();
  });
  settingsClose?.addEventListener("click", () => {
    settingsPanel.hidden = true;
    refreshPetShape();
  });

  mouseReactInput?.addEventListener("change", () => {
    mouseReactEnabled = mouseReactInput.checked;
    saveBehaviorSettings();
  });

  dailyGreetingInput?.addEventListener("change", () => {
    dailyGreetingEnabled = dailyGreetingInput.checked;
    saveBehaviorSettings();
  });

  focusDurationInput?.addEventListener("change", () => {
    focusDurationMinutes = clampFocusMinutes(focusDurationInput.value, 25, 1, 180);
    focusDurationInput.value = String(focusDurationMinutes);
    focusTimer.setDurations({ focusDurationMs: focusDurationMinutes * 60 * 1000 });
    saveFocusSettings();
    if (focusTimer.phase === "idle") {
      updateFocusPanel();
    }
  });

  breakDurationInput?.addEventListener("change", () => {
    breakDurationMinutes = clampFocusMinutes(breakDurationInput.value, 5, 1, 60);
    breakDurationInput.value = String(breakDurationMinutes);
    focusTimer.setDurations({ breakDurationMs: breakDurationMinutes * 60 * 1000 });
    saveFocusSettings();
  });

  taskNameInput?.addEventListener("input", () => {
    pendingTaskName = taskNameInput.value.slice(0, 60);
    saveFocusSettings();
  });

  focusRecordsClear?.addEventListener("click", () => {
    focusRecords = [];
    saveFocusSettings();
    renderFocusRecords();
  });

  clockEnabledInput?.addEventListener("change", () => {
    clockEnabled = clockEnabledInput.checked;
    updateClockWidget();
    saveBehaviorSettings();
  });

  window.addEventListener("beforeunload", () => {
    flushPendingSettings();
  });

  focusStart?.addEventListener("click", () => {
    const durationMs = focusDurationMinutes * 60 * 1000;
    currentFocusTaskName = taskNameInput ? taskNameInput.value : pendingTaskName;
    currentFocusDurationMs = durationMs;
    focusActive = true;
    walkMovementRunner.setReduced(true);
    focusTimer.startFocus(durationMs);
    showMoodBubble("focus");
    updateFocusPanel();
  });

  breakStart?.addEventListener("click", () => {
    const durationMs = breakDurationMinutes * 60 * 1000;
    focusActive = false;
    walkMovementRunner.setReduced(false);
    focusTimer.startBreak(durationMs);
    showCustomBubble("\u4f11\u606f\u4e00\u4e0b\u3002");
    updateFocusPanel();
  });

  focusPause?.addEventListener("click", () => {
    const phase = focusTimer.phase;
    if (phase === "focus" || phase === "break") {
      focusTimer.pause();
    } else if (phase === "paused-focus" || phase === "paused-break") {
      focusTimer.resume();
    }
    updateFocusPanel();
  });

  focusReset?.addEventListener("click", () => {
    focusActive = false;
    walkMovementRunner.setReduced(false);
    focusTimer.reset();
    updateFocusPanel();
  });

  focusTimer.onFocusEnd(() => {
    focusActive = false;
    walkMovementRunner.setReduced(false);
    pushFocusRecord({
      task: currentFocusTaskName,
      focusDurationMs: currentFocusDurationMs,
    });
    currentFocusTaskName = "";
    currentFocusDurationMs = 0;
    saveFocusSettings();
    renderFocusRecords();
    showMoodBubble("happy");
    play("happy");
    updateFocusPanel();
  });

  focusTimer.onBreakEnd(() => {
    showMoodBubble("tap");
    play("tap");
    updateFocusPanel();
  });

  function updateFocusPanel() {
    if (!focusPhaseEl || !focusRemainingEl) return;
    const labels = {
      idle: "\u7a7a\u95f2",
      focus: "\u4e13\u6ce8\u4e2d",
      break: "\u4f11\u606f\u4e2d",
      "paused-focus": "\u5df2\u6682\u505c(\u4e13\u6ce8)",
      "paused-break": "\u5df2\u6682\u505c(\u4f11\u606f)",
    };
    focusPhaseEl.textContent = labels[focusTimer.phase] || focusTimer.phase;
    const total = Math.max(0, Math.ceil(focusTimer.remainingMs / 1000));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    focusRemainingEl.textContent = `${mm}:${ss}`;
    if (focusStart) focusStart.classList.toggle("is-active", focusTimer.phase === "focus" || focusTimer.phase === "paused-focus");
    if (breakStart) breakStart.classList.toggle("is-active", focusTimer.phase === "break" || focusTimer.phase === "paused-break");
    if (focusPause) focusPause.classList.toggle("is-active", focusTimer.phase === "paused-focus" || focusTimer.phase === "paused-break");
    updateFocusIndicator();
  }

  function updateFocusIndicator() {
    if (!focusIndicator) return;
    const phase = focusTimer.phase;
    if (phase === "idle") {
      focusIndicator.hidden = true;
      focusIndicator.className = "focus-indicator";
      focusIndicator.innerHTML = "";
      refreshPetShape();
      return;
    }
    const total = Math.max(0, Math.ceil(focusTimer.remainingMs / 1000));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    const isFocus = phase === "focus" || phase === "paused-focus";
    const isBreak = phase === "break" || phase === "paused-break";
    const isPaused = phase === "paused-focus" || phase === "paused-break";
    const icon = isFocus ? "T" : "B";
    const label = isFocus ? "\u4e13\u6ce8" : "\u4f11\u606f";
    focusIndicator.className = `focus-indicator${isFocus ? " is-focus" : ""}${isBreak ? " is-break" : ""}${isPaused ? " is-paused" : ""}`;
    focusIndicator.innerHTML = `<span class="focus-indicator__icon">${icon}</span><span class="focus-indicator__label">${label}${isPaused ? "(\u5df2\u6682\u505c)" : ""}</span><span class="focus-indicator__time">${mm}:${ss}</span>`;
    focusIndicator.hidden = false;
    if (focusIndicatorPosition) applyFocusIndicatorPosition();
    requestAnimationFrame(refreshPetShape);
  }

  window.addEventListener("deskpet:shape-changed", () => {
    requestAnimationFrame(refreshPetShape);
  });

  setInterval(() => {
    focusTimer.tick();
    updateFocusPanel();
  }, 1000);

  window.deskpet.onCommand(runCommand);

  // Make the clock draggable. The user can grab it to pin it
  // somewhere it doesn't overlap the pet's body; the saved position
  // is persisted via bridge.updateSettings and reapplied on the next
  // launch through the settings: command.
  if (clockEl && window.DeskpetWidgetDrag && typeof window.DeskpetWidgetDrag.attachWidgetDrag === "function") {
    window.DeskpetWidgetDrag.attachWidgetDrag(clockEl, {
      threshold: 4,
      onStart: () => {
        isDraggingClock = true;
        clockEl.classList.add("is-dragging");
      },
      onMove: ({ x, y }) => {
        // x, y here are the *visual* top-left (drag helper reads
        // getBoundingClientRect). Convert to CSS left by adding
        // half the clock's width so the CSS translateX(-50%)
        // centering lines up with the user's drag.
        const clamped = clampClockPosition({ x, y });
        clockEl.style.left = `${visualToCssLeft(clamped.x)}px`;
        clockEl.style.top = `${clamped.y}px`;
        clockEl.style.right = "auto";
      },
      onEnd: ({ x, y }) => {
        clockEl.classList.remove("is-dragging");
        const clamped = clampClockPosition({ x, y });
        // Update clockPosition BEFORE clearing the drag flag so the
        // next syncWidgetPositions (which fires on the next animation
        // frame) sees the new value and pins the clock there.
        clockPosition = clamped;
        isDraggingClock = false;
        if (typeof bridge.updateSettings === "function") {
          bridge.updateSettings({ clockPosition: clamped }).catch(() => {});
        }
        refreshPetShape();
      },
    });
  }

  if (focusIndicator && window.DeskpetWidgetDrag && typeof window.DeskpetWidgetDrag.attachWidgetDrag === "function") {
    window.DeskpetWidgetDrag.attachWidgetDrag(focusIndicator, {
      threshold: 4,
      onMove: ({ x, y }) => {
        const clamped = clampStageWidgetPosition({ x, y }, focusIndicator, 126, 34);
        focusIndicator.style.left = `${clamped.x}px`;
        focusIndicator.style.top = `${clamped.y}px`;
        focusIndicator.style.right = "auto";
        focusIndicator.style.bottom = "auto";
      },
      onEnd: ({ x, y }) => {
        const clamped = clampStageWidgetPosition({ x, y }, focusIndicator, 126, 34);
        focusIndicatorPosition = clamped;
        if (typeof bridge.updateSettings === "function") {
          bridge.updateSettings({ focusIndicatorPosition: clamped }).catch(() => {});
        }
        refreshPetShape();
      },
    });
  }

  if (musicStatusBar && window.DeskpetWidgetDrag && typeof window.DeskpetWidgetDrag.attachWidgetDrag === "function") {
    window.DeskpetWidgetDrag.attachWidgetDrag(musicStatusBar, {
      threshold: 4,
      onMove: ({ x, y }) => {
        const clamped = clampMusicStatusPosition({ x, y });
        musicStatusBar.style.left = `${clamped.x}px`;
        musicStatusBar.style.top = `${clamped.y}px`;
        musicStatusBar.style.right = "auto";
        musicStatusBar.style.bottom = "auto";
      },
      onEnd: ({ x, y }) => {
        const clamped = clampMusicStatusPosition({ x, y });
        musicStatusPosition = clamped;
        if (typeof bridge.updateSettings === "function") {
          bridge.updateSettings({ musicStatusPosition: clamped }).catch(() => {});
        }
        refreshPetShape();
      },
    });
  }

  syncSettingsPanel();
  setMusicStatus("待命");
  renderFrame();
  scheduleFrames();
  scheduleBlink();
  scheduleIdleBehavior();
  startClockInterval();

  // Initial daily greeting + streak celebration. The welcome bubble shows
  // on every launch so the user always has visual feedback that the pet
  // is alive, even on the second launch of the same day. The first launch
  // of a new day also marks the daily greeting as delivered so we don't
  // re-fire the greeting logic in the same session.
  petState.dailyState.touch();
  if (dailyGreetingEnabled) {
    const hour = new Date().getHours();
    const isFirstGreetingToday = petState.dailyState.shouldGreet();
    showCustomBubble(moodBubbleApi.greetingTextForHour(hour), 4500);
    if (isFirstGreetingToday) {
      petState.dailyState.markGreeted();
      savePetState();
    }
  }
  const streakText = moodBubbleApi.streakTextForDays(petState.dailyState.snapshot().streakDays);
  if (streakText) {
    setTimeout(() => {
      showCustomBubble(streakText, 4500);
    }, 5200);
  }
})();






