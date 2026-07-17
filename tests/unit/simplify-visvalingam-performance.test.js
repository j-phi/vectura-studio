/*
 * simplifyPathVisvalingam ("Curve"-mode simplify) is invoked on every single
 * `engine.generate()` call — not just when the Simplify slider is touched —
 * because `optimizeLayers()` seeds every layer from `SETTINGS.optimizationDefaults`
 * (linesimplify enabled, mode:'curve', tolerance:0.2) and runs it unconditionally
 * inside `computeAllDisplayGeometry()`. Its removal loop did a full linear rescan
 * of every remaining point to find the next minimum-area point, on every single
 * removal — genuinely O(n^2) in path length, not the textbook O(n log n)
 * Visvalingam-Whyatt. Layers whose geometry lands in ONE very long path (e.g. the
 * Weave "Single Stroke" preset's continuity:'single', which threads ~175k points
 * into a single boustrophedon stroke) paid this quadratically: ~40s per regen in
 * a real profile, vs ~500ms for the identical point volume split across ~100
 * shorter paths.
 *
 * This test pins two things: the O(n log n) complexity budget (the regression
 * this fix exists for), and byte-for-byte output parity against a frozen verbatim
 * copy of the original O(n^2) reference (so the perf fix cannot silently change
 * which points get removed).
 */
const geometry = require('../../src/core/geometry-utils.js');

// ── Frozen verbatim copy of the pre-fix O(n^2) reference implementation ───────
// (geometry-utils.js simplifyPathVisvalingam, before the min-heap rewrite).
const legacyVisvalingam = (path, tolerance) => {
  if (!tolerance || tolerance <= 0 || path.length < 3) return path;
  const areaThreshold = tolerance * tolerance;
  const pts = path.map((pt) => ({ x: pt.x, y: pt.y }));
  const keep = new Array(pts.length).fill(true);
  const area = new Array(pts.length).fill(Infinity);
  const triArea = (a, b, c) => Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2);

  for (let i = 1; i < pts.length - 1; i++) {
    area[i] = triArea(pts[i - 1], pts[i], pts[i + 1]);
  }

  const findNext = (idx, dir) => {
    let i = idx + dir;
    while (i > 0 && i < pts.length - 1 && !keep[i]) i += dir;
    return i;
  };

  while (true) {
    let minArea = Infinity;
    let minIndex = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      if (!keep[i]) continue;
      if (area[i] < minArea) {
        minArea = area[i];
        minIndex = i;
      }
    }
    if (minIndex === -1 || minArea >= areaThreshold) break;
    keep[minIndex] = false;
    const prev = findNext(minIndex, -1);
    const next = findNext(minIndex, 1);
    if (prev > 0 && next < pts.length) {
      area[prev] = triArea(pts[findNext(prev, -1)], pts[prev], pts[next]);
    }
    if (next < pts.length - 1 && prev >= 0) {
      area[next] = triArea(pts[prev], pts[next], pts[findNext(next, 1)]);
    }
  }

  return pts.filter((_, i) => keep[i]);
};

const mulberry = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// A smooth wavy path (what a boustrophedon-threaded weave row looks like) with
// occasional near-duplicate points, so plenty of tied minimum areas occur —
// the case where tie-break order matters most.
const wavyPath = (seed, n) => {
  const rnd = mulberry(seed);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const x = t * 500;
    const y = 50 + Math.sin(t * 40 + seed) * 10 + Math.sin(t * 137) * 2 + (rnd() - 0.5) * 0.001;
    pts.push({ x, y });
    if (i % 97 === 0) pts.push({ x, y }); // exact duplicate -> zero-area ties
  }
  return pts;
};

describe('simplifyPathVisvalingam (heap-based, O(n log n))', () => {
  test('output is byte-identical to the frozen O(n^2) reference across seeds/tolerances', () => {
    const tolerances = [0.05, 0.2, 0.5, 1.4];
    for (let seed = 1; seed <= 8; seed++) {
      const path = wavyPath(seed, 300 + seed * 37);
      for (const tol of tolerances) {
        const expected = legacyVisvalingam(path, tol);
        const actual = geometry.simplifyPathVisvalingam(path.map((p) => ({ ...p })), tol);
        expect(actual.length).toBe(expected.length);
        for (let i = 0; i < expected.length; i++) {
          expect(actual[i].x).toBe(expected[i].x);
          expect(actual[i].y).toBe(expected[i].y);
        }
      }
    }
  });

  test('degenerate inputs behave identically to the reference', () => {
    const two = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(geometry.simplifyPathVisvalingam(two, 0.5)).toEqual(legacyVisvalingam(two, 0.5));
    const flat = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    expect(geometry.simplifyPathVisvalingam(flat, 0.5)).toEqual(legacyVisvalingam(flat, 0.5));
    const dot = [{ x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }];
    expect(geometry.simplifyPathVisvalingam(dot, 0.5)).toEqual(legacyVisvalingam(dot, 0.5));
  });

  test('stays inside an O(n log n) time budget on a 40k-point single path', () => {
    // Pre-fix (O(n^2) full-array rescan per removal) measured ~1.25s here;
    // a real Weave "Single Stroke" layer (~175k points) measured ~40s in the
    // full engine.generate() pipeline. 500ms is generous for O(n log n) on 40k
    // points but well under what the quadratic version could ever hit.
    const path = wavyPath(99, 40000);
    const t0 = Date.now();
    const out = geometry.simplifyPathVisvalingam(path, 0.2);
    const elapsed = Date.now() - t0;
    expect(out.length).toBeGreaterThan(1);
    expect(elapsed).toBeLessThan(500);
  });
});
