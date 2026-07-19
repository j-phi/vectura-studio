/*
 * Illustrator-parity corner rounding — the ONE Smooth mechanism.
 *
 * GeometryUtils.roundCornerAnchors(points, closed, t) re-traces the drawn
 * polyline faithfully (tight fit — smoothing never reshapes or thins; that is
 * Simplify's verb) and rounds every detected corner into a fillet arc whose
 * setback grows linearly with t (t=1 → fillets meet at edge midpoints).
 * applyCornerRounding is the engine-side companion (mirrors applyCurveFit):
 * it stamps the rounded anchors onto path.meta with forceCurves, refusing
 * declared-final geometry. Every Smooth surface — the Post-Processing Lab's
 * Smoothing slider, the contextual toolbar's Smooth slider, and the one-shot
 * Object ▸ Smooth… verb — converges on this mechanism.
 */
const path = require('path');

const GU = require(path.resolve(__dirname, '../../src/core/geometry-utils.js'));

const square = (size = 100) => [
  { x: 0, y: 0 }, { x: size, y: 0 }, { x: size, y: size }, { x: 0, y: size }, { x: 0, y: 0 },
];

const flattenAnchors = (anchors, closed) => {
  // Sample each span's cubic densely for geometric assertions.
  const pts = [];
  const n = anchors.length;
  const spans = closed ? n : n - 1;
  const cubic = (A, c1, c2, B, t) => {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * A.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * B.x,
      y: mt * mt * mt * A.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * B.y,
    };
  };
  for (let i = 0; i < spans; i++) {
    const A = anchors[i];
    const B = anchors[(i + 1) % n];
    const c1 = A.out || A;
    const c2 = B.in || B;
    for (let k = 0; k < 24; k++) pts.push(cubic(A, c1, c2, B, k / 24));
  }
  return pts;
};

const distTo = (pts, cx, cy) => {
  let min = Infinity;
  pts.forEach((pt) => { const d = Math.hypot(pt.x - cx, pt.y - cy); if (d < min) min = d; });
  return min;
};

describe('roundCornerAnchors', () => {
  test('rounds all four corners of a square equally; edges hold the bbox', () => {
    const anchors = GU.roundCornerAnchors(square(), true, 0.5);
    expect(Array.isArray(anchors)).toBe(true);
    const pts = flattenAnchors(anchors, true);
    const pulls = [[0, 0], [100, 0], [100, 100], [0, 100]].map(([x, y]) => distTo(pts, x, y));
    pulls.forEach((d) => expect(d).toBeGreaterThan(1));
    expect(Math.max(...pulls) - Math.min(...pulls)).toBeLessThan(0.5);
    // Edge midpoints stay put — rounding must not shrink the shape.
    expect(distTo(pts, 50, 0)).toBeLessThan(0.5);
    expect(distTo(pts, 0, 50)).toBeLessThan(0.5);
  });

  test('rounding is progressive and uses the slider FULL travel (no dead top half)', () => {
    const pullAt = (t) => distTo(flattenAnchors(GU.roundCornerAnchors(square(), true, t), true), 0, 0);
    const p25 = pullAt(0.25);
    const p50 = pullAt(0.5);
    const p75 = pullAt(0.75);
    const p100 = pullAt(1);
    expect(p50).toBeGreaterThan(p25 + 0.5);
    expect(p75).toBeGreaterThan(p50 + 0.5);
    expect(p100).toBeGreaterThan(p75 + 0.5);
  });

  test('t=0 or degenerate input returns null (nothing to round)', () => {
    expect(GU.roundCornerAnchors(square(), true, 0)).toBeNull();
    expect(GU.roundCornerAnchors([{ x: 0, y: 0 }, { x: 1, y: 1 }], false, 0.5)).toBeNull();
  });

  test('open path endpoints stay put; interior corners round', () => {
    const zig = [
      { x: 0, y: 0 }, { x: 25, y: 50 }, { x: 50, y: 0 }, { x: 75, y: 50 }, { x: 100, y: 0 },
    ];
    const anchors = GU.roundCornerAnchors(zig, false, 0.6);
    expect(anchors[0].x).toBeCloseTo(0, 5);
    expect(anchors[0].y).toBeCloseTo(0, 5);
    const last = anchors[anchors.length - 1];
    expect(last.x).toBeCloseTo(100, 5);
    expect(last.y).toBeCloseTo(0, 5);
    const pts = flattenAnchors(anchors, false);
    // Interior peaks pull back from the sharp vertices.
    expect(distTo(pts, 25, 50)).toBeGreaterThan(1);
    expect(distTo(pts, 50, 0)).toBeGreaterThan(1);
  });

  test('smoothing stays faithful: a gentle curve is re-traced, not reshaped', () => {
    // A dense semicircle has no corners — rounding must keep it on the arc.
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI;
      pts.push({ x: 100 * Math.cos(a), y: 100 * Math.sin(a) });
    }
    const anchors = GU.roundCornerAnchors(pts, false, 1);
    const flat = flattenAnchors(anchors, false);
    const maxDev = Math.max(...flat.map((p2) => Math.abs(Math.hypot(p2.x, p2.y) - 100)));
    expect(maxDev).toBeLessThan(2);
  });
});

