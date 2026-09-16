/**
 * F1-placement — a shared "how far is the nearest ink" rasteriser, used by
 * `scene3d-ribbon-flat-field-placement.test.js`'s RED-2 oracle (the
 * user-visible bare-strip defect) and by the planner's own `f1diag.js`
 * methodology (`docs/3d-audit/lane-reports/F1-placement-plan.md` §3.4/§10).
 *
 * Deliberately NOT the A3 ring-coverage oracle
 * (`tests/helpers/scene3d-ring-coverage.js`): that measures whitespace
 * INSIDE a clipped ribbon polygon (89-98% of it pen-unreachable-by-
 * construction, per the A3 judge). F1's defect is a band where NO ribbon
 * was ever built at all — a slot of dropped rulings — which lies entirely
 * OUTSIDE the ring-coverage denominator. This file measures blank area over
 * the whole visible-form REGION (the `clipRings` argument `ribbonize`
 * passes to `RibbonGeometry.clipMultiPolygonToRegion`, captured by
 * `captureRegionRings` below), not over any one ribbon's own clip.
 *
 * "Distance to nearest ink" is measured from the ink's own STROKED EDGE, not
 * its centreline — a cell right next to a drawn line is not blank just
 * because it sits on the far side of the pen's own half-width. So the
 * "covered within D" test inflates each ink segment's capture radius by the
 * path's own half pen width before comparing to D.
 */
const { pointInRings, distToSegment } = require('./scene3d-ring-coverage');

/**
 * Attach a recorder to `RibbonGeometry.clipMultiPolygonToRegion` that tracks
 * every DISTINCT `clipRings` argument (by reference — `visibleRegionRings`
 * memoizes one array per front/back key, so a build only ever produces a
 * couple of distinct references) and how many calls used it. Returns
 * { dominantRegion(), restore() }; `dominantRegion()` is the region the
 * BUILD called with most often — for a camera that renders mostly
 * front-facing stretches (every fixture in this suite), that is the front
 * visible-region silhouette, i.e. exactly what the plan calls "the front
 * region".
 */
const captureRegionRings = (Vectura) => {
  const RG = Vectura.RibbonGeometry;
  const orig = RG.clipMultiPolygonToRegion;
  const counts = new Map();
  RG.clipMultiPolygonToRegion = function patched(subjectMP, clipRings, opts) {
    if (Array.isArray(clipRings) && clipRings.length) {
      counts.set(clipRings, (counts.get(clipRings) || 0) + 1);
    }
    return orig.call(this, subjectMP, clipRings, opts);
  };
  return {
    restore: () => { RG.clipMultiPolygonToRegion = orig; },
    dominantRegion: () => {
      let best = null;
      let bestCount = -1;
      counts.forEach((count, rings) => { if (count > bestCount) { bestCount = count; best = rings; } });
      return best;
    },
  };
};

/**
 * Rasterise `regionRings` at `opts.cellSize` mm (default 0.1) and, for each
 * distance threshold in `opts.thresholds` (default [0.8, 1.5, 2.0] mm),
 * classify every in-region cell as "blank" (distance from the cell centre to
 * the nearest ink's own stroked edge is > threshold) or covered.
 *
 * @param {Array<Array<{x:number,y:number}>>} regionRings
 * @param {Array<{x:number,y:number}[]> & {meta?:object}} inkPaths
 * @param {number} penWidth
 * @param {{cellSize?:number, thresholds?:number[]}} [opts]
 */
