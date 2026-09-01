/**
 * Ring-vs-ink coverage measurement for scene3d ribbon laws — an INDEPENDENT,
 * pure-JS reimplementation of contract C2's T1 method (4 samples per pen
 * width), applied to the REAL clip output `ribbonize` produces rather than to
 * an isolated fixture.
 *
 * "Ring" is the ground truth: every multipolygon `RibbonGeometry`'s
 * `clipMultiPolygonToRegion` actually returned while building the object (the
 * WALLS class and the RIBBON class both call it — this is the one function
 * both paths share, so hooking it once sees both). "Ink" is every `sceneFill`
 * path the build finally emitted, stroked at its own pen width. Ring-fill-rate
 * is the fraction of the ring's area the ink actually covers — 1.0 means no
 * whitespace inside a ribbon that was built and clipped; anything below is a
 * hollow hairline or a seam (F4 / F7).
 *
 * Software rasterizer, no canvas: point-sampling + segment distance, same
 * technique `tests/unit/pen-fill.test.js` already uses for T1 in isolation.
 *
 * F7 (self-occlusion): a captured ring can legitimately have area a
 * non-convex object's own self-occlusion clip removed AFTER the ring was
 * captured — see `captureSelfOcclusionFootprint` and `measureRingFillRate`'s
 * own header for the correction and why it cannot move any of the 12 old
 * per-law numbers unless the pipeline under test actually self-occludes.
 */

/** Ray-casting point-in-polygon over a set of rings (nonzero-ish: even count flips). */
const pointInRings = (x, y, rings) => {
  let inside = false;
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
      const a = ring[j];
      const b = ring[i];
      if ((a.y > y) !== (b.y > y)) {
        const t = (y - a.y) / (b.y - a.y);
        if (x < a.x + t * (b.x - a.x)) inside = !inside;
      }
    }
  }
  return inside;
};

const distToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const qx = ax + dx * t;
  const qy = ay + dy * t;
  return Math.hypot(px - qx, py - qy);
};

/**
 * Attach a recorder to `RibbonGeometry.clipMultiPolygonToRegion` that captures
 * every non-empty multipolygon it returns during the build that follows.
 * Returns { groups, restore() }. `groups` is populated only between the call
 * and `restore()`.
 */
const captureClipGroups = (Vectura) => {
  const RG = Vectura.RibbonGeometry;
  const orig = RG.clipMultiPolygonToRegion;
  const groups = [];
  RG.clipMultiPolygonToRegion = function patched(...args) {
    const res = orig.apply(this, args);
    if (Array.isArray(res) && res.length) {
      const rings = [];
      res.forEach((poly) => (poly || []).forEach((r) => {
        if (Array.isArray(r) && r.length >= 3) rings.push(r);
      }));
      if (rings.length) groups.push(rings);
    }
    return res;
  };
  return { groups, restore: () => { RG.clipMultiPolygonToRegion = orig; } };
};

/**
 * F7 coverage-oracle correction — see this file's own header addendum below
 * for the full "what changed and why".
 *
 * Attach a recorder to `Scene3D.HLR.createClipper` that observes, for every
 * `clipPath` call the build makes with a self-occlusion flag set on its
 * `seg` (`selfOcclude` and/or `analyticOccluder` — see `scene3d.js`'s segCtx
 * construction and `hlr.js`'s `hiddenAt`), EXACTLY which stretch of that
 * path self-occlusion alone removed: re-runs the SAME call with those two
 * flags stripped and diffs the two results' visible runs. A stretch visible
 * WITHOUT the flags but not WITH them was removed by self-occlusion
 * specifically (never by an unrelated occluder — those are identical in
 * both calls). Returns { segments, restore() } — `segments` is a flat list
 * of `{a:{x,y}, b:{x,y}}` 2D chords, one per removed sub-stretch.
 *
 * PURELY OBSERVATIONAL: this never changes what the build actually emits
 * (the real `clipPath` call's result is returned untouched; the comparison
 * call is thrown away). It is also PRODUCTION-BEHAVIOUR-GATED, not an
 * independent geometric guess: when the pipeline never sets `selfOcclude`/
 * `analyticOccluder` on a `seg` (e.g. under `VECTURA_PRE_F7=1`, which
 * reverts `scene3d.js` to a revision that predates both fields), the extra
 * comparison call never runs, `segments` stays empty, and
 * `measureRingFillRate`'s correction (below) becomes a no-op BY
 * CONSTRUCTION — which is exactly what makes the disabled-self-occlusion
 * safeguard in the F7 RGR test hold: reproduce the OLD 12 coverage numbers
 * exactly, not approximately.
 */
