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

  function setStatus(message, tone) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    if (tone) statusEl.dataset.tone = tone;
    else delete statusEl.dataset.tone;
    if (message && tone === "success") {
      setTimeout(() => {
        if (statusEl.textContent === message) statusEl.textContent = "";
      }, 1800);
    }
  }

  // ---- tab switching ---------------------------------------------------

  const tabs = Array.from(document.querySelectorAll(".settings-window__tab"));
  const panels = Array.from(document.querySelectorAll(".settings-window__panel"));

  function showTab(name) {
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    panels.forEach((panel) => {
      const active = panel.dataset.panel === name;
      panel.classList.toggle("is-active", active);
      if (active) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
  });

  // ---- load + save helpers --------------------------------------------

  let cachedSettings = null;

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
    const settings = await bridge.getSettings();
    cachedSettings = settings || {};
    return cachedSettings;
  }

  async function saveSettings(patch) {
    if (!bridge || typeof bridge.updateSettings !== "function") {
      setStatus("无法保存设置（bridge 不可用）", "error");
      return null;
    }
    try {
      const updated = await bridge.updateSettings(patch || {});
      cachedSettings = updated || cachedSettings;
      return updated;
    } catch (error) {
      setStatus(`保存失败：${(error && error.message) || "unknown"}`, "error");
      return null;
    }
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
      setStatus("正在保存…", "info");
      await saveSettings({ [key]: n });
      setStatus("已保存", "success");
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
      setStatus("正在保存...", "info");
      await saveSettings(currentLyricStylePatch({ color }));
      setStatus("已保存", "success");
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
      setStatus("正在保存...", "info");
      await saveSettings(currentLyricStylePatch({ fontSize }));
      setStatus("已保存", "success");
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
      setStatus("正在保存...", "info");
      await saveSettings(currentLyricStylePatch({ controlSize }));
      setStatus("已保存", "success");
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
      setStatus("正在保存…", "info");
      await saveSettings({ [key]: n });
      setStatus("已保存", "success");
    });
    return apply;
  }

  const applyFocusMin = bindNumber("settings-focus-min", "focusDurationMinutes", 1, 180, 25);
  const applyBreakMin = bindNumber("settings-break-min", "breakDurationMinutes", 1, 60, 5);
  const clockDisplayModeInput = document.getElementById("settings-clock-display-mode");
  const focusDisplayModeInput = document.getElementById("settings-focus-display-mode");
  const clockEnabledInput = document.getElementById("settings-clock-enabled");
  const focusIndicatorEnabledInput = document.getElementById("settings-focus-indicator-enabled");
  const petClickThroughInput = document.getElementById("settings-pet-click-through");
  const musicStatusClickThroughInput = document.getElementById("settings-music-status-click-through");
  const musicStatusOpacityInput = document.getElementById("settings-music-status-opacity");
  const musicStatusOpacityValue = document.getElementById("settings-music-status-opacity-value");

  function normalizeWidgetDisplayMode(value) {
    return value === "music" || value === "hidden" ? value : "floating";
  }

  function bindSelect(input, key, normalize) {
    if (!input) return;
    input.addEventListener("change", async () => {
      const value = normalize(input.value);
      input.value = value;
      setStatus("正在保存…", "info");
      await saveSettings({ [key]: value });
      setStatus("已保存", "success");
    });
  }

  function bindCheckbox(input, key) {
    if (!input) return;
    input.addEventListener("change", async () => {
      setStatus("正在保存…", "info");
      await saveSettings({ [key]: input.checked });
      setStatus("已保存", "success");
    });
  }

  bindSelect(clockDisplayModeInput, "clockDisplayMode", normalizeWidgetDisplayMode);
  bindSelect(focusDisplayModeInput, "focusDisplayMode", normalizeWidgetDisplayMode);
  bindCheckbox(clockEnabledInput, "clockEnabled");
  bindCheckbox(focusIndicatorEnabledInput, "focusIndicatorEnabled");
  bindCheckbox(petClickThroughInput, "petClickThroughEnabled");
  bindCheckbox(musicStatusClickThroughInput, "musicStatusClickThroughEnabled");

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
      setStatus("正在保存…", "info");
      await saveSettings({ musicStatusOpacityPercent: value });
      setStatus("已保存", "success");
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
      setStatus("正在保存 AI 设置…", "info");
      const updated = await saveSettings({
        llm: { apiKey, model, endpoint, systemPrompt },
      });
      if (updated) {
        setStatus("AI 设置已保存", "success");
      }
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
    if (clockDisplayModeInput) clockDisplayModeInput.value = normalizeWidgetDisplayMode(settings.clockDisplayMode);
    if (focusDisplayModeInput) focusDisplayModeInput.value = normalizeWidgetDisplayMode(settings.focusDisplayMode);
    if (clockEnabledInput) clockEnabledInput.checked = settings.clockEnabled !== false;
    if (focusIndicatorEnabledInput) focusIndicatorEnabledInput.checked = settings.focusIndicatorEnabled !== false;
    if (petClickThroughInput) petClickThroughInput.checked = settings.petClickThroughEnabled === true;
    if (musicStatusClickThroughInput) musicStatusClickThroughInput.checked = settings.musicStatusClickThroughEnabled === true;
    if (musicStatusOpacityInput) {
      const opacity = clampInt(settings.musicStatusOpacityPercent, 100, 20, 100);
      musicStatusOpacityInput.value = String(opacity);
      if (musicStatusOpacityValue) musicStatusOpacityValue.textContent = `${opacity}%`;
    }

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
