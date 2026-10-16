/**
 * UI layout and rendering constants extracted from ui.js.
 * Tune these values here rather than hunting through the UI module.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.UI_CONSTANTS = {
    // TUX-056: max backing-store DPR for the main canvas on coarse pointers (phones/tablets).
    // DPR 3 phones would allocate 2.25x the pixels of DPR 2; fine pointers are never capped.
    TOUCH_CANVAS_MAX_DPR: 2,

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
      // TUX-020: two-finger tap = undo, three-finger tap = redo. skew = last finger down minus first
      // finger down; duration = first down to last up; slop = per-finger drift and span change (CSS px).
      TAP_MAX_SKEW_MS: 250,
      TAP_MAX_DURATION_MS: 250,
      TAP_SLOP_PX: 10,
    },

    // TUX-023: transform-handle sizes by pointer type (CSS px). Pen equals mouse by rule:
    // only pointerType 'touch' gets the coarse values. Read these through hitTolerance().
    // TUX-024, 025 and 026 reuse this table; do not add literal radii in the renderer.
    HIT_TOLERANCE: {
      resize: { mouse: 10, pen: 10, touch: 22 },
      // Outer radius of the rotate band, measured from the handle hit centre.
      rotate: { mouse: 28, pen: 28, touch: 48 },
      // Hit radius of the visible touch rotate handle (0 = no handle).
      rotateAffordance: { mouse: 0, pen: 0, touch: 22 },
      // Distance from the nudged NE hit centre to the visible rotate handle centre (mid-band).
      rotateAffordanceOffset: { mouse: 0, pen: 0, touch: 34 },
      // Drawn radius of the visible rotate handle disc.
      rotateAffordanceDraw: { mouse: 0, pen: 0, touch: 12 },
      // Drawn handle square side.
      handleDraw: { mouse: 6, pen: 6, touch: 12 },
      // A touch selection narrower than this many resize radii gets its corners nudged
      // outward and loses its edge handles, so a finger can still move it from the centre.
      smallSelectionFactor: 3,
      // TUX-024: pen, direct-select and double-tap radii (CSS px; callers divide by the view scale).
      // The mouse and pen columns are the literals the renderer used before. Only 'touch' is coarse.
      // Stroke pick radius of findLayerAtPoint (selection by tap/click). A finger lands about 5-20 px off a 0.3 mm line; mouse and pen keep 5.
      strokePick: { mouse: 5, pen: 5, touch: 22 },
      anchor: { mouse: 6, pen: 6, touch: 22 },
      bezierHandle: { mouse: 5, pen: 5, touch: 22 },
      cornerWidget: { mouse: 7, pen: 7, touch: 22 },
      light: { mouse: 6, pen: 6, touch: 22 },
      // Single-tap snap-close of a pen draft on its first anchor (and its hover preview).
      penClose: { mouse: 5, pen: 5, touch: 22 },
      // Close by double-click or double-tap on the first anchor.
      penCloseDouble: { mouse: 12, pen: 12, touch: 24 },
      // Double-tap window. Mouse compares with '<', touch with '<=' (see Renderer._isDoubleTap).
      doubleTapDist: { mouse: 8, pen: 8, touch: 24 },
      doubleTapMs: { mouse: 400, pen: 400, touch: 400 },
      // A pen drag shorter than this makes no Bezier handles (finger jitter).
      penCurveSlop: { mouse: 2, pen: 2, touch: 6 },
      // TUX-025: 3D rotation gizmo (orbit pad, yaw, pitch, roll). Mouse/pen values are the old literals.
      'gizmo3d-marker': { mouse: 9, pen: 9, touch: 22 },
      'gizmo3d-centre': { mouse: 5, pen: 5, touch: 22 },
      'gizmo3d-ring-band': { mouse: 5, pen: 5, touch: 22 },
      // Extra reach past the orbit pad edge that still arms orbit (the old literal 7 px).
      'gizmo3d-pad-slack': { mouse: 7, pen: 7, touch: 7 },
    },

    // TUX-025: touch layout of the 3D rotation gizmo (screen px; the renderer multiplies by 1/scale).
    // Used when body.touch-ui or a coarse pointer is active. Markers stay >= 28 px apart in every state:
    // the pitch track sits outside the roll ring so it cannot collide with the yaw marker.
    GIZMO_3D_TOUCH: {
      padRadius: 36,
      yawRadiusX: 30,
      yawRadiusY: 28,
      ringRadius: 68,
      pitchTrackX: 98,
      pitchTrackHeight: 56,
      // Clearance rule: anchorOffset > ringRadius + ring band + resize radius (68 + 10 + 22 = 100), so no
      // gizmo target or ring band reaches the NE corner handle zone.
      anchorOffset: 106,
      markerDraw: 9,
      edgeInset: 8,
      reachPad: 22,
      // Floating chrome the touch gizmo footprint must clear (TUX-025).
      occluders: ['#touch-modifier-bar', '.ctxbar', '#canvas-hud'],
    },

    // TUX-014: rail tool sub-menus (shape / pen / fill / scissor / algo-draw picker).
    // HOLD_MS (280) and ALGO_HOLD_MS (400) are a documented exception to the 500 ms context-menu hold:
    // a rail flyout opens faster than a context menu. TAP_SLOP_PX cancels a pending hold or a row tap.
    TOOL_SUBMENU: {
      HOLD_MS: 280,
      ALGO_HOLD_MS: 400,
      TAP_SLOP_PX: 10,
      GAP_PX: 8,
      PAD_PX: 8,
      PRESS_CLEARANCE_PX: 24,
      CLICK_SWALLOW_MS: 700,
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
        CHIP_NAME: 'Pen. Change pen',
        CHIP_MIXED_NAME: 'Mixed pens. Unify pens',
        CHIP_ACTION: 'Change pen',
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

  // TUX-023: pure lookup. 'touch' maps to touch values; 'pen', 'mouse', undefined and
  // anything else map to mouse values (pen equals mouse).
  Vectura.hitTolerance = (kind, pointerType) => {
    const row = window.Vectura.UI_CONSTANTS.HIT_TOLERANCE[kind];
    if (!row) return 0;
    return pointerType === 'touch' ? row.touch : row.mouse;
  };
})();
