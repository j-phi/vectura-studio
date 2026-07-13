/**
 * Layer data model.
 */
(() => {
  const { ALGO_DEFAULTS, SETTINGS, THEMES = {} } = window.Vectura || {};

  /**
   * The params a BRAND-NEW layer of this type is born with: ALGO_DEFAULTS with the
   * factory preset applied on top (the preset wins — see the bundler, which strips
   * every key a factory preset merely restates, so what it still carries is exactly
   * its deliberate curation).
   *
   * This is the single definition of "factory state". It was previously re-derived
   * in three places that could drift apart, and the panel needs it to tell a user
   * which controls have been moved off their default — the question nobody could
   * answer when a cascade was quietly seeding an Occlusion Bias.
   */
  const factoryParams = (type) => {
    const base = JSON.parse(JSON.stringify(ALGO_DEFAULTS[type] || ALGO_DEFAULTS.flowfield || {}));
    const defaultId = base.preset;
    if (defaultId) {
      const preset = ((window.Vectura || {}).PRESETS || []).find(
        (p) => p.id === defaultId && p.preset_system === type,
      );
      if (preset && preset.params && Object.keys(preset.params).length > 0) {
        Object.assign(base, preset.params);
      }
    }
    return base;
  };

  class Layer {
    constructor(id, type = 'flowfield', name) {
      if (type === 'expanded') type = 'shape';
      this.id = id;
      this.type = type;
      this.name = name;
      this.params = factoryParams(type);
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
      // Stroke style model (STR-1). Defaults come from the shared config
      // vocabulary when loaded; hard fallbacks keep legacy load orders safe.
      const strokeDefaults = window.Vectura?.STROKE_STYLE?.DEFAULTS || {};
      this.lineCap = strokeDefaults.lineCap || 'round';
      this.lineJoin = strokeDefaults.lineJoin || 'round';
      this.miterLimit = Number.isFinite(strokeDefaults.miterLimit) ? strokeDefaults.miterLimit : 10;
      this.dash = { enabled: false, pattern: [] };
      this.strokeAlign = strokeDefaults.strokeAlign || 'center';
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
  window.Vectura.factoryParams = factoryParams;
})();
