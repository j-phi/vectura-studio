/**
 * Variable-width ribbon geometry — contract C1 of the pen-width outline+fill work.
 *
 * A variable-width ruling used to be delivered as abutting CONSTANT-width pieces
 * (width quantized to 0.12 buckets, each piece stroked in isolation with a round
 * cap). That is defect D1 (stairstepping) and half of defect D2 (protrusion): the
 * wider piece's round cap bulges past its narrower neighbour and past the limb.
 *
 * This module builds the ribbon's TRUE outline instead, so the caller can stroke
 * that outline with the real pen and fill its interior with real pen passes:
 *
 *   buildRibbonRing(centerline, halfWidths, opts) -> ring | null
 *   clipRingToRegion(ring, clipRings, opts)       -> ring[]
 *
 * Invariants this file is responsible for:
 *   • NO QUANTIZATION anywhere. `halfWidths` is continuous, so the ring is too —
 *     every station contributes its own exact offset point.
 *   • Vertex offsets use the ANGLE-BISECTOR (miter) normal, never a per-segment
 *     normal. A per-segment normal is precisely what facets an offset curve into
 *     steps; this repo has re-learned that twice (`reduceAnchors` windowed
 *     tangents, `miterOffsetClosedRing`). The miter length is clamped at
 *     `joinLimit`; past it the GAP side takes a round arc of radius = the local
 *     half-width and the OVERLAP side takes a bevel that the self-union dissolves.
 *   • CAPS ARE BUTT. Never round. `opts.cap` is accepted for symmetry with the
 *     contract but butt is the only behaviour — round caps are defect D2(a).
 *
 * `miterOffsetClosedRing` (`src/core/geometry-utils.js`) solves the neighbouring
 * problem — a CLOSED ring offset by a CONSTANT delta — and its join maths is the
 * model followed here. It cannot be reused directly: a ribbon is an OPEN
 * centerline whose offset distance CHANGES at every vertex, and its two sides must
 * be emitted in opposite traversal order to close a single ring with butt caps.
 *
 * polygon-clipping (behind `window.Vectura.FillBoolean`) crashes on degenerate
 * input, so every boolean call here snaps to the 1e-6 grid and walks the same
 * escalating retry ladder documented at `geometry-utils.js:1288-1296` — snap
 * coarsening (collapses nearly-coincident sweep events) then RDP simplification
 * (removes the near-parallel chords that thrash the sweep line).
 */
