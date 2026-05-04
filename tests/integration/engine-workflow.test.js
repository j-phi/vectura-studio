const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

describe('Engine integration workflows', () => {
  let runtime;

  const centroidAxisOrder = (paths = [], axis) =>
    (paths || []).map((path) => {
      const total = (path || []).reduce((acc, point) => {
        acc += Number(point?.[axis] ?? 0);
        return acc;
      }, 0);
      return total / Math.max(1, path?.length || 0);
    });

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('layer add/duplicate/remove workflow mutates layer stack coherently', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();

    const initialCount = engine.layers.length;
    const addedId = engine.addLayer('lissajous');
    expect(engine.layers.length).toBe(initialCount + 1);

    const duplicate = engine.duplicateLayer(addedId);
    expect(duplicate).not.toBeNull();
    expect(engine.layers.length).toBe(initialCount + 2);

    engine.removeLayer(addedId);
    expect(engine.layers.some((layer) => layer.id === duplicate.id)).toBe(true);
  });

  test('addLayer normalizes unknown modifier types to a real drawable algorithm', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();

    const addedId = engine.addLayer('mirror');
    const added = engine.layers.find((layer) => layer.id === addedId);

    expect(added).toBeTruthy();
    expect(added.type).toBe('wavetable');
    expect(added.name).toMatch(/^Wavetable /);
  });

  test('optimization pipeline preserves circle metadata and respects bypassAll', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.addLayer('wavetable');
    const layer = engine.getActiveLayer();

    const circle = [];
    circle.meta = { kind: 'circle', cx: 10, cy: 20, r: 4 };
    const line = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0.1 },
      { x: 15, y: 0 },
    ];
    layer.paths = [circle, line];

    engine.optimizeLayers([layer], {
      config: {
        bypassAll: false,
        steps: [{ id: 'linesimplify', enabled: true, bypass: false, tolerance: 0.5, mode: 'polyline' }],
      },
    });

    expect(Array.isArray(layer.optimizedPaths)).toBe(true);
    expect(layer.optimizedPaths[0].meta.kind).toBe('circle');

    engine.optimizeLayers([layer], {
      config: {
        bypassAll: true,
        steps: [{ id: 'linesimplify', enabled: true, bypass: false, tolerance: 0.5, mode: 'polyline' }],
      },
    });

    expect(layer.optimizedPaths).toBeNull();
  });

  test('masked layers optimize raw geometry without changing masked render paths', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const maskParent = new Layer('opt-mask-parent', 'shape', 'Mask Parent');
    maskParent.paths = [[
      { x: 80, y: 60 },
      { x: 160, y: 60 },
      { x: 160, y: 140 },
      { x: 80, y: 140 },
      { x: 80, y: 60 },
    ]];
    maskParent.mask.enabled = true;

    const child = new Layer('opt-mask-child', 'shape', 'Masked Child');
    child.parentId = maskParent.id;
    child.paths = [[
      { x: 20, y: 100 },
      { x: 220, y: 100 },
    ]];

    engine.layers.push(maskParent, child);
    engine.computeAllDisplayGeometry();
    engine.optimizeLayers([child], {
      config: {
        bypassAll: false,
        steps: [{ id: 'linesimplify', enabled: true, bypass: false, tolerance: 0.5, mode: 'polyline' }],
      },
    });

    expect(child.displayMaskActive).toBe(true);
    expect(child.displayPaths).toHaveLength(1);
    expect(child.displayPaths[0][0].x).toBeCloseTo(80, 4);
    expect(child.displayPaths[0][child.displayPaths[0].length - 1].x).toBeCloseTo(160, 4);

    expect(child.optimizedPaths).toHaveLength(1);
    expect(child.optimizedPaths[0][0].x).toBeCloseTo(20, 4);
    expect(child.optimizedPaths[0][child.optimizedPaths[0].length - 1].x).toBeCloseTo(220, 4);

    const renderable = engine.getRenderablePaths(child, { useOptimized: true });
    expect(renderable[0][0].x).toBeCloseTo(80, 4);
    expect(renderable[0][renderable[0].length - 1].x).toBeCloseTo(160, 4);
  });

  test('shared line sort preserves cross-layer order metadata for combined grouping', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const left = new Layer('line-sort-left', 'shape', 'Left');
    left.params.curves = false;
    left.sourcePaths = [[
      { x: 20, y: 40 },
      { x: 40, y: 40 },
    ]];

    const right = new Layer('line-sort-right', 'shape', 'Right');
    right.params.curves = false;
    right.sourcePaths = [[
      { x: 180, y: 40 },
      { x: 200, y: 40 },
    ]];

    engine.layers.push(left, right);
    engine.generate(left.id);
    engine.generate(right.id);
    engine.computeAllDisplayGeometry();

    engine.optimizeLayers([left, right], {
      config: {
        bypassAll: false,
        steps: [{ id: 'linesort', enabled: true, bypass: false, method: 'greedy', direction: 'horizontal', grouping: 'combined' }],
      },
    });

    expect(left.optimizedPaths?.[0]?.meta?.lineSortGrouping).toBe('combined');
    expect(left.optimizedPaths?.[0]?.meta?.lineSortOrder).toBe(0);
    expect(right.optimizedPaths?.[0]?.meta?.lineSortGrouping).toBe('combined');
    expect(right.optimizedPaths?.[0]?.meta?.lineSortOrder).toBe(1);
  });

  test('nearest vertical line sort follows centroid y sweep instead of global nearest-neighbor jumps', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const layer = new Layer('line-sort-vertical', 'shape', 'Vertical Sweep');
    layer.params.curves = false;
    layer.sourcePaths = [
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 200, y: 10 }, { x: 210, y: 10 }],
      [{ x: 12, y: 20 }, { x: 22, y: 20 }],
      [{ x: 220, y: 30 }, { x: 230, y: 30 }],
    ];

    engine.layers.push(layer);
    engine.generate(layer.id);
    engine.computeAllDisplayGeometry();

    engine.optimizeLayers([layer], {
      config: {
        bypassAll: false,
        steps: [{ id: 'linesort', enabled: true, bypass: false, method: 'nearest', direction: 'vertical', grouping: 'layer' }],
      },
    });

    expect(centroidAxisOrder(layer.optimizedPaths, 'y')).toEqual([0, 10, 20, 30]);
  });

  test('nearest horizontal line sort follows centroid x sweep instead of global nearest-neighbor jumps', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const layer = new Layer('line-sort-horizontal', 'shape', 'Horizontal Sweep');
    layer.params.curves = false;
    layer.sourcePaths = [
      [{ x: 0, y: 0 }, { x: 0, y: 10 }],
      [{ x: 10, y: 200 }, { x: 10, y: 210 }],
      [{ x: 20, y: 12 }, { x: 20, y: 22 }],
      [{ x: 30, y: 220 }, { x: 30, y: 230 }],
    ];

    engine.layers.push(layer);
    engine.generate(layer.id);
    engine.computeAllDisplayGeometry();

    engine.optimizeLayers([layer], {
      config: {
        bypassAll: false,
        steps: [{ id: 'linesort', enabled: true, bypass: false, method: 'nearest', direction: 'horizontal', grouping: 'layer' }],
      },
    });

    expect(centroidAxisOrder(layer.optimizedPaths, 'x')).toEqual([0, 10, 20, 30]);
  });

  test('combined nearest vertical line sort preserves shared cross-layer sweep order', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const top = new Layer('line-sort-combined-top', 'shape', 'Top');
    top.params.curves = false;
    top.sourcePaths = [
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 12, y: 20 }, { x: 22, y: 20 }],
    ];

    const bottom = new Layer('line-sort-combined-bottom', 'shape', 'Bottom');
    bottom.params.curves = false;
    bottom.sourcePaths = [
      [{ x: 200, y: 10 }, { x: 210, y: 10 }],
      [{ x: 220, y: 30 }, { x: 230, y: 30 }],
    ];

    engine.layers.push(top, bottom);
    engine.generate(top.id);
    engine.generate(bottom.id);
    engine.computeAllDisplayGeometry();

    engine.optimizeLayers([top, bottom], {
      config: {
        bypassAll: false,
        steps: [{ id: 'linesort', enabled: true, bypass: false, method: 'nearest', direction: 'vertical', grouping: 'combined' }],
      },
    });

    expect(centroidAxisOrder([
      top.optimizedPaths?.[0],
      bottom.optimizedPaths?.[0],
      top.optimizedPaths?.[1],
      bottom.optimizedPaths?.[1],
    ], 'y')).toEqual([0, 10, 20, 30]);
    expect(top.optimizedPaths?.[0]?.meta?.lineSortOrder).toBe(0);
    expect(bottom.optimizedPaths?.[0]?.meta?.lineSortOrder).toBe(1);
    expect(top.optimizedPaths?.[1]?.meta?.lineSortOrder).toBe(2);
    expect(bottom.optimizedPaths?.[1]?.meta?.lineSortOrder).toBe(3);
  });

  test('nearest line sort with direction none keeps unconstrained nearest-neighbor traversal', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const layer = new Layer('line-sort-none', 'shape', 'Nearest Freeform');
    layer.params.curves = false;
    layer.sourcePaths = [
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 200, y: 10 }, { x: 210, y: 10 }],
      [{ x: 12, y: 20 }, { x: 22, y: 20 }],
      [{ x: 220, y: 30 }, { x: 230, y: 30 }],
    ];

    engine.layers.push(layer);
    engine.generate(layer.id);
    engine.computeAllDisplayGeometry();

    engine.optimizeLayers([layer], {
      config: {
        bypassAll: false,
        steps: [{ id: 'linesort', enabled: true, bypass: false, method: 'nearest', direction: 'none', grouping: 'layer' }],
      },
    });

    expect(centroidAxisOrder(layer.optimizedPaths, 'y')).toEqual([0, 20, 10, 30]);
  });

  test('export/import roundtrip restores full engine state deterministically', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');
    const layer = engine.layers.find((item) => item.id === id);

    layer.params.freqX = 4.8;
    layer.params.freqY = 7.4;
    layer.params.resolution = 380;
    layer.params.scale = 0.95;
    engine.generate(id);

    const beforeState = engine.exportState();
    const beforeSignature = pathSignature(engine.layers.map((item) => item.paths));

    layer.params.freqX = 1.2;
    layer.params.freqY = 1.4;
    layer.params.resolution = 60;
    engine.generate(id);

    engine.importState(beforeState);
    const afterSignature = pathSignature(engine.layers.map((item) => item.paths));

    expect(afterSignature).toBe(beforeSignature);
  });

  test('removing a mask layer preserves its children and reparents them to the mask layer\'s parent', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const src = new Layer('mask-src', 'shape', 'Mask Source');
    src.mask = src.mask || {};
    src.mask.enabled = true;

    const childA = new Layer('mask-child-a', 'shape', 'Child A');
    childA.parentId = src.id;

    const childB = new Layer('mask-child-b', 'shape', 'Child B');
    childB.parentId = src.id;

    engine.layers.push(src, childA, childB);
    engine.removeLayer(src.id);

    expect(engine.layers).toHaveLength(2);
    expect(engine.layers.map((l) => l.id)).toEqual(
      expect.arrayContaining(['mask-child-a', 'mask-child-b'])
    );
    engine.layers.forEach((l) => expect(l.parentId).toBeNull());
  });
});
