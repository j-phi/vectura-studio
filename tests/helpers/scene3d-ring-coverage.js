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
 *
 * A3 ORACLE SPLIT (2026-09-05, `docs/3d-audit/lane-reports/A3-plan.md` +
 * `A3-judge.md`, the binding amended brief). `ringNotInkMm2`'s denominator is
 * the raw clipped ribbon polygon; a pen of width `w` stroked with its centre
 * kept `w/2` inside that polygon CANNOT ink the polygon's convex corners —
 * a wedge of depth `(w/2)(csc(θ/2) - 1)` per corner of interior angle θ is
 * unreachable BY CONSTRUCTION, not by any fill defect. On the five
 * self-crossing bucket-B laws the clip produces enough corners that this
 * unreachable set is 89-98% of the reported `ringNotInkMm2`.
 *
 * This file therefore additionally classifies each uncovered cell as
 * pen-REACHABLE or pen-UNREACHABLE (`ringNotInkReachableMm2` /
 * `ringUnreachableMm2`, `classifyReachabilityAtDivisor`) and reports a
 * per-uncovered-cell CLUSTER breakdown (`findUncoveredClusters`, 8-connected
 * flood fill) so a caller can ask the shape question a human actually means
 * by "streak" — is any connected uncovered run long AND wider than one pen —
 * rather than trusting an mm² total that a merely finer search can move
 * (`trochoidLoop` measured 0.1800 mm² at a 12-point lattice and 0.1856 mm² at
 * a 24-point lattice — see `DEFAULT_REACHABILITY_LATTICE_DIVISOR` below).
 *
 * The judge's verdict is explicit that this split does NOT close F1: the
 * entire residue (reachable and unreachable together) is a scatter of ~150
 * sub-cell clusters per law, none longer than ~1mm and none wider than one
 * pen over any real length — there is no band anywhere in this metric, so it
 * was never the user's streak. See `docs/3d-audit/STILL-OPEN.md`'s A3 bullet
 * before treating a green `scene3d-ribbon-f1b-streaks.test.js` as proof F1 is
 * fixed. It is not; it is proof this METRIC cannot see F1's actual defect.
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
 * Reachability lattice resolution, PINNED as a named constant per
 * `A3-judge.md` §5 item A1 (not tuned per-call — a caller that wants a
 * different resolution must say so explicitly via `opts`/the divisor
 * argument, and the sensitivity guard in
 * `scene3d-ring-coverage-reachability.test.js` /
 * `scene3d-ribbon-f1b-streaks.test.js` asserts that DOUBLING it (halving the
 * search step) moves any law's reachable-cell count by <= 1 cell. A finer
 * lattice can only ever RECLASSIFY a cell from unreachable to reachable
 * (never the reverse — a real admissible pen-centre point does not stop
 * existing when you look harder for it), so a number that jumps by more than
 * one cell under a finer search is resolution-bought, not measured.
 */
const DEFAULT_REACHABILITY_LATTICE_DIVISOR = 12; // step = penWidth / 12 = 0.025 mm at pen 0.3 mm

/**
 * Build the shared ring/ink/exclusion coverage grid `measureRingFillRate`
 * rasterizes. Exposes per-cell ring-GROUP OWNERSHIP (first match, exactly
 * matching the `break` in the "is this cell ring at all" loop below — a cell
 * is scored against the SAME group that made it count as ring in the first
 * place) and the flat list of uncovered cells, so reachability/cluster
 * analysis (and a caller wanting to re-run reachability at a different
 * lattice resolution without re-rasterizing) can share one computation.
 * Pulled out of `measureRingFillRate` as its own function for exactly that
 * reuse — see the lattice-sensitivity test, which calls
 * `classifyReachabilityAtDivisor` twice against ONE grid.
 */
const buildCoverageGrid = (ringGroups, inkPaths, penWidth, opts = {}) => {
  const allRings = [].concat(...ringGroups);
  const cs = Math.max(penWidth / 4, 0.01);
  if (!allRings.length) {
    return {
      ox: 0, oy: 0, cs, nx: 0, ny: 0, ringGroups,
      uncovered: [], ringCells: 0, notInk: 0, excludedCells: 0,
    };
  }
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
  const owner = new Int32Array(nx * ny).fill(-1);
  for (let j = 0; j < ny; j += 1) {
    const y = oy + (j + 0.5) * cs;
    for (let i = 0; i < nx; i += 1) {
      const x = ox + (i + 0.5) * cs;
      // Each captured group is its own local nonzero polygon (shell+holes);
      // a cell counts as "ring" if ANY group covers it — first match wins,
      // and `owner` records exactly which group that was.
      for (let g = 0; g < ringGroups.length; g += 1) {
        if (pointInRings(x, y, ringGroups[g])) { ring[j * nx + i] = 1; owner[j * nx + i] = g; break; }
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

  // F7 correction — see `measureRingFillRate`'s own header. Stroke every
  // self-occlusion-removed chord at the SAME half-pen radius real ink would
  // have claimed there, and exclude every cell it touches from both ring and
  // ink below: a cell self-occlusion legitimately erased no longer counts as
  // "ring" at all. Empty (the default, and what `VECTURA_PRE_F7=1` always
  // produces) => `excluded` stays all-zero => byte-identical to the
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
  const uncovered = [];
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i;
      if (!ring[k]) continue;
      if (excluded[k]) { excludedCells += 1; continue; }
      ringCells += 1;
      if (!ink[k]) { notInk += 1; uncovered.push({ i, j, groupIndex: owner[k] }); }
    }
  }

  return {
    ox, oy, cs, nx, ny, ringGroups, uncovered, ringCells, notInk, excludedCells,
  };
};

/**
 * Reachability classification (`A3-judge.md` §1, verbatim predicate): an
 * uncovered cell at `(x,y)` owned by clip group `g` (the SAME group that made
 * it count as "ring" — see `buildCoverageGrid`'s `owner`) is pen-REACHABLE
 * iff there exists a point `p` with `p` inside `g`'s rings,
 * `dist(p, boundary of g) >= penWidth/2`, and `|(x,y) - p| <= penWidth/2`.
 * `p` is searched on a lattice strictly bounded by the disk `|(x,y)-p|<=r`
 * (so the search cost is independent of the group's overall size), at
 * resolution `penWidth / latticeDivisor` — finer than one coverage cell by
 * construction whenever `latticeDivisor > 4` (the coverage cell size is
 * `penWidth/4`).
 *
 * Only ever called against the (few hundred) cells `buildCoverageGrid`
 * already found uncovered — this is why re-running it at a different
 * divisor (the sensitivity guard) is cheap.
 */
const classifyReachabilityAtDivisor = (grid, penWidth, latticeDivisor) => {
  const {
    ox, oy, cs, uncovered, ringGroups,
  } = grid;
  const half = penWidth / 2;
  const step = penWidth / latticeDivisor;
  const range = Math.max(1, Math.round(half / step));
  if (!grid._groupSegments) {
    // eslint-disable-next-line no-param-reassign
    grid._groupSegments = ringGroups.map((rings) => {
      const segs = [];
      rings.forEach((ring) => {
        const n = ring.length;
        for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
          segs.push(ring[j].x, ring[j].y, ring[i].x, ring[i].y);
        }
      });
      return segs; // flat [ax,ay,bx,by, ax,ay,bx,by, ...]
    });
  }
  const groupSegments = grid._groupSegments;
  let reachableCount = 0;
  let unreachableCount = 0;
  const reachableFlags = new Uint8Array(uncovered.length);
  uncovered.forEach((cell, idx) => {
    const gIdx = cell.groupIndex;
    if (gIdx == null || gIdx < 0 || !ringGroups[gIdx]) { unreachableCount += 1; return; }
    const rings = ringGroups[gIdx];
    const segs = groupSegments[gIdx];
    const cx = ox + (cell.i + 0.5) * cs;
    const cy = oy + (cell.j + 0.5) * cs;
    let ok = false;
    for (let dj = -range; dj <= range && !ok; dj += 1) {
      const py = cy + dj * step;
      for (let di = -range; di <= range && !ok; di += 1) {
        const px = cx + di * step;
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy > half * half + 1e-9) continue;
        if (!pointInRings(px, py, rings)) continue;
        let minD = Infinity;
        for (let s = 0; s < segs.length; s += 4) {
          const d = distToSegment(px, py, segs[s], segs[s + 1], segs[s + 2], segs[s + 3]);
          if (d < minD) {
            minD = d;
            if (minD <= half) break; // cannot help ok=true; short-circuit
          }
        }
        if (minD >= half - 1e-9) ok = true;
      }
    }
    if (ok) { reachableCount += 1; reachableFlags[idx] = 1; } else unreachableCount += 1;
  });
  return { reachableCount, unreachableCount, reachableFlags };
};