const captureSelfOcclusionFootprint = (Vectura) => {
  const HLR = Vectura.Scene3D && Vectura.Scene3D.HLR;
  const orig = HLR && HLR.createClipper;
  const segments = [];
  if (typeof orig !== 'function') return { segments, restore: () => {} };
  HLR.createClipper = function patchedCreateClipper(...args) {
    const clipper = orig.apply(this, args);
    const origClipPath = clipper.clipPath;
    clipper.clipPath = function patchedClipPath(pts, seg = {}) {
      const result = origClipPath.call(this, pts, seg);
      if (seg && (seg.selfOcclude || typeof seg.analyticOccluder === 'function')) {
        const withoutSelf = { ...seg, selfOcclude: false, analyticOccluder: null };
        const without = origClipPath.call(this, pts, withoutSelf);
        const key = (p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
        const withKeys = new Set();
        (result.runs || []).forEach((r) => {
          if (r.visible) r.pts.forEach((p) => withKeys.add(key(p)));
        });
        (without.runs || []).forEach((r) => {
          if (!r.visible) return;
          for (let i = 0; i + 1 < r.pts.length; i += 1) {
            const a = r.pts[i];
            const b = r.pts[i + 1];
            // A chord counts as "removed by self-occlusion" only if AT LEAST
            // one endpoint is visible without self-occlusion but not with it
            // — the other endpoint may legitimately be shared with a still-
            // visible neighbour (the exact crossing point clipPath bisects
            // to), so requiring BOTH would under-count by exactly one chord
            // per boundary.
            if (!withKeys.has(key(a)) || !withKeys.has(key(b))) segments.push({ a, b });
          }
        });
      }
      return result;
    };
    return clipper;
  };
  return { segments, restore: () => { HLR.createClipper = orig; } };
};

/**
 * Measure ring-fill-rate: of the area covered by `ringGroups` (the union of
 * every captured clip result), what fraction does `inkPaths` (stroked at
 * `penWidth * (path.meta.weightScale || 1)`) actually cover?
 *
 * F7 CORRECTION (what changed and why — read this before changing the
 * denominator again). `ringGroups` is captured from `clipMultiPolygonToRegion`
 * BEFORE self-occlusion is applied: `ribbonize`'s F7 pre-split runs first and
 * shrinks what reaches `clipMultiPolygonToRegion` for a stretch the pre-split
 * catches, but `scene3d.js`'s POST-HOC self-occlusion clip (the segCtx
 * `clipper.clipPath` call on the final emitted outline/wall/fill lines, which
 * runs AFTER a ring is already captured) can still trim a WIDENED boundary
 * the pre-split's centreline-only test never sampled. Before a non-convex
 * object (the torus) could occlude itself at all, "every part of a captured
 * ring is inked" was a sound invariant — self-occlusion breaks it on
 * purpose, for exactly the ink the user asked to have removed (F7), and the
 * old all-or-nothing denominator scored that correct removal as a coverage
 * FAILURE.
 *
 * The fix: pass `opts.selfOccludedSegments` (from this file's own
 * `captureSelfOcclusionFootprint`) — every 2D chord self-occlusion alone
 * removed from the SAME build's final lines — and this function excludes any
 * grid cell that chord touches from BOTH the numerator and the denominator,
 * stroked at the same `penWidth` real ink would have claimed there. A cell
 * legitimately erased by self-occlusion no longer counts as unfilled ring;
 * it is simply no longer "ring" at all, exactly as if `ribbonize` had never
 * claimed that sliver of area to begin with.
 *
 * Omitting `opts` (or `opts.selfOccludedSegments`) — the pre-F7 call
 * signature — is BYTE-IDENTICAL to the old, uncorrected computation; it is
 * also what `captureSelfOcclusionFootprint` itself produces (an empty list)
 * whenever the build under test never sets a self-occlusion flag on a `seg`
 * at all (e.g. every non-torus primitive, or `VECTURA_PRE_F7=1`). That is
 * what makes the F7 RGR test's disabled-self-occlusion safeguard hold: this
 * correction cannot change a single one of the 12 old coverage numbers
 * unless the pipeline itself actually removed something via self-occlusion.
 *
 * @param {Array<Array<{x:number,y:number}>>>} ringGroups  one ring-array per captured clip call
 * @param {Array<{x:number,y:number}[]> & {meta?:object}} inkPaths  final emitted paths
 * @param {number} penWidth
 * @param {{selfOccludedSegments?: Array<{a:{x:number,y:number},b:{x:number,y:number}}>}} [opts]
 * @returns {{ringFillRate:number, ringAreaMm2:number, ringNotInkMm2:number}}
 */
const measureRingFillRate = (ringGroups, inkPaths, penWidth, opts = {}) => {
  const allRings = [].concat(...ringGroups);
  if (!allRings.length) return { ringFillRate: null, ringAreaMm2: 0, ringNotInkMm2: 0 };
  const cs = Math.max(penWidth / 4, 0.01);
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  allRings.forEach((ring) => ring.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }));
  const ox = minX - cs;
  const oy = minY - cs;
  const nx = Math.max(1, Math.ceil((maxX - minX + 2 * cs) / cs) + 1);
  const ny = Math.max(1, Math.ceil((maxY - minY + 2 * cs) / cs) + 1);
  // Guard against a runaway grid (a stray outlier point in a captured ring).
  if (nx * ny > 4_000_000) throw new Error(`scene3d-ring-coverage: grid too large (${nx}x${ny})`);

  const ring = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j += 1) {
    const y = oy + (j + 0.5) * cs;
    for (let i = 0; i < nx; i += 1) {
      const x = ox + (i + 0.5) * cs;
      // Each captured group is its own local nonzero polygon (shell+holes);
      // a cell counts as "ring" if ANY group covers it.
      for (let g = 0; g < ringGroups.length; g += 1) {
        if (pointInRings(x, y, ringGroups[g])) { ring[j * nx + i] = 1; break; }
      }
    }
  }

  const ink = new Uint8Array(nx * ny);
  (inkPaths || []).forEach((path) => {
    const w = Number(path && path.meta && path.meta.weightScale);
    const r = (Number.isFinite(w) ? w : 1) * penWidth / 2;
    for (let s = 0; s + 1 < path.length; s += 1) {
      const a = path[s];
      const b = path[s + 1];
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - r - ox) / cs - 0.5));
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + r - ox) / cs - 0.5));
      const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - r - oy) / cs - 0.5));
      const j1 = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y) + r - oy) / cs - 0.5));
      for (let j = j0; j <= j1; j += 1) {
        const y = oy + (j + 0.5) * cs;
        for (let i = i0; i <= i1; i += 1) {
          const k = j * nx + i;
          if (ink[k] || !ring[k]) continue;
          const x = ox + (i + 0.5) * cs;
          if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= r) ink[k] = 1;
        }
      }
    }
  });

  // F7 correction — see this function's own header. Stroke every self-
  // occlusion-removed chord at the SAME half-pen radius real ink would have
  // claimed there, and exclude every cell it touches from both ring and ink
  // below: a cell self-occlusion legitimately erased no longer counts as
  // "ring" at all. Empty (the default, and what `VECTURA_PRE_F7=1` always
  // produces) ⇒ `excluded` stays all-zero ⇒ byte-identical to the
  // uncorrected computation.
  const excluded = new Uint8Array(nx * ny);
  const selfOccludedSegments = Array.isArray(opts.selfOccludedSegments) ? opts.selfOccludedSegments : [];
  const excludeRadius = penWidth / 2;
  selfOccludedSegments.forEach((seg) => {
    const a = seg && seg.a;
    const b = seg && seg.b;
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y)
      || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return;
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - excludeRadius - ox) / cs - 0.5));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + excludeRadius - ox) / cs - 0.5));
    const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - excludeRadius - oy) / cs - 0.5));
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y) + excludeRadius - oy) / cs - 0.5));
    for (let j = j0; j <= j1; j += 1) {
      const y = oy + (j + 0.5) * cs;
      for (let i = i0; i <= i1; i += 1) {
        const k = j * nx + i;
        if (excluded[k] || !ring[k]) continue;
        const x = ox + (i + 0.5) * cs;
        if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= excludeRadius) excluded[k] = 1;
      }
    }
  });

  let ringCells = 0;
  let notInk = 0;
  let excludedCells = 0;
  for (let k = 0; k < ring.length; k += 1) {
    if (!ring[k]) continue;
    if (excluded[k]) { excludedCells += 1; continue; }
    ringCells += 1;
    if (!ink[k]) notInk += 1;
  }
  const px2 = cs * cs;
  return {
    ringFillRate: ringCells ? 1 - notInk / ringCells : null,
    ringAreaMm2: ringCells * px2,
    ringNotInkMm2: notInk * px2,
    selfOccludedAreaMm2: excludedCells * px2,
  };
};

module.exports = {
  captureClipGroups, captureSelfOcclusionFootprint, measureRingFillRate, pointInRings, distToSegment,
};
