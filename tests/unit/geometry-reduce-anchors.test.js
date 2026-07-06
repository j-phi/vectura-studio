/*
 * GeometryUtils.reduceAnchors — minimal-anchor re-trace (Illustrator "Create
 * Outlines" parity). Re-traces a bezier-anchor contour into the FEWEST editable
 * anchors that reproduce it within a sub-pixel tolerance: merges coincident font
 * seams, detects corners from the anchor HANDLES (tangent break), and Schneider-
 * fits each corner→corner run. Every returned anchor carries a `corner` flag.
 *
 * The real-world driver is TrueType/quadratic glyph outlines, which carry ~2–3×
 * the on-curve points a cubic shape needs; the "S" of Inter goes 51 → ~14 with
 * imperceptible deviation and exactly 4 corners at its two flat terminals.
 */
const GU = require('../../src/core/geometry-utils.js');

// n smooth cubic anchors evenly around a circle (near-perfect approximation:
// handle length = (4/3)·tan(π/2n)·r along the tangent). All anchors are smooth.
const circleAnchors = (n, r = 100) => {
  const h = (4 / 3) * Math.tan(Math.PI / (2 * n)) * r;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
    const t = { x: -Math.sin(a), y: Math.cos(a) }; // CCW unit tangent
    out.push({
      x: p.x, y: p.y,
      in: { x: p.x - t.x * h, y: p.y - t.y * h },
      out: { x: p.x + t.x * h, y: p.y + t.y * h },
    });
  }
  return out;
};

const maxRadialDev = (anchors, closed, r) => {
  const flat = GU.buildPolylineFromAnchors(anchors, closed);
  return Math.max(...flat.map((p) => Math.abs(Math.hypot(p.x, p.y) - r)));
};

