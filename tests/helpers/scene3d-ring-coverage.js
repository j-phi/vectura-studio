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
 * Measure ring-fill-rate: of the area covered by `ringGroups` (the union of
 * every captured clip result), what fraction does `inkPaths` (stroked at
 * `penWidth * (path.meta.weightScale || 1)`) actually cover?
 *
 * @param {Array<Array<{x:number,y:number}>>>} ringGroups  one ring-array per captured clip call
 * @param {Array<{x:number,y:number}[]> & {meta?:object}} inkPaths  final emitted paths
 * @param {number} penWidth
 * @returns {{ringFillRate:number, ringAreaMm2:number, ringNotInkMm2:number}}
 */
const measureRingFillRate = (ringGroups, inkPaths, penWidth) => {
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

  let ringCells = 0;
  let notInk = 0;
  for (let k = 0; k < ring.length; k += 1) {
    if (!ring[k]) continue;
    ringCells += 1;
    if (!ink[k]) notInk += 1;
  }
  const px2 = cs * cs;
  return {
    ringFillRate: ringCells ? 1 - notInk / ringCells : null,
    ringAreaMm2: ringCells * px2,
    ringNotInkMm2: notInk * px2,
  };
};

module.exports = { captureClipGroups, measureRingFillRate, pointInRings, distToSegment };
