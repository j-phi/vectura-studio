const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

describe('Engine integration workflows', () => {
  let runtime;

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

    const maskParent = new Layer('opt-mask-parent', 'expanded', 'Mask Parent');
    maskParent.paths = [[
      { x: 80, y: 60 },
      { x: 160, y: 60 },
      { x: 160, y: 140 },
      { x: 80, y: 140 },
      { x: 80, y: 60 },
    ]];
    maskParent.mask.enabled = true;

    const child = new Layer('opt-mask-child', 'expanded', 'Masked Child');
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
});
