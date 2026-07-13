/**
 * Regression: the Spiralizer's Smoothing slider was 100x under-scaled.
 *
 * spiralizer.js passed `p.smoothing` — the universal Post-Processing Lab slider,
 * domain 0..1 — straight into Geometry3D.smoothToBezier, whose `amount` is on a
 * 0..100 scale (`tension = amount / 100`). At the slider's maximum the tension
 * came out at 0.01, so the emitted bezier handles were ~0.03 world units long on
 * a 400x300 document: mathematically present, visually a no-op. The spiral stayed
 * faceted no matter where the user dragged the slider.
 *
 * The fix converts at the call site. This pins the handles at a length that is a
 * meaningful fraction of the geometry, not merely greater than epsilon — the old
 * code would have passed an epsilon check.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BOUNDS = { width: 400, height: 300, dW: 400, dH: 300, m: 0 };

describe('spiralizer smoothing domain', () => {
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
      { shape: 'ellipsoid', ...params },
      () => 0.5,
      null,
      BOUNDS,
    ) || [];
  };

  // Longest bezier handle across every anchor, in world units.
  const maxHandleLength = (paths) => {
    let max = 0;
    paths.forEach((path) => {
      const anchors = path?.meta?.anchors;
      if (!Array.isArray(anchors)) return;
      anchors.forEach((a) => {
        if (!a) return;
        [a.in, a.out].forEach((h) => {
          if (!h) return;
          max = Math.max(max, Math.hypot(h.x - a.x, h.y - a.y));
        });
      });
    });
    return max;
  };

  // Mean sample spacing along the wrap strands — the scale a handle must be
  // comparable to in order to bend anything visibly. Rungs are 2-point segments
  // spanning the whole body, so they'd skew the mean; skip them.
  const meanSegmentLength = (paths) => {
    let total = 0;
    let n = 0;
    paths.forEach((path) => {
      if (!Array.isArray(path) || path.length < 3 || path.meta?.rung) return;
      for (let i = 1; i < path.length; i++) {
        total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
        n += 1;
      }
    });
    return n ? total / n : 0;
  };

  test('smoothing 0 emits no bezier handles', () => {
    expect(maxHandleLength(generate({ smoothing: 0 }))).toBeLessThan(1e-6);
  });

  test('smoothing 1 bends the strands by a visible amount', () => {
    const paths = generate({ smoothing: 1 });
    const handle = maxHandleLength(paths);
    const spacing = meanSegmentLength(generate({ smoothing: 0 }));

    expect(spacing).toBeGreaterThan(0);
    // A Catmull-Rom handle at full tension is ~1/3 of the neighbour chord. The
    // 100x-under-scaled version produced ~0.3% of it.
    expect(handle).toBeGreaterThan(spacing * 0.1);
  });

  test('smoothing scales monotonically between the two ends', () => {
    const low = maxHandleLength(generate({ smoothing: 0.25 }));
    const high = maxHandleLength(generate({ smoothing: 1 }));
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(0);
  });
});
