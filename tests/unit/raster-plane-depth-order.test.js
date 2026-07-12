/*
 * Raster-Plane — hidden-line depth order for Lines as Planes (RGR coverage).
 *
 * Parallel plan-line rows must occlude strictly by PLAN position: the row
 * whose plan line sits nearest the camera hides everything plan-farther,
 * regardless of the content's height. The stripe fixture (alternating tall /
 * short rows, amplitude ≫ row pitch) is the stress case: a height-inclusive
 * camera-z depth ranks a taller-but-farther row as "nearer", so the floating
 * horizon processes rows out of order and back rows break through nearer
 * curtains. These tests pin the plan-only ordering contract for:
 *   1. cardboard slices (planeWidth 1 — flat single-curtain mode),
 *   2. the solid slab renderer (planeWidth 100),
 *   3. plain relief lines (planes OFF).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — Lines as Planes depth order (plan-position occlusion)', () => {
  let runtime;
  let V;
  let stripes;

  const bounds = { width: 800, height: 600 };
  const ROWS = 8;
  const SIZE = 150;
  const ROTATE = -30;
  const TILT = 55;

  // Camera-space z of row r's plan line at height 0 (larger = nearer). Plan
  // row r sits at plan y = -SIZE/2 + (r / (ROWS-1)) * SIZE, which is object z.
  const planZ = (r) => V.Geometry3D.rotatePoint(
    { x: 0, y: 0, z: -SIZE / 2 + (r / (ROWS - 1)) * SIZE },
    { yaw: ROTATE, pitch: TILT, roll: 0 },
  ).z;

  const planNearestRow = () => {
    let best = 0;
    let bestZ = -Infinity;
    for (let r = 0; r < ROWS; r++) {
      const z = planZ(r);
      if (z > bestZ) { bestZ = z; best = r; }
    }
    return best;
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    // Alternating tall/short rows with the SHORT stripe on the plan-nearest
    // row: mean height flips between adjacent rows, so a height-contaminated
    // depth key ranks the tall-but-plan-farther neighbour as "nearer"
    // (height term ~49 ≫ plan pitch term ~10.6 at these angles) — the sort
    // inverts and the front wall lands on the wrong row.
    const shortParity = planNearestRow() % 2;
    stripes = Array.from({ length: 8 }, (_, y) =>
      Array.from({ length: 8 }, () => (y % 2 === shortParity ? 0 : 1)));
  });

  afterAll(() => runtime.cleanup());

  const gen = (extra) =>
    V.AlgorithmRegistry.rasterPlane.generate(
      {
        mode: 'lines', rows: ROWS, sampleDetail: 24, amplitude: 60, artworkSize: SIZE,
        rotate: ROTATE, tilt: TILT, smoothing: 0, horizontalLinesAsPlanes: true,
        seeThrough: false, baseHeight: 0.5, depthBias: 0.5, fixtureGrid: stripes,
        ...extra,
      }, null, new V.SimpleNoise(7), bounds,
    );

  // Distinct meta.row values in emission (first-appearance) order.
  const distinctRowOrder = (paths) => {
    const seen = new Set();
    const order = [];
    paths.forEach((p) => {
      if (!Array.isArray(p) || !p.meta || p.meta.row == null) return;
      if (!seen.has(p.meta.row)) { seen.add(p.meta.row); order.push(p.meta.row); }
    });
    return order;
  };

  const expectMonotoneInPlanDepth = (rowOrder) => {
    expect(rowOrder.length).toBeGreaterThan(1);
    for (let i = 1; i < rowOrder.length; i++) {
      // Each later-emitted row must be plan-farther than the previous one.
      expect(planZ(rowOrder[i])).toBeLessThan(planZ(rowOrder[i - 1]));
    }
  };

  test('cardboard slices (planeWidth 1): front wall is the plan-nearest row and emission order is plan near→far', () => {
    const paths = gen({ planeWidth: 1 });
    expect(paths.length).toBeGreaterThan(0);
    // Flat mode emits every path with meta.row and has no direct-bypass paths.
    paths.forEach((p) => expect(p.meta && p.meta.row != null).toBe(true));

    const front = paths.filter((p) => p.meta && p.meta.frontWall);
    expect(front.length).toBeGreaterThan(0);
    front.forEach((p) => expect(p.meta.row).toBe(planNearestRow()));

    expectMonotoneInPlanDepth(distinctRowOrder(paths));
  });

  test('solid slab (planeWidth 100): front wall is the plan-nearest row', () => {
    const paths = gen({ planeWidth: 100 });
    expect(paths.length).toBeGreaterThan(0);
    // Side risers / slab edge bridges are emitted out-of-band (direct bypass),
    // so they are excluded from any ordering assertion.
    const ordered = paths.filter((p) => !(p.meta && (p.meta.planeSide || p.meta.planeEdge)));
    const front = ordered.filter((p) => p.meta && p.meta.frontWall);
    expect(front.length).toBeGreaterThan(0);
    front.forEach((p) => expect(p.meta.row).toBe(planNearestRow()));
  });

  test('plain relief lines (planes OFF): emission order is plan near→far', () => {
    const paths = gen({ horizontalLinesAsPlanes: false });
    expect(paths.length).toBeGreaterThan(0);
    expectMonotoneInPlanDepth(distinctRowOrder(paths));
  });
});
