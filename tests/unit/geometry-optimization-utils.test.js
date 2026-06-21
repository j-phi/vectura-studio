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
