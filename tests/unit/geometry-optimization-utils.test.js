const geometry = require('../../src/core/geometry-utils.js');
const optimization = require('../../src/core/optimization-utils.js');

describe('Geometry helpers', () => {
  test('smoothPath keeps endpoints and preserves meta', () => {
    const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    path.meta = { tag: 'demo' };

    const out = geometry.smoothPath(path, 0.5);

    expect(out[0]).toEqual(path[0]);
    expect(out[out.length - 1]).toEqual(path[path.length - 1]);
    expect(out.meta).toEqual(path.meta);
  });

  test('simplifyPath simplifies using Douglas-Peucker algorithm', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 5, y: 0.5 },
      { x: 10, y: 0 },
    ];
    path.meta = { id: 'test' };

    // Tolerance 1.0 > 0.5 -> simplify
    const simplified = geometry.simplifyPath(path, 1.0);
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual(path[0]);
    expect(simplified[1]).toEqual(path[2]);
    expect(simplified.meta).toEqual(path.meta);

    // Tolerance 0.1 < 0.5 -> keep
    const original = geometry.simplifyPath(path, 0.1);
    expect(original.length).toBe(3);
  });

  describe('thickenPaths (shared stroke-thickening engine)', () => {
    const horiz = () => [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];

    test('width <= 1 is a no-op that returns the input untouched', () => {
      const paths = [horiz()];
      expect(geometry.thickenPaths(paths, { width: 1, mode: 'parallel' })).toBe(paths);
      expect(geometry.thickenPaths(paths, {})).toBe(paths);
    });

    test('parallel mode emits one offset pass per width unit', () => {
      const out = geometry.thickenPaths([horiz()], { width: 3, mode: 'parallel', spacing: 1 });
      expect(out.length).toBe(3);
      // A horizontal stroke offsets along ±y; centre pass stays on the axis.
      const ys = out.map((p) => p[0].y).sort((a, b) => a - b);
      expect(ys).toEqual([-1, 0, 1]);
      out.forEach((p) => expect(p.length).toBe(3));
    });

    test('snake mode stitches the passes into a single boustrophedon polyline', () => {
      const out = geometry.thickenPaths([horiz()], { width: 3, mode: 'snake', spacing: 1 });
      expect(out.length).toBe(1);
      expect(out[0].length).toBe(9); // 3 passes × 3 points, joined end-to-end
      // The 2nd pass is reversed, so its first emitted point starts at x=20.
      expect(out[0][3].x).toBe(20);
    });

    test('sinusoidal mode consumes one rng draw per path and stays deterministic', () => {
      let calls = 0;
      const rng = { nextFloat: () => { calls += 1; return 0.5; } };
      const a = geometry.thickenPaths([horiz()], { width: 2, mode: 'sinusoidal', rng });
      expect(calls).toBe(1);
      const b = geometry.thickenPaths([horiz()], { width: 2, mode: 'sinusoidal', rng: { nextFloat: () => 0.5 } });
      expect(a).toEqual(b);
    });

    test('per-point meta is propagated onto every thickened pass', () => {
      const path = horiz();
      path.meta = { algorithm: 'text' };
      const out = geometry.thickenPaths([path], { width: 2, mode: 'parallel' });
      out.forEach((p) => expect(p.meta).toEqual({ algorithm: 'text' }));
    });
  });

  describe('miterOffsetClosedRing (corner-faithful parallel offset)', () => {
    const square = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    ];
    const area = (pts) => {
      let s = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]; const b = pts[(i + 1) % pts.length];
        s += a.x * b.y - b.x * a.y;
      }
      return Math.abs(s) / 2;
    };

    test('positive delta expands the ring, negative contracts it', () => {
      const out = geometry.miterOffsetClosedRing(square, 2);
      const inn = geometry.miterOffsetClosedRing(square, -2);
      expect(area(out)).toBeGreaterThan(area(square) + 1);
      expect(area(inn)).toBeLessThan(area(square) - 1);
    });

    test('sharp 90° corners stay sharp (miter), not rounded', () => {
      const out = geometry.miterOffsetClosedRing(square, 2);
      // A miter offset of a square is a bigger square: 4 distinct corners at the
      // exact miter points (±2 beyond each side), NOT an arc of many points.
      const uniq = out.slice(0, -1); // drop closing dup
      expect(uniq.length).toBe(4);
      const corners = uniq.map((p) => [Math.round(p.x), Math.round(p.y)]).sort();
      expect(corners).toEqual([[-2, -2], [-2, 12], [12, -2], [12, 12]].sort());
    });

    test('offset edges stay parallel at exactly the offset distance', () => {
      const out = geometry.miterOffsetClosedRing(square, 3).slice(0, -1);
      const xs = out.map((p) => p.x);
      const ys = out.map((p) => p.y);
      expect(Math.min(...xs)).toBeCloseTo(-3, 6);
      expect(Math.max(...xs)).toBeCloseTo(13, 6);
      expect(Math.min(...ys)).toBeCloseTo(-3, 6);
      expect(Math.max(...ys)).toBeCloseTo(13, 6);
    });

    test('degenerate input returns null (caller falls back)', () => {
      expect(geometry.miterOffsetClosedRing([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1)).toBeNull();
      expect(geometry.miterOffsetClosedRing(null, 1)).toBeNull();
      expect(geometry.miterOffsetClosedRing(square, NaN)).toBeNull();
    });

    // A needle-acute spike triangle: apex angle ~11° (miterScale ~10 ≫ limit 6).
    const spike = [
      { x: 0, y: 0 }, { x: 100, y: 10 }, { x: 0, y: 20 },
    ];

    test('round mode caps a needle-acute convex corner with a concentric arc at radius=delta', () => {
      const out = geometry.miterOffsetClosedRing(spike, 5, { miterLimit: 6, round: true });
      expect(out).not.toBeNull();
      // The apex (100,10) is the acute corner; with round the offset there is an arc
      // of points all at radius 5 from the apex (never a long miter spike).
      const near = out.filter((p) => Math.hypot(p.x - 100, p.y - 10) <= 5 + 1e-6 && p.x > 60);
      expect(near.length).toBeGreaterThan(2); // sampled arc, not one spike point
      for (const p of near) expect(Math.hypot(p.x - 100, p.y - 10)).toBeCloseTo(5, 4);
    });

    test('consecutive round passes stay one offset-step apart at the acute apex', () => {
      const a = geometry.miterOffsetClosedRing(spike, 4, { miterLimit: 6, round: true });
      const b = geometry.miterOffsetClosedRing(spike, 5, { miterLimit: 6, round: true });
      const maxX = (pts) => Math.max(...pts.map((p) => p.x));
      // Arc caps sit at radius delta from the apex → the tip advances by exactly the
      // step (5-4=1) along +x, so passes abut instead of fanning into a stairstep.
      expect(maxX(b) - maxX(a)).toBeCloseTo(1, 3);
    });

    test('round mode leaves ordinary ~90° corners a single sharp miter (not rounded)', () => {
      const out = geometry.miterOffsetClosedRing(square, 2, { miterLimit: 6, round: true }).slice(0, -1);
      expect(out.length).toBe(4); // still 4 sharp miter corners, no arc sampling
    });

    test('round omitted is byte-identical to the legacy bevel', () => {
      const legacy = geometry.miterOffsetClosedRing(spike, 5, { miterLimit: 6 });
      const explicit = geometry.miterOffsetClosedRing(spike, 5, { miterLimit: 6, round: false });
      expect(explicit).toEqual(legacy);
      // Legacy bevels the acute apex into exactly two edge-offset points (no arc).
      const near = legacy.filter((p) => p.x > 60);
      expect(near.length).toBe(2);
    });
  });

  describe('flattenAnchorRing (faithful cubic-anchor flatten)', () => {
    test('a straight segment (no handles) keeps its corner vertex exactly', () => {
      // Triangle of straight edges — no handles anywhere → corners preserved, no
      // extra interpolation points (each edge stays a single chord).
      const anchors = [
        { x: 0, y: 0, in: null, out: null },
        { x: 10, y: 0, in: null, out: null },
        { x: 5, y: 8, in: null, out: null },
      ];
      const out = geometry.flattenAnchorRing(anchors, 0.1);
      expect(out).not.toBeNull();
      // 3 corners + closing dup, no midpoint rounding.
      expect(out.length).toBe(4);
      expect(out[0]).toEqual({ x: 0, y: 0 });
      expect(out[3]).toEqual({ x: 0, y: 0 });
    });

    test('a curved segment subdivides while endpoints (corners) are exact', () => {
      const anchors = [
        { x: 0, y: 0, in: null, out: { x: 0, y: 20 } },
        { x: 20, y: 20, in: { x: 0, y: 20 }, out: null },
      ];
      const out = geometry.flattenAnchorRing(anchors, 0.05);
      expect(out.length).toBeGreaterThan(4); // subdivided
      expect(out[0]).toEqual({ x: 0, y: 0 });
    });
  });

  describe('strokeRingsToBand (boolean stroke→band)', () => {
    test('returns [] when no polygon-clipping engine is available', () => {
      // The direct require harness has no window.Vectura.FillBoolean, so the
      // helper degrades gracefully and the caller falls back to thickenPaths.
      const ring = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
      expect(geometry.strokeRingsToBand([ring], 2)).toEqual([]);
    });
  });

  test('simplifyPath handles edge cases', () => {
    const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];

    // Invalid tolerance
    expect(geometry.simplifyPath(path, 0)).toBe(path);
    expect(geometry.simplifyPath(path, -1)).toBe(path);
    expect(geometry.simplifyPath(path, undefined)).toBe(path);

    // Short path
    const shortPath = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(geometry.simplifyPath(shortPath, 5)).toBe(shortPath);
  });

  test('simplifyPathVisvalingam preserves at least two points', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0.2 },
      { x: 2, y: 0.1 },
      { x: 3, y: 0.3 },
      { x: 4, y: 0 },
    ];

    const out = geometry.simplifyPathVisvalingam(path, 2);

    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  test('clonePaths deep-clones points and metadata', () => {
    const source = [[{ x: 1, y: 2 }]];
    source[0].meta = { k: 'v' };

    const out = geometry.clonePaths(source);
    out[0][0].x = 99;
    out[0].meta.k = 'changed';

    expect(source[0][0].x).toBe(1);
    expect(source[0].meta.k).toBe('v');
  });
});

describe('Optimization helpers', () => {
  test('pathLength supports polyline and circle-meta paths', () => {
    const poly = [{ x: 0, y: 0 }, { x: 3, y: 4 }];
    const circle = [];
    circle.meta = { kind: 'circle', r: 10 };

    expect(optimization.pathLength(poly)).toBeCloseTo(5, 6);
    expect(optimization.pathLength(circle)).toBeCloseTo(Math.PI * 20, 6);
  });

  test('closePathIfNeeded closes open paths when requested', () => {
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    const out = optimization.closePathIfNeeded(path, true);

    expect(out.length).toBe(path.length + 1);
    expect(out[out.length - 1]).toEqual(path[0]);
  });

  test('offsetPath offsets circle meta center', () => {
    const circle = [];
    circle.meta = { kind: 'circle', cx: 10, cy: 20, r: 3 };

    const out = optimization.offsetPath(circle, 5, -2);

    expect(out.meta.cx).toBe(15);
    expect(out.meta.cy).toBe(18);
    expect(out.meta.r).toBe(3);
  });
});
