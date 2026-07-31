/*
 * P0-B Part 3 — engine-side effective-pen re-key.
 *
 * Effective pen = path.meta.penId || layer.penId || 'default'. Three engine
 * consumers must agree on it (division fragments carry per-path penIds):
 *   1. applyLineSort grouping:'pen' buckets each PATH by its effective pen.
 *   2. Plotter-optimize dedupe keys by (effective pen, meta.parentKey||pathKey)
 *      so divided fragments dedupe at PARENT granularity across layers while
 *      sibling fragments of one parent within a layer are all kept.
 *   3. computeStats applies the same re-key so stats agree with export.
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
    layer.penId = 'pen-a';
    layer.paths = [
      mkPath([[0, 0], [10, 0]]),
      mkPath([[0, 5], [10, 5]], { penId: 'pen-b' }),
    ];
    layer.effectivePaths = [];

    engine.optimizeLayers([layer], { config: lineSortConfig('pen', 'nearest') });

    // Each path lands in its own pen bucket, so BOTH are first in their
    // bucket's sort (lineSortOrder 0). Under layer-pen bucketing they would
    // share the 'pen-a' bucket and come out 0 and 1.
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

  test('plotter dedupe: same parentKey dedupes across layers, siblings kept within a layer', () => {
    const { engine, layers } = makeEngineWithLayers(2);
    const [layerA, layerB] = layers;
    layerA.penId = null;
    layerB.penId = null;
    // Two sibling fragments of parent K in layer A (different geometry).
    layerA.paths = [
      mkPath([[0, 0], [4, 0]], { parentKey: 'K' }),
      mkPath([[6, 0], [10, 0]], { parentKey: 'K' }),
    ];
    // Layer B re-presents parent K (duplicate layer divided the same parent).
    layerB.paths = [mkPath([[0, 1], [4, 1]], { parentKey: 'K' })];
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
    layerA.paths = [mkPath([[0, 0], [4, 0]], { parentKey: 'K' })];
    // Same parent key but a different effective pen — must be kept.
    layerB.paths = [mkPath([[0, 1], [4, 1]], { parentKey: 'K', penId: 'pen-z' })];
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
    // Identical geometry, two different per-path pens: both plot, both count.
    layer.paths = [
      mkPath([[0, 0], [10, 0]], { penId: 'p1' }),
      mkPath([[0, 0], [10, 0]], { penId: 'p2' }),
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
    layerA.paths = [
      mkPath([[0, 0], [4, 0]], { parentKey: 'K' }),
      mkPath([[6, 0], [10, 0]], { parentKey: 'K' }),
    ];
    layerB.paths = [mkPath([[0, 1], [4, 1]], { parentKey: 'K' })];
    layerA.effectivePaths = [];
    layerB.effectivePaths = [];

    SETTINGS.plotterOptimize = 0.1;
    const stats = engine.computeStats([layerA, layerB]);
    // Layer A's two sibling fragments count; layer B's re-presented parent
    // is the duplicate the plotter skips, so stats must skip it too.
    expect(stats.lines).toBe(2);
  });
});
