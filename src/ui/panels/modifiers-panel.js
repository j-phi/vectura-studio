/**
 * Vectura modifiers panel (Phase 2 step 4 seventh panel extraction).
 *
 * Exposes window.Vectura.UI.ModifiersPanel — mirror modifier UI / tree
 * management plus the mask-application predicate / commit helpers.
 *
 * Methods lifted verbatim from class UI:
 *   - refreshModifierLayer      (after-edit refresh: compute geom + rebuild)
 *   - insertMirrorModifier      (toolbar action to wrap selection in mirror)
 *   - updatePrimaryPanelMode    (swap left-pane titles for modifier vs algo)
 *   - refreshMaskingViews       (mask-edit refresh: geom + render + stats)
 *   - ensureLayerMaskState      (lazy-init layer.mask object)
 *   - setLayerMaskEnabled       (toggle .enabled, history, refresh)
 *   - setLayerMaskHidden        (toggle .hideLayer, history, refresh)
 *
 * The legacy UI prototype delegates to this module via 1-line pass-throughs.
 *
 * DI bag: { getEl }.
 *
 * Compile gate at tests/unit/modifiers-panel-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`ModifiersPanel.${name} invoked before ModifiersPanel.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function refreshModifierLayer(layer, options = {}) {
    const { getEl } = requireDeps('refreshModifierLayer');
    const { rebuildControls = true } = options;
    if (!layer) return;
    this.app.computeDisplayGeometry();
    this.renderLayers();
    if (rebuildControls) this.buildControls();
    this.updateFormula();
    this.app.render();
  }

  function insertMirrorModifier() {
    const { getEl } = requireDeps('insertMirrorModifier');
    const selectedLayers = this.app.getSelectedLayers().filter((layer) => layer && !layer.isGroup);
    if (this.app.pushHistory) this.app.pushHistory();
    const id = this.app.addModifierLayer('mirror');
    if (selectedLayers.length) {
      this.assignLayersToParent(id, selectedLayers);
    }
    this.app.setSelection([id], id);
    this.app.engine.setActiveLayerId(id);
    this.renderLayers();
    this.buildControls();
    this.updateFormula();
    this.app.render();
  }

  function insertMorphModifier() {
    const { getEl } = requireDeps('insertMorphModifier');
    const selectedLayers = this.app.getSelectedLayers().filter((layer) => layer && !layer.isGroup);
    if (this.app.pushHistory) this.app.pushHistory();
    const id = this.app.addModifierLayer('morph');
    if (selectedLayers.length) {
      this.assignLayersToParent(id, selectedLayers);
    }
    this.app.setSelection([id], id);
    this.app.engine.setActiveLayerId(id);
    this.renderLayers();
    this.buildControls();
    this.updateFormula();
    this.app.render();
  }

  function updatePrimaryPanelMode(layer) {
    const { getEl } = requireDeps('updatePrimaryPanelMode');
    const primaryTitle = getEl('left-section-primary-title', { silent: true });
    const secondaryTitle = getEl('left-section-secondary-title', { silent: true });
    const moduleLabel = getEl('primary-module-label', { silent: true });
    const transformSection = getEl('algorithm-transform-section', { silent: true });
    const modifierMode = this.isModifierLayer(layer);
    if (primaryTitle) primaryTitle.textContent = modifierMode ? 'Modifier' : 'Algorithm';
    if (secondaryTitle) secondaryTitle.textContent = modifierMode ? 'Modifier Configuration' : 'Algorithm Configuration';
    if (moduleLabel) moduleLabel.textContent = modifierMode ? 'Modifier' : 'Algorithm';
    if (transformSection) transformSection.style.display = modifierMode ? 'none' : '';
  }

  function refreshMaskingViews() {
    const { getEl } = requireDeps('refreshMaskingViews');
    this.app.computeDisplayGeometry();
    this.renderLayers();
    this.buildControls();
    this.updateFormula();
    this.app.render();
    this.app.updateStats();
  }

  function ensureLayerMaskState(layer) {
    const { getEl } = requireDeps('ensureLayerMaskState');
    if (!layer.mask) {
      layer.mask = {
        enabled: false,
        sourceIds: [],
        mode: 'parent',
        hideLayer: false,
        invert: false,
        materialized: false,
      };
    }
    layer.mask.sourceIds = [];
    layer.mask.mode = 'parent';
    if (layer.mask.hideLayer === undefined) layer.mask.hideLayer = false;
    layer.mask.invert = false;
    return layer.mask;
  }

  function setLayerMaskEnabled(layer, enabled, options = {}) {
    const { getEl } = requireDeps('setLayerMaskEnabled');
    if (!layer) return;
    const { captureHistory = false } = options;
    if (captureHistory && this.app.pushHistory) this.app.pushHistory();
    const mask = this.ensureLayerMaskState(layer);
    mask.enabled = Boolean(enabled) && Boolean(layer.maskCapabilities?.canSource);
    this.refreshMaskingViews();
  }

  function setLayerMaskHidden(layer, hidden, options = {}) {
    const { getEl } = requireDeps('setLayerMaskHidden');
    if (!layer) return;
    const { captureHistory = false } = options;
    if (captureHistory && this.app.pushHistory) this.app.pushHistory();
    const mask = this.ensureLayerMaskState(layer);
    mask.hideLayer = Boolean(hidden);
    this.refreshMaskingViews();
  }


  UI.ModifiersPanel = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - { getEl }
     */
    bind(deps) {
      DEPS = deps;
    },
    refreshModifierLayer,
    insertMirrorModifier,
    insertMorphModifier,
    updatePrimaryPanelMode,
    refreshMaskingViews,
    ensureLayerMaskState,
    setLayerMaskEnabled,
    setLayerMaskHidden,
    installOn(proto) {
      proto.refreshModifierLayer = function(layer, options = {}) { return refreshModifierLayer.call(this, layer, options); };
      proto.insertMirrorModifier = function() { return insertMirrorModifier.call(this); };
      proto.insertMorphModifier = function() { return insertMorphModifier.call(this); };
      proto.updatePrimaryPanelMode = function(layer) { return updatePrimaryPanelMode.call(this, layer); };
      proto.refreshMaskingViews = function() { return refreshMaskingViews.call(this); };
      proto.ensureLayerMaskState = function(layer) { return ensureLayerMaskState.call(this, layer); };
      proto.setLayerMaskEnabled = function(layer, enabled, options = {}) { return setLayerMaskEnabled.call(this, layer, enabled, options); };
      proto.setLayerMaskHidden = function(layer, hidden, options = {}) { return setLayerMaskHidden.call(this, layer, hidden, options); };
    },
  };
})();

