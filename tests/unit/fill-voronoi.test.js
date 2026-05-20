/**
 * B2 — Voronoi fill tests.
 *
 * Voronoi tessellation of seed points within the region.
 *   - renders for a 100×100 square at defaults
 *   - more seeds → more total path segments
 *   - every output polyline is Array<{x,y}> with finite coords and length ≥ 2
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Voronoi fill (B2)', () => {
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
    fillType: 'voronoi',
    density: 5,
    voronoiSeeds: 60,
    voronoiJitter: 0.5,
    voronoiStroke: 'boundary',
    voronoiSeedMode: 'random',
    ...overrides,
  });

  test('renders cells for a simple square at defaults', () => {
    const paths = gen(base());
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
  });

  test('output shape contract: each polyline is Array<{x,y}> with finite coords and length ≥ 2', () => {
    const paths = gen(base());
    for (const p of paths) {
      expect(Array.isArray(p)).toBe(true);
      expect(p.length).toBeGreaterThanOrEqual(2);
      for (const pt of p) {
        expect(typeof pt.x).toBe('number');
        expect(typeof pt.y).toBe('number');
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  test('more voronoiSeeds → more total path segments', () => {
    const few = gen(base({ voronoiSeeds: 10 }));
    const many = gen(base({ voronoiSeeds: 150 }));
    expect(many.length).toBeGreaterThan(few.length);
  });
});
