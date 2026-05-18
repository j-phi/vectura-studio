const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('VectorEngine layer-management methods', () => {
  let runtime;
  let warnSpy;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  const buildEngine = () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const a = engine.addLayer('lissajous');
    const b = engine.addLayer('lissajous');
    const c = engine.addLayer('lissajous');
    return { engine, a, b, c };
  };

  describe('reorderLayers', () => {
    test('happy path with id array', () => {
      const { engine, a, b, c } = buildEngine();
      const result = engine.reorderLayers([c, a, b]);
      expect(result).toBe(true);
      expect(engine.layers.map((layer) => layer.id)).toEqual([c, a, b]);
    });

    test('happy path with layer-object array', () => {
      const { engine, a, b, c } = buildEngine();
      const layerC = engine.getLayerById(c);
      const layerA = engine.getLayerById(a);
      const layerB = engine.getLayerById(b);
      const result = engine.reorderLayers([layerB, layerC, layerA]);
      expect(result).toBe(true);
      expect(engine.layers.map((layer) => layer.id)).toEqual([b, c, a]);
    });

    test('mismatched id set leaves layers untouched and warns', () => {
      const { engine, a, b } = buildEngine();
      const before = engine.layers.map((layer) => layer.id);
      const result = engine.reorderLayers([a, b, 'unknown-id']);
      expect(result).toBe(false);
      expect(engine.layers.map((layer) => layer.id)).toEqual(before);
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toMatch(/^\[Engine\] /);
    });

    test('wrong length leaves layers untouched and warns', () => {
      const { engine, a, b } = buildEngine();
      const before = engine.layers.map((layer) => layer.id);
      const result = engine.reorderLayers([a, b]);
      expect(result).toBe(false);
      expect(engine.layers.map((layer) => layer.id)).toEqual(before);
      expect(warnSpy).toHaveBeenCalled();
    });

    test('non-array input warns and is a no-op', () => {
      const { engine } = buildEngine();
      const before = engine.layers.map((layer) => layer.id);
      const result = engine.reorderLayers('not-an-array');
      expect(result).toBe(false);
      expect(engine.layers.map((layer) => layer.id)).toEqual(before);
      expect(warnSpy).toHaveBeenCalled();
    });

    test('duplicate ids leave layers untouched and warns', () => {
      const { engine, a } = buildEngine();
      const before = engine.layers.map((layer) => layer.id);
      const result = engine.reorderLayers([a, a, a]);
      expect(result).toBe(false);
      expect(engine.layers.map((layer) => layer.id)).toEqual(before);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('deleteLayersById', () => {
    test('removes specified layers', () => {
      const { engine, a, b, c } = buildEngine();
      engine.setActiveLayerId(a);
      const result = engine.deleteLayersById([b]);
      expect(result).toBe(true);
      expect(engine.layers.map((layer) => layer.id)).toEqual([a, c]);
      expect(engine.activeLayerId).toBe(a);
    });

    test('clears activeLayerId when active layer is removed', () => {
      const { engine, a, b, c } = buildEngine();
      engine.setActiveLayerId(b);
      engine.deleteLayersById([b, c]);
      expect(engine.layers.map((layer) => layer.id)).toEqual([a]);
      expect(engine.activeLayerId).toBeNull();
    });

    test('ignores unknown ids and does not throw', () => {
      const { engine, a, b, c } = buildEngine();
      const result = engine.deleteLayersById(['unknown-1', 'unknown-2']);
      expect(result).toBe(false);
      expect(engine.layers.map((layer) => layer.id)).toEqual([a, b, c]);
    });

    test('non-array input warns and is a no-op', () => {
      const { engine, a, b, c } = buildEngine();
      const result = engine.deleteLayersById(null);
      expect(result).toBe(false);
      expect(engine.layers.map((layer) => layer.id)).toEqual([a, b, c]);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('setActiveLayerId', () => {
    test('accepts a known id', () => {
      const { engine, a, b } = buildEngine();
      const result = engine.setActiveLayerId(b);
      expect(result).toBe(true);
      expect(engine.activeLayerId).toBe(b);
      // Sanity: also accepts a different known id.
      engine.setActiveLayerId(a);
      expect(engine.activeLayerId).toBe(a);
    });

    test('accepts null and clears activeLayerId', () => {
      const { engine, a } = buildEngine();
      engine.setActiveLayerId(a);
      const result = engine.setActiveLayerId(null);
      expect(result).toBe(true);
      expect(engine.activeLayerId).toBeNull();
    });

    test('rejects unknown ids and warns', () => {
      const { engine, a } = buildEngine();
      engine.setActiveLayerId(a);
      const result = engine.setActiveLayerId('not-a-real-id');
      expect(result).toBe(false);
      expect(engine.activeLayerId).toBe(a);
      expect(warnSpy).toHaveBeenCalled();
    });

    test('rejects non-string non-null inputs and warns', () => {
      const { engine, a } = buildEngine();
      engine.setActiveLayerId(a);
      const result = engine.setActiveLayerId(42);
      expect(result).toBe(false);
      expect(engine.activeLayerId).toBe(a);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('duplicateLayer (shape source path meta)', () => {
    // Regression: shape paths carry `meta` (kind/closed/anchors/shape) as a
    // non-enumerable-friendly property attached to the array — `JSON.stringify`
    // drops it. If duplicateLayer round-trips sourcePaths through JSON, the
    // copy loses its `closed` flag and downstream pathfinder ops (Outline)
    // treat it as an open polyline, producing extra arcs.
    test('preserves path.meta (closed/anchors/shape) on shape duplicates', () => {
      const { VectorEngine } = runtime.window.Vectura;
      const engine = new VectorEngine();
      const anchors = [
        { x: 0, y: -10, in: { x: -5, y: -10 }, out: { x: 5, y: -10 } },
        { x: 10, y: 0, in: { x: 10, y: -5 }, out: { x: 10, y: 5 } },
        { x: 0, y: 10, in: { x: 5, y: 10 }, out: { x: 5, y: 10 } },
        { x: -10, y: 0, in: { x: -10, y: 5 }, out: { x: -10, y: -5 } },
      ];
      const path = [
        { x: 0, y: -10 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }, { x: 0, y: -10 },
      ];
      path.meta = { kind: 'shape', closed: true, anchors, shape: { type: 'oval', cx: 0, cy: 0, rx: 10, ry: 10 } };
      const id = engine.addShapeLayer('Oval', [path]);
      engine.duplicateLayer(id);
      const dup = engine.layers.find((l) => l.id !== id);
      expect(dup).toBeTruthy();
      const dupSource = dup.sourcePaths?.[0];
      expect(dupSource?.meta?.closed).toBe(true);
      expect(dupSource?.meta?.kind).toBe('shape');
      expect(dupSource?.meta?.shape?.type).toBe('oval');
      expect(Array.isArray(dupSource?.meta?.anchors)).toBe(true);
      expect(dupSource.meta.anchors.length).toBe(4);
    });
  });
});
