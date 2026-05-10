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

    const startDrag = (e) => {
      e.preventDefault();
      resizer.classList.add('active');
      bottomPane.classList.remove('bottom-pane-collapsed');
      const startY = e.clientY;
      const startHeight = bottomPane.getBoundingClientRect().height;
      let lastHeight = startHeight;

      const onMove = (ev) => {
        const dy = ev.clientY - startY;
        const next = Math.max(minHeight, Math.min(maxHeight, startHeight - dy));
        document.documentElement.style.setProperty('--bottom-pane-height', `${next}px`);
        lastHeight = next;
      };
      const onUp = () => {
        resizer.classList.remove('active');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
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
