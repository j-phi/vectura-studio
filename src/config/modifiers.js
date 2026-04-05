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
      'Mirrors child layer geometry across one or more full-canvas axes. Each axis replaces one side with a reflected copy of the opposite side, applied top-to-bottom.',
  };
})();
