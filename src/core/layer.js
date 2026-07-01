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
      // Apply file-based default preset params on top of ALGO_DEFAULTS
      const _defaultId = this.params.preset;
      if (_defaultId) {
        const _dp = ((window.Vectura || {}).PRESETS || []).find(
          p => p.id === _defaultId && p.preset_system === type
        );
        if (_dp && _dp.params && Object.keys(_dp.params).length > 0) {
          Object.assign(this.params, _dp.params);
        }
      }
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
      this.fills = [];
      this.displayPaths = [];
      this.displayStats = null;
      this.displayMaskActive = false;
      this.maskPolygons = null;
      // Editor glyph cells (M1 seam): WORLD-space quads recomputed every
      // generate() for text layers ([] otherwise). Transient — NOT serialized.
      this.glyphs = [];
      // On-canvas text edit session (index-only; set by M2). Transient — NOT
      // serialized (exportState enumerates fields explicitly, so this stays local).
      this._edit = null;
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

  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.Layer = Layer;
})();
