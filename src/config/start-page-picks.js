/**
 * Start Page art picks — window.Vectura.START_PAGE_PICKS.
 *
 * STUDIO_PICKS   bundled preset ids (window.Vectura.PRESETS) that make good covers; a first-run
 *                user, who has no saved work yet, sees these.
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

  Vectura.START_PAGE_PICKS = Object.freeze({ STUDIO_PICKS, PICK_NAMES, COLLECTION_NAMES, COLLECTIONS, collectionFor });
})();
