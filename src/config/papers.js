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
 *   grainAngle / grainStretch  felt-mark direction (rad) and elongation (≥1)
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
    grainAngle: 0, grainStretch: 1, grainMm: 1, tooth: 0, fiberDensity: 0, fiberLenMm: 1, fiberTone: 0, speckle: 0, mottle: 0,
    absorbency: 0, bleedMm: 0, feather: 0, dryskip: 0, inkOpacity: 1,
  };

  // Null-prototype map: an unknown type such as 'constructor' or 'toString'
  // can never resolve to an inherited Object member.
  const TYPES = Object.assign(Object.create(null), {
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
      grainAngle: 0.2, grainStretch: 1.15, grainMm: 0.55, tooth: 0.16, fiberDensity: 0.08, fiberLenMm: 1.6, fiberTone: 0.4, speckle: 0, mottle: 0.16,
      absorbency: 0.35, bleedMm: 0.07, feather: 0.2, dryskip: 0.06, inkOpacity: 0.96,
      defaultTexture: 0.55, defaultBleed: 0.45,
    },
    'cold-press': {
      label: 'Cold-press watercolor',
      short: 'Cold press',
      hint: 'Medium tooth, slight broken line on peaks',
      color: '#f7f2e6',
      grainAngle: 0.35, grainStretch: 1.25, grainMm: 1.25, tooth: 0.46, fiberDensity: 0.12, fiberLenMm: 2.2, fiberTone: 0.35, speckle: 0, mottle: 0.22,
      absorbency: 0.55, bleedMm: 0.11, feather: 0.35, dryskip: 0.38, inkOpacity: 0.94,
      defaultTexture: 0.7, defaultBleed: 0.55,
    },
    rough: {
      label: 'Rough watercolor',
      short: 'Rough',
      hint: 'Heavy tooth, ink skips across the peaks',
      color: '#f5f0e2',
      grainAngle: 0.5, grainStretch: 1.3, grainMm: 2.3, tooth: 0.52, fiberDensity: 0.14, fiberLenMm: 2.6, fiberTone: 0.35, speckle: 0, mottle: 0.28,
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
      grainAngle: 0.15, grainStretch: 1.2, grainMm: 0.95, tooth: 0.32, fiberDensity: 0.5, fiberLenMm: 3, fiberTone: 0.45, speckle: 0.02, mottle: 0.32,
      absorbency: 0.6, bleedMm: 0.12, feather: 0.55, dryskip: 0.14, inkOpacity: 0.95,
      defaultTexture: 0.65, defaultBleed: 0.55,
    },
    kraft: {
      label: 'Kraft',
      short: 'Kraft',
      hint: 'Brown unbleached stock with visible fibres',
      color: '#c39a6b',
      grainMm: 0.8, tooth: 0.16, fiberDensity: 1, fiberLenMm: 3.4, fiberTone: -0.6, speckle: 0.25, mottle: 0.45,
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
  });

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
    // Texture chunks (src/render/paper-texture.js): CHUNK px square on a
    // document-mm grid, rasterised at a power-of-two px/mm "bucket" near the
    // on-screen density (never the sheet size), with an apron so adjacent
    // chunks overlap seamlessly. maxBucket keeps chunks screen-sharp up to
    // ~128 px/mm (extreme zoom). While exact chunks refine (time-sliced), the
    // bucket/8 level is drawn at once. The cache is capped in bytes.
    chunkPx: 256,
    apronPx: 2,
    minBucket: 0.25,
    maxBucket: 128,
    cacheBytes: 64 * 1024 * 1024,
    // Visible-set budget: above it the view steps to a coarser bucket (no
    // eviction thrash on huge retina viewports); the cap grows to 1.5× the
    // pinned visible set but never past hardCacheBytes.
    visibleBytes: 64 * 1024 * 1024,
    hardCacheBytes: 128 * 1024 * 1024,
    refineSliceMs: 10,
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

  // Custom papers ("My papers"): the realism parameters a user may tune, in
  // the order the Advanced sliders show them, with their allowed ranges.
  // Every value from a file, the library or a slider is clamped to these.
  const PARAM_KEYS = Object.freeze([
    'grainMm', 'grainAngle', 'grainStretch', 'tooth', 'fiberDensity', 'fiberLenMm', 'fiberTone',
    'speckle', 'mottle', 'absorbency', 'bleedMm', 'feather', 'dryskip', 'inkOpacity',
  ]);
  const PARAM_LIMITS = Object.freeze({
    grainMm: Object.freeze({ min: 0.2, max: 3, step: 0.05, unit: 'mm' }),
    grainAngle: Object.freeze({ min: 0, max: 3.14, step: 0.05, unit: 'rad' }),
    grainStretch: Object.freeze({ min: 1, max: 2.5, step: 0.05, unit: 'x' }),
    tooth: Object.freeze({ min: 0, max: 1, step: 0.01, unit: '%' }),
    fiberDensity: Object.freeze({ min: 0, max: 1, step: 0.01, unit: '%' }),
    fiberLenMm: Object.freeze({ min: 0.5, max: 5, step: 0.1, unit: 'mm' }),
    fiberTone: Object.freeze({ min: -1, max: 1, step: 0.05, unit: 'signed' }),
    speckle: Object.freeze({ min: 0, max: 1, step: 0.01, unit: '%' }),
    mottle: Object.freeze({ min: 0, max: 1, step: 0.01, unit: '%' }),
    absorbency: Object.freeze({ min: 0, max: 1, step: 0.01, unit: '%' }),
    bleedMm: Object.freeze({ min: 0, max: 0.5, step: 0.01, unit: 'mm' }),
    feather: Object.freeze({ min: 0, max: 1, step: 0.01, unit: '%' }),
    dryskip: Object.freeze({ min: 0, max: 1, step: 0.01, unit: '%' }),
    inkOpacity: Object.freeze({ min: 0.5, max: 1, step: 0.01, unit: '%' }),
  });

  // The user's paper library: one localStorage key holding
  // { schema, version, papers: [entry…] } — also the export/import file
  // format. An entry is
  //   { id: 'custom-xxxxxxx', name, base: <built-in type>, color,
  //     defaultTexture, defaultBleed, params: { <PARAM_KEYS> } }
  // A project on a custom paper embeds { name, base, color, params } in
  // settings.paper.custom so it opens anywhere (the embedded block wins
  // over a library entry with the same id).
  const CUSTOM = Object.freeze({
    LIBRARY_KEY: 'vectura.customPapers',
    SCHEMA: 'vectura-papers',
    VERSION: 1,
    MAX_ENTRIES: 64,
    MAX_BYTES: 512 * 1024,
    NAME_MAX: 48,
    SHORT_MAX: 11,
    ID_PREFIX: 'custom-',
    ID_RE: /^custom-[a-z0-9]{1,24}$/,
    DEFAULT_BASE: 'cold-press',
    FILE_STEM: 'vectura-papers',
    HINT: 'Custom paper',
    FALLBACK_NAME: 'Custom paper',
  });

  // Image-based custom papers (src/render/paper-image.js): accepted formats,
  // caps, working/embedded sizes and the physical-scale default.
  const IMAGE = Object.freeze({
    MIME: Object.freeze(['image/png', 'image/jpeg', 'image/webp']),
    ACCEPT: 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp',
    fileMaxBytes: 40 * 1024 * 1024,   // an uploaded / downloaded source image
    minPx: 16,
    maxPx: 16384,                     // upload: per side (read from the header, before decoding)
    maxPixels: 64 * 1024 * 1024,      // upload: total pixels (no decompression bombs)
    resizeOnDecodePixels: 24e6,       // above this, decode straight to the working size (memory)
    embedMaxPx: 2048,                 // an embedded/stored tile: per side (2 × tileMaxPx)
    workMaxPx: 2048,                  // processing size (de-light, tiling)
    sliceMs: 12,                      // processing time slice before yielding to the UI
    tileMaxPx: 1024,                  // embedded tile size (per side)
    tileMaxBytes: 1536 * 1024,        // embedded tile (+ height) budget
    importMaxBytes: 64 * 1024 * 1024, // a papers file with images
    defaultDpi: 300,
    dpiMin: 25,
    dpiMax: 4800,
    tileMmMin: 5,
    tileMmMax: 2000,
    // Realism defaults for a new image paper: the photo supplies tone,
    // fibres and mottle, so the procedural ones start off.
    paramOverrides: Object.freeze({ fiberDensity: 0, speckle: 0, mottle: 0 }),
  });

  Vectura.PAPERS = { DEFAULT, TYPES, ORDER, LIMITS, STORAGE_KEY, PARAM_KEYS, PARAM_LIMITS, CUSTOM, IMAGE };
})();
