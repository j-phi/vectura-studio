/**
 * B9 — Spirograph fill tests.
 *
 * Single parametric curve (Lissajous / hypotrochoid family).
 *   - renders for a 100×100 square at defaults
 *   - more spiroTurns → more vertices on the curve
 *   - output shape contract
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Spirograph fill (B9)', () => {
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
    fillType: 'spirograph',
    density: 5,
    spiroRatioA: 5,
    spiroRatioB: 3,
    spiroPhase: 0,
    spiroTurns: 50,
    spiroDeformation: 0,
    ...overrides,
  });

  const totalVertices = (paths) =>
    paths.reduce((sum, p) => sum + p.length, 0);

  test('renders curve for a simple square at defaults', () => {
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

  test('more spiroTurns → more total vertices on the curve', () => {
    const few = gen(base({ spiroTurns: 10 }));
    const many = gen(base({ spiroTurns: 150 }));
    expect(totalVertices(many)).toBeGreaterThan(totalVertices(few));
  });
});
