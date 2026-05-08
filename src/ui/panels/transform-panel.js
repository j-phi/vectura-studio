/**
 * Vectura transform panel (Phase 2 step 4 fourth panel extraction).
 *
 * Exposes window.Vectura.UI.TransformPanel — namespace anchor for the
 * position / scale / rotation / seed transform controls.
 *
 * The transform UI itself is rendered inline by AlgoConfigPanel.buildControls()
 * via the COMMON_CONTROLS preamble (the "Selection & Transform" accordion).
 * This panel exposes the supporting helpers that algo-config-panel and
 * layer-type-change paths call:
 *
 *   - getDefaultTransformForType(type, currentParams)
 *       Returns the canonical {seed,posX,posY,scaleX,scaleY,rotation} for an
 *       algorithm type, preserving the current seed if base lacks one.
 *   - storeLayerParams(layer)
 *       Snapshots non-transform params into layer.paramStates[layer.type]
 *       so a later type swap restores them.
 *   - restoreLayerParams(layer, nextType)
 *       Swaps the layer type, restoring stored params for the new type and
 *       carrying transform values forward.
 *
 * DI bag: { ALGO_DEFAULTS, TRANSFORM_KEYS, clone }.
 *
 * Compile gate at tests/unit/transform-panel-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`TransformPanel.${name} invoked before TransformPanel.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function getDefaultTransformForType(type, currentParams = {}) {
    const { ALGO_DEFAULTS } = requireDeps('getDefaultTransformForType');
    const base = ALGO_DEFAULTS[type] || {};
    const fallbackSeed = Number.isFinite(currentParams.seed) ? currentParams.seed : 1;
    return {
      seed: Number.isFinite(base.seed) ? base.seed : fallbackSeed,
      posX: Number.isFinite(base.posX) ? base.posX : 0,
      posY: Number.isFinite(base.posY) ? base.posY : 0,
      scaleX: Number.isFinite(base.scaleX) ? base.scaleX : 1,
      scaleY: Number.isFinite(base.scaleY) ? base.scaleY : 1,
      rotation: Number.isFinite(base.rotation) ? base.rotation : 0,
    };
  }

  function storeLayerParams(layer) {
    const { TRANSFORM_KEYS, clone } = requireDeps('storeLayerParams');
    if (!layer) return;
    if (!layer.paramStates) layer.paramStates = {};
    const next = { ...layer.params };
    TRANSFORM_KEYS.forEach((key) => delete next[key]);
    layer.paramStates[layer.type] = clone(next);
  }

  function restoreLayerParams(layer, nextType) {
    const { ALGO_DEFAULTS, clone } = requireDeps('restoreLayerParams');
    if (!layer) return;
    const base = ALGO_DEFAULTS[nextType] ? clone(ALGO_DEFAULTS[nextType]) : {};
    const stored = layer.paramStates?.[nextType] ? clone(layer.paramStates[nextType]) : null;
    const transform = this.getDefaultTransformForType(nextType, layer.params);
    layer.type = nextType;
    layer.params = { ...base, ...(stored || {}), ...transform };
    this.storeLayerParams(layer);
  }

  UI.TransformPanel = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps - { ALGO_DEFAULTS, TRANSFORM_KEYS, clone }
     */
    bind(deps) {
      DEPS = deps;
    },
    getDefaultTransformForType,
    storeLayerParams,
    restoreLayerParams,
  };
})();
