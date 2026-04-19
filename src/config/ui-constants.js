/**
 * UI layout and rendering constants extracted from ui.js.
 * Tune these values here rather than hunting through the UI module.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.UI_CONSTANTS = {
    // Minimum pixels of space above a trigger before a popover flips upward.
    COLOR_PICKER_POPOVER_THRESHOLD_PX: 220,

    // Number of line segments used to approximate a circle path on SVG export.
    CIRCLE_EXPORT_STEPS: 72,

    // Petalis petal-curve default anchor ratios (fraction of the upper/lower T range).
    // Used as fallback interpolation positions when no explicit handle values are set.
    PETALIS_CURVE_ANCHORS: {
      oTopRatio: 0.42,
      iUpperRatio: 0.72,
      oUpperLerp: 0.34,
      iLowerLerp: 0.68,
      oLowerLerp: 0.38,
      iBottomLerp: 0.62,
      mirrorExtent: 0.7,
    },
  };
})();
