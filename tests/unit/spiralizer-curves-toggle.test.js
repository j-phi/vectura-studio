/**
 * Regression: the Curves toggle was a dead switch on Spiralizer.
 *
 * spiralizer.js never read `p.curves` at all, and stamped `meta.straight = true`
 * on every path it emitted — including the wrap strands and the silhouette,
 * which are sampled curves, not line segments. `meta.straight` is a hard veto on
 * curve rendering in BOTH the canvas renderer (tracePath) and the SVG exporter
 * (pathToSvg), so the toggle could not take effect even in principle. The UI
 * compounded it: spiralizer is `is3d`, so the toggle routed to regen() rather
 * than render(), denying it even the draw-time fallback. Output was byte-
 * identical with the toggle on and off.
 *
 * The fix mirrors raster-plane's curveSurfacePath, which is the working model:
 * the toggle is the master enable, and it floors the bezier tension so Curves-ON
 * curves visibly even at Smoothing 0. Genuinely-straight geometry — the DNA
 * rungs, the marker glyphs — must stay straight.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BOUNDS = { width: 400, height: 300, dW: 400, dH: 300, m: 0 };

const hasHandles = (path) => {
  const anchors = path?.meta?.anchors;
  return Array.isArray(anchors) && anchors.some((a) => a && (a.in || a.out));
};

describe('spiralizer Curves toggle', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const generate = (params) => {
    const { AlgorithmRegistry } = runtime.window.Vectura;
    return AlgorithmRegistry.spiralizer.generate(
      { shape: 'ellipsoid', wrapType: 'spiral', turns: 6, smoothing: 0, ...params },
      () => 0.5,
      null,
      BOUNDS,
    ) || [];
  };

  // The wrap strands: the sampled helix/spiral curve. These are the paths the
  // user sees as "the spiral", and the ones that must curve.
  const strands = (paths) => paths.filter(
    (p) => Array.isArray(p) && p.length >= 3 && !p.meta?.rung && !p.meta?.marker && !p.meta?.outline,
  );

  test('Curves OFF leaves the strands as straight polylines', () => {
    const paths = generate({ curves: false });
    const s = strands(paths);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((p) => p.meta?.straight === true)).toBe(true);
    expect(s.some(hasHandles)).toBe(false);
  });

  test('Curves ON curves the strands even at Smoothing 0', () => {
    const paths = generate({ curves: true });
    const s = strands(paths);
    expect(s.length).toBeGreaterThan(0);
    // meta.straight would veto the curve in both the renderer and the exporter.
    expect(s.some((p) => p.meta?.straight === true)).toBe(false);
    expect(s.every(hasHandles)).toBe(true);
  });

  test('Curves ON changes the emitted geometry (the toggle is not a no-op)', () => {
    const off = JSON.stringify(generate({ curves: false }).map((p) => p.meta || {}));
    const on = JSON.stringify(generate({ curves: true }).map((p) => p.meta || {}));
    expect(on).not.toBe(off);
  });

  test('the DNA rungs stay straight — they really are line segments', () => {
    const paths = generate({ shape: 'helix', helixCount: 2, helixRungs: true, curves: true });
    const rungs = paths.filter((p) => p.meta?.rung);
    expect(rungs.length).toBeGreaterThan(0);
    expect(rungs.every((p) => p.meta.straight === true)).toBe(true);
    expect(rungs.some(hasHandles)).toBe(false);
  });

  test('Smoothing still tunes the curve on top of the toggle', () => {
    const maxHandle = (paths) => {
      let max = 0;
      paths.forEach((path) => {
        (path?.meta?.anchors || []).forEach((a) => {
          if (!a) return;
          [a.in, a.out].forEach((h) => {
            if (h) max = Math.max(max, Math.hypot(h.x - a.x, h.y - a.y));
          });
        });
      });
      return max;
    };
    const floor = maxHandle(generate({ curves: true, smoothing: 0 }));
    const full = maxHandle(generate({ curves: true, smoothing: 1 }));
    expect(floor).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(floor);
  });
});
