/**
 * Vectura bottom-pane (Phase 2 step 3 sixth extraction from src/ui/ui.js).
 *
 * Exposes window.Vectura.UI.BottomPane — the bottom pane structural controls:
 * toggleSettingsPanel() (open/close), initBottomPaneToggle() (collapse toggle
 * button), and initBottomPaneResizer() (drag-to-resize).
 *
 * initSettingsValues() stays on the legacy prototype for now — it deeply
 * references this.refreshThemeUi(), this.getDocumentUnits(),
 * this.refreshDocumentUnitsUi(), and the IIFE-local getContrastTextColor().
 * It extracts in step 4 or step 5 when the full settings panel lands.
 *
 * Closure-captured legacy IIFE locals (getEl) are injected once via
 * BottomPane.bind(deps) from the legacy ui.js IIFE.
 *
 * Compile gate at tests/unit/bottom-pane-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`BottomPane.${name} invoked before BottomPane.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function toggleSettingsPanel(force) {
    const { getEl } = requireDeps('toggleSettingsPanel');
    const settingsPanel = getEl('settings-panel', { silent: true });
    if (!settingsPanel) return false;
    const nextOpen = typeof force === 'boolean' ? force : !settingsPanel.classList.contains('open');
    settingsPanel.classList.toggle('open', nextOpen);
    return true;
  }

  function initBottomPaneToggle() {
    const { getEl } = requireDeps('initBottomPaneToggle');
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const bottomPane = getEl('bottom-pane');
    const btn = getEl('btn-pane-toggle-bottom');
    const mobileBtn = getEl('btn-mobile-pane-bottom');
    if (!bottomPane || !btn) return;
    const toggleBottomPane = () => {
      bottomPane.classList.toggle('bottom-pane-collapsed');
      SETTINGS.bottomPaneCollapsed = bottomPane.classList.contains('bottom-pane-collapsed');
      this.app?.persistPreferencesDebounced?.();
    };
    btn.addEventListener('click', toggleBottomPane);
    if (mobileBtn) mobileBtn.addEventListener('click', toggleBottomPane);
  }

  function initBottomPaneResizer() {
    const { getEl } = requireDeps('initBottomPaneResizer');
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const resizer = getEl('bottom-resizer');
    const bottomPane = getEl('bottom-pane');
    if (!resizer || !bottomPane) return;
    const minHeight = 80;
    const maxHeight = 360;

    // Q27: Pointer Events with pointer capture. A touch or pen press waits for the slop before it
    // engages (TUX-051); a mouse press engages at once (desktop parity). pointercancel restores the
    // height and collapsed state the press started with.
    // TODO(TUX-008): route collapse/expand through the pane-state controller once it lands.
    let dragging = false;
    const slopPx = () => {
      const c = G.Vectura?.UI_CONSTANTS?.TOUCH_GESTURE;
      const v = Number(c && c.touchDragSlopPx);
      return Number.isFinite(v) && v >= 0 ? v : 6;
    };

    const startDrag = (e) => {
      if (dragging) return;
      dragging = true;
      const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
      e.preventDefault();
      const pointerId = e.pointerId;
      const startY = e.clientY;
      const wasCollapsed = bottomPane.classList.contains('bottom-pane-collapsed');
      const heightVarBefore = document.documentElement.style.getPropertyValue('--bottom-pane-height');
      try { resizer.setPointerCapture(pointerId); } catch (_) { /* pointer already gone */ }
      let engaged = !isTouch; // mouse: expand on press (desktop parity)
      let startHeight = 0;
      let lastHeight = 0;
      const engage = () => {
        engaged = true;
        resizer.classList.add('active');
        bottomPane.classList.remove('bottom-pane-collapsed');
        startHeight = bottomPane.getBoundingClientRect().height;
        lastHeight = startHeight;
      };
      if (engaged) engage();

      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return;
        const dy = ev.clientY - startY;
        if (!engaged) {
          if (Math.abs(dy) < slopPx()) return;
          engage();
        }
        const next = Math.max(minHeight, Math.min(maxHeight, startHeight - dy));
        document.documentElement.style.setProperty('--bottom-pane-height', `${next}px`);
        lastHeight = next;
      };
      const finish = (ev, cancelled) => {
        if (ev.pointerId !== pointerId) return;
        dragging = false;
        resizer.removeEventListener('pointermove', onMove);
        resizer.removeEventListener('pointerup', onUp);
        resizer.removeEventListener('pointercancel', onCancel);
        try { resizer.releasePointerCapture(pointerId); } catch (_) { /* already released */ }
        if (!engaged) return; // a touch tap that never passed the slop changes nothing
        resizer.classList.remove('active');
        if (cancelled) {
          if (heightVarBefore) document.documentElement.style.setProperty('--bottom-pane-height', heightVarBefore);
          else document.documentElement.style.removeProperty('--bottom-pane-height');
          bottomPane.classList.toggle('bottom-pane-collapsed', wasCollapsed);
          return;
        }
        SETTINGS.bottomPaneHeight = Math.round(lastHeight);
        SETTINGS.bottomPaneCollapsed = false;
        this.app?.persistPreferencesDebounced?.();
      };
      const onUp = (ev) => finish(ev, false);
      const onCancel = (ev) => finish(ev, true);
      resizer.addEventListener('pointermove', onMove);
      resizer.addEventListener('pointerup', onUp);
      resizer.addEventListener('pointercancel', onCancel);
    };

    // Chromium touch targeting: a touch on a bare 6 px bar goes to the nearest node that has a mouse/click
    // handler (the canvas) unless the bar has one too. pointerdown does not count. preventDefault() on
    // pointerdown suppresses the compat mouse events, so this handler never runs; it only marks the bar
    // as a touch target.
    resizer.addEventListener('mousedown', () => {});
    resizer.addEventListener('pointerdown', startDrag);
  }

  UI.BottomPane = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps
     */
    bind(deps) {
      DEPS = deps;
    },
    toggleSettingsPanel,
    initBottomPaneToggle,
    initBottomPaneResizer,
    installOn(proto) {
      proto.toggleSettingsPanel = function(...args) { return toggleSettingsPanel.apply(this, args); };
      proto.initBottomPaneToggle = function() { return initBottomPaneToggle.call(this); };
      proto.initBottomPaneResizer = function() { return initBottomPaneResizer.call(this); };
    },
  };
})();