/**
 * Flood-fill (8-connected) the uncovered-cell set into clusters and report
 * each cluster's bounding-box footprint in mm — `lengthMm` (the long axis)
 * and `crossWidthMm` (the short axis). This is what makes "is this a streak"
 * an assertion a human can check against a picture (`A3-judge.md` §5 item
 * A2): a genuine lengthwise streak is BOTH wider than one pen width AND runs
 * longer than ~1 pen's worth of length; a corner wedge or a rasterization
 * speck is short, narrow, or both. Clusters are NOT restricted to a single
 * ring group — two abutting groups' uncovered cells can flood into the same
 * cluster if they are geometrically adjacent, matching how a human's eye
 * would read the render (a boundary between two ribbon polygons is invisible
 * ink-wise).
 */
const findUncoveredClusters = (grid) => {
  const { nx, cs, uncovered } = grid;
  if (!uncovered.length) return [];
  const memberSet = new Set(uncovered.map((c) => c.j * nx + c.i));
  const visited = new Set();
  const clusters = [];
  uncovered.forEach((cell) => {
    const key = cell.j * nx + cell.i;
    if (visited.has(key)) return;
    visited.add(key);
    const stack = [cell];
    let minI = cell.i; let maxI = cell.i; let minJ = cell.j; let maxJ = cell.j; let count = 0;
    while (stack.length) {
      const cur = stack.pop();
      count += 1;
      if (cur.i < minI) minI = cur.i;
      if (cur.i > maxI) maxI = cur.i;
      if (cur.j < minJ) minJ = cur.j;
      if (cur.j > maxJ) maxJ = cur.j;
      for (let dj = -1; dj <= 1; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          if (!di && !dj) continue;
          const ni = cur.i + di;
          const nj = cur.j + dj;
          const nk = nj * nx + ni;
          if (!memberSet.has(nk) || visited.has(nk)) continue;
          visited.add(nk);
          stack.push({ i: ni, j: nj });
        }
      }
    }
    const bboxWmm = (maxI - minI + 1) * cs;
    const bboxHmm = (maxJ - minJ + 1) * cs;
    clusters.push({
      cells: count,
      areaMm2: count * cs * cs,
      lengthMm: Math.max(bboxWmm, bboxHmm),
      crossWidthMm: Math.min(bboxWmm, bboxHmm),
    });
  });
  return clusters;
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
 * A3 ORACLE SPLIT — see this file's own header. Additive fields, computed
 * from the exact same grid the four original fields come from
 * (`ringFillRate`, `ringAreaMm2`, `ringNotInkMm2`, `selfOccludedAreaMm2` are
 * unchanged, byte-for-byte, from the pre-split implementation):
 *   `ringNotInkReachableMm2` / `ringUnreachableMm2` — the uncovered area
 *     split into pen-reachable vs pen-unreachable (see
 *     `classifyReachabilityAtDivisor`), at `DEFAULT_REACHABILITY_LATTICE_DIVISOR`
 *     unless `opts.reachabilityLatticeDivisor` overrides it.
 *   `uncoveredClusters` — the flood-filled cluster breakdown (see
 *     `findUncoveredClusters`) of ALL uncovered cells, reachable and
 *     unreachable alike (a human looking at the render cannot tell which is
 *     which — only whether it reads as a streak).
 *   `grid` — the underlying grid, so a caller can re-run
 *     `classifyReachabilityAtDivisor` at another resolution (the lattice
 *     sensitivity guard) without re-rasterizing.
 *
 * @param {Array<Array<{x:number,y:number}>>>} ringGroups  one ring-array per captured clip call
 * @param {Array<{x:number,y:number}[]> & {meta?:object}} inkPaths  final emitted paths
 * @param {number} penWidth
 * @param {{selfOccludedSegments?: Array<{a:{x:number,y:number},b:{x:number,y:number}}>, reachabilityLatticeDivisor?: number, grid?: object}} [opts]
 */
