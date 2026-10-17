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

    // TUX-051: remember the last pointer so a touch or pen press is told apart from a mouse press.
    // MouseEvents (synthetic or compat) carry no pointerType, so the recorded pointerdown decides.
    // Window capture runs before the touch-to-mouse bridge's document-capture listener (ui-touch.js).
    // TODO(TUX-008): route collapse/expand through the pane-state controller once it lands.
    let lastDown = null;
    window.addEventListener('pointerdown', (e) => {
      lastDown = { type: e.pointerType, target: e.target, t: performance.now() };
    }, { capture: true, passive: true });
    const TOUCH_WINDOW_MS = 1000;
    const slopPx = () => {
      const c = G.Vectura?.UI_CONSTANTS?.TOUCH_GESTURE;
      const v = Number(c && c.touchDragSlopPx);
      return Number.isFinite(v) && v >= 0 ? v : 6;
    };

    const startDrag = (e) => {
      const isTouch = !!lastDown
        && (performance.now() - lastDown.t) < TOUCH_WINDOW_MS
        && (lastDown.type === 'touch' || lastDown.type === 'pen');
      // WebKit retargets the compat mousedown of a nearby tap onto the resizer: ignore it.
      if (isTouch && !(lastDown.target instanceof Node && resizer.contains(lastDown.target))) return;
      e.preventDefault();
      const startY = e.clientY;
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
        const dy = ev.clientY - startY;
        if (!engaged) {
          if (Math.abs(dy) < slopPx()) return;
          engage();
        }
        const next = Math.max(minHeight, Math.min(maxHeight, startHeight - dy));
        document.documentElement.style.setProperty('--bottom-pane-height', `${next}px`);
        lastHeight = next;
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (!engaged) return; // a touch tap that never passed the slop changes nothing
        resizer.classList.remove('active');
        SETTINGS.bottomPaneHeight = Math.round(lastHeight);
        SETTINGS.bottomPaneCollapsed = false;
        this.app?.persistPreferencesDebounced?.();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    resizer.addEventListener('mousedown', startDrag);
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
