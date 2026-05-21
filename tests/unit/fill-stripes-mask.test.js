/**
 * B8 — Stripes fill masking regression.
 *
 * Stripes pour the primary/secondary sub-fills into horizontal band slabs.
 * The slabs span the region's full bounding box width, so without an explicit
 * clip back to the parent shape the bands leak past the shape boundary (the
 * stripes filled the whole square bounding box instead of the inscribed
 * circle). These tests pour stripes into a circular region and assert every
 * emitted point stays inside the circle.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Stripes fill masking (B8)', () => {
  let runtime;
  let gen;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    gen = runtime.window.Vectura.AlgorithmRegistry._generatePatternFillPaths;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const CX = 50;
  const CY = 50;
  const R = 50;
  const circle = (steps = 64) => {
    const pts = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps) * Math.PI * 2;
      pts.push({ x: CX + R * Math.cos(t), y: CY + R * Math.sin(t) });
    }
    return pts;
  };

  const base = (overrides = {}) => ({
    region: circle(),
    regions: [circle()],
    fillType: 'stripes',
    density: 5,
    stripeBandWidth: 4,
    stripeGap: 2,
    stripeAngle: 0,
    stripePrimary: 'hatch',
    stripeSecondary: 'none',
    ...overrides,
  });

  const TOL = 1.0; // mm slack for clip-edge rounding

  test('all stripe points stay inside the circular region', () => {
    const paths = gen(base());
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      for (const pt of p) {
        const dist = Math.hypot(pt.x - CX, pt.y - CY);
        expect(dist).toBeLessThanOrEqual(R + TOL);
      }
    }
  });

  test('masking holds with a secondary fill in the gap', () => {
    const paths = gen(base({ stripeSecondary: 'dots', stripeGap: 4 }));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      for (const pt of p) {
        const dist = Math.hypot(pt.x - CX, pt.y - CY);
        expect(dist).toBeLessThanOrEqual(R + TOL);
      }
    }
  });
});
