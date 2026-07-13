/**
 * GeometryUtils.toCurveAnchors — the one curve fit.
 *
 * Replaces Catmull-Rom-at-0..1 (rebuildShapeAnchors), Catmull-Rom-at-0..100
 * (Geometry3D.smoothToBezier), the naive-corner Schneider fit
 * (fitBezierAnchors), and the renderer's draw-time midpoint-quadratic — which
 * was never a fit at all.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// A coarse spiral: exactly the case that made the reported bug visible. Sparse
// enough that a naive immediate-neighbour corner test would call every vertex a
// corner and refuse to smooth anything.
const coarseSpiral = (turns = 3, perTurn = 10) => {
  const pts = [];
  const n = turns * perTurn;
  for (let i = 0; i <= n; i++) {
    const t = (i / perTurn) * Math.PI * 2;
    const r = 5 + (i / n) * 60;
    pts.push({ x: 100 + r * Math.cos(t), y: 100 + r * Math.sin(t) });
  }
  return pts;
};

// A square: four real corners that must SURVIVE the fit, at any smoothing.
const SQUARE = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 },
];

describe('toCurveAnchors', () => {
  let runtime;
  let GU;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    GU = runtime.window.Vectura.GeometryUtils;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const handled = (anchors) => (anchors || []).filter((a) => a && (a.in || a.out)).length;

  describe('the enable contract', () => {
    test('curves off + smoothing 0 is a byte-identical no-op', () => {
      const r = GU.toCurveAnchors(coarseSpiral(), { curves: false, smoothing: 0 });
      expect(r.straight).toBe(true);
      expect(r.anchors).toBeNull();
    });

    test('curves ON curves the path even at smoothing 0 — the toggle is never a no-op', () => {
      const r = GU.toCurveAnchors(coarseSpiral(), { curves: true, smoothing: 0 });
      expect(r.straight).toBe(false);
      expect(handled(r.anchors)).toBeGreaterThan(0);
    });

    test('smoothing alone curves it, with curves off (a *Smoothing slider still bends the line)', () => {
      const r = GU.toCurveAnchors(coarseSpiral(), { curves: false, smoothing: 0.5 });
      expect(r.straight).toBe(false);
      expect(handled(r.anchors)).toBeGreaterThan(0);
    });

    test('a sub-3-point path cannot curve', () => {
      expect(GU.toCurveAnchors([{ x: 0, y: 0 }, { x: 1, y: 1 }], { curves: true }).straight).toBe(true);
    });
  });

  describe('points-in and anchors-in agree', () => {
    test('lifting points to handle-less anchors changes nothing', () => {
      const pts = coarseSpiral();
      const fromPoints = GU.toCurveAnchors(pts, { curves: true, smoothing: 0.4 });
      const fromAnchors = GU.toCurveAnchors(
        pts.map((p) => ({ x: p.x, y: p.y, in: null, out: null })),
        { curves: true, smoothing: 0.4 },
      );
      expect(fromAnchors.anchors.length).toBe(fromPoints.anchors.length);
      fromPoints.anchors.forEach((a, i) => {
        expect(fromAnchors.anchors[i].x).toBeCloseTo(a.x, 6);
        expect(fromAnchors.anchors[i].y).toBeCloseTo(a.y, 6);
      });
    });
  });

  describe('it fits the curve rather than cutting its corners', () => {
    // The midpoint-quadratic this replaces re-anchored the path onto edge
    // MIDPOINTS, so the drawn curve never touched the algorithm's own samples.
    // A fit must pass through (or very near) them.
    test('the fitted curve passes through the sample points', () => {
      const pts = coarseSpiral(2, 16);
      const { anchors, closed } = GU.toCurveAnchors(pts, { curves: true, smoothing: 0 });
      const flat = GU.buildPolylineFromAnchors(anchors, closed);

      const nearest = (p) => flat.reduce(
        (best, q) => Math.min(best, Math.hypot(q.x - p.x, q.y - p.y)),
        Infinity,
      );
      const worst = pts.reduce((m, p) => Math.max(m, nearest(p)), 0);
      // bbox diagonal here is ~170; the fit tolerance at smoothing 0 is 0.2% of it.
      expect(worst).toBeLessThan(2);
    });

    test('a coarse spiral actually smooths — windowed tangents see the shape, not the sampling', () => {
      const pts = coarseSpiral(3, 10);
      const { anchors } = GU.toCurveAnchors(pts, { curves: true, smoothing: 0 });
      // A naive turn-angle corner test would flag all ~31 vertices (each turn is
      // 36 degrees) and emit a handle-less polyline. The windowed test must not.
      expect(handled(anchors)).toBeGreaterThan(anchors.length * 0.5);
    });
  });

  describe('real corners survive', () => {
    test("a square's four corners are not rounded away at smoothing 0", () => {
      const { anchors } = GU.toCurveAnchors(SQUARE, { curves: true, smoothing: 0, closed: true });
      const corners = (anchors || []).filter((a) => a && a.corner);
      expect(corners.length).toBe(4);
    });

    test('the fitted square stays on its own edges', () => {
      const { anchors } = GU.toCurveAnchors(SQUARE, { curves: true, smoothing: 0, closed: true });
      const flat = GU.buildPolylineFromAnchors(anchors, true);
      // Every sample sits on the axis-aligned boundary (x or y pinned to 0/100).
      const onEdge = flat.every((p) => (
        Math.min(Math.abs(p.x), Math.abs(p.x - 100), Math.abs(p.y), Math.abs(p.y - 100)) < 1
      ));
      expect(onEdge).toBe(true);
    });
  });

  describe('the sliders do what they say', () => {
    test('simplify reduces the anchor count', () => {
      const pts = coarseSpiral(3, 24);
      const few = GU.toCurveAnchors(pts, { curves: true, smoothing: 0, simplify: 0.8 });
      const many = GU.toCurveAnchors(pts, { curves: true, smoothing: 0, simplify: 0 });
      expect(few.anchors.length).toBeLessThan(many.anchors.length);
    });

    // Simplify at full tilt used to widen the fit tolerance so far that the fit
    // degenerated and returned NOTHING — the curve silently vanished at the top
    // of the slider. Simplify now does most of its work by decimating, and its
    // tolerance contribution is bounded. Sweep the whole range: the fit must
    // always come back with a usable curve.
    test('the curve never vanishes anywhere on the Simplify range', () => {
      const pts = coarseSpiral(4, 20);
      [0, 0.25, 0.5, 0.75, 1].forEach((simplify) => {
        const r = GU.toCurveAnchors(pts, { curves: true, smoothing: 0.5, simplify });
        expect(r.straight).toBe(false);
        expect(r.anchors.length).toBeGreaterThanOrEqual(2);
        expect(handled(r.anchors)).toBeGreaterThan(0);
      });
    });

    test('smoothing dissolves sampling noise instead of tracking it', () => {
      // A clean circle with high-frequency jitter on top. At smoothing 0 the fit
      // is faithful and keeps the jitter; smoothing decimates it away first, so
      // corner detection sees the circle rather than the noise. Without the
      // decimate-before-fit step every jittered vertex reads as a corner and the
      // "curve" comes back as a polyline with no handles at all.
      const noisy = [];
      for (let i = 0; i < 240; i++) {
        const t = (i / 240) * Math.PI * 2;
        const wobble = (i % 2 ? 1 : -1) * 1.5;
        const r = 80 + wobble;
        noisy.push({ x: 100 + r * Math.cos(t), y: 100 + r * Math.sin(t) });
      }
      const raw = GU.toCurveAnchors(noisy, { curves: true, smoothing: 0, closed: true });
      const smoothed = GU.toCurveAnchors(noisy, { curves: true, smoothing: 1, closed: true });

      expect(smoothed.anchors.length).toBeLessThan(raw.anchors.length / 2);
      // and what comes back is an actual curve, not a corner-riddled polyline
      expect(handled(smoothed.anchors)).toBe(smoothed.anchors.length);
    });

    test('smoothing never moves the fitted curve off the shape entirely', () => {
      const pts = coarseSpiral(2, 16);
      const flat = GU.buildPolylineFromAnchors(
        GU.toCurveAnchors(pts, { curves: true, smoothing: 1 }).anchors,
        false,
      );
      const nearestSource = (p) => pts.reduce(
        (best, q) => Math.min(best, Math.hypot(q.x - p.x, q.y - p.y)),
        Infinity,
      );
      const worst = flat.reduce((m, p) => Math.max(m, nearestSource(p)), 0);
      expect(worst).toBeLessThan(12); // rounds through bends, does not fly off
    });
  });

  describe('applyCurveFit (the engine-side companion)', () => {
    test('stamps anchors + forceCurves and clears the straight veto', () => {
      const path = coarseSpiral();
      path.meta = { algorithm: 'test' };
      const out = GU.applyCurveFit(path, { curves: true, smoothing: 0 });
      expect(out.meta.forceCurves).toBe(true);
      expect(out.meta.straight).toBeUndefined();
      expect(handled(out.meta.anchors)).toBeGreaterThan(0);
    });

    test('refuses a path that has declared its points final', () => {
      const straight = coarseSpiral();
      straight.meta = { straight: true };
      expect(GU.applyCurveFit(straight, { curves: true })).toBe(straight);

      const baked = coarseSpiral();
      baked.meta = { baked: true };
      expect(GU.applyCurveFit(baked, { curves: true })).toBe(baked);
    });

    test('refuses a parametric circle', () => {
      const circle = coarseSpiral();
      circle.meta = { kind: 'circle', cx: 0, cy: 0, r: 5 };
      expect(GU.applyCurveFit(circle, { curves: true })).toBe(circle);
    });

    test('returns the input untouched when nothing was asked for', () => {
      const path = coarseSpiral();
      expect(GU.applyCurveFit(path, { curves: false, smoothing: 0 })).toBe(path);
    });
  });

  describe('isVerbatimPath', () => {
    test('straight and baked both mean "do not re-curve"', () => {
      expect(GU.isVerbatimPath({ meta: { straight: true } })).toBe(true);
      expect(GU.isVerbatimPath({ meta: { baked: true } })).toBe(true);
      expect(GU.isVerbatimPath({ meta: {} })).toBe(false);
      expect(GU.isVerbatimPath([])).toBe(false);
    });
  });
});
