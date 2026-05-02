/**
 * Modifier defaults and descriptions.
 */
(() => {
  const MIRROR_GUIDE_COLORS = ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#d55e00', '#56b4e9', '#f0e442'];

  window.Vectura = window.Vectura || {};
  window.Vectura.MODIFIER_GUIDE_COLORS = MIRROR_GUIDE_COLORS;
  window.Vectura.MODIFIER_DEFAULTS = {
    mirror: {
      label: 'Mirror',
      enabled: true,
      guidesVisible: true,
      guidesLocked: false,
      mirrors: [],
    },
  };
  window.Vectura.MODIFIER_DESCRIPTIONS = {
    mirror:
      'Mirrors child layer geometry across one or more axes. Supports line, radial (kaleidoscope), and arc mirror types applied top-to-bottom.',
    mirrorLine:
      'Reflects geometry across an infinite line axis at a given angle and position.',
    mirrorRadial:
      'Tiles geometry with N-fold rotational (rotation), dihedral (kaleidoscope), or edge-reflection symmetry. Wedge-clips the source before tiling for clean plotter output.',
    mirrorArc:
      'Reflects geometry across a circular arc. Points on the replaced side are mapped through the arc surface to the opposite side.',
  };
})();
