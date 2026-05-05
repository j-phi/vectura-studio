const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('VectorEngine export/import origin round-trip', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('exportState includes a cloned origin per layer', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');
    const layer = engine.getLayerById(id);
    layer.origin = { x: 50, y: -25 };

    const state = engine.exportState();
    const exported = state.layers.find((entry) => entry.id === id);

    expect(exported).toBeTruthy();
    expect(exported.origin).toEqual({ x: 50, y: -25 });
    // Mutating the exported state must not bleed back into the live layer.
    exported.origin.x = 999;
    expect(layer.origin.x).toBe(50);
  });

  test('importState restores origin to a fresh clone', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');
    const layer = engine.getLayerById(id);
    layer.origin = { x: 50, y: -25 };

    const state = engine.exportState();
    // Mutate the live layer between export and import to ensure we use the snapshot.
    layer.origin = { x: 0, y: 0 };

    engine.importState(state);
    const restored = engine.getLayerById(id);
    expect(restored).toBeTruthy();
    expect(restored.origin).toEqual({ x: 50, y: -25 });

    // Ensure restored origin is not shared with the export payload.
    state.layers.find((entry) => entry.id === id).origin.x = 12345;
    expect(restored.origin.x).toBe(50);
  });

  test('importState defaults origin to {x:0, y:0} when payload omits it', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');

    const state = engine.exportState();
    state.layers.forEach((entry) => {
      delete entry.origin;
    });

    engine.importState(state);
    const restored = engine.getLayerById(id);
    expect(restored).toBeTruthy();
    expect(restored.origin).toEqual({ x: 0, y: 0 });
  });
});
