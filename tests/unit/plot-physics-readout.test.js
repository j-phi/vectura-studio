/*
 * Phase 4A Increment 2 — plot-physics readout (READ-ONLY).
 *
 * engine.computeStats(layers, { physics: true }) additionally returns a per-pen
 * plot-physics breakdown (pen lifts, pen-down draw length, pen-up travel, an
 * estimated time from the machine feed rates, and a K-05 sub-resolution guard)
 * plus a document-total `physics` object. It reuses the EXISTING pen-resolution
 * + dedup path (PenValidate.resolveEffectivePenId + the shared plot deduper) —
 * a stale/unknown meta.penId counts under the pen it actually plots with.
 *
 * These assertions reference computeStats' `perPen`/`physics` output, which does
 * not exist on the base branch, so the whole file is red before this increment.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const mkPath = (pts, meta) => {
  const p = pts.map((pt) => ({ x: pt[0], y: pt[1] }));
  if (meta) p.meta = meta;
  return p;
};

describe('plot-physics readout (computeStats physics)', () => {
  let runtime;
  let SETTINGS;
  let VectorEngine;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    SETTINGS = runtime.window.Vectura.SETTINGS;
    VectorEngine = runtime.window.Vectura.VectorEngine;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  afterEach(() => {
    SETTINGS.plotterOptimize = 0;
  });

  const addLayer = (engine, name, paths, penId) => {
    const id = engine.addShapeLayer(name, [[{ x: 0, y: 0 }, { x: 1, y: 0 }]]);
    const layer = engine.getLayerById(id);
    layer.visible = true;
    layer.penId = penId ?? null;
    layer.paths = paths;
    layer.effectivePaths = [];
    return layer;
  };

  const penOf = (result, penId) => (result.perPen || []).find((p) => p.penId === penId);

  test('(a) two paths on one pen → lifts=2 and travel = exact end→start gap', () => {
    const engine = new VectorEngine();
    // path 1 ends at (10,0); path 2 starts at (20,0): pen-up gap = 10.
    addLayer(engine, 'L0', [
      mkPath([[0, 0], [10, 0]]),
      mkPath([[20, 0], [30, 0]]),
    ], 'pen-1');

    const result = engine.computeStats(engine.layers, { physics: true });
    const pen = penOf(result, 'pen-1');
    expect(pen).toBeTruthy();
    expect(pen.lifts).toBe(2);
    expect(pen.draw).toBeCloseTo(20, 9);   // 10 + 10 drawn
    expect(pen.travel).toBeCloseTo(10, 9); // the single pen-up move
    expect(result.physics.travel).toBeCloseTo(10, 9);
    expect(result.physics.lifts).toBe(2);
  });

  test('(b) K-05 min-segment guard flags a tiny stroke, not a normal one', () => {
    SETTINGS.minSegmentMm = 0.1;
    const engine = new VectorEngine();
    addLayer(engine, 'L0', [
      mkPath([[0, 0], [10, 0]]),        // 10mm — normal, not flagged
      mkPath([[0, 5], [0.05, 5]]),      // 0.05mm — sub-resolution, flagged
    ], 'pen-1');

    const result = engine.computeStats(engine.layers, { physics: true });
    const pen = penOf(result, 'pen-1');
    expect(pen.shortSegments).toBe(1);
    expect(result.physics.shortSegments).toBe(1);
  });

  test('(b2) min-gap guard flags a sub-resolution pen-up move', () => {
    SETTINGS.minGapMm = 0.1;
    const engine = new VectorEngine();
    // gap between path 1 end (10,0) and path 2 start (10.05,0) = 0.05mm.
    addLayer(engine, 'L0', [
      mkPath([[0, 0], [10, 0]]),
      mkPath([[10.05, 0], [20, 0]]),
    ], 'pen-1');

    const result = engine.computeStats(engine.layers, { physics: true });
    expect(penOf(result, 'pen-1').shortGaps).toBe(1);
  });

  test('(c) estimated time matches the documented formula on known lengths + feed rates', () => {
    SETTINGS.speedDown = 250;
    SETTINGS.speedUp = 300;
    SETTINGS.penLiftTime = 0.1;
    const engine = new VectorEngine();
    addLayer(engine, 'L0', [
      mkPath([[0, 0], [10, 0]]),
      mkPath([[20, 0], [30, 0]]),
    ], 'pen-1');

    const result = engine.computeStats(engine.layers, { physics: true });
    const pen = penOf(result, 'pen-1');
    // draw/draw_speed + travel/travel_speed + lifts*lift_time
    const expected = 20 / 250 + 10 / 300 + 2 * 0.1;
    expect(pen.timeSec).toBeCloseTo(expected, 9);
    expect(result.physics.timeSec).toBeCloseTo(expected, 9);
  });

  test('(d) per-pen split follows the resolved effective pen; a stale penId counts under its resolved pen', () => {
    const engine = new VectorEngine();
    // Layer pen is pen-1. One path carries a real per-path override (pen-2);
    // another carries a stale/unknown penId ('ghost') that must resolve to the
    // layer pen (pen-1) — never a phantom 'ghost' bucket.
    addLayer(engine, 'L0', [
      mkPath([[0, 0], [10, 0]]),                             // → pen-1 (layer)
      mkPath([[0, 5], [10, 5]], { penId: 'pen-2' }),         // → pen-2 (real override)
      mkPath([[0, 9], [10, 9]], { penId: 'ghost' }),         // stale → pen-1
    ], 'pen-1');

    const result = engine.computeStats(engine.layers, { physics: true });
    expect(penOf(result, 'ghost')).toBeFalsy();
    expect(penOf(result, 'pen-1').lifts).toBe(2); // layer path + coerced stale path
    expect(penOf(result, 'pen-2').lifts).toBe(1);
  });

  test('does NOT alter the existing global stat shape (backward compatible)', () => {
    const engine = new VectorEngine();
    addLayer(engine, 'L0', [mkPath([[0, 0], [10, 0]])], 'pen-1');
    const plain = engine.computeStats(engine.layers, {});
    expect(plain.perPen).toBeUndefined();
    expect(plain.physics).toBeUndefined();
    expect(typeof plain.distance).toBe('string');
    expect(typeof plain.time).toBe('string');
  });
});
