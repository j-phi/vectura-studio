/*
 * An oracle for G3.occludeRowsFloatingHorizon — "did any ink end up INSIDE geometry
 * it is supposed to be behind?"
 *
 * WHY NOT REUSE THE RASTER-PLANE ORACLE. That one asks point-in-closed-polygon
 * against a curtain. Terrain's occluders are not closed polygons — they are open
 * profile polylines that feed an upper/lower BAND per screen column, and a single
 * such row's band is degenerate (upper == lower). Point-in-polygon against them
 * measures nothing. So this oracle rebuilds the algorithm's OWN model — but exactly:
 *
 *   up(x) = min, over every strictly-nearer occluder row, of that row's y at x
 *   lo(x) = max, over the same rows
 *   HIDDEN  iff  up(x) < y < lo(x)          <- strict. no tolerance. no "don't care".
 *
 * The implementation computes the same band, but rasterised onto a column grid (pitch
 * `columnResolution`), which rounds the silhouette by a fraction of a column. This
 * oracle evaluates the rows continuously, so it has NO rounding of its own: the
 * residue it reports at eps=0 IS the implementation's rasterisation floor, and it is
 * sub-pixel. It is deliberately reported, not subtracted — a metric that subtracts its
 * own floor can no longer tell you where the floor is.
 *
 * WHAT IS MEASURED. Ink, not distance. `overLen` is the arclength of emitted path that
 * lies strictly inside the band — i.e. how much wrong ink you would actually see. A
 * metric that instead marched along the line to the nearest border wildly over-reports
 * at grazing angles; this one cannot, because a whisker's length is a whisker's length.
 *
 * CAPTURING. Terrain MUTATES the array the occluder returns (fit-to-canvas rewrites
 * every point in place, after occlusion). Read it back after generate() and you are
 * comparing post-transform points against pre-transform rows — garbage that looks like
 * a catastrophic failure. captureHorizon() therefore deep-clones both sides at the
 * moment of the call.
 */

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const plen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]); return L; };

const resample = (pts, step) => {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = (i === 0 ? 0 : 1); k <= n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
};

// Continuous (un-rasterised) upper/lower horizon over the rows added so far.
class ExactHorizon {
  constructor(minX, maxX) {
    this.minX = minX;
    this.binW = 2;
    this.nbins = Math.max(1, Math.ceil((maxX - minX) / this.binW) + 1);
    this.bins = Array.from({ length: this.nbins }, () => []);
  }

  bin(x) {
    return Math.max(0, Math.min(this.nbins - 1, Math.floor((x - this.minX) / this.binW)));
  }

  addRow(pts) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const seg = { ax: a.x, ay: a.y, bx: b.x, by: b.y };
      const lo = this.bin(Math.min(a.x, b.x));
      const hi = this.bin(Math.max(a.x, b.x));
      for (let k = lo; k <= hi; k++) this.bins[k].push(seg);
    }
  }

  // Every y at which any stored row crosses this x; min and max of them.
  query(x) {
    let up = Infinity, lo = -Infinity;
    for (const s of this.bins[this.bin(x)]) {
      if (x < Math.min(s.ax, s.bx) || x > Math.max(s.ax, s.bx)) continue;
      const dx = s.bx - s.ax;
      if (Math.abs(dx) < 1e-9) {
        up = Math.min(up, s.ay, s.by);
        lo = Math.max(lo, s.ay, s.by);
      } else {
        const y = s.ay + (s.by - s.ay) * ((x - s.ax) / dx);
        if (y < up) up = y;
        if (y > lo) lo = y;
      }
    }
    return [up, lo];
  }
}

/*
 * rows    — exactly what was handed to occludeRowsFloatingHorizon (raw screen space)
 * emitted — exactly what it returned (same space; each path carries .meta.depth)
 * angle   — opts.angle (roll, radians); rows are de-rolled before the band is taken
 *
 * Returns, all in raw projected px:
 *   overLen   total emitted ink strictly inside the band  (the defect: protrusion)
 *   maxRun    longest single contiguous stretch of it     (the visible whisker)
 *   runs      how many such stretches reach >= 1px
 *   maxPen    deepest any sample sits inside the band
 *   ink       total emitted ink        }  model-free stipple / collapse signals:
 *   paths     emitted path count       }  over-occlusion shatters runs and drops ink,
 *   fragments emitted paths under 2px  }  and these three see that without an oracle
 */
