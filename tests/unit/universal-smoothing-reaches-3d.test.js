/**
 * The universal Smoothing slider must reach the 3D wire algorithms — including
 * when Curves is ON.
 *
 * raster-plane and topoform each expose TWO smoothing controls: their bespoke
 * "Curve/Contour Smoothing" (0..100) and the universal Smoothing (0..1). Their
 * Curves-ON branch read only the bespoke one, so with Curves on the universal
 * slider did nothing at all — a panel with two smoothing controls, one of them
 * silently dead. The curve baselines proved it: `topoform-curves-on.svg` and
 * `topoform-curves-on-smooth.svg` were BYTE-IDENTICAL, as were raster-plane's.
 *
 * This is the same dead-switch class as the Spiralizer Curves bug, so it gets the
 * same kind of guard.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BOUNDS = { width: 400, height: 300, dW: 400, dH: 300, m: 0, penWidth: 0.35 };

const maxHandle = (paths) => {
  let max = 0;
  (paths || []).forEach((path) => {
    const anchors = path && path.meta && path.meta.anchors;
    if (!Array.isArray(anchors)) return;
    anchors.forEach((a) => {
      if (!a) return;
      [a.in, a.out].forEach((h) => {
        if (h) max = Math.max(max, Math.hypot(h.x - a.x, h.y - a.y));
      });
    });
  });
  return max;
};

describe('universal Smoothing reaches the 3D wire algorithms', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const generate = (type, params) => {
    const { AlgorithmRegistry, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    return AlgorithmRegistry[type].generate(
      { ...params },
      new SeededRNG(7),
      new SimpleNoise(7),
      BOUNDS,
    ) || [];
  };

  describe.each([
    ['rasterPlane', { mode: 'lines', rows: 14, sampleDetail: 40, amplitude: 24, artworkSize: 150 }],
    ['topoform', {}],
  ])('%s', (type, base) => {
    test('with Curves ON, Smoothing still changes the curve', () => {
      const flat = generate(type, { ...base, curves: true, contourSmoothing: 0, smoothing: 0 });
      const bent = generate(type, { ...base, curves: true, contourSmoothing: 0, smoothing: 1 });

      const a = maxHandle(flat);
      const b = maxHandle(bent);
      expect(b).toBeGreaterThan(0);
      // The two used to be byte-identical: the universal slider was ignored
      // entirely on this branch.
      expect(b).not.toBeCloseTo(a, 6);
    });

    test('with Curves OFF, Smoothing still bends the wires', () => {
      const flat = generate(type, { ...base, curves: false, contourSmoothing: 0, smoothing: 0 });
      const bent = generate(type, { ...base, curves: false, contourSmoothing: 0, smoothing: 1 });
      expect(maxHandle(flat)).toBeLessThan(1e-6);
      expect(maxHandle(bent)).toBeGreaterThan(0);
    });
  });
});
