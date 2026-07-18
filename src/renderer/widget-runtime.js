(function attachWidgetRuntime(root) {
  const widgetState = typeof require === "function"
    ? require("./widget-state")
    : root.DeskpetWidgetState;
  const coordination = typeof require === "function"
    ? require("./widget-coordination")
    : root.DeskpetWidgetCoordination;

  const noop = () => {};

  function normalizeTimer(callback, fallback) {
    const timer = typeof callback === "function" ? callback : fallback;
    // Browser timer functions require Window as their receiver. Wrapping also
    // keeps injected timer functions from being invoked as WidgetRuntime methods.
    return (...args) => timer(...args);
  }

  class WidgetRuntime {
    constructor({
      elements = {},
      dragApi = root.DeskpetWidgetDrag,
      coordinationApi = coordination,
      runtimeStyle = null,
      onPersist = noop,
      onPolicyChange = noop,
      schedule = null,
      cancel = null,
      persistDelay = 120,
    } = {}) {
      this.elements = Object.entries(elements).reduce((result, [id, value]) => {
        const config = value && value.element ? value : { element: value };
        if (config.element) result[id] = { ...config, id };
        return result;
      }, {});
      this.dragApi = dragApi || null;
      this.coordinationApi = coordinationApi || null;
      this.runtimeStyle = runtimeStyle || null;
      this.onPersist = typeof onPersist === "function" ? onPersist : noop;
      this.onPolicyChange = typeof onPolicyChange === "function" ? onPolicyChange : noop;
      const timerRoot = root && typeof root.setTimeout === "function" ? root : globalThis;
      this.schedule = normalizeTimer(schedule, (...args) => timerRoot.setTimeout(...args));
      this.cancel = normalizeTimer(cancel, (...args) => timerRoot.clearTimeout(...args));
      this.persistDelay = persistDelay;
      this.states = {};
      this.detachers = [];
      this.persistTimer = null;
      this.layoutPositions = {};
      this.pinned = {};
      this.dirtyIds = new Set();
    }

    defaultsFor(id) {
      const config = this.elements[id] || {};
      return {
        id,
        visible: config.visible !== false,
        position: config.position || { x: 0, y: 0 },
        size: config.size || { width: 1, height: 1 },
        opacity: config.opacity === undefined ? 1 : config.opacity,
        alwaysOnTop: config.alwaysOnTop !== false,
        clickThrough: config.clickThrough === true,
        draggable: config.draggable !== false,
        displayMode: config.displayMode || "floating",
        priority: config.priority || 0,
      };
    }

    load(settings = {}) {
      const source = settings && typeof settings === "object" ? settings : {};
      const widgets = source.widgets && typeof source.widgets === "object" ? source.widgets : source;
      for (const id of Object.keys(this.elements)) {
        const defaults = this.defaultsFor(id);
        const raw = widgets[id] && typeof widgets[id] === "object" ? widgets[id] : {};
        this.pinned[id] = !!(raw.position && Number.isFinite(Number(raw.position.x)) && Number.isFinite(Number(raw.position.y)));
        this.states[id] = widgetState.normalizeWidgetState({ ...defaults, ...raw, id }, defaults);
        this.apply(id);
      }
      this.attachDrags();
      return this.snapshotAll();
    }

    update(id, partial = {}, { persist = true } = {}) {
      if (!this.elements[id]) return null;
      const current = this.states[id] || widgetState.normalizeWidgetState(this.defaultsFor(id));
      const next = {
        ...current,
        ...partial,
        id,
        position: { ...current.position, ...(partial.position || {}) },
        size: { ...current.size, ...(partial.size || {}) },
      };
      this.states[id] = widgetState.normalizeWidgetState(next, this.defaultsFor(id));
      const config = this.elements[id];
      if (partial.position && typeof config.clampPosition === "function") {
        this.states[id] = widgetState.normalizeWidgetState({
          ...this.states[id],
          position: config.clampPosition(this.states[id].position, this.states[id]),
        }, this.defaultsFor(id));
      }
      if (partial.position) this.pinned[id] = true;
      this.apply(id);
      if (persist) this.schedulePersist(id);
      return this.snapshot(id);
    }

    setDisplayMode(id, displayMode) { return this.update(id, { displayMode }); }
    setVisible(id, visible) { return this.update(id, { visible: visible === true }); }
    setOpacity(id, opacity) { return this.update(id, { opacity }); }
    setClickThrough(id, clickThrough) { return this.update(id, { clickThrough: clickThrough === true }); }

    layout({ stage } = {}) {
      if (!this.coordinationApi || typeof this.coordinationApi.resolveWidgetLayout !== "function") return {};
      this.layoutPositions = this.coordinationApi.resolveWidgetLayout({
        stage: stage || { width: 0, height: 0 },
        widgets: Object.values(this.states),
      });
      for (const [id, position] of Object.entries(this.layoutPositions)) this.apply(id, position);
      return { ...this.layoutPositions };
    }

    snapshot(id) {
      const state = this.states[id];
      if (!state) return null;
      return {
        ...state,
        position: { ...state.position },
        size: { ...state.size },
      };
    }

    snapshotAll() {
      return Object.keys(this.states).reduce((result, id) => {
        result[id] = this.snapshot(id);
        return result;
      }, {});
    }

    apply(id, position = null) {
      const state = this.states[id];
      const config = this.elements[id];
      const element = config && config.element;
      if (!state || !element) return;
      const effectivePosition = position || state.position;
      if (config.managePresentation !== false) {
        element.hidden = !state.visible || state.displayMode !== "floating";
        element.dataset.displayMode = state.displayMode;
        element.dataset.clickThrough = state.clickThrough ? "true" : "false";
        element.classList?.toggle("is-click-through", state.clickThrough);
        element.setAttribute?.("aria-disabled", state.clickThrough ? "true" : "false");
        this.onPolicyChange(id, this.snapshot(id));
      }
      const declarations = {};
      if (this.pinned[id]) {
        Object.assign(declarations, {
          left: `${effectivePosition.x}px`,
          top: `${effectivePosition.y}px`,
          right: "auto",
          bottom: "auto",
        });
      }
      if (config.applyOpacity !== false) declarations.opacity = String(state.opacity);
      if (this.pinned[id] && typeof config.toStylePosition === "function") {
        Object.assign(declarations, config.toStylePosition(effectivePosition, state, element) || {});
      }
      if (Object.keys(declarations).length) {
        this.runtimeStyle?.apply?.(element, `widget-${id}`, declarations);
      }
    }

    attachDrags() {
      if (!this.dragApi || typeof this.dragApi.attachWidgetDrag !== "function" || this.detachers.length) return;
      for (const [id, config] of Object.entries(this.elements)) {
        const element = config.element;
        if (!element) continue;
        const detach = this.dragApi.attachWidgetDrag(element, {
          handle: config.handle || element,
          threshold: config.threshold || 4,
          onStart: () => {
            if (this.states[id]?.draggable === false) return;
            element.classList?.add("is-dragging");
            config.onDragStart?.(this.snapshot(id));
          },
          onMove: (position) => {
            if (this.states[id]?.draggable === false) return;
            this.update(id, { position }, { persist: false });
          },
          onEnd: (position) => {
            if (this.states[id]?.draggable === false) return;
            element.classList?.remove("is-dragging");
            this.update(id, { position }, { persist: true });
            config.onDragEnd?.(this.snapshot(id));
          },
        });
        if (typeof detach === "function") this.detachers.push(detach);
      }
    }

    schedulePersist(id) {
      if (id) this.dirtyIds.add(id);
      if (this.persistTimer !== null) this.cancel(this.persistTimer);
      this.persistTimer = this.schedule(() => this.flushPersist(), this.persistDelay);
    }

    flushPersist() {
      if (this.persistTimer !== null) {
        this.cancel(this.persistTimer);
        this.persistTimer = null;
      }
      const dirtyIds = [...this.dirtyIds];
      this.dirtyIds.clear();
      this.onPersist({ widgets: this.snapshotAll() }, dirtyIds);
    }

    destroy() {
      for (const detach of this.detachers.splice(0)) detach();
      if (this.persistTimer !== null) this.cancel(this.persistTimer);
      this.persistTimer = null;
      this.dirtyIds.clear();
    }
  }

  const api = { WidgetRuntime };
  if (root) root.DeskpetWidgetRuntime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
