const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SVG Import fill regions', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const rect = (x, y, w, h) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];

  const generate = (groups, overrides = {}) => {
    const { AlgorithmRegistry, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    return AlgorithmRegistry.svgDistort.generate(
      {
        importedGroups: groups,
        fillMode: 'hatch',
        fillDensity: 20,
        showOutlines: false,
        autoFit: false,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        noises: [],
        seed: 0,
        ...overrides,
      },
      new SeededRNG(0),
      new SimpleNoise(0),
      { m: 0, dW: 200, dH: 200 },
    );
  };

  // True if any 2-point hatch segment covers x at a y-row within yTol canvas units.
  const hasFillAtPoint = (paths, x, y, yTol = 8) =>
    paths.some((path) => {
      if (!Array.isArray(path) || path.length !== 2) return false;
      const [a, b] = path;
      if (Math.abs(a.y - y) > yTol) return false;
      return x > Math.min(a.x, b.x) + 1e-6 && x < Math.max(a.x, b.x) - 1e-6;
    });

  // ── Sibling overlap ──────────────────────────────────────────────────────────
  // Two outer paths that partially overlap should have fill in the intersection.
  // Input geometry (source space):
  //   pathA = (0,0)→(60,60), pathB = (40,40)→(100,100), overlap = (40,40)→(60,60)
  // After centering on 200×200 canvas (srcCx=50,srcCy=50 → tx adds 50 to each axis):
  //   overlap maps to canvas (90,90)→(110,110), centre at (100,100).
  test('fills the overlap region between two sibling outer paths', () => {
    const fills = generate([{
      paths: [rect(0, 0, 60, 60), rect(40, 40, 60, 60)],
      isClosed: true,
    }]);

    expect(hasFillAtPoint(fills, 100, 100)).toBe(true);
  });

  // ── Compound-path hole ───────────────────────────────────────────────────────
  // An inner ring whose centroid is inside a sibling outer ring is a hole and must
  // remain unfilled.  Outer centroid (50,50) must NOT fall inside the hole so
  // the classification is unambiguous.
  // Input geometry:
  //   outer = (0,0)→(100,100), hole = (20,20)→(40,40)  (centroid 30,30)
  // In canvas:
  //   outer = (50,50)→(150,150), hole = (70,70)→(90,90), hole centre = (80,80)
  test('leaves a compound-path inner ring unfilled', () => {
    const fills = generate([{
      paths: [rect(0, 0, 100, 100), rect(20, 20, 20, 20)],
      isClosed: true,
    }]);

    // Hole region must be empty.
    expect(hasFillAtPoint(fills, 80, 80)).toBe(false);
    // Outer body (well outside the hole) must be filled.
    expect(hasFillAtPoint(fills, 110, 110)).toBe(true);
  });
});
