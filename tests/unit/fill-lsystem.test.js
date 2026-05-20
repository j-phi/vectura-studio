/**
 * B6 — L-System fill tests.
 *
 * Fractal branching fill (organic).
 *   - renders for a 100×100 square at defaults
 *   - more lsysIterations → more total branches (segments/vertices)
 *   - output shape contract
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('L-System fill (B6)', () => {
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
    fillType: 'lsystem',
    density: 5,
    lsysPreset: 'coral',
    lsysIterations: 4,
    lsysAngleVariance: 8,
    lsysSeed: 1,
    lsysScale: 1.0,
    ...overrides,
  });

  const totalVertices = (paths) =>
    paths.reduce((sum, p) => sum + p.length, 0);

  test('renders branches for a simple square at defaults', () => {
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

  test('more lsysIterations produces more total vertices', () => {
    const few = gen(base({ lsysIterations: 2 }));
    const many = gen(base({ lsysIterations: 5 }));
    expect(totalVertices(many)).toBeGreaterThan(totalVertices(few));
  });
});
