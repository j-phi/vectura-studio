/**
 * Vectura noise-rack panel (Phase 2 step 4 third panel extraction).
 *
 * Exposes window.Vectura.UI.NoiseRackPanel — namespace anchor for the
 * noise parameter UI. The actual implementation lives at
 * src/ui/ui-noise-rack.js as a mixin attached to UI.prototype via
 * window.Vectura._UINoiseRackMixin (see ui.js IIFE bottom).
 *
 * Like AutoColorizePanel, this is a thin namespace contract for step 5
 * (orchestrator + persistence + shortcuts) and Phase 3+. The mixin file
 * stays where it is until step 5 dissolves it into this panel's bind() bag.
 *
 * The forwarded surface is the panel-rendering method `_buildNoiseRack`
 * plus a subset of the most-frequently-called ensureX / createX helpers.
 *
 * Compile gate at tests/unit/noise-rack-panel-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`NoiseRackPanel.${name} invoked before NoiseRackPanel.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  const mixin = () => G.Vectura?._UINoiseRackMixin || null;

  function _buildNoiseRack(target, opts) {
    requireDeps('_buildNoiseRack');
    const m = mixin();
    if (!m?._buildNoiseRack) return;
    return m._buildNoiseRack.call(this, target, opts);
  }

  function ensureWavetableNoises(layer) {
    requireDeps('ensureWavetableNoises');
    const m = mixin();
    if (!m?.ensureWavetableNoises) return;
    return m.ensureWavetableNoises.call(this, layer);
  }

  function ensureSpiralNoises(layer) {
    requireDeps('ensureSpiralNoises');
    const m = mixin();
    if (!m?.ensureSpiralNoises) return;
    return m.ensureSpiralNoises.call(this, layer);
  }

  function ensureRingsNoises(layer) {
    requireDeps('ensureRingsNoises');
    const m = mixin();
    if (!m?.ensureRingsNoises) return;
    return m.ensureRingsNoises.call(this, layer);
  }

  function ensureTopoNoises(layer) {
    requireDeps('ensureTopoNoises');
    const m = mixin();
    if (!m?.ensureTopoNoises) return;
    return m.ensureTopoNoises.call(this, layer);
  }

  function ensureFlowfieldNoises(layer) {
    requireDeps('ensureFlowfieldNoises');
    const m = mixin();
    if (!m?.ensureFlowfieldNoises) return;
    return m.ensureFlowfieldNoises.call(this, layer);
  }

  function ensureGridNoises(layer) {
    requireDeps('ensureGridNoises');
    const m = mixin();
    if (!m?.ensureGridNoises) return;
    return m.ensureGridNoises.call(this, layer);
  }

  function ensurePhyllaNoises(layer) {
    requireDeps('ensurePhyllaNoises');
    const m = mixin();
    if (!m?.ensurePhyllaNoises) return;
    return m.ensurePhyllaNoises.call(this, layer);
  }

  function ensurePetalisDriftNoises(layer) {
    requireDeps('ensurePetalisDriftNoises');
    const m = mixin();
    if (!m?.ensurePetalisDriftNoises) return;
    return m.ensurePetalisDriftNoises.call(this, layer);
  }

  UI.NoiseRackPanel = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Currently a sentinel bind — step 5 will move the real deps
     * (getEl, escapeHtml, attachKeyboardRangeNudge, formatValue, etc.)
     * out of ui-noise-rack.js into this DI bag.
     * @param {object} deps
     */
    bind(deps) {
      DEPS = deps || {};
    },
    _buildNoiseRack,
    ensureWavetableNoises,
    ensureSpiralNoises,
    ensureRingsNoises,
    ensureTopoNoises,
    ensureFlowfieldNoises,
    ensureGridNoises,
    ensurePhyllaNoises,
    ensurePetalisDriftNoises,
  };
})();
