(function attachMusicStatusRuntime(root) {
  class MusicStatusRuntime {
    constructor({ audioPlayer, playbackService, onRender = () => {}, onCommand = () => {} } = {}) {
      this.audioPlayer = audioPlayer;
      this.playbackService = playbackService;
      this.onRender = onRender;
      this.onCommand = onCommand;
      this.state = {};
      this.unsubscribe = null;
      this.seeking = null;
    }
    start(initial = {}) {
      this.state = { ...this.state, ...initial };
      this.unsubscribe?.();
      this.unsubscribe = this.audioPlayer?.onStateChange?.((next) => {
        this.state = { ...this.state, ...next };
        if (!this.seeking) this.onRender(this.snapshot(), { patch: true });
      }) || null;
      this.onRender(this.snapshot(), { patch: false });
      return this.snapshot();
    }
    command(name, payload) { return this.onCommand(name, payload, this.snapshot()); }
    beginSeek({ duration, seconds }) { this.seeking = { duration: Number(duration) || 0, seconds: Number(seconds) || 0 }; return { ...this.seeking }; }
    seekPreview(seconds) { if (!this.seeking) return null; this.seeking.seconds = Math.max(0, Math.min(this.seeking.duration, Number(seconds) || 0)); this.onRender({ ...this.snapshot(), currentTime: this.seeking.seconds }, { patch: true, seeking: true }); return { ...this.seeking }; }
    async commitSeek() { if (!this.seeking) return null; const seconds = this.seeking.seconds; this.seeking = null; const result = await this.audioPlayer?.seek?.(seconds); this.state = { ...this.state, currentTime: seconds }; this.onRender(this.snapshot(), { patch: true }); return result; }
    snapshot() { return { ...this.state }; }
    destroy() { this.unsubscribe?.(); this.unsubscribe = null; this.seeking = null; }
  }
  const api = { MusicStatusRuntime };
  if (root) root.DeskpetMusicStatusRuntime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
