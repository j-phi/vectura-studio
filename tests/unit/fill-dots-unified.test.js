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
    // Use a sparse density (low value = sparse, since higher Fill Density = denser)
    // so few stamps straddle the region boundary and the 4×-segments relationship
    // is not masked by edge clipping.
    const sparse = { fillType: 'dots', dotPattern: 'grid', density: 2 };
    const paths = gen(base({ ...sparse, dotShape: 'square' }));
    expect(paths.length).toBeGreaterThan(0);
    const tickPaths = gen(base({ ...sparse, dotShape: 'tick' }));
    // Boundary clipping removes some sides of stamps at polygon edges — allow ~30 clipped sides.
    expect(paths.length).toBeGreaterThanOrEqual(tickPaths.length * 4 - 30);
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

  test('Dot Size = 0 with shape=circle emits round point dots, not angle-oriented ovals', () => {
    const paths = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'circle', dotLength: 0, angle: 45 }));
    expect(paths.length).toBeGreaterThan(0);
    // a round dot is a zero-length segment (start === end); a tick/oval would
    // have endpoints offset along the fill angle.
    expect(paths.every((p) => p[0].x === p[p.length - 1].x && p[0].y === p[p.length - 1].y)).toBe(true);
  });

  test('Dot Size > 0 with shape=square renders straight glyph edges, not spirals', () => {
    const paths = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'square', dotLength: 4 }));
    expect(paths.length).toBeGreaterThan(0);
    // square glyph edges are straight 2-point segments; spirals would be long polylines
    expect(paths.every((p) => p.length === 2)).toBe(true);
  });

  test('Dot Size > 0 with shape=circle renders spiral polylines', () => {
    const paths = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'circle', dotLength: 4 }));
    expect(paths.length).toBeGreaterThan(0);
    // circle dots fill as spirals -> multi-point polylines
    expect(paths.some((p) => p.length > 2)).toBe(true);
  });

  test('Dot Shape changes output when Dot Size > 0 (square != circle)', () => {
    const sig = (paths) => paths.map((p) => p.length).sort((a, b) => a - b).join(',');
    const sq = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'square', dotLength: 4 }));
    const ci = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'circle', dotLength: 4 }));
    expect(sig(sq)).not.toBe(sig(ci));
  });

  test('Dot Jitter scales linearly with the amount (not squared)', () => {
    const density = 8;
    const meanLatticeDist = (j) => {
      const paths = gen(base({ fillType: 'dots', dotPattern: 'grid', dotShape: 'tick', dotJitter: j, density }));
      const ds = paths.map((p) => {
        const cx = (p[0].x + p[p.length - 1].x) / 2;
        const cy = (p[0].y + p[p.length - 1].y) / 2;
        const dx = cx - Math.round(cx / density) * density;
        const dy = cy - Math.round(cy / density) * density;
        return Math.hypot(dx, dy);
      });
      return ds.reduce((a, b) => a + b, 0) / ds.length;
    };
    const d05 = meanLatticeDist(0.5);
    const d10 = meanLatticeDist(1.0);
    expect(d05).toBeGreaterThan(0);
    // linear scaling => ratio ~0.5; the old squared bug => ~0.25
    expect(d05 / d10).toBeGreaterThan(0.4);
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
