/**
 * Stroke style model constants + Stroke Options panel strings (STR-1…STR-5).
 *
 * Single source of truth for the per-layer stroke style vocabulary:
 *   lineCap     'butt' | 'round' | 'projecting'   (canvas/SVG spell projecting as 'square')
 *   lineJoin    'miter' | 'round' | 'bevel'
 *   miterLimit  number (default 10)
 *   dash        { enabled: boolean, pattern: number[] }  — up to 6 entries, mm
 *   strokeAlign 'center' | 'inside' | 'outside'          (STR-4 display transform)
 *
 * Loaded with the other src/config modules (before core/UI). Every consumer
 * feature-detects `window.Vectura.STROKE_STYLE` so load order stays tolerant.
 */
(() => {
  const CAPS = ['butt', 'round', 'projecting'];
  const JOINS = ['miter', 'round', 'bevel'];
  const ALIGNS = ['center', 'inside', 'outside'];
  const DASH_MAX_ENTRIES = 6;

  const DEFAULTS = {
    lineCap: 'round',
    lineJoin: 'round',
    miterLimit: 10,
    dash: { enabled: false, pattern: [] },
    strokeAlign: 'center',
  };

  // Weight quick-pick presets (mm — plotter-native pen widths).
  const WEIGHT_PRESETS_MM = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.5, 0.7, 1, 1.5, 2, 3];
  const WEIGHT_MIN_MM = 0.01;
  const WEIGHT_MAX_MM = 10;
  const WEIGHT_STEP_MM = 0.05;
  const MITER_LIMIT_MIN = 1;
  const MITER_LIMIT_MAX = 100;
  // First dash field pre-fill when Dashed Line is enabled with an empty pattern.
  const DEFAULT_DASH_MM = 3;

  /** Internal cap value → canvas ctx.lineCap / SVG stroke-linecap. */
  const toCanvasCap = (cap) => {
    if (cap === 'projecting') return 'square';
    if (cap === 'butt') return 'butt';
    return 'round';
  };

  /** Accepts internal or canvas/SVG spellings; returns internal cap value. */
  const normalizeCap = (cap) => {
    if (cap === 'square' || cap === 'projecting') return 'projecting';
    if (cap === 'butt') return 'butt';
    return 'round';
  };

  const normalizeJoin = (join) => (JOINS.includes(join) ? join : DEFAULTS.lineJoin);

  const normalizeAlign = (align) => (ALIGNS.includes(align) ? align : DEFAULTS.strokeAlign);

  const normalizeMiterLimit = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULTS.miterLimit;
    return Math.max(MITER_LIMIT_MIN, Math.min(MITER_LIMIT_MAX, num));
  };

  /** Sanitize a dash bag: boolean enabled + ≤6 finite non-negative entries. */
  const sanitizeDash = (dash) => {
    if (!dash || typeof dash !== 'object') return { enabled: false, pattern: [] };
    const pattern = (Array.isArray(dash.pattern) ? dash.pattern : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .slice(0, DASH_MAX_ENTRIES);
    return { enabled: Boolean(dash.enabled), pattern };
  };

  /**
   * Layer-level dash pattern for rendering/export, or null when the layer
   * draws solid (disabled, empty, or an all-zero pattern).
   */
  const getLayerDashPattern = (layer) => {
    const dash = sanitizeDash(layer && layer.dash);
    if (!dash.enabled || !dash.pattern.length) return null;
    if (!dash.pattern.some((value) => value > 0)) return null;
    return dash.pattern;
  };

  const Vectura = (window.Vectura = window.Vectura || {});
  Vectura.STROKE_STYLE = {
    CAPS,
    JOINS,
    ALIGNS,
    DASH_MAX_ENTRIES,
    DEFAULTS,
    WEIGHT_PRESETS_MM,
    WEIGHT_MIN_MM,
    WEIGHT_MAX_MM,
    WEIGHT_STEP_MM,
    MITER_LIMIT_MIN,
    MITER_LIMIT_MAX,
    DEFAULT_DASH_MM,
    toCanvasCap,
    normalizeCap,
    normalizeJoin,
    normalizeAlign,
    normalizeMiterLimit,
    sanitizeDash,
    getLayerDashPattern,
  };

  // ── Stroke Options panel strings (STR-2) ───────────────────────────────────
  Vectura.STROKE_OPTIONS_UI = {
    sectionTitle: 'Stroke',
    weightLabel: 'Weight:',
    weightDecrease: 'Decrease stroke weight',
    weightIncrease: 'Increase stroke weight',
    weightPresetsLabel: 'Stroke weight presets',
    capLabel: 'Cap:',
    capTooltips: {
      butt: 'Butt Cap',
      round: 'Round Cap',
      projecting: 'Projecting Cap',
    },
    cornerLabel: 'Corner:',
    cornerTooltips: {
      miter: 'Miter Join',
      round: 'Round Join',
      bevel: 'Bevel Join',
    },
    limitLabel: 'Limit:',
    limitTooltip: 'Miter limit (enabled while Miter Join is selected)',
    alignLabel: 'Align Stroke:',
    alignTooltips: {
      center: 'Align Stroke to Center',
      inside: 'Align Stroke to Inside',
      outside: 'Align Stroke to Outside',
    },
    dashedLineLabel: 'Dashed Line',
    dashFieldLabels: ['dash', 'gap', 'dash', 'gap', 'dash', 'gap'],
  };
})();
