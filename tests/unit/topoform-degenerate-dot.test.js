/**
 * Regression test: Topoform must not emit a stray "dot" near the surface.
 *
 * Cause: a depth-slice plane that grazes a single triangle almost exactly at a
 * vertex yields a 2-point segment whose endpoints fall inside the linkSegments
 * rounding cell (3-decimal / 1e-3 grid). It can never link into a contour ring,
 * and it survives cleanPath's 1e-6 dedupe, so the canvas paints it as a visible
 * dot (stroke width + round caps) even though its geometric extent is ~0.0004
 * units. The fix drops paths whose extent is negligible vs the whole drawing.
 *
 * Reported visually on a tilted sphere; reproduced here at several yaw/pitch
 * orientations that put a triangle tangent to a slice plane.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Topoform — no degenerate stray dot', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => runtime.cleanup());

  const bounds = { width: 400, height: 400 };

  const generate = (overrides = {}) => {
    const { AlgorithmRegistry, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    return AlgorithmRegistry.topoform.generate(
      {
        sourceMode: 'sphere',
        renderMode: 'contours',
        primitiveDetail: 18,
        primitiveScaleX: 60,
        primitiveScaleY: 60,
        primitiveScaleZ: 60,
        lineCount: 22,
        yaw: -60,
        pitch: 60,
        contourVisibility: 'visibleOnly',
        ...overrides,
      },
      new SeededRNG(0),
      new SimpleNoise(0),
      bounds,
    );
  };

  // Bounding-box diagonal of one path and of an entire path set.
  const pathExtent = (path) => {
    let aX = Infinity, aY = Infinity, bX = -Infinity, bY = -Infinity;
    for (const pt of path) {
      if (pt.x < aX) aX = pt.x;
      if (pt.x > bX) bX = pt.x;
      if (pt.y < aY) aY = pt.y;
      if (pt.y > bY) bY = pt.y;
    }
    return Math.hypot(bX - aX, bY - aY);
  };
  const overallExtent = (paths) => {
    let aX = Infinity, aY = Infinity, bX = -Infinity, bY = -Infinity;
    for (const path of paths) for (const pt of path) {
      if (pt.x < aX) aX = pt.x;
      if (pt.x > bX) bX = pt.x;
      if (pt.y < aY) aY = pt.y;
      if (pt.y > bY) bY = pt.y;
    }
    return Math.hypot(bX - aX, bY - aY);
  };

  // A "dot" is any path whose extent is a negligible fraction of the whole
  // drawing — the real fragments sit ~100x above this floor.
  const degenerateDots = (paths) => {
    const overall = overallExtent(paths);
    const floor = overall * 1e-4;
    return paths.filter((p) => pathExtent(p) < floor);
  };

  it('emits no negligible-extent dot at a tangent orientation', () => {
    expect(degenerateDots(generate())).toHaveLength(0);
  });

  it('emits no negligible-extent dot across a sweep of tilted orientations', () => {
    const offenders = [];
    for (const yaw of [-60, -45, -30, 30, 45, 60]) {
      for (const pitch of [-60, -45, 45, 60]) {
        const dots = degenerateDots(generate({ yaw, pitch }));
        if (dots.length) offenders.push({ yaw, pitch, count: dots.length });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('still produces a full set of real contour paths (filter is not over-eager)', () => {
    const paths = generate({ lineCount: 8 });
    // Healthy contour output: well above the handful a dropped-everything bug
    // would leave, and every surviving path has real extent.
    expect(paths.length).toBeGreaterThanOrEqual(8);
    const overall = overallExtent(paths);
    expect(overall).toBeGreaterThan(50);
    paths.forEach((p) => expect(pathExtent(p)).toBeGreaterThanOrEqual(overall * 1e-4));
  });
});
