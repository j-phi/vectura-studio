/*
 * Curve unification, Stage F (2026-07-13) — the simplifier audit, pinned.
 *
 * Two private simplifiers were audited against the shared
 * `GeometryUtils.simplifyPath`. One was retired; ONE WAS NOT. Both legacy copies
 * are reproduced VERBATIM below so the difference is a test, not a memory.
 *
 *   pattern.js `_douglasPeucker` — RETIRED. A third hand-rolled RDP: same
 *     algorithm, same perpendicular-distance tolerance, so it maps 1:1 onto
 *     `simplifyPath`. Asserted point-for-point identical on marching-squares
 *     rings (grid-quantized, usually closed with a duplicated first point) across
 *     the tolerance range its call sites use. Verified end-to-end: the retirement
 *     reproduces the contour fill byte-for-byte over 256 param combinations.
 *
 *   geometry3d.js `decimate` — KEPT. It is neither RDP nor Visvalingam: it is a
 *     greedy 3-point collinearity filter whose error is LOCAL (each vertex is
 *     tested against the chord through the last KEPT point and the NEXT point).
 *     That makes its aggregate error unbounded — a gently bowed run whose
 *     per-vertex sagitta stays under 1e-6 collapses to a straight line however
 *     far the run bows. RDP, measuring against the chord of a recursively split
 *     span, keeps the apex. On the hidden-line resampler's own inputs the two
 *     agree (every sample is a lerp ALONG a source segment, so a run is
 *     piecewise-linear and only exactly-collinear points are removable) — but not
 *     on every real input: swapping in `simplifyPath(pts, 1e-6)` adds one vertex
 *     to the `terrain-free3d-occluded` SVG baseline, which is byte-compared. RDP
 *     is the more faithful filter; adopting it is a deliberate baseline refresh,
 *     not a refactor. The divergence is pinned below so the next agent does not
 *     have to rediscover it.
 *
 * Neither call site passes a path carrying `meta`, so `simplifyPath`'s
 * `stripCurveMeta` pass (which deletes `meta.anchors` / `meta.shape`) is a no-op
 * at both — asserted explicitly at the bottom.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// ── Verbatim copies of the retired implementations ────────────────────────────
const legacyDouglasPeucker = (pts, tolerance) => {
  if (!Array.isArray(pts) || pts.length < 3 || tolerance <= 0) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const sqTol = tolerance * tolerance;
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const a = pts[i0], b = pts[i1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let maxD = 0, maxI = -1;
    for (let i = i0 + 1; i < i1; i += 1) {
      const px = pts[i].x - a.x, py = pts[i].y - a.y;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
      const nx = a.x + t * dx - pts[i].x, ny = a.y + t * dy - pts[i].y;
      const d = nx * nx + ny * ny;
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > sqTol && maxI !== -1) {
      keep[maxI] = 1;
      stack.push([i0, maxI]);
      stack.push([maxI, i1]);
    }
  }
  const out = [];
  for (let i = 0; i < pts.length; i += 1) if (keep[i]) out.push(pts[i]);
  return out;
};

const legacyDecimate = (pts) => {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > Math.hypot(c.x - a.x, c.y - a.y) * 1e-6) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
};

// ── Input builders that mirror the two call sites ─────────────────────────────
const mulberry = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const lerp = (a, b, t) => a + (b - a) * t;

// A marching-squares-like ring: grid-quantized samples of a wobbling circle,
// closed with a duplicated first point (what `_marchingSquares` stitches).
const gridRing = (seed, n, closed) => {
  const rnd = mulberry(seed);
  const cs = 0.75; // cell size — crossings land on cell edges
  const cx = 60 + rnd() * 20;
  const cy = 60 + rnd() * 20;
  const r = 20 + rnd() * 25;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.18 * Math.sin(a * 5 + seed) + 0.07 * Math.cos(a * 11));
    // quantize to the grid the way an iso-crossing does (one axis snapped)
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    pts.push(i % 2 === 0
      ? { x: Math.round(x / cs) * cs, y }
      : { x, y: Math.round(y / cs) * cs });
  }
  if (closed) pts.push({ x: pts[0].x, y: pts[0].y });
  return pts;
};

// A hidden-line run: a piecewise-linear source row resampled at ~1px by lerp
// ALONG each segment, with bisected visibility crossings spliced in — exactly
// what `geometry3d`'s flush() hands to `decimate`.
const resampledRun = (seed, segCount, res) => {
  const rnd = mulberry(seed);
  const src = [];
  let x = 10 + rnd() * 5;
  let y = 100 + rnd() * 40;
  for (let i = 0; i <= segCount; i++) {
    src.push({ x, y });
    x += 3 + rnd() * 30;
    y += (rnd() - 0.5) * 40;
  }
  const run = [];
  for (let s = 0; s < src.length - 1; s++) {
    const a = src[s], b = src[s + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.min(4000, Math.round(len / res) + 1));
    for (let k = (s === 0 ? 0 : 1); k <= steps; k++) {
      const t = k / steps;
      run.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
      // a visibility crossing: bisected to a t within the segment, so it also
      // lies exactly on the source line
      if (s === 1 && k === 3) {
        const tc = t + 0.5 / steps;
        run.push({ x: lerp(a.x, b.x, tc), y: lerp(a.y, b.y, tc) });
      }
    }
  }
  return run;
};

const same = (a, b) => {
  expect(b.length).toBe(a.length);
  for (let i = 0; i < a.length; i++) {
    expect(`${b[i].x},${b[i].y}`).toBe(`${a[i].x},${a[i].y}`);
  }
};

describe('Stage F: shared simplifyPath reproduces the retired private copies', () => {
  let runtime;
  let GU;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    GU = runtime.window.Vectura.GeometryUtils;
  });

  afterAll(() => runtime.cleanup());

  test('GeometryUtils exposes both canonical simplifiers', () => {
    expect(typeof GU.simplifyPath).toBe('function');
    expect(typeof GU.simplifyPathVisvalingam).toBe('function');
  });

  describe('pattern.js _douglasPeucker -> GeometryUtils.simplifyPath', () => {
    // The contour fill's two tolerances: `contourSimplify` (0..0.5) and
    // bezTol = max(simplify, cellSize * 1.2).
    const tolerances = [0.05, 0.2, 0.5, 0.9, 1.4];

    test('matches point for point on closed marching-squares rings', () => {
      for (let seed = 1; seed <= 12; seed++) {
        const ring = gridRing(seed, 40 + seed * 9, true);
        for (const tol of tolerances) {
          same(legacyDouglasPeucker(ring, tol), GU.simplifyPath(ring, tol));
        }
      }
    });

    test('matches point for point on open rings (grid-boundary contours)', () => {
      for (let seed = 20; seed <= 30; seed++) {
        const ring = gridRing(seed, 25 + seed, false).slice(0, 30);
        for (const tol of tolerances) {
          same(legacyDouglasPeucker(ring, tol), GU.simplifyPath(ring, tol));
        }
      }
    });

    test('degenerate inputs behave identically', () => {
      const two = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
      same(legacyDouglasPeucker(two, 0.5), GU.simplifyPath(two, 0.5));
      const flat = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
      same(legacyDouglasPeucker(flat, 0.5), GU.simplifyPath(flat, 0.5));
      // a fully-degenerate closed ring (all points coincident)
      const dot = [{ x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }];
      same(legacyDouglasPeucker(dot, 0.5), GU.simplifyPath(dot, 0.5));
    });
  });

  describe('geometry3d.js decimate — kept, and why', () => {
    test('agrees with simplifyPath on piecewise-linear resampled runs', () => {
      // The inputs the hidden-line resampler actually emits: every sample is a
      // lerp along a source segment, so only exactly-collinear points are
      // removable and the two filters land on the same vertices.
      for (let seed = 1; seed <= 25; seed++) {
        for (const res of [0.5, 1, 2.5]) {
          const run = resampledRun(seed, 6 + (seed % 5), res);
          same(legacyDecimate(run), GU.simplifyPath(run, 1e-6));
        }
      }
    });

    test('a straight run collapses to its endpoints under both', () => {
      const run = [];
      for (let i = 0; i <= 400; i++) run.push({ x: lerp(20, 380, i / 400), y: lerp(55, 55, i / 400) });
      const legacy = legacyDecimate(run);
      expect(legacy.length).toBe(2);
      same(legacy, GU.simplifyPath(run, 1e-6));
    });

    test('short runs are returned untouched by both', () => {
      const one = [{ x: 1, y: 2 }];
      const two = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
      same(legacyDecimate(one), GU.simplifyPath(one, 1e-6));
      same(legacyDecimate(two), GU.simplifyPath(two, 1e-6));
    });

    test('THE DIVERGENCE: on a gently bowed run the greedy filter throws away the bow', () => {
      // Sub-tolerance per-vertex sagitta, supra-tolerance total bow. This is why
      // `decimate` cannot be swapped for RDP without changing output — it is the
      // same shape as the single extra vertex that appears in the
      // `terrain-free3d-occluded` baseline when the swap is made.
      const run = [];
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        run.push({ x: t * 300, y: 100 + Math.sin(t * 6) * 1e-5 });
      }
      const greedy = legacyDecimate(run);
      const rdp = GU.simplifyPath(run, 1e-6);
      expect(greedy.length).toBe(2);          // the bow is gone: a straight chord
      expect(rdp.length).toBeGreaterThan(2);  // RDP keeps the apexes
    });
  });

  describe('curve metadata is not silently destroyed', () => {
    test('a bare point array (what both call sites pass) gains no meta', () => {
      const ring = gridRing(7, 60, true);
      expect(ring.meta).toBeUndefined();
      const out = GU.simplifyPath(ring, 0.4);
      expect(out.meta).toBeUndefined();
    });

    test('simplifyPath DOES strip anchors when meta is present — so callers must not pass one', () => {
      const ring = gridRing(8, 60, true);
      const withMeta = ring.slice();
      withMeta.meta = { closed: true, anchors: [{ x: 0, y: 0, in: null, out: null }], forceCurves: true };
      const out = GU.simplifyPath(withMeta, 0.4);
      expect(out.meta.anchors).toBeUndefined();
      expect(out.meta.forceCurves).toBe(true);
    });
  });
});
