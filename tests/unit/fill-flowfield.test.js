/**
 * B1 — Flow Field fill tests.
 *
 * Streamlines traced along a vector field, clipped to the region polygon.
 *   - renders for a 100×100 square at defaults
 *   - density change alters the output (denser → more streamlines)
 *   - all rendered points lie inside or on the region boundary
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Flow Field fill (B1)', () => {
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
    fillType: 'flowfield',
    density: 3,
    flowFieldType: 'perlin',
    flowNoiseScale: 6,
    flowSeed: 1,
    flowTraceLen: 60,
    flowSeparation: 2.5,
    ...overrides,
  });

  test('renders streamlines for a simple square at defaults', () => {
    const paths = gen(base());
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.length).toBeGreaterThanOrEqual(2);
  });

  test('lower flowSeparation produces more streamlines', () => {
    const sparse = gen(base({ flowSeparation: 8 }));
    const dense  = gen(base({ flowSeparation: 1.5 }));
    expect(dense.length).toBeGreaterThan(sparse.length);
  });

  test('all rendered points lie inside (with tolerance) the region', () => {
    const paths = gen(base());
    for (const p of paths) {
      for (const pt of p) {
        expect(pt.x).toBeGreaterThanOrEqual(-1e-3);
        expect(pt.x).toBeLessThanOrEqual(100 + 1e-3);
        expect(pt.y).toBeGreaterThanOrEqual(-1e-3);
        expect(pt.y).toBeLessThanOrEqual(100 + 1e-3);
      }
    }
  });
});
