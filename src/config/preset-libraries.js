/**
 * Canonical filtered views of window.Vectura.PRESETS for UI consumers.
 *
 * Provides the single source of truth for PETALIS_PRESET_LIBRARY,
 * TERRAIN_PRESET_LIBRARY, RINGS_PRESET_LIBRARY, PETALIS_LAYER_TYPES, and
 * isPetalisLayerType, consumed by src/ui/ui.js, src/ui/controls-registry.js,
 * src/ui/ui-petal-designer.js, and src/ui/panels/algo-config-panel.js.
 *
 * Must load AFTER src/config/presets.js and BEFORE any UI script that
 * consumes the libraries.
 */
(function() {
  'use strict';
  const Vectura = window.Vectura = window.Vectura || {};
  const PRESETS = Vectura.PRESETS;
  const PETALIS_PRESETS = Vectura.PETALIS_PRESETS;
  const TERRAIN_PRESETS = Vectura.TERRAIN_PRESETS;
  const RINGS_PRESETS = Vectura.RINGS_PRESETS;

  const petalis = (Array.isArray(PRESETS) ? PRESETS : Array.isArray(PETALIS_PRESETS) ? PETALIS_PRESETS : [])
    .filter((preset) => {
      const system = preset?.preset_system || 'petalisDesigner';
      return system === 'petalisDesigner';
    });
  const terrain = (Array.isArray(PRESETS) ? PRESETS : Array.isArray(TERRAIN_PRESETS) ? TERRAIN_PRESETS : [])
    .filter((preset) => preset?.preset_system === 'terrain');
  const rings = (Array.isArray(PRESETS) ? PRESETS : Array.isArray(RINGS_PRESETS) ? RINGS_PRESETS : [])
    .filter((preset) => preset?.preset_system === 'rings');
  const harmonograph = (Array.isArray(PRESETS) ? PRESETS : [])
    .filter((preset) => preset?.preset_system === 'harmonograph');

  const PETALIS_LAYER_TYPES = new Set(['petalisDesigner']);
  const isPetalisLayerType = (type) => PETALIS_LAYER_TYPES.has(type);

  Vectura.PresetLibraries = { petalis, terrain, rings, harmonograph, PETALIS_LAYER_TYPES, isPetalisLayerType };
})();
