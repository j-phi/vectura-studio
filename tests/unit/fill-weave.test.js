/**
 * B10 — Weave fill tests.
 *
 * Interlaced strands (textile-like).
 *   - renders for a 100×100 square at defaults
 *   - narrower weaveStrandWidth → more strand lines (more output)
 *   - output shape contract
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Weave fill (B10)', () => {
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
    fillType: 'weave',
    density: 5,
    weavePattern: 'plain',
    weaveStrandWidth: 1.5,
    weaveGap: 0.3,
    weaveAngle: 0,
    weaveOver: 1,
    weaveUnder: 1,
    ...overrides,
  });

  test('renders strands for a simple square at defaults', () => {
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

  test('narrower weaveStrandWidth → more total strand lines', () => {
    const wide = gen(base({ weaveStrandWidth: 8 }));
    const narrow = gen(base({ weaveStrandWidth: 0.5 }));
    expect(narrow.length).toBeGreaterThan(wide.length);
  });
});
