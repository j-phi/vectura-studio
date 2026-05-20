/**
 * B7 — Halftone fill tests.
 *
 * Dot radius modulated by a scalar function.
 *   - renders for a 100×100 square at defaults
 *   - radial source modulates dot radius by distance-to-center (per renderer
 *     comment: "t increases outward", so dots are smallest at center and grow
 *     outward); inverting flips the gradient.
 *   - changing halftoneSource changes the radius distribution
 *   - output shape contract
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Halftone fill (B7)', () => {
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
    fillType: 'halftone',
    density: 5,
    halftoneSource: 'radial',
    halftoneMinR: 0.2,
    halftoneMaxR: 1.5,
    halftoneFrequency: 5,
    halftoneAngle: 0,
    halftoneInvert: 'off',
    ...overrides,
  });

  // Approximate per-polyline radius via half the bounding-box diameter — works
  // for both circle (dot) polylines and short tick spirals expanded from dots.
  const polyRadius = (p) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of p) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    return Math.hypot(maxX - minX, maxY - minY) / 2;
  };

  const polyCenter = (p) => {
    let sx = 0, sy = 0;
    for (const pt of p) { sx += pt.x; sy += pt.y; }
    return { x: sx / p.length, y: sy / p.length };
  };

  test('renders dots for a simple square at defaults', () => {
    const paths = gen(base());
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
  });

  test('output shape contract: polylines are Array<{x,y}> with finite coords and length ≥ 2', () => {
    const paths = gen(base());
    for (const p of paths) {
      expect(Array.isArray(p)).toBe(true);
      expect(p.length).toBeGreaterThanOrEqual(2);
      for (const pt of p) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  test('radial source modulates dot radius by distance-to-center, and invert flips the gradient', () => {
    const cx = 50, cy = 50;
    const avgRadiiByRing = (paths) => {
      let nearSum = 0, nearN = 0;
      let farSum = 0, farN = 0;
      for (const p of paths) {
        const c = polyCenter(p);
        const d = Math.hypot(c.x - cx, c.y - cy);
        const r = polyRadius(p);
        if (d < 20) { nearSum += r; nearN++; }
        else if (d > 40) { farSum += r; farN++; }
      }
      return {
        near: nearN ? nearSum / nearN : 0,
        far:  farN  ? farSum  / farN  : 0,
        nearN, farN,
      };
    };
    // Renderer convention: radial t increases outward → larger dots at edges.
    const def = avgRadiiByRing(gen(base({ halftoneSource: 'radial', halftoneInvert: 'off' })));
    expect(def.nearN).toBeGreaterThan(0);
    expect(def.farN).toBeGreaterThan(0);
    expect(def.far).toBeGreaterThan(def.near);
    // Invert flips the relationship: dots are now larger at center.
    const inv = avgRadiiByRing(gen(base({ halftoneSource: 'radial', halftoneInvert: 'on' })));
    expect(inv.nearN).toBeGreaterThan(0);
    expect(inv.farN).toBeGreaterThan(0);
    expect(inv.near).toBeGreaterThan(inv.far);
  });

  test('different halftoneSource yields a measurably different output', () => {
    const radial = gen(base({ halftoneSource: 'radial' }));
    const linear = gen(base({ halftoneSource: 'linear' }));
    const radialSig = radial.map(polyRadius).reduce((s, v) => s + v, 0);
    const linearSig = linear.map(polyRadius).reduce((s, v) => s + v, 0);
    expect(Math.abs(radialSig - linearSig)).toBeGreaterThan(0);
  });
});
