const assert = require("node:assert/strict");
const test = require("node:test");

const { dispatchPlaySong } = require("../src/play-song-dispatch");

function makeDeps(overrides = {}) {
  return {
    buildSongOrpheusTargets: (id) => [
      `orpheus://play?songid=${id}`,
      `orpheus://play?id=${id}`,
      `orpheus://song?id=${id}`,
    ],
    openNeteaseWithUrl: async () => ({ success: false, error: "not-set" }),
    ...overrides,
  };
}

test("rejects invalid ids without calling any opener", async () => {
  const calls = { openNeteaseWithUrl: 0, openExternal: 0 };
  const deps = makeDeps({
    openNeteaseWithUrl: async () => { calls.openNeteaseWithUrl++; return { success: false }; },
    openExternal: async () => { calls.openExternal++; },
  });
  const r = await dispatchPlaySong({}, deps);
  assert.equal(r.success, false);
  assert.equal(r.error, "invalid-id");
  assert.equal(calls.openNeteaseWithUrl, 0);
  assert.equal(calls.openExternal, 0);
});

test("routes to the first orpheus target that succeeds (silent path)", async () => {
  const calls = [];
  const deps = makeDeps({
    openNeteaseWithUrl: async (url, opts) => {
      calls.push({ url, opts });
      if (url.includes("play?")) {
        return { success: true, method: "spawn-webcmd-click", target: url };
      }
      return { success: false, error: "no-handler" };
    },
  });
  const r = await dispatchPlaySong("42", deps);
  assert.equal(r.success, true);
  assert.equal(r.method, "spawn-webcmd-click");
  assert.equal(r.songId, "42");
  // Only the first orpheus variant should have been tried (the
  // remaining ones short-circuit on success).
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "orpheus://play?songid=42");
  // Critical: silent=true so main uses NetEase's --webcmd client path.
  assert.equal(calls[0].opts.silent, true);
  // allowBareExe=false so we don't fall back to launching cloudmusic.exe
  // as a bare exe during the orpheus loop (that's a separate cold-start
  // path handled by the user explicitly requesting to open NetEase).
  assert.equal(calls[0].opts.allowBareExe, false);
});

test("keeps trying deep links when client automation cannot trigger playback", async () => {
  const calls = [];
  const deps = makeDeps({
    openNeteaseWithUrl: async (url, opts) => {
      calls.push({ url, opts });
      if (url.includes("play?id=")) {
        return { success: true, method: "spawn-webcmd-click", target: url };
      }
      return { success: false, error: "client-play-click-failed", target: url };
    },
  });
  const r = await dispatchPlaySong("42", deps);
  assert.equal(r.success, true);
  assert.equal(r.method, "spawn-webcmd-click");
  assert.deepEqual(calls.map((c) => c.url), [
    "orpheus://play?songid=42",
    "orpheus://play?id=42",
  ]);
});

test("walks through every orpheus variant before reporting client playback failure", async () => {
  const tried = [];
  const deps = makeDeps({
    openNeteaseWithUrl: async (url) => {
      tried.push(url);
      return { success: false, error: "no-handler" };
    },
    openExternal: async () => undefined,
  });
  const r = await dispatchPlaySong("7", deps);
  assert.equal(r.success, false);
  assert.equal(r.error, "client-play-failed");
  assert.equal(tried.length, 3, "should try all three orpheus variants");
  assert.deepEqual(r.details, ["no-handler", "no-handler", "no-handler"]);
});

test("does not open the web song page when every orpheus variant fails", async () => {
  const tried = [];
  let webOpened = false;
  const deps = makeDeps({
    openNeteaseWithUrl: async (url) => {
      tried.push(url);
      return { success: false, error: "no-handler" };
    },
    openExternal: async () => { webOpened = true; },
  });
  const r = await dispatchPlaySong("9", deps);
  assert.equal(r.success, false);
  assert.equal(r.error, "client-play-failed");
  assert.equal(tried.length, 3, "should have tried every variant before giving up");
  assert.deepEqual(r.details, ["no-handler", "no-handler", "no-handler"]);
  assert.equal(webOpened, false);
});

test("never falls back to the web URL when an orpheus variant succeeds (no browser popup)", async () => {
  // This is the user's exact complaint: previously, an orpheus call
  // would also trigger a browser-side scheme handler that popped a
  // browser window. With the silent path, an orpheus success short-
  // circuits and we never call openExternal.
  let webOpened = false;
  const deps = makeDeps({
    openNeteaseWithUrl: async () => ({ success: true, method: "spawn-webcmd-click", target: "orpheus://song?id=1" }),
    openExternal: async () => { webOpened = true; },
  });
  const r = await dispatchPlaySong("1", deps);
  assert.equal(r.success, true);
  assert.equal(r.method, "spawn-webcmd-click");
  assert.equal(webOpened, false, "web URL fallback must NOT run when an orpheus variant succeeds");
});

test("the silent flag is always passed to every orpheus call", async () => {
  const optsSeen = [];
  const deps = makeDeps({
    openNeteaseWithUrl: async (_url, opts) => {
      optsSeen.push(opts);
      return { success: false, error: "no-handler" };
    },
  });
  await dispatchPlaySong("5", deps);
  assert.equal(optsSeen.length, 3);
  for (const opts of optsSeen) {
    assert.equal(opts.silent, true, "every orpheus call must use silent:true");
    assert.equal(opts.allowBareExe, false, "every orpheus call must use allowBareExe:false");
  }
});

test("client-only playback never falls back to web when NetEase is unavailable", async () => {
  const calls = [];
  const deps = makeDeps({
    openNeteaseWithUrl: async (url) => {
      calls.push({ kind: "orpheus", url });
      return { success: false, error: "no-exe" };
    },
    openExternal: async (url) => {
      calls.push({ kind: "web", url });
    },
  });
  const r = await dispatchPlaySong("abc", deps);
  assert.equal(r.success, false);
  assert.equal(r.error, "client-play-failed");
  assert.equal(calls.length, 3);
  assert.equal(calls.slice(0, 3).every((c) => c.kind === "orpheus"), true);
});

test("the orpheus URL itself is NEVER passed to openExternal (no scheme-handler browser popup)", async () => {
  // The user's bug: shell.openExternal on the orpheus:// URL triggered
  // a browser tab. We must only call openExternal with the *web*
  // fallback URL (music.163.com), never with the orpheus:// URL.
  const orpheusUrlsPassedToBrowser = [];
  const deps = makeDeps({
    openNeteaseWithUrl: async () => ({ success: false, error: "no-exe" }),
    openExternal: async (url) => {
      if (url.startsWith("orpheus://")) {
        orpheusUrlsPassedToBrowser.push(url);
      }
    },
  });
  await dispatchPlaySong("42", deps);
  assert.deepEqual(orpheusUrlsPassedToBrowser, [], "orpheus:// URLs must never be opened via shell.openExternal");
});
