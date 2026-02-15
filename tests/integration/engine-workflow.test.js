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
