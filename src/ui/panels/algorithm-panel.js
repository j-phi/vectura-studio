/**
 * Vectura algorithm panel (Phase 2 step 4 eighth panel extraction).
 *
 * Exposes window.Vectura.UI.AlgorithmPanel — the algorithm-selector
 * dispatch / layer-type predicate helpers. Distinct from
 * AlgoConfigPanel (which renders the dynamic-controls container) and
 * Header (which builds the dropdown <select>).
 *
 * Methods lifted verbatim from class UI:
 *   - syncPrimaryModuleDropdown  (re-populate dropdown when layer changes)
 *   - isModifierType             (predicate: type is a registered modifier)
 *   - isDrawableLayerType        (predicate: type is a drawable algorithm)
 *   - rememberDrawableLayerType  (cache last drawable type for new layers)
 *   - getPreferredNewLayerType   (heuristic: which type to use for next add)
 *
 * The legacy UI prototype delegates to this module via 1-line pass-throughs.
 *
 * DI bag: { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms }.
 *
 * Compile gate at tests/unit/algorithm-panel-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`AlgorithmPanel.${name} invoked before AlgorithmPanel.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function syncPrimaryModuleDropdown(layer) {
    const { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms } = requireDeps('syncPrimaryModuleDropdown');
    const select = getEl('generator-module', { silent: true });
    if (!select || !layer) return;
    if (this.isModifierLayer(layer)) {
      const modifier = this.getModifierState(layer);
      const type = modifier?.type || 'mirror';
      select.innerHTML = '';
      Object.keys(MODIFIER_DEFAULTS || { mirror: { label: 'Mirror' } }).forEach((key) => {
        const def = MODIFIER_DEFAULTS[key] || {};
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = def.label || key.charAt(0).toUpperCase() + key.slice(1);
        select.appendChild(opt);
      });
      select.value = type;
      select.disabled = false;
      select.classList.remove('opacity-60');
      this._syncModuleDisplay();
      return;
    }
    this.initModuleDropdown();
    this.rememberDrawableLayerType(layer);
    select.value = layer.type;
  }

  function isModifierType(type) {
    const { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms } = requireDeps('isModifierType');
    return Boolean(type && Object.prototype.hasOwnProperty.call(MODIFIER_DEFAULTS || {}, type));
  }

  function isDrawableLayerType(type) {
    const { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms } = requireDeps('isDrawableLayerType');
    if (!type || type === 'group' || this.isModifierType(type)) return false;
    return Boolean((Algorithms && Algorithms[type]) || (ALGO_DEFAULTS && ALGO_DEFAULTS[type]));
  }

  function rememberDrawableLayerType(typeOrLayer) {
    const { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms } = requireDeps('rememberDrawableLayerType');
    const type = typeof typeOrLayer === 'string' ? typeOrLayer : typeOrLayer?.type;
    if (!this.isDrawableLayerType(type)) return this.lastDrawableLayerType || null;
    this.lastDrawableLayerType = type;
    return type;
  }

  function getPreferredNewLayerType() {
    const { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms } = requireDeps('getPreferredNewLayerType');
    const isHidden = (type) => ALGO_DEFAULTS?.[type]?.hidden;
    const active = this.app.engine.getActiveLayer?.();
    if (active && !active.isGroup) {
      const activeType = this.rememberDrawableLayerType(active);
      if (activeType && !isHidden(activeType)) return activeType;
    }
    const rememberedType = this.rememberDrawableLayerType(this.lastDrawableLayerType);
    if (rememberedType && !isHidden(rememberedType)) return rememberedType;
    const moduleSelect = getEl('generator-module', { silent: true });
    if (moduleSelect && this.isDrawableLayerType(moduleSelect.value) && !isHidden(moduleSelect.value)) {
      return this.rememberDrawableLayerType(moduleSelect.value);
    }
    const fallbackLayer =
      (this.app.engine.layers || []).find((layer) => layer && !layer.isGroup && this.isDrawableLayerType(layer.type) && !isHidden(layer.type)) || null;
    return this.rememberDrawableLayerType(fallbackLayer?.type || 'wavetable') || 'wavetable';
  }


  UI.AlgorithmPanel = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms }
     */
    bind(deps) {
      DEPS = deps;
    },
    syncPrimaryModuleDropdown,
    isModifierType,
    isDrawableLayerType,
    rememberDrawableLayerType,
    getPreferredNewLayerType,
  };
})();

