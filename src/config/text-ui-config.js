/**
 * Phase 3 Lane J — Text editing UI polish (TXT-3…5) strings & thresholds.
 *
 * Single source of truth for the font-family hover-preview dwell, the size
 * preset list, and the filter-clear affordance label used by the bespoke Text
 * panel (`src/ui/ui-text-panel.js`). No inline strings/thresholds live in the
 * panel — it feature-detects `Vectura.TextUIConfig` and falls back to the same
 * defaults, so it tolerates late/absent loading (this file has no script tag
 * until the phase integrator adds one; see the lane report).
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  Vectura.TextUIConfig = {
    // TXT-3: minimum hover dwell (ms) before a webfont fetch fires. Rapid hover
    // across rows re-arms this timer so only the settled family is fetched.
    hoverDwellMs: 150,

    // TXT-5: font-size quick presets (millimetres, matching the Size scrub's
    // unit). The scrub input remains the free-entry path for any other value.
    sizePresets: [6, 7, 8, 9, 10, 11, 12, 14, 18, 21, 24, 36, 48, 60, 72],

    // Accessible labels for the new affordances.
    clearFilterLabel: 'Clear font filter',
    sizePresetsLabel: 'Size presets',
  };
})();