(() => {
  const root = (typeof window !== 'undefined' && window)
    || (typeof globalThis !== 'undefined' ? globalThis : null);

  const DEDUPE_EPS = 1e-9;
  const DEFAULT_JOIN_LIMIT = 4;
  const DEFAULT_MIN_HALF_WIDTH = 1e-4;
  const DEFAULT_ARC_TOL = 0.02;      // mm — well under any pen, so arcs never facet
  const BASE_SNAP = 1e-6;            // the boolean grid; also the protrusion bound
  const MAX_BROADPHASE_CELLS = 4096;
  const MAX_DETECT_SEGMENTS = 20000;

  // Dependencies are resolved lazily (and injectably) so unit tests can drive the
  // module without a DOM, exactly as `insetMultiPolygon` takes `opts.boolean`.
  const resolveBoolean = (opts) => (opts && opts.boolean)
    || (root && root.Vectura && root.Vectura.FillBoolean)
    || null;

  const resolveGeometry = (opts) => (opts && opts.geometry)
    || (root && root.Vectura && root.Vectura.GeometryUtils)
    || null;

  const snapTo = (value, grid) => Math.round(value / grid) * grid;

  const toPoint = (p) => {
    if (!p) return null;
    if (Array.isArray(p)) {
      return Number.isFinite(p[0]) && Number.isFinite(p[1]) ? { x: p[0], y: p[1] } : null;
    }
    return Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
  };

  // Drop non-finite vertices, drop a closing duplicate, collapse consecutive
  // coincident vertices. Returns null below 3 surviving vertices.
  const cleanRing = (ring) => {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    const out = [];
    for (const raw of ring) {
      const p = toPoint(raw);
      if (!p) continue;
      const last = out[out.length - 1];
      if (last && Math.abs(last.x - p.x) < DEDUPE_EPS && Math.abs(last.y - p.y) < DEDUPE_EPS) continue;
      out.push(p);
    }
    while (out.length >= 2) {
      const f = out[0];
      const l = out[out.length - 1];
      if (Math.abs(f.x - l.x) < DEDUPE_EPS && Math.abs(f.y - l.y) < DEDUPE_EPS) out.pop();
      else break;
    }
    return out.length >= 3 ? out : null;
  };

  // ── centerline sanitation ────────────────────────────────────────────────────
  // `halfWidths` must be index-aligned with `centerline` (contract C1). When two
  // consecutive stations coincide the wider half-width survives — a duplicate
  // sample must never be able to pinch the ribbon.
  const sanitizeCenterline = (centerline, halfWidths, minHalfWidth) => {
    if (!Array.isArray(centerline) || !Array.isArray(halfWidths)) return null;
    if (centerline.length !== halfWidths.length) return null;
    const pts = [];
    const half = [];
    for (let i = 0; i < centerline.length; i += 1) {
      const p = toPoint(centerline[i]);
      const h = Number(halfWidths[i]);
      if (!p || !Number.isFinite(h)) continue;
      const hw = Math.max(minHalfWidth, h);
      const last = pts[pts.length - 1];
      if (last && Math.abs(last.x - p.x) < DEDUPE_EPS && Math.abs(last.y - p.y) < DEDUPE_EPS) {
        if (hw > half[half.length - 1]) half[half.length - 1] = hw;
        continue;
      }
      pts.push(p);
      half.push(hw);
    }
    return pts.length >= 2 ? { pts, half } : null;
  };

  // Unit LEFT normal of every edge i (pts[i] -> pts[i+1]). A zero-length edge
  // inherits its nearest neighbour so the walk below never sees a null.
  const edgeNormals = (pts) => {
    const n = pts.length;
    const en = new Array(n - 1).fill(null);
    for (let i = 0; i < n - 1; i += 1) {
      const dx = pts[i + 1].x - pts[i].x;
      const dy = pts[i + 1].y - pts[i].y;
      const mag = Math.hypot(dx, dy);
      if (mag < 1e-12) continue;
      en[i] = { x: -dy / mag, y: dx / mag };
    }
    let seen = null;
    for (let i = 0; i < en.length; i += 1) {
      if (en[i]) seen = en[i];
      else if (seen) en[i] = seen;
    }
    for (let i = en.length - 1; i >= 0; i -= 1) {
      if (en[i]) seen = en[i];
      else if (seen) en[i] = seen;
    }
    return en.every(Boolean) ? en : null;
  };

  // ── one side of the ribbon ───────────────────────────────────────────────────
  // `side` is +1 (left of travel) or -1 (right). Walks the centerline forward and
  // emits the boundary points; the caller reverses the -1 side to close the ring.
  const offsetSide = (pts, half, en, side, joinLimit, arcTol) => {
    const n = pts.length;
    const out = [];

    // Sweep the offset DIRECTION from `nStart` by `extSigned` at radius h about v.
    // The endpoints land exactly on the two flanking edge-offset points, so the
    // arc splices in seamlessly — there is no gap and no facet.
    const pushArc = (v, h, nStart, extSigned) => {
      let steps = Math.ceil((Math.abs(extSigned) * h) / arcTol);
      if (!Number.isFinite(steps) || steps < 1) steps = 1;
      if (steps > 64) steps = 64;
      for (let j = 0; j <= steps; j += 1) {
        const th = extSigned * (j / steps);
        const ct = Math.cos(th);
        const st = Math.sin(th);
        const dx = nStart.x * ct - nStart.y * st;
        const dy = nStart.x * st + nStart.y * ct;
        const px = v.x + dx * h * side;
        const py = v.y + dy * h * side;
        if (Number.isFinite(px) && Number.isFinite(py)) out.push({ x: px, y: py });
      }
    };

    for (let i = 0; i < n; i += 1) {
      const v = pts[i];
      const h = half[i];
      // BUTT caps: an endpoint offsets along its single adjacent edge normal, so
      // the ribbon stops exactly at the centerline endpoint. Nothing overshoots.
      if (i === 0 || i === n - 1) {
        const nq = i === 0 ? en[0] : en[n - 2];
        out.push({ x: v.x + nq.x * h * side, y: v.y + nq.y * h * side });
        continue;
      }
      const nPrev = en[i - 1];
      const nCurr = en[i];
      let bx = nPrev.x + nCurr.x;
      let by = nPrev.y + nCurr.y;
      const bmag = Math.hypot(bx, by);
      if (bmag < 1e-9) {
        // ~180 deg reversal: no finite miter and no well-defined sweep side.
        // Step straight out — bounded, never a spike.
        out.push({ x: v.x + nCurr.x * h * side, y: v.y + nCurr.y * h * side });
        continue;
      }
      bx /= bmag;
      by /= bmag;
      const cosHalf = bx * nCurr.x + by * nCurr.y;       // cos(phi/2), in (0,1]
      const miterScale = 1 / Math.max(1e-6, cosHalf);
      const cross = nPrev.x * nCurr.y - nPrev.y * nCurr.x;
      if (miterScale <= joinLimit) {
        // The ordinary case, and the one that matters: the ANGLE-BISECTOR normal.
        // On a straight run this is exactly v + n*h, so a smooth width profile
        // comes out smooth.
        out.push({
          x: v.x + bx * h * side * miterScale,
          y: v.y + by * h * side * miterScale,
        });
      } else if (side * cross < 0 && Math.abs(cross) > 1e-9) {
        // Needle-acute on the GAP side (the two offset edges diverge and leave a
        // wedge). Round it at radius h so the boundary stays continuous.
        const dot = Math.max(-1, Math.min(1, nPrev.x * nCurr.x + nPrev.y * nCurr.y));
        pushArc(v, h, nPrev, (cross > 0 ? 1 : -1) * Math.acos(dot));
      } else {
        // Overlap side: bevel and let the self-union below dissolve the crossing.
        out.push({ x: v.x + nPrev.x * h * side, y: v.y + nPrev.y * h * side });
        out.push({ x: v.x + nCurr.x * h * side, y: v.y + nCurr.y * h * side });
      }
    }
    return out;
  };

  // ── self-intersection detection ──────────────────────────────────────────────
  // INCLUSIVE on purpose: a proper-crossing test is not enough. A hairpin whose
  // two arms end on the same line meets itself along COLLINEAR butt caps and
  // never properly crosses, yet its shoelace counts the overlap band twice and
  // stroking it draws a boundary line straight through the ribbon's middle. That
  // ring needs the union just as much as a crossing one, so collinear overlap
  // and endpoint contact both count as an intersection here.
  const segmentsTouch = (p1, p2, p3, p4) => {
    const side = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const d1 = side(p3, p4, p1);
    const d2 = side(p3, p4, p2);
    const d3 = side(p1, p2, p3);
    const d4 = side(p1, p2, p4);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
      && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    const T = 1e-12;
    const within = (a, b, c) => c.x >= Math.min(a.x, b.x) - T && c.x <= Math.max(a.x, b.x) + T
      && c.y >= Math.min(a.y, b.y) - T && c.y <= Math.max(a.y, b.y) + T;
    if (Math.abs(d1) <= T && within(p3, p4, p1)) return true;
    if (Math.abs(d2) <= T && within(p3, p4, p2)) return true;
    if (Math.abs(d3) <= T && within(p1, p2, p3)) return true;
    if (Math.abs(d4) <= T && within(p1, p2, p4)) return true;
    return false;
  };

  // Uniform-grid broadphase. The boolean self-union is expensive and crash-prone,
  // so it is only paid for when the ring genuinely folds over itself — which is
  // the minority of rulings. Errs toward `true` (do the union) whenever the grid
  // would be pathological; a needless union is always safe, a missed one is not.
  const ringSelfIntersects = (ring) => {
    const n = ring.length;
    if (n < 4) return false;
    if (n > MAX_DETECT_SEGMENTS) return true;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const diag = Math.hypot(maxX - minX, maxY - minY);
    if (!(diag > 0)) return false;
    const cols = Math.max(4, Math.min(128, Math.ceil(Math.sqrt(n))));
    const cellSize = diag / cols;
    if (!(cellSize > 0)) return false;

    const buckets = new Map();
    const key = (cx, cy) => `${cx},${cy}`;
    for (let i = 0; i < n; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const cx0 = Math.floor((Math.min(a.x, b.x) - minX) / cellSize);
      const cx1 = Math.floor((Math.max(a.x, b.x) - minX) / cellSize);
      const cy0 = Math.floor((Math.min(a.y, b.y) - minY) / cellSize);
      const cy1 = Math.floor((Math.max(a.y, b.y) - minY) / cellSize);
      if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > MAX_BROADPHASE_CELLS) return true;
      for (let cx = cx0; cx <= cx1; cx += 1) {
        for (let cy = cy0; cy <= cy1; cy += 1) {
          const k = key(cx, cy);
          const list = buckets.get(k);
          if (list) list.push(i);
          else buckets.set(k, [i]);
        }
      }
    }
    for (const list of buckets.values()) {
      for (let a = 0; a < list.length; a += 1) {
        for (let b = a + 1; b < list.length; b += 1) {
          const i = list[a];
          const j = list[b];
          // Adjacent segments share an endpoint and can never PROPERLY cross.
          if (j === i + 1 || i === j + 1 || (i === 0 && j === n - 1) || (j === 0 && i === n - 1)) continue;
          if (segmentsTouch(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
        }
      }
    }
    return false;
  };

  // ── boolean plumbing ─────────────────────────────────────────────────────────
  // FillBoolean swallows polygon-clipping crashes and returns [] (AUD-05), so an
  // empty result alone cannot tell a failure apart from a genuinely empty answer.
  // `consumeLastOpError` is the only reliable signal — always read it.
  const runBooleanOp = (FB, fn) => {
    if (FB && typeof FB.consumeLastOpError === 'function') FB.consumeLastOpError();
    let result = null;
    try {
      result = fn();
    } catch (_) {
      if (FB && typeof FB.consumeLastOpError === 'function') FB.consumeLastOpError();
      return { ok: false, result: null };
    }
    const err = (FB && typeof FB.consumeLastOpError === 'function') ? FB.consumeLastOpError() : null;
    if (err) return { ok: false, result: null };
    return { ok: true, result: result || [] };
  };

  // Snap + optionally RDP-simplify a ring for boolean input. Snapping collapses
  // the nearly-coincident sweep events that degrade polygon-clipping from ms to
  // seconds; RDP removes the near-parallel chords that thrash it outright.
  const prepareRing = (ring, grid, tol, GU) => {
    let pts = ring;
    if (tol > 0 && GU && typeof GU.simplifyPath === 'function') {
      const simplified = GU.simplifyPath(ring, tol);
      if (Array.isArray(simplified) && simplified.length >= 3) pts = simplified;
    }
    const snapped = pts.map((p) => ({ x: snapTo(p.x, grid), y: snapTo(p.y, grid) }));
    return cleanRing(snapped);
  };

  const multiPolygonToRings = (multiPolygon) => {
    const rings = [];
    for (const polygon of multiPolygon || []) {
      for (const ring of polygon || []) {
        const cleaned = cleanRing((ring || []).map((pt) => (Array.isArray(pt) ? { x: pt[0], y: pt[1] } : pt)));
        if (cleaned) rings.push(cleaned);
      }
    }
    return rings;
  };

  const largestShell = (multiPolygon) => {
    let best = null;
    let bestArea = 0;
    for (const polygon of multiPolygon || []) {
      const shell = cleanRing((polygon && polygon[0] ? polygon[0] : []).map(
        (pt) => (Array.isArray(pt) ? { x: pt[0], y: pt[1] } : pt)
      ));
      if (!shell) continue;
      let s = 0;
      for (let i = 0, n = shell.length; i < n; i += 1) {
        const a = shell[i];
        const b = shell[(i + 1) % n];
        s += a.x * b.y - b.x * a.y;
      }
      const area = Math.abs(s / 2);
      if (area > bestArea) {
        bestArea = area;
        best = shell;
      }
    }
    return best;
  };

  // Dissolve a self-overlapping ribbon into one simple boundary. The escalating
  // ladder is the one documented for `insetMultiPolygon` — snap coarsening first,
  // then RDP — never a fresh invention. If every rung fails the raw ring is
  // returned unchanged: a self-crossing outline still draws, a dropped one does
  // not.
  const resolveSelfIntersections = (ring, opts) => {
    const FB = resolveBoolean(opts);
    if (!FB || typeof FB.union !== 'function' || typeof FB.ringToMultiPolygon !== 'function') return ring;
    const GU = resolveGeometry(opts);
    const ladder = [
      { grid: BASE_SNAP, tol: 0 },
      { grid: BASE_SNAP * 10, tol: 0 },
      { grid: BASE_SNAP, tol: 1e-4 },
      { grid: BASE_SNAP * 10, tol: 1e-3 },
    ];
    for (const rung of ladder) {
      const prepared = prepareRing(ring, rung.grid, rung.tol, GU);
      if (!prepared) continue;
      const mp = FB.ringToMultiPolygon(prepared);
      if (!mp.length) continue;
      const { ok, result } = runBooleanOp(FB, () => FB.union(mp));
      if (!ok) continue;
      // Contract C1 returns ONE ring. A self-union of a ribbon yields a single
      // shell in every non-pathological case; when it does not, the largest shell
      // is the ribbon and the rest are boolean crumbs.
      const shell = largestShell(result);
      if (shell) return shell;
    }
    return ring;
  };

  // ── public API ───────────────────────────────────────────────────────────────
  /**
   * Build the closed outline of a variable-width ribbon.
   *
   * @param {{x:number,y:number}[]} centerline  polyline, treated as OPEN
   * @param {number[]} halfWidths               index-aligned half-widths in mm, > 0
   * @param {object} [opts] { cap:'butt', joinLimit:4, minHalfWidth, arcTol,
   *                          boolean, geometry }
   * @returns {{x:number,y:number}[]|null} closed ring, first !== last (caller closes)
   */
  const buildRibbonRing = (centerline, halfWidths, opts = {}) => {
    const joinLimit = Number.isFinite(opts.joinLimit) && opts.joinLimit > 1
      ? opts.joinLimit : DEFAULT_JOIN_LIMIT;
    const minHalfWidth = Number.isFinite(opts.minHalfWidth) && opts.minHalfWidth > 0
      ? opts.minHalfWidth : DEFAULT_MIN_HALF_WIDTH;
    const arcTol = Number.isFinite(opts.arcTol) && opts.arcTol > 0 ? opts.arcTol : DEFAULT_ARC_TOL;

    const clean = sanitizeCenterline(centerline, halfWidths, minHalfWidth);
    if (!clean) return null;
    const en = edgeNormals(clean.pts);
    if (!en) return null;

    const left = offsetSide(clean.pts, clean.half, en, 1, joinLimit, arcTol);
    const right = offsetSide(clean.pts, clean.half, en, -1, joinLimit, arcTol);
    if (left.length < 2 || right.length < 2) return null;
    right.reverse();

    const ring = cleanRing(left.concat(right));
    if (!ring) return null;
    return ringSelfIntersects(ring) ? resolveSelfIntersections(ring, opts) : ring;
  };

  /**
   * Intersect a ribbon ring with the visible-form region.
   *
   * The clip is EXACT — the result is a boolean intersection, never an
   * approximation. That is what makes defect D2 unreachable: no ink can survive
   * outside the region, so nothing can protrude past the limb.
   *
   * @param {{x:number,y:number}[]} ring   closed ring
   * @param {Array<Array<{x:number,y:number}>>} clipRings  region rings; nesting is
   *        classified by containment depth, so shell/hole winding does not matter
   * @param {object} [opts] { boolean, geometry }
   * @returns {Array<Array<{x:number,y:number}>>} closed rings; a ribbon may be split
   *        into several. Shells and holes carry opposite winding — use
   *        FillBoolean.ringArea's sign to tell them apart.
   */
  const clipRingToRegion = (ring, clipRings, opts = {}) => {
    const subject = cleanRing(ring);
    if (!subject) return [];
    if (!Array.isArray(clipRings) || !clipRings.length) return [subject];

    const FB = resolveBoolean(opts);
    if (!FB || typeof FB.intersection !== 'function' || typeof FB.ringToMultiPolygon !== 'function') {
      // Without a boolean library the clip cannot be honoured, and an UNCLIPPED
      // ribbon is exactly defect D2. Emit nothing rather than emit protrusion.
      return [];
    }
    const GU = resolveGeometry(opts);

    // The clip is ALWAYS snapped at the base grid and never simplified: the whole
    // protrusion guarantee is measured against it, so it must not move. Only the
    // subject escalates — the intersection is a subset of the clip whatever the
    // subject looks like, so coarsening the subject can never leak ink outward.
    const snappedClipRings = [];
    for (const raw of clipRings) {
      const cleaned = cleanRing((raw || []).map((p) => {
        const q = toPoint(p);
        return q ? { x: snapTo(q.x, BASE_SNAP), y: snapTo(q.y, BASE_SNAP) } : null;
      }).filter(Boolean));
      if (cleaned) snappedClipRings.push(cleaned);
    }
    if (!snappedClipRings.length) return [subject];

    let clipMP = [];
    if (typeof FB.nonZeroUnionByContainment === 'function') {
      const attempt = runBooleanOp(FB, () => FB.nonZeroUnionByContainment(snappedClipRings));
      if (attempt.ok) clipMP = attempt.result;
    }
    if (!clipMP.length && typeof FB.ringsToNonZeroMultiPolygon === 'function') {
      const attempt = runBooleanOp(FB, () => FB.ringsToNonZeroMultiPolygon(snappedClipRings));
      if (attempt.ok) clipMP = attempt.result;
    }
    if (!clipMP.length) return [];

    const ladder = [
      { grid: BASE_SNAP, tol: 0 },
      { grid: BASE_SNAP * 10, tol: 0 },
      { grid: BASE_SNAP, tol: 1e-4 },
      { grid: BASE_SNAP * 10, tol: 1e-3 },
    ];
    for (const rung of ladder) {
      const prepared = prepareRing(subject, rung.grid, rung.tol, GU);
      if (!prepared) continue;
      const subjectMP = FB.ringToMultiPolygon(prepared);
      if (!subjectMP.length) continue;
      const { ok, result } = runBooleanOp(FB, () => FB.intersection(subjectMP, clipMP));
      if (!ok) continue;
      return multiPolygonToRings(result);
    }
    return [];
  };

  const api = { buildRibbonRing, clipRingToRegion };

  if (root) {
    root.Vectura = root.Vectura || {};
    root.Vectura.RibbonGeometry = { ...(root.Vectura.RibbonGeometry || {}), ...api };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
