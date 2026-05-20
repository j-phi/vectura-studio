/**
 * B4 — Maze fill tests.
 *
 * Single continuous maze path filling the region.
 *   - renders for a 100×100 square at defaults
 *   - smaller mazeCellSize → longer total path length
 *   - output shape contract
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Maze fill (B4)', () => {
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
    fillType: 'maze',
    density: 5,
    mazeCellSize: 5,
    mazeAlgorithm: 'dfs',
    mazeBranchBias: 0.5,
    mazeSeed: 1,
    mazeWallMode: 'walls',
    ...overrides,
  });

  const totalLength = (paths) => {
    let total = 0;
    for (const p of paths) {
      for (let i = 1; i < p.length; i++) {
        const dx = p[i].x - p[i - 1].x;
        const dy = p[i].y - p[i - 1].y;
        total += Math.hypot(dx, dy);
      }
    }
    return total;
  };

  test('renders maze for a simple square at defaults', () => {
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

  test('smaller mazeCellSize produces longer total path length', () => {
    const coarse = gen(base({ mazeCellSize: 15 }));
    const fine = gen(base({ mazeCellSize: 3 }));
    expect(totalLength(fine)).toBeGreaterThan(totalLength(coarse));
  });
});
