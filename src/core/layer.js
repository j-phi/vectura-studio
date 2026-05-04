/**
 * Layer data model.
 */
(() => {
  const { ALGO_DEFAULTS, SETTINGS, THEMES = {} } = window.Vectura || {};

  class Layer {
    constructor(id, type = 'flowfield', name) {
      if (type === 'expanded') type = 'shape';
      this.id = id;
      this.type = type;
      this.name = name;
      this.params = JSON.parse(JSON.stringify(ALGO_DEFAULTS[type] || ALGO_DEFAULTS.flowfield));
      this.params.seed = Math.floor(Math.random() * 99999);
      this.params.posX = 0;
      this.params.posY = 0;
      this.params.scaleX = 1;
      this.params.scaleY = 1;
      this.params.rotation = 0;
      this.paramStates = {};
      const defaultPen = SETTINGS?.pens?.find?.((pen) => pen?.id === 'pen-1') || SETTINGS?.pens?.[0];
      const themeName = `${SETTINGS?.uiTheme || 'dark'}`.toLowerCase();
      const themePenColor = THEMES?.[themeName]?.pen1Color || THEMES?.dark?.pen1Color || '#ffffff';
      this.penId = defaultPen ? defaultPen.id : null;
      this.color = defaultPen?.color || themePenColor;
      this.strokeWidth = defaultPen?.width ?? SETTINGS?.strokeWidth ?? 0.3;
      this.lineCap = 'round';
      this.visible = true;
      this.origin = { x: 0, y: 0 };
      this.paths = [];
      this.displayPaths = [];
      this.displayStats = null;
      this.displayMaskActive = false;
      this.maskPolygons = null;
      this.sourcePaths = null;
      this.helperPaths = null;
      this.displayHelperPaths = null;
      this.parentId = null;
      this.isGroup = false;
      this.containerRole = null;
      this.groupType = null;
      this.groupParams = null;
      this.groupCollapsed = false;
      this.modifier = null;
      this.mask = {
        enabled: false,
        sourceIds: [],
        mode: 'parent',
        hideLayer: false,
        invert: false,
        materialized: false,
      };
      this.maskCapabilities = {
        canSource: false,
        reason: '',
        sourceType: null,
      };
      const optDefaults = SETTINGS?.optimizationDefaults;
      this.optimization = optDefaults ? JSON.parse(JSON.stringify(optDefaults)) : null;
      this.effectivePaths = [];
      this.effectiveStats = null;
      this.optimizedPaths = null;
      this.optimizedStats = null;
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.Layer = Layer;
})();
