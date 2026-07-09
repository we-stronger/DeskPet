const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

function loadAudioPlayer(windowObject = {}) {
  const modulePath = path.join(__dirname, "..", "src", "renderer", "audio-player.js");
  delete require.cache[require.resolve(modulePath)];
  global.window = windowObject;
  global.globalThis = windowObject;
  require(modulePath);
  return windowObject.DeskpetAudioPlayer;
}

test("audio player plays a URL through the provided Audio constructor", async () => {
  const instances = [];
  class FakeAudio {
    constructor(url) {
      this.url = url;
      this.preload = "";
      instances.push(this);
    }
    play() {
      this.played = true;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }

  const player = loadAudioPlayer({ Audio: FakeAudio });
  const result = await player.playUrl("https://example.com/song.mp3");

  assert.equal(result.success, true);
  assert.equal(result.method, "audio");
  assert.equal(instances.length, 1);
  assert.equal(instances[0].url, "https://example.com/song.mp3");
  assert.equal(instances[0].preload, "auto");
  assert.equal(instances[0].played, true);
});

test("audio player pauses the previous song before starting the next one", async () => {
  const instances = [];
  class FakeAudio {
    constructor(url) {
      this.url = url;
      instances.push(this);
    }
    play() {
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }

  const player = loadAudioPlayer({ Audio: FakeAudio });
  await player.playUrl("https://example.com/one.mp3");
  await player.playUrl("https://example.com/two.mp3");

  assert.equal(instances[0].paused, true);
  assert.equal(instances[1].paused, undefined);
  assert.equal(player.getCurrentSource(), "https://example.com/two.mp3");
});

test("audio player toggles pause and resume for the current source", async () => {
  class FakeAudio {
    constructor(url) {
      this.url = url;
      this.paused = true;
    }
    play() {
      this.paused = false;
      this.playCalls = (this.playCalls || 0) + 1;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
      this.pauseCalls = (this.pauseCalls || 0) + 1;
    }
  }

  const player = loadAudioPlayer({ Audio: FakeAudio });
  await player.playUrl("https://example.com/song.mp3");

  const paused = await player.togglePlayPause();
  assert.equal(paused.playing, false);

  const resumed = await player.togglePlayPause();
  assert.equal(resumed.playing, true);
  assert.equal(player.getState().playing, true);
});

test("audio player exposes the current lyric line from LRC timestamps", async () => {
  const listeners = {};
  class FakeAudio {
    constructor(url) {
      this.url = url;
      this.currentTime = 0;
      listeners.audio = this;
    }
    addEventListener(name, listener) {
      listeners[name] = listener;
    }
    play() {
      return Promise.resolve();
    }
    pause() {}
  }

  const player = loadAudioPlayer({ Audio: FakeAudio });
  await player.playUrl("https://example.com/song.mp3", {
    lyric: "[00:01.00]first line\n[00:03.50]second line",
    tlyric: "[00:01.00]第一句\n[00:03.50]第二句",
  });

  listeners.audio.currentTime = 1.2;
  listeners.timeupdate();
  assert.deepEqual(player.getState().currentLyric, {
    time: 1,
    text: "first line",
    translation: "第一句",
  });

  listeners.audio.currentTime = 3.8;
  listeners.timeupdate();
  assert.deepEqual(player.getState().currentLyric, {
    time: 3.5,
    text: "second line",
    translation: "第二句",
  });
});

test("audio player notifies subscribers when lyric progress changes", async () => {
  const audioListeners = {};
  let instance = null;
  class FakeAudio {
    constructor() {
      this.currentTime = 0;
      instance = this;
    }
    addEventListener(name, listener) {
      audioListeners[name] = listener;
    }
    play() {
      return Promise.resolve();
    }
    pause() {}
  }

  const player = loadAudioPlayer({ Audio: FakeAudio });
  const states = [];
  const unsubscribe = player.onStateChange((state) => states.push(state));
  await player.playUrl("https://example.com/song.mp3", {
    title: "Song",
    lyric: "[00:02.00]line",
  });

  instance.currentTime = 2.1;
  audioListeners.timeupdate();
  unsubscribe();

  assert.equal(states.at(-1).currentLyric.text, "line");
  assert.equal(states.at(-1).meta.title, "Song");
});

test("audio player marks natural song end separately from pause", async () => {
  const audioListeners = {};
  class FakeAudio {
    addEventListener(name, listener) {
      audioListeners[name] = listener;
    }
    play() {
      return Promise.resolve();
    }
    pause() {}
  }

  const player = loadAudioPlayer({ Audio: FakeAudio });
  const states = [];
  player.onStateChange((state) => states.push(state));
  await player.playUrl("https://example.com/song.mp3");

  audioListeners.ended();

  assert.equal(states.at(-1).playing, false);
  assert.equal(states.at(-1).ended, true);
});

test("audio player logs playback failures without exposing the source URL", async () => {
  const warnings = [];
  class FakeAudio {
    constructor(url) {
      this.url = url;
    }
    play() {
      return Promise.reject(new Error("failed to load because no supported source was found"));
    }
    pause() {}
  }

  const player = loadAudioPlayer({
    Audio: FakeAudio,
    console: { warn: (...args) => warnings.push(args) },
  });
  const result = await player.playUrl("https://example.com/private-song.mp3?authSecret=hidden");

  assert.equal(result.success, false);
  assert.equal(result.error, "failed to load because no supported source was found");
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /\[audio-player\] playUrl failed/);
  assert.doesNotMatch(JSON.stringify(warnings), /authSecret=hidden/);
});
