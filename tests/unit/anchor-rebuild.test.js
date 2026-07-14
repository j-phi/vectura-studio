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

// The Expand bug. A shape layer (what Expand produces from every generative
// layer) ran a private simplify — RDP decimation, then Catmull-Rom handles ONLY
// when smoothing > 0 — while every other surface in the app fits real curves.
// Expand resets smoothing to 0, so an exploded spiral line simplified into
// handle-less chords and the renderer faked a curve through their midpoints:
// visibly a different shape from the line it came from. Simplify has to mean the
// same thing here as it does on the layer this shape was exploded out of.
describe('rebuildShapeAnchors — Curves on', () => {
  // A coarse arc, the shape of one line exploded out of a Spiralizer.
  const arc = () => {
    const pts = [];
    for (let i = 0; i < 25; i++) {
      const t = Math.PI * 0.15 + (i / 24) * Math.PI * 1.1;
      pts.push({ x: 100 + 80 * Math.cos(t), y: 100 + 60 * Math.sin(t), in: null, out: null });
    }
    return pts;
  };

  test('simplify with Curves on reduces to few anchors that ALL carry handles', () => {
    const { anchors: out } = geometry.rebuildShapeAnchors(arc(), {
      curves: true,
      simplify: 1,
      smoothing: 0,
      closed: false,
      bounds: { dW: 280, dH: 216 },
    });
    expect(out.length).toBeLessThan(10);
    expect(out.length).toBeGreaterThanOrEqual(2);
    // The whole point: a curve, not a chord polyline.
    expect(out.every((a) => a.in !== null || a.out !== null)).toBe(true);
  });

  test('the simplified curve still traces the original arc', () => {
    const source = arc();
    const { anchors: out } = geometry.rebuildShapeAnchors(source, {
      curves: true,
      simplify: 1,
      smoothing: 0,
      closed: false,
      bounds: { dW: 280, dH: 216 },
    });
    const drawn = geometry.buildPolylineFromAnchors(out, false);
    // Every original sample must lie on the curve that replaced it. A chord
    // polyline through 9 points cuts corners badly enough to blow this; the
    // handle-less midpoint-quadratic the renderer fell back to blows it worse.
    const diag = Math.hypot(160, 120);
    source.forEach((p) => {
      const nearest = drawn.reduce(
        (best, q) => Math.min(best, Math.hypot(q.x - p.x, q.y - p.y)),
        Infinity,
      );
      expect(nearest).toBeLessThan(diag * 0.02);
    });
  });

  test('Curves on with Simplify at 0 still fits a curve, not chords', () => {
    const { anchors: out } = geometry.rebuildShapeAnchors(arc(), {
      curves: true,
      simplify: 0,
      smoothing: 0,
      closed: false,
      bounds: { dW: 280, dH: 216 },
    });
    expect(out.some((a) => a.in || a.out)).toBe(true);
  });

  // The trap in the fix: toCurveAnchors is a deliberate no-op when curves are
  // off and smoothing is 0, so delegating unconditionally would make Simplify a
  // DEAD control for every pen-drawn polygon. Straight shapes keep decimating.
  test('Curves OFF: simplify still decimates, and stays straight', () => {
    const { anchors: out } = geometry.rebuildShapeAnchors(arc(), {
      curves: false,
      simplify: 1,
      smoothing: 0,
      closed: false,
      bounds: { dW: 280, dH: 216 },
    });
    expect(out.length).toBeLessThan(25);
    expect(out.every((a) => a.in === null && a.out === null)).toBe(true);
  });
});

// Simplify must never DESTROY a curve — only reduce the anchors describing it.
//
// The Curves toggle asks "should this geometry be represented as beziers?", and a
// path whose anchors already carry handles has answered that question for itself.
// Simplifying it with the toggle off used to fall through to RDP + null handles,
// which does not simplify the curve — it deletes it. On a shape with sharp corners
// and one curved notch, that pulled the drawn outline 18% of its own diagonal away
// from where it started: the notch snapped into a hard V while the toolbar's
// Simplify traced the same notch exactly.
describe('rebuildShapeAnchors — Curves OFF must not destroy an existing curve', () => {
  // Sharp corners AND one genuinely curved notch (the leading anchors carry handles).
  const starWithCurvedNotch = () => ([
    { x: 0, y: 100, in: null, out: { x: 20, y: 80 } },
    { x: 60, y: 60, in: { x: 40, y: 80 }, out: { x: 80, y: 40 } },
    { x: 0, y: 20, in: { x: 20, y: 40 }, out: null },
    { x: 60, y: 0, in: null, out: null },
    { x: 120, y: 30, in: null, out: null },
    { x: 160, y: 0, in: null, out: null },
    { x: 150, y: 90, in: null, out: null },
    { x: 110, y: 60, in: null, out: null },
    { x: 70, y: 130, in: null, out: null },
  ]);
  const opts = { curves: false, simplify: 1, smoothing: 0, closed: true, bounds: { dW: 200, dH: 150 } };

  test('the curved notch survives Simplify with Curves off', () => {
    const { anchors: out } = geometry.rebuildShapeAnchors(starWithCurvedNotch(), opts);
    expect(out.some((a) => a.in || a.out)).toBe(true);
  });

  test('the simplified outline still traces the original', () => {
    const source = starWithCurvedNotch();
    const before = geometry.buildPolylineFromAnchors(source, true);
    const { anchors: out } = geometry.rebuildShapeAnchors(source, opts);
    const after = geometry.buildPolylineFromAnchors(out, true);

    const diag = Math.hypot(160, 130);
    const maxDev = Math.max(...before.map((p) => Math.min(
      ...after.map((q) => Math.hypot(q.x - p.x, q.y - p.y)),
    )));
    // Destroying the notch put this at 18% of the diagonal.
    expect(maxDev / diag).toBeLessThan(0.05);
  });

  test('the sharp corners stay sharp — Simplify is not Smooth', () => {
    const { anchors: out } = geometry.rebuildShapeAnchors(starWithCurvedNotch(), opts);
    // A corner survives as a tangent discontinuity: the in/out handles of that
    // anchor are not collinear. (Rounding every corner is the opposite failure —
    // what the draw-time midpoint-quadratic did to this same star.)
    const corners = out.filter((a) => {
      if (!a.in || !a.out) return false;
      const inAngle = Math.atan2(a.y - a.in.y, a.x - a.in.x);
      const outAngle = Math.atan2(a.out.y - a.y, a.out.x - a.x);
      let d = Math.abs(outAngle - inAngle) * 180 / Math.PI;
      if (d > 180) d = 360 - d;
      return d > 20;
    });
    expect(corners.length).toBeGreaterThanOrEqual(4);
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
