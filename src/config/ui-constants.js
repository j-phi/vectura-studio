/**
 * UI layout and rendering constants extracted from ui.js.
 * Tune these values here rather than hunting through the UI module.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
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

    // TUX-017: second-finger arbitration window (src/render/touch-gesture-arbiter.js).
    // A second touch within ARBITRATION_MS of the first, OR before the first moved
    // ARBITRATION_SLOP_PX (CSS client px), rolls the first action back. Otherwise it commits.
    TOUCH_GESTURE: {
      ARBITRATION_MS: 250,
      ARBITRATION_SLOP_PX: 10,
      // TUX-019: a one-finger drag moves the object once the finger travels this far (CSS px).
      // Touch only; mouse and Apple Pencil keep 0 slop. Q4 owner: Jay.
      touchDragSlopPx: 6,
    },

    // TUX-055: image import cap. 2048, not 4096: a 4096x3072 raster makes saveVecturaFile build a string
    // past V8's ~536.87M-char limit (about 11-13 chars per byte). Read by Vectura.ImageSource.
    IMAGE_IMPORT: { MAX_SIDE: 2048 },

    // TUX-026: Petal Designer control grab radius in CSS px. A mouse keeps 10 px. A finger gets 22 px to
    // grab an anchor; a handle the finger is within touchHandle px of wins over its anchor.
    // Follow-up: fold into hitTolerance(kind, pointerType) when TUX-023 lands.
    PETAL_DESIGNER_HIT_RADIUS: { mouse: 10, touch: 22, touchHandle: 12 },

    // Renderer handle/overlay geometry
    SHAPE_CORNER_HANDLE_MIN: 8,
    MASK_PREVIEW_ALPHA: 0.2,
    ROTATE_ARROW_OFFSET: 9,
    ROTATE_TRIANGLE_LIFT: 9,
    ROTATE_TRIANGLE_HALF_WIDTH: 12.2,
    ROTATE_TRIANGLE_UNDERLAY_HALF_WIDTH: 15.6,
    ROTATE_TRIANGLE_TIP_LENGTH: 10.8,
    ROTATE_TRIANGLE_UNDERLAY_TIP_LENGTH: 13.8,

    // === COL (Tools Parity, Phase 1 Lane D): Pen Picker popover
    // Strings + thresholds for src/ui/panels/pen-picker-popover.js.
    PEN_PICKER: {
      LABELS: {
        TAB_PENS: 'Pens',
        TAB_NEW: 'New Pen',
        ADD_PEN: 'Add Pen',
        NAME: 'Name',
        WIDTH: 'Width',
        NAME_DEFAULT_PREFIX: 'Pen',
        MIXED_BADGE: '?',
        CHIP_TITLE: 'Pen — click to change',
        CHIP_MIXED_TITLE: 'Mixed pens — click to unify',
        EYEDROPPER_TITLE: 'Sample a pen from a canvas layer',
      },
      // Width field mirrors the Pens panel width slider range/step (mm).
      WIDTH_MIN_MM: 0.05,
      WIDTH_MAX_MM: 2,
      WIDTH_STEP_MM: 0.05,
      // Anchor gap + estimated popover height used for the above/below flip.
      OFFSET_PX: 6,
      FLIP_THRESHOLD_PX: 340,
      // COL-4 eyedropper: per-RGB-channel tolerance when matching a sampled
      // layer color back to an existing pen.
      EYEDROPPER_RGB_TOLERANCE: 8,
      // COL-4b sampling loupe: magnifier circle diameter,
      // zoom factor of the canvas view inside it, and its gap from the pointer.
      LOUPE_SIZE_PX: 110,
      LOUPE_ZOOM: 3,
      LOUPE_OFFSET_PX: 16,
    },
    // === end COL ===
  };
})();
