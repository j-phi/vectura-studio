/*
 * Vectura Studio — skin/skin-manager.js
 *
 * Single source of truth for "which skin is active and what file is loaded for it."
 * Activation is owned by `App.applyTheme()` (which writes cssVars/data-attrs already);
 * this module supplements applyTheme by:
 *   1. Swapping `<link id="active-skin">` href to the skin's per-skin palette CSS file.
 *   2. Toggling `data-skin-swapping="true"` for ~60 ms so transitions are suppressed
 *      while the new stylesheet streams in (prevents flash-of-half-styled content).
 *   3. Pushing `manifest.motion.*` and `manifest.paneLeftWidth` etc. to CSS vars.
 *   4. Dispatching `vectura:skin-change` after the swap is committed (one rAF later),
 *      so listeners (renderer cache, dial-wave halo color) can refresh.
 *
 * Skin manifests live at `window.Vectura.THEMES[id]`. SkinManager does not own the
 * registry — it reads from it. App.applyTheme remains the single mutator.
 *
 * Public API:
 *   window.Vectura.SkinManager.register(id, manifest)   — extend registry at runtime
 *   window.Vectura.SkinManager.activate(id, options)    — swap stylesheet + dispatch
 *   window.Vectura.SkinManager.getActive()              — last-activated skin id
 *   window.Vectura.SkinManager.list()                   — array of registered skin ids
 *   window.Vectura.SkinManager.get(id)                  — manifest for id
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  Vectura.THEMES = Vectura.THEMES || {};

  const REQUIRED_FIELDS = ['id', 'label', 'cssVars'];
  const SWAP_SUPPRESS_MS = 60;
  const LINK_ID = 'active-skin';
  let activeSkinId = null;

  const skinManifest = (theme) => (theme && typeof theme.manifest === 'object' && theme.manifest) || null;

  const validate = (id, manifest) => {
    if (!manifest || typeof manifest !== 'object') {
      throw new TypeError(`SkinManager.register: manifest required for "${id}"`);
    }
    if (manifest.id && manifest.id !== id) {
      throw new Error(`SkinManager.register: manifest.id "${manifest.id}" must match "${id}"`);
    }
    REQUIRED_FIELDS.forEach((field) => {
      if (!manifest[field]) {
        throw new Error(`SkinManager.register: missing required field "${field}" for skin "${id}"`);
      }
    });
  };

  const register = (id, manifest) => {
    if (Vectura.THEMES[id]) {
      throw new Error(`SkinManager.register: skin "${id}" already registered`);
    }
    validate(id, manifest);
    Vectura.THEMES[id] = Object.assign({}, manifest, { id });
    return Vectura.THEMES[id];
  };

  const get = (id) => Vectura.THEMES[id] || null;
  const list = () => Object.keys(Vectura.THEMES);
  const getActive = () => activeSkinId;

  const writeMotionVars = (root, motion) => {
    if (!motion || typeof motion !== 'object') return;
    const slug = (key) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    Object.entries(motion).forEach(([key, spec]) => {
      if (!spec || typeof spec !== 'object') return;
      const base = `--motion-${slug(key)}`;
      if (Number.isFinite(spec.dur)) root.style.setProperty(`${base}-dur`, `${spec.dur}ms`);
      if (typeof spec.ease === 'string' && spec.ease) root.style.setProperty(`${base}-ease`, spec.ease);
      if (Number.isFinite(spec.peak)) root.style.setProperty(`${base}-peak`, `${spec.peak}`);
      if (Number.isFinite(spec.dip)) root.style.setProperty(`${base}-dip`, `${spec.dip}`);
      if (Number.isFinite(spec.maxR)) root.style.setProperty(`${base}-max-r`, `${spec.maxR}`);
    });
  };

  const writeStructuralVars = (root, manifest) => {
    if (!manifest) return;
    if (Number.isFinite(manifest.paneLeftWidth)) root.style.setProperty('--pane-left-width', `${manifest.paneLeftWidth}px`);
    if (Number.isFinite(manifest.paneRightWidth)) root.style.setProperty('--pane-right-width', `${manifest.paneRightWidth}px`);
    if (Number.isFinite(manifest.bottomPaneHeight)) root.style.setProperty('--bottom-pane-height', `${manifest.bottomPaneHeight}px`);
    if (Number.isFinite(manifest.rowHeight)) root.style.setProperty('--row-height', `${manifest.rowHeight}px`);
    if (typeof manifest.fontUi === 'string' && manifest.fontUi) root.style.setProperty('--font-ui', manifest.fontUi);
    if (typeof manifest.fontMono === 'string' && manifest.fontMono) root.style.setProperty('--font-mono', manifest.fontMono);
  };

  const swapStylesheet = (theme) => {
    if (!theme || !theme.stylesheet) return false;
    const link = document.getElementById(LINK_ID);
    if (!link) return false;
    // Resolve to absolute so href comparison is reliable.
    const next = new URL(theme.stylesheet, document.baseURI).href;
    if (link.href === next) return false;
    link.setAttribute('href', theme.stylesheet);
    return true;
  };

  /**
   * Apply the side-effects that App.applyTheme delegates to us. App.applyTheme has
   * already pushed theme.cssVars to `:root` and set data-theme — we only handle the
   * skin-specific extras (stylesheet swap, motion/structural vars, swap-suppression
   * window, dispatch). Returns the manifest for chaining.
   */
  const activate = (id, options = {}) => {
    const theme = get(id);
    if (!theme) throw new Error(`SkinManager.activate: unknown skin "${id}"`);
    const root = document.documentElement;
    if (!root) return theme;

    const previous = activeSkinId;
    const isNoop = previous === id && !options.force;

    root.dataset.uiSkin = id;
    // Mirror data-theme during the deprecation window so existing CSS selectors keep matching.
    root.dataset.theme = id;

    const manifest = skinManifest(theme);
    writeStructuralVars(root, manifest);
    writeMotionVars(root, manifest && manifest.motion);

    const stylesheetWillSwap = swapStylesheet(theme);
    if (stylesheetWillSwap) {
      root.dataset.skinSwapping = 'true';
      window.setTimeout(() => {
        if (root.dataset.skinSwapping === 'true' && root.dataset.uiSkin === id) {
          delete root.dataset.skinSwapping;
        }
      }, SWAP_SUPPRESS_MS);
    }

    activeSkinId = id;
    if (isNoop) return theme;

    const reducedMotion = typeof matchMedia === 'function'
      ? !!matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    const dispatch = () => {
      // Guard: if the test runtime tore down JSDOM between rAF schedule and fire,
      // `document` reads as undefined here. Skip silently — there is nobody listening.
      if (typeof document === 'undefined' || !document || typeof document.dispatchEvent !== 'function') return;
      document.dispatchEvent(new CustomEvent('vectura:skin-change', {
        detail: {
          skinId: id,
          previousSkinId: previous,
          manifest: theme,
          colorScheme: theme.colorScheme || null,
          family: (manifest && manifest.family) || theme.family || null,
          reducedMotion,
        },
      }));
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(dispatch);
    } else {
      dispatch();
    }
    return theme;
  };

  Vectura.SkinManager = { register, activate, getActive, list, get };
})();
