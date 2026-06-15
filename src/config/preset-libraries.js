/**
 * Canonical filtered views of window.Vectura.PRESETS for UI consumers.
 *
 * window.Vectura.PresetLibraries is keyed by layer type (== preset_system) so
 * the universal preset gallery can resolve a layer's library with a single
 * `PresetLibraries[layer.type]` lookup. Every algorithm with at least one preset
 * therefore gets the gallery automatically — no per-algorithm wiring.
 *
 * Backward-compat keys (petalis alias, PETALIS_LAYER_TYPES, isPetalisLayerType)
 * are preserved for src/ui/controls-registry.js, src/ui/ui.js,
 * src/ui/ui-petal-designer.js, and src/ui/panels/algo-config-panel.js.
 *
 * Must load AFTER src/config/presets.js (+ user-presets.js) and BEFORE any UI
 * script that consumes the libraries.
 */
(function() {
  'use strict';
  const Vectura = window.Vectura = window.Vectura || {};
  const PRESETS = Array.isArray(Vectura.PRESETS) ? Vectura.PRESETS : [];

  // Group every preset by its declared system. Legacy petalis presets may omit
  // preset_system — default those to 'petalisDesigner'.
  const bySystem = {};
  PRESETS.forEach((preset) => {
    const system = (preset && preset.preset_system) || 'petalisDesigner';
    (bySystem[system] = bySystem[system] || []).push(preset);
  });

  const PETALIS_LAYER_TYPES = new Set(['petalisDesigner']);
  const isPetalisLayerType = (type) => PETALIS_LAYER_TYPES.has(type);

  // Spread the per-system arrays (keyed by layer.type) first, then the
  // backward-compat aliases. `petalis` mirrors the petalisDesigner library.
  Vectura.PresetLibraries = Object.assign({}, bySystem, {
    petalis: bySystem.petalisDesigner || [],
    PETALIS_LAYER_TYPES,
    isPetalisLayerType,
  });
})();
