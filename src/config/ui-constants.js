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

    // Renderer handle/overlay geometry
    SHAPE_CORNER_HANDLE_MIN: 8,
    MASK_PREVIEW_ALPHA: 0.2,
    ROTATE_ARROW_OFFSET: 9,
    ROTATE_TRIANGLE_LIFT: 9,
    ROTATE_TRIANGLE_HALF_WIDTH: 12.2,
    ROTATE_TRIANGLE_UNDERLAY_HALF_WIDTH: 15.6,
    ROTATE_TRIANGLE_TIP_LENGTH: 10.8,
    ROTATE_TRIANGLE_UNDERLAY_TIP_LENGTH: 13.8,
  };
})();