describe('filletSharpAnchors — bezier-aware, anchor-preserving rounding', () => {
  // A closed dome: smooth top anchor (horizontal tangent-continuous handles),
  // two SHARP base corners where the arc meets the straight base. The corner
  // anchors carry handles on their arc side — sharpness is a TANGENT BREAK,
  // not "has no handles".
  const dome = () => [
    { x: 0, y: 100, in: null, out: { x: 0, y: 40 } },
    { x: 50, y: 0, in: { x: 15, y: 0 }, out: { x: 85, y: 0 } },
    { x: 100, y: 100, in: { x: 100, y: 40 }, out: null },
  ];

  const turnDeg = (a, b) => {
    const la = Math.hypot(a.x, a.y);
    const lb = Math.hypot(b.x, b.y);
    if (la < 1e-9 || lb < 1e-9) return 0;
    const dot = (a.x * b.x + a.y * b.y) / (la * lb);
    return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
  };

  test('an already-smooth anchor is never split — handles only adjust', () => {
    const out = GU.filletSharpAnchors(dome(), true, 0.3);
    const tops = out.filter((a) => Math.hypot(a.x - 50, a.y - 0) < 1e-6);
    expect(tops).toHaveLength(1);
    // The tangent stays horizontal (handles may shorten from trimming, but the
    // anchor stays smooth and in place).
    expect(Math.abs(tops[0].in.y - 0)).toBeLessThan(1e-6);
    expect(Math.abs(tops[0].out.y - 0)).toBeLessThan(1e-6);
    // Both sharp base corners split into fillet pairs: 1 + 2·2 anchors.
    expect(out).toHaveLength(5);
  });

  test('fillet setback points lie ON the original outline, not on chords', () => {
    // Dense reference sampling of the original dome (the coarse 24-per-span
    // helper leaves multi-mm gaps between samples on the big arc spans).
    const src = dome();
    const orig = [];
    const cubic = (A, c1, c2, B, t) => {
      const mt = 1 - t;
      return {
        x: mt * mt * mt * A.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * B.x,
        y: mt * mt * mt * A.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * B.y,
      };
    };
    for (let i = 0; i < src.length; i++) {
      const A = src[i];
      const B = src[(i + 1) % src.length];
      for (let k = 0; k < 400; k++) orig.push(cubic(A, A.out || A, B.in || B, B, k / 400));
    }
    const out = GU.filletSharpAnchors(dome(), true, 0.4);
    const nearOrig = (p) => Math.min(...orig.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
    out.forEach((a) => expect(nearOrig(a)).toBeLessThan(0.15));
  });

  test('tiny t keeps the fillet pair snug to its corner (no jump at 1%)', () => {
    const out = GU.filletSharpAnchors(dome(), true, 0.01);
    const nearBL = out.filter((a) => Math.hypot(a.x - 0, a.y - 100) < 5);
    expect(nearBL).toHaveLength(2);
  });

  test('fillets are tangent-continuous with curved neighbours — no puckers', () => {
    const out = GU.filletSharpAnchors(dome(), true, 0.5);
    const pts = flattenAnchors(out, true);
    // A pucker is a sharp local turn. Walk the flattened outline and measure
    // the largest direction change between consecutive segments (skipping
    // sub-half-mm segments, which are sampling noise).
    let maxTurn = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d1 = { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y };
      const d2 = { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y };
      if (Math.hypot(d1.x, d1.y) < 0.5 || Math.hypot(d2.x, d2.y) < 0.5) continue;
      maxTurn = Math.max(maxTurn, turnDeg(d1, d2));
    }
    expect(maxTurn).toBeLessThan(25);
  });

  test('a fully smooth path is untouched (Illustrator parity: nothing to round)', () => {
    // Closed "blob" of three tangent-continuous anchors.
    const blob = [
      { x: 0, y: 0, in: { x: -20, y: 20 }, out: { x: 20, y: -20 } },
      { x: 100, y: 0, in: { x: 80, y: -20 }, out: { x: 120, y: 20 } },
      { x: 50, y: 80, in: { x: 80, y: 80 }, out: { x: 20, y: 80 } },
    ];
    const out = GU.filletSharpAnchors(blob.map((a) => ({ ...a })), true, 0.8);
    expect(out).toHaveLength(3);
    out.forEach((a, i) => {
      expect(a.x).toBeCloseTo(blob[i].x, 6);
      expect(a.y).toBeCloseTo(blob[i].y, 6);
    });
  });
});

describe('applyCornerRounding', () => {
  test('stamps rounded anchors + forceCurves onto an eligible path', () => {
    const p = square();
    p.meta = { closed: true };
    const out = GU.applyCornerRounding(p, { t: 0.5 });
    expect(out).not.toBe(p);
    expect(Array.isArray(out.meta.anchors)).toBe(true);
    expect(out.meta.forceCurves).toBe(true);
    expect(out.meta.closed).toBe(true);
    // Fillet anchors carry handles (real rounding, not a passthrough).
    expect(out.meta.anchors.some((a) => a && (a.in || a.out))).toBe(true);
  });

  test('refuses declared-final geometry (straight / baked / circle / fitted)', () => {
    const straight = square();
    straight.meta = { straight: true, closed: true };
    expect(GU.applyCornerRounding(straight, { t: 0.5 })).toBe(straight);

    const baked = square();
    baked.meta = { baked: true, closed: true };
    expect(GU.applyCornerRounding(baked, { t: 0.5 })).toBe(baked);

    const circle = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    circle.meta = { kind: 'circle' };
    expect(GU.applyCornerRounding(circle, { t: 0.5 })).toBe(circle);

    const fitted = square();
    fitted.meta = {
      closed: true,
      anchors: [
        { x: 0, y: 0, in: null, out: { x: 10, y: 0 } },
        { x: 100, y: 0, in: { x: 90, y: 0 }, out: null },
      ],
    };
    expect(GU.applyCornerRounding(fitted, { t: 0.5 })).toBe(fitted);
  });

  test('t=0 is a byte-identical no-op', () => {
    const p = square();
    p.meta = { closed: true };
    expect(GU.applyCornerRounding(p, { t: 0 })).toBe(p);
  });
});