describe('GeometryUtils.reduceAnchors', () => {
  test('is exported', () => {
    expect(typeof GU.reduceAnchors).toBe('function');
  });

  test('over-anchored circle → far fewer anchors, zero corners, stays faithful', () => {
    const input = circleAnchors(40, 100); // 40 smooth anchors, no corners
    const out = GU.reduceAnchors(input, true, {});
    expect(out.length).toBeGreaterThan(3);
    expect(out.length).toBeLessThan(16); // dramatically fewer than 40
    expect(out.every((a) => a.corner === false)).toBe(true); // a circle has no corners
    expect(maxRadialDev(out, true, 100)).toBeLessThan(1.0); // sub-percent of r=100
  });

  test('square → exactly 4 corner anchors, straight (handle-less) edges, exact', () => {
    const sq = [
      { x: 0, y: 0, in: null, out: null },
      { x: 100, y: 0, in: null, out: null },
      { x: 100, y: 100, in: null, out: null },
      { x: 0, y: 100, in: null, out: null },
    ];
    const out = GU.reduceAnchors(sq, true, {});
    expect(out).toHaveLength(4);
    expect(out.every((a) => a.corner === true)).toBe(true);
    expect(out.every((a) => a.in === null && a.out === null)).toBe(true); // edges stay straight
    // Corner positions preserved exactly.
    const near = (a, x, y) => out.some((o) => Math.hypot(o.x - x, o.y - y) < 1e-6);
    expect(near(out, 0, 0) && near(out, 100, 0) && near(out, 100, 100) && near(out, 0, 100)).toBe(true);
  });

  test('coincident seam (a font-style split smooth join) is fused, not a corner', () => {
    // Semicircle drawn as two quarter arcs meeting SMOOTHLY at the top, but the
    // top on-curve point is encoded as a COINCIDENT anchor pair (as TrueType
    // outlines do). k ≈ 0.5523·r is the quarter-arc handle length.
    const k = 0.5523 * 100;
    const input = [
      { x: -100, y: 0, in: null, out: { x: -100, y: -k } },
      { x: 0, y: -100, in: { x: -k, y: -100 }, out: null },   // arc 1 ends (top)
      { x: 0, y: -100, in: null, out: { x: k, y: -100 } },    // arc 2 starts (COINCIDENT)
      { x: 100, y: 0, in: { x: 100, y: -k }, out: null },
    ];
    const out = GU.reduceAnchors(input, false, {});
    // Merge works ⇒ the top seam is a SMOOTH join, so the fit spans it as one run
    // and forces NO corner there. Only the two open endpoints are corners. (Without
    // the coincident-seam merge, the top reads as a false ~90° corner and splits.)
    const corners = out.filter((a) => a.corner === true);
    expect(corners).toHaveLength(2);
    expect(out[0].corner).toBe(true);
    expect(out[out.length - 1].corner).toBe(true);
    // Endpoints preserved exactly; no duplicate/coincident anchors survive.
    expect(Math.hypot(out[0].x + 100, out[0].y) < 1e-6).toBe(true);
    for (let i = 1; i < out.length; i++) {
      expect(Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y)).toBeGreaterThan(0.5);
    }
    // Faithful semicircle (radius 100 within a pixel).
    expect(maxRadialDev(out, false, 100)).toBeLessThan(1.0);
  });

  test('open path: both endpoints are corners', () => {
    const arc = circleAnchors(12, 100).slice(0, 5); // an open arc fragment
    arc[0].in = null;
    arc[arc.length - 1].out = null;
    const out = GU.reduceAnchors(arc, false, {});
    expect(out[0].corner).toBe(true);
    expect(out[out.length - 1].corner).toBe(true);
  });

  test('looser tolerance yields the same or fewer anchors', () => {
    const input = circleAnchors(48, 100);
    const tight = GU.reduceAnchors(input, true, { toleranceFrac: 0.0008 }).length;
    const loose = GU.reduceAnchors(input, true, { toleranceFrac: 0.02 }).length;
    expect(loose).toBeLessThanOrEqual(tight);
  });

  test('degenerate input (< 2 anchors) is returned unharmed', () => {
    expect(GU.reduceAnchors([], true, {})).toEqual([]);
    const one = GU.reduceAnchors([{ x: 1, y: 2, in: null, out: null }], true, {});
    expect(one).toHaveLength(1);
  });

  // A polygon-boolean union (text.js welds touching script-font glyphs this
  // way) carries no font anchor handles, so corner detection falls back to raw
  // chord angles between consecutive points — and the clipper packs a few extra
  // near-duplicate vertices right at each true intersection. That irregular
  // local density reads as a false corner at the font-anchor default (30°) even
  // though the boundary is otherwise a smooth curve. Fixture captured from a
  // real Dancing Script "aa" weld seam (the exact bug this guards against).
  test('a boolean-union weld seam needs a higher corner threshold than font anchors to stay smooth', () => {
    const raw = [
      [122.611, 99.576], [124.75, 98.278], [126.938, 97.444], [129.111, 97.167],
      [131.097, 97.451], [132.722, 98.306], [133.806, 99.632], [134.167, 101.333],
      [133.979, 102.5], [133.417, 103.222], [131.444, 103.722], [131.639, 102.75],
      [131.722, 101.778], [131.569, 100.59], [131.111, 99.583], [130.278, 98.896],
      [129, 98.667], [127.431, 98.938], [125.833, 99.75], [122.722, 102.639],
    ].map(([x, y]) => ({ x, y, in: null, out: null }));

    const atFontDefault = GU.reduceAnchors(raw, false, {}); // cornerAngleDeg 30
    const atWeldThreshold = GU.reduceAnchors(raw, false, { cornerAngleDeg: 75 });
    const cornerCount = (anchors) => anchors.filter((a) => a.corner).length;
    const flaggedNear = (anchors, x, y) => anchors.some((a) => a.corner && Math.hypot(a.x - x, a.y - y) < 0.5);

    expect(cornerCount(atFontDefault)).toBeGreaterThan(cornerCount(atWeldThreshold));
    // The specific clip-noise point collapses into the smooth run at the
    // weld's threshold instead of staying a spurious extra corner.
    expect(flaggedNear(atFontDefault, 133.417, 103.222)).toBe(true);
    expect(flaggedNear(atWeldThreshold, 133.417, 103.222)).toBe(false);
  });
});
