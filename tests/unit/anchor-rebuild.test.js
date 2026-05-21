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

  // Regression: with curves=ON+smoothing=0, rebuilt anchors get TINY (0.0001)
  // tangent handles so the shape is "structurally bezier" but visually identical
  // to the chord polyline. Renderer + SVG export must NOT treat this as
  // baked-in bezier curvature (else they skip quadratic smoothing and the
  // line shows up as straight segments).
  test('hasBakedBezierCurvature: tiny tangent handles read as NOT baked', () => {
    const anchors = [
      { x: 0,  y: 0, in: null, out: null },
      { x: 10, y: 0, in: null, out: null },
      { x: 20, y: 0, in: null, out: null },
    ];
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 0,
      curves: true,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    // Sanity: rebuild did add tiny tangent handles to the interior anchor.
    expect(out[1].out).not.toBeNull();
    const outLen = Math.hypot(out[1].out.x - out[1].x, out[1].out.y - out[1].y);
    expect(outLen).toBeLessThan(0.01);
    // The helper should report no real curvature baked in — quadratic smoothing
    // is still needed at render time.
    expect(geometry.hasBakedBezierCurvature(out)).toBe(false);
  });

  test('hasBakedBezierCurvature: smoothing>0 handles read as baked', () => {
    const anchors = [
      { x: 0,  y: 0, in: null, out: null },
      { x: 10, y: 0, in: null, out: null },
      { x: 20, y: 0, in: null, out: null },
    ];
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 1,
      curves: true,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    expect(geometry.hasBakedBezierCurvature(out)).toBe(true);
  });

  test('hasBakedBezierCurvature: user-edited wide handles read as baked', () => {
    const anchors = [
      { x: 0,  y: 0, in: null, out: null },
      { x: 10, y: 0, in: { x: -20, y: 30 }, out: { x: 40, y: -30 } },
      { x: 20, y: 0, in: null, out: null },
    ];
    expect(geometry.hasBakedBezierCurvature(anchors)).toBe(true);
  });

  test('hasBakedBezierCurvature: null handles read as NOT baked', () => {
    const anchors = [
      { x: 0,  y: 0, in: null, out: null },
      { x: 10, y: 5, in: null, out: null },
    ];
    expect(geometry.hasBakedBezierCurvature(anchors)).toBe(false);
  });

  // Existing bezier handle behaviour when smoothing > 0

  test('aligned bezier with short handles: handles grow to CR minimum, direction preserved', () => {
    // Middle anchor at (10,0) with aligned handles shorter than CR would produce.
    // CR at smoothing=1: crLen = (20-0)*1/6 = 20/6 ≈ 3.333
    // srcOut offset = {x:1,y:0} (len=1), srcIn offset = {x:-1,y:0} (len=1) — both < crLen.
    const anchors = [
      { x: 0,  y: 0, in: null, out: null },
      { x: 10, y: 0, in: { x: 9, y: 0 }, out: { x: 11, y: 0 } },
      { x: 20, y: 0, in: null, out: null },
    ];
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 1,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    const crLen = 20 / 6;
    // Direction unchanged (still points along x-axis), length floored to crLen.
    expect(out[1].out.x).toBeCloseTo(10 + crLen, 5);
    expect(out[1].out.y).toBeCloseTo(0, 5);
    expect(out[1].in.x).toBeCloseTo(10 - crLen, 5);
    expect(out[1].in.y).toBeCloseTo(0, 5);
  });

  test('aligned bezier with long handles: handles left unchanged', () => {
    // Handles longer than CR minimum should not be shortened.
    // CR at smoothing=1: crLen = 20/6 ≈ 3.333. Use handles of length 8.
    const anchors = [
      { x: 0,  y: 0, in: null, out: null },
      { x: 10, y: 0, in: { x: 2, y: 0 }, out: { x: 18, y: 0 } },
      { x: 20, y: 0, in: null, out: null },
    ];
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 1,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    expect(out[1].out.x).toBeCloseTo(18, 5);
    expect(out[1].out.y).toBeCloseTo(0, 5);
    expect(out[1].in.x).toBeCloseTo(2, 5);
    expect(out[1].in.y).toBeCloseTo(0, 5);
  });

  test('broken bezier at smoothing=1: handles fully aligned to CR tangent', () => {
    // Middle anchor at (10,0). CR tangent points along x (crDir={x:1,y:0}).
    // Provide a "broken" out-handle pointing diagonally (not antiparallel to in).
    // At smoothing=1 the broken handle direction should blend fully to crDir.
    const diagLen = Math.sqrt(2);  // distance of {x:1,y:1} offset
    const anchors = [
      { x: 0,  y: 0, in: null, out: null },
      { x: 10, y: 0, in: { x: 9, y: 0 }, out: { x: 11, y: 1 } },
      { x: 20, y: 0, in: null, out: null },
    ];
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 1,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    const crLen = 20 / 6;
    const outOff = { x: out[1].out.x - 10, y: out[1].out.y - 0 };
    // Direction should be fully aligned to crDir = {x:1,y:0} at smoothing=1.
    expect(outOff.y).toBeCloseTo(0, 4);
    expect(outOff.x).toBeGreaterThan(0);
    // Length should be at least crLen.
    const outLen = Math.sqrt(outOff.x * outOff.x + outOff.y * outOff.y);
    expect(outLen).toBeGreaterThanOrEqual(crLen - 1e-9);
  });

  test('hook handle (backward-pointing) is replaced with full CR handle', () => {
    // Out-handle points LEFT (backward along path going right) → hook.
    const anchors = [
      { x: 0,  y: 0, in: null, out: null },
      { x: 10, y: 0, in: { x: 9, y: 0 }, out: { x: 8, y: 0 } },  // out offset = {x:-2} = hook
      { x: 20, y: 0, in: null, out: null },
    ];
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 1,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    const crLen = 20 / 6;
    // Hook replaced: out handle should now point in CR direction.
    expect(out[1].out.x).toBeCloseTo(10 + crLen, 5);
    expect(out[1].out.y).toBeCloseTo(0, 5);
  });

  // `curves` toggle: convert corner anchors to bezier with tiny handles
  test('curves=true with smoothing=0 generates tiny handles along tangent direction', () => {
    const anchors = pointsToAnchors([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 0,
      curves: true,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    expect(out.length).toBe(3);
    // Interior anchor gets tiny handles in tangent direction
    expect(out[1].in).not.toBeNull();
    expect(out[1].out).not.toBeNull();
    const outLen = Math.hypot(out[1].out.x - 10, out[1].out.y - 0);
    const inLen = Math.hypot(out[1].in.x - 10, out[1].in.y - 0);
    expect(outLen).toBeCloseTo(0.0001, 6);
    expect(inLen).toBeCloseTo(0.0001, 6);
    // Direction: out along +x, in along -x
    expect(out[1].out.x).toBeGreaterThan(10);
    expect(out[1].in.x).toBeLessThan(10);
  });

  test('curves=true with smoothing=0: endpoints have one tiny handle', () => {
    const anchors = pointsToAnchors([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 0,
      curves: true,
      closed: false,
      bounds: { dW: 100, dH: 100 },
    });
    // Open-path endpoints null their outward handle
    expect(out[0].in).toBeNull();
    expect(out[out.length - 1].out).toBeNull();
    // But their inward handle should be the tiny CR-direction handle
    expect(out[0].out).not.toBeNull();
    expect(out[out.length - 1].in).not.toBeNull();
  });

  test('curves=false with smoothing=0: no handles (existing behaviour preserved)', () => {
    const anchors = pointsToAnchors([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ]);
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 0,
      curves: false,
      bounds: { dW: 100, dH: 100 },
    });
    expect(out.every((a) => a.in === null && a.out === null)).toBe(true);
  });

  test('smoothing > 0 overrides tiny-handle floor', () => {
    const anchors = pointsToAnchors([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 0.5,
      curves: true,
      bounds: { dW: 100, dH: 100 },
    });
    // CR length at smoothing=0.5 = (20-0) * 0.5 / 6 ≈ 1.667 — way larger than tiny floor
    const outLen = Math.hypot(out[1].out.x - 10, out[1].out.y - 0);
    expect(outLen).toBeCloseTo(20 * 0.5 / 6, 5);
  });

  test('smoothing=2: handles scale to double the smoothing=1 length', () => {
    const anchors = pointsToAnchors([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    const { anchors: out2 } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 2,
      bounds: { dW: 100, dH: 100 },
    });
    const { anchors: out1 } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 1,
      bounds: { dW: 100, dH: 100 },
    });
    const len2 = Math.hypot(out2[1].out.x - 10, out2[1].out.y - 0);
    const len1 = Math.hypot(out1[1].out.x - 10, out1[1].out.y - 0);
    expect(len2).toBeCloseTo(len1 * 2, 5);
  });

  test('smoothing input > 2 is clamped to 2', () => {
    const anchors = pointsToAnchors([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    const { anchors: outClamped } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 5,
      bounds: { dW: 100, dH: 100 },
    });
    const { anchors: out2 } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 2,
      bounds: { dW: 100, dH: 100 },
    });
    expect(outClamped[1].out.x).toBeCloseTo(out2[1].out.x, 5);
    expect(outClamped[1].out.y).toBeCloseTo(out2[1].out.y, 5);
  });

  test('curves=true on closed path: every anchor gets tiny handles, none null', () => {
    const anchors = pointsToAnchors([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    const { anchors: out } = geometry.rebuildShapeAnchors(anchors, {
      simplify: 0,
      smoothing: 0,
      curves: true,
      closed: true,
      bounds: { dW: 100, dH: 100 },
    });
    expect(out.length).toBe(4);
    expect(out.every((a) => a.in !== null && a.out !== null)).toBe(true);
    // Tiny length
    const len = Math.hypot(out[0].out.x - 0, out[0].out.y - 0);
    expect(len).toBeCloseTo(0.0001, 6);
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
