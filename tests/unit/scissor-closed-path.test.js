/**
 * Regression test: scissor/knife on a closed pen path must not produce an
 * extra spurious segment near the path's start anchor.
 *
 * Root cause: buildPolylineFromAnchors adds a closing segment so the
 * polyline starts and ends at anchor[0].  splitPathByShape seeds current
 * with path[0] and, after all cuts, the trailing current also ends at
 * path[0].  Without the closed-path merge those two pieces are emitted
 * separately, yielding one extra segment near the start anchor.
 */
const geometry = require('../../src/core/geometry-utils.js');

describe('splitPathByShape — closed pen paths', () => {
  const { splitPathByShape, buildPolylineFromAnchors } = geometry;

  // Fan/sector shape: UL(−100, 50), UR(100, 50), B(0, 200), closed.
  // No bezier handles → straight segments → polyline is [UL, UR, B, UL].
  const makeFanPolyline = () =>
    buildPolylineFromAnchors([
      { x: -100, y: 50,  in: null, out: null },
      { x:  100, y: 50,  in: null, out: null },
      { x:    0, y: 200, in: null, out: null },
    ], true);

  test('buildPolylineFromAnchors (closed) produces a polyline where first === last', () => {
    const path = makeFanPolyline();
    expect(path.length).toBeGreaterThan(2);
    expect(path[0].x).toBeCloseTo(path[path.length - 1].x, 5);
    expect(path[0].y).toBeCloseTo(path[path.length - 1].y, 5);
  });

  test('horizontal knife through the straight sides yields exactly 2 pieces (regression)', () => {
    // y=100 crosses UR→B and B→UL — two intersections on a closed triangle.
    // Buggy code emits 3 pieces: [UL,UR,i1], [i1,B,i2], [i2,UL].
    // Fixed code merges the first and last into one: [i2,UL,UR,i1].
    const path  = makeFanPolyline();
    const shape = { mode: 'line', line: { a: { x: -300, y: 100 }, b: { x: 300, y: 100 } } };
    const result = splitPathByShape(path, shape);
    expect(result).not.toBeNull();
    expect(result.length).toBe(2);
  });

  test('the two pieces share both cut intersection endpoints', () => {
    const path  = makeFanPolyline();
    const shape = { mode: 'line', line: { a: { x: -300, y: 100 }, b: { x: 300, y: 100 } } };
    const result = splitPathByShape(path, shape);
    expect(result).not.toBeNull();
    expect(result.length).toBe(2);
    // End of piece 0 == start of piece 1
    const end0   = result[0][result[0].length - 1];
    const start1 = result[1][0];
    expect(end0.x).toBeCloseTo(start1.x, 5);
    expect(end0.y).toBeCloseTo(start1.y, 5);
    // End of piece 1 == start of piece 0
    const end1   = result[1][result[1].length - 1];
    const start0 = result[0][0];
    expect(end1.x).toBeCloseTo(start0.x, 5);
    expect(end1.y).toBeCloseTo(start0.y, 5);
  });

  test('open path cut is unaffected', () => {
    // Same triangle but open (no closing segment) — only UR→B is crossed.
    const path  = [
      { x: -100, y: 50  },
      { x:  100, y: 50  },
      { x:    0, y: 200 },
    ];
    const shape = { mode: 'line', line: { a: { x: -300, y: 100 }, b: { x: 300, y: 100 } } };
    const result = splitPathByShape(path, shape);
    expect(result).not.toBeNull();
    expect(result.length).toBe(2);
  });

  test('returns null when the knife does not intersect', () => {
    const path  = makeFanPolyline();
    const shape = { mode: 'line', line: { a: { x: -300, y: 300 }, b: { x: 300, y: 300 } } };
    expect(splitPathByShape(path, shape)).toBeNull();
  });
});
