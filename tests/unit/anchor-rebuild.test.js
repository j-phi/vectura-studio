const geometry = require('../../src/core/geometry-utils.js');

describe('rebuildShapeAnchors', () => {
  const pointsToAnchors = (pts) => pts.map((p) => ({ x: p.x, y: p.y, in: null, out: null }));

  test('simplify > 0 drops collinear anchors (RDP)', () => {
    const anchors = [];
    for (let i = 0; i <= 20; i++) anchors.push({ x: i, y: 0, in: null, out: null });
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0.5,
      smoothing: 0,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    expect(out.length).toBe(2);
    expect(out[0].x).toBe(0);
    expect(out[out.length - 1].x).toBe(20);
  });

  test('simplify preserves first/last anchor', () => {
    const anchors = [];
    for (let i = 0; i < 50; i++) anchors.push({ x: i, y: Math.sin(i) * 5, in: null, out: null });
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0.3,
      smoothing: 0,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    expect(out.length).toBeLessThan(anchors.length);
    expect(out[0].x).toBe(anchors[0].x);
    expect(out[0].y).toBe(anchors[0].y);
    expect(out[out.length - 1].x).toBe(anchors[anchors.length - 1].x);
    expect(out[out.length - 1].y).toBe(anchors[anchors.length - 1].y);
  });

  test('smoothing > 0 generates cubic bezier .in/.out handles for interior anchors', () => {
    const anchors = pointsToAnchors([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 1,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    expect(out.length).toBe(3);
    expect(out[1].in).not.toBeNull();
    expect(out[1].out).not.toBeNull();
    // Catmull-Rom-to-Bezier: dx = (next.x - prev.x) * tension / 6 = (20 - 0) / 6
    expect(out[1].out.x).toBeCloseTo(10 + 20 / 6, 5);
    expect(out[1].in.x).toBeCloseTo(10 - 20 / 6, 5);
  });

  test('open path endpoints have null outward handle even when smoothing > 0', () => {
    const anchors = pointsToAnchors([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ]);
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 0.5,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    expect(out[0].in).toBeNull();
    expect(out[out.length - 1].out).toBeNull();
  });

  test('smoothing = 0 yields straight segments (all handles null)', () => {
    const anchors = pointsToAnchors([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ]);
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 0,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    expect(out.every((a) => a.in === null && a.out === null)).toBe(true);
  });

  test('closed path: every anchor gets bezier handles (no endpoint nulling)', () => {
    const anchors = pointsToAnchors([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 0.5,
      closed: true,
      bounds: { dW: 100, dH: 100 },
    });
    expect(out.length).toBe(4);
    expect(out.every((a) => a.in !== null && a.out !== null)).toBe(true);
  });

  test('empty anchors → empty result', () => {
    const { anchors: out } = geometry.rebuildShapeAnchors([], {
      simplify: 0.5,
      smoothing: 0.5,
      bounds: { dW: 100, dH: 100 },
    });
    expect(out).toEqual([]);
  });

  test('returned anchors are new objects (no mutation of input)', () => {
    const anchors = pointsToAnchors([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ]);
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 0.5,
      bounds: { dW: 100, dH: 100 },
    });
    expect(out[1]).not.toBe(anchors[1]);
    expect(anchors[1].in).toBeNull();
    expect(anchors[1].out).toBeNull();
  });
});

describe('buildPolylineFromAnchors', () => {
  test('two anchors with null handles → straight segment of 2 points', () => {
    const out = geometry.buildPolylineFromAnchors(
      [
        { x: 0, y: 0, in: null, out: null },
        { x: 10, y: 0, in: null, out: null },
      ],
      false
    );
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({ x: 0, y: 0, in: null, out: null });
    expect(out[1].x).toBe(10);
  });

  test('bezier handles produce sampled polyline with >2 points', () => {
    const out = geometry.buildPolylineFromAnchors(
      [
        { x: 0, y: 0, in: null, out: { x: 3, y: 5 } },
        { x: 10, y: 0, in: { x: 7, y: 5 }, out: null },
      ],
      false
    );
    expect(out.length).toBeGreaterThan(2);
    expect(out[0].x).toBeCloseTo(0, 5);
    expect(out[0].y).toBeCloseTo(0, 5);
    expect(out[out.length - 1].x).toBeCloseTo(10, 5);
  });

  test('closed=true closes the loop back to first anchor', () => {
    const out = geometry.buildPolylineFromAnchors(
      [
        { x: 0, y: 0, in: null, out: null },
        { x: 10, y: 0, in: null, out: null },
        { x: 5, y: 10, in: null, out: null },
      ],
      true
    );
    const first = out[0];
    const last = out[out.length - 1];
    expect(last.x).toBeCloseTo(first.x, 5);
    expect(last.y).toBeCloseTo(first.y, 5);
  });
});

describe('pointsToAnchors / cloneAnchors', () => {
  test('pointsToAnchors creates anchors with null bezier handles', () => {
    const out = geometry.pointsToAnchors([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    expect(out).toEqual([
      { x: 1, y: 2, in: null, out: null },
      { x: 3, y: 4, in: null, out: null },
    ]);
  });

  test('cloneAnchors produces a deep clone (mutation safe)', () => {
    const anchors = [{ x: 0, y: 0, in: { x: -1, y: -1 }, out: { x: 1, y: 1 } }];
    const clone = geometry.cloneAnchors(anchors);
    expect(clone[0]).not.toBe(anchors[0]);
    expect(clone[0].in).not.toBe(anchors[0].in);
    clone[0].in.x = 99;
    expect(anchors[0].in.x).toBe(-1);
  });
});
