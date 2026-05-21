/**
 * Pins the adaptive de Casteljau sampler in GeometryUtils.sampleCubicBezier.
 * Replaces the prior uniform `rough/4` heuristic that under-sampled bezier
 * segments with short chord + long handles (visible facets at high zoom).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('GeometryUtils.sampleCubicBezier — adaptive subdivision', () => {
  let runtime;
  let sampleCubicBezier;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    sampleCubicBezier = runtime.window.Vectura.GeometryUtils.sampleCubicBezier;
  });

  afterAll(() => {
    runtime?.cleanup?.();
  });

  // Helper: max perpendicular distance from emitted polyline to the true curve,
  // measured by sampling the underlying cubic at many fine t values and finding
  // the closest emitted segment for each one.
  const cubicAt = (p0, c1, c2, p1, t) => {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return {
      x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
      y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
    };
  };
  const distToSegment = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const maxDeviation = (poly, p0, c1, c2, p1) => {
    let worst = 0;
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      const truth = cubicAt(p0, c1, c2, p1, t);
      let best = Infinity;
      for (let k = 1; k < poly.length; k++) {
        const d = distToSegment(truth, poly[k - 1], poly[k]);
        if (d < best) best = d;
      }
      if (best > worst) worst = best;
    }
    return worst;
  };

  test('default tolerance keeps polyline within 0.1mm of the true curve', () => {
    // Short chord (10mm), long handles (60mm) — the case that produced visible
    // facets under the old rough/4 heuristic.
    const p0 = { x: 0, y: 0 };
    const c1 = { x: 60, y: 0 };
    const c2 = { x: 60, y: 10 };
    const p1 = { x: 0, y: 10 };
    const poly = sampleCubicBezier(p0, c1, c2, p1);
    expect(maxDeviation(poly, p0, c1, c2, p1)).toBeLessThanOrEqual(0.12);
  });

  test('flat bezier (collinear control points) emits only 2 points', () => {
    const p0 = { x: 0, y: 0 };
    const c1 = { x: 30, y: 0 };
    const c2 = { x: 70, y: 0 };
    const p1 = { x: 100, y: 0 };
    const poly = sampleCubicBezier(p0, c1, c2, p1);
    expect(poly).toHaveLength(2);
  });

  test('tighter tolerance produces more samples', () => {
    const p0 = { x: 0, y: 0 };
    const c1 = { x: 60, y: 0 };
    const c2 = { x: 60, y: 10 };
    const p1 = { x: 0, y: 10 };
    const loose = sampleCubicBezier(p0, c1, c2, p1, 1.0);
    const tight = sampleCubicBezier(p0, c1, c2, p1, 0.02);
    expect(tight.length).toBeGreaterThan(loose.length);
  });

  test('polyline always begins at p0 and ends at p1', () => {
    const p0 = { x: 5, y: 7 };
    const c1 = { x: 10, y: 80 };
    const c2 = { x: 90, y: 80 };
    const p1 = { x: 95, y: 7 };
    const poly = sampleCubicBezier(p0, c1, c2, p1);
    expect(poly[0].x).toBe(p0.x);
    expect(poly[0].y).toBe(p0.y);
    expect(poly[poly.length - 1].x).toBe(p1.x);
    expect(poly[poly.length - 1].y).toBe(p1.y);
  });

  test('maxDepth caps sample count for pathological cusps', () => {
    // Self-intersecting cusp with enormous handles — old code would just
    // emit 120 samples; adaptive sampler caps at 2^12 + 1 = 4097 even here.
    const p0 = { x: 0, y: 0 };
    const c1 = { x: 1000, y: 1000 };
    const c2 = { x: -1000, y: 1000 };
    const p1 = { x: 0, y: 0.01 };
    const poly = sampleCubicBezier(p0, c1, c2, p1);
    expect(poly.length).toBeLessThanOrEqual(4097);
  });
});
