(function attachPetInteractionRuntime(root) {
  class PetInteractionRuntime {
    constructor({ drag, petState, focusPetBridge, currentFocusSnapshot = () => ({}), resolveAction = (result) => result?.type, onTap = () => {} } = {}) {
      this.drag = drag;
      this.petState = petState;
      this.focusPetBridge = focusPetBridge;
      this.currentFocusSnapshot = currentFocusSnapshot;
      this.resolveAction = resolveAction;
      this.onTap = onTap;
      this.dragging = false;
    }
    pointerDown(event) { return this.drag?.pointerDown?.(event); }
    pointerMove(event) {
      const result = this.drag?.pointerMove?.(event) || {};
      if (result.type === "drag-start" && !this.dragging) { this.dragging = true; this.focusPetBridge?.beginDrag?.(); }
      return result;
    }
    pointerUp(event) {
      const result = this.drag?.pointerUp?.(event) || {};
      const action = this.resolveAction(result);
      if (this.dragging || result.type === "drag-end") { this.dragging = false; this.focusPetBridge?.endDrag?.(this.currentFocusSnapshot()); return result; }
      if (action === "tap") { const feedback = this.petState?.interact?.("tap"); if (feedback) { this.onTap(feedback); this.focusPetBridge?.requestInteraction?.({ action: feedback.action }); } }
      return result;
    }
    cancel() { this.dragging = false; }
  }
  const api = { PetInteractionRuntime };
  if (root) root.DeskpetPetInteractionRuntime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
