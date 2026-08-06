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
    out.forEach((f, i) => {
      expect(f.meta.penId).toBe('pen-frag');
      // GAPPED cycle -> fragments cover only part of the parent, so they do NOT
      // claim it (no parentGeom) but still carry a stable per-parent index.
      expect(f.meta.parentGeom).toBeUndefined();
      expect(f.meta.fragIndex).toBe(i);
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
      { lenMm: 12, penId: 'pen-x', gap: false, weight: 1 },
      { lenMm: 4, penId: null, gap: true, weight: 1 },
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
    expect(out.classes).toEqual([{ lenMm: 0, penId: null, gap: false, weight: 1 }]);
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

  test('Fix-A: a GAPLESS divided layer + an identical undivided layer on the same pen ink ONCE (order-independent)', () => {
    const { SETTINGS, VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const src = [{ x: 20, y: 20 }, { x: 70, y: 20 }]; // 50mm, drawn whole -> 5 frags
    const idA = engine.addShapeLayer('Divided', [src.map((p) => ({ ...p }))]);
    const idB = engine.addShapeLayer('Plain', [src.map((p) => ({ ...p }))]);
    const layerA = engine.getLayerById(idA);
    const layerB = engine.getLayerById(idB);
    const savedOpt = SETTINGS.plotterOptimize;
    try {
      SETTINGS.plotterOptimize = 0.5; // > the divider's old fixed 0.001 quant
      layerA.divisions = { enabled: true, phaseMm: 0, classes: [{ lenMm: 10, penId: null }] };
      engine.computeAllDisplayGeometry();
      // Gapless single-pen fragments claim the parent at the plotter tolerance,
      // so the coincident undivided solid always drops (divided ink wins) — the
      // shared 50mm geometry inks ONCE, never the old double-ink of 6, and the
      // result is stack-order INDEPENDENT: 5 fragments survive in BOTH orders.
      expect(engine.computeStats([layerA, layerB], {}).lines).toBe(5);
      expect(engine.computeStats([layerB, layerA], {}).lines).toBe(5);
    } finally {
      SETTINGS.plotterOptimize = savedOpt;
    }
  });

  test('Fix-A: a DASHED (gapped) divided layer + a coincident SOLID both ink so gaps are covered (order-independent)', () => {
    const { SETTINGS, VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const src = [{ x: 0, y: 0 }, { x: 20, y: 0 }]; // 20mm parent
    const idA = engine.addShapeLayer('Dashed', [src.map((p) => ({ ...p }))]);
    const idB = engine.addShapeLayer('Solid', [src.map((p) => ({ ...p }))]);
    const layerA = engine.getLayerById(idA);
    const layerB = engine.getLayerById(idB);
    const savedOpt = SETTINGS.plotterOptimize;
    try {
      SETTINGS.plotterOptimize = 0.5;
      // 5mm dash + 5mm gap over 20mm -> fragments [0,5] and [10,15] (cover 10mm).
      layerA.divisions = {
        enabled: true,
        phaseMm: 0,
        classes: [{ lenMm: 5, penId: null }, { lenMm: 5, gap: true }],
      };
      engine.computeAllDisplayGeometry();
      expect(layerA.dividedPaths).toHaveLength(2);
      // The gapped fragments cover only part of the parent, so they must NOT
      // suppress the solid: 2 dash fragments + 1 solid = 3, in BOTH stack
      // orders. The gap regions [5,10] and [15,20] are inked by the solid.
      // (Before the gap-aware fix the fragments wrongly claimed the whole
      //  parent and the solid was dropped -> 2, losing the gap ink.)
      expect(engine.computeStats([layerA, layerB], {}).lines).toBe(3);
      expect(engine.computeStats([layerB, layerA], {}).lines).toBe(3);
    } finally {
      SETTINGS.plotterOptimize = savedOpt;
    }
  });

  test('Fix-A guard: an undivided duplicate on a DIFFERENT pen is NOT merged (pen separates ink)', () => {
    const { SETTINGS, VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const src = [{ x: 20, y: 20 }, { x: 70, y: 20 }];
    const idA = engine.addShapeLayer('Divided', [src.map((p) => ({ ...p }))]);
    const idB = engine.addShapeLayer('Plain', [src.map((p) => ({ ...p }))]);
    const layerA = engine.getLayerById(idA);
    const layerB = engine.getLayerById(idB);
    const savedOpt = SETTINGS.plotterOptimize;
    const savedPens = SETTINGS.pens;
    try {
      SETTINGS.plotterOptimize = 0.5;
      SETTINGS.pens = [
        { id: 'pen-a', name: 'A', color: '#000', width: 0.3 },
        { id: 'pen-b', name: 'B', color: '#111', width: 0.3 },
      ];
      layerA.penId = 'pen-a';
      layerB.penId = 'pen-b';
      layerA.divisions = { enabled: true, phaseMm: 0, classes: [{ lenMm: 10, penId: null }] };
      engine.computeAllDisplayGeometry();
      // Different effective pens -> different dedupe buckets -> both ink.
      // 5 fragments (pen-a) + 1 undivided path (pen-b) = 6.
      expect(engine.computeStats([layerA, layerB], {}).lines).toBe(6);
      expect(engine.computeStats([layerB, layerA], {}).lines).toBe(6);
    } finally {
      SETTINGS.plotterOptimize = savedOpt;
      SETTINGS.pens = savedPens;
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

  // ── Phase 4A Inc-3 — deferred grammar wired through the engine ────────────

  const makeMultiPathEngine = (segs) => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addShapeLayer('Multi', segs);
    engine.computeAllDisplayGeometry();
    return { engine, layer: engine.getLayerById(id) };
  };

  test('Inc-3 phaseMode fixed vs perPath: fixed dashes as ONE continuous ruler across sub-paths', () => {
    // Two collinear 10mm sub-paths, draw15 / gap5. fixed: the ruler carries
    // across the seam -> 15mm drawn. perPath: each sub-path restarts -> 20mm.
    const segs = [[{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 10, y: 0 }, { x: 20, y: 0 }]];
    const { engine, layer } = makeMultiPathEngine(segs);
    layer.divisions = {
      enabled: true, phaseMm: 0, phaseMode: 'fixed',
      classes: [{ lenMm: 15, penId: null }, { lenMm: 5, gap: true }],
    };
    engine.computeAllDisplayGeometry();
    const fixedLen = totalLen(layer.dividedPaths);
    expect(fixedLen).toBeCloseTo(15, 4);

    layer.divisions.phaseMode = 'perPath';
    engine.computeAllDisplayGeometry();
    const perPathLen = totalLen(layer.dividedPaths);
    expect(perPathLen).toBeCloseTo(20, 4);
    expect(perPathLen).not.toBeCloseTo(fixedLen, 2);
  });

  test('Inc-3 weighted penMode spreads fragments across pens deterministically', () => {
    const { engine, layer } = makeMultiPathEngine([[{ x: 0, y: 0 }, { x: 1000, y: 0 }]]);
    layer.divisions = {
      enabled: true, phaseMm: 0, penMode: 'weighted', seed: 0,
      classes: [
        { lenMm: 10, penId: 'pen-a', weight: 1 },
        { lenMm: 10, penId: 'pen-b', weight: 3 },
      ],
    };
    engine.computeAllDisplayGeometry();
    const seq = () => layer.dividedPaths.map((f) => f.meta.penId);
    const first = seq();
    const counts = first.reduce((a, p) => { a[p] = (a[p] || 0) + 1; return a; }, {});
    expect(counts['pen-a']).toBeGreaterThan(0);
    expect(counts['pen-b']).toBeGreaterThan(counts['pen-a']); // heavier weight wins
    // Deterministic: recompute yields the identical pen sequence.
    engine.computeAllDisplayGeometry();
    expect(seq()).toEqual(first);
  });

  test('Inc-3 weighted (multi-pen) does NOT claim a coincident solid — Inc-0 dedup holds', () => {
    const { SETTINGS, VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const idA = engine.addShapeLayer('Weighted', [src.map((p) => ({ ...p }))]);
    const idB = engine.addShapeLayer('Solid', [src.map((p) => ({ ...p }))]);
    const layerA = engine.getLayerById(idA);
    const layerB = engine.getLayerById(idB);
    const savedOpt = SETTINGS.plotterOptimize;
    try {
      SETTINGS.plotterOptimize = 0.5;
      // Gapless weighted division across two pens -> inherently multi-pen, so it
      // must NOT claim the parent; the coincident solid legitimately survives.
      layerA.divisions = {
        enabled: true, phaseMm: 0, penMode: 'weighted', seed: 0,
        classes: [{ lenMm: 10, penId: 'pen-a', weight: 1 }, { lenMm: 10, penId: 'pen-b', weight: 1 }],
      };
      engine.computeAllDisplayGeometry();
      const distinct = new Set(layerA.dividedPaths.map((f) => f.meta.penId));
      expect(distinct.size).toBeGreaterThan(1); // genuinely multi-pen
      layerA.dividedPaths.forEach((f) => expect(f.meta.parentGeom).toBeUndefined());
      // The solid is not suppressed: fragments + 1 solid, in both stack orders.
      const linesAB = engine.computeStats([layerA, layerB], {}).lines;
      const linesBA = engine.computeStats([layerB, layerA], {}).lines;
      expect(linesAB).toBe(linesBA);
      expect(linesAB).toBe(layerA.dividedPaths.length + 1);
    } finally {
      SETTINGS.plotterOptimize = savedOpt;
    }
  });

  test('Inc-3 division seed 0 and 1 produce DISTINCT weighted output (no 0/1 fold), seed 0 byte-identical', () => {
    // Regression: _divisionSeed used `divSeed || 1`, which aliased division
    // seed 1 onto seed 0 (both -> mixing operand 1), so a user changing the
    // default division seed 0 -> 1 saw NO change. The fix keeps seed 0 on its
    // historical operand (default docs stay byte-identical) but routes seed 1
    // to a distinct operand.
    const weightedSeed = (seed) => {
      const { VectorEngine } = runtime.window.Vectura;
      const engine = new VectorEngine();
      const id = engine.addShapeLayer('SeedFold', [[{ x: 0, y: 0 }, { x: 1000, y: 0 }]]);
      const layer = engine.getLayerById(id);
      layer.divisions = {
        enabled: true, phaseMm: 0, penMode: 'weighted', seed,
        classes: [
          { lenMm: 10, penId: 'pen-a', weight: 1 },
          { lenMm: 10, penId: 'pen-b', weight: 3 },
        ],
      };
      engine.computeAllDisplayGeometry();
      const fp = layer.dividedPaths.map((f) => (f.meta.penId === 'pen-a' ? 'a' : 'b')).join('');
      const mix = engine._divisionSeed(layer, layer.divisions);
      return { fp, mix };
    };

    // Captured baseline — seed 0 (the DEFAULT) must stay byte-identical so
    // existing saved docs plot exactly as before. The mixing operand is the
    // historical `0 ^ Math.imul(1, 0x9e3779b1)` and the pen sequence is its
    // exact deterministic product.
    const SEED0_MIX = -1640531535;
    const SEED0_FINGERPRINT =
      'abbbbbbbbbbbbbbbbbaaaabbbbbbbbabbbabbabbbbbbabbabbabbaabbbbbaaaabaabbbbbabbbbbbbbbbbbaaabaaabbbbabba';

    const s0 = weightedSeed(0);
    const s1 = weightedSeed(1);

    // (a) seed 0 unchanged vs the captured baseline.
    expect(s0.mix).toBe(SEED0_MIX);
    expect(s0.fp).toBe(SEED0_FINGERPRINT);
    // (b) seed 1 no longer folds onto seed 0 — distinct mix AND distinct output.
    expect(s1.mix).not.toBe(s0.mix);
    expect(s1.fp).not.toBe(s0.fp);
    // (c) each seed remains deterministic (reproducible on recompute).
    expect(weightedSeed(1).fp).toBe(s1.fp);
    expect(weightedSeed(0).fp).toBe(s0.fp);
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