const measureRingFillRate = (ringGroups, inkPaths, penWidth, opts = {}) => {
  const allRings = [].concat(...ringGroups);
  if (!allRings.length) {
    return {
      ringFillRate: null,
      ringAreaMm2: 0,
      ringNotInkMm2: 0,
      selfOccludedAreaMm2: 0,
      ringNotInkReachableMm2: 0,
      ringUnreachableMm2: 0,
      uncoveredClusters: [],
      reachableCellCount: 0,
      unreachableCellCount: 0,
      grid: null,
    };
  }
  const grid = opts.grid || buildCoverageGrid(ringGroups, inkPaths, penWidth, opts);
  const { cs, ringCells, notInk, excludedCells } = grid;
  const px2 = cs * cs;

  const divisor = Number.isFinite(opts.reachabilityLatticeDivisor)
    ? opts.reachabilityLatticeDivisor : DEFAULT_REACHABILITY_LATTICE_DIVISOR;
  const { reachableCount, unreachableCount } = classifyReachabilityAtDivisor(grid, penWidth, divisor);
  const clusters = findUncoveredClusters(grid);

  return {
    ringFillRate: ringCells ? 1 - notInk / ringCells : null,
    ringAreaMm2: ringCells * px2,
    ringNotInkMm2: notInk * px2,
    selfOccludedAreaMm2: excludedCells * px2,
    ringNotInkReachableMm2: reachableCount * px2,
    ringUnreachableMm2: unreachableCount * px2,
    uncoveredClusters: clusters,
    reachableCellCount: reachableCount,
    unreachableCellCount: unreachableCount,
    grid,
  };
};

module.exports = {
  captureClipGroups,
  captureSelfOcclusionFootprint,
  measureRingFillRate,
  pointInRings,
  distToSegment,
  buildCoverageGrid,
  classifyReachabilityAtDivisor,
  findUncoveredClusters,
  DEFAULT_REACHABILITY_LATTICE_DIVISOR,
};
