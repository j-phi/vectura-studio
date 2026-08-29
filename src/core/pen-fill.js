/**
 * PenFill — guaranteed-coverage, pen-width-pitched region fills.
 *
 * A variable-width stroke is drawn as an OUTLINE plus a FILL of its interior.
 * The fill exists for exactly one reason: to leave NO WHITESPACE inside that
 * outline. There is therefore no artistic density knob here. The pass pitch is
 * DERIVED from the pen:
 *
 *     pitch = penWidth * (1 - overlap)      // overlap defaults to 0.15
 *
 * so changing the pen necessarily changes the emitted path, and adjacent passes
 * always overlap by `overlap * penWidth`.
 *
 * Everything is built on ONE robust primitive — a signed distance field sampled
 * on a grid at penWidth/10. Iso-contours of that field are, by construction,
 * exactly `pitch` apart in distance-to-boundary, which is what makes the fill
 * gap-free on non-convex shapes (a plain polygon offset self-intersects there;
 * `_contourFieldFill` in src/core/algorithms/pattern.js is the same idea and is
 * the model for `concentric`).
 *
 * Distance fields alone are not enough: the residual whitespace of ANY pitched
 * fill collects on the medial axis and in cusps, where the level ladder runs out
 * before the local maximum. So the module closes the loop on itself — it
 * rasterizes its own output, finds the uncovered blobs, and fills them, until
 * the region is clean. Coverage is measured, not assumed.
 *
 * CONNECTORS. `spiral` and `serpentine` promise ONE path per connected component
 * (that is what keeps a scene's path count flat no matter how wide the ribbon
 * gets). Every connector is routed strictly INSIDE the region — a straight hop
 * when one validates, otherwise a 4-connected route through interior cells — and
 * validated by point-in-polygon before it is emitted. Ink laid down by a
 * connector is harmless: it lands inside a region we are filling solid anyway.
 * `concentric` and `contourParallel` bridge with a bounded connector and LIFT the
 * pen when no bridge validates, rather than emitting a connector that escapes
 * the region.
 *
 *     window.Vectura.PenFill.fillRegion(region, penWidth, style, opts)
 *       region  — array of closed rings (outer + holes), or a single bare ring.
 *                 Points may be {x,y} or [x,y].
 *       style   — 'spiral' | 'concentric' | 'serpentine' | 'contourParallel'
 *       opts    — { overlap: 0.15, axis: {x,y} | null, maxPaths: number }
 *                 (`geometry` may inject GeometryUtils where there is no window)
 *       returns — { paths: [{x,y}[], ...], coverage: number, components: number }
 */
