const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("chat window exposes remembered and temporary mode controls with memory actions", () => {
  const html = fs.readFileSync(path.join(root, "src", "renderer", "chat.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "src", "renderer", "styles", "chat.css"), "utf8");

  assert.match(html, /id="chat-mode-remembered"/);
  assert.match(html, /id="chat-mode-temporary"/);
  assert.match(html, /id="chat-mode-status"/);
  assert.match(html, /id="chat-clear-temporary"/);
  assert.match(html, /id="chat-clear-recent"/);
  assert.match(html, /id="chat-clear-all-memory"/);
  assert.match(html, /id="chat-memory-summary"/);
  assert.match(html, /id="chat-memory-toggle"/);
  assert.match(html, /id="chat-memory-panel"/);
  assert.match(html, /id="chat-memory-query"/);
  assert.match(html, /id="chat-memory-category"/);
  assert.match(html, /id="chat-memory-list"/);
  assert.match(html, /id="chat-memory-form"/);
  assert.match(html, /id="chat-clear-summary"/);
  assert.match(css, /\.chat-window__mode-switch/);
  assert.match(css, /\.chat-window__memory-actions/);
  assert.match(css, /\.chat-window__memory-summary/);
  assert.match(css, /\.chat-memory-panel/);
  assert.match(css, /\.chat-memory-entry/);
});

test("chat renderer keeps temporary history local and reloads remembered history from the bridge", () => {
  const source = fs.readFileSync(path.join(root, "src", "renderer", "chat.js"), "utf8");

  assert.match(source, /let rememberedHistory = \[\]/);
  assert.match(source, /let temporaryHistory = \[\]/);
  assert.match(source, /let chatMode = "remembered"/);
  assert.match(source, /bridge\.getChatState\(/);
  assert.match(source, /bridge\.sendChatMessage\(/);
  assert.match(source, /bridge\.setChatMode\(/);
  assert.match(source, /temporaryMessages:\s*temporaryHistory/);
  assert.match(source, /rememberedHistory = Array\.isArray\(result\.state\.recentMessages\)/);
  assert.match(source, /temporaryHistory = \[\]/);
  assert.match(source, /bridge\.listChatMemories\(/);
  assert.match(source, /bridge\.createChatMemory\(/);
  assert.match(source, /bridge\.updateChatMemory\(/);
  assert.match(source, /bridge\.deleteChatMemory\(/);
  assert.match(source, /bridge\.clearChatMemorySummary\(/);
  assert.match(source, /window\.confirm\(/);
  assert.match(source, /function setMemoryMutationBusy\(busy\)/);
  assert.match(source, /setMemoryMutationBusy\(true\)/);
  assert.match(source, /setMemoryMutationBusy\(false\)/);
});

test("preload and main expose the remembered chat IPC bridge", () => {
  const preload = fs.readFileSync(path.join(root, "src", "preload.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");

  assert.match(preload, /getChatState\(\)\s*{\s*return ipcRenderer\.invoke\("chat:get-state"\)/);
  assert.match(preload, /setChatMode\(mode\)\s*{\s*return ipcRenderer\.invoke\("chat:set-mode"/);
  assert.match(preload, /sendChatMessage\(payload\)\s*{\s*return ipcRenderer\.invoke\("chat:send"/);
  assert.match(preload, /clearRecentChatMemory\(\)\s*{\s*return ipcRenderer\.invoke\("chat:clear-recent"\)/);
  assert.match(preload, /clearAllChatMemory\(\)\s*{\s*return ipcRenderer\.invoke\("chat:clear-all"\)/);
  assert.match(preload, /getChatMemorySummary\(\)\s*{\s*return ipcRenderer\.invoke\("chat:get-memory-summary"\)/);
  assert.match(preload, /listChatMemories\(options\)\s*{\s*return ipcRenderer\.invoke\("chat:list-memories"/);
  assert.match(preload, /createChatMemory\(payload\)\s*{\s*return ipcRenderer\.invoke\("chat:create-memory"/);
  assert.match(preload, /updateChatMemory\(payload\)\s*{\s*return ipcRenderer\.invoke\("chat:update-memory"/);
  assert.match(preload, /deleteChatMemory\(id\)\s*{\s*return ipcRenderer\.invoke\("chat:delete-memory"/);
  assert.match(preload, /clearChatMemorySummary\(\)\s*{\s*return ipcRenderer\.invoke\("chat:clear-summary"/);

  assert.match(main, /ipcMain\.handle\("chat:get-state"/);
  assert.match(main, /ipcMain\.handle\("chat:set-mode"/);
  assert.match(main, /ipcMain\.handle\("chat:send"/);
  assert.match(main, /ipcMain\.handle\("chat:clear-recent"/);
  assert.match(main, /ipcMain\.handle\("chat:clear-all"/);
  assert.match(main, /ipcMain\.handle\("chat:get-memory-summary"/);
  assert.match(main, /ipcMain\.handle\("chat:list-memories"/);
  assert.match(main, /ipcMain\.handle\("chat:create-memory"/);
  assert.match(main, /ipcMain\.handle\("chat:update-memory"/);
  assert.match(main, /ipcMain\.handle\("chat:delete-memory"/);
  assert.match(main, /ipcMain\.handle\("chat:clear-summary"/);
  assert.match(main, /memories: Array\.isArray\(payload\.memories\) \? payload\.memories : null/);
});
