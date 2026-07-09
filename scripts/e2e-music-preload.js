// E2E fake preload. Replaces the production preload's contextBridge
// with an in-memory mock so the renderer's window.deskpet is always
// the fake bridge without needing IPC round-trips. This script runs
// before any other renderer script.

const noop = () => Promise.resolve(null);
const fakeQrImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
const SAMPLE_SONGS = [
  { id: 1, name: "晴天", artists: ["周杰伦"], album: "叶惠美", duration: 269000, playable: true },
  { id: 2, name: "七里香", artists: ["周杰伦"], album: "七里香", duration: 295000, playable: true },
];
const SAMPLE_PLAYLISTS = [
  { id: 100, name: "我喜欢的音乐", trackCount: 2, creator: "自己", coverImgUrl: "" },
  { id: 101, name: "默认歌单", trackCount: 50, creator: "网易云音乐", coverImgUrl: "https://example.com/c.jpg" },
];
const SAMPLE_PLAYLIST_DETAIL = {
  playlist: { id: 100, name: "我喜欢的音乐", trackCount: 2, creator: "自己", coverImgUrl: "" },
  songs: SAMPLE_SONGS,
};

let loggedIn = false;
let qrCheckCount = 0;
const openExternalCalls = [];

const api = {
  moveBy: noop,
  setSize: noop,
  setPetShape: noop,
  showMenu: noop,
  updateSettings: noop,

  searchMusic: () => Promise.resolve({ success: true, songs: SAMPLE_SONGS }),
  fetchSongUrl: (id) => Promise.resolve({ success: true, id, url: "https://example.com/test.mp3" }),
  playAudioUrlInPet: ({ songId }) => {
    openExternalCalls.push("audio-host:" + String(songId));
    return Promise.resolve({ success: true, method: "audio-host" });
  },
  openMusicSong: (id) => { openExternalCalls.push("song:" + String(id)); return Promise.resolve({ success: true, method: "web" }); },
  playSong: (id) => { openExternalCalls.push("play:" + String(id)); return Promise.resolve({ success: true, method: "running-instance" }); },
  openInNetEase: noop,
  openSearchInNetEase: noop,
  getMusicSessionStatus: () => Promise.resolve({ success: true, loggedIn }),
  getUserPlaylists: () => Promise.resolve(loggedIn
    ? { success: true, playlists: SAMPLE_PLAYLISTS }
    : { success: false, error: "not-logged-in", playlists: [] }),
  getPlaylistDetail: () => Promise.resolve(loggedIn
    ? { success: true, ...SAMPLE_PLAYLIST_DETAIL }
    : { success: false, error: "not-logged-in" }),
  getProfile: () => Promise.resolve(loggedIn
    ? { success: true, profile: { userId: 999, nickname: "测试昵称" } }
    : { success: false, error: "not-logged-in" }),
  logoutMusic: () => { loggedIn = false; return Promise.resolve({ success: true }); },

  createNeteaseQrKey: () => Promise.resolve({ success: true, key: "fake-key" }),
  createNeteaseQrImage: () => Promise.resolve({ success: true, qrUrl: fakeQrImg }),
  checkNeteaseQr: () => {
    qrCheckCount += 1;
    if (qrCheckCount < 2) return Promise.resolve({ success: true, status: "waiting-for-scan" });
    if (qrCheckCount === 2) return Promise.resolve({ success: true, status: "waiting-for-confirm" });
    loggedIn = true;
    return Promise.resolve({ success: true, status: "ok", cookie: "MUSIC_U=fake", persisted: true });
  },

  openExternal: (url) => { openExternalCalls.push("url:" + url); return Promise.resolve({ success: true }); },
  findNetEaseExecutable: noop,
  testOpenNetEase: noop,
  chat: () => Promise.resolve({ success: false }),
  showChatReplyInBubble: () => Promise.resolve({ success: true }),
  onCommand: (callback) => {
    api._cmd = callback;
    return () => { api._cmd = null; };
  },
  close: noop,
};

// Tiny contextBridge replacement that mirrors what the real preload does:
// - exposes `api` as window.deskpet
// - exposes the captured calls for E2E inspection
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("deskpet", api);
contextBridge.exposeInMainWorld("__e2eMusic", {
  getCalls: () => openExternalCalls.slice(),
  forceLoggedIn: (v) => { loggedIn = !!v; },
  resetQrCount: () => { qrCheckCount = 0; },
  // Simulate the main-process side-effect that fires after the real web-
  // login popup closes successfully: a "music:login-completed" command is
  // pushed to the renderer via the same onCommand channel.
  simulateLoginCompleted: () => {
    if (typeof api._cmd === "function") api._cmd("music:login-completed");
  },
  simulateLoginFailed: () => {
    if (typeof api._cmd === "function") api._cmd("music:login-failed");
  },
});
