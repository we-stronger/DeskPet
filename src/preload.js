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
  showMenu() {
    return ipcRenderer.invoke("pet:show-menu");
  },
  updateSettings(settings) {
    return ipcRenderer.invoke("settings:update", settings);
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
  openMusicWindow() {
    return ipcRenderer.invoke("music:open-window");
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
  showChatReplyInBubble(text) {
    return ipcRenderer.invoke("chat:bubble-show", { text });
  },
  onCommand(callback) {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("pet:command", listener);
    return () => ipcRenderer.off("pet:command", listener);
  },
  close() {
    return ipcRenderer.invoke("window:close");
  },
});