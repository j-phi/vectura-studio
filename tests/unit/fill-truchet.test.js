/**
 * B3 — Truchet tile fill tests.
 *
 * Square-tile pattern with random orientation per tile.
 *   - renders for a 100×100 square at defaults
 *   - smaller tile size → more polylines
 *   - output shape contract
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Truchet fill (B3)', () => {
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
    fillType: 'truchet',
    density: 5,
    truchetTileSet: 'quarter-arcs',
    truchetTileSize: 6,
    truchetSeed: 1,
    truchetRotations: 4,
    ...overrides,
  });

  test('renders tiles for a simple square at defaults', () => {
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

  test('smaller truchetTileSize produces more polylines', () => {
    const big = gen(base({ truchetTileSize: 20 }));
    const small = gen(base({ truchetTileSize: 3 }));
    expect(small.length).toBeGreaterThan(big.length);
  });
});
