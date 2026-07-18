const assert = require("node:assert/strict");
const test = require("node:test");
const { MusicStatusRuntime } = require("../src/renderer/music-status-runtime");

test("MusicStatusRuntime patches time updates and commits a seek without rebuilding controls", async () => {
  const renders = [];
  let listener;
  const audioPlayer = {
    getState: () => ({ currentTime: 10, duration: 100, playing: true, songId: "1" }),
    onStateChange: (callback) => { listener = callback; return () => { listener = null; }; },
    seek: (seconds) => { audioPlayer.seeked = seconds; },
  };
  const runtime = new MusicStatusRuntime({ audioPlayer, onRender: (state, options) => renders.push({ state, options }) });
  runtime.start({ title: "Track", lyric: "Line" });
  listener({ currentTime: 12, duration: 100, playing: true, songId: "1" });
  assert.equal(renders.at(-1).options.patch, true);
  runtime.beginSeek({ duration: 100, seconds: 20 });
  runtime.seekPreview(35);
  await runtime.commitSeek();
  assert.equal(audioPlayer.seeked, 35);
  assert.equal(runtime.snapshot().currentTime, 35);
  runtime.destroy();
  assert.equal(listener, null);
});
