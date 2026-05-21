/**
 * Vectura pane-left (Phase 2 step 3 third extraction from src/ui/ui.js).
 *
 * Exposes window.Vectura.UI.PaneLeft — the left-panel collapsible-section
 * state management: getLeftSectionDefaults(), getLeftSectionMap(),
 * setLeftSectionCollapsed(), initLeftPanelSections(),
 * setAlgorithmTransformCollapsed(), initAlgorithmTransformSection(),
 * setAboutVisible(), initAboutSection().
 *
 * These methods manage the collapse/expand state of left-panel sections
 * (algorithm, algorithmConfiguration, algorithmTransform, algorithmAbout)
 * and persist the state via SETTINGS.uiSections → app.persistPreferencesDebounced.
 *
 * Per §2.4, captureLeftPanelScrollPosition() and scrollLayerToTop() stay on
 * the legacy prototype — they route to persistence.js in Phase 2 step 5.
 *
 * Closure-captured legacy IIFE locals (getEl) are injected once via
 * PaneLeft.bind(deps) from the legacy ui.js IIFE. SETTINGS comes from
 * window.Vectura.SETTINGS at call time (matching the legacy IIFE preamble
 * destructure). All functions are invoked via .call(this) from legacy
 * prototype delegators so `this` remains the UI instance — cross-method calls
 * (e.g. this.getLeftSectionDefaults()) round-trip through the prototype
 * delegators exactly as they did before extraction.
 *
 * Compile gate at tests/unit/pane-left-compile.test.js mirrors the
 * theme-switcher and menubar compile gates.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`PaneLeft.${name} invoked before PaneLeft.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function getLeftSectionDefaults() {
    return {
      algorithm: false,
      algorithmTransform: true,
      algorithmConfiguration: false,
    };
  }

  function getLeftSectionMap() {
    const { getEl } = requireDeps('getLeftSectionMap');
    return {
      algorithm: getEl('left-section-algorithm'),
      algorithmConfiguration: getEl('left-section-algorithm-configuration'),
    };
  }

  function setLeftSectionCollapsed(key, collapsed, options = {}) {
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const { persist = true } = options;
    if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
      SETTINGS.uiSections = { ...this.getLeftSectionDefaults() };
    }
    SETTINGS.uiSections[key] = Boolean(collapsed);
    const sectionMap = this.getLeftSectionMap();
    const section = sectionMap[key];
    if (!section) return;
    const body = section.querySelector('.left-panel-section-body');
    section.classList.toggle('collapsed', Boolean(collapsed));
    if (body) body.style.display = collapsed ? 'none' : '';
    const sectionHeader = section.querySelector('.left-panel-section-header');
    if (sectionHeader) sectionHeader.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (!persist) return;
    this.app.persistPreferencesDebounced?.();
  }

  function initLeftPanelSections() {
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const defaults = this.getLeftSectionDefaults();
    if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
      SETTINGS.uiSections = { ...defaults };
    } else {
      SETTINGS.uiSections = { ...defaults, ...SETTINGS.uiSections };
    }
    const sectionMap = this.getLeftSectionMap();
    Object.entries(sectionMap).forEach(([key, section]) => {
      if (!section) return;
      const header = section.querySelector('.left-panel-section-header');
      const collapsed = SETTINGS.uiSections[key] === true;
      this.setLeftSectionCollapsed(key, collapsed, { persist: false });
      if (!header) return;
      header.onclick = () => {
        const next = !section.classList.contains('collapsed');
        this.setLeftSectionCollapsed(key, next);
      };
    });
  }

  function setAlgorithmTransformCollapsed(collapsed, options = {}) {
    const { getEl } = requireDeps('setAlgorithmTransformCollapsed');
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const { persist = true } = options;
    if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
      SETTINGS.uiSections = { ...this.getLeftSectionDefaults() };
    }
    SETTINGS.uiSections.algorithmTransform = Boolean(collapsed);
    const section = getEl('algorithm-transform-section');
    if (!section) return;
    const body = getEl('algorithm-transform-body') || section.querySelector('.global-section-body');
    section.classList.toggle('collapsed', Boolean(collapsed));
    if (body) {
      // CSS-10: strip the `.is-hidden` initial-state utility class so an
      // explicit `style.display = ''` actually unhides the body. The class
      // declares `display: none !important`, which would otherwise win.
      body.classList.remove('is-hidden');
      body.style.display = collapsed ? 'none' : '';
    }
    const transformHeader = getEl('algorithm-transform-header');
    if (transformHeader) transformHeader.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (!persist) return;
    this.app.persistPreferencesDebounced?.();
  }

  function initAlgorithmTransformSection() {
    const { getEl } = requireDeps('initAlgorithmTransformSection');
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const section = getEl('algorithm-transform-section');
    const header = getEl('algorithm-transform-header');
    if (!section) return;
    const defaults = this.getLeftSectionDefaults();
    if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
      SETTINGS.uiSections = { ...defaults };
    } else {
      SETTINGS.uiSections = { ...defaults, ...SETTINGS.uiSections };
    }
    const collapsed = SETTINGS.uiSections.algorithmTransform !== false;
    this.setAlgorithmTransformCollapsed(collapsed, { persist: false });
    if (!header) return;
    header.onclick = () => {
      const next = !section.classList.contains('collapsed');
      this.setAlgorithmTransformCollapsed(next);
    };
  }

  function setAboutVisible(visible, options = {}) {
    const { getEl } = requireDeps('setAboutVisible');
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const { persist = true } = options;
    SETTINGS.aboutVisible = visible !== false;
    if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
      SETTINGS.uiSections = { ...this.getLeftSectionDefaults() };
    }
    SETTINGS.uiSections.algorithmAbout = SETTINGS.aboutVisible;
    const about = getEl('algo-about');
    if (about) about.style.display = SETTINGS.aboutVisible ? '' : 'none';
    if (!persist) return;
    this.app.persistPreferencesDebounced?.();
  }

  function initAboutSection() {
    const { getEl } = requireDeps('initAboutSection');
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const closeBtn = getEl('algo-about-close');
    const remembered =
      SETTINGS.uiSections &&
      typeof SETTINGS.uiSections === 'object' &&
      Object.prototype.hasOwnProperty.call(SETTINGS.uiSections, 'algorithmAbout')
        ? SETTINGS.uiSections.algorithmAbout
        : undefined;
    if (remembered !== undefined) {
      SETTINGS.aboutVisible = remembered !== false;
    } else if (SETTINGS.aboutVisible === undefined) {
      SETTINGS.aboutVisible = true;
    }
    this.setAboutVisible(SETTINGS.aboutVisible, { persist: false });
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setAboutVisible(false);
      };
    }
  }

  // `_showWelcomePanel` — pure DOM toggle on the left welcome panel.
  // No DEPS needed.
  function _showWelcomePanel(show) {
    const welcome = document.getElementById('left-welcome');
    const sections = document.querySelector('.left-panel-sections');
    if (welcome) welcome.style.display = show ? '' : 'none';
    if (sections) {
      // CSS-10: strip initial-state `.is-hidden` class so `style.display=''`
      // re-shows the panel (the class uses `!important`).
      sections.classList.remove('is-hidden');
      sections.style.display = show ? 'none' : '';
    }
    if (show) {
      const hasLayers = (this.app?.engine?.layers?.length ?? 0) > 0;
      const intro = document.getElementById('left-welcome-intro');
      const select = document.getElementById('left-welcome-select');
      if (intro) intro.style.display = hasLayers ? 'none' : '';
      if (select) {
        // CSS-10: same — strip `.is-hidden` before letting inline style govern.
        select.classList.remove('is-hidden');
        select.style.display = hasLayers ? '' : 'none';
      }
    }
  }

  UI.PaneLeft = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps
     */
    bind(deps) {
      DEPS = deps;
    },
    getLeftSectionDefaults,
    getLeftSectionMap,
    setLeftSectionCollapsed,
    initLeftPanelSections,
    setAlgorithmTransformCollapsed,
    initAlgorithmTransformSection,
    setAboutVisible,
    initAboutSection,
    _showWelcomePanel,
    installOn(proto) {
      proto.getLeftSectionDefaults = function() { return getLeftSectionDefaults.call(this); };
      proto.getLeftSectionMap = function() { return getLeftSectionMap.call(this); };
      proto.setLeftSectionCollapsed = function(...args) { return setLeftSectionCollapsed.apply(this, args); };
      proto.initLeftPanelSections = function() { return initLeftPanelSections.call(this); };
      proto.setAlgorithmTransformCollapsed = function(...args) { return setAlgorithmTransformCollapsed.apply(this, args); };
      proto.initAlgorithmTransformSection = function() { return initAlgorithmTransformSection.call(this); };
      proto.setAboutVisible = function(...args) { return setAboutVisible.apply(this, args); };
      proto.initAboutSection = function() { return initAboutSection.call(this); };
      proto._showWelcomePanel = function(show) { return _showWelcomePanel.call(this, show); };
    },
  };
})();
