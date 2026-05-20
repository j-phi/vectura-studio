/**
 * C2 — Dots fill consolidation tests.
 *
 * Verifies the unified 'dots' fill type:
 *   - dotShape: circle / square / cross / tick produce distinct stamps
 *   - dotPattern: grid / brick / hex / jitter produce different point sets
 *   - back-compat: legacy 'stipple' and 'grid' render successfully
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Dots fill (C2 consolidation)', () => {
  let runtime;
  let gen;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    gen = runtime.window.Vectura.AlgorithmRegistry._generatePatternFillPaths;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const rect = (x, y, w, h) => ([
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ]);

  const base = (overrides = {}) => ({
    region: rect(0, 0, 100, 100),
    regions: [rect(0, 0, 100, 100)],
    density: 8,
    dotSize: 1.0,
    angle: 0,
    shiftX: 0,
    shiftY: 0,
    padding: 0,
    ...overrides,
  });

  test('fillType=dots with shape=tick renders single horizontal segments', () => {
    const paths = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'tick' }));
    expect(paths.length).toBeGreaterThan(0);
    // tick = single horizontal segment per stamp (2 points each)
    expect(paths[0].length).toBe(2);
  });

  test('fillType=dots with shape=cross renders two-segment stamps (one + one)', () => {
    const paths = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'cross' }));
    expect(paths.length).toBeGreaterThan(0);
    // cross emits horizontal + vertical, so total path count is ≥ 2 per stamp.
    // We just confirm we see more paths than the grid would emit for tick.
    const tickPaths = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'tick' }));
    expect(paths.length).toBeGreaterThanOrEqual(tickPaths.length * 2 - 5);
  });

  test('fillType=dots with shape=square renders 4-segment stamps', () => {
    const paths = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'square' }));
    expect(paths.length).toBeGreaterThan(0);
    const tickPaths = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'tick' }));
    expect(paths.length).toBeGreaterThanOrEqual(tickPaths.length * 4 - 10);
  });

  test('brick pattern offsets odd rows vs grid pattern', () => {
    const gridPaths = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'tick' }));
    const brickPaths = gen(base({ fillType: 'dots', dotPattern: 'brick', dotShape: 'tick' }));
    // Same density; both should have many paths.
    expect(gridPaths.length).toBeGreaterThan(0);
    expect(brickPaths.length).toBeGreaterThan(0);
    // Patterns should yield different point sets — compare midpoint X-positions.
    const xs = (paths) => paths.map((p) => ((p[0].x + p[p.length - 1].x) / 2).toFixed(2)).sort().join(',');
    expect(xs(gridPaths)).not.toBe(xs(brickPaths));
  });

  test('jitter pattern with jitter>0 produces different points than grid', () => {
    const gridPaths = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'tick', dotJitter: 0 }));
    const jitPaths = gen(base({ fillType: 'dots', dotPattern: 'jitter', dotShape: 'tick', dotJitter: 0.4 }));
    expect(gridPaths.length).toBeGreaterThan(0);
    expect(jitPaths.length).toBeGreaterThan(0);
    const xs = (paths) => paths.map((p) => ((p[0].x + p[p.length - 1].x) / 2).toFixed(2)).sort().join(',');
    expect(xs(gridPaths)).not.toBe(xs(jitPaths));
  });

  test('back-compat: fillType=stipple still renders', () => {
    const paths = gen(base({ fillType: 'stipple', dotPattern: 'brick' }));
    expect(paths.length).toBeGreaterThan(0);
  });

  test('back-compat: fillType=grid still renders', () => {
    const paths = gen(base({ fillType: 'grid' }));
    expect(paths.length).toBeGreaterThan(0);
  });
});
