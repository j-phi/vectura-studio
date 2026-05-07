/**
 * Vectura auto-colorize panel (Phase 2 step 4 second panel extraction).
 *
 * Exposes window.Vectura.UI.AutoColorizePanel — the namespace anchor for the
 * auto-colorization toggle and settings UI. The actual implementation already
 * lives at src/ui/ui-auto-colorize.js as a mixin attached to UI.prototype via
 * window.Vectura._UIAutoColorizeMixin (see ui.js IIFE bottom).
 *
 * This module establishes the panel namespace contract for step 5 (orchestrator
 * + persistence + shortcuts) and Phase 3+ refactors. Once the legacy mixin is
 * dissolved, the methods can move directly into AutoColorizePanel without any
 * call-site changes — the namespace registration is the durable contract.
 *
 * The bind(deps) DI bag is currently empty because all helpers
 * (clamp, getEl, SETTINGS) are already closed over inside ui-auto-colorize.js.
 * Step 5 will move that closure into this DI bag.
 *
 * Public methods (delegate to UI.prototype mixin via .call(this)):
 *   - initAutoColorizationPanel()
 *   - getAutoColorizationConfig()
 *   - getAutoColorizationTargets(scope)
 *   - applyAutoColorization(options)
 *
 * Compile gate at tests/unit/auto-colorize-panel-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`AutoColorizePanel.${name} invoked before AutoColorizePanel.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  // Each delegator forwards to the mixin method on UI.prototype, which is
  // wired via Object.assign(UI.prototype, window.Vectura._UIAutoColorizeMixin)
  // at the bottom of legacy ui.js. The .call(this) pattern preserves binding.
  function initAutoColorizationPanel() {
    requireDeps('initAutoColorizationPanel');
    const mixin = G.Vectura?._UIAutoColorizeMixin;
    if (!mixin?.initAutoColorizationPanel) return;
    return mixin.initAutoColorizationPanel.call(this);
  }

  function getAutoColorizationConfig() {
    requireDeps('getAutoColorizationConfig');
    const mixin = G.Vectura?._UIAutoColorizeMixin;
    if (!mixin?.getAutoColorizationConfig) return null;
    return mixin.getAutoColorizationConfig.call(this);
  }

  function getAutoColorizationTargets(scope) {
    requireDeps('getAutoColorizationTargets');
    const mixin = G.Vectura?._UIAutoColorizeMixin;
    if (!mixin?.getAutoColorizationTargets) return [];
    return mixin.getAutoColorizationTargets.call(this, scope);
  }

  function applyAutoColorization(options) {
    requireDeps('applyAutoColorization');
    const mixin = G.Vectura?._UIAutoColorizeMixin;
    if (!mixin?.applyAutoColorization) return;
    return mixin.applyAutoColorization.call(this, options);
  }

  UI.AutoColorizePanel = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * Currently DEPS is a sentinel (no real deps) — step 5 will move
     * SETTINGS / clamp / getEl into this bag when the mixin is dissolved.
     * @param {object} deps
     */
    bind(deps) {
      DEPS = deps || {};
    },
    initAutoColorizationPanel,
    getAutoColorizationConfig,
    getAutoColorizationTargets,
    applyAutoColorization,
  };
})();
