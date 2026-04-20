const { pointInPolygon, segmentPathByPolygons, segmentIntersectSegment, closePolygonIfNeeded } = require('../../src/core/path-boolean.js');

// Closed square [0,0]→[10,0]→[10,10]→[0,10]→[0,0]
const square = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 },
];

// L-shaped concave polygon (missing top-right quadrant)
const lShape = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 },
  { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 },
];

describe('pointInPolygon', () => {
  test('centre of square is inside', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
  });

  test('point clearly outside square is outside', () => {
    expect(pointInPolygon({ x: 20, y: 20 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: 5 }, square)).toBe(false);
  });

  test('point inside the filled area of the L-shape is inside', () => {
    expect(pointInPolygon({ x: 2, y: 2 }, lShape)).toBe(true);
    expect(pointInPolygon({ x: 2, y: 8 }, lShape)).toBe(true);
  });

  test('point in the concave notch (top-right) of L-shape is outside', () => {
    expect(pointInPolygon({ x: 8, y: 8 }, lShape)).toBe(false);
  });

  test('returns false for degenerate inputs', () => {
    expect(pointInPolygon(null, square)).toBe(false);
    expect(pointInPolygon({ x: 5, y: 5 }, [])).toBe(false);
    expect(pointInPolygon({ x: 5, y: 5 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });
});

describe('segmentIntersectSegment', () => {
  test('crossing segments return intersection point', () => {
    const hit = segmentIntersectSegment(
      { x: 0, y: 5 }, { x: 10, y: 5 },
      { x: 5, y: 0 }, { x: 5, y: 10 }
    );
    expect(hit).not.toBeNull();
    expect(hit.x).toBeCloseTo(5, 5);
    expect(hit.y).toBeCloseTo(5, 5);
  });

  test('parallel segments return null', () => {
    const hit = segmentIntersectSegment(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 0, y: 5 }, { x: 10, y: 5 }
    );
    expect(hit).toBeNull();
  });

  test('non-crossing segments return null', () => {
    const hit = segmentIntersectSegment(
      { x: 0, y: 0 }, { x: 4, y: 0 },
      { x: 6, y: 0 }, { x: 10, y: 0 }
    );
    expect(hit).toBeNull();
  });
});

describe('segmentPathByPolygons', () => {
  test('line fully inside polygon is returned intact', () => {
    const path = [{ x: 2, y: 2 }, { x: 8, y: 8 }];
    const result = segmentPathByPolygons(path, [square]);
    expect(result).toHaveLength(0); // outside is kept, inside is clipped away
  });

  test('line fully outside polygon is returned intact', () => {
    const path = [{ x: 15, y: 15 }, { x: 20, y: 20 }];
    const result = segmentPathByPolygons(path, [square]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
    expect(result[0][0].x).toBeCloseTo(15, 4);
    expect(result[0][1].x).toBeCloseTo(20, 4);
  });

  test('line crossing polygon boundary is split at intersection', () => {
    const path = [{ x: -5, y: 5 }, { x: 15, y: 5 }];
    const result = segmentPathByPolygons(path, [square]);
    expect(result).toHaveLength(2);
    // Both segments stay outside the square
    result.forEach((seg) => {
      seg.forEach((pt) => {
        const insideX = pt.x > 0 && pt.x < 10;
        const insideY = pt.y > 0 && pt.y < 10;
        expect(insideX && insideY).toBe(false);
      });
    });
  });

  test('invert mode keeps the inside segment', () => {
    const path = [{ x: -5, y: 5 }, { x: 15, y: 5 }];
    const result = segmentPathByPolygons(path, [square], { invert: true });
    expect(result).toHaveLength(1);
    result[0].forEach((pt) => {
      expect(pt.x).toBeGreaterThanOrEqual(-0.001);
      expect(pt.x).toBeLessThanOrEqual(10.001);
    });
  });

  test('line crossing polygon twice produces three segments', () => {
    // Horizontal line that enters and exits the square twice
    const inner = [{ x: 2, y: 5 }, { x: 8, y: 5 }];
    const outer = [{ x: -5, y: 5 }, { x: 15, y: 5 }];
    const resultInner = segmentPathByPolygons(inner, [square]);
    const resultOuter = segmentPathByPolygons(outer, [square]);
    // Inner line gets fully clipped (no outside segments)
    expect(resultInner).toHaveLength(0);
    // Outer line produces 2 outside segments
    expect(resultOuter).toHaveLength(2);
  });

  test('returns empty for degenerate inputs', () => {
    expect(segmentPathByPolygons([], [square])).toHaveLength(0);
    expect(segmentPathByPolygons([{ x: 0, y: 0 }], [square])).toHaveLength(0);
  });

  test('meta is propagated to output segments', () => {
    const path = [{ x: -5, y: 5 }, { x: 15, y: 5 }];
    path.meta = { layerId: 'test' };
    const result = segmentPathByPolygons(path, [square]);
    result.forEach((seg) => {
      expect(seg.meta).toEqual({ layerId: 'test' });
    });
  });
});

describe('closePolygonIfNeeded', () => {
  test('already-closed polygon is unchanged', () => {
    const result = closePolygonIfNeeded(square);
    expect(result[0]).toEqual(result[result.length - 1]);
  });

  test('open polygon gets closing point appended', () => {
    const open = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    const result = closePolygonIfNeeded(open);
    expect(result[result.length - 1]).toEqual({ x: 0, y: 0 });
  });

  test('returns empty for degenerate inputs', () => {
    expect(closePolygonIfNeeded([])).toHaveLength(0);
    expect(closePolygonIfNeeded([{ x: 0, y: 0 }])).toHaveLength(0);
  });
});