const measureHorizon = (rows, emitted, angle = 0, opts = {}) => {
  const step = opts.sampleStep || 0.5;
  const cs = Math.cos(angle), sn = Math.sin(angle);
  const deRoll = (p) => ({ x: p.x * cs + p.y * sn, y: -p.x * sn + p.y * cs });

  const valid = (rows || [])
    .filter((r) => r && Array.isArray(r.pts))
    .map((r) => ({
      depth: Number.isFinite(r.depth) ? r.depth : 0,
      occludes: r.occludes !== false,
      draw: r.draw !== false,
      pts: r.pts.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map(deRoll),
    }))
    .filter((r) => r.pts.length >= 2);
  if (!valid.length) return { overLen: 0, maxRun: 0, runs: 0, maxPen: 0, ink: 0, paths: 0, fragments: 0 };

  let minX = Infinity, maxX = -Infinity;
  valid.forEach((r) => r.pts.forEach((p) => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }));

  // The algorithm's own near->far order: largest depth first, ties keep input order.
  const order = valid.map((_, i) => i).sort((a, b) => (valid[b].depth - valid[a].depth) || (a - b));

  const byDepth = new Map();
  (emitted || []).forEach((p) => {
    const d = p.meta && Number.isFinite(p.meta.depth) ? p.meta.depth : null;
    if (d === null) return;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(p);
  });

  const H = new ExactHorizon(minX, maxX);
  let overLen = 0, maxRun = 0, runs = 0, maxPen = 0, ink = 0, paths = 0, fragments = 0;

  for (const oi of order) {
    const r = valid[oi];
    if (r.draw) {
      for (const path of (byDepth.get(r.depth) || [])) {
        const pts = path.map(deRoll);
        paths++;
        const L = plen(pts);
        ink += L;
        if (L < 2) fragments++;

        let run = 0, wasIn = false, prev = null;
        for (const s of resample(pts, step)) {
          const [up, lo] = H.query(s.x);
          const inside = s.y > up && s.y < lo;
          const d = prev ? dist(prev, s) : 0;
          if (inside) {
            maxPen = Math.max(maxPen, Math.min(s.y - up, lo - s.y));
            const w = d * (wasIn ? 1 : 0.5); // half-step credit on the sample that enters
            overLen += w;
            run += w;
          } else if (wasIn) {
            overLen += d * 0.5;
            run += d * 0.5;
            maxRun = Math.max(maxRun, run);
            if (run >= 1) runs++;
            run = 0;
          }
          wasIn = inside;
          prev = s;
        }
        if (wasIn) {
          maxRun = Math.max(maxRun, run);
          if (run >= 1) runs++;
        }
      }
    }
    if (r.occludes) H.addRow(r.pts);
  }

  return { overLen, maxRun, runs, maxPen, ink, paths, fragments };
};

/*
 * Run `fn` with the occluder wrapped, and hand back a deep-cloned snapshot of what
 * went in and what came out. Cloning is not politeness: terrain rewrites the returned
 * points in place a few lines later.
 */
const captureHorizon = (G3, fn) => {
  const orig = G3.occludeRowsFloatingHorizon;
  const calls = [];
  G3.occludeRowsFloatingHorizon = (rows, opts) => {
    const out = orig(rows, opts);
    calls.push({
      opts,
      rows: (rows || []).map((r) => ({ ...r, pts: r.pts.map((p) => ({ x: p.x, y: p.y })) })),
      emitted: (out || []).map((p) => {
        const c = p.map((q) => ({ x: q.x, y: q.y }));
        c.meta = p.meta;
        return c;
      }),
    });
    return out;
  };
  try {
    fn();
  } finally {
    G3.occludeRowsFloatingHorizon = orig;
  }
  return calls;
};

// Convenience: capture + measure the (single) horizon call made by `fn`.
const probeHorizon = (G3, fn, opts) => {
  const calls = captureHorizon(G3, fn);
  if (!calls.length) throw new Error('occludeRowsFloatingHorizon was never called — occlusion off, or not a free-3d pose');
  const c = calls[0];
  return { ...measureHorizon(c.rows, c.emitted, c.opts.angle || 0, opts), eps: c.opts.eps, rowCount: c.rows.length };
};

module.exports = { measureHorizon, captureHorizon, probeHorizon };
