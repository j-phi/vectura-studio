/**
 * Regression: closing a 2-anchor bezier pen path must emit the closing
 * segment in buildPolylineFromAnchors. Previously the guard was `count > 2`,
 * which skipped the B→A closing segment entirely, leaving only the A→B arc.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('pen close with 2-anchor bezier path', () => {
  let runtime;
  let buildPolylineFromAnchors;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    buildPolylineFromAnchors = runtime.window.Vectura.GeometryUtils.buildPolylineFromAnchors;
  });

  afterAll(() => {
    runtime?.cleanup?.();
  });

  // Two anchors with opposing bezier handles so A→B and B→A are distinct curves.
  const A = { x: 0,   y: 0,   in: { x: 0, y: -30 },  out: { x: 0,  y: 30  } };
  const B = { x: 100, y: 0,   in: { x: 100, y: 30 },  out: { x: 100, y: -30 } };

  test('open 2-anchor path returns only A→B segment', () => {
    const pts = buildPolylineFromAnchors([A, B], false);
    expect(pts.length).toBeGreaterThan(2);
    // First and last points should be A and B.
    expect(pts[0].x).toBeCloseTo(A.x);
    expect(pts[0].y).toBeCloseTo(A.y);
    expect(pts[pts.length - 1].x).toBeCloseTo(B.x);
    expect(pts[pts.length - 1].y).toBeCloseTo(B.y);
  });

  test('closed 2-anchor path emits closing segment so last point returns to A', () => {
    const pts = buildPolylineFromAnchors([A, B], true);
    expect(pts.length).toBeGreaterThan(2);
    // The polyline must form a closed loop: last point ≈ first.
    const first = pts[0];
    const last  = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(first.x, 1);
    expect(last.y).toBeCloseTo(first.y, 1);
  });

  test('closed 2-anchor path has more points than open (closing segment adds samples)', () => {
    const open   = buildPolylineFromAnchors([A, B], false);
    const closed = buildPolylineFromAnchors([A, B], true);
    expect(closed.length).toBeGreaterThan(open.length);
  });

  test('closed 3-anchor path still emits closing segment (regression guard)', () => {
    const C = { x: 50, y: 80, in: { x: 20, y: 80 }, out: { x: 80, y: 80 } };
    const pts = buildPolylineFromAnchors([A, C, B], true);
    const first = pts[0];
    const last  = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(first.x, 1);
    expect(last.y).toBeCloseTo(first.y, 1);
  });
});
