/**
 * Start Page art picks — window.Vectura.START_PAGE_PICKS.
 *
 * STUDIO_PICKS   bundled preset ids (window.Vectura.PRESETS) that make good covers; a first-run
 *                user, who has no saved work yet, sees these.
 * EXAMPLE_PLATES ten bundled presets that fill the Plates section while the user has no works of their own
 *                (the block between the begin/end marker comments is machine-replaced by Developer Mode >
 *                Export defaults on the Start Page: keep both markers, and run `npm run start-page:picks` afterwards)
 *                (the mockup's first ten plates: layout, word and pinned paper). Pre-rendered like the picks.
 *                Entry: { presetId, title?, word?, layout?, pin?, colors?, hover? }. `colors` (optional) uses the plates store's manual-color
 *                shape: roles art / text / background / title / band, each a hex or Object.freeze({ fill: <special fill id> });
 *                a missing role is Auto, malformed values are ignored, and a role overrides the pin's color for that role only.
 *                `hover` (optional) is a hover-fx effect id ('holo' = Hologram Foil): that plate's hover effect until the user picks their own.
 * PICK_NAMES     optional display-name overrides (a pick otherwise uses the preset's own name).
 * COLLECTIONS    algorithm type -> 'Studies' | 'Botanicals' | 'Experiments' (the cover-word picker
 *                filters by these; there is deliberately no "Commissions").
 * collectionFor(type) falls back to 'Studies'.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const STUDIO_PICKS = Object.freeze([
    'wavetable-rolling-hills',
    'terrain-alpine',
    'topo-island',
    'flowfield-still-pool',
    'rings-ancient-redwood',
    'chrysanthemum-morifolium',
    'harmonograph-4-3-star',
    'scene3d-studio-shadows',
  ]);

  // <example-plates:begin> Developer Mode > Export defaults replaces everything up to the end marker; keep both markers.
  const EXAMPLE_PLATES = Object.freeze([
    Object.freeze({ presetId: 'rings-old-growth-oak', title: 'Old Growth Oak', word: 'Oak', layout: 'text-wrap' }),
    Object.freeze({ presetId: 'user-rings-1786211570394', title: 'Cybersigil', description: 'Concentric rings cut by hard, stepped offsets, so each band jumps like a glitch and the whole reads as a geometric sigil.', word: 'Rings', layout: 'spec-sheet', pin: 'black-white' }),
    Object.freeze({ presetId: 'rainfall-downpour', title: 'Downpour', word: 'Rainfall', layout: 'vertical-word' }),
    Object.freeze({ presetId: 'user-spiralizer-1781359333969', title: 'Coiled Sphere', word: 'Sphere', layout: 'text-wrap', pin: 'black-silver' }),
    Object.freeze({ presetId: 'user-terrain-1781475148727', title: 'High Sierra', word: 'Terrain', layout: 'full-bleed-band' }),
    Object.freeze({ presetId: 'topoform-torus-contours', title: 'Torus Contours', layout: 'specimen-frame', pin: 'kraft-sepia' }),
    Object.freeze({ presetId: 'topo-mountain-range', title: 'Contour Survey No. 3', word: 'Topo', layout: 'knockout-title', pin: 'black-silver', colors: Object.freeze({ art: Object.freeze({ fill: 'iridescent' }), title: Object.freeze({ fill: 'iridescent' }), band: '#1c1c1e' }), hover: 'holo' }),
    Object.freeze({ presetId: 'spiral-galaxy', title: 'Spiral Galaxy', word: 'Spiral', layout: 'full-bleed-band', pin: 'sky-prussian' }),
    Object.freeze({ presetId: 'wavetable-rolling-hills', title: 'Rolling Hills', word: 'Wavetable', layout: 'knockout-title', pin: 'ochre-umber' }),
    Object.freeze({ presetId: 'shapepack-pebble-beach', title: 'Pebble Beach', word: 'Pebbles', layout: 'full-sheet', pin: 'lavender-violet' }),
  ]);
  // <example-plates:end>

  // COVER_WORD_PICKS the pieces (and the paper + pen each is hung on) the default cover word, "Vectura", sets letter by letter
  // while the user has no saved works: V e c t u r a, in that order. `paper` / `pen` / `pen2` are ids from
  // START_PAGE_COLORWAYS (the pairing is pinned in the Curated color mode; any other mode recolors the letters as usual).
  // Pre-rendered with the picks (`npm run start-page:picks`).
  const COVER_WORD_PICKS = Object.freeze([
    Object.freeze({ presetId: 'user-terrain-1781475148727', paper: 'blueWash', pen: 'micron-blue' }), // V  High Sierra
    Object.freeze({ presetId: 'terrain-alpine', paper: 'news', pen: 'micron-black' }), // e  Alpine Ridge
    Object.freeze({ presetId: 'user-rings-1786211570394', paper: 'black', pen: 'gelly-white' }), // c  Cybersigil
    Object.freeze({ presetId: 'flowfield-still-pool', paper: 'blueWash', pen: 'micron-blue' }), // t  Still Pool
    Object.freeze({ presetId: 'dahlia-cornel', paper: 'rose', pen: 'pal-wine' }), // u  Dahlia 'Cornel'
    Object.freeze({ presetId: 'rainfall-downpour', paper: 'hot', pen: 'pal-teal' }), // r  Downpour
    Object.freeze({ presetId: 'rings-old-growth-oak', paper: 'kraft', pen: 'micron-sepia' }), // a  Old Growth Oak
  ]);

  const PICK_NAMES = Object.freeze({});

  const COLLECTION_NAMES = Object.freeze(['Studies', 'Botanicals', 'Experiments']);

  const COLLECTIONS = Object.freeze({
    petalisDesigner: 'Botanicals',
    phylla: 'Botanicals',
    hyphae: 'Botanicals',
    rings: 'Botanicals',
    wavetable: 'Studies',
    topo: 'Studies',
    terrain: 'Studies',
    flowfield: 'Studies',
    lissajous: 'Studies',
    harmonograph: 'Studies',
    spirograph: 'Studies',
    pendula: 'Studies',
    spiral: 'Studies',
    grid: 'Studies',
    halftone: 'Studies',
    rainfall: 'Studies',
    shapePack: 'Studies',
    imageWeave: 'Studies',
    rasterPlane: 'Studies',
    svgDistort: 'Studies',
    text: 'Studies',
    attractor: 'Experiments',
    boids: 'Experiments',
    spiralizer: 'Experiments',
    topoform: 'Experiments',
    polyhedron: 'Experiments',
    scene3d: 'Experiments',
    object3d: 'Experiments',
    booleanGroup3d: 'Experiments',
  });

  const collectionFor = (type) => (Object.prototype.hasOwnProperty.call(COLLECTIONS, type) ? COLLECTIONS[type] : 'Studies');

  Vectura.START_PAGE_PICKS = Object.freeze({ STUDIO_PICKS, EXAMPLE_PLATES, COVER_WORD_PICKS, PICK_NAMES, COLLECTION_NAMES, COLLECTIONS, collectionFor });
})();
