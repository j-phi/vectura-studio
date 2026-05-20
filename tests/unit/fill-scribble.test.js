/**
 * B5 — Scribble fill tests.
 *
 * Single chaotic continuous-stroke fill.
 *   - renders for a 100×100 square at defaults
 *   - higher scribbleCoverage → more vertices in the stroke
 *   - output shape contract
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Scribble fill (B5)', () => {
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
    fillType: 'scribble',
    density: 5,
    scribbleSmoothness: 0.6,
    scribbleSeed: 1,
    scribbleCoverage: 1.0,
    ...overrides,
  });

  const totalVertices = (paths) =>
    paths.reduce((sum, p) => sum + p.length, 0);

  test('renders scribble for a simple square at defaults', () => {
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

  test('higher scribbleCoverage produces more total vertices', () => {
    const low = gen(base({ scribbleCoverage: 0.3 }));
    const high = gen(base({ scribbleCoverage: 2.5 }));
    expect(totalVertices(high)).toBeGreaterThan(totalVertices(low));
  });
});
