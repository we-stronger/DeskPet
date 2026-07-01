(function attachDragController(root) {
  class DragController {
    constructor({ threshold = 6 } = {}) {
      this.threshold = threshold;
      this.isPressed = false;
      this.isDragging = false;
      this.startX = 0;
      this.startY = 0;
      this.lastX = 0;
      this.lastY = 0;
    }

    pointerDown(event) {
      this.isPressed = true;
      this.isDragging = false;
      this.startX = event.screenX;
      this.startY = event.screenY;
      this.lastX = event.screenX;
      this.lastY = event.screenY;
      return { type: "press" };
    }

    pointerMove(event) {
      if (!this.isPressed) {
        return { type: "idle" };
      }

      const dxFromStart = event.screenX - this.startX;
      const dyFromStart = event.screenY - this.startY;
      const distance = Math.hypot(dxFromStart, dyFromStart);

      if (!this.isDragging && distance < this.threshold) {
        return { type: "pending" };
      }

      const dx = event.screenX - this.lastX;
      const dy = event.screenY - this.lastY;
      this.lastX = event.screenX;
      this.lastY = event.screenY;

      if (!this.isDragging) {
        this.isDragging = true;
        return { type: "drag-start", dx, dy };
      }

      return { type: "drag-move", dx, dy };
    }

    pointerUp() {
      if (!this.isPressed) {
        return { type: "idle" };
      }

      const wasDragging = this.isDragging;
      this.isPressed = false;
      this.isDragging = false;

      return { type: wasDragging ? "drag-end" : "click" };
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { DragController };
  }
  root.DragController = DragController;
})(typeof window !== "undefined" ? window : globalThis);
