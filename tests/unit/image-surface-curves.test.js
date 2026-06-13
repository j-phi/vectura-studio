/*
 * Image Surface — Curves toggle (RGR coverage).
 *
 * Regression proof for the layer `curves` toggle finally driving the wire
 * output. Before the fix every Image Surface path was stamped meta.straight,
 * which unconditionally overrides the renderer's curve smoothing — so turning
 * Curves on did nothing.
 *
 *   - Curves OFF (lines / mesh): paths stay straight polylines (meta.straight).
 *   - Curves ON: every multi-point path becomes a bezier (meta.forceCurves +
 *     meta.anchors, meta.straight dropped) — "every point becomes a curve".
 *   - Curve Smoothing (contourSmoothing) modulates the curve: a higher value
 *     produces visibly different (smoother / leaner) geometry.
 *   - Topography back-compat: its contours have always smoothed via the slider
 *     independent of the toggle, so Curves OFF + slider > 0 still curves.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Image Surface — Curves toggle', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const bounds = { width: 400, height: 400 };
  const gen = (extra, seed = 21) =>
    V.AlgorithmRegistry.imageSurface.generate(
      { mode: 'lines', rows: 8, sampleDetail: 24, smoothing: 0, amplitude: 14, artworkSize: 142, ...extra },
      null,
      new V.SimpleNoise(seed),
      bounds,
    );

  const multi = (paths) => paths.filter((p) => Array.isArray(p) && p.length >= 3);

  test('Relief Lines: Curves OFF leaves straight polylines', () => {
    const paths = gen({ mode: 'lines', curves: false });
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => p.meta && p.meta.straight === true)).toBe(true);
    expect(paths.some((p) => p.meta && p.meta.forceCurves)).toBe(false);
  });

  test('Relief Lines: Curves ON turns every point into a bezier', () => {
    const paths = gen({ mode: 'lines', curves: true });
    const curveable = multi(paths);
    expect(curveable.length).toBeGreaterThan(0);
    // Every multi-point ribbon now carries bezier handles, and the straight
    // flag that used to veto the renderer's curve path is gone.
    expect(curveable.every((p) => p.meta && p.meta.forceCurves === true)).toBe(true);
    expect(curveable.every((p) => Array.isArray(p.meta.anchors) && p.meta.anchors.length >= 2)).toBe(true);
    expect(curveable.some((p) => p.meta.anchors.some((a) => a && (a.in || a.out)))).toBe(true);
    expect(curveable.every((p) => !p.meta.straight)).toBe(true);
  });

  test('Deformed Mesh: Curves ON curves the row/column wires', () => {
    const straight = gen({ mode: 'mesh', rows: 10, columns: 10, curves: false });
    const curved = gen({ mode: 'mesh', rows: 10, columns: 10, curves: true });
    expect(straight.every((p) => p.meta && p.meta.straight === true)).toBe(true);
    expect(multi(curved).some((p) => p.meta && p.meta.forceCurves === true)).toBe(true);
  });

  test('Curve Smoothing modulates the curve when Curves is ON', () => {
    const low = gen({ mode: 'lines', curves: true, contourSmoothing: 0 });
    const high = gen({ mode: 'lines', curves: true, contourSmoothing: 80 });
    // Both are curved, but the slider changes the geometry (tension + simplify).
    expect(multi(low).every((p) => p.meta.forceCurves === true)).toBe(true);
    expect(multi(high).every((p) => p.meta.forceCurves === true)).toBe(true);
    expect(JSON.stringify(high)).not.toBe(JSON.stringify(low));
    // Higher smoothing simplifies the anchor set (leaner export).
    const anchors = (paths) => multi(paths).reduce((n, p) => n + p.meta.anchors.length, 0);
    expect(anchors(high)).toBeLessThanOrEqual(anchors(low));
  });

  test('Topography back-compat: slider still smooths with Curves OFF', () => {
    const paths = gen({ mode: 'topography', columns: 14, sampleDetail: 38, contourSmoothing: 18, curves: false });
    expect(multi(paths).some((p) => p.meta && p.meta.forceCurves === true)).toBe(true);
  });

  test('Topography: Curves OFF + no smoothing leaves straight contours', () => {
    const paths = gen({ mode: 'topography', columns: 14, sampleDetail: 38, contourSmoothing: 0, curves: false });
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => p.meta && p.meta.straight === true)).toBe(true);
  });
});
