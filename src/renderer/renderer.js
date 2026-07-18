(function bootDeskpet() {
  const { actions } = window.DeskpetActionConfig;

  const pet = document.querySelector("#pet");
  const moodBubble = document.querySelector("#mood-bubble");
  const chatReplyBubble = document.querySelector("#chat-reply-bubble");
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
  const focusSkip = document.querySelector("#focus-skip");
  const focusReset = document.querySelector("#focus-reset");
  const focusPhaseEl = document.querySelector("#focus-phase");
  const focusRemainingEl = document.querySelector("#focus-remaining");
  const statusStreak = document.querySelector("#status-streak");
  const focusIndicator = document.querySelector("#focus-indicator");
  const musicStatusBar = document.querySelector("#music-status-bar");
  const focusDurationInput = document.querySelector("#focus-duration-input");
  const breakDurationInput = document.querySelector("#break-duration-input");
  const taskNameInput = document.querySelector("#task-name-input");
  const focusTaskSummary = document.querySelector("#focus-task-summary");
  const focusRecordsEl = document.querySelector("#focus-records");
  const focusRecordsClear = document.querySelector("#focus-records-clear");
  const focusStatsEl = document.querySelector("#focus-stats");
  const clockEl = document.querySelector("#clock");
  const clockEnabledInput = document.querySelector("#clock-enabled-input");
  const clockOpacityInput = document.querySelector("#clock-opacity-input");
  const clockOpacityOutput = document.querySelector("#clock-opacity-output");
  const clockDisplayModeInput = document.querySelector("#clock-display-mode-input");
  const focusIndicatorEnabledInput = document.querySelector("#focus-indicator-enabled-input");
  const focusDisplayModeInput = document.querySelector("#focus-display-mode-input");
  const petClickThroughInput = document.querySelector("#pet-click-through-input");
  const musicStatusClickThroughInput = document.querySelector("#music-status-click-through-input");
  const musicStatusOpacityInput = document.querySelector("#music-status-opacity-input");
  const musicStatusOpacityOutput = document.querySelector("#music-status-opacity-output");
  const settings = window.DeskpetSettings;
  const moodBubbleApi = window.DeskpetMoodBubble;
  const pointerPolicy = window.DeskpetPointerActionPolicy;
  const visualStyle = window.DeskpetVisualStyle;
  const bridge = window.deskpet;
  const runtimeStyle = window.DeskpetRuntimeStyle?.createRuntimeStyleManager?.(document);
  const musicCommand = window.DeskpetMusicCommand;
  const holdVisualLock = window.DeskpetHoldVisualLock.createHoldVisualLock(pet);
  const framePreloader = window.DeskpetFramePreload.createFramePreloader();

  function applyRuntimeStyle(element, id, declarations) {
    if (!runtimeStyle || !element) return false;
    return runtimeStyle.apply(element, id, declarations);
  }

  function clearRuntimeStyle(element, id = "") {
    if (!runtimeStyle || !element) return false;
    return runtimeStyle.clear(element, id);
  }
  const mouseReact = new window.DeskpetMouseReact.MouseReact();
  const clock = new window.DeskpetClock.Clock();
  let mouseReactEnabled = true;
  let dailyGreetingEnabled = true;
  let clockEnabled = true;
  let clockOpacityPercent = 100;
  let clockDisplayMode = "floating";
  let focusIndicatorEnabled = true;
  let focusDisplayMode = "floating";
  let petClickThroughEnabled = false;
  let musicStatusClickThroughEnabled = false;
  let musicStatusOpacityPercent = 100;
  let focusActive = false;
  let clockIntervalId = 0;
  let lastMouseEventsIgnored = null;
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
  let longBreakDurationMinutes = 15;
  let focusRoundsBeforeLongBreak = 4;
  let focusNotificationsEnabled = true;
  let focusSoundEnabled = false;
  let focusPetReactionsEnabled = true;
  let focusConfirmInterrupt = true;
  let pendingTaskName = "";
  let focusRecords = [];
  let focusSessionController = null;
  let focusRuntime = null;
  let focusSessionSnapshot = null;
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
  let isDraggingFocus = false;
  let isDraggingMusic = false;
  let focusIndicatorPosition = null;
  let musicStatusPosition = null;
  let musicStatusPlaying = false;
  let musicProgressSeeking = null;
  let lastMusicStatusRenderKey = "";
  let musicLyricStyle = { color: "#243044", fontSize: 12, controlSize: 31 };
  let musicStatusState = { title: "网易云音乐", artist: "", status: "待命", lyric: "", translation: "", nextLyric: "", nextTranslation: "", songId: "", liked: false, coverUrl: "", currentTime: 0, duration: 0 };
  let musicStatusRuntime = null;
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
  let widgetRuntime = null;
  function ensureWidgetRuntime() {
    if (widgetRuntime || !window.DeskpetWidgetRuntime?.WidgetRuntime) return widgetRuntime;
    widgetRuntime = new window.DeskpetWidgetRuntime.WidgetRuntime({
      elements: {
        clock: {
          element: clockEl,
          size: { width: 76, height: 50 },
          priority: 2,
          managePresentation: false,
          applyOpacity: false,
          clampPosition: (position) => clampClockPosition(position),
          toStylePosition: (position) => ({ left: `${visualToCssLeft(position.x)}px`, top: `${position.y}px` }),
          onDragStart: () => { isDraggingClock = true; },
          onDragEnd: (state) => { clockPosition = state.position; isDraggingClock = false; refreshPetShape(); },
        },
        focus: {
          element: focusIndicator,
          size: { width: 126, height: 34 },
          priority: 1,
          managePresentation: false,
          applyOpacity: false,
          clampPosition: (position) => clampStageWidgetPosition(position, focusIndicator, 126, 34),
          onDragStart: () => { isDraggingFocus = true; },
          onDragEnd: (state) => { focusIndicatorPosition = state.position; isDraggingFocus = false; refreshPetShape(); },
        },
        music: {
          element: musicStatusBar,
          size: { width: MUSIC_STATUS_WIDTH, height: MUSIC_STATUS_HEIGHT },
          priority: 0,
          managePresentation: false,
          applyOpacity: false,
          clampPosition: (position) => clampMusicStatusPosition(position),
          onDragStart: () => { isDraggingMusic = true; },
          onDragEnd: (state) => { musicStatusPosition = state.position; isDraggingMusic = false; refreshPetShape(); },
        },
      },
      dragApi: window.DeskpetWidgetDrag,
      coordinationApi: window.DeskpetWidgetCoordination,
      runtimeStyle,
      onPersist: (payload, dirtyIds) => {
        const patch = {};
        if (dirtyIds.includes("clock")) patch.clockPosition = payload.widgets.clock.position;
        if (dirtyIds.includes("focus")) patch.focusIndicatorPosition = payload.widgets.focus.position;
        if (dirtyIds.includes("music")) patch.musicStatusPosition = payload.widgets.music.position;
        if (Object.keys(patch).length && typeof bridge.updateSettings === "function") {
          bridge.updateSettings(patch).catch(() => {});
        }
      },
    });
    return widgetRuntime;
  }
  function loadWidgetRuntime(settingsValue) {
    const runtime = ensureWidgetRuntime();
    if (!runtime) return;
    runtime.load({ widgets: {
      clock: { position: clockPosition || undefined },
      focus: { position: focusIndicatorPosition || undefined },
      music: { position: musicStatusPosition || undefined },
    } });
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
  function normalizeWidgetDisplayMode(mode) {
    return mode === "music" || mode === "hidden" ? mode : "floating";
  }
  function normalizeMusicStatusOpacity(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 20 || number > 100) {
      return 100;
    }
    return Math.round(number);
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
    applyRuntimeStyle(clockEl, "clock-position", {
      left: `${visualToCssLeft(clockPosition.x)}px`,
      top: `${clockPosition.y}px`,
      right: "auto",
    });
  }
  function applyFocusIndicatorPosition() {
    if (!focusIndicator || !focusIndicatorPosition) return;
    applyRuntimeStyle(focusIndicator, "focus-position", {
      left: `${focusIndicatorPosition.x}px`,
      top: `${focusIndicatorPosition.y}px`,
      right: "auto",
      bottom: "auto",
    });
  }
  function clearFocusIndicatorPosition() {
    if (!focusIndicator) return;
    clearRuntimeStyle(focusIndicator);
  }
  function applyMusicStatusPosition() {
    if (!musicStatusBar || !musicStatusPosition) return;
    applyRuntimeStyle(musicStatusBar, "music-status-position", {
      left: `${musicStatusPosition.x}px`,
      top: `${musicStatusPosition.y}px`,
      right: "auto",
      bottom: "auto",
    });
  }
  function applyMusicStatusPresentation() {
    if (!musicStatusBar) return;
    applyRuntimeStyle(musicStatusBar, "music-status-presentation", {
      opacity: String(Math.max(0.2, Math.min(1, musicStatusOpacityPercent / 100))),
    });
    musicStatusBar.classList.toggle("is-click-through", musicStatusClickThroughEnabled);
    musicStatusBar.dataset.clickThrough = musicStatusClickThroughEnabled ? "true" : "false";
    musicStatusBar.setAttribute(
      "aria-label",
      musicStatusClickThroughEnabled ? "网易云音乐状态条，当前已穿透" : "网易云音乐状态条",
    );
  }
  function applyPetMouseEventsPolicy() {
    if (!bridge || typeof bridge.setPetMouseEventsIgnored !== "function") return;
    if (stage) {
      stage.dataset.petClickThrough = petClickThroughEnabled ? "true" : "false";
      stage.setAttribute(
        "aria-label",
        petClickThroughEnabled ? "桌宠，当前已穿透" : "桌宠",
      );
    }
    const ignored = pointerPolicy && typeof pointerPolicy.shouldIgnorePetMouseEvents === "function"
      ? pointerPolicy.shouldIgnorePetMouseEvents({ petClickThroughEnabled, musicStatusClickThroughEnabled })
      : petClickThroughEnabled;
    if (ignored === lastMouseEventsIgnored) return;
    lastMouseEventsIgnored = ignored;
    bridge.setPetMouseEventsIgnored(ignored).catch(() => {
      lastMouseEventsIgnored = null;
    });
  }
  function clearMusicStatusPosition() {
    if (!musicStatusBar) return;
    clearRuntimeStyle(musicStatusBar, "music-status-position");
  }
  function coordinatePinnedWidgetPositions() {
    const coordinator = window.DeskpetWidgetCoordination;
    if (!coordinator || typeof coordinator.resolveWidgetPositions !== "function" || !stage) return;
    const resolved = coordinator.resolveWidgetPositions({
      stage: { width: stage.clientWidth || 512, height: stage.clientHeight || 512 },
      music: {
        visible: Boolean(musicStatusPosition),
        position: musicStatusPosition || { x: 12, y: 12 },
        size: { width: MUSIC_STATUS_WIDTH, height: MUSIC_STATUS_HEIGHT },
      },
      focus: {
        visible: Boolean(focusIndicatorPosition && focusIndicator && !focusIndicator.hidden),
        position: focusIndicatorPosition || { x: 12, y: 12 },
        size: { width: 126, height: 34 },
      },
      clock: {
        visible: Boolean(clockPosition && clockEl && !clockEl.hidden),
        position: clockPosition || { x: 12, y: 12 },
        size: { width: 76, height: 50 },
      },
    });
    if (resolved.focus && focusIndicator && !isDraggingFocus) {
      applyRuntimeStyle(focusIndicator, "focus-position", {
        left: `${resolved.focus.x}px`,
        top: `${resolved.focus.y}px`,
        right: "auto",
        bottom: "auto",
      });
    }
    if (resolved.clock && clockEl && !isDraggingClock) {
      applyRuntimeStyle(clockEl, "clock-position", {
        left: `${visualToCssLeft(resolved.clock.x)}px`,
        top: `${resolved.clock.y}px`,
        right: "auto",
      });
    }
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
  const focusPetBridge = new window.DeskpetFocusPetBridge.FocusPetBridge({
    onBehavior: ({ action, reason }) => {
      if (!focusPetReactionsEnabled && !reason.startsWith("drag")) return;
      play(action);
    },
    onBubble: ({ text }) => {
      if (focusPetReactionsEnabled) showCustomBubble(text);
    },
    onQuietMode: (quiet) => {
      focusActive = quiet;
      walkMovementRunner.setReduced(quiet);
    },
    resolveAmbientAction: (snapshot) => {
      if (snapshot && snapshot.phase === "focus") return "idle";
      const audioState = window.DeskpetAudioPlayer?.getState?.();
      if (audioState && audioState.playing) return "music";
      return petState.sleeping ? "sleep" : "idle";
    },
  });
  const petInteractionRuntime = new window.DeskpetPetInteractionRuntime.PetInteractionRuntime({
    drag,
    petState,
    focusPetBridge,
    currentFocusSnapshot,
    resolveAction: (result) => pointerPolicy.visualActionForPointerResult(result),
    onTap: (feedback) => {
      savePetState();
      showMoodBubble(feedback.action);
    },
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
    const pending = Promise.all(paths.map((src) => {
      framePreloader.preload(src);
      return hitTester.load(src);
    }))
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
    addVisibleUiShapeRect(rects, chatReplyBubble);
    addVisibleUiShapeRect(rects, clockEl);
    addVisibleUiShapeRect(rects, focusIndicator);
    if (!musicStatusClickThroughEnabled) addVisibleUiShapeRect(rects, musicStatusBar);
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
  let chatBubbleTimer = 0;
  let chatBubbleQueue = [];
  let chatBubbleActive = false;

  function setOutput(output, value) {
    if (output) {
      output.value = `${Math.round(value)}%`;
      output.textContent = `${Math.round(value)}%`;
    }
  }

  function updateClockWidget() {
    if (!clockEl) return;
    clockEl.dataset.displayMode = clockDisplayMode;
    applyRuntimeStyle(clockEl, "clock-presentation", {
      opacity: String(Math.max(0.2, Math.min(1, clockOpacityPercent / 100))),
    });
    if (!clockEnabled || clockDisplayMode !== "floating") {
      clockEl.hidden = true;
      clockEl.classList.remove("is-visible");
      refreshPetShape();
      setMusicStatus(musicStatusState, { playing: musicStatusPlaying });
      return;
    }
    const now = new Date();
    clockEl.innerHTML = `<span class="clock-widget__date">${clock.formatDate(now)}</span><span class="clock-widget__time">${clock.formatTime(now)}</span>`;
    clockEl.hidden = false;
    clockEl.classList.add("is-visible");
    requestAnimationFrame(refreshPetShape);
  }

  function clockSummaryText() {
    if (!clockEnabled || clockDisplayMode !== "music") return "";
    return clock.format(new Date());
  }

  function hideEmbeddedClockWidget() {
    if (!clockEl || !clockEnabled || clockDisplayMode !== "music") return;
    clockEl.dataset.displayMode = "music";
    clockEl.hidden = true;
    clockEl.classList.remove("is-visible");
    clearRuntimeStyle(clockEl, "clock-anchor");
  }

  function focusSummaryText() {
    const snapshot = currentFocusSnapshot();
    if (!focusIndicatorEnabled || focusDisplayMode !== "music" || snapshot.phase === "idle") return "";
    const total = Math.max(0, Math.ceil(snapshot.remainingMs / 1000));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    const phaseLabel = snapshot.phase.includes("break") ? "休息" : snapshot.phase.includes("waiting") ? "等待" : "专注";
    const paused = snapshot.status === "paused" ? "已暂停 · " : "";
    const task = snapshot.taskName || pendingTaskName;
    return `${phaseLabel} ${paused}${mm}:${ss}${task ? ` · ${task}` : ""}`;
  }

  function startClockInterval() {
    if (clockIntervalId) return;
    updateClockWidget();
    clockIntervalId = setInterval(updateClockWidget, 30 * 1000);
  }

  function setMusicStatus(status, { playing = musicStatusPlaying } = {}) {
    if (!musicStatusBar || !window.DeskpetMusicStatusView) return;
    hideEmbeddedClockWidget();
    musicStatusPlaying = playing;
    if (status && typeof status === "object") {
      musicStatusState = { ...musicStatusState, ...status };
    } else {
      musicStatusState = {
        ...musicStatusState,
        status: status || "",
        lyric: "",
        translation: "",
        nextLyric: "",
        nextTranslation: "",
      };
    }
    const playMode = window.DeskpetMusicPlaybackService?.getPlaybackState?.().mode || "sequence";
    const playbackCapabilities = window.DeskpetMusicPlaybackService?.getPlaybackCapabilities?.() || {};
    const clockSummary = clockSummaryText();
    const focusSummary = focusSummaryText();
    const musicStatusRenderKey = JSON.stringify({
      ...musicStatusState,
      currentTime: 0,
      duration: 0,
      playing: musicStatusPlaying,
      lyricStyle: musicLyricStyle,
      playMode,
      playbackCapabilities,
      clockSummary,
      focusSummary,
    });
    if (musicStatusRenderKey !== lastMusicStatusRenderKey || !musicStatusBar.querySelector(".music-status-bar__controls")) {
      musicStatusBar.innerHTML = window.DeskpetMusicStatusView.renderMusicStatusBar({
        ...musicStatusState,
        playing: musicStatusPlaying,
        lyricStyle: musicLyricStyle,
        playMode,
        playbackCapabilities,
        clockSummary,
        focusSummary,
      });
      lastMusicStatusRenderKey = musicStatusRenderKey;
      musicStatusBar.querySelectorAll("img[data-cover-url]").forEach((image) => {
        image.addEventListener("error", () => {
          image.hidden = true;
          const placeholder = image.nextElementSibling;
          if (placeholder) placeholder.hidden = false;
        }, { once: true });
      });
    }
    const lyricStyle = normalizeMusicLyricStyle(musicLyricStyle);
    applyRuntimeStyle(musicStatusBar, "music-status-lyric", {
      "--music-lyric-color": lyricStyle.color,
      "--music-lyric-size": `${lyricStyle.fontSize}px`,
      "--music-control-size": `${lyricStyle.controlSize}px`,
      "--music-progress": String(musicStatusState.duration > 0
        ? Math.min(100, Math.max(0, (Number(musicStatusState.currentTime || 0) / Number(musicStatusState.duration)) * 100))
        : 0),
    });
    if (musicProgressSeeking) {
      updateMusicProgressPreview(musicProgressSeeking.seconds, musicProgressSeeking.duration);
    } else {
      updateMusicProgressDisplay(musicStatusState.currentTime, musicStatusState.duration);
    }
    if (musicStatusPosition) applyMusicStatusPosition();
    applyMusicStatusPresentation();
    requestAnimationFrame(refreshPetShape);
  }

  function updateMusicProgressDisplay(currentTime, duration) {
    const progress = musicStatusBar?.querySelector(".music-status-bar__progress");
    if (!progress) return;
    const safeDuration = Math.max(0, Number(duration) || 0);
    const safeCurrentTime = Math.max(0, Math.min(safeDuration, Number(currentTime) || 0));
    const percent = safeDuration ? (safeCurrentTime / safeDuration) * 100 : 0;
    progress.dataset.progress = String(percent);
    progress.setAttribute("aria-valuenow", String(Math.round(percent)));
    const label = progress.querySelector(".music-status-bar__progress-time");
    if (label) label.textContent = `${formatMusicTime(safeCurrentTime)} / ${formatMusicTime(safeDuration)}`;
  }

  function formatMusicTime(seconds) {
    return window.DeskpetMusicStatusView?.formatTime
      ? window.DeskpetMusicStatusView.formatTime(seconds)
      : "0:00";
  }

  function progressPositionFromEvent(event) {
    const progress = musicStatusBar?.querySelector(".music-status-bar__progress");
    if (!progress || typeof progress.getBoundingClientRect !== "function") return null;
    const duration = Number(progress.dataset.duration);
    const rect = progress.getBoundingClientRect();
    if (!Number.isFinite(duration) || duration <= 0 || !rect.width) return null;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    return { progress, duration, seconds: ratio * duration };
  }

  function updateMusicProgressPreview(seconds, duration) {
    const progress = musicStatusBar?.querySelector(".music-status-bar__progress");
    if (!progress) return;
    const safeDuration = Math.max(0, Number(duration) || 0);
    const safeSeconds = Math.max(0, Math.min(safeDuration, Number(seconds) || 0));
    progress.classList.add("is-seeking");
    progress.setAttribute("aria-valuenow", safeDuration ? String(Math.round((safeSeconds / safeDuration) * 100)) : "0");
    const label = progress.querySelector(".music-status-bar__progress-time");
    if (label) label.textContent = `${formatMusicTime(safeSeconds)} / ${formatMusicTime(safeDuration)}`;
    applyRuntimeStyle(musicStatusBar, "music-progress-preview", {
      "--music-progress-preview": safeDuration ? String((safeSeconds / safeDuration) * 100) : "0",
    });
  }

  function finishMusicProgressSeek(event, { commit = true } = {}) {
    if (!musicProgressSeeking || event.pointerId !== musicProgressSeeking.pointerId) return;
    const position = progressPositionFromEvent(event) || musicProgressSeeking;
    if (commit && window.DeskpetAudioPlayer?.seekTo) {
      window.DeskpetAudioPlayer.seekTo(position.seconds);
    }
    if (musicStatusBar?.hasPointerCapture?.(event.pointerId)) {
      musicStatusBar.releasePointerCapture(event.pointerId);
    }
    musicProgressSeeking = null;
    clearRuntimeStyle(musicStatusBar, "music-progress-preview");
    musicStatusBar?.querySelector(".music-status-bar__progress")?.classList.remove("is-seeking");
  }

  function setMusicPlaybackStatus(text) {
    setMusicStatus(text || "", { playing: musicStatusPlaying });
  }

  function audioStateStatus(state) {
    const meta = state && state.meta ? state.meta : {};
    const lyric = state && state.currentLyric;
    const status = {
      title: meta.title || "网易云音乐",
      artist: meta.artist || "",
      songId: meta.songId || "",
      status: state && state.playing ? "正在播放" : "已暂停",
      lyric: lyric && lyric.text ? lyric.text : "",
      translation: lyric && lyric.translation ? lyric.translation : "",
      nextLyric: state && state.nextLyric && state.nextLyric.text ? state.nextLyric.text : "",
      nextTranslation: state && state.nextLyric && state.nextLyric.translation ? state.nextLyric.translation : "",
      coverUrl: meta.coverUrl || meta.coverImgUrl || meta.picUrl || "",
      currentTime: state && Number.isFinite(state.currentTime) ? state.currentTime : 0,
      duration: state && Number.isFinite(state.duration) ? state.duration : 0,
    };
    if (Object.prototype.hasOwnProperty.call(meta, "liked")) {
      status.liked = meta.liked === true;
    }
    return status;
  }

  async function refreshCurrentLikedState(songId) {
    const id = songId ? String(songId) : "";
    if (!id || !bridge || typeof bridge.checkLikedSongs !== "function") {
      if (!id && musicStatusState.liked) setMusicStatus({ liked: false }, { playing: musicStatusPlaying });
      return;
    }
    const result = await bridge.checkLikedSongs([id]).catch(() => null);
    if (result && result.success && result.liked && musicStatusState.songId === id) {
      setMusicStatus({ liked: result.liked[id] === true }, { playing: musicStatusPlaying });
    }
  }

  function ensureAudioStatusSubscription() {
    if (musicStatusRuntime) return;
    const audioPlayer = window.DeskpetAudioPlayer;
    if (!audioPlayer || typeof audioPlayer.onStateChange !== "function" || !window.DeskpetMusicStatusRuntime?.MusicStatusRuntime) return;
    musicStatusRuntime = new window.DeskpetMusicStatusRuntime.MusicStatusRuntime({
      audioPlayer,
      onRender: (state) => {
        handleAudioStatusState(state);
      },
    });
    musicStatusRuntime.start();
  }

  async function handleAudioStatusState(state) {
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
      const nextStatus = audioStateStatus(state);
      const previousSongId = musicStatusState.songId;
      const hasLikedState = Object.prototype.hasOwnProperty.call(nextStatus, "liked");
      if (nextStatus.songId && nextStatus.songId !== previousSongId && !hasLikedState) {
        nextStatus.liked = false;
      }
      setMusicStatus(nextStatus, { playing: !!state.playing });
      if (nextStatus.songId && nextStatus.songId !== previousSongId) {
        refreshCurrentLikedState(nextStatus.songId);
      }
  }

  async function runMusicStatusAction(action) {
    if (!bridge) return;
    if (action === "toggleLike") {
      const songId = musicStatusState.songId ? String(musicStatusState.songId) : "";
      if (!songId || typeof bridge.likeSong !== "function") {
        setMusicStatus("当前没有可收藏的歌曲", { playing: musicStatusPlaying });
        return;
      }
      const nextLiked = !musicStatusState.liked;
      setMusicStatus(nextLiked ? "正在加入我喜欢..." : "正在取消喜欢...", { playing: musicStatusPlaying });
      const result = await bridge.likeSong(songId, nextLiked).catch(() => null);
      if (result && result.success) {
        setMusicStatus({ liked: nextLiked, status: nextLiked ? "已加入我喜欢" : "已取消喜欢" }, { playing: musicStatusPlaying });
      } else {
        setMusicStatus("操作失败，请先登录网易云", { playing: musicStatusPlaying });
      }
      return;
    }
    if (action === "addToPlaylist") {
      const songId = musicStatusState.songId ? String(musicStatusState.songId) : "";
      if (!songId) {
        setMusicStatus("当前没有可添加的歌曲", { playing: musicStatusPlaying });
        return;
      }
      const song = {
        id: songId,
        title: musicStatusState.title || "",
        artist: musicStatusState.artist || "",
      };
      if (window.DeskpetMusicPanel && typeof window.DeskpetMusicPanel.addSongToPlaylist === "function") {
        setMusicStatus("选择要加入的歌单", { playing: musicStatusPlaying });
        await window.DeskpetMusicPanel.addSongToPlaylist(song).catch(() => null);
      } else {
        await bridge.openMusicWindow?.().catch(() => null);
        setMusicStatus("请在音乐窗口中添加到歌单", { playing: musicStatusPlaying });
      }
      return;
    }
    if (action === "account") {
      setMusicStatus("打开面板");
      if (window.DeskpetMusicPanel && typeof window.DeskpetMusicPanel.open === "function") {
        window.DeskpetMusicPanel.open("home");
        setMusicStatus("账号面板已打开");
        return;
      }
      const result = await bridge.openMusicWindow?.().catch(() => null);
      setMusicStatus(result && result.success ? "面板已打开" : "面板打开失败");
      return;
    }
    if (action === "cycleMode" && window.DeskpetMusicPlaybackService) {
      const result = typeof window.DeskpetMusicPlaybackService.cyclePlaybackMode === "function"
        ? window.DeskpetMusicPlaybackService.cyclePlaybackMode({ bridge })
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
      const capabilities = window.DeskpetMusicPlaybackService.getPlaybackCapabilities?.();
      if (capabilities && !capabilities.hasQueue) {
        setMusicStatus("播放列表为空", { playing: musicStatusPlaying });
        return;
      }
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

  function renderFocusRecords() {
    if (!focusRecordsEl) return;
    if (focusRecords.length === 0) {
      focusRecordsEl.innerHTML = '<li class="focus-records__empty">\u8fd8\u6ca1\u6709\u4e13\u6ce8\u8bb0\u5f55</li>';
      return;
    }
    const items = focusRecords.slice(-10).reverse().map((record) => {
      const task = escapeHtml(record.task || "\u672a\u547d\u540d\u4efb\u52a1");
      const durationMs = Number.isFinite(Number(record.actualDurationMs))
        ? Number(record.actualDurationMs)
        : Number(record.focusDurationMs) || 0;
      const minutes = Math.round(durationMs / 60000);
      const time = formatRecordTime(record.completedAt);
      const resultLabel = record.result === "interrupted"
        ? "中断"
        : record.result === "skipped"
          ? "跳过"
          : record.phase && record.phase !== "focus"
            ? "休息"
            : "完成";
      return `<li class="record">
        <span class="record-task">${task}</span>
        <span class="record-duration">${resultLabel} · ${minutes} \u5206\u949f</span>
        <span class="record-time">${time}</span>
      </li>`;
    });
    focusRecordsEl.innerHTML = items.join("");
  }

  function renderFocusStats() {
    if (!focusStatsEl || !window.DeskpetFocusStatistics) return;
    const stats = window.DeskpetFocusStatistics.summarizeFocusRecords(
      focusRecords,
      new Date(),
      currentFocusSnapshot(),
    );
    const minutes = Math.round(stats.todayDurationMs / 60000);
    const totalMinutes = Math.round(stats.totalDurationMs / 60000);
    focusStatsEl.innerHTML = `<span><strong>${stats.todayCount}</strong> 今日次数</span>`
      + `<span><strong>${minutes}</strong> 今日分钟</span>`
      + `<span><strong>${totalMinutes}</strong> 累计分钟</span>`
      + `<span><strong>${stats.streakDays}</strong> 连续天数</span>`
      + `<span><strong>${stats.interruptedCount}</strong> 中断</span>`;
  }

  function saveFocusSettings() {
    queueSettingsUpdate({
      focusDurationMinutes,
      breakDurationMinutes,
      longBreakDurationMinutes,
      focusRoundsBeforeLongBreak,
      focusNotificationsEnabled,
      focusSoundEnabled,
      focusPetReactionsEnabled,
      focusConfirmInterrupt,
      focusSession: focusSessionSnapshot && focusSessionSnapshot.phase !== "idle"
        ? focusSessionSnapshot
        : null,
      pendingTaskName,
      focusRecords,
    });
  }

  function currentFocusSnapshot() {
    if (focusSessionController) return focusSessionController.snapshot();
    return {
      phase: "idle",
      status: "idle",
      remainingMs: focusDurationMinutes * 60 * 1000,
      taskName: "",
      completedFocusRounds: 0,
      roundsBeforeLongBreak: focusRoundsBeforeLongBreak,
      suggestedBreakPhase: null,
    };
  }

  function handleFocusSessionEvent(event) {
    focusPetBridge.handleSessionEvent(event);
    if ((event.type !== "phase-completed" && event.type !== "phase-completed-restored")
      || !focusNotificationsEnabled) {
      return;
    }
    const waitingForBreak = event.snapshot.phase === "waiting-for-break";
    const title = waitingForBreak ? "本轮专注已完成" : "休息结束";
    const body = waitingForBreak
      ? "准备好后开始休息，下一阶段不会自动计时。"
      : "准备好后开始下一轮专注。";
    try {
      Promise.resolve(window.deskpet.showFocusNotification?.({
        title,
        body,
        silent: !focusSoundEnabled,
      })).catch(() => null);
    } catch (_error) {
      // Desktop notifications are optional; the pet bubble remains available.
    }
  }

  function startCurrentBreak() {
    const snapshot = currentFocusSnapshot();
    return snapshot.phase === "waiting-for-break"
      ? focusSessionController?.startSuggestedBreak()
      : focusSessionController?.startBreak({ taskName: pendingTaskName });
  }

  function interruptCurrentFocus() {
    const snapshot = currentFocusSnapshot();
    if (snapshot.phase !== "focus") {
      return { success: false, code: "focus-not-active", message: "当前没有可提前结束的专注。" };
    }
    if (focusConfirmInterrupt && !window.confirm("提前结束会把本轮记录为中断，确定结束吗？")) {
      return { success: false, code: "cancelled", cancelled: true };
    }
    return focusSessionController?.interruptFocus();
  }

  function configureFocusSession(loadedSettings = {}) {
    focusRuntime?.destroy?.();
    focusRuntime = new window.DeskpetFocusRuntime.FocusRuntime({
      createController: () => new window.DeskpetFocusSession.FocusSessionController({
        focusDurationMs: focusDurationMinutes * 60 * 1000,
        shortBreakDurationMs: breakDurationMinutes * 60 * 1000,
        longBreakDurationMs: longBreakDurationMinutes * 60 * 1000,
        roundsBeforeLongBreak: focusRoundsBeforeLongBreak,
        initialSession: loadedSettings.focusSession || null,
        initialRecords: focusRecords,
      }),
      onPersist: ({ snapshot, records }) => {
        focusSessionSnapshot = snapshot;
        focusRecords = records.slice(-500);
        saveFocusSettings();
        renderFocusRecords();
        renderFocusStats();
        focusActive = snapshot.phase === "focus"
          && (snapshot.status === "running" || snapshot.status === "paused");
        walkMovementRunner.setReduced(focusActive);
        updateFocusPanel();
      },
      onEvent: handleFocusSessionEvent,
      onRestoredCompletion: (snapshot) => handleFocusSessionEvent({ type: "phase-completed-restored", snapshot }),
    });
    focusRuntime.load({ ...loadedSettings, focusRecords });
    focusSessionController = focusRuntime.controller;
    const restored = focusRuntime.snapshot();
    focusSessionSnapshot = restored;
    focusActive = restored.phase === "focus"
      && (restored.status === "running" || restored.status === "paused");
    walkMovementRunner.setReduced(focusActive);
    updateFocusPanel();
    if (restored.phase === "focus" && restored.status !== "waiting") {
      focusPetBridge.handleSessionEvent({
        type: restored.status === "paused" ? "phase-paused" : "focus-started",
        snapshot: restored,
      });
    }
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
    if (clockOpacityInput) clockOpacityInput.value = String(clockOpacityPercent);
    if (clockDisplayModeInput) {
      clockDisplayModeInput.value = clockDisplayMode;
    }
    if (focusIndicatorEnabledInput) {
      focusIndicatorEnabledInput.checked = focusIndicatorEnabled;
    }
    if (focusDisplayModeInput) {
      focusDisplayModeInput.value = focusDisplayMode;
    }
    if (petClickThroughInput) {
      petClickThroughInput.checked = petClickThroughEnabled;
    }
    if (musicStatusClickThroughInput) {
      musicStatusClickThroughInput.checked = musicStatusClickThroughEnabled;
    }
    if (musicStatusOpacityInput) {
      musicStatusOpacityInput.value = String(musicStatusOpacityPercent);
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
    if (focusTaskSummary) {
      focusTaskSummary.textContent = pendingTaskName || "未设置任务";
    }
    setOutput(sizeOutput, sizePercent);
    setOutput(speedOutput, speedPercent);
    setOutput(opacityOutput, opacityPercent);
    setOutput(musicStatusOpacityOutput, musicStatusOpacityPercent);
    setOutput(clockOpacityOutput, clockOpacityPercent);
    renderFocusRecords();
    renderFocusStats();
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

  function pumpChatReplyBubble() {
    if (!chatReplyBubble || chatBubbleActive || !chatBubbleQueue.length) return;
    const next = chatBubbleQueue.shift();
    chatBubbleActive = true;
    chatReplyBubble.textContent = next.text;
    chatReplyBubble.hidden = false;
    requestAnimationFrame(() => {
      chatReplyBubble.classList.add("is-visible");
      refreshPetShape();
    });
    clearTimeout(chatBubbleTimer);
    chatBubbleTimer = setTimeout(() => {
      chatReplyBubble.classList.remove("is-visible");
      chatBubbleTimer = setTimeout(() => {
        chatReplyBubble.hidden = true;
        chatBubbleActive = false;
        refreshPetShape();
        pumpChatReplyBubble();
      }, 250);
    }, next.durationMs);
  }

  function showChatReplyBubble(text, durationMs = 4500) {
    const content = typeof text === "string" ? text.trim() : "";
    if (!content || !chatReplyBubble) return;
    chatBubbleQueue.push({
      text: content,
      durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 4500,
    });
    chatBubbleQueue = chatBubbleQueue.slice(-3);
    pumpChatReplyBubble();
  }

  function applyOpacity() {
    applyRuntimeStyle(pet, "pet-presentation", {
      opacity: String(Math.max(0.2, Math.min(1, opacityPercent / 100))),
    });
  }

  function applyWalkFacing() {
    const facingLeft = animation.action === "walk" && walkMovementRunner.direction() < 0;
    pet.classList.toggle("is-facing-left", facingLeft);
    applyRuntimeStyle(pet, "pet-facing", {
      transform: facingLeft ? "scaleX(-1)" : "none",
    });
  }

  // Position the bubble + clock widgets around the current sprite. The clock
  // still uses empty-margin / outside-pet anchoring, while the bubble uses a
  // dedicated pet-top-right anchor so long text expands away from the pet
  // instead of covering the face.
  const WIDGET_LAYOUT = {
    bubble: { width: 220, height: 84 },
    chatBubble: { width: 300, height: 132 },
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

    // Fallbacks when the image isn't ready. Keep the bubble near the pet's
    // top-right and the clock near the old upper-middle slot.
    if (!bubbleAnchor) {
      bubbleAnchor = { side: "fallback-top-right", x: petRect.width * 0.62, y: petRect.height * 0.15 };
    }
    if (!clockAnchor) {
      clockAnchor = { side: "fallback-centre", x: petRect.width / 2, y: petRect.height * 0.38 };
    }

    function place(el, anchor, { yOffset = 0 } = {}) {
      if (!el) return;
      let stageX;
      let stageY;
      if (anchor.side === "fallback-centre") {
        // CSS-pixel centre of pet rect. x is the centre (CSS handles translateX),
        // y is the relative top within the pet rect.
        stageX = petRect.left - stageRect.left + anchor.x;
        stageY = petRect.top - stageRect.top + anchor.y + yOffset;
      } else if (anchor.side === "fallback-top-right") {
        stageX = petRect.left - stageRect.left + anchor.x;
        stageY = petRect.top - stageRect.top + anchor.y + yOffset;
      } else if (String(anchor.side).startsWith("outside-")) {
        // Pet-relative outside corner: x is widget centre (CSS translates),
        // y is the widget's top-left in CSS pixels.
        stageX = petRect.left - stageRect.left + anchor.x;
        stageY = petRect.top - stageRect.top + anchor.y + yOffset;
      } else if (anchor.side === "pet-top-right") {
        // Bubble-specific image-space anchor. x/y are the widget's top-left in
        // image pixels, not a centered point.
        stageX = petRect.left - stageRect.left + offsetX + anchor.x * fitScale;
        stageY = petRect.top - stageRect.top + offsetY + anchor.y * fitScale + yOffset;
      } else {
        // Image-space anchor: x = widget centre in image px, y = widget top in image px.
        const imgX = anchor.x;
        const imgY = anchor.y;
        stageX = petRect.left - stageRect.left + offsetX + imgX * fitScale;
        stageY = petRect.top - stageRect.top + offsetY + imgY * fitScale + yOffset;
      }
      const measured = el.getBoundingClientRect();
      const width = measured.width || 220;
      const height = measured.height || 84;
      const stageWidth = stage.clientWidth || 512;
      const stageHeight = stage.clientHeight || 512;
      stageX = Math.max(4, Math.min(stageWidth - width - 4, stageX));
      stageY = Math.max(4, Math.min(stageHeight - height - 4, stageY));
      const styleId = el === moodBubble ? "bubble-position" : el === clockEl ? "clock-anchor" : "widget-position";
      applyRuntimeStyle(el, styleId, {
        left: `${stageX}px`,
        top: `${stageY}px`,
      });
    }

    // Both bubble types use the same top-right anchor. The short status bubble
    // must not be pushed below the sprite when no chat reply is visible.
    place(moodBubble, bubbleAnchor, { yOffset: 0 });
    place(chatReplyBubble, bubbleAnchor, { yOffset: 0 });
    if (isDraggingClock) {
      // Mid-drag: the drag handler owns clockEl.style. Don't touch
      // it — that was the source of the strobe between the drag
      // handler's per-move write and this re-application.
      coordinatePinnedWidgetPositions();
      return;
    }
    if (!clockEnabled || clockDisplayMode !== "floating") {
      clockEl.hidden = true;
      clockEl.classList.remove("is-visible");
    } else if (clockPosition) {
      // User dragged the clock — keep it pinned to the saved position
      // instead of letting the auto-anchor track the pet's bbox.
      applyClockPosition();
    } else {
      place(clockEl, clockAnchor);
    }
    coordinatePinnedWidgetPositions();
  }

  function renderFrame() {
    if (holdVisualLock.isLocked()) {
      return;
    }

    const frameSrc = animation.currentFramePath();
    const frameReady = typeof framePreloader.isReady === "function"
      ? framePreloader.isReady(frameSrc)
      : framePreloader.has(frameSrc);
    if (frameReady) {
      pet.src = frameSrc;
    } else {
      framePreloader.preload(frameSrc).then((ready) => {
        if (!ready || holdVisualLock.isLocked() || animation.currentFramePath() !== frameSrc) return;
        pet.src = frameSrc;
        refreshPetShape();
      });
    }
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

  function recoverAmbientAction() {
    const audioPlayer = window.DeskpetAudioPlayer;
    const audioState = audioPlayer && typeof audioPlayer.getState === "function"
      ? audioPlayer.getState()
      : null;
    if (audioState && audioState.playing) {
      play("music");
      return;
    }
    if (petState.sleeping) {
      play("sleep");
      return;
    }
    play("idle");
  }

  function playTemporary(action, durationMs) {
    play(action);
    if (action === "walk") {
      startWalkMovement();
    }
    temporaryActionTimer = setTimeout(() => {
      if (animation.action === action) {
        stopWalkMovement();
        recoverAmbientAction();
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
      clockOpacityPercent,
      clockDisplayMode,
      focusIndicatorEnabled,
      focusDisplayMode,
      petClickThroughEnabled,
      musicStatusClickThroughEnabled,
      musicStatusOpacityPercent,
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

      const result = petState.tick({ focusActive });
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
    if (command === "focus:reconcile") {
      focusSessionController?.tick();
      updateFocusPanel();
      return;
    }
    if (command.startsWith("chat-reply-bubble:")) {
      const encoded = command.slice("chat-reply-bubble:".length);
      try {
        const text = decodeURIComponent(encoded);
        if (text) showChatReplyBubble(text, 4500);
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
        clockOpacityPercent = normalizeMusicStatusOpacity(loadedSettings.clockOpacityPercent);
        clockDisplayMode = normalizeWidgetDisplayMode(loadedSettings.clockDisplayMode);
        focusIndicatorEnabled = loadedSettings.focusIndicatorEnabled !== false;
        focusDisplayMode = normalizeWidgetDisplayMode(loadedSettings.focusDisplayMode);
        petClickThroughEnabled = loadedSettings.petClickThroughEnabled === true;
        musicStatusClickThroughEnabled = loadedSettings.musicStatusClickThroughEnabled === true;
        musicStatusOpacityPercent = normalizeMusicStatusOpacity(loadedSettings.musicStatusOpacityPercent);
        focusDurationMinutes = clampFocusMinutes(loadedSettings.focusDurationMinutes, 25, 1, 180);
        breakDurationMinutes = clampFocusMinutes(loadedSettings.breakDurationMinutes, 5, 1, 60);
        longBreakDurationMinutes = clampFocusMinutes(loadedSettings.longBreakDurationMinutes, 15, 1, 120);
        focusRoundsBeforeLongBreak = clampFocusMinutes(loadedSettings.focusRoundsBeforeLongBreak, 4, 1, 12);
        focusNotificationsEnabled = loadedSettings.focusNotificationsEnabled !== false;
        focusSoundEnabled = loadedSettings.focusSoundEnabled === true;
        focusPetReactionsEnabled = loadedSettings.focusPetReactionsEnabled !== false;
        focusConfirmInterrupt = loadedSettings.focusConfirmInterrupt !== false;
        pendingTaskName = typeof loadedSettings.pendingTaskName === "string"
          ? loadedSettings.pendingTaskName.slice(0, 60)
          : "";
        focusRecords = Array.isArray(loadedSettings.focusRecords)
          ? loadedSettings.focusRecords
              .filter((r) => r && typeof r === "object" && Number.isFinite(r.focusDurationMs))
              .slice(-500)
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
        loadWidgetRuntime(loadedSettings);
        applyMusicStatusPresentation();
        applyPetMouseEventsPolicy();
        applyMusicLyricStyle(loadedSettings.musicLyricStyle);
        if (window.DeskpetMusicPanel && typeof window.DeskpetMusicPanel.setPosition === "function") {
          window.DeskpetMusicPanel.setPosition(loadedSettings.musicPanelPosition || null);
        }
        animation.setSpeedMultiplier(settings.speedPercentToMultiplier(speedPercent));
        configureFocusSession(loadedSettings);
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
      longBreakDurationMinutes = 15;
      focusRoundsBeforeLongBreak = 4;
      focusNotificationsEnabled = true;
      focusSoundEnabled = false;
      focusPetReactionsEnabled = true;
      focusConfirmInterrupt = true;
      pendingTaskName = "";
      focusRecords = [];
      clockEnabled = true;
      clockOpacityPercent = 100;
      clockDisplayMode = "floating";
      focusIndicatorEnabled = true;
      focusDisplayMode = "floating";
      petClickThroughEnabled = false;
      musicStatusClickThroughEnabled = false;
      musicStatusOpacityPercent = 100;
      configureFocusSession({ focusSession: null });
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
        longBreakDurationMinutes: 15,
        focusRoundsBeforeLongBreak: 4,
        focusNotificationsEnabled: true,
        focusSoundEnabled: false,
        focusPetReactionsEnabled: true,
        focusConfirmInterrupt: true,
        focusSession: null,
        pendingTaskName: "",
        focusRecords: [],
        clockEnabled: true,
        clockOpacityPercent: 100,
        clockDisplayMode: "floating",
        focusIndicatorEnabled: true,
        focusDisplayMode: "floating",
        petClickThroughEnabled: false,
        musicStatusClickThroughEnabled: false,
        musicStatusOpacityPercent: 100,
        petState: petState.snapshot(),
      };
      flushPendingSettings();
      applyMusicStatusPresentation();
      applyPetMouseEventsPolicy();
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
      focusSessionController?.startFocus({
        taskName: (taskNameInput && taskNameInput.value) ? taskNameInput.value : pendingTaskName,
      });
      return;
    }

    if (command === "break:start") {
      startCurrentBreak();
      return;
    }

    if (command === "focus:toggle-pause") {
      const snapshot = currentFocusSnapshot();
      const result = snapshot.status === "paused"
        ? focusSessionController?.resume()
        : focusSessionController?.pause();
      if (result && !result.success) showCustomBubble(result.message);
      return;
    }

    if (command === "focus:reset") {
      focusSessionController?.reset();
      showCustomBubble("\u5df2\u91cd\u7f6e\u3002");
      return;
    }

    if (command === "focus:end") {
      const snapshot = currentFocusSnapshot();
      const result = snapshot.phase === "focus"
        ? interruptCurrentFocus()
        : snapshot.phase.includes("break") || snapshot.phase === "waiting-for-break"
          ? focusSessionController?.skipBreak()
          : null;
      if (result && !result.success && !result.cancelled) showCustomBubble(result.message);
      return;
    }

    if (command === "task:clear") {
      pendingTaskName = "";
      if (taskNameInput) taskNameInput.value = "";
      if (focusTaskSummary) focusTaskSummary.textContent = "未设置任务";
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
      if (focusTaskSummary) focusTaskSummary.textContent = pendingTaskName || "未设置任务";
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
    petInteractionRuntime.pointerDown(event);
    holdVisualLock.lock();
    clearInterval(frameTimer);
    clearTimeout(blinkTimer);
    clearInterval(idleTimer);
  });

  stage.addEventListener("pointermove", (event) => {
    const result = petInteractionRuntime.pointerMove(event);

    if (result.type === "drag-start") {
      petState.wake();
      savePetState();
      holdVisualLock.unlock();
      if (pointerPolicy.visualActionForPointerResult(result) === "drag") {
        clearTimeout(blinkTimer);
        clearInterval(idleTimer);
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

    const result = petInteractionRuntime.pointerUp(event);
    holdVisualLock.unlock();
    const releaseAction = pointerPolicy.visualActionForPointerResult(result);
    if (releaseAction === "idle") {
      petState.wake();
      savePetState();
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
    const progress = event.target.closest?.(".music-status-bar__progress");
    if (progress) {
      const position = progressPositionFromEvent(event);
      if (position) {
        event.preventDefault();
        event.stopImmediatePropagation();
        musicProgressSeeking = { pointerId: event.pointerId, duration: position.duration, seconds: position.seconds };
        musicStatusBar.setPointerCapture?.(event.pointerId);
        updateMusicProgressPreview(position.seconds, position.duration);
        return;
      }
    }
    event.stopPropagation();
  });
  musicStatusBar?.addEventListener("pointermove", (event) => {
    if (musicProgressSeeking && event.pointerId === musicProgressSeeking.pointerId) {
      const position = progressPositionFromEvent(event);
      if (position) {
        musicProgressSeeking.seconds = position.seconds;
        updateMusicProgressPreview(position.seconds, position.duration);
      }
      return;
    }
    const position = progressPositionFromEvent(event);
    if (position) {
      const label = position.progress.querySelector(".music-status-bar__progress-time");
      if (label) label.textContent = `${formatMusicTime(position.seconds)} / ${formatMusicTime(position.duration)}`;
    }
  });
  musicStatusBar?.addEventListener("pointerup", (event) => finishMusicProgressSeek(event));
  musicStatusBar?.addEventListener("pointercancel", (event) => finishMusicProgressSeek(event, { commit: false }));
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
    configureFocusSession({ focusSession: focusSessionSnapshot });
    saveFocusSettings();
    if (currentFocusSnapshot().phase === "idle") {
      updateFocusPanel();
    }
  });

  breakDurationInput?.addEventListener("change", () => {
    breakDurationMinutes = clampFocusMinutes(breakDurationInput.value, 5, 1, 60);
    breakDurationInput.value = String(breakDurationMinutes);
    configureFocusSession({ focusSession: focusSessionSnapshot });
    saveFocusSettings();
  });

  taskNameInput?.addEventListener("input", () => {
    pendingTaskName = taskNameInput.value.slice(0, 60);
    if (focusTaskSummary) focusTaskSummary.textContent = pendingTaskName || "未设置任务";
    saveFocusSettings();
  });

  focusRecordsClear?.addEventListener("click", () => {
    focusSessionController?.clearRecords();
  });

  clockEnabledInput?.addEventListener("change", () => {
    clockEnabled = clockEnabledInput.checked;
    updateClockWidget();
    saveBehaviorSettings();
  });

  clockOpacityInput?.addEventListener("input", () => {
    clockOpacityPercent = normalizeMusicStatusOpacity(clockOpacityInput.value);
    clockOpacityInput.value = String(clockOpacityPercent);
    setOutput(clockOpacityOutput, clockOpacityPercent);
    updateClockWidget();
    saveBehaviorSettings();
  });

  clockDisplayModeInput?.addEventListener("change", () => {
    clockDisplayMode = normalizeWidgetDisplayMode(clockDisplayModeInput.value);
    updateClockWidget();
    saveBehaviorSettings();
  });

  focusIndicatorEnabledInput?.addEventListener("change", () => {
    focusIndicatorEnabled = focusIndicatorEnabledInput.checked;
    updateFocusPanel();
    saveBehaviorSettings();
  });

  focusDisplayModeInput?.addEventListener("change", () => {
    focusDisplayMode = normalizeWidgetDisplayMode(focusDisplayModeInput.value);
    updateFocusPanel();
    saveBehaviorSettings();
  });

  petClickThroughInput?.addEventListener("change", () => {
    petClickThroughEnabled = petClickThroughInput.checked;
    applyPetMouseEventsPolicy();
    refreshPetShape();
    saveBehaviorSettings();
  });

  musicStatusClickThroughInput?.addEventListener("change", () => {
    musicStatusClickThroughEnabled = musicStatusClickThroughInput.checked;
    applyMusicStatusPresentation();
    applyPetMouseEventsPolicy();
    refreshPetShape();
    saveBehaviorSettings();
  });

  musicStatusOpacityInput?.addEventListener("input", () => {
    musicStatusOpacityPercent = normalizeMusicStatusOpacity(musicStatusOpacityInput.value);
    musicStatusOpacityInput.value = String(musicStatusOpacityPercent);
    setOutput(musicStatusOpacityOutput, musicStatusOpacityPercent);
    applyMusicStatusPresentation();
    saveBehaviorSettings();
  });

  document.querySelectorAll("[data-focus-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = (button.getAttribute("data-focus-task") || "").slice(0, 60);
      pendingTaskName = task;
      if (taskNameInput) {
        taskNameInput.value = task;
      }
      if (focusTaskSummary) focusTaskSummary.textContent = task || "未设置任务";
      saveFocusSettings();
    });
  });

  window.addEventListener("beforeunload", () => {
    flushPendingSettings();
  });

  configureFocusSession({});

  focusStart?.addEventListener("click", () => {
    focusSessionController?.startFocus({
      taskName: taskNameInput ? taskNameInput.value : pendingTaskName,
    });
  });

  breakStart?.addEventListener("click", () => {
    startCurrentBreak();
  });

  focusPause?.addEventListener("click", () => {
    const snapshot = currentFocusSnapshot();
    if (snapshot.status === "paused") focusSessionController?.resume();
    else focusSessionController?.pause();
  });

  focusReset?.addEventListener("click", () => {
    focusSessionController?.reset();
  });

  focusSkip?.addEventListener("click", () => {
    const snapshot = currentFocusSnapshot();
    if (snapshot.phase === "focus") interruptCurrentFocus();
    else focusSessionController?.skipBreak();
  });

  function updateFocusPanel() {
    if (!focusPhaseEl || !focusRemainingEl) return;
    const snapshot = currentFocusSnapshot();
    const labels = {
      idle: "\u7a7a\u95f2",
      focus: "\u4e13\u6ce8\u4e2d",
      "short-break": "\u77ed\u4f11\u606f",
      "long-break": "\u957f\u4f11\u606f",
      "waiting-for-break": "\u7b49\u5f85\u4f11\u606f",
      "waiting-for-focus": "\u7b49\u5f85\u4e0b\u4e00\u8f6e",
    };
    const pausedLabel = snapshot.status === "paused" ? "\u5df2\u6682\u505c · " : "";
    focusPhaseEl.textContent = `${pausedLabel}${labels[snapshot.phase] || snapshot.phase}`;
    const total = Math.max(0, Math.ceil(snapshot.remainingMs / 1000));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    focusRemainingEl.textContent = snapshot.status === "waiting" ? "\u5f85\u786e\u8ba4" : `${mm}:${ss}`;
    const isFocus = snapshot.phase === "focus";
    const isBreak = snapshot.phase === "short-break" || snapshot.phase === "long-break";
    const timed = isFocus || isBreak;
    const active = snapshot.phase !== "idle";
    if (focusStart) focusStart.classList.toggle("is-active", isFocus);
    if (breakStart) breakStart.classList.toggle("is-active", isBreak);
    if (focusPause) focusPause.classList.toggle("is-active", snapshot.status === "paused");
    if (focusStart) {
      focusStart.disabled = !(snapshot.phase === "idle" || snapshot.phase === "waiting-for-focus");
      focusStart.setAttribute("aria-pressed", isFocus ? "true" : "false");
    }
    if (breakStart) {
      breakStart.disabled = !(snapshot.phase === "idle" || snapshot.phase === "waiting-for-break");
      breakStart.setAttribute("aria-pressed", isBreak ? "true" : "false");
    }
    if (focusPause) {
      focusPause.disabled = !timed;
      focusPause.setAttribute("aria-pressed", snapshot.status === "paused" ? "true" : "false");
    }
    if (focusReset) focusReset.disabled = !active;
    if (focusSkip) {
      focusSkip.disabled = !(isFocus || isBreak || snapshot.phase === "waiting-for-break");
      focusSkip.textContent = isFocus ? "\u7ed3\u675f\u4e13\u6ce8" : "\u8df3\u8fc7\u4f11\u606f";
    }
    renderFocusStats();
    updateFocusIndicator();
  }

  function updateFocusIndicator() {
    if (!focusIndicator) return;
    const snapshot = currentFocusSnapshot();
    const phase = snapshot.phase;
    if (!focusIndicatorEnabled || focusDisplayMode !== "floating" || phase === "idle") {
      focusIndicator.hidden = true;
      focusIndicator.className = "focus-indicator";
      focusIndicator.innerHTML = "";
      setMusicStatus(musicStatusState, { playing: musicStatusPlaying });
      refreshPetShape();
      return;
    }
    const total = Math.max(0, Math.ceil(snapshot.remainingMs / 1000));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    const isFocus = phase === "focus";
    const isBreak = phase === "short-break" || phase === "long-break";
    const isWaiting = snapshot.status === "waiting";
    const isPaused = snapshot.status === "paused";
    const icon = isWaiting ? "\u2713" : isFocus ? "T" : "B";
    const label = phase === "long-break"
      ? "\u957f\u4f11\u606f"
      : isBreak
        ? "\u4f11\u606f"
        : isWaiting
          ? "\u5f85\u786e\u8ba4"
          : "\u4e13\u6ce8";
    focusIndicator.className = `focus-indicator${isFocus ? " is-focus" : ""}${isBreak ? " is-break" : ""}${isPaused ? " is-paused" : ""}`;
    focusIndicator.innerHTML = `<span class="focus-indicator__icon">${icon}</span><span class="focus-indicator__label">${label}${isPaused ? "(\u5df2\u6682\u505c)" : ""}</span><span class="focus-indicator__time">${isWaiting ? `${snapshot.completedFocusRounds}/${snapshot.roundsBeforeLongBreak}` : `${mm}:${ss}`}</span>`;
    focusIndicator.hidden = false;
    if (focusIndicatorPosition) applyFocusIndicatorPosition();
    setMusicStatus(musicStatusState, { playing: musicStatusPlaying });
    requestAnimationFrame(refreshPetShape);
  }

  window.addEventListener("deskpet:shape-changed", () => {
    requestAnimationFrame(refreshPetShape);
  });

  setInterval(() => {
    focusSessionController?.tick();
    updateFocusPanel();
  }, 1000);

  window.deskpet.onCommand(runCommand);

  loadWidgetRuntime({});
  syncSettingsPanel();
  window.DeskpetMusicPlaybackService?.connectPlaybackState?.(bridge).then(() => {
    renderMusicStatus();
  }).catch(() => {});
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