(() => {
  'use strict';

  const DEFAULT_OVERLAP = 0.15;
  const STYLES = ['spiral', 'concentric', 'serpentine', 'contourParallel'];

  // Field resolution, in cells per pen width. The independent coverage test
  // rasterizes at 4; sampling 10 keeps our own verdict strictly finer than the
  // one that grades us, so a hole we call closed cannot open up under a coarser
  // grid's alignment.
  const CELLS_PER_PEN = 10;
  const MAX_CELLS = 1400000;
  // Repair-time coverage is measured with a slightly SHRUNK pen so discretisation
  // never lets a real sliver hide between two rasters. Reported coverage uses the
  // true pen.
  const REPAIR_PEN_SAFETY = 0.96;
  const MAX_REPAIR_ROUNDS = 4;
  // Fraction of each ring spent morphing onto the next one — this is what makes
  // `spiral` a true spiral rather than stacked rings with a jump.
  const BLEND_FRACTION = 0.3;
  // …and never longer than this many pitches of travel, whichever is shorter.
  const BLEND_ARC_PITCHES = 8;
  // Bridged (pen-lifting) styles only hop this far before lifting.
  const BRIDGE_LIMIT_PITCHES = 6;
  // A connected component this small is what a scanline sheds at a sharp point,
  // not geometry anyone asked to fill. See `mergeFlecks`.
  const MAX_FLECK_CELLS = 6;
  const EPS = 1e-9;

  // ── Small helpers ─────────────────────────────────────────────────────────
  const isNum = (v) => Number.isFinite(v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const geometryUtils = (opts) => (opts && opts.geometry)
    || (typeof window !== 'undefined' && window.Vectura && window.Vectura.GeometryUtils)
    || null;

  const asPoint = (p) => {
    if (Array.isArray(p)) {
      const x = Number(p[0]);
      const y = Number(p[1]);
      return isNum(x) && isNum(y) ? { x, y } : null;
    }
    if (p && typeof p === 'object') {
      const x = Number(p.x);
      const y = Number(p.y);
      return isNum(x) && isNum(y) ? { x, y } : null;
    }
    return null;
  };

  const cleanRing = (raw) => {
    if (!Array.isArray(raw)) return null;
    const pts = [];
    for (const p of raw) {
      const q = asPoint(p);
      if (!q) continue;
      const last = pts[pts.length - 1];
      if (last && Math.abs(last.x - q.x) < EPS && Math.abs(last.y - q.y) < EPS) continue;
      pts.push(q);
    }
    while (pts.length > 1) {
      const f = pts[0];
      const l = pts[pts.length - 1];
      if (Math.abs(f.x - l.x) < EPS && Math.abs(f.y - l.y) < EPS) pts.pop();
      else break;
    }
    return pts.length >= 3 ? pts : null;
  };

  /** Accepts a ring list, or a single bare ring, in {x,y} or [x,y] form. */
  const normalizeRegion = (region) => {
    if (!Array.isArray(region) || !region.length) return [];
    const bare = asPoint(region[0]) !== null;
    const source = bare ? [region] : region;
    const rings = [];
    for (const raw of source) {
      const ring = cleanRing(raw);
      if (ring) rings.push(ring);
    }
    return rings;
  };

  const regionBounds = (rings) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const ring of rings) {
      for (const p of ring) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    return { minX, minY, maxX, maxY };
  };

  /** Even-odd point-in-region across every ring (outer + holes, any winding). */
  const pointInRegion = (x, y, rings) => {
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

  // ── Exact Euclidean distance transform (Felzenszwalb–Huttenlocher) ────────
  const edt1d = (f, n, d, v, z) => {
    let k = 0;
    v[0] = 0;
    z[0] = -1e20;
    z[1] = 1e20;
    for (let q = 1; q < n; q += 1) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k -= 1;
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k += 1;
      v[k] = q;
      z[k] = s;
      z[k + 1] = 1e20;
    }
    k = 0;
    for (let q = 0; q < n; q += 1) {
      while (z[k + 1] < q) k += 1;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };

  /** Distance, in cells, from every cell to the nearest cell where mask===seed. */
  const edt = (mask, nx, ny, seed) => {
    const INF = 1e12;
    const m = Math.max(nx, ny);
    const f = new Float64Array(m);
    const d = new Float64Array(m);
    const v = new Int32Array(m);
    const z = new Float64Array(m + 1);
    const g = new Float64Array(nx * ny);
    for (let k = 0; k < g.length; k += 1) g[k] = mask[k] === seed ? 0 : INF;
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < ny; j += 1) f[j] = g[j * nx + i];
      edt1d(f, ny, d, v, z);
      for (let j = 0; j < ny; j += 1) g[j * nx + i] = d[j];
    }
    for (let j = 0; j < ny; j += 1) {
      const base = j * nx;
      for (let i = 0; i < nx; i += 1) f[i] = g[base + i];
      edt1d(f, nx, d, v, z);
      for (let i = 0; i < nx; i += 1) g[base + i] = d[i];
    }
    const out = new Float32Array(nx * ny);
    for (let k = 0; k < g.length; k += 1) out[k] = Math.sqrt(g[k]);
    return out;
  };

  // ── Signed distance field over the region ────────────────────────────────
  const buildField = (rings, cs) => {
    const b = regionBounds(rings);
    if (!isNum(b.minX)) return null;
    const pad = 3 * cs;
    const ox = b.minX - pad;
    const oy = b.minY - pad;
    const nx = Math.max(4, Math.ceil((b.maxX - b.minX + 2 * pad) / cs) + 1);
    const ny = Math.max(4, Math.ceil((b.maxY - b.minY + 2 * pad) / cs) + 1);
    const inside = new Uint8Array(nx * ny);
    const xs = [];
    for (let j = 0; j < ny; j += 1) {
      const y = oy + j * cs;
      xs.length = 0;
      for (const ring of rings) {
        const n = ring.length;
        for (let i = 0; i < n; i += 1) {
          const a = ring[i];
          const c = ring[(i + 1) % n];
          if ((a.y <= y) === (c.y <= y)) continue;
          const t = (y - a.y) / (c.y - a.y);
          xs.push(a.x + t * (c.x - a.x));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        let i0 = Math.ceil((xs[m] - ox) / cs);
        let i1 = Math.floor((xs[m + 1] - ox) / cs);
        if (i0 < 0) i0 = 0;
        if (i1 > nx - 1) i1 = nx - 1;
        for (let i = i0; i <= i1; i += 1) inside[j * nx + i] = 1;
      }
    }
    return finishField({ nx, ny, ox, oy, cs, inside });
  };

  /** Attach the signed distance to an inside mask (shared by region + repair blobs). */
  const finishField = (f) => {
    const { nx, ny, cs, inside } = f;
    const dIn = edt(inside, nx, ny, 0);
    const dOut = edt(inside, nx, ny, 1);
    const sdf = new Float32Array(nx * ny);
    for (let k = 0; k < sdf.length; k += 1) {
      sdf[k] = inside[k] ? (dIn[k] - 0.5) * cs : -((dOut[k] - 0.5) * cs);
    }
    f.sdf = sdf;
    return f;
  };

  const sampleSdf = (field, x, y) => {
    const { nx, ny, ox, oy, cs, sdf } = field;
    let gx = (x - ox) / cs;
    let gy = (y - oy) / cs;
    if (!(gx > 0)) gx = 0;
    if (!(gy > 0)) gy = 0;
    if (gx > nx - 1) gx = nx - 1;
    if (gy > ny - 1) gy = ny - 1;
    const i = Math.min(nx - 2, Math.floor(gx));
    const j = Math.min(ny - 2, Math.floor(gy));
    const fx = gx - i;
    const fy = gy - j;
    const k = j * nx + i;
    const a = sdf[k] * (1 - fx) + sdf[k + 1] * fx;
    const b = sdf[k + nx] * (1 - fx) + sdf[k + nx + 1] * fx;
    return a * (1 - fy) + b * fy;
  };

  const cellIndex = (field, x, y) => {
    const i = Math.round((x - field.ox) / field.cs);
    const j = Math.round((y - field.oy) / field.cs);
    if (i < 0 || j < 0 || i >= field.nx || j >= field.ny) return -1;
    return j * field.nx + i;
  };

  const cellPoint = (field, k) => {
    const i = k % field.nx;
    const j = (k - i) / field.nx;
    return { x: field.ox + i * field.cs, y: field.oy + j * field.cs };
  };

  // ── Connected components of the inside mask ───────────────────────────────
  /** Labels each inside cell, and reports how many cells each component holds. */
  const labelComponents = (field) => {
    const { nx, ny, inside } = field;
    const lab = new Int32Array(nx * ny).fill(-1);
    const areas = [];
    const stack = [];
    let count = 0;
    for (let k = 0; k < inside.length; k += 1) {
      if (!inside[k] || lab[k] >= 0) continue;
      lab[k] = count;
      stack.length = 0;
      stack.push(k);
      let cells = 0;
      while (stack.length) {
        const c = stack.pop();
        cells += 1;
        const ci = c % nx;
        const cj = (c - ci) / nx;
        const push = (ni, nj) => {
          if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) return;
          const nk = nj * nx + ni;
          if (!inside[nk] || lab[nk] >= 0) return;
          lab[nk] = count;
          stack.push(nk);
        };
        push(ci - 1, cj); push(ci + 1, cj); push(ci, cj - 1); push(ci, cj + 1);
      }
      areas.push(cells);
      count += 1;
    }
    return { lab, count, areas };
  };

  /**
   * Fold rasterizer flecks into the body they were cut from, and report which
   * components are left.
   *
   * At a sharp convex point the scanline span narrows below one cell for a row
   * or two before the tip, which severs the tip's last cell from the body. Every
   * such orphan labels as its own connected component and then earns its own
   * path — a five-pointed star came back as THREE paths from `spiral`, whose
   * entire promise is one. Each tapered ribbon end in a scene is such a point,
   * so this is the difference between a flat path count and a creeping one.
   *
   * They are MERGED, not discarded. Discarding them also throws away the ink
   * they carried, and at a broad nib a fleck's single dab covers real area
   * around it — dropping four of them cost half a percent of coverage on the
   * crescent. Merging relabels the cell onto its neighbour so the fleck stops
   * being a component (no second path) while its cells stay in the region, still
   * counted by coverage and still reachable by the repair pass.
   *
   * The bar is measured in CELLS because the question is about the rasterizer's
   * own precision and nothing else. A pen-relative bar is the wrong instrument:
   * it scales with the pen, and at a broad nib it starts swallowing real
   * geometry such as a crescent's cusp.
   */
  const mergeFlecks = (field, lab, areas) => {
    const { nx, ny, inside } = field;
    const live = [];
    const fleck = [];
    for (let c = 0; c < areas.length; c += 1) {
      if (areas[c] > MAX_FLECK_CELLS) live.push(c); else fleck.push(c);
    }
    // Nothing cleared the bar: the whole region is smaller than a few cells.
    // Keep the largest so it still gets its centreline pass.
    if (!live.length) {
      if (!areas.length) return [];
      let best = 0;
      for (let c = 1; c < areas.length; c += 1) if (areas[c] > areas[best]) best = c;
      return [best];
    }
    if (!fleck.length) return live;
    const isFleck = new Uint8Array(areas.length);
    for (const c of fleck) isFleck[c] = 1;
    // A fleck that finds no body to rejoin is not a severed tip — it is a real,
    // if tiny, island. Merging is only ever allowed to move ink, never to lose
    // it, so an orphan keeps its own path rather than being dropped.
    const orphan = new Uint8Array(areas.length);
    for (const c of fleck) orphan[c] = 1;
    for (let k = 0; k < inside.length; k += 1) {
      if (!inside[k] || lab[k] < 0 || !isFleck[lab[k]]) continue;
      const ci = k % nx;
      const cj = (k - ci) / nx;
      let host = -1;
      for (let r = 1; r <= 3 && host < 0; r += 1) {
        for (let dj = -r; dj <= r && host < 0; dj += 1) {
          for (let di = -r; di <= r; di += 1) {
            if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
            const ni = ci + di;
            const nj = cj + dj;
            if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
            const nk = nj * nx + ni;
            if (!inside[nk] || lab[nk] < 0 || isFleck[lab[nk]]) continue;
            host = lab[nk];
            break;
          }
        }
      }
      if (host >= 0) {
        orphan[lab[k]] = 0;
        lab[k] = host;
      }
    }
    for (const c of fleck) if (orphan[c]) live.push(c);
    live.sort((a, b) => a - b);
    return live;
  };

  // ── Marching squares over the signed field ────────────────────────────────
  /**
   * Decimate an open run. The maths lives in ONE place — `GeometryUtils`
   * simplifyPath (Ramer-Douglas-Peucker, perpendicular-distance tolerance) — and
   * this only adapts it. Hand-rolling it here is exactly the mistake
   * `tests/unit/simplify-single-source.test.js` guards against, and a
   * hand-rolled forward filter is also what quietly turned a 350-point offset
   * circle into a 15-gon whose flats fell a twentieth of a pen short of the rim.
   * Without GeometryUtils the run is kept verbatim: more points, never less ink.
   */
  const decimateRun = (pts, tol) => {
    const GU = geometryUtils(null);
    if (!GU || typeof GU.simplifyPath !== 'function') return pts.slice();
    const out = GU.simplifyPath(pts, tol);
    return Array.isArray(out) && out.length >= 2 ? out : pts.slice();
  };

  /**
   * Decimate a run whose first and last point coincide. Pinning only the shared
   * endpoint would let the whole loop collapse onto it, so the point farthest
   * from the start is pinned as a second anchor and each half is decimated alone.
   */
  const simplifyRing = (pts, tol) => {
    if (!Array.isArray(pts) || pts.length < 3 || !(tol > 0)) return pts;
    const closed = dist(pts[0], pts[pts.length - 1]) < EPS;
    if (!closed) return decimateRun(pts, tol);
    if (pts.length < 5) return pts.slice();
    let far = 1;
    let farD = -1;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const d = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2;
      if (d > farD) { farD = d; far = i; }
    }
    const head = decimateRun(pts.slice(0, far + 1), tol);
    const tail = decimateRun(pts.slice(far), tol);
    return head.concat(tail.slice(1));
  };

  /**
   * Iso-contours of `field.sdf` at `level`, restricted to component `comp`
   * (pass comp < 0 for every component). Returns closed loops (no repeated
   * final point) in world coordinates.
   */
  const contourLoops = (field, level, lab, comp, simplifyTol, cells) => {
    const { nx, ny, ox, oy, cs, sdf } = field;
    const segs = [];
    const count = cells ? cells.length : (nx - 1) * (ny - 1);
    for (let c = 0; c < count; c += 1) {
      {
        const k = cells ? cells[c] : (Math.floor(c / (nx - 1)) * nx + (c % (nx - 1)));
        const i = k % nx;
        const j = (k - i) / nx;
        if (i >= nx - 1 || j >= ny - 1) continue;
        const v0 = sdf[k];
        const v1 = sdf[k + 1];
        const v2 = sdf[k + nx + 1];
        const v3 = sdf[k + nx];
        let idx = 0;
        if (v0 > level) idx |= 1;
        if (v1 > level) idx |= 2;
        if (v2 > level) idx |= 4;
        if (v3 > level) idx |= 8;
        if (idx === 0 || idx === 15) continue;
        if (lab && comp >= 0) {
          let owner = -1;
          if (idx & 1) owner = lab[k];
          else if (idx & 2) owner = lab[k + 1];
          else if (idx & 4) owner = lab[k + nx + 1];
          else owner = lab[k + nx];
          if (owner !== comp) continue;
        }
        const x0 = ox + i * cs;
        const y0 = oy + j * cs;
        const x1 = x0 + cs;
        const y1 = y0 + cs;
        const eB = () => ({ x: x0 + (x1 - x0) * ((level - v0) / (v1 - v0)), y: y0 });
        const eR = () => ({ x: x1, y: y0 + (y1 - y0) * ((level - v1) / (v2 - v1)) });
        const eT = () => ({ x: x0 + (x1 - x0) * ((level - v3) / (v2 - v3)), y: y1 });
        const eL = () => ({ x: x0, y: y0 + (y1 - y0) * ((level - v0) / (v3 - v0)) });
        const push = (a, b) => segs.push({ a, b });
        switch (idx) {
          case 1: case 14: push(eL(), eB()); break;
          case 2: case 13: push(eB(), eR()); break;
          case 3: case 12: push(eL(), eR()); break;
          case 4: case 11: push(eR(), eT()); break;
          case 6: case 9: push(eB(), eT()); break;
          case 7: case 8: push(eL(), eT()); break;
          case 5: {
            // Ambiguous saddle — resolve with the cell centre.
            if ((v0 + v1 + v2 + v3) / 4 > level) { push(eL(), eT()); push(eB(), eR()); }
            else { push(eL(), eB()); push(eR(), eT()); }
            break;
          }
          case 10: {
            if ((v0 + v1 + v2 + v3) / 4 > level) { push(eL(), eB()); push(eR(), eT()); }
            else { push(eL(), eT()); push(eB(), eR()); }
            break;
          }
          default: break;
        }
      }
    }
    if (!segs.length) return [];
    // Link segments into loops. Every iso-crossing lies on a grid edge shared by
    // exactly two cells, so each endpoint has degree 2 and the walk closes.
    const tol = cs * 1e-4;
    const key = (p) => `${Math.round(p.x / tol)}|${Math.round(p.y / tol)}`;
    const ends = new Array(segs.length * 2);
    const map = new Map();
    for (let si = 0; si < segs.length; si += 1) {
      const ka = key(segs[si].a);
      const kb = key(segs[si].b);
      ends[si * 2] = ka;
      ends[si * 2 + 1] = kb;
      let la = map.get(ka);
      if (!la) { la = []; map.set(ka, la); }
      la.push(si * 2);
      let lb = map.get(kb);
      if (!lb) { lb = []; map.set(kb, lb); }
      lb.push(si * 2 + 1);
    }
    const used = new Uint8Array(segs.length);
    const loops = [];
    const extend = (pts, startKey, forward) => {
      let curKey = startKey;
      for (;;) {
        const list = map.get(curKey);
        if (!list) break;
        let handle = -1;
        for (const h of list) {
          if (!used[h >> 1]) { handle = h; break; }
        }
        if (handle < 0) break;
        const sj = handle >> 1;
        const which = handle & 1;
        used[sj] = 1;
        const other = which === 0 ? segs[sj].b : segs[sj].a;
        if (forward) pts.push(other); else pts.unshift(other);
        curKey = which === 0 ? ends[sj * 2 + 1] : ends[sj * 2];
      }
    };
    for (let si = 0; si < segs.length; si += 1) {
      if (used[si]) continue;
      used[si] = 1;
      const pts = [segs[si].a, segs[si].b];
      extend(pts, ends[si * 2 + 1], true);
      extend(pts, ends[si * 2], false);
      if (pts.length < 4) continue;
      if (dist(pts[0], pts[pts.length - 1]) < cs * 1e-3) pts.pop();
      if (pts.length < 4) continue;
      const closedRun = pts.concat([pts[0]]);
      const simplified = simplifyTol > 0 ? simplifyRing(closedRun, simplifyTol) : closedRun;
      if (simplified.length < 4) continue;
      simplified.pop();
      loops.push(simplified);
    }
    return loops;
  };

  // ── Interior routing (every connector stays inside) ──────────────────────
  const segmentStaysInside = (field, rings, a, b, minDepth) => {
    const d = dist(a, b);
    const steps = Math.max(2, Math.ceil(d / (field.cs * 0.5)));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (sampleSdf(field, x, y) < minDepth) return false;
    }
    // Contract C2: endpoints AND midpoint confirmed by point-in-polygon. Quartiles
    // are checked too — a connector that escapes between the samples is exactly the
    // protrusion defect this module exists to kill.
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (!pointInRegion(x, y, rings)) return false;
    }
    return true;
  };

  /**
   * A connector from `from` to `to` that never leaves the region: a straight hop
   * when one validates, otherwise a 4-connected walk through interior cells
   * (adjacent inside cell centres, so each step is one cell long). Returns the
   * intermediate points, or null when nothing validates.
   */
  /**
   * The nearest grid cell belonging to `comp`. A ruling or scanline ends ON the
   * boundary, so the cell it rounds to is often just outside — without this the
   * route refuses to start and the pen lifts for no reason.
   */
  const snapToComponent = (field, lab, comp, p) => {
    const { nx, ny, inside, ox, oy, cs } = field;
    const ci = Math.round((p.x - ox) / cs);
    const cj = Math.round((p.y - oy) / cs);
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r <= 4; r += 1) {
      for (let dj = -r; dj <= r; dj += 1) {
        for (let di = -r; di <= r; di += 1) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
          const nk = nj * nx + ni;
          if (!inside[nk] || lab[nk] !== comp) continue;
          const d = di * di + dj * dj;
          if (d < bestD) { bestD = d; best = nk; }
        }
      }
      if (best >= 0) return best;
    }
    return best;
  };

  const routeInside = (field, rings, lab, comp, from, to, allowWalk) => {
    if (segmentStaysInside(field, rings, from, to, field.cs * 0.25)) return [];
    if (!allowWalk) return null;
    // Nearly every connector links two points a pitch apart, so search a window
    // around them first. An unwindowed flood over the whole grid, once per
    // scanline turn-around, is what made a large serpentine fill quadratic.
    const gap = dist(from, to);
    const near = walkBetween(field, rings, lab, comp, from, to, Math.max(8, Math.ceil((3 * gap) / field.cs)));
    if (near) return near;
    return walkBetween(field, rings, lab, comp, from, to, Infinity);
  };

  const walkBetween = (field, rings, lab, comp, from, to, pad) => {
    const start = snapToComponent(field, lab, comp, from);
    const goal = snapToComponent(field, lab, comp, to);
    if (start < 0 || goal < 0) return null;
    const { nx, ny, inside } = field;
    let winI0 = 0;
    let winI1 = nx - 1;
    let winJ0 = 0;
    let winJ1 = ny - 1;
    if (Number.isFinite(pad)) {
      const si = start % nx;
      const sj = (start - si) / nx;
      const gi = goal % nx;
      const gj = (goal - gi) / nx;
      winI0 = Math.max(0, Math.min(si, gi) - pad);
      winI1 = Math.min(nx - 1, Math.max(si, gi) + pad);
      winJ0 = Math.max(0, Math.min(sj, gj) - pad);
      winJ1 = Math.min(ny - 1, Math.max(sj, gj) + pad);
    }
    if (!field._prev || field._prev.length !== nx * ny) {
      field._prev = new Int32Array(nx * ny);
      field._stamp = new Int32Array(nx * ny);
      field._epoch = 0;
    }
    field._epoch += 1;
    const epoch = field._epoch;
    const prev = field._prev;
    const stamp = field._stamp;
    let head = 0;
    const queue = [start];
    stamp[start] = epoch;
    prev[start] = -1;
    let found = false;
    while (head < queue.length) {
      const c = queue[head];
      head += 1;
      if (c === goal) { found = true; break; }
      const ci = c % nx;
      const cj = (c - ci) / nx;
      const visit = (ni, nj) => {
        if (ni < winI0 || nj < winJ0 || ni > winI1 || nj > winJ1) return;
        const nk = nj * nx + ni;
        if (stamp[nk] === epoch || !inside[nk] || lab[nk] !== comp) return;
        stamp[nk] = epoch;
        prev[nk] = c;
        queue.push(nk);
      };
      visit(ci - 1, cj); visit(ci + 1, cj); visit(ci, cj - 1); visit(ci, cj + 1);
    }
    if (!found) return null;
    const walk = [];
    let c = goal;
    while (c >= 0) {
      walk.push(cellPoint(field, c));
      if (c === start) break;
      c = prev[c];
    }
    walk.reverse();
    // String-pull: keep only the vertices a validated straight hop cannot skip.
    // The search window is bounded — an unbounded pull is quadratic on the long
    // walks a crescent's cusp produces.
    const chain = [from].concat(walk, [to]);
    const pulled = [chain[0]];
    let i = 0;
    while (i < chain.length - 1) {
      const limit = Math.min(chain.length - 1, i + 48);
      let j = limit;
      while (j > i + 1 && !segmentStaysInside(field, rings, chain[i], chain[j], 0)) j -= 1;
      pulled.push(chain[j]);
      i = j;
    }
    return pulled.slice(1, -1);
  };

  // ── Piece order ───────────────────────────────────────────────────────────
  /**
   * Re-order pass pieces so consecutive ones are NEIGHBOURS, not merely the next
   * rung of the ladder.
   *
   * `contourPieces` emits every loop of level 0, then every loop of level 1, and
   * so on. That is the right ORDER for a lifting style and the wrong one for a
   * continuous style: a region with more than one lobe per level (any region with
   * a hole — the outer wall and each hole wall contour separately) makes the
   * level-major walk cross the whole region between consecutive pieces, and
   * `spiral` must ROUTE that crossing rather than lift, retracing ink already
   * down. Measured on a disc with three holes: overdraw 2.51 against concentric's
   * 1.22 from the very same rings.
   *
   * Greedy nearest-end, not containment nesting: in a distance field the level
   * ladder runs INWARD from the outer wall and OUTWARD from every hole, so
   * "the parent contains the child" is true on one side and false on the other.
   * Proximity is the one relation that is correct on both, and it is exactly the
   * quantity the connector pays for. Deterministic: ties break on the earlier
   * index, and the walk always starts at the first piece of the first level.
   */
  const SAMPLES_PER_PIECE = 64;
  const nearestOn = (pts, p) => {
    let best = pts[0];
    let bestD = Infinity;
    for (const q of pts) {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = q; }
    }
    return { pt: best, d2: bestD };
  };
  const orderByProximity = (pieces) => {
    const n = pieces.length;
    if (n < 3) return pieces.slice();
    // Sample each piece so the pairwise scan stays linear in PIECES, not in ring
    // length: a pass ring can be thousands of points and the ranking only needs
    // to know which piece is nearest. The scan is O(pieces² x samples), so the
    // sample budget drops as the piece count climbs — a coarser sample changes
    // which of two near-equal neighbours wins, never whether a far one does.
    const per = n > 400 ? 8 : SAMPLES_PER_PIECE;
    const samples = pieces.map((pc) => {
      const pts = pc.pts;
      const stride = Math.max(1, Math.floor(pts.length / per));
      const out = [];
      for (let i = 0; i < pts.length; i += stride) out.push(pts[i]);
      out.push(pts[pts.length - 1]);
      return out;
    });
    const used = new Uint8Array(n);
    const order = [];
    let cur = 0;
    used[0] = 1;
    order.push(pieces[0]);
    let end = pieces[0].closed ? pieces[0].pts[0] : pieces[0].pts[pieces[0].pts.length - 1];
    for (let step = 1; step < n; step += 1) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < n; i += 1) {
        if (used[i]) continue;
        const d = nearestOn(samples[i], end).d2;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) break;
      used[best] = 1;
      order.push(pieces[best]);
      cur = best;
      const pts = pieces[cur].pts;
      // A closed piece is entered at its nearest vertex and left there again, so
      // its exit point IS its entry point — found on the full ring, not on the
      // ranking samples, because `chainPieces` will enter at the exact vertex.
      end = pieces[cur].closed ? nearestOn(pts, end).pt : pts[pts.length - 1];
    }
    for (let i = 0; i < n; i += 1) if (!used[i]) order.push(pieces[i]);
    return order;
  };

  // ── Piece assembly ────────────────────────────────────────────────────────
  const rotateRing = (pts, at) => {
    if (at <= 0) return pts.slice();
    return pts.slice(at).concat(pts.slice(0, at));
  };

  const nearestIndex = (pts, p) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i += 1) {
      const d = (pts[i].x - p.x) ** 2 + (pts[i].y - p.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  /**
   * Morph the tail of `seq` onto `nextPts`. This is what makes `spiral` a true
   * spiral instead of stacked rings with a jump between them.
   *
   * EVERY morphed vertex is validated before it is kept. Both rings lie inside
   * the region, but the straight line between them need not — on a non-convex
   * region (a crescent) the lerp cuts the corner and leaves the form. That is
   * the protrusion defect this module exists to kill, arriving by a side door
   * that no connector check covered: a morphed vertex sat 0.556 mm outside the
   * crescent, seven tenths of a pen width, having passed through nothing.
   * A vertex that fails falls back to its un-morphed position, which is on a
   * contour and therefore inside by construction; the spiral simply tightens
   * onto the next ring a little later instead of leaving the paper.
   *
   * THE BLEND VACATES A STRIP, SO IT IS BOUNDED TWICE OVER.
   * Morphing pulls the path up to one `pitch` off its own contour. Everywhere
   * but the outermost pass that strip is already inked by the pass outside it,
   * so it costs nothing. On the OUTERMOST pass the strip's outer neighbour is
   * the region BOUNDARY, and vacating it leaves the region's own edge bare —
   * which is why `spiral` was the only style with gaps despite sharing
   * concentric's rings (measured 0.028 mm² against a 0.0225 mm² bar). The
   * outermost pass is therefore never blended (see `chainPieces`), and the
   * blend that does run is capped by ARC LENGTH rather than by a fraction of
   * the ring, so a long thin pass does not spend hundreds of millimetres
   * drifting off its contour.
   */
  const applyBlend = (seq, nextPts, field, rings, arcCap) => {
    const n = seq.length;
    let b = Math.max(2, Math.floor(n * BLEND_FRACTION));
    if (arcCap > 0) {
      let arc = 0;
      let k = 0;
      while (k < b && n - 1 - k > 0) {
        const a = seq[n - 1 - k];
        const c = seq[n - 2 - k];
        arc += Math.hypot(a.x - c.x, a.y - c.y);
        k += 1;
        if (arc >= arcCap) break;
      }
      b = Math.max(2, Math.min(b, k));
    }
    if (b >= n) return;
    let prev = seq[n - b - 1] || seq[0];
    for (let i = n - b; i < n; i += 1) {
      const w = (i - (n - b) + 1) / b;
      const np = nextPts[nearestIndex(nextPts, seq[i])];
      const cand = {
        x: seq[i].x + (np.x - seq[i].x) * w,
        y: seq[i].y + (np.y - seq[i].y) * w,
      };
      if (segmentStaysInside(field, rings, prev, cand, 0)) seq[i] = cand;
      prev = seq[i];
    }
  };

  /**
   * Chain pre-ordered pieces into paths.
   *   continuous — route around obstacles and never lift (spiral / serpentine).
   *   blend      — morph each closed ring onto the next (spiral).
   *   bridgeMax  — hop budget for the lifting styles.
   */
  const chainPieces = (pieces, field, rings, lab, comp, cfg) => {
    const paths = [];
    let cur = null;
    for (let idx = 0; idx < pieces.length; idx += 1) {
      const pc = pieces[idx];
      if (!pc || !Array.isArray(pc.pts) || pc.pts.length < 2) continue;
      const anchor = cur ? cur[cur.length - 1] : pc.pts[0];
      let seq;
      if (pc.closed) {
        seq = rotateRing(pc.pts, nearestIndex(pc.pts, anchor));
        const next = pieces[idx + 1];
        // Never blend a pass that has the region BOUNDARY on its outer side.
        const mayBlend = cfg.blend && !pc.outermost && next && next.closed && next.pts.length > 3;
        if (mayBlend) applyBlend(seq, next.pts, field, rings, cfg.blendArc);
        else seq.push({ x: seq[0].x, y: seq[0].y });
      } else {
        seq = pc.pts.slice();
        if (cur && dist(anchor, seq[seq.length - 1]) < dist(anchor, seq[0])) seq.reverse();
      }
      if (!cur) { cur = seq; continue; }
      const from = cur[cur.length - 1];
      const to = seq[0];
      const gap = dist(from, to);
      let link = null;
      if (gap <= field.cs * 0.25) link = [];
      else if (cfg.continuous || gap <= cfg.bridgeMax) {
        link = routeInside(field, rings, lab, comp, from, to, cfg.continuous);
        if (link && !cfg.continuous) {
          let routed = gap;
          if (link.length) {
            routed = dist(from, link[0]) + dist(link[link.length - 1], to);
            for (let i = 0; i + 1 < link.length; i += 1) routed += dist(link[i], link[i + 1]);
          }
          if (routed > cfg.bridgeMax) link = null;
        }
      }
      if (link) cur = cur.concat(link, seq);
      else { paths.push(cur); cur = seq; }
    }
    if (cur) paths.push(cur);
    return paths;
  };

  // ── Level ladders ─────────────────────────────────────────────────────────
  const componentMaxDepth = (field, lab, comp) => {
    let maxD = 0;
    const { sdf, inside } = field;
    for (let k = 0; k < sdf.length; k += 1) {
      if (!inside[k]) continue;
      if (lab && comp >= 0 && lab[k] !== comp) continue;
      if (sdf[k] > maxD) maxD = sdf[k];
    }
    return maxD;
  };

  /**
   * Pass depths, outermost first. The first pass sits at penWidth/2 MINUS one
   * cell: the sampled distance field carries up to half a cell of bias, and at
   * exactly penWidth/2 that bias is enough to leave the pen a hair short of the
   * boundary — which shows up as a one-sample rind of whitespace all the way
   * around the region. Every later pass is a clean `pitch` further in.
   */
  const ladder = (penWidth, pitch, maxDepth, maxLevels, cs) => {
    const levels = [];
    if (!(maxDepth > 0)) return levels;
    const first = Math.max(cs * 0.5, penWidth / 2 - cs);
    if (first > maxDepth) {
      // The region is nowhere as wide as the pen: one centreline pass, never a
      // sub-pen stroke and never a gap.
      return [maxDepth * 0.5];
    }
    let level = first;
    while (level <= maxDepth + EPS && levels.length < maxLevels) {
      levels.push(level);
      level = level === first ? penWidth / 2 + pitch : level + pitch;
    }
    // The ladder walks inward in whole `pitch` steps and stops at the last depth
    // that still fits, so whenever a lobe's half-width is not a whole number of
    // pitches the deepest point is left further than one pen RADIUS from the
    // innermost pass — a hairline of white straight down the lobe's spine. It
    // barely moves the coverage ratio, but it is a contiguous blob, which is the
    // thing T1's second assertion exists to catch. Add one terminal pass ON the
    // medial axis when the ladder falls short. Pulled a cell back off the peak:
    // marching squares needs a level the field actually straddles, and exactly
    // at the maximum no cell does.
    const last = levels[levels.length - 1];
    if (levels.length && levels.length < maxLevels && maxDepth - last > penWidth / 2 - cs) {
      const spine = Math.max(last + cs, maxDepth - cs);
      if (spine > last + EPS) levels.push(spine);
    }
    return levels;
  };

  /**
   * Which cells each level's contour can possibly cross, computed in ONE sweep.
   * Without this every level rescans the whole grid, and a scene-scale region at
   * a fine pen is hundreds of levels over a million cells — quadratic work for a
   * job that is linear.
   */
  const levelBuckets = (field, lab, comp, levels) => {
    const { nx, ny, sdf } = field;
    const n = levels.length;
    const buckets = [];
    for (let i = 0; i < n; i += 1) buckets.push([]);
    if (!n) return buckets;
    const last = levels[n - 1];
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        const k = j * nx + i;
        const v0 = sdf[k];
        const v1 = sdf[k + 1];
        const v2 = sdf[k + nx + 1];
        const v3 = sdf[k + nx];
        let lo = v0;
        let hi = v0;
        if (v1 < lo) lo = v1;
        if (v1 > hi) hi = v1;
        if (v2 < lo) lo = v2;
        if (v2 > hi) hi = v2;
        if (v3 < lo) lo = v3;
        if (v3 > hi) hi = v3;
        // A level crosses this cell only when lo < level < hi.
        if (hi <= levels[0] || lo >= last) continue;
        if (lab && comp >= 0
          && lab[k] !== comp && lab[k + 1] !== comp && lab[k + nx] !== comp && lab[k + nx + 1] !== comp) continue;
        // Binary search for the first level above `lo`, so a deep cell does not
        // walk past every shallower level.
        let a = 0;
        let b = n;
        while (a < b) {
          const mid = (a + b) >> 1;
          if (levels[mid] > lo) b = mid; else a = mid + 1;
        }
        for (let li = a; li < n && levels[li] < hi; li += 1) buckets[li].push(k);
      }
    }
    return buckets;
  };

  const contourPieces = (field, lab, comp, penWidth, pitch, maxLevels, tol) => {
    const levels = ladder(penWidth, pitch, componentMaxDepth(field, lab, comp), maxLevels, field.cs);
    const buckets = levelBuckets(field, lab, comp, levels);
    const pieces = [];
    for (let li = 0; li < levels.length; li += 1) {
      for (const loop of contourLoops(field, levels[li], lab, comp, tol, buckets[li])) {
        // `outermost` is the OUTSIDE pass of the region — the one with no
        // further pass between it and the boundary. `applyBlend` must leave it
        // alone; see the comment there.
        pieces.push({ pts: loop, closed: true, level: levels[li], outermost: li === 0 });
      }
    }
    return orderByProximity(pieces);
  };

  // ── contourParallel: true polygon-offset passes ───────────────────────────
  const resampleRing = (pts, step) => {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const d = dist(a, b);
      const k = Math.max(1, Math.round(d / step));
      for (let s = 0; s < k; s += 1) {
        const t = s / k;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  };

  /**
   * Which way this ring must be offset to move INTO the region: -1 to shrink its
   * own interior (an outer shell), +1 to grow it (a hole).
   *
   * Containment tests on a ring VERTEX are not safe — a crescent's outer circle
   * has vertices sitting inside the circle that cuts it, which classified the
   * shell as a hole and sent its outermost pass off the form entirely. Ask the
   * region directly instead: step a hair off several edges, toward the ring's own
   * interior, and see whether that side is region.
   */
  const ringOffsetSign = (ring, rings, eps) => {
    const n = ring.length;
    let area2 = 0;
    for (let i = 0; i < n; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      area2 += a.x * b.y - b.x * a.y;
    }
    const s = area2 > 0 ? 1 : -1;
    const step = Math.max(1, Math.floor(n / 32));
    let votes = 0;
    for (let i = 0; i < n; i += step) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const mag = Math.hypot(dx, dy);
      if (mag < EPS) continue;
      // miterOffsetClosedRing's outward normal for this winding; step the other way.
      const ox = (s * dy) / mag;
      const oy = (-s * dx) / mag;
      const mx = (a.x + b.x) / 2 - ox * eps;
      const my = (a.y + b.y) / 2 - oy * eps;
      votes += pointInRegion(mx, my, rings) ? 1 : -1;
    }
    return votes >= 0 ? -1 : 1;
  };

  const offsetPieces = (field, lab, comp, rings, penWidth, pitch, maxLevels, tol, opts) => {
    const GU = geometryUtils(opts);
    if (!GU || typeof GU.miterOffsetClosedRing !== 'function') {
      return contourPieces(field, lab, comp, penWidth, pitch, maxLevels, tol);
    }
    const levels = ladder(penWidth, pitch, componentMaxDepth(field, lab, comp), maxLevels, field.cs);
    const signs = rings.map((ring) => ringOffsetSign(ring, rings, field.cs));
    const pieces = [];
    for (const level of levels) {
      for (let ri = 0; ri < rings.length; ri += 1) {
        const delta = signs[ri] * level;
        let off = null;
        try {
          off = GU.miterOffsetClosedRing(rings[ri], delta, { miterLimit: 8, round: true });
        } catch (_) { off = null; }
        const ring = cleanRing(off);
        if (!ring) continue;
        const dense = resampleRing(ring, field.cs);
        // An inward offset self-intersects wherever the region is thinner than
        // 2*level; those points fall closer to the boundary than `level`, so the
        // distance field prunes them without needing a boolean library.
        const keepTol = field.cs * 2;
        const runs = [];
        let run = [];
        for (const p of dense) {
          const k = cellIndex(field, p.x, p.y);
          const ok = k >= 0 && field.inside[k] && (!lab || comp < 0 || lab[k] === comp)
            && sampleSdf(field, p.x, p.y) >= level - keepTol;
          if (ok) run.push(p);
          else if (run.length) { runs.push(run); run = []; }
        }
        if (run.length) runs.push(run);
        // A ring that survived whole is closed; splice a wrapped pair back together.
        if (runs.length === 1 && runs[0].length === dense.length) {
          const loop = simplifyRing(runs[0].concat([runs[0][0]]), tol);
          loop.pop();
          // Three points is a legitimate closed pass (a triangular offset of a
          // taper); demanding four silently dropped the whole outermost ring.
          if (loop.length >= 3) pieces.push({ pts: loop, closed: true, level, outermost: level === levels[0] });
          continue;
        }
        if (runs.length > 1) {
          const first = runs[0];
          const last = runs[runs.length - 1];
          if (first[0] === dense[0] && last[last.length - 1] === dense[dense.length - 1]) {
            runs[runs.length - 1] = last.concat(first);
            runs.shift();
          }
        }
        for (const r of runs) {
          if (r.length < 2) continue;
          const simplified = simplifyRing(r, tol);
          if (simplified.length < 2) continue;
          pieces.push({ pts: simplified, closed: false, level, outermost: level === levels[0] });
        }
      }
    }
    pieces.sort((a, b) => a.level - b.level);
    return orderByProximity(pieces);
  };

  // ── serpentine: perimeter + boustrophedon ────────────────────────────────
  const principalAxis = (field, lab, comp) => {
    const { nx, inside } = field;
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < inside.length; k += 1) {
      if (!inside[k] || (lab && comp >= 0 && lab[k] !== comp)) continue;
      const i = k % nx;
      const j = (k - i) / nx;
      sx += i; sy += j; n += 1;
    }
    if (!n) return { x: 1, y: 0 };
    const mx = sx / n;
    const my = sy / n;
    let cxx = 0;
    let cxy = 0;
    let cyy = 0;
    for (let k = 0; k < inside.length; k += 1) {
      if (!inside[k] || (lab && comp >= 0 && lab[k] !== comp)) continue;
      const i = k % nx;
      const j = (k - i) / nx;
      const dx = i - mx;
      const dy = j - my;
      cxx += dx * dx; cxy += dx * dy; cyy += dy * dy;
    }
    const tr = cxx + cyy;
    const det = cxx * cyy - cxy * cxy;
    const disc = Math.max(0, (tr * tr) / 4 - det);
    const l1 = tr / 2 + Math.sqrt(disc);
    let ax = cxy;
    let ay = l1 - cxx;
    if (Math.hypot(ax, ay) < 1e-9) { ax = cxx >= cyy ? 1 : 0; ay = cxx >= cyy ? 0 : 1; }
    const mag = Math.hypot(ax, ay) || 1;
    return { x: ax / mag, y: ay / mag };
  };

  const serpentinePieces = (field, lab, comp, rings, penWidth, pitch, tol, opts) => {
    const pieces = [];
    // Perimeter first — scanlines alone leave an uncovered lune against any
    // boundary that runs nearly parallel to them.
    const maxDepth = componentMaxDepth(field, lab, comp);
    const perimLevel = Math.min(Math.max(field.cs * 0.5, penWidth / 2 - field.cs), Math.max(maxDepth * 0.5, field.cs));
    for (const loop of contourLoops(field, perimLevel, lab, comp, tol)) {
      pieces.push({ pts: loop, closed: true });
    }
    let axis = opts && opts.axis ? asPoint(opts.axis) : null;
    if (axis) {
      const mag = Math.hypot(axis.x, axis.y);
      axis = mag > 1e-9 ? { x: axis.x / mag, y: axis.y / mag } : null;
    }
    if (!axis) axis = principalAxis(field, lab, comp);
    const bx = -axis.y;
    const by = axis.x;
    // Extent of this component along the scan-normal.
    let vMin = Infinity;
    let vMax = -Infinity;
    const { nx, inside } = field;
    for (let k = 0; k < inside.length; k += 1) {
      if (!inside[k] || lab[k] !== comp) continue;
      const i = k % nx;
      const j = (k - i) / nx;
      const x = field.ox + i * field.cs;
      const y = field.oy + j * field.cs;
      const v = x * bx + y * by;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    if (!isNum(vMin)) return pieces;
    const span = vMax - vMin;
    const lines = Math.max(1, Math.floor(span / pitch) + 1);
    const start = vMin + (span - (lines - 1) * pitch) / 2;
    // Ring edges in (u,v) so a scanline is a horizontal line in v.
    const rot = rings.map((ring) => ring.map((p) => ({
      u: p.x * axis.x + p.y * axis.y,
      v: p.x * bx + p.y * by,
    })));
    const us = [];
    for (let li = 0; li < lines; li += 1) {
      const v = start + li * pitch;
      us.length = 0;
      for (const ring of rot) {
        const n = ring.length;
        for (let i = 0; i < n; i += 1) {
          const a = ring[i];
          const c = ring[(i + 1) % n];
          if ((a.v <= v) === (c.v <= v)) continue;
          const t = (v - a.v) / (c.v - a.v);
          us.push(a.u + t * (c.u - a.u));
        }
      }
      if (us.length < 2) continue;
      us.sort((p, q) => p - q);
      const spans = [];
      for (let m = 0; m + 1 < us.length; m += 2) {
        const u0 = us[m];
        const u1 = us[m + 1];
        if (u1 - u0 < field.cs * 0.5) continue;
        const midU = (u0 + u1) / 2;
        const mx = midU * axis.x + v * bx;
        const my = midU * axis.y + v * by;
        const k = cellIndex(field, mx, my);
        if (k < 0 || !field.inside[k] || lab[k] !== comp) continue;
        spans.push([u0, u1]);
      }
      if (!spans.length) continue;
      if (li % 2 === 1) spans.reverse();
      for (const [u0, u1] of spans) {
        const a = li % 2 === 1 ? u1 : u0;
        const b = li % 2 === 1 ? u0 : u1;
        pieces.push({
          pts: [
            { x: a * axis.x + v * bx, y: a * axis.y + v * by },
            { x: b * axis.x + v * bx, y: b * axis.y + v * by },
          ],
          closed: false,
        });
      }
    }
    return pieces;
  };

  // ── Coverage measurement + repair ────────────────────────────────────────
  /**
   * Ink `paths` into `covered` with a pen of `radius`. The stamp is EXACT (true
   * squared distance to each segment), not a rasterized centreline dilated by a
   * distance transform: that shortcut over-reports by up to a cell diagonal,
   * which is precisely the width of the slivers this module has to find. The
   * mask accumulates, so each repair round only stamps what it just added.
   */
  const stampPaths = (field, covered, paths, radius) => {
    const { nx, ny, ox, oy, cs, inside } = field;
    const r2 = radius * radius;
    for (const path of paths) {
      for (let s = 0; s + 1 < path.length; s += 1) {
        const ax = path[s].x;
        const ay = path[s].y;
        const bx = path[s + 1].x;
        const by = path[s + 1].y;
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let i0 = Math.floor(((ax < bx ? ax : bx) - radius - ox) / cs);
        let i1 = Math.ceil(((ax > bx ? ax : bx) + radius - ox) / cs);
        let j0 = Math.floor(((ay < by ? ay : by) - radius - oy) / cs);
        let j1 = Math.ceil(((ay > by ? ay : by) + radius - oy) / cs);
        if (i0 < 0) i0 = 0;
        if (j0 < 0) j0 = 0;
        if (i1 > nx - 1) i1 = nx - 1;
        if (j1 > ny - 1) j1 = ny - 1;
        for (let j = j0; j <= j1; j += 1) {
          const py = oy + j * cs - ay;
          const base = j * nx;
          for (let i = i0; i <= i1; i += 1) {
            const k = base + i;
            if (covered[k] || !inside[k]) continue;
            const px = ox + i * cs - ax;
            let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0;
            if (t < 0) t = 0; else if (t > 1) t = 1;
            const ex = px - dx * t;
            const ey = py - dy * t;
            if (ex * ex + ey * ey <= r2) covered[k] = 1;
          }
        }
      }
    }
    return covered;
  };

  const measureCoverage = (field, paths, radius) => {
    const covered = stampPaths(field, new Uint8Array(field.nx * field.ny), paths, radius);
    let total = 0;
    let hit = 0;
    for (let k = 0; k < field.inside.length; k += 1) {
      if (!field.inside[k]) continue;
      total += 1;
      if (covered[k]) hit += 1;
    }
    return total ? hit / total : 0;
  };

  const uncoveredBlobs = (field, lab, comp, covered, minArea) => {
    const { nx, ny, inside, cs } = field;
    const seen = new Uint8Array(nx * ny);
    const cellArea = cs * cs;
    const blobs = [];
    const stack = [];
    for (let k0 = 0; k0 < inside.length; k0 += 1) {
      if (!inside[k0] || covered[k0] || seen[k0] || lab[k0] !== comp) continue;
      seen[k0] = 1;
      stack.length = 0;
      stack.push(k0);
      const cells = [];
      while (stack.length) {
        const c = stack.pop();
        cells.push(c);
        const ci = c % nx;
        const cj = (c - ci) / nx;
        const visit = (ni, nj) => {
          if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) return;
          const nk = nj * nx + ni;
          if (seen[nk] || !inside[nk] || covered[nk] || lab[nk] !== comp) return;
          seen[nk] = 1;
          stack.push(nk);
        };
        visit(ci - 1, cj); visit(ci + 1, cj); visit(ci, cj - 1); visit(ci, cj + 1);
      }
      if (cells.length * cellArea >= minArea) blobs.push(cells);
    }
    return blobs;
  };

  /** Contour the blob itself: rings through its own distance field, so a thin
   *  sliver degenerates to a centreline loop and a fat one gets a small ladder. */
  const repairPiecesFor = (field, cells, penWidth, pitch, tol) => {
    const { nx, cs } = field;
    let minI = Infinity;
    let maxI = -Infinity;
    let minJ = Infinity;
    let maxJ = -Infinity;
    for (const k of cells) {
      const i = k % nx;
      const j = (k - i) / nx;
      if (i < minI) minI = i;
      if (i > maxI) maxI = i;
      if (j < minJ) minJ = j;
      if (j > maxJ) maxJ = j;
    }
    const pad = 2;
    const sx = minI - pad;
    const sy = minJ - pad;
    const snx = (maxI - minI) + 1 + pad * 2;
    const sny = (maxJ - minJ) + 1 + pad * 2;
    const sub = {
      nx: snx,
      ny: sny,
      ox: field.ox + sx * cs,
      oy: field.oy + sy * cs,
      cs,
      inside: new Uint8Array(snx * sny),
    };
    for (const k of cells) {
      const i = k % nx;
      const j = (k - i) / nx;
      sub.inside[(j - sy) * snx + (i - sx)] = 1;
    }
    finishField(sub);
    let maxD = 0;
    for (let k = 0; k < sub.sdf.length; k += 1) if (sub.sdf[k] > maxD) maxD = sub.sdf[k];
    if (!(maxD > 0)) return [];
    const levels = [];
    let level = Math.min(penWidth / 2, maxD * 0.5);
    if (!(level > 0)) level = maxD * 0.5;
    while (level <= maxD + EPS && levels.length < 64) {
      levels.push(level);
      level += pitch;
    }
    const pieces = [];
    for (const lv of levels) {
      for (const loop of contourLoops(sub, lv, null, -1, tol)) {
        pieces.push({ pts: loop, closed: true, level: lv });
      }
    }
    return pieces;
  };

  // ── Public entry point ───────────────────────────────────────────────────
  const fillRegion = (region, penWidth, style, opts = {}) => {
    const empty = { paths: [], coverage: 0, components: 0 };
    const rings = normalizeRegion(region);
    const pen = Number(penWidth);
    if (!rings.length || !isNum(pen) || pen <= 0) return empty;

    const overlap = isNum(Number(opts.overlap)) ? Math.min(0.6, Math.max(0, Number(opts.overlap))) : DEFAULT_OVERLAP;
    // PITCH IS DERIVED, NOT CHOSEN. There is no density parameter.
    const pitch = pen * (1 - overlap);
    if (!(pitch > 0)) return empty;
    const mode = STYLES.indexOf(style) >= 0 ? style : 'spiral';
    const maxPaths = isNum(Number(opts.maxPaths)) && Number(opts.maxPaths) > 0
      ? Math.floor(Number(opts.maxPaths))
      : 20000;

    // Resolution: penWidth/10, coarsened only to respect the cell budget.
    const b = regionBounds(rings);
    let cs = pen / CELLS_PER_PEN;
    const spanX = Math.max(cs, b.maxX - b.minX);
    const spanY = Math.max(cs, b.maxY - b.minY);
    const cells = ((spanX / cs) + 7) * ((spanY / cs) + 7);
    if (cells > MAX_CELLS) cs *= Math.sqrt(cells / MAX_CELLS);

    const field = buildField(rings, cs);
    if (!field) return empty;
    let anyInside = false;
    for (let k = 0; k < field.inside.length; k += 1) if (field.inside[k]) { anyInside = true; break; }
    if (!anyInside) return empty;

    const { lab, areas } = labelComponents(field);
    const tol = cs * 0.25;
    const continuous = mode === 'spiral' || mode === 'serpentine';
    const cfg = {
      continuous,
      blend: mode === 'spiral',
      // How far along a pass the morph onto the next one may run. Long enough
      // that a `pitch` of lateral movement is a gentle drift, short enough that
      // it cannot wander a whole ring off contour.
      blendArc: pitch * BLEND_ARC_PITCHES,
      bridgeMax: pitch * BRIDGE_LIMIT_PITCHES,
    };
    const maxLevels = Math.max(1, Math.min(4000, maxPaths));
    const repairPen = pen * REPAIR_PEN_SAFETY;
    // How small a hole the repair pass still bothers with. Tied to the CELL, not
    // to the pen: a pen-relative floor scales up with the nib, and at a broad
    // one it retired before the job was done — a 3.5 mm pen on the crescent left
    // seven cells of cusp residue spread over blobs of four cells each, every
    // one of them under a pen-relative floor, and the module's own coverage
    // reported 99.69%. Anything the raster can actually resolve is worth a pass.
    const minBlobArea = field.cs * field.cs * 1.5;
    // Flecks shed by the rasterizer at sharp points are folded into the body
    // they were cut from; see `mergeFlecks`.
    const live = mergeFlecks(field, lab, areas);

    const out = [];
    for (const comp of live) {
      let pieces;
      if (mode === 'serpentine') pieces = serpentinePieces(field, lab, comp, rings, pen, pitch, tol, opts);
      else if (mode === 'contourParallel') pieces = offsetPieces(field, lab, comp, rings, pen, pitch, maxLevels, tol, opts);
      else pieces = contourPieces(field, lab, comp, pen, pitch, maxLevels, tol);

      let paths = chainPieces(pieces, field, rings, lab, comp, cfg);

      // Close the loop on our own output: the residual whitespace of any pitched
      // fill collects on the medial axis and in cusps, where the ladder runs out
      // before the local maximum. Measure, repair, re-measure. The mask is
      // cumulative — each round only stamps the passes it just added.
      const covered = new Uint8Array(field.nx * field.ny);
      stampPaths(field, covered, paths, repairPen / 2);
      for (let round = 0; round < MAX_REPAIR_ROUNDS; round += 1) {
        const blobs = uncoveredBlobs(field, lab, comp, covered, minBlobArea);
        if (!blobs.length) break;
        const repair = [];
        for (const cellsOfBlob of blobs) {
          for (const piece of repairPiecesFor(field, cellsOfBlob, pen, pitch, tol)) repair.push(piece);
        }
        if (!repair.length) break;
        // The repair pass is chained WITHOUT continuous routing even for a
        // continuous style: repair blobs are scattered residue, and routing
        // between them is a walk across the whole region. They are spliced into
        // the main stroke below instead, which is both shorter and still one
        // pen-down.
        const ordered = orderByProximity(repair);
        const added = chainPieces(ordered, field, rings, lab, comp,
          { ...cfg, blend: false, continuous: false });
        if (continuous && paths.length) {
          // STAY ONE STROKE, BUT PAY THE SHORT PRICE.
          //
          // Hanging each repair segment off the END of the path used to cost a
          // routed walk from wherever the spiral finished to wherever the blob
          // is — measured on a disc with three holes: 150 repair segments, 457 mm
          // of connector against 1130 mm of actual passes. A repair blob is by
          // construction within about one pitch of a pass that is ALREADY drawn,
          // so splicing a there-and-back detour in at the nearest point of the
          // existing stroke costs ~2 pitches instead of ~2 radii of the region,
          // and the stroke stays a single unbroken path.
          for (const seg of added) {
            let bi = -1;
            let bj = -1;
            let bd = Infinity;
            for (let pi = 0; pi < paths.length; pi += 1) {
              const pth = paths[pi];
              for (let qi = 0; qi < pth.length; qi += 1) {
                const dx = pth[qi].x - seg[0].x;
                const dy = pth[qi].y - seg[0].y;
                const dd = dx * dx + dy * dy;
                if (dd < bd) { bd = dd; bi = pi; bj = qi; }
              }
            }
            const host = bi >= 0 ? paths[bi] : null;
            const anchor = host ? host[bj] : null;
            const out2 = anchor ? routeInside(field, rings, lab, comp, anchor, seg[0], true) : null;
            const back = anchor
              ? routeInside(field, rings, lab, comp, seg[seg.length - 1], anchor, true) : null;
            if (host && out2 && back) {
              paths[bi] = host.slice(0, bj + 1).concat(out2, seg, back, host.slice(bj));
            } else {
              const from = paths[paths.length - 1][paths[paths.length - 1].length - 1];
              const link = routeInside(field, rings, lab, comp, from, seg[0], true);
              if (link) paths[paths.length - 1] = paths[paths.length - 1].concat(link, seg);
              else paths.push(seg);
            }
          }
        } else {
          paths = paths.concat(added);
        }
        stampPaths(field, covered, added, repairPen / 2);
      }

      for (const path of paths) if (path.length >= 2) out.push(path);
      if (out.length > maxPaths) break;
    }

    const coverage = measureCoverage(field, out, pen / 2);
    // `components` is additive to contract C2's { paths, coverage }: it is the
    // number of connected regions worth filling that the clip left behind, and
    // it is the number the single-stroke styles are allowed to return. Coverage
    // is still measured over the WHOLE region, discarded flecks included, so
    // dropping one can never flatter the number.
    return { paths: out, coverage, components: live.length };
  };

  const api = { fillRegion, DEFAULT_OVERLAP, STYLES };

  if (typeof window !== 'undefined') {
    const Vectura = (window.Vectura = window.Vectura || {});
    Vectura.PenFill = { ...(Vectura.PenFill || {}), ...api };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