const buildBlankMap = (regionRings, inkPaths, penWidth, opts = {}) => {
  const cs = opts.cellSize || 0.1;
  const thresholds = opts.thresholds || [0.8, 1.5, 2.0];
  if (!Array.isArray(regionRings) || !regionRings.length) {
    return {
      ox: 0, oy: 0, cs, nx: 0, ny: 0, regionCells: 0, regionAreaMm2: 0, blankByT: {},
    };
  }
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  regionRings.forEach((ring) => (ring || []).forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }));
  const ox = minX - cs;
  const oy = minY - cs;
  const nx = Math.max(1, Math.ceil((maxX - minX + 2 * cs) / cs) + 1);
  const ny = Math.max(1, Math.ceil((maxY - minY + 2 * cs) / cs) + 1);
  if (nx * ny > 8_000_000) throw new Error(`scene3d-blank-map: grid too large (${nx}x${ny})`);

  const region = new Uint8Array(nx * ny);
  let regionCells = 0;
  for (let j = 0; j < ny; j += 1) {
    const y = oy + (j + 0.5) * cs;
    for (let i = 0; i < nx; i += 1) {
      const x = ox + (i + 0.5) * cs;
      if (pointInRings(x, y, regionRings)) { region[j * nx + i] = 1; regionCells += 1; }
    }
  }

  const coveredByT = {};
  thresholds.forEach((t) => { coveredByT[t] = new Uint8Array(nx * ny); });

  (inkPaths || []).forEach((path) => {
    const wv = Number(path && path.meta && path.meta.weightScale);
    const rBase = (Number.isFinite(wv) ? wv : 1) * penWidth / 2;
    for (let s = 0; s + 1 < path.length; s += 1) {
      const a = path[s];
      const b = path[s + 1];
      thresholds.forEach((t) => {
        const r = t + rBase;
        const grid = coveredByT[t];
        const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - r - ox) / cs - 0.5));
        const i1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + r - ox) / cs - 0.5));
        const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - r - oy) / cs - 0.5));
        const j1 = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y) + r - oy) / cs - 0.5));
        for (let j = j0; j <= j1; j += 1) {
          const y = oy + (j + 0.5) * cs;
          for (let i = i0; i <= i1; i += 1) {
            const k = j * nx + i;
            if (grid[k] || !region[k]) continue;
            const x = ox + (i + 0.5) * cs;
            if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= r) grid[k] = 1;
          }
        }
      });
    }
  });

  const blankByT = {};
  thresholds.forEach((t) => {
    const covered = coveredByT[t];
    const mask = new Uint8Array(nx * ny);
    let cells = 0;
    for (let k = 0; k < nx * ny; k += 1) {
      if (region[k] && !covered[k]) { mask[k] = 1; cells += 1; }
    }
    blankByT[t] = { mask, cells, areaMm2: cells * cs * cs };
  });

  return {
    ox, oy, cs, nx, ny, regionCells, regionAreaMm2: regionCells * cs * cs, blankByT,
  };
};

/**
 * 4-connected flood fill of a blank mask into clusters, reporting each
 * cluster's bounding-box footprint in mm (`lengthMm` the long axis,
 * `crossWidthMm` the short axis) and centroid — the RED-2 "does this read as
 * a streak" shape oracle (`F1-placement-plan.md` §10 RED-2).
 */
const findBlankClusters = (mask, nx, ny, cs, ox, oy) => {
  if (!mask || !mask.length) return [];
  const visited = new Uint8Array(mask.length);
  const clusters = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    visited[start] = 1;
    const stack = [start];
    let minI = start % nx; let maxI = minI; let minJ = Math.floor(start / nx); let maxJ = minJ;
    let count = 0; let sumI = 0; let sumJ = 0;
    while (stack.length) {
      const k = stack.pop();
      const i = k % nx;
      const j = Math.floor(k / nx);
      count += 1; sumI += i; sumJ += j;
      if (i < minI) minI = i;
      if (i > maxI) maxI = i;
      if (j < minJ) minJ = j;
      if (j > maxJ) maxJ = j;
      const neighbours = [
        i > 0 ? k - 1 : -1,
        i < nx - 1 ? k + 1 : -1,
        j > 0 ? k - nx : -1,
        j < ny - 1 ? k + nx : -1,
      ];
      neighbours.forEach((nk) => {
        if (nk >= 0 && mask[nk] && !visited[nk]) { visited[nk] = 1; stack.push(nk); }
      });
    }
    const bboxWmm = (maxI - minI + 1) * cs;
    const bboxHmm = (maxJ - minJ + 1) * cs;
    clusters.push({
      cells: count,
      areaMm2: count * cs * cs,
      lengthMm: Math.max(bboxWmm, bboxHmm),
      crossWidthMm: Math.min(bboxWmm, bboxHmm),
      centroid: { x: ox + (sumI / count + 0.5) * cs, y: oy + (sumJ / count + 0.5) * cs },
    });
  }
  return clusters;
};

module.exports = {
  captureRegionRings,
  buildBlankMap,
  findBlankClusters,
};
