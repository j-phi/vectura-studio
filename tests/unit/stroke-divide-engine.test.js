/*
 * P0-B — Engine stroke-division stage.
 *
 * computeAllDisplayGeometry() ends by running applyStrokeDivision(): every
 * leaf layer with layer.divisions.enabled gets its post-optimization geometry
 * divided into layer.dividedPaths, which getRenderablePaths() serves at TOP
 * precedence — canvas, export, and stats consume fragments automatically.
 * Divisions persist through exportState()/importState(); legacy payloads
 * back-fill defaults via ensureLayerDivisions().
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const fragLen = (frag) => {
  if (!Array.isArray(frag)) return 0;
  let len = 0;
  for (let i = 1; i < frag.length; i++) {
    len += Math.hypot(frag[i].x - frag[i - 1].x, frag[i].y - frag[i - 1].y);
  }
  return len;
};

const totalLen = (paths) => (paths || []).reduce((s, p) => s + fragLen(p), 0);

describe('engine stroke-division stage', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeLineEngine = () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const src = [
      { x: 20, y: 20 },
      { x: 120, y: 20 },
    ];
    const id = engine.addShapeLayer('Divide Line', [src]);
    engine.computeAllDisplayGeometry();
    return { engine, id, layer: engine.getLayerById(id) };
  };

  test('new layers seed divisions from SETTINGS.divisionDefaults (disabled)', () => {
    const { layer } = makeLineEngine();
    expect(layer.divisions).toBeTruthy();
    expect(layer.divisions.enabled).toBe(false);
    expect(Array.isArray(layer.divisions.classes)).toBe(true);
    expect(layer.divisions.classes.length).toBeGreaterThan(0);
  });

  test('disabled divisions: dividedPaths stays null and output is unchanged', () => {
    const { engine, layer } = makeLineEngine();
    const base = engine.getRenderablePaths(layer, { useOptimized: true });
    expect(layer.dividedPaths).toBeNull();
    expect(base.length).toBe(1);
  });

  test('enabled divisions: getRenderablePaths returns fragments with penIds, gaps omitted', () => {
    const { engine, layer } = makeLineEngine();
    const base = engine.getRenderablePaths(layer, { useOptimized: true });
    const baseLen = totalLen(base);
    expect(baseLen).toBeGreaterThan(0);

    layer.divisions = {
      enabled: true,
      phaseMm: 0,
      classes: [
        { lenMm: baseLen * 0.3, penId: 'pen-frag' },
        { lenMm: baseLen * 0.2, gap: true },
      ],
    };
    engine.computeAllDisplayGeometry();

    expect(Array.isArray(layer.dividedPaths)).toBe(true);
    const out = engine.getRenderablePaths(layer, { useOptimized: true });
    expect(out).toBe(layer.dividedPaths);
    // Draw windows [0,.3L] and [.5L,.8L] — two fragments totaling 0.6L.
    expect(out).toHaveLength(2);
    out.forEach((f) => {
      expect(f.meta.penId).toBe('pen-frag');
      expect(typeof f.meta.parentKey).toBe('string');
    });
    expect(totalLen(out)).toBeCloseTo(baseLen * 0.6, 4);
  });

  test('stats distance and line count exclude gap spans', () => {
    const { engine, layer } = makeLineEngine();
    const base = engine.getRenderablePaths(layer, { useOptimized: true });
    const baseLen = totalLen(base);
    const statsBefore = engine.computeStats([layer]);
    expect(statsBefore.lines).toBe(1);

    layer.divisions = {
      enabled: true,
      phaseMm: 0,
      classes: [
        { lenMm: baseLen * 0.3, penId: null },
        { lenMm: baseLen * 0.2, gap: true },
      ],
    };
    engine.computeAllDisplayGeometry();

    const statsAfter = engine.computeStats([layer]);
    expect(statsAfter.lines).toBe(2);
    // The renderable geometry the stats measured excludes the gaps.
    expect(totalLen(engine.getRenderablePaths(layer, {}))).toBeCloseTo(baseLen * 0.6, 4);
  });

  test('re-disabling divisions clears dividedPaths and restores the base output', () => {
    const { engine, layer } = makeLineEngine();
    const base = engine.getRenderablePaths(layer, { useOptimized: true });
    layer.divisions = {
      enabled: true,
      phaseMm: 0,
      classes: [{ lenMm: 10, penId: null }, { lenMm: 2, gap: true }],
    };
    engine.computeAllDisplayGeometry();
    expect(Array.isArray(layer.dividedPaths)).toBe(true);

    layer.divisions.enabled = false;
    engine.computeAllDisplayGeometry();
    expect(layer.dividedPaths).toBeNull();
    const restored = engine.getRenderablePaths(layer, { useOptimized: true });
    expect(restored.length).toBe(base.length);
    expect(totalLen(restored)).toBeCloseTo(totalLen(base), 6);
  });

  test('exportState → importState round-trips divisions (deep clone)', () => {
    const { engine, id, layer } = makeLineEngine();
    layer.divisions = {
      enabled: true,
      phaseMm: 3.5,
      classes: [
        { lenMm: 12, penId: 'pen-x' },
        { lenMm: 4, gap: true },
      ],
    };
    const state = engine.exportState();

    // Mutate the live layer to prove import restores from the snapshot.
    layer.divisions = { enabled: false, phaseMm: 0, classes: [] };
    engine.importState(state);

    const restored = engine.getLayerById(id);
    expect(restored.divisions.enabled).toBe(true);
    expect(restored.divisions.phaseMm).toBe(3.5);
    expect(restored.divisions.classes).toEqual([
      { lenMm: 12, penId: 'pen-x', gap: false },
      { lenMm: 4, penId: null, gap: true },
    ]);
    // Imported divisions must be a fresh clone, not shared with the payload.
    state.layers.find((entry) => entry.id === id).divisions.classes[0].lenMm = 99;
    expect(restored.divisions.classes[0].lenMm).toBe(12);
    // And division actually re-applied on import.
    expect(Array.isArray(restored.dividedPaths)).toBe(true);
  });

  test('legacy payloads without divisions back-fill defaults on import', () => {
    const { engine, id } = makeLineEngine();
    const state = engine.exportState();
    state.layers.forEach((entry) => {
      delete entry.divisions;
    });
    engine.importState(state);
    const layer = engine.getLayerById(id);
    expect(layer.divisions).toBeTruthy();
    expect(layer.divisions.enabled).toBe(false);
    expect(layer.dividedPaths).toBeNull();
  });

  test('ensureLayerDivisions normalizes garbage via StrokeDivide.sanitizeDivisions', () => {
    const { engine, layer } = makeLineEngine();
    layer.divisions = { enabled: 'yes', phaseMm: 'x', classes: [{ lenMm: -2, penId: 7 }, null] };
    const out = engine.ensureLayerDivisions(layer);
    expect(out).toBe(layer.divisions);
    expect(out.enabled).toBe(true);
    expect(out.phaseMm).toBe(0);
    expect(out.classes).toEqual([{ lenMm: 0, penId: null, gap: false }]);
  });

  test('direct optimizeLayers calls recut dividedPaths (no stale fragments)', () => {
    const { engine, layer } = makeLineEngine();
    layer.divisions = {
      enabled: true,
      phaseMm: 0,
      classes: [{ lenMm: 10, penId: null }, { lenMm: 5, gap: true }],
    };
    engine.computeAllDisplayGeometry();
    const before = layer.dividedPaths.map((frag) => frag.map((pt) => ({ ...pt })));
    expect(before.length).toBeGreaterThan(0);

    // Mimic the optimization panel / export preview: mutate geometry, then
    // call optimizeLayers directly WITHOUT computeAllDisplayGeometry. The
    // division stage must recut from the fresh source, not serve stale cuts.
    layer.sourcePaths = [[{ x: 20, y: 20 }, { x: 220, y: 20 }]];
    layer.paths = [Object.assign([{ x: 20, y: 20 }, { x: 220, y: 20 }], { meta: {} })];
    engine.optimizeLayers([layer]);

    const after = layer.dividedPaths;
    expect(after.length).toBeGreaterThan(before.length);
    expect(totalLen(after)).toBeGreaterThan(totalLen(before) + 50);
  });

  test('coincident duplicate parents inside one layer dedupe fragment-by-fragment', () => {
    const { SETTINGS } = runtime.window.Vectura;
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const src = [{ x: 20, y: 20 }, { x: 70, y: 20 }];
    const id = engine.addShapeLayer('Dup Parents', [src, src.map((p) => ({ ...p }))]);
    const layer = engine.getLayerById(id);
    const savedOpt = SETTINGS.plotterOptimize;
    try {
      SETTINGS.plotterOptimize = 0.1;
      engine.computeAllDisplayGeometry();
      const baseline = engine.computeStats([layer], {});
      expect(baseline.lines).toBe(1); // duplicate dropped, divisions off

      layer.divisions = {
        enabled: true,
        phaseMm: 0,
        classes: [{ lenMm: 10, penId: null }],
      };
      engine.computeAllDisplayGeometry();
      expect(layer.dividedPaths.length).toBe(10); // 5 per parent, pre-dedupe
      const stats = engine.computeStats([layer], {});
      // Second identical parent's fragments drop via the composite key: 5, not 10.
      expect(stats.lines).toBe(5);
    } finally {
      SETTINGS.plotterOptimize = savedOpt;
    }
  });

  test('a divided layer and an identical undivided layer both plot (explicit overplot)', () => {
    const { SETTINGS, VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const src = [{ x: 20, y: 20 }, { x: 70, y: 20 }];
    const idA = engine.addShapeLayer('Divided', [src.map((p) => ({ ...p }))]);
    const idB = engine.addShapeLayer('Plain', [src.map((p) => ({ ...p }))]);
    const layerA = engine.getLayerById(idA);
    const layerB = engine.getLayerById(idB);
    const savedOpt = SETTINGS.plotterOptimize;
    try {
      SETTINGS.plotterOptimize = 0.1;
      layerA.divisions = { enabled: true, phaseMm: 0, classes: [{ lenMm: 10, penId: null }] };
      engine.computeAllDisplayGeometry();
      // 'pk:'-namespaced parentKeys never collide with plain pathKeys, so the
      // undivided duplicate survives in BOTH layer orders (canvas reference).
      expect(engine.computeStats([layerA, layerB], {}).lines).toBe(6);
      expect(engine.computeStats([layerB, layerA], {}).lines).toBe(6);
    } finally {
      SETTINGS.plotterOptimize = savedOpt;
    }
  });

  test('fragment cap is a per-layer budget, not per-path', () => {
    const { StrokeDivide, VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const mk = (y) => [{ x: 0, y }, { x: 100, y }];
    const id = engine.addShapeLayer('Budget', [mk(0), mk(10), mk(20)]);
    const layer = engine.getLayerById(id);
    layer.divisions = { enabled: true, phaseMm: 0, classes: [{ lenMm: 5, penId: null }] };
    const savedCap = StrokeDivide.MAX_FRAGMENTS;
    try {
      // 100mm/5mm = 20 fragments per path; a per-path cap would emit 60.
      StrokeDivide.MAX_FRAGMENTS = 30;
      engine.computeAllDisplayGeometry();
      // 30 budgeted fragments + pass-through parents for the remainder.
      expect(layer.dividedPaths.length).toBeLessThanOrEqual(32);
      expect(layer.dividedPaths.length).toBeGreaterThanOrEqual(30);
    } finally {
      StrokeDivide.MAX_FRAGMENTS = savedCap;
    }
  });

  test('duplicateLayer deep-copies divisions', () => {
    const { engine, id, layer } = makeLineEngine();
    layer.divisions = {
      enabled: true,
      phaseMm: 5,
      classes: [{ lenMm: 7, penId: 'pen-2' }, { lenMm: 2, gap: true }],
    };
    const dup = engine.duplicateLayer(id);
    expect(dup.divisions).toEqual(layer.divisions);
    expect(dup.divisions).not.toBe(layer.divisions);
    expect(dup.divisions.classes).not.toBe(layer.divisions.classes);
  });

  test('preDivision stats see the undivided source (before/after optimization stats differ)', () => {
    const { engine, layer } = makeLineEngine();
    layer.divisions = {
      enabled: true,
      phaseMm: 0,
      classes: [{ lenMm: 10, penId: null }, { lenMm: 10, gap: true }],
    };
    engine.computeAllDisplayGeometry();
    const divided = engine.computeStats([layer], { useOptimized: true });
    const preDivision = engine.computeStats([layer], { useOptimized: false, includePlotterOptimize: false, preDivision: true });
    expect(preDivision.lines).toBe(1); // the single undivided parent
    expect(divided.lines).toBeGreaterThan(1); // fragments
    // Gap spans mean the divided plot distance is shorter than the source.
    expect(parseInt(preDivision.distance, 10)).toBeGreaterThanOrEqual(parseInt(divided.distance, 10));
  });

  test('a missing StrokeDivide module degrades to a no-op (no crash)', () => {
    const { engine, layer } = makeLineEngine();
    layer.divisions = {
      enabled: true,
      phaseMm: 0,
      classes: [{ lenMm: 10, penId: null }, { lenMm: 2, gap: true }],
    };
    const saved = runtime.window.Vectura.StrokeDivide;
    try {
      delete runtime.window.Vectura.StrokeDivide;
      expect(() => engine.computeAllDisplayGeometry()).not.toThrow();
      expect(layer.dividedPaths).toBeNull();
    } finally {
      runtime.window.Vectura.StrokeDivide = saved;
    }
  });
});
