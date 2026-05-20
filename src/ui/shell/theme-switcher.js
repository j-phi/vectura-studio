/**
 * Vectura theme-switcher (Phase 2 step 3 first extraction from src/ui/ui.js).
 *
 * Exposes window.Vectura.UI.ThemeSwitcher — currently just refreshThemeUi(),
 * lifted verbatim from the legacy `class UI` IIFE. The legacy UI prototype's
 * refreshThemeUi() is now a thin delegator that calls into this module.
 *
 * This is the simplest shell module — chosen first per the plan's recommended
 * approach to validate the same `bind(deps)` DI pattern that algo-config-panel
 * proved in Phase 2 step 2 before batching the remaining shell modules. The
 * theme toggle button wiring (themeToggle.onclick → app.toggleTheme) stays in
 * legacy ui.js for now — it will move when the rest of the shell extracts in
 * subsequent step 3 work.
 *
 * Scroll restoration helpers (captureLeftPanelScrollPosition, scrollLayerToTop)
 * stay on the legacy prototype; per §2.4 the plan routes them to persistence.js
 * (Phase 2 step 5), not to theme-switcher.
 *
 * Closure-captured legacy IIFE locals (getEl) are injected once via
 * ThemeSwitcher.bind(deps) from the legacy ui.js IIFE. SETTINGS comes from
 * window.Vectura, matching the legacy IIFE preamble destructure.
 *
 * The compile gate at tests/unit/theme-switcher-compile.test.js asserts the
 * module loads under JSDOM and exposes the contract surface — mirroring the
 * algo-config-panel and controls-registry compile gates.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = () => {
    if (!DEPS) {
      throw new Error('ThemeSwitcher.refreshThemeUi invoked before ThemeSwitcher.bind(deps) — load order broken');
    }
    return DEPS;
  };

  function refreshThemeUi() {
    const { getEl } = requireDeps();
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const THEMES = (G.Vectura && G.Vectura.THEMES) || {};
    const toggle = getEl('theme-toggle', { silent: true });
    const bgColorInput = getEl('inp-bg-color', { silent: true });
    const current = `${SETTINGS.uiTheme || 'dark'}`.toLowerCase();
    if (toggle) {
      const NEXT_LABEL = {
        dark: 'Switch to Lark theme',
        lark: 'Switch to Light theme',
        light: 'Switch to Dark theme',
      };
      const label = NEXT_LABEL[current] || NEXT_LABEL.dark;
      toggle.setAttribute('aria-pressed', current === 'light' ? 'true' : 'false');
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
      toggle.dataset.theme = current;
    }
    if (bgColorInput) bgColorInput.value = SETTINGS.bgColor || bgColorInput.value || '#ffffff';

    const activeFamily = (THEMES[current] && THEMES[current].family) || 'meridian';
    const familyModern = getEl('theme-family-modern', { silent: true });
    const familyClassic = getEl('theme-family-classic', { silent: true });
    [familyModern, familyClassic].forEach((btn) => {
      if (!btn) return;
      const isActive = btn.dataset.family === activeFamily;
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      btn.classList.toggle('is-active', isActive);
      btn.classList.toggle('active', isActive);
    });
  }

  /**
   * Meridian Unit 1.9b (2026-05-20): grouped installer for the
   * `#theme-toggle` button click handler. Previously inlined in
   * `_ui-legacy.js`'s `bindGlobal()`. Also calls `refreshThemeUi` once on
   * mount so the toggle reflects the persisted skin id at startup, matching
   * legacy ordering.
   */
  function bindThemeToggle() {
    const { getEl } = requireDeps();
    const themeToggle = getEl('theme-toggle', { silent: true });
    if (!themeToggle) return;
    this.refreshThemeUi();
    themeToggle.onclick = () => {
      this.app?.toggleTheme?.();
    };
  }

  UI.ThemeSwitcher = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps
     */
    bind(deps) {
      DEPS = deps;
    },
    refreshThemeUi,
    bindThemeToggle,
    installOn(proto) {
      proto.refreshThemeUi = function() { return refreshThemeUi.call(this); };
      proto.bindThemeToggle = function() { return bindThemeToggle.call(this); };
    },
  };
})();
