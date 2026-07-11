(function bootChat() {
  const form = document.querySelector("#chat-form");
  const log = document.querySelector("#chat-log");
  const input = document.querySelector("#chat-input");
  const sendButton = document.querySelector("#chat-send");
  const status = document.querySelector("#chat-status");
  const bubbleToggle = document.querySelector("#chat-bubble-toggle");
  const modeRememberedButton = document.querySelector("#chat-mode-remembered");
  const modeTemporaryButton = document.querySelector("#chat-mode-temporary");
  const modeStatus = document.querySelector("#chat-mode-status");
  const clearTemporaryButton = document.querySelector("#chat-clear-temporary");
  const clearRecentButton = document.querySelector("#chat-clear-recent");
  const clearAllButton = document.querySelector("#chat-clear-all-memory");
  const memorySummary = document.querySelector("#chat-memory-summary");
  const memorySummaryContent = document.querySelector("#chat-memory-summary-content");
  const memoryToggle = document.querySelector("#chat-memory-toggle");
  const memoryPanel = document.querySelector("#chat-memory-panel");
  const memoryQueryInput = document.querySelector("#chat-memory-query");
  const memoryCategorySelect = document.querySelector("#chat-memory-category");
  const memoryList = document.querySelector("#chat-memory-list");
  const memoryForm = document.querySelector("#chat-memory-form");
  const memoryNewCategory = document.querySelector("#chat-memory-new-category");
  const memoryNewContent = document.querySelector("#chat-memory-new-content");
  const memoryNewPinned = document.querySelector("#chat-memory-new-pinned");
  const clearSummaryButton = document.querySelector("#chat-clear-summary");
  const bridge = window.deskpet;

  if (!bridge || !form || !log || !input || !sendButton) {
    return;
  }

  let rememberedHistory = [];
  let temporaryHistory = [];
  let chatMode = "remembered";
  let inFlight = false;
  let memoryPanelOpen = false;
  let memoryEntries = [];
  let editingMemoryId = "";
  let memoryMutationInFlight = false;
  const BUBBLE_PREF_KEY = "deskpet.chat.showInBubble";

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function modeLabel(mode) {
    return mode === "temporary" ? "仅本窗口有效，关闭后清空" : "会保存并持续记住";
  }

  function currentHistory() {
    return chatMode === "temporary" ? temporaryHistory : rememberedHistory;
  }

  function clearLog() {
    log.innerHTML = "";
  }

  function renderEmptyHint() {
    const li = document.createElement("li");
    li.className = "chat-log__empty";
    li.textContent = chatMode === "temporary"
      ? "这是临时对话，不会写入记忆。"
      : "说点什么吧～ 我会陪你聊聊。";
    log.appendChild(li);
  }

  function renderMessage(role, content) {
    const li = document.createElement("li");
    li.className = `chat-message chat-message--${role}`;
    li.dataset.role = role;
    const author = role === "user" ? "你" : "桌宠";
    li.innerHTML =
      `<span class="chat-message__author">${escapeHtml(author)}</span>` +
      `<span class="chat-message__bubble">${escapeHtml(content)}</span>`;
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
    return li;
  }

  function renderHistory() {
    clearLog();
    const history = currentHistory();
    if (!history.length) {
      renderEmptyHint();
      return;
    }
    history.forEach((message) => {
      renderMessage(message.role, message.content);
    });
  }

  function renderTyping() {
    const li = document.createElement("li");
    li.className = "chat-message chat-message--assistant chat-message--typing";
    li.dataset.role = "assistant";
    li.innerHTML =
      '<span class="chat-message__author">桌宠</span>' +
      '<span class="chat-message__bubble">' +
        '<span class="chat-typing"><span class="chat-typing__dot"></span><span class="chat-typing__dot"></span><span class="chat-typing__dot"></span></span>' +
      "</span>";
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
    return li;
  }

  function setStatus(message, tone) {
    if (!status) return;
    status.textContent = message || "";
    if (tone) {
      status.dataset.tone = tone;
    } else {
      delete status.dataset.tone;
    }
  }

  function setSending(sending) {
    inFlight = sending;
    sendButton.disabled = sending;
    input.disabled = sending;
    sendButton.textContent = sending ? "发送中…" : "发送";
  }

  function setMemoryMutationBusy(busy) {
    memoryMutationInFlight = Boolean(busy);
    if (memoryPanel) {
      memoryPanel.classList.toggle("is-busy", memoryMutationInFlight);
      memoryPanel.setAttribute("aria-busy", memoryMutationInFlight ? "true" : "false");
    }
    if (memoryToggle) {
      memoryToggle.disabled = chatMode !== "remembered" || memoryMutationInFlight;
    }
  }

  function loadBubblePref() {
    try {
      return window.localStorage.getItem(BUBBLE_PREF_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }

  function saveBubblePref(enabled) {
    try {
      window.localStorage.setItem(BUBBLE_PREF_KEY, enabled ? "1" : "0");
    } catch (_error) {
      // localStorage may be unavailable. Non-fatal.
    }
  }

  function friendlyError(code) {
    switch (code) {
      case "missing-api-key":
        return "还没有配置 API key。请先在设置里填写。";
      case "auth-failed":
        return "认证失败 (401)：API key 可能已失效。";
      case "rate-limited":
        return "请求太频繁 (429)，稍等一下再试。";
      case "server-error":
        return "服务端暂时不可用，稍后再试。";
      case "network-error":
      case "request-timeout":
      case "ENOTFOUND":
        return "网络好像断开了。";
      case "empty-text":
        return "消息不能为空。";
      default:
        return `聊天失败（${code || "unknown"}）。`;
    }
  }

  function applyModeUi() {
    if (modeRememberedButton) {
      modeRememberedButton.classList.toggle("is-active", chatMode === "remembered");
    }
    if (modeTemporaryButton) {
      modeTemporaryButton.classList.toggle("is-active", chatMode === "temporary");
    }
    if (modeStatus) {
      modeStatus.textContent = modeLabel(chatMode);
    }
    if (clearTemporaryButton) {
      clearTemporaryButton.disabled = chatMode !== "temporary";
    }
    if (memoryToggle) {
      memoryToggle.disabled = chatMode !== "remembered" || memoryMutationInFlight;
    }
    if (chatMode !== "remembered") {
      setMemoryPanelOpen(false);
    }
  }

  async function refreshMemorySummary() {
    if (!memorySummaryContent || typeof bridge.getChatMemorySummary !== "function") {
      return;
    }
    const result = await bridge.getChatMemorySummary().catch(() => null);
    if (!(result && result.success && result.summary)) {
      memorySummaryContent.textContent = "暂无记忆";
      return;
    }
    const summary = result.summary;
    const lines = [];
    if (Array.isArray(summary.memories) && summary.memories.length) {
      lines.push(`已保存 ${summary.memories.length} 条长期记忆`);
    }
    if (summary.profile.relationshipTone) {
      lines.push(`关系语气：${summary.profile.relationshipTone}`);
    }
    if (summary.profile.preferences.length) {
      lines.push(`偏好：${summary.profile.preferences.join("、")}`);
    }
    if (summary.profile.facts.length) {
      lines.push(`事实：${summary.profile.facts.join("；")}`);
    }
    if (summary.profile.avoidances.length) {
      lines.push(`避免：${summary.profile.avoidances.join("、")}`);
    }
    if (summary.summary.conversation) {
      lines.push(`摘要：${summary.summary.conversation}`);
    }
    memorySummaryContent.textContent = lines.length ? lines.join("\n") : "暂无记忆";
  }

  function memoryCategoryLabel(category) {
    return {
      preference: "偏好",
      fact: "事实",
      avoidance: "避免",
      relationship: "关系",
    }[category] || "记忆";
  }

  function makeMemoryAction(icon, label, handler, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chat-memory-entry__action ${extraClass}`.trim();
    button.textContent = icon;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.addEventListener("click", handler);
    return button;
  }

  async function refreshMemoryViews() {
    await refreshMemorySummary();
    if (memoryPanelOpen) {
      await refreshMemories();
    }
  }

  async function applyMemoryMutation(action, successMessage) {
    if (memoryMutationInFlight) return null;
    setMemoryMutationBusy(true);
    try {
      const result = await action().catch(() => null);
      if (!(result && result.success)) {
        setStatus(friendlyError(result && result.error), "error");
        return null;
      }
      applyRememberedStateResult(result);
      await refreshMemoryViews();
      setStatus(successMessage, "info");
      return result;
    } finally {
      setMemoryMutationBusy(false);
    }
  }

  function renderMemoryEntry(memory) {
    const item = document.createElement("li");
    item.className = "chat-memory-entry";
    if (memory.pinned) {
      item.classList.add("is-pinned");
    }

    if (editingMemoryId === memory.id) {
      const form = document.createElement("form");
      form.className = "chat-memory-entry__edit";
      const category = document.createElement("select");
      ["preference", "fact", "avoidance", "relationship"].forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = memoryCategoryLabel(value);
        option.selected = value === memory.category;
        category.appendChild(option);
      });
      const content = document.createElement("input");
      content.type = "text";
      content.maxLength = 280;
      content.required = true;
      content.value = memory.content;
      content.setAttribute("aria-label", "编辑记忆内容");
      const pinLabel = document.createElement("label");
      pinLabel.className = "chat-memory-form__pin";
      const pin = document.createElement("input");
      pin.type = "checkbox";
      pin.checked = memory.pinned;
      pinLabel.append(pin, document.createTextNode(" 固定"));
      const save = document.createElement("button");
      save.type = "submit";
      save.textContent = "保存";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "取消";
      cancel.addEventListener("click", () => {
        editingMemoryId = "";
        refreshMemories().catch(() => {});
      });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const result = await applyMemoryMutation(
          () => bridge.updateChatMemory({ id: memory.id, category: category.value, content: content.value, pinned: pin.checked }),
          "记忆已更新。",
        );
        if (result) {
          editingMemoryId = "";
          await refreshMemories();
        }
      });
      form.append(category, content, pinLabel, save, cancel);
      item.appendChild(form);
      return item;
    }

    const main = document.createElement("div");
    main.className = "chat-memory-entry__main";
    const meta = document.createElement("span");
    meta.className = "chat-memory-entry__meta";
    meta.textContent = `${memory.pinned ? "已固定 · " : ""}${memoryCategoryLabel(memory.category)}`;
    const content = document.createElement("p");
    content.className = "chat-memory-entry__content";
    content.textContent = memory.content;
    main.append(meta, content);

    const actions = document.createElement("div");
    actions.className = "chat-memory-entry__actions";
    actions.append(
      makeMemoryAction(memory.pinned ? "★" : "☆", memory.pinned ? "取消固定" : "固定记忆", () => {
        applyMemoryMutation(
          () => bridge.updateChatMemory({ id: memory.id, pinned: !memory.pinned }),
          memory.pinned ? "已取消固定。" : "已固定这条记忆。",
        ).catch(() => {});
      }),
      makeMemoryAction("✎", "编辑记忆", () => {
        editingMemoryId = memory.id;
        refreshMemories().catch(() => {});
      }),
      makeMemoryAction("×", "删除记忆", () => {
        if (!window.confirm("删除这条长期记忆？")) return;
        applyMemoryMutation(
          () => bridge.deleteChatMemory(memory.id),
          "记忆已删除。",
        ).catch(() => {});
      }, "chat-memory-entry__action--danger"),
    );
    item.append(main, actions);
    return item;
  }

  async function refreshMemories() {
    if (!memoryList || typeof bridge.listChatMemories !== "function") {
      return;
    }
    const result = await bridge.listChatMemories({
      query: memoryQueryInput ? memoryQueryInput.value : "",
      category: memoryCategorySelect ? memoryCategorySelect.value : "",
    }).catch(() => null);
    memoryEntries = result && result.success && Array.isArray(result.memories) ? result.memories : [];
    memoryList.textContent = "";
    if (!memoryEntries.length) {
      const empty = document.createElement("li");
      empty.className = "chat-memory-list__empty";
      empty.textContent = "还没有符合条件的长期记忆。";
      memoryList.appendChild(empty);
      return;
    }
    memoryEntries.forEach((memory) => memoryList.appendChild(renderMemoryEntry(memory)));
  }

  function setMemoryPanelOpen(open) {
    memoryPanelOpen = Boolean(open) && chatMode === "remembered";
    if (memoryPanel) {
      memoryPanel.hidden = !memoryPanelOpen;
    }
    if (memoryToggle) {
      memoryToggle.setAttribute("aria-expanded", memoryPanelOpen ? "true" : "false");
    }
    if (memoryPanelOpen) {
      refreshMemories().catch(() => {});
    }
  }

  function applyRememberedStateResult(result) {
    if (!(result && result.success && result.state)) {
      return;
    }
    rememberedHistory = Array.isArray(result.state.recentMessages)
      ? result.state.recentMessages.map((message) => ({
        role: message.role,
        content: message.content,
      }))
      : [];
  }

  async function loadRememberedState() {
    if (typeof bridge.getChatState !== "function") {
      return;
    }
    const result = await bridge.getChatState().catch(() => null);
    applyRememberedStateResult(result);
    await refreshMemorySummary();
    if (chatMode === "remembered") {
      renderHistory();
    }
  }

  async function setChatMode(nextMode) {
    if (nextMode !== "remembered" && nextMode !== "temporary") {
      return;
    }
    const result = typeof bridge.setChatMode === "function"
      ? await bridge.setChatMode(nextMode).catch(() => null)
      : { success: true, mode: nextMode };
    if (!(result && result.success)) {
      setStatus("模式切换失败。", "error");
      return;
    }
    chatMode = result.mode || nextMode;
    applyModeUi();
    if (chatMode === "remembered") {
      await loadRememberedState();
    } else {
      renderHistory();
      setStatus("临时对话不会写入记忆。", "info");
    }
  }

  async function runSend() {
    if (inFlight) return;
    const text = input.value.replace(/\s+$/u, "").replace(/^\s+/u, "");
    if (!text) {
      setStatus("消息不能为空。", "info");
      return;
    }
    renderMessage("user", text);
    input.value = "";
    setStatus("正在想…", "info");
    setSending(true);
    const typingEl = renderTyping();
    try {
      const result = await bridge.sendChatMessage({
        mode: chatMode,
        text,
        temporaryMessages: temporaryHistory,
      });
      typingEl.remove();
      if (result && result.success && typeof result.content === "string") {
        if (chatMode === "temporary") {
          temporaryHistory = [
            ...temporaryHistory,
            { role: "user", content: text },
            { role: "assistant", content: result.content },
          ];
        } else {
          applyRememberedStateResult(result);
        }
        renderHistory();
        setStatus(
          chatMode === "remembered" && result.memoryUpdated === true ? "本次对话已更新记忆。" : "",
          result.memoryUpdated === true ? "info" : null,
        );
        if (bubbleToggle && bubbleToggle.checked) {
          bridge.showChatReplyInBubble(result.content).catch(() => {});
        }
        if (chatMode === "remembered") {
          await refreshMemoryViews();
        }
      } else {
        renderHistory();
        setStatus(friendlyError(result && result.error), "error");
      }
    } catch (error) {
      typingEl.remove();
      renderHistory();
      setStatus(`出错了：${(error && error.message) || "未知错误"}`, "error");
    } finally {
      setSending(false);
      input.focus();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    runSend();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      runSend();
    }
  });

  modeRememberedButton?.addEventListener("click", () => {
    setChatMode("remembered");
  });

  modeTemporaryButton?.addEventListener("click", () => {
    setChatMode("temporary");
  });

  clearTemporaryButton?.addEventListener("click", () => {
    temporaryHistory = [];
    if (chatMode === "temporary") {
      renderHistory();
    }
    setStatus("临时会话已清空。", "info");
  });

  clearRecentButton?.addEventListener("click", async () => {
    if (!window.confirm("确定清空短期记忆吗？长期记忆会保留。")) return;
    const result = await bridge.clearRecentChatMemory().catch(() => null);
    if (!(result && result.success)) {
      setStatus("清空短期记忆失败。", "error");
      return;
    }
    applyRememberedStateResult(result);
    await refreshMemoryViews();
    if (chatMode === "remembered") {
      renderHistory();
    }
    setStatus("已清空短期记忆。", "info");
  });

  clearAllButton?.addEventListener("click", async () => {
    if (!window.confirm("确定清空全部聊天记忆吗？此操作不可撤回。")) return;
    const result = await bridge.clearAllChatMemory().catch(() => null);
    if (!(result && result.success)) {
      setStatus("清空全部记忆失败。", "error");
      return;
    }
    applyRememberedStateResult(result);
    await refreshMemoryViews();
    if (chatMode === "remembered") {
      renderHistory();
    }
    setStatus("已清空全部记忆。", "info");
  });

  memorySummary?.addEventListener("toggle", () => {
    if (memorySummary.open) {
      refreshMemorySummary().catch(() => {});
    }
  });

  memoryToggle?.addEventListener("click", () => {
    setMemoryPanelOpen(!memoryPanelOpen);
  });

  memoryQueryInput?.addEventListener("input", () => {
    if (memoryPanelOpen) refreshMemories().catch(() => {});
  });

  memoryCategorySelect?.addEventListener("change", () => {
    if (memoryPanelOpen) refreshMemories().catch(() => {});
  });

  memoryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (chatMode !== "remembered" || !memoryNewCategory || !memoryNewContent || !memoryNewPinned) return;
    const result = await applyMemoryMutation(
      () => bridge.createChatMemory({
        category: memoryNewCategory.value,
        content: memoryNewContent.value,
        pinned: memoryNewPinned.checked,
      }),
      "已添加长期记忆。",
    );
    if (result) {
      memoryNewContent.value = "";
      memoryNewPinned.checked = false;
      memoryNewContent.focus();
    }
  });

  clearSummaryButton?.addEventListener("click", async () => {
    if (!window.confirm("清空对话摘要？长期记忆不会删除。")) return;
    await applyMemoryMutation(
      () => bridge.clearChatMemorySummary(),
      "对话摘要已清空。",
    );
  });

  if (bubbleToggle) {
    bubbleToggle.checked = loadBubblePref();
    bubbleToggle.addEventListener("change", () => {
      saveBubblePref(bubbleToggle.checked);
      setStatus(
        bubbleToggle.checked
          ? "已开启：回复也会显示在桌宠气泡里（最长 60 字）。"
          : "已关闭：回复仅在聊天窗口中显示。",
        "info",
      );
    });
  }

  applyModeUi();
  loadRememberedState().catch(() => {
    renderHistory();
  });
  input.focus();
})();
