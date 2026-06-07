/**
 * Modifier defaults and descriptions.
 */
(() => {
  const MIRROR_GUIDE_COLORS = ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#d55e00', '#56b4e9', '#f0e442'];

  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.MODIFIER_GUIDE_COLORS = MIRROR_GUIDE_COLORS;
  window.Vectura.MODIFIER_DEFAULTS = {
    mirror: {
      label: 'Mirror',
      enabled: true,
      guidesVisible: true,
      guidesLocked: false,
      mirrors: [],
    },
    morph: {
      label: 'Morph',
      enabled: true,
      // Transition
      steps: 6,                              // int [1..64] — intermediate rings per child pair
      easing: 'linear',                      // linear | ease-in | ease-out | ease-in-out | cubic-in | cubic-out
      sequenceMode: 'sequential',            // sequential (A→B→C) | cyclic (A→B→C→A)
      // Geometry normalization
      resampleCount: 128,                    // int [8..512] — common vertex count after resampling
      resampleMode: 'arc-length',            // arc-length | uniform-index
      correspondenceMode: 'centroid-angle',  // centroid-angle | nearest | arc-length
      windingCheck: true,                    // auto-reverse B if it lowers correspondence cost
      // Multi-path handling
      multiPathStrategy: 'merge-centroid',   // auto | index-match | merge-centroid | merge-longest
      // Output control
      emitSources: true,                     // include original child paths alongside blends
      closureMode: 'auto',                   // auto | force-open | force-closed
      smoothing: 0.0,                        // 0=off, 1=full Catmull-Rom pass on output rings
      // Fill morphing
      fillMode: 'morph',                     // morph (regenerate interpolated fill per ring) | off (outline only)
      fillRegenLimit: 0,                     // 0=auto cap (~32 fill rings); >0 caps total fill regenerations
    },
  };
  window.Vectura.MODIFIER_DESCRIPTIONS = {
    mirror:
      'Mirrors child layer geometry across one or more axes. Supports line, radial (kaleidoscope), and arc mirror types applied top-to-bottom.',
    morph:
      'Blends 2+ child layers into graduated in-between rings — a circle morphing into a wavetable, etc. Children chain in layer order (A→B→C); each consecutive pair gets N interpolated steps. Output is plotter-ready polylines.',
    mirrorLine:
      'Reflects geometry across an infinite line axis at a given angle and position.',
    mirrorRadial:
      'Tiles geometry with N-fold rotational (rotation), dihedral (kaleidoscope), or edge-reflection symmetry. Wedge-clips the source before tiling for clean plotter output.',
    mirrorArc:
      'Reflects geometry across a circular arc. Points on the replaced side are mapped through the arc surface to the opposite side.',
    mirrorWallpaper:
      'Tiles geometry using one of the 17 crystallographic wallpaper groups — the complete mathematical catalog of planar periodic symmetries. Source geometry is clipped to the fundamental domain, then tiled to fill the canvas.',
  };
})();
