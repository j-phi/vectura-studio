/*
 * P0-B Part 3 — engine-side effective-pen re-key.
 *
 * Effective pen = path.meta.penId || layer.penId || 'default'. Three engine
 * consumers must agree on it (division fragments carry per-path penIds):
 *   1. applyLineSort grouping:'pen' buckets each PATH by its effective pen.
 *   2. Plotter-optimize dedupe keys by (effective pen, parentKey(meta.parentGeom)
 *      || pathKey) so divided fragments dedupe at PARENT granularity across
 *      layers while sibling fragments of one parent within a layer are all kept.
 *   3. computeStats applies the same re-key so stats agree with export.
 *
 * Fix-A (Phase 4A Inc-0): fragments carry the parent's RAW geometry in
 * meta.parentGeom; consumers key it at their own tolerance via
 * StrokeDivide.parentKeyFromGeom, in the same namespace as pathKey.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const mkPath = (pts, meta) => {
  const p = pts.map((pt) => ({ x: pt[0], y: pt[1] }));
  if (meta) p.meta = meta;
  return p;
};

const lineSortConfig = (grouping, method = 'asdrawn') => ({
  bypassAll: false,
  steps: [
    { id: 'linesort', enabled: true, bypass: false, method, direction: 'none', grouping },
  ],
});

describe('effective-pen re-key (line sort, plotter dedupe, stats)', () => {
  let runtime;
  let SETTINGS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    SETTINGS = runtime.window.Vectura.SETTINGS;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  afterEach(() => {
    SETTINGS.plotterOptimize = 0;
  });

  const makeEngineWithLayers = (count) => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const layers = [];
    for (let i = 0; i < count; i++) {
      const id = engine.addShapeLayer(`L${i}`, [
        [
          { x: 0, y: 100 + i },
          { x: 10, y: 100 + i },
        ],
      ]);
      layers.push(engine.getLayerById(id));
    }
    return { engine, layers };
  };

  test("linesort grouping:'pen' buckets each path by its EFFECTIVE pen", () => {
    const { engine, layers } = makeEngineWithLayers(1);
    const [layer] = layers;
    // Real pens from the default set — a path's own penId only re-buckets when
    // it names a pen that actually exists (4a: engine validates the same way
    // export does; a stale penId is coerced to the layer/default pen).
    layer.penId = 'pen-1';
    layer.paths = [
      mkPath([[0, 0], [10, 0]]),
      mkPath([[0, 5], [10, 5]], { penId: 'pen-2' }),
    ];
    layer.effectivePaths = [];

    engine.optimizeLayers([layer], { config: lineSortConfig('pen', 'nearest') });

    // Each path lands in its own pen bucket, so BOTH are first in their
    // bucket's sort (lineSortOrder 0). Under layer-pen bucketing they would
    // share the 'pen-1' bucket and come out 0 and 1.
    const orders = layer.optimizedPaths.map((p) => p.meta.lineSortOrder);
    expect(orders).toEqual([0, 0]);
  });

  test("linesort grouping:'layer' is unchanged by per-path penIds", () => {
    const { engine, layers } = makeEngineWithLayers(1);
    const [layer] = layers;
    layer.penId = 'pen-a';
    layer.paths = [
      mkPath([[0, 0], [10, 0]]),
      mkPath([[0, 5], [10, 5]], { penId: 'pen-b' }),
    ];
    layer.effectivePaths = [];

    engine.optimizeLayers([layer], { config: lineSortConfig('layer', 'nearest') });
    const orders = layer.optimizedPaths.map((p) => p.meta.lineSortOrder);
    expect(orders).toEqual([0, 1]);
  });

  test('plotter dedupe: same parent geometry dedupes across layers, siblings kept within a layer', () => {
    const { engine, layers } = makeEngineWithLayers(2);
    const [layerA, layerB] = layers;
    layerA.penId = null;
    layerB.penId = null;
    // Shared parent geometry K (keyed at the plotter tolerance downstream).
    // Claiming fragments carry parentGeom + a per-parent fragIndex (as
    // divideChain stamps them for a gapless single-pen retrace).
    const PARENT = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    // Two sibling fragments of parent K in layer A (different geometry).
    layerA.paths = [
      mkPath([[0, 0], [4, 0]], { parentGeom: PARENT, fragIndex: 0 }),
      mkPath([[6, 0], [10, 0]], { parentGeom: PARENT, fragIndex: 1 }),
    ];
    // Layer B re-presents parent K (duplicate layer divided the same parent).
    layerB.paths = [mkPath([[0, 1], [4, 1]], { parentGeom: PARENT, fragIndex: 0 })];
    layerA.effectivePaths = [];
    layerB.effectivePaths = [];

    SETTINGS.plotterOptimize = 0.1;
    engine.optimizeLayers([layerA, layerB], {
      includePlotterOptimize: true,
      config: lineSortConfig('layer'),
    });

    expect(layerA.optimizedPaths).toHaveLength(2);
    expect(layerB.optimizedPaths).toHaveLength(0);
  });

  test('plotter dedupe keys by effective pen: a different fragment pen is never dropped', () => {
    const { engine, layers } = makeEngineWithLayers(2);
    const [layerA, layerB] = layers;
    layerA.penId = null;
    layerB.penId = null;
    const PARENT = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    layerA.paths = [mkPath([[0, 0], [4, 0]], { parentGeom: PARENT, fragIndex: 0 })];
    // Same parent geometry but a different (REAL) effective pen — must be kept.
    layerB.paths = [mkPath([[0, 1], [4, 1]], { parentGeom: PARENT, fragIndex: 0, penId: 'pen-2' })];
    layerA.effectivePaths = [];
    layerB.effectivePaths = [];

    SETTINGS.plotterOptimize = 0.1;
    engine.optimizeLayers([layerA, layerB], {
      includePlotterOptimize: true,
      config: lineSortConfig('layer'),
    });

    expect(layerA.optimizedPaths).toHaveLength(1);
    expect(layerB.optimizedPaths).toHaveLength(1);
  });

  test('plotter dedupe: out-and-back sibling fragments (identical geometry, distinct index) BOTH survive', () => {
    const { engine, layers } = makeEngineWithLayers(1);
    const [layer] = layers;
    layer.penId = null;
    // A self-retracing parent divides into two fragments with IDENTICAL
    // (reversed) geometry. Direction-agnostic pathKey alone would collapse them;
    // the per-parent fragIndex keeps both alive.
    const PARENT = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }];
    layer.paths = [
      mkPath([[0, 0], [10, 0]], { parentGeom: PARENT, fragIndex: 0 }),
      mkPath([[10, 0], [0, 0]], { parentGeom: PARENT, fragIndex: 1 }),
    ];
    layer.effectivePaths = [];

    SETTINGS.plotterOptimize = 0.1;
    engine.optimizeLayers([layer], {
      includePlotterOptimize: true,
      config: lineSortConfig('layer'),
    });

    expect(layer.optimizedPaths).toHaveLength(2);
  });

  test('plotter dedupe: a GAPPED (non-claiming) fragment does NOT suppress a coincident solid', () => {
    const { engine, layers } = makeEngineWithLayers(2);
    const [layerA, layerB] = layers;
    layerA.penId = null;
    layerB.penId = null;
    // Gapped fragment: carries fragIndex but NO parentGeom (it covers only part
    // of the parent), so it keys on its own geometry and must not claim/drop
    // the coincident solid that inks the gaps.
    layerA.paths = [mkPath([[0, 0], [5, 0]], { fragIndex: 0 })];
    layerB.paths = [mkPath([[0, 0], [20, 0]])]; // solid over the whole parent
    layerA.effectivePaths = [];
    layerB.effectivePaths = [];

    SETTINGS.plotterOptimize = 0.1;
    engine.optimizeLayers([layerA, layerB], {
      includePlotterOptimize: true,
      config: lineSortConfig('layer'),
    });

    expect(layerA.optimizedPaths).toHaveLength(1);
    expect(layerB.optimizedPaths).toHaveLength(1);
  });

  test('plotter dedupe: identical plain paths still dedupe within one layer', () => {
    const { engine, layers } = makeEngineWithLayers(1);
    const [layer] = layers;
    layer.paths = [
      mkPath([[0, 0], [10, 0]]),
      mkPath([[0, 0], [10, 0]]),
    ];
    layer.effectivePaths = [];

    SETTINGS.plotterOptimize = 0.1;
    engine.optimizeLayers([layer], {
      includePlotterOptimize: true,
      config: lineSortConfig('layer'),
    });

    expect(layer.optimizedPaths).toHaveLength(1);
  });

  test('computeStats counts identical geometry once per EFFECTIVE pen, not per layer pen', () => {
    const { engine, layers } = makeEngineWithLayers(1);
    const [layer] = layers;
    layer.penId = null;
    // Identical geometry, two different REAL per-path pens: both plot, both
    // count (4a: penIds must exist in the set to bucket distinctly, matching
    // export — see the stale-penId test below).
    layer.paths = [
      mkPath([[0, 0], [10, 0]], { penId: 'pen-1' }),
      mkPath([[0, 0], [10, 0]], { penId: 'pen-2' }),
    ];
    layer.effectivePaths = [];

    SETTINGS.plotterOptimize = 0.1;
    const stats = engine.computeStats([layer]);
    expect(stats.lines).toBe(2);
  });

  test('computeStats dedupes fragments at parent granularity across layers, keeps siblings', () => {
    const { engine, layers } = makeEngineWithLayers(2);
    const [layerA, layerB] = layers;
    layerA.penId = null;
    layerB.penId = null;
    const PARENT = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    layerA.paths = [
      mkPath([[0, 0], [4, 0]], { parentGeom: PARENT, fragIndex: 0 }),
      mkPath([[6, 0], [10, 0]], { parentGeom: PARENT, fragIndex: 1 }),
    ];
    layerB.paths = [mkPath([[0, 1], [4, 1]], { parentGeom: PARENT, fragIndex: 0 })];
    layerA.effectivePaths = [];
    layerB.effectivePaths = [];

    SETTINGS.plotterOptimize = 0.1;
    const stats = engine.computeStats([layerA, layerB]);
    // Layer A's two sibling fragments count; layer B's re-presented parent
    // is the duplicate the plotter skips, so stats must skip it too.
    expect(stats.lines).toBe(2);
  });

  // ── 4a: penId validation drift — engine now resolves an unknown/stale
  // meta.penId against the document pen SET the SAME way the SVG export does,
  // so stats/grouping never count a path under a phantom pen the export
  // coerces away. ────────────────────────────────────────────────────────────
  test('4a: a stale (unknown) meta.penId is counted under the SAME pen export plots it with', () => {
    const { engine, layers } = makeEngineWithLayers(1);
    const [layer] = layers;
    layer.penId = 'pen-1'; // a real pen from the default set
    // pathA carries a penId NOT in the set → export coerces it to the layer
    // pen 'pen-1'. pathB explicitly uses 'pen-1'. Identical geometry → one
    // physical line the plotter inks ONCE. Before the fix the engine bucketed
    // pathA under the phantom 'ghost-pen', counted 2 lines, and disagreed with
    // the exported artifact (1 line). Now both resolve to 'pen-1' → 1 line.
    layer.paths = [
      mkPath([[0, 0], [10, 0]], { penId: 'ghost-pen' }),
      mkPath([[0, 0], [10, 0]], { penId: 'pen-1' }),
    ];
    layer.effectivePaths = [];

    SETTINGS.plotterOptimize = 0.1;
    const stats = engine.computeStats([layer]);
    expect(stats.lines).toBe(1);
  });

  test('4a: engine effective-pen resolution equals SVG export for stale/valid/fallback penIds', () => {
    const V = runtime.window.Vectura;
    const resolve = V.PenValidate.resolveEffectivePenId;
    const pens = V.SETTINGS.pens || [];
    // The two membership shapes the two call sites pass: the engine builds a
    // Set of pen ids; the export builds a Map keyed by pen id. Both must yield
    // the identical effective pen id for every case (that is the whole fix).
    const penSetIds = new Set(pens.map((p) => p && p.id));
    const penMap = new Map(pens.map((p) => [p.id, p]));
    // Stale meta.penId → falls back to the (valid) layer pen, both shapes.
    expect(resolve({ penId: 'ghost-pen' }, 'pen-1', penSetIds)).toBe('pen-1');
    expect(resolve({ penId: 'ghost-pen' }, 'pen-1', penMap)).toBe('pen-1');
    // A valid meta.penId always wins.
    expect(resolve({ penId: 'pen-3' }, 'pen-1', penSetIds)).toBe('pen-3');
    // Neither path nor layer pen in the set → synthetic 'default' bucket
    // (== export's fallbackPen.id).
    expect(resolve({ penId: 'ghost' }, 'also-ghost', penSetIds)).toBe('default');
    expect(resolve(null, null, penSetIds)).toBe('default');
  });
});
