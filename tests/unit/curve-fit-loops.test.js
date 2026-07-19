/**
 * Why the shared curve fit does not need a handle-length clamp.
 *
 * `pattern.js` carries the only handle clamp in the repo (capLen = min(dPrev,
 * dNext)/3), and its comment names the pathology exactly: "Plain Catmull-Rom
 * sizes the handle from the (next-prev) chord, which balloons into
 * self-intersecting loops where decimation left one neighbour far and the other
 * near." That is a property of Catmull-Rom, not of curve fitting in general:
 * the handle is derived from the neighbours' positions and never consults the
 * curve it is supposed to approximate.
 *
 * A Schneider least-squares fit (GeometryUtils.reduceAnchors -> _fitCubic) is
 * fitted TO the sample points, with handle lengths solved for and then clamped
 * to the chord in _generateBezier. It structurally cannot bulge across the
 * polygon.
 *
 * This pins that difference. If it ever fails, adopting reduceAnchors as the
 * universal fit would require porting pattern.js's clamp, and the plan changes.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// A closed ring whose vertex 1 has a very far neighbour behind it and a very
// near one ahead — precisely the "decimation left one neighbour far and the
// other near" case the clamp exists for.
const LOPSIDED_RING = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 103, y: 3 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

const seg = (a, b) => ({ a, b });

// Do two non-adjacent segments of a polyline properly cross?
const selfIntersections = (pts, closed) => {
  const segs = [];
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) segs.push(seg(pts[i], pts[(i + 1) % n]));

  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const properCross = (p1, p2, p3, p4) => {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
      && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };

  let hits = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 2; j < segs.length; j++) {
      if (i === 0 && j === segs.length - 1) continue; // adjacent across the seam
      if (properCross(segs[i].a, segs[i].b, segs[j].a, segs[j].b)) hits += 1;
    }
  }
  return hits;
};

describe('curve fit on a lopsided ring (the handle-clamp pathology)', () => {
  let runtime;
  let GU;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    GU = runtime.window.Vectura.GeometryUtils;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const flatten = (anchors, closed) => GU.buildPolylineFromAnchors(anchors, closed);

  test('smoothing (rebuildShapeAnchors) no longer balloons into a self-intersection', () => {
    const { anchors } = GU.rebuildShapeAnchors(
      LOPSIDED_RING.map((p) => ({ ...p, in: null, out: null })),
      { smoothing: 1, simplify: 0, closed: true, bounds: { dW: 200, dH: 200 } },
    );
    const hits = selfIntersections(flatten(anchors, true), true);
    // This test used to document the unclamped Catmull-Rom pathology (the
    // tension pass ballooned this ring into a self-crossing) as the status quo
    // to move away from. rebuildShapeAnchors now rounds corners via
    // roundCornerAnchors (fillet arcs on a faithful re-trace), which never
    // pushes the curve outside the shape — so the ring must stay simple.
    expect(hits).toBe(0);
  });

  test('Schneider fit (reduceAnchors) stays inside the polygon — no self-intersection', () => {
    const anchors = GU.reduceAnchors(
      LOPSIDED_RING.map((p) => ({ ...p, in: null, out: null })),
      true,
      {},
    );
    expect(selfIntersections(flatten(anchors, true), true)).toBe(0);
  });

  test('Schneider fit stays within a tube around the source polygon', () => {
    const anchors = GU.reduceAnchors(
      LOPSIDED_RING.map((p) => ({ ...p, in: null, out: null })),
      true,
      {},
    );
    const pts = flatten(anchors, true);

    // Max distance from any fitted sample to the nearest source edge.
    const distToSeg = (p, a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dd = dx * dx + dy * dy;
      if (dd < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / dd;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };
    const n = LOPSIDED_RING.length;
    let worst = 0;
    pts.forEach((p) => {
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        best = Math.min(best, distToSeg(p, LOPSIDED_RING[i], LOPSIDED_RING[(i + 1) % n]));
      }
      worst = Math.max(worst, best);
    });

    // The ring's bbox diagonal is ~145; a bulge of the kind Catmull-Rom produces
    // here overshoots by tens of units. Anything under a few units is "rounds the
    // corner" rather than "bulges across".
    expect(worst).toBeLessThan(5);
  });
});
