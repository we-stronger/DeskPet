// Small reusable drag handler for in-pet widgets (music panel, clock).
// Listens to pointerdown on `handle` (default: `element` itself),
// then attaches pointermove / pointerup to `window` so the drag
// follows the cursor even when the pointer leaves the handle.
//
// We deliberately do NOT use setPointerCapture here. Capture routes
// the pointerup to the captured element, which breaks click event
// generation for child elements (e.g. the close button inside the
// panel header): the browser sees pointerdown on the close button
// and pointerup on the captured header, decides they're different
// targets, and skips the click event entirely. Window-level
// listeners keep pointerup on the original target so click events
// still fire normally.
//
// Important: this does NOT mutate element.style. Callers update the
// element's position (CSS transform / left / top) in onMove / onEnd —
// the helper only reads getBoundingClientRect to figure out deltas.
// That keeps the helper agnostic to how the caller wants to position
// the widget (transform vs. absolute left/top).
(function attachWidgetDrag(root) {
  function attachWidgetDrag(element, options = {}) {
    if (!element || typeof element.addEventListener !== "function") {
      return function detach() {};
    }
    const {
      handle = element,
      threshold = 4,
      onStart,
      onMove,
      onEnd,
      // Tests inject a fake window so they can drive pointermove /
      // pointerup without standing up jsdom. In the renderer this
      // falls back to the real global window.
      win = (typeof window !== "undefined" ? window : null),
    } = options;

    let activePointer = null;
    let startClientX = 0;
    let startClientY = 0;
    let baseX = 0;
    let baseY = 0;
    // Last position reported via onMove. We keep this in sync during
    // the drag so finishDrag can report the final top-left even if
    // the caller never wrote it back to the DOM (e.g. they clamped
    // the position and never updated style.left).
    let lastX = 0;
    let lastY = 0;
    let didDrag = false;

    function parentRect() {
      const parent = element.parentElement;
      if (!parent) return { left: 0, top: 0 };
      return parent.getBoundingClientRect();
    }

    function currentOffset() {
      const rect = element.getBoundingClientRect();
      const pr = parentRect();
      return { x: rect.left - pr.left, y: rect.top - pr.top };
    }

    function onWindowPointerMove(event) {
      if (activePointer === null || event.pointerId !== activePointer) return;
      const dx = event.clientX - startClientX;
      const dy = event.clientY - startClientY;
      if (!didDrag && Math.hypot(dx, dy) < threshold) return;
      if (!didDrag && typeof onStart === "function") onStart();
      didDrag = true;
      lastX = baseX + dx;
      lastY = baseY + dy;
      if (typeof onMove === "function") onMove({ x: lastX, y: lastY, dx, dy });
    }

    function onWindowPointerUp(event) {
      if (activePointer === null || event.pointerId !== activePointer) return;
      const finishedId = activePointer;
      activePointer = null;
      win.removeEventListener("pointermove", onWindowPointerMove);
      win.removeEventListener("pointerup", onWindowPointerUp);
      win.removeEventListener("pointercancel", onWindowPointerUp);
      if (didDrag) {
        // Prevent the click that would otherwise follow pointerup on
        // a drag-released handle from re-triggering button actions.
        // The preventDefault must happen on the pointerup itself;
        // we already removed the capture-free concern above.
        event.preventDefault();
        event.stopPropagation();
        if (typeof onEnd === "function") onEnd({ x: lastX, y: lastY });
      }
    }

    function onPointerDown(event) {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      activePointer = event.pointerId;
      startClientX = event.clientX;
      startClientY = event.clientY;
      const base = currentOffset();
      baseX = base.x;
      baseY = base.y;
      lastX = base.x;
      lastY = base.y;
      didDrag = false;
      // Window-level listeners (NOT setPointerCapture) so child
      // buttons inside the handle still get their click events when
      // the user just clicks them.
      win.addEventListener("pointermove", onWindowPointerMove);
      win.addEventListener("pointerup", onWindowPointerUp);
      win.addEventListener("pointercancel", onWindowPointerUp);
      // Stop the pet's #stage pointerdown from also kicking off a pet
      // drag (which would move the BrowserWindow) while the user is
      // dragging an in-pet widget.
      event.stopPropagation();
    }

    handle.addEventListener("pointerdown", onPointerDown);

    return function detach() {
      handle.removeEventListener("pointerdown", onPointerDown);
      win.removeEventListener("pointermove", onWindowPointerMove);
      win.removeEventListener("pointerup", onWindowPointerUp);
      win.removeEventListener("pointercancel", onWindowPointerUp);
    };
  }

  const api = { attachWidgetDrag };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetWidgetDrag = api;
})(typeof window !== "undefined" ? window : globalThis);
