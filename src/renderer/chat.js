(function bootChat() {
  const form = document.querySelector("#chat-form");
  const log = document.querySelector("#chat-log");
  const input = document.querySelector("#chat-input");
  const sendButton = document.querySelector("#chat-send");
  const status = document.querySelector("#chat-status");
  const bubbleToggle = document.querySelector("#chat-bubble-toggle");
  const bridge = window.deskpet;

  if (!bridge || !form || !log || !input || !sendButton) {
    return;
  }

  const history = []; // [{ role, content }] for the API call
  let inFlight = false;
  const BUBBLE_PREF_KEY = "deskpet.chat.showInBubble";

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clearEmptyHint() {
    const hint = log.querySelector(".chat-log__empty");
    if (hint) hint.remove();
  }

  function renderMessage(role, content) {
    clearEmptyHint();
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

  function renderTyping() {
    clearEmptyHint();
    const li = document.createElement("li");
    li.className = "chat-message chat-message--assistant chat-message--typing";
    li.dataset.role = "assistant";
    li.innerHTML =
      `<span class="chat-message__author">桌宠</span>` +
      `<span class="chat-message__bubble">` +
        `<span class="chat-typing"><span class="chat-typing__dot"></span><span class="chat-typing__dot"></span><span class="chat-typing__dot"></span></span>` +
      `</span>`;
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
      // localStorage may be unavailable (e.g. file:// + locked profile). Non-fatal.
    }
  }

  async function runSend() {
    if (inFlight) return;
    const text = input.value.replace(/\s+$/u, "").replace(/^\s+/u, "");
    if (!text) {
      setStatus("消息不能为空。", "info");
      return;
    }
    history.push({ role: "user", content: text });
    renderMessage("user", text);
    input.value = "";
    setStatus("正在想…", "info");
    setSending(true);
    const typingEl = renderTyping();
    try {
      const result = await bridge.chat(history.slice());
      typingEl.remove();
      if (result && result.success && typeof result.content === "string") {
        history.push({ role: "assistant", content: result.content });
        renderMessage("assistant", result.content);
        setStatus("", null);
        if (bubbleToggle && bubbleToggle.checked) {
          bridge.showChatReplyInBubble(result.content).catch(() => {});
        }
      } else {
        const error = (result && result.error) || "chat-failed";
        const friendly = friendlyError(error);
        setStatus(friendly, "error");
        // Pop the user message that didn't get a reply, so retries are clean.
        history.pop();
      }
    } catch (error) {
      typingEl.remove();
      setStatus(`出错了：${(error && error.message) || "未知错误"}`, "error");
      history.pop();
    } finally {
      setSending(false);
      input.focus();
    }
  }

  function friendlyError(code) {
    switch (code) {
      case "missing-api-key":
        return "还没有配置 API key。请右击桌宠 → 设置 → AI 设置 中填写 ZhipuAI API key 后重试。";
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
      case "empty-messages":
      case "invalid-messages":
        return "消息格式不对。";
      default:
        return `聊天失败（${code}）。`;
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

  input.focus();
})();
