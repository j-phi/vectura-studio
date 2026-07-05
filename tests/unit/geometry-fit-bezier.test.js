/*
 * GeometryUtils.fitBezierAnchors — Schneider cubic-bezier curve fitting.
 * Fits the FEWEST bezier segments to a point list within a tolerance, returned
 * as anchors { x, y, in, out } with absolute handle control points. Drives the
 * interactive Smooth so a dense polyline collapses to minimal bezier anchors.
 */
const GU = require('../../src/core/geometry-utils.js');

const circle = (n, r = 100) => {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) }); }
  return pts;
};

describe('GeometryUtils.fitBezierAnchors', () => {
  test('is exported', () => {
    expect(typeof GU.fitBezierAnchors).toBe('function');
  });

  test('collapses a dense circle to a handful of anchors that stay faithful', () => {
    const pts = circle(64, 100);
    const anchors = GU.fitBezierAnchors(pts, true, 1.0); // ~1px tolerance
    expect(anchors.length).toBeGreaterThan(1);
    expect(anchors.length).toBeLessThan(16); // far fewer than 64 input points
    expect(anchors.every((a) => a.in || a.out)).toBe(true);
    // Flatten the fitted anchors and check they stay within tolerance of r=100.
    const flat = GU.buildPolylineFromAnchors(anchors, true);
    const maxDev = Math.max(...flat.map((p) => Math.abs(Math.hypot(p.x, p.y) - 100)));
    expect(maxDev).toBeLessThan(4);
  });

  test('looser tolerance yields the same or fewer anchors', () => {
    const pts = circle(64, 100);
    const tight = GU.fitBezierAnchors(pts, true, 0.2).length;
    const loose = GU.fitBezierAnchors(pts, true, 6).length;
    expect(loose).toBeLessThanOrEqual(tight);
  });

  test('open path: first anchor has no in-handle, last has no out-handle', () => {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push({ x: t * 200, y: Math.sin(t * Math.PI) * 80 }); }
    const anchors = GU.fitBezierAnchors(pts, false, 1.0);
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    expect(anchors[0].in).toBeNull();
    expect(anchors[anchors.length - 1].out).toBeNull();
    // Endpoints stay pinned to the original endpoints.
    expect(anchors[0].x).toBeCloseTo(pts[0].x, 6);
    expect(anchors[anchors.length - 1].x).toBeCloseTo(pts[pts.length - 1].x, 6);
  });

  test('preserves sharp corners (a cross stays crisp, never balloons)', () => {
    // Plus-sign / cross outline — 12 right-angle corners, no curves.
    const cross = [[40, 0], [80, 0], [80, 40], [120, 40], [120, 80], [80, 80],
      [80, 120], [40, 120], [40, 80], [0, 80], [0, 40], [40, 40]].map(([x, y]) => ({ x, y }));
    const anchors = GU.fitBezierAnchors(cross, true, 10); // deliberately loose tolerance
    // Every corner is kept as an anchor at its exact position.
    expect(anchors.length).toBe(12);
    cross.forEach((c, i) => {
      expect(anchors[i].x).toBeCloseTo(c.x, 6);
      expect(anchors[i].y).toBeCloseTo(c.y, 6);
    });
    // The fitted curve does not overshoot the original 0..120 bounding box.
    const flat = GU.buildPolylineFromAnchors(anchors, true);
    const minX = Math.min(...flat.map((p) => p.x));
    const maxX = Math.max(...flat.map((p) => p.x));
    expect(minX).toBeGreaterThanOrEqual(-0.01);
    expect(maxX).toBeLessThanOrEqual(120.01);
  });

  test('cornerRadiusFrac fillets sharp corners (2 anchors each), growing with the radius, no overshoot', () => {
    // Regular hexagon.
    const hex = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; hex.push({ x: 100 * Math.cos(a), y: 100 * Math.sin(a) }); }
    const tol = 0.0015 * 200;

    const sharp = GU.fitBezierAnchors(hex, true, tol, undefined, 0);
    expect(sharp.length).toBe(6); // untouched corners

    const rounded = GU.fitBezierAnchors(hex, true, tol, undefined, 0.5);
    expect(rounded.length).toBe(12); // 2 setback anchors per corner
    expect(rounded.every((a) => a.in || a.out)).toBe(true);

    // The fillet rounds INWARD (corners recede) — it never balloons past the
    // original hull.
    const bboxW = (anchors) => {
      const flat = GU.buildPolylineFromAnchors(anchors, true);
      return Math.max(...flat.map((p) => p.x)) - Math.min(...flat.map((p) => p.x));
    };
    const wSharp = bboxW(sharp);
    const wHalf = bboxW(GU.fitBezierAnchors(hex, true, tol, undefined, 0.5));
    const wFull = bboxW(GU.fitBezierAnchors(hex, true, tol, undefined, 1));
    // Bigger radius → more rounding (pointy corners recede), never larger.
    expect(wHalf).toBeLessThan(wSharp + 1e-6);
    expect(wFull).toBeLessThan(wHalf);
  });

  test('degenerate input (fewer than 3 points) returns corner anchors', () => {
    const anchors = GU.fitBezierAnchors([{ x: 0, y: 0 }, { x: 10, y: 0 }], false, 1);
    expect(anchors.length).toBe(2);
    expect(anchors.every((a) => a.in === null && a.out === null)).toBe(true);
  });
});
