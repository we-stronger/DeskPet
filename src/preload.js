const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("deskpet", {
  moveBy(dx, dy) {
    return ipcRenderer.invoke("window:move-by", { dx, dy });
  },
  setSize(size) {
    return ipcRenderer.invoke("window:set-size", { size });
  },
  setPetShape(rect) {
    return ipcRenderer.invoke("pet:set-shape", { rect: rect || null });
  },
  setPetMouseEventsIgnored(ignored) {
    return ipcRenderer.invoke("pet:set-mouse-events-ignored", { ignored: ignored === true });
  },
  showMenu() {
    return ipcRenderer.invoke("pet:show-menu");
  },
  updateSettings(settings) {
    return ipcRenderer.invoke("settings:update", settings);
  },
  getSettings() {
    return ipcRenderer.invoke("settings:get");
  },
  searchMusic(keyword, limit = 20) {
    return ipcRenderer.invoke("music:search", { keyword, query: keyword, limit });
  },
  fetchSongUrl(id) {
    return ipcRenderer.invoke("music:fetch-song-url", { id });
  },
  openMusicSong(id) {
    return ipcRenderer.invoke("music:open-song", { id });
  },
  playSong(id) {
    return ipcRenderer.invoke("music:play-song", { id });
  },
  playAudioUrlInPet(payload) {
    return ipcRenderer.invoke("music:play-audio-url", payload || {});
  },
  webPlaySong(id) {
    return ipcRenderer.invoke("music:web-play-song", { id });
  },
  reportAudioHostResult(payload) {
    return ipcRenderer.invoke("music:audio-host-result", payload || {});
  },
  openInNetEase(url) {
    return ipcRenderer.invoke("music:open-in-netease", { url });
  },
  openSearchInNetEase(query) {
    return ipcRenderer.invoke("music:open-search-in-netease", { query });
  },
  getMusicSessionStatus() {
    return ipcRenderer.invoke("music:get-session-status");
  },
  getUserPlaylists(userId) {
    return ipcRenderer.invoke("music:get-user-playlists", userId ? { userId } : {});
  },
  getPlaylistDetail(playlistId) {
    return ipcRenderer.invoke("music:get-playlist-detail", { playlistId });
  },
  getProfile() {
    return ipcRenderer.invoke("music:get-profile");
  },
  logoutMusic() {
    return ipcRenderer.invoke("music:logout");
  },
  createNeteaseQrKey() {
    return ipcRenderer.invoke("music:qr-create-key");
  },
  createNeteaseQrImage(key) {
    return ipcRenderer.invoke("music:qr-create-image", { key });
  },
  checkNeteaseQr(key) {
    return ipcRenderer.invoke("music:qr-check", { key });
  },
  getDailyRecommend() {
    return ipcRenderer.invoke("music:get-daily-recommend");
  },
  getTopCharts() {
    return ipcRenderer.invoke("music:get-top-charts");
  },
  getSongLyric(id) {
    return ipcRenderer.invoke("music:get-lyric", { id });
  },
  getFmSong() {
    return ipcRenderer.invoke("music:get-fm-song");
  },
  manipulatePlaylistTracks(payload) {
    return ipcRenderer.invoke("music:playlist-tracks", payload || {});
  },
  likeSong(id, like = true) {
    return ipcRenderer.invoke("music:like-song", { id, like });
  },
  checkLikedSongs(ids) {
    return ipcRenderer.invoke("music:check-liked-songs", { ids: Array.isArray(ids) ? ids : [ids] });
  },
  getMusicPlaybackState() {
    return ipcRenderer.invoke("music:playback-state:get");
  },
  updateMusicPlaybackState(state) {
    return ipcRenderer.invoke("music:playback-state:update", state || {});
  },
  removeMusicHistoryItem(id) {
    return ipcRenderer.invoke("music:playback-history:remove", { id });
  },
  clearMusicHistory() {
    return ipcRenderer.invoke("music:playback-history:clear");
  },
  getIntelligenceList(payload) {
    return ipcRenderer.invoke("music:get-intelligence-list", payload || {});
  },
  trashFmSong(id) {
    return ipcRenderer.invoke("music:fm-trash", { id });
  },
  openMusicWindow() {
    return ipcRenderer.invoke("music:open-window");
  },
  controlMusic(action) {
    return ipcRenderer.invoke("music:control", { action });
  },
  openExternal(url) {
    return ipcRenderer.invoke("shell:open-external", { url });
  },
  findNetEaseExecutable() {
    return ipcRenderer.invoke("netease:find-exe");
  },
  testOpenNetEase(url, allowBareExe = true) {
    return ipcRenderer.invoke("netease:open-test", { url, allowBareExe });
  },
  chat(messages) {
    return ipcRenderer.invoke("llm:chat", { messages });
  },
  getChatState() {
    return ipcRenderer.invoke("chat:get-state");
  },
  setChatMode(mode) {
    return ipcRenderer.invoke("chat:set-mode", { mode });
  },
  sendChatMessage(payload) {
    return ipcRenderer.invoke("chat:send", payload || {});
  },
  clearRecentChatMemory() {
    return ipcRenderer.invoke("chat:clear-recent");
  },
  clearAllChatMemory() {
    return ipcRenderer.invoke("chat:clear-all");
  },
  getChatMemorySummary() {
    return ipcRenderer.invoke("chat:get-memory-summary");
  },
  listChatMemories(options) {
    return ipcRenderer.invoke("chat:list-memories", options || {});
  },
  createChatMemory(payload) {
    return ipcRenderer.invoke("chat:create-memory", payload || {});
  },
  updateChatMemory(payload) {
    return ipcRenderer.invoke("chat:update-memory", payload || {});
  },
  deleteChatMemory(id) {
    return ipcRenderer.invoke("chat:delete-memory", { id });
  },
  clearChatMemorySummary() {
    return ipcRenderer.invoke("chat:clear-summary");
  },
  showChatReplyInBubble(text) {
    return ipcRenderer.invoke("chat:bubble-show", { text });
  },
  onCommand(callback) {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("pet:command", listener);
    return () => ipcRenderer.off("pet:command", listener);
  },
  onMusicPlaybackStateChanged(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("music:playback-state-changed", listener);
    return () => ipcRenderer.off("music:playback-state-changed", listener);
  },
  close() {
    return ipcRenderer.invoke("window:close");
  },
});
