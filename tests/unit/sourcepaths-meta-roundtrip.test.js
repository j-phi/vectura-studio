const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('VectorEngine sourcePaths meta.anchors round-trip', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  function makeShapeLayerWithBezierPath(engine) {
    const bezierPath = [
      { x: 50, y: 100 },
      { x: 75, y: 50 },
      { x: 100, y: 75 },
      { x: 125, y: 100 },
    ];
    bezierPath.meta = {
      anchors: [
        { x: 50, y: 100, in: null, out: { x: 55, y: 85 } },
        { x: 75, y: 50, in: { x: 65, y: 55 }, out: { x: 85, y: 45 } },
        { x: 100, y: 75, in: { x: 90, y: 70 }, out: { x: 110, y: 80 } },
        { x: 125, y: 100, in: { x: 115, y: 90 }, out: null },
      ],
      closed: false,
    };
    const id = engine.addShapeLayer('Test Shape', [bezierPath]);
    return id;
  }

  test('exportState preserves meta.anchors on sourcePaths', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = makeShapeLayerWithBezierPath(engine);

    const state = engine.exportState();
    const exported = state.layers.find((l) => l.id === id);

    expect(exported).toBeTruthy();
    expect(Array.isArray(exported.sourcePaths)).toBe(true);
    const sp = exported.sourcePaths[0];
    // New format: {points, meta}
    expect(sp).toHaveProperty('meta');
    expect(sp.meta).toHaveProperty('anchors');
    expect(sp.meta.anchors).toHaveLength(4);
    expect(sp.meta.anchors[0].out).toEqual({ x: 55, y: 85 });
    expect(sp.meta.anchors[1].in).toEqual({ x: 65, y: 55 });
    expect(sp.meta.anchors[1].out).toEqual({ x: 85, y: 45 });
    expect(sp.meta.anchors[3].in).toEqual({ x: 115, y: 90 });
    expect(sp.meta.anchors[3].out).toBeNull();
  });

  test('importState restores meta.anchors on sourcePaths', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = makeShapeLayerWithBezierPath(engine);

    const state = engine.exportState();
    engine.importState(state);

    const restored = engine.getLayerById(id);
    expect(restored).toBeTruthy();
    expect(Array.isArray(restored.sourcePaths)).toBe(true);
    const sp = restored.sourcePaths[0];
    expect(sp.meta).toHaveProperty('anchors');
    expect(sp.meta.anchors).toHaveLength(4);
    expect(sp.meta.anchors[0].out).toEqual({ x: 55, y: 85 });
    expect(sp.meta.anchors[1].in).toEqual({ x: 65, y: 55 });
    expect(sp.meta.anchors[1].out).toEqual({ x: 85, y: 45 });
    expect(sp.meta.anchors[3].in).toEqual({ x: 115, y: 90 });
    expect(sp.meta.anchors[3].out).toBeNull();
  });

  test('meta.anchors survive export→JSON.stringify→JSON.parse→importState (file save/load)', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = makeShapeLayerWithBezierPath(engine);

    const state = engine.exportState();
    // Simulate JSON round-trip as done in saveVecturaFile
    const jsonState = JSON.parse(JSON.stringify(state));
    engine.importState(jsonState.engine || jsonState);

    const restored = engine.getLayerById(id);
    expect(restored).toBeTruthy();
    const sp = restored.sourcePaths[0];
    expect(sp.meta).toHaveProperty('anchors');
    expect(sp.meta.anchors).toHaveLength(4);
    expect(sp.meta.anchors[1].in).toEqual({ x: 65, y: 55 });
  });

  test('legacy plain-array sourcePaths still load without meta', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = makeShapeLayerWithBezierPath(engine);

    const state = engine.exportState();
    // Simulate a legacy .vectura file where sourcePaths entries are plain arrays
    const legacyLayer = state.layers.find((l) => l.id === id);
    legacyLayer.sourcePaths = [
      [{ x: 50, y: 100 }, { x: 75, y: 50 }, { x: 100, y: 75 }, { x: 125, y: 100 }],
    ];
    engine.importState(state);

    const restored = engine.getLayerById(id);
    expect(restored).toBeTruthy();
    expect(Array.isArray(restored.sourcePaths)).toBe(true);
    expect(restored.sourcePaths[0]).toHaveLength(4);
  });
});
