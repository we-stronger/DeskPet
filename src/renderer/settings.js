// Settings window logic. Loads the current settings (via the IPC bridge
// exposed in preload.js) and dispatches save events back through the
// same bridge. Kept dependency-free — no framework, no bundler.
//
// Three tabs:
//   appearance — size/speed/opacity (auto-saves on slider release)
//   focus      — focus/break durations in minutes (auto-saves on change)
//   llm        — ZhipuAI / GLM credentials (explicit save button so we
//                never silently overwrite a working API key)

(function () {
  const bridge = window.deskpet;
  const statusEl = document.getElementById("settings-status");
  const feedbackHost = document.querySelector("[data-operation-feedback]");
  const feedback = typeof window.OperationFeedback === "function"
    ? new window.OperationFeedback({ host: feedbackHost })
    : null;
  let statusRevision = 0;
  if (statusEl) statusEl.hidden = Boolean(feedback);

  function setStatus(message, tone) {
    statusRevision += 1;
    const revision = statusRevision;
    if (statusEl) {
      statusEl.textContent = message || "";
      if (tone) statusEl.dataset.tone = tone;
      else delete statusEl.dataset.tone;
    }

    if (!message) {
      feedback?.clear();
    } else if (tone === "success") {
      feedback?.success(message);
    } else if (tone === "error") {
      feedback?.error(message);
    } else if (tone === "info" && /^(正在|准备)/.test(message)) {
      feedback?.pending(message);
    } else {
      feedback?.info(message);
    }

    if (statusEl && message && tone === "success") {
      setTimeout(() => {
        if (statusRevision === revision && statusEl.textContent === message) {
          statusEl.textContent = "";
          delete statusEl.dataset.tone;
        }
      }, 1800);
    }
  }

  // ---- tab switching ---------------------------------------------------

  const tabs = Array.from(document.querySelectorAll(".settings-window__tab"));
  const panels = Array.from(document.querySelectorAll(".settings-window__panel"));
  const tabList = document.querySelector(".settings-window__nav");
  const compactNavigation = typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 560px)")
    : null;

  function syncTabOrientation(matches = compactNavigation?.matches === true) {
    tabList?.setAttribute("aria-orientation", matches ? "horizontal" : "vertical");
  }

  syncTabOrientation();
  compactNavigation?.addEventListener?.("change", (event) => syncTabOrientation(event.matches));

  function showTab(name, { moveFocus = false } = {}) {
    const activeTab = tabs.find((tab) => tab.dataset.tab === name) || tabs[0];
    if (!activeTab) return;

    tabs.forEach((tab) => {
      const active = tab === activeTab;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => {
      const active = panel.dataset.panel === activeTab.dataset.tab;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    if (moveFocus) activeTab.focus();
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
    tab.addEventListener("keydown", (event) => {
      const currentIndex = tabs.indexOf(tab);
      let targetIndex = currentIndex;

      const horizontal = tabList?.getAttribute("aria-orientation") === "horizontal";
      if ((horizontal && event.key === "ArrowLeft") || (!horizontal && event.key === "ArrowUp")) {
        targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if ((horizontal && event.key === "ArrowRight") || (!horizontal && event.key === "ArrowDown")) {
        targetIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === "Home") {
        targetIndex = 0;
      } else if (event.key === "End") {
        targetIndex = tabs.length - 1;
      } else if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      showTab(tabs[targetIndex].dataset.tab, { moveFocus: true });
    });
  });

  async function openMusicSurface(button, { successMessage, errorMessage, successTone = "info" }) {
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    setStatus("正在打开音乐面板…", "info");
    try {
      if (!bridge || typeof bridge.openMusicWindow !== "function") {
        throw new Error("music bridge unavailable");
      }
      const result = await bridge.openMusicWindow();
      if (!result || result.success !== true) {
        throw new Error(result?.error || "music window did not confirm success");
      }
      setStatus(successMessage, successTone);
      return result;
    } catch (_error) {
      setStatus(errorMessage, "error");
      return null;
    } finally {
      if (button) {
        button.disabled = false;
        button.setAttribute("aria-busy", "false");
      }
    }
  }

  const openMusicButton = document.getElementById("settings-open-music");
  const openQueueButton = document.getElementById("settings-open-queue");
  const openHistoryButton = document.getElementById("settings-open-history");

  openMusicButton?.addEventListener("click", () => openMusicSurface(openMusicButton, {
    successMessage: "音乐面板已打开。",
    errorMessage: "音乐面板打开失败。",
    successTone: "success",
  }));
  openQueueButton?.addEventListener("click", () => openMusicSurface(openQueueButton, {
    successMessage: "请在音乐面板中打开播放队列。",
    errorMessage: "音乐面板打开失败，请稍后重试。",
  }));
  openHistoryButton?.addEventListener("click", () => openMusicSurface(openHistoryButton, {
    successMessage: "请在音乐面板中打开播放历史。",
    errorMessage: "音乐面板打开失败，请稍后重试。",
  }));
  document.getElementById("settings-clear-history")?.addEventListener("click", async (event) => {
    if (!window.confirm("确定清空全部播放历史吗？")) return;
    const button = event.currentTarget;
    button.disabled = true;
    setStatus("正在清空播放历史…", "info");
    try {
      const result = bridge && typeof bridge.clearMusicHistory === "function"
        ? await bridge.clearMusicHistory().catch(() => null)
        : null;
      setStatus(result && result.success ? "播放历史已清空。" : "播放历史清空失败。", result && result.success ? "success" : "error");
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("settings-clear-chat-summary")?.addEventListener("click", async (event) => {
    if (!window.confirm("确定清空聊天摘要吗？")) return;
    const button = event.currentTarget;
    button.disabled = true;
    setStatus("正在清空聊天摘要…", "info");
    try {
      const result = bridge && typeof bridge.clearChatMemorySummary === "function"
        ? await bridge.clearChatMemorySummary().catch(() => null)
        : null;
      setStatus(result && result.success ? "聊天摘要已清空。" : "聊天摘要清空失败。", result && result.success ? "success" : "error");
    } finally {
      button.disabled = false;
    }
  });

  // ---- load + save helpers --------------------------------------------

  let cachedSettings = null;
  let lastSaveError = "";

  function clampInt(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  async function loadSettings() {
    if (!bridge || typeof bridge.getSettings !== "function") {
      setStatus("无法读取设置（bridge 不可用）", "error");
      return null;
    }
    try {
      const settings = await bridge.getSettings();
      cachedSettings = settings || {};
      return cachedSettings;
    } catch (error) {
      setStatus(`无法读取设置：${(error && error.message) || "未知错误"}`, "error");
      return null;
    }
  }

  async function saveSettings(patch) {
    lastSaveError = "";
    if (!bridge || typeof bridge.updateSettings !== "function") {
      lastSaveError = "bridge 不可用";
      return null;
    }
    try {
      const updated = await bridge.updateSettings(patch || {});
      cachedSettings = updated || cachedSettings;
      return updated;
    } catch (error) {
      lastSaveError = (error && error.message) || "未知错误";
      return null;
    }
  }

  async function saveWithFeedback(patch, {
    pendingMessage = "正在保存…",
    successMessage = "已保存",
    errorMessage = "保存失败",
  } = {}) {
    setStatus(pendingMessage, "info");
    const updated = await saveSettings(patch);
    setStatus(
      updated ? successMessage : `${errorMessage}${lastSaveError ? `：${lastSaveError}` : ""}`,
      updated ? "success" : "error",
    );
    return updated;
  }

  // ---- appearance tab -------------------------------------------------

  function bindSlider(inputId, valueId, key, min, max, fallback) {
    const input = document.getElementById(inputId);
    const valueEl = document.getElementById(valueId);
    if (!input) return;
    const apply = (raw) => {
      const n = clampInt(raw, fallback, min, max);
      if (valueEl) valueEl.textContent = `${n}%`;
      input.value = String(n);
      return n;
    };
    input.addEventListener("input", () => {
      apply(input.value);
    });
    input.addEventListener("change", async () => {
      const n = apply(input.value);
      await saveWithFeedback({ [key]: n });
    });
    return apply;
  }

  const applySize = bindSlider("settings-size", "settings-size-value", "sizePercent", 40, 200, 100);
  const applySpeed = bindSlider("settings-speed", "settings-speed-value", "speedPercent", 20, 200, 100);
  const applyOpacity = bindSlider("settings-opacity", "settings-opacity-value", "opacityPercent", 20, 100, 100);
  const lyricColorInput = document.getElementById("settings-lyric-color");
  const lyricColorValue = document.getElementById("settings-lyric-color-value");
  const lyricSizeInput = document.getElementById("settings-lyric-size");
  const lyricSizeValue = document.getElementById("settings-lyric-size-value");
  const controlSizeInput = document.getElementById("settings-control-size");
  const controlSizeValue = document.getElementById("settings-control-size-value");

  function normalizeLyricColor(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
      ? value.trim()
      : "#243044";
  }

  function currentLyricStylePatch(extra = {}) {
    const current = (cachedSettings && cachedSettings.musicLyricStyle) || {};
    return {
      musicLyricStyle: {
        color: normalizeLyricColor(lyricColorInput ? lyricColorInput.value : current.color),
        fontSize: clampInt(
          extra.fontSize ?? current.fontSize,
          12,
          10,
          22,
        ),
        controlSize: clampInt(
          extra.controlSize ?? current.controlSize,
          31,
          24,
          44,
        ),
        ...extra,
      },
    };
  }

  if (lyricColorInput) {
    lyricColorInput.addEventListener("input", () => {
      const color = normalizeLyricColor(lyricColorInput.value);
      lyricColorInput.value = color;
      if (lyricColorValue) lyricColorValue.textContent = color;
    });
    lyricColorInput.addEventListener("change", async () => {
      const color = normalizeLyricColor(lyricColorInput.value);
      if (lyricColorValue) lyricColorValue.textContent = color;
      await saveWithFeedback(currentLyricStylePatch({ color }));
    });
  }

  if (lyricSizeInput) {
    lyricSizeInput.addEventListener("input", () => {
      const fontSize = clampInt(lyricSizeInput.value, 12, 10, 22);
      lyricSizeInput.value = String(fontSize);
      if (lyricSizeValue) lyricSizeValue.textContent = `${fontSize}px`;
    });
    lyricSizeInput.addEventListener("change", async () => {
      const fontSize = clampInt(lyricSizeInput.value, 12, 10, 22);
      lyricSizeInput.value = String(fontSize);
      if (lyricSizeValue) lyricSizeValue.textContent = `${fontSize}px`;
      await saveWithFeedback(currentLyricStylePatch({ fontSize }));
    });
  }

  if (controlSizeInput) {
    controlSizeInput.addEventListener("input", () => {
      const controlSize = clampInt(controlSizeInput.value, 31, 24, 44);
      controlSizeInput.value = String(controlSize);
      if (controlSizeValue) controlSizeValue.textContent = `${controlSize}px`;
    });
    controlSizeInput.addEventListener("change", async () => {
      const controlSize = clampInt(controlSizeInput.value, 31, 24, 44);
      controlSizeInput.value = String(controlSize);
      if (controlSizeValue) controlSizeValue.textContent = `${controlSize}px`;
      await saveWithFeedback(currentLyricStylePatch({ controlSize }));
    });
  }

  // ---- focus tab ------------------------------------------------------

  function bindNumber(inputId, key, min, max, fallback) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const apply = (raw) => {
      const n = clampInt(raw, fallback, min, max);
      input.value = String(n);
      return n;
    };
    input.addEventListener("change", async () => {
      const n = apply(input.value);
      await saveWithFeedback({ [key]: n });
    });
    return apply;
  }

  const applyFocusMin = bindNumber("settings-focus-min", "focusDurationMinutes", 1, 180, 25);
  const applyBreakMin = bindNumber("settings-break-min", "breakDurationMinutes", 1, 60, 5);
  const applyLongBreakMin = bindNumber("settings-long-break-min", "longBreakDurationMinutes", 1, 120, 15);
  const applyFocusRounds = bindNumber("settings-focus-rounds", "focusRoundsBeforeLongBreak", 1, 12, 4);
  const focusTaskInput = document.getElementById("settings-focus-task");
  const recentTasksEl = document.getElementById("settings-focus-recent-tasks");
  const clockOpacityInput = document.getElementById("settings-clock-opacity");
  const clockOpacityValue = document.getElementById("settings-clock-opacity-value");
  const autoBehaviorInput = document.getElementById("settings-auto-behavior");
  const autoWalkInput = document.getElementById("settings-auto-walk");
  const mouseReactInput = document.getElementById("settings-mouse-react");
  const dailyGreetingInput = document.getElementById("settings-daily-greeting");
  const focusRecordsEl = document.getElementById("settings-focus-records");
  const focusRecordsClear = document.getElementById("settings-focus-records-clear");
  const focusNotificationsInput = document.getElementById("settings-focus-notifications");
  const focusSoundInput = document.getElementById("settings-focus-sound");
  const focusPetReactionsInput = document.getElementById("settings-focus-pet-reactions");
  const focusConfirmInterruptInput = document.getElementById("settings-focus-confirm-interrupt");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]));
  }

  function getRecentTaskNames(records) {
    const names = [];
    const items = Array.isArray(records) ? records : [];
    for (let index = items.length - 1; index >= 0 && names.length < 5; index -= 1) {
      const rawTask = typeof items[index]?.task === "string"
        ? items[index].task
        : items[index]?.taskName;
      const task = typeof rawTask === "string"
        ? rawTask.trim().slice(0, 60)
        : "";
      if (task && !names.includes(task)) names.push(task);
    }
    return names;
  }

  function renderRecentTasks(records) {
    if (!recentTasksEl) return;
    const names = getRecentTaskNames(records);
    recentTasksEl.innerHTML = names.map((task) => (
      `<button type="button" data-focus-task="${escapeHtml(task)}">${escapeHtml(task)}</button>`
    )).join("");
  }

  function renderFocusRecords(records) {
    if (!focusRecordsEl) return;
    const items = Array.isArray(records) ? records.slice().reverse().slice(0, 30) : [];
    focusRecordsEl.innerHTML = items.length
      ? items.map((record) => {
        const task = escapeHtml(record?.task || record?.taskName || "未命名任务");
        const date = escapeHtml(record?.date || record?.completedAt || "");
        const durationMs = Number.isFinite(Number(record?.actualDurationMs))
          ? Number(record.actualDurationMs)
          : Number(record?.focusDurationMs || 0);
        const minutes = Math.max(0, Math.round(durationMs / 60000));
        const result = record?.result === "interrupted"
          ? "中断"
          : record?.result === "skipped"
            ? "跳过"
            : record?.phase && record.phase !== "focus"
              ? "休息"
              : "完成";
        return `<li><strong>${task}</strong><span>${result} · ${date} · ${minutes} 分钟</span></li>`;
      }).join("")
      : '<li class="settings-window__records-empty">暂无专注记录</li>';
  }

  async function saveFocusTask(rawValue) {
    const task = String(rawValue || "").trim().slice(0, 60);
    if (focusTaskInput) focusTaskInput.value = task;
    const updated = await saveWithFeedback({ pendingTaskName: task });
    renderRecentTasks(updated?.focusRecords || cachedSettings?.focusRecords);
  }

  focusTaskInput?.addEventListener("change", () => saveFocusTask(focusTaskInput.value));
  focusTaskInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      focusTaskInput.blur();
    }
  });
  recentTasksEl?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-focus-task]");
    if (button) saveFocusTask(button.getAttribute("data-focus-task"));
  });
  const clockDisplayModeInput = document.getElementById("settings-clock-display-mode");
  const focusDisplayModeInput = document.getElementById("settings-focus-display-mode");
  const clockEnabledInput = document.getElementById("settings-clock-enabled");
  const focusIndicatorEnabledInput = document.getElementById("settings-focus-indicator-enabled");
  const petClickThroughInput = document.getElementById("settings-pet-click-through");
  const musicStatusClickThroughInput = document.getElementById("settings-music-status-click-through");
  const musicStatusOpacityInput = document.getElementById("settings-music-status-opacity");
  const musicStatusOpacityValue = document.getElementById("settings-music-status-opacity-value");
  const resetWidgetPositionsButton = document.getElementById("settings-reset-widget-positions");

  function normalizeWidgetDisplayMode(value) {
    return value === "music" || value === "hidden" ? value : "floating";
  }

  function bindSelect(input, key, normalize) {
    if (!input) return;
    input.addEventListener("change", async () => {
      const value = normalize(input.value);
      input.value = value;
      await saveWithFeedback({ [key]: value });
    });
  }

  function bindCheckbox(input, key) {
    if (!input) return;
    input.addEventListener("change", async () => {
      await saveWithFeedback({ [key]: input.checked });
    });
  }

  bindSelect(clockDisplayModeInput, "clockDisplayMode", normalizeWidgetDisplayMode);
  bindSelect(focusDisplayModeInput, "focusDisplayMode", normalizeWidgetDisplayMode);
  bindCheckbox(clockEnabledInput, "clockEnabled");
  bindCheckbox(focusIndicatorEnabledInput, "focusIndicatorEnabled");
  bindCheckbox(petClickThroughInput, "petClickThroughEnabled");
  bindCheckbox(musicStatusClickThroughInput, "musicStatusClickThroughEnabled");
  bindCheckbox(autoBehaviorInput, "autoBehaviorEnabled");
  bindCheckbox(autoWalkInput, "autoWalkEnabled");
  bindCheckbox(mouseReactInput, "mouseReactEnabled");
  bindCheckbox(dailyGreetingInput, "dailyGreetingEnabled");
  bindCheckbox(focusNotificationsInput, "focusNotificationsEnabled");
  bindCheckbox(focusSoundInput, "focusSoundEnabled");
  bindCheckbox(focusPetReactionsInput, "focusPetReactionsEnabled");
  bindCheckbox(focusConfirmInterruptInput, "focusConfirmInterrupt");

  if (clockOpacityInput) {
    const applyClockOpacity = (raw) => {
      const value = clampInt(raw, 100, 20, 100);
      clockOpacityInput.value = String(value);
      if (clockOpacityValue) clockOpacityValue.textContent = `${value}%`;
      return value;
    };
    clockOpacityInput.addEventListener("input", () => applyClockOpacity(clockOpacityInput.value));
    clockOpacityInput.addEventListener("change", async () => {
      const value = applyClockOpacity(clockOpacityInput.value);
      await saveWithFeedback({ clockOpacityPercent: value });
    });
  }

  resetWidgetPositionsButton?.addEventListener("click", async () => {
    await saveWithFeedback({
      musicPanelPosition: null,
      clockPosition: null,
      focusIndicatorPosition: null,
      musicStatusPosition: null,
    }, {
      pendingMessage: "正在重置组件位置…",
      successMessage: "组件位置已重置",
      errorMessage: "组件位置重置失败",
    });
  });

  focusRecordsClear?.addEventListener("click", async () => {
    if (!window.confirm("确定清空全部专注记录吗？")) return;
    const updated = await saveWithFeedback({ focusRecords: [] }, {
      pendingMessage: "正在清空专注记录…",
      successMessage: "专注记录已清空",
      errorMessage: "专注记录清空失败",
    });
    renderFocusRecords(updated?.focusRecords || []);
    renderRecentTasks(updated?.focusRecords || []);
  });

  if (musicStatusOpacityInput) {
    const applyMusicStatusOpacity = (raw) => {
      const value = clampInt(raw, 100, 20, 100);
      musicStatusOpacityInput.value = String(value);
      if (musicStatusOpacityValue) musicStatusOpacityValue.textContent = `${value}%`;
      return value;
    };
    musicStatusOpacityInput.addEventListener("input", () => {
      applyMusicStatusOpacity(musicStatusOpacityInput.value);
    });
    musicStatusOpacityInput.addEventListener("change", async () => {
      const value = applyMusicStatusOpacity(musicStatusOpacityInput.value);
      await saveWithFeedback({ musicStatusOpacityPercent: value });
    });
  }

  // ---- AI tab ---------------------------------------------------------

  const apiKeyInput = document.getElementById("settings-llm-apikey");
  const apiKeyToggle = document.getElementById("settings-llm-apikey-toggle");
  const modelInput = document.getElementById("settings-llm-model");
  const endpointInput = document.getElementById("settings-llm-endpoint");
  const promptInput = document.getElementById("settings-llm-prompt");
  const promptReset = document.getElementById("settings-llm-prompt-reset");
  const saveLlmButton = document.getElementById("settings-llm-save");

  const DEFAULT_LLM = {
    apiKey: "",
    model: "glm-4-flash",
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    systemPrompt: "",
  };

  if (apiKeyToggle && apiKeyInput) {
    apiKeyToggle.addEventListener("click", () => {
      apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
    });
  }

  if (promptReset && promptInput) {
    promptReset.addEventListener("click", () => {
      promptInput.value = "";
    });
  }

  if (saveLlmButton) {
    saveLlmButton.addEventListener("click", async () => {
      const model = (modelInput && modelInput.value ? modelInput.value : "").trim() || DEFAULT_LLM.model;
      const endpoint = (endpointInput.value || "").trim() || DEFAULT_LLM.endpoint;
      const systemPrompt = promptInput.value || "";
      // API key: trim, but preserve empty so the user can intentionally
      // clear it (in which case llm:chat will return missing-api-key).
      const apiKey = (apiKeyInput.value || "").trim();
      await saveWithFeedback({
        llm: { apiKey, model, endpoint, systemPrompt },
      }, {
        pendingMessage: "正在保存 AI 设置…",
        successMessage: "AI 设置已保存",
        errorMessage: "AI 设置保存失败",
      });
    });
  }

  // ---- initial populate ----------------------------------------------

  (async () => {
    const settings = await loadSettings();
    if (!settings) return;

    if (applySize) applySize(settings.sizePercent);
    if (applySpeed) applySpeed(settings.speedPercent);
    if (applyOpacity) applyOpacity(settings.opacityPercent);
    const lyricStyle = settings.musicLyricStyle || { color: "#243044", fontSize: 12, controlSize: 31 };
    const lyricColor = normalizeLyricColor(lyricStyle.color);
    const lyricFontSize = clampInt(lyricStyle.fontSize, 12, 10, 22);
    const controlSize = clampInt(lyricStyle.controlSize, 31, 24, 44);
    if (lyricColorInput) lyricColorInput.value = lyricColor;
    if (lyricColorValue) lyricColorValue.textContent = lyricColor;
    if (lyricSizeInput) lyricSizeInput.value = String(lyricFontSize);
    if (lyricSizeValue) lyricSizeValue.textContent = `${lyricFontSize}px`;
    if (controlSizeInput) controlSizeInput.value = String(controlSize);
    if (controlSizeValue) controlSizeValue.textContent = `${controlSize}px`;
    if (applyFocusMin) applyFocusMin(settings.focusDurationMinutes);
    if (applyBreakMin) applyBreakMin(settings.breakDurationMinutes);
    if (applyLongBreakMin) applyLongBreakMin(settings.longBreakDurationMinutes);
    if (applyFocusRounds) applyFocusRounds(settings.focusRoundsBeforeLongBreak);
    if (clockOpacityInput) {
      const opacity = clampInt(settings.clockOpacityPercent, 100, 20, 100);
      clockOpacityInput.value = String(opacity);
      if (clockOpacityValue) clockOpacityValue.textContent = `${opacity}%`;
    }
    if (focusTaskInput) focusTaskInput.value = typeof settings.pendingTaskName === "string"
      ? settings.pendingTaskName.slice(0, 60)
      : "";
    renderRecentTasks(settings.focusRecords);
    renderFocusRecords(settings.focusRecords);
    if (clockDisplayModeInput) clockDisplayModeInput.value = normalizeWidgetDisplayMode(settings.clockDisplayMode);
    if (focusDisplayModeInput) focusDisplayModeInput.value = normalizeWidgetDisplayMode(settings.focusDisplayMode);
    if (clockEnabledInput) clockEnabledInput.checked = settings.clockEnabled !== false;
    if (focusIndicatorEnabledInput) focusIndicatorEnabledInput.checked = settings.focusIndicatorEnabled !== false;
    if (focusNotificationsInput) focusNotificationsInput.checked = settings.focusNotificationsEnabled !== false;
    if (focusSoundInput) focusSoundInput.checked = settings.focusSoundEnabled === true;
    if (focusPetReactionsInput) focusPetReactionsInput.checked = settings.focusPetReactionsEnabled !== false;
    if (focusConfirmInterruptInput) focusConfirmInterruptInput.checked = settings.focusConfirmInterrupt !== false;
    if (petClickThroughInput) petClickThroughInput.checked = settings.petClickThroughEnabled === true;
    if (musicStatusClickThroughInput) musicStatusClickThroughInput.checked = settings.musicStatusClickThroughEnabled === true;
    if (musicStatusOpacityInput) {
      const opacity = clampInt(settings.musicStatusOpacityPercent, 100, 20, 100);
      musicStatusOpacityInput.value = String(opacity);
      if (musicStatusOpacityValue) musicStatusOpacityValue.textContent = `${opacity}%`;
    }
    if (autoBehaviorInput) autoBehaviorInput.checked = settings.autoBehaviorEnabled !== false;
    if (autoWalkInput) autoWalkInput.checked = settings.autoWalkEnabled !== false;
    if (mouseReactInput) mouseReactInput.checked = settings.mouseReactEnabled !== false;
    if (dailyGreetingInput) dailyGreetingInput.checked = settings.dailyGreetingEnabled !== false;

    const llm = settings.llm || DEFAULT_LLM;
    if (modelInput) modelInput.value = llm.model || DEFAULT_LLM.model;
    if (endpointInput) endpointInput.value = llm.endpoint || DEFAULT_LLM.endpoint;
    if (promptInput) promptInput.value = llm.systemPrompt || "";
    if (apiKeyInput) {
      // Always reflect the saved key in the (masked) input so the user
      // can decide whether to overwrite it.
      apiKeyInput.value = llm.apiKey || "";
    }
  })();
})();
