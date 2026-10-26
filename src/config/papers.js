/**
 * Paper catalogue (paper selector).
 *
 * window.Vectura.PAPERS = { DEFAULT, TYPES, ORDER, LIMITS }
 *
 * A project's paper is a small config object:
 *   { type, color: '#rrggbb', texture: 0..1, bleed: 0..1, seed: int }
 * stored in SETTINGS.paper (saved per .vectura file). SETTINGS.paperDefault is
 * the user's single default paper (a preference, null = none set).
 *
 * Each TYPES entry describes how the paper looks and how ink behaves on it.
 * Every physical size is in document millimetres so the texture pans and
 * zooms with the sheet. The renderer (src/render/paper-texture.js) reads:
 *   label / short full name (menus, tooltips) / swatch caption
 *   color         base stock colour (picking a type resets the colour to this)
 *   grainMm       feature size of the surface tooth (mm)
 *   tooth         0..1 strength of the embossed tooth relief
 *   fiberDensity  0..1 amount of visible fibres
 *   fiberLenMm    typical fibre length (mm)
 *   fiberTone     -1..1 fibre tone vs. the stock (negative = darker fibres)
 *   speckle       0..1 density of dark inclusions (recycled / newsprint)
 *   mottle        0..1 low-frequency cloudiness (formation)
 *   absorbency    0..1 how strongly ink wicks into the sheet (halo opacity)
 *   bleedMm       ink spread radius at bleed = 100 % (mm)
 *   feather       0..1 how ragged the spread is (fibre-guided feathering)
 *   dryskip       0..1 how much ink skips over tooth peaks
 *   inkOpacity    0..1 ink coverage (newsprint/tracing take ink thinner)
 *   defaultTexture / defaultBleed  slider values a fresh pick starts from
 *
 * 'none' is a plain sheet: no texture, no bleed, and the ink path is the exact
 * pre-paper renderer (pixel-identical).
 *
 * Paper is preview-only: SVG export stays plotter-clean (no paper, no texture).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const plain = {
    grainMm: 1, tooth: 0, fiberDensity: 0, fiberLenMm: 1, fiberTone: 0, speckle: 0, mottle: 0,
    absorbency: 0, bleedMm: 0, feather: 0, dryskip: 0, inkOpacity: 1,
  };

  const TYPES = {
    none: {
      ...plain,
      label: 'None',
      short: 'None',
      hint: 'Plain colour, no texture or ink bleed',
      color: null, // theme document colour
      defaultTexture: 0,
      defaultBleed: 0,
    },
    'hot-press': {
      label: 'Hot-press watercolor',
      short: 'Hot press',
      hint: 'Smooth pressed cotton, crisp lines',
      color: '#f8f5ec',
      grainMm: 0.55, tooth: 0.16, fiberDensity: 0.08, fiberLenMm: 1.6, fiberTone: 0.4, speckle: 0, mottle: 0.16,
      absorbency: 0.35, bleedMm: 0.07, feather: 0.2, dryskip: 0.06, inkOpacity: 0.96,
      defaultTexture: 0.55, defaultBleed: 0.45,
    },
    'cold-press': {
      label: 'Cold-press watercolor',
      short: 'Cold press',
      hint: 'Medium tooth, slight broken line on peaks',
      color: '#f7f2e6',
      grainMm: 1.25, tooth: 0.62, fiberDensity: 0.12, fiberLenMm: 2.2, fiberTone: 0.35, speckle: 0, mottle: 0.22,
      absorbency: 0.55, bleedMm: 0.11, feather: 0.35, dryskip: 0.38, inkOpacity: 0.94,
      defaultTexture: 0.7, defaultBleed: 0.55,
    },
    rough: {
      label: 'Rough watercolor',
      short: 'Rough',
      hint: 'Heavy tooth, ink skips across the peaks',
      color: '#f5f0e2',
      grainMm: 2.3, tooth: 0.8, fiberDensity: 0.14, fiberLenMm: 2.6, fiberTone: 0.35, speckle: 0, mottle: 0.28,
      absorbency: 0.6, bleedMm: 0.13, feather: 0.4, dryskip: 0.62, inkOpacity: 0.93,
      defaultTexture: 0.8, defaultBleed: 0.55,
    },
    'bristol-smooth': {
      label: 'Bristol smooth',
      short: 'Bristol',
      hint: 'Plate finish, sharp hairlines',
      color: '#fbfbf7',
      grainMm: 0.35, tooth: 0.05, fiberDensity: 0.02, fiberLenMm: 1, fiberTone: 0.2, speckle: 0, mottle: 0.05,
      absorbency: 0.12, bleedMm: 0.03, feather: 0.05, dryskip: 0, inkOpacity: 1,
      defaultTexture: 0.4, defaultBleed: 0.3,
    },
    'bristol-vellum': {
      label: 'Bristol vellum',
      short: 'Vellum',
      hint: 'Light tooth, soft edges',
      color: '#f9f7ef',
      grainMm: 0.7, tooth: 0.3, fiberDensity: 0.05, fiberLenMm: 1.4, fiberTone: 0.3, speckle: 0, mottle: 0.1,
      absorbency: 0.25, bleedMm: 0.05, feather: 0.15, dryskip: 0.12, inkOpacity: 0.98,
      defaultTexture: 0.55, defaultBleed: 0.4,
    },
    'cotton-rag': {
      label: 'Cotton rag',
      short: 'Cotton rag',
      hint: 'Soft, fibrous archival sheet',
      color: '#f4efe2',
      grainMm: 0.95, tooth: 0.32, fiberDensity: 0.5, fiberLenMm: 3, fiberTone: 0.45, speckle: 0.02, mottle: 0.32,
      absorbency: 0.6, bleedMm: 0.12, feather: 0.55, dryskip: 0.14, inkOpacity: 0.95,
      defaultTexture: 0.65, defaultBleed: 0.55,
    },
    kraft: {
      label: 'Kraft',
      short: 'Kraft',
      hint: 'Brown unbleached stock with visible fibres',
      color: '#c39a6b',
      grainMm: 0.8, tooth: 0.3, fiberDensity: 0.95, fiberLenMm: 3.4, fiberTone: -0.6, speckle: 0.25, mottle: 0.45,
      absorbency: 0.5, bleedMm: 0.1, feather: 0.45, dryskip: 0.1, inkOpacity: 0.92,
      defaultTexture: 0.7, defaultBleed: 0.5,
    },
    newsprint: {
      label: 'Newsprint',
      short: 'Newsprint',
      hint: 'Grey recycled sheet, ink feathers noticeably',
      color: '#e4dfd0',
      grainMm: 0.5, tooth: 0.14, fiberDensity: 0.55, fiberLenMm: 1.3, fiberTone: -0.45, speckle: 0.7, mottle: 0.45,
      absorbency: 0.95, bleedMm: 0.34, feather: 0.9, dryskip: 0.04, inkOpacity: 0.84,
      defaultTexture: 0.75, defaultBleed: 0.7,
    },
    black: {
      label: 'Black stock',
      short: 'Black',
      hint: 'Toned black paper for light or metallic ink',
      color: '#1c1c1e',
      grainMm: 0.9, tooth: 0.32, fiberDensity: 0.18, fiberLenMm: 2, fiberTone: 0.6, speckle: 0, mottle: 0.2,
      absorbency: 0.3, bleedMm: 0.05, feather: 0.2, dryskip: 0.16, inkOpacity: 0.96,
      defaultTexture: 0.7, defaultBleed: 0.4,
    },
    tracing: {
      label: 'Tracing',
      short: 'Tracing',
      hint: 'Translucent, cool and cloudy; ink sits on top',
      color: '#eceff0',
      grainMm: 0.3, tooth: 0.04, fiberDensity: 0.03, fiberLenMm: 1, fiberTone: 0.2, speckle: 0, mottle: 0.4,
      absorbency: 0.04, bleedMm: 0.02, feather: 0.05, dryskip: 0, inkOpacity: 0.9,
      defaultTexture: 0.6, defaultBleed: 0.3,
    },
  };

  const ORDER = [
    'none',
    'hot-press',
    'cold-press',
    'rough',
    'bristol-smooth',
    'bristol-vellum',
    'cotton-rag',
    'kraft',
    'newsprint',
    'black',
    'tracing',
  ];

  // Built-in default: plain sheet in the theme's document colour (color null =
  // resolved from the active theme at runtime by Vectura.Paper).
  const DEFAULT = Object.freeze({ type: 'none', color: null, texture: 0.6, bleed: 0.5, seed: 1 });

  const LIMITS = Object.freeze({
    seedMax: 0x7fffffff,
    // Texture tile size in px and the pxPerMm buckets the tile cache keys on.
    tilePx: 512,
    minBucket: 0.5,
    maxBucket: 16,
    tileCacheSize: 8,
    // Large low-frequency formation tile: ~1 m period (longer than an A0
    // short side, incommensurate with the power-of-two grain periods) so
    // mottling never visibly repeats on big sheets.
    mottleTilePx: 512,
    mottlePeriodMm: 997,
    // Below this on-screen sheet size the texture overlay is skipped (LOD).
    minSheetPx: 96,
    // Below this halo radius (device px) bleed is skipped.
    minBleedPx: 0.4,
  });

  // The user's default paper is an explicit save, so it lives in its own
  // localStorage key (like the tool drawer / context bar) and survives even
  // when cookie preferences are off. It is also mirrored into the preference
  // snapshot when preferences are on.
  const STORAGE_KEY = 'vectura.paperDefault';

  Vectura.PAPERS = { DEFAULT, TYPES, ORDER, LIMITS, STORAGE_KEY };
})();
