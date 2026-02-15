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
