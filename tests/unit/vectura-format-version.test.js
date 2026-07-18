/*
 * AUD-02 regression coverage for `.vectura` schema versioning.
 *
 * Before this task, exportState()/importState() emitted a bare layer dump
 * with no schema version: params missing from an old file silently resolved
 * to *today's* defaults, so old files could render different art after a
 * defaults change, with no warning and no migration path.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('.vectura formatVersion + migration shim (AUD-02)', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const freshEngine = () => {
    const { VectorEngine } = runtime.window.Vectura;
    return new VectorEngine();
  };

  test('exportState stamps formatVersion 1 and registers it on the namespace', () => {
    const engine = freshEngine();
    engine.addLayer('lissajous');

    const state = engine.exportState();
    expect(state.formatVersion).toBe(1);
    expect(runtime.window.Vectura.VECTURA_FORMAT_VERSION).toBe(1);
  });

  test('a legacy payload without formatVersion (version 0) round-trips layers unchanged', () => {
    const engine = freshEngine();
    const id = engine.addLayer('lissajous');
    const layer = engine.getLayerById(id);
    layer.origin = { x: 12, y: 34 };

    const state = engine.exportState();
    const legacy = JSON.parse(JSON.stringify(state));
    delete legacy.formatVersion;

    engine.importState(legacy);
    const restored = engine.getLayerById(id);
    expect(restored).toBeTruthy();
    expect(restored.type).toBe('lissajous');
    expect(restored.origin).toEqual({ x: 12, y: 34 });
    // Params survive the legacy path identically to the versioned path.
    const versioned = freshEngine();
    versioned.importState(JSON.parse(JSON.stringify(state)));
    expect(restored.params).toEqual(versioned.getLayerById(id).params);
  });

  test('a payload from a future format still imports (best-effort forward compat)', () => {
    const engine = freshEngine();
    const id = engine.addLayer('lissajous');

    const state = engine.exportState();
    state.formatVersion = 999;

    engine.importState(state);
    const restored = engine.getLayerById(id);
    expect(restored).toBeTruthy();
    expect(restored.type).toBe('lissajous');
  });
});
