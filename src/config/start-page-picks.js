/**
 * Start Page art picks — window.Vectura.START_PAGE_PICKS.
 *
 * STUDIO_PICKS   bundled preset ids (window.Vectura.PRESETS) that make good covers; a first-run
 *                user, who has no saved work yet, sees these.
 * EXAMPLE_PLATES ten bundled presets that fill the Plates section while the user has no works of their own
 *                (the mockup's first ten plates: layout, word and pinned paper). Pre-rendered like the picks.
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

  const EXAMPLE_PLATES = Object.freeze([
    Object.freeze({ presetId: 'rings-old-growth-oak', title: 'Old Growth Oak', word: 'Oak', layout: 'text-wrap' }),
    Object.freeze({ presetId: 'user-rings-1786211570394', title: 'Cybersigil', word: 'Rings', layout: 'spec-sheet', pin: 'black-white' }),
    Object.freeze({ presetId: 'rainfall-downpour', title: 'Downpour', word: 'Rainfall', layout: 'vertical-word' }),
    Object.freeze({ presetId: 'user-spiralizer-1781359333969', title: 'Coiled Sphere', word: 'Sphere', layout: 'text-wrap', pin: 'black-silver' }),
    Object.freeze({ presetId: 'user-terrain-1781475148727', title: 'High Sierra', word: 'Terrain', layout: 'full-bleed-band' }),
    // the mockup's next five (specimen -> specimen-frame, kotitle -> knockout-title, bleed -> full-bleed-band, sheet -> full-sheet)
    Object.freeze({ presetId: 'topoform-torus-contours', title: 'Torus Contours', layout: 'specimen-frame', pin: 'kraft-sepia' }),
    Object.freeze({ presetId: 'topo-mountain-range', title: 'Contour Survey No. 3', word: 'Topo', layout: 'knockout-title', pin: 'black-silver' }),
    Object.freeze({ presetId: 'spiral-galaxy', title: 'Spiral Galaxy', word: 'Spiral', layout: 'full-bleed-band', pin: 'sky-prussian' }),
    Object.freeze({ presetId: 'wavetable-rolling-hills', title: 'Rolling Hills', word: 'Wavetable', layout: 'knockout-title', pin: 'ochre-umber' }),
    Object.freeze({ presetId: 'shapepack-pebble-beach', title: 'Pebble Beach', word: 'Pebbles', layout: 'full-sheet', pin: 'lavender-violet' }),
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

  Vectura.START_PAGE_PICKS = Object.freeze({ STUDIO_PICKS, EXAMPLE_PLATES, PICK_NAMES, COLLECTION_NAMES, COLLECTIONS, collectionFor });
})();
