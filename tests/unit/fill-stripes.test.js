/**
 * B8 — Stripes fill tests.
 *
 * Bands of alternating fills.
 *   - renders for a 100×100 square at defaults
 *   - narrower stripeBandWidth → more bands → more output
 *   - output shape contract
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Stripes fill (B8)', () => {
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
    fillType: 'stripes',
    density: 5,
    stripeBandWidth: 4,
    stripeGap: 2,
    stripeAngle: 0,
    stripePrimary: 'hatch',
    stripeSecondary: 'none',
    stripeSecondaryDensity: 2,
    ...overrides,
  });

  test('renders stripes for a simple square at defaults', () => {
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

  test('narrower stripeBandWidth → more distinct bands in the output', () => {
    // Count distinct band centers by binning each hatch-line's mean-y to within
    // half the band period. (stripeAngle=0 → hatch lines run horizontally inside
    // each band, all sharing roughly the same y.)
    const countBands = (paths, bandStep) => {
      const bin = new Set();
      for (const p of paths) {
        let sy = 0;
        for (const pt of p) sy += pt.y;
        const meanY = sy / p.length;
        bin.add(Math.round(meanY / bandStep));
      }
      return bin.size;
    };
    const wide = gen(base({ stripeBandWidth: 20, stripeGap: 10, density: 1 }));
    const narrow = gen(base({ stripeBandWidth: 4, stripeGap: 2, density: 1 }));
    expect(countBands(narrow, 6)).toBeGreaterThan(countBands(wide, 30));
  });
});
