/**
 * Vectura pane-right (Phase 2 step 3 fourth extraction from src/ui/ui.js).
 *
 * Exposes window.Vectura.UI.PaneRight — the right-pane structural
 * initialization: initRightPaneTabs() (tab switching between layers/pens
 * panels) and initPensSection() (collapsible pens section header).
 *
 * initPaletteControls() stays on the legacy prototype — it deeply references
 * pens-panel methods (getPaletteList, getActivePalette, applyPaletteToPens,
 * addPen) that extract into pens-panel.js in Phase 2 step 4.
 *
 * Closure-captured legacy IIFE locals (getEl) are injected once via
 * PaneRight.bind(deps) from the legacy ui.js IIFE. SETTINGS comes from
 * window.Vectura.SETTINGS at call time. All functions are invoked via
 * .call(this) from legacy prototype delegators so `this` remains the UI
 * instance.
 *
 * Compile gate at tests/unit/pane-right-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`PaneRight.${name} invoked before PaneRight.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function initRightPaneTabs() {
    const { getEl } = requireDeps('initRightPaneTabs');
    const tabs = Array.from(document.querySelectorAll('.right-pane-tab'));
    if (!tabs.length) return;
    const panels = {
      layers: getEl('right-tab-panel-layers', { silent: true }),
      pens: getEl('right-tab-panel-pens', { silent: true }),
    };
    const setActive = (key) => {
      tabs.forEach((tab) => {
        const isActive = tab.dataset.tab === key;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      Object.entries(panels).forEach(([id, panel]) => {
        if (!panel) return;
        panel.classList.toggle('hidden', id !== key);
      });
    };
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => setActive(tab.dataset.tab));
    });
    const initial = tabs.find((t) => t.classList.contains('active'))?.dataset.tab || 'layers';
    setActive(initial);
  }

  function initPensSection() {
    const { getEl } = requireDeps('initPensSection');
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const section = getEl('pens-global-section');
    const header = getEl('pens-section-header');
    const body = getEl('pens-section-body');
    if (!section || !header || !body) return;

    const setCollapsed = (next) => {
      SETTINGS.pensCollapsed = Boolean(next);
      section.classList.toggle('collapsed', Boolean(next));
      body.style.display = next ? 'none' : '';
      if (header) header.setAttribute('aria-expanded', next ? 'false' : 'true');
    };

    setCollapsed(SETTINGS.pensCollapsed === true);
    header.onclick = () => setCollapsed(!section.classList.contains('collapsed'));
  }

  UI.PaneRight = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps
     */
    bind(deps) {
      DEPS = deps;
    },
    initRightPaneTabs,
    initPensSection,
    installOn(proto) {
      proto.initRightPaneTabs = function() { return initRightPaneTabs.call(this); };
      proto.initPensSection = function() { return initPensSection.call(this); };
    },
  };
})();
