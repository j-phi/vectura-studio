/**
 * Ink renderer (pen models + ink edge bleed) — window.Vectura.InkRenderer.
 *
 * Draws strokes the way a real pen lays ink on paper: lumpy edges at the
 * paper-grain scale, bulbous pen-down blobs and lift pools, swelling at
 * corners, gel skips, width wobble, per-pen opacity and overlap darkening.
 * Preview only: export geometry is never touched (SVG plots pen.width).
 *
 * How (a filled "ribbon" per path, cached):
 *   1. Flatten the path in document mm through a proxy ctx handed to the same
 *      tracer the canvas uses (PathDraw / traceCircle), so curves match.
 *   2. Sample it every ds mm, ds = 1.5 px at a power-of-two px/mm bucket
 *      (floored near the edge-noise scale): coarse samples are a subset of
 *      finer ones, so zooming only refines the outline.
 *   3. Per sample: half-widths rL / rR = laid width/2 × jitter × nib ×
 *      starvation × skip + blob / pool swellings + edgeAmp × edge noise.
 *      The edge noise is 1-D value+gradient noise along the ARC LENGTH, one
 *      stream per side, offset by a hash of the path's start point in mm and
 *      seeded by paper seed × pen id: deterministic, sheet-locked, identical
 *      at every zoom and pan; periodic over the length of a closed path (no
 *      step at its start). Skips thin the line to a ragged streak.
 *   4. Emit one outline polygon per smooth run (left side forward, right side
 *      back), triangles where the inside of a tight turn folds, and discs for
 *      round ends / corners. Every shape has the same winding, so a nonzero
 *      fill is their exact union.
 *
 * LOD, three tiers decided per pen per frame: 0 a native ctx.stroke at the
 * laid width; 1 skeleton (native stroke, thinned at skips, + pool discs) when
 * only pools are visible; 2 the ribbon once edge lumps reach LIMITS.ribbonPx
 * device px. During a pan / pinch a pen never drops a tier.
 *
 * Cache: WeakMap(path → Map(key → entry)), key = traits hash | ds | weight;
 * geometry kept as Float64Array commands (+ Path2D when available); LRU
 * capped at LIMITS.ribbonCacheBytes (grows to 1.5× the drawn set, hard cap
 * ribbonHardBytes); entries drawn this frame are pinned. A frame builds exact
 * ribbons for LIMITS.buildBudgetMs, then coarse (ds × 4) ones, then falls back
 * to the nearest cached bucket or the native stroke and refines on idle in
 * time slices, repainting once through onReady. Nothing is scheduled when the
 * cache covers the view (no idle re-render).
 *
 * Drawing: runs of one pen's paths are drawn straight into the caller's canvas
 * in layer order (beginFrame → drawRun … → endFrame), so plain and model pens
 * stack correctly and no per-pen scratch canvas is needed.
 *
 * API
 *   tierFor(traits, pxPerMm, prevTier?, gesture?) -> 0 | 1 | 2
 *   dsFor(traits, pxPerMm) -> sample spacing (mm)
 *   flatten(path, useCurves, trace?) -> { subs: [Float64Array], bbox, length }
 *   buildRibbon(flat, traits, ds, weightScale) / buildSkeleton(flat, traits, ws)
 *   replay(target, cmds, mode)   moveTo/lineTo/arc/closePath into a ctx or Path2D
 *   beginFrame(), drawRun(ctx, items, traits, env, opts), endFrame(onReady)
 *   renderCollected(plan, host)  one-frame convenience wrapper
 *   drawSample(canvas, pen, paper, opts) model-picker thumbnail
 *   clearCache(), cacheStats(), flush()
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const LIM = () => (Vectura.PEN_MODELS && Vectura.PEN_MODELS.LIMITS) || {};
  const now = () => (G.performance && typeof G.performance.now === 'function' ? G.performance.now() : Date.now());
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---- hashing / noise ------------------------------------------------------

  const hash3 = (a, b, c) => {
    let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
    h ^= Math.imul((b | 0) + 0x632be59b, 0xc2b2ae35);
    h ^= Math.imul((c | 0) ^ 0x27d4eb2f, 0x165667b1);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  };
  const qmm = (v) => Math.round(v * 100) | 0;

  // Value-noise fallback when PaperTexture is not loaded (headless tests).
  const valueNoise = (seed) => (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y);
    const fx = x - xi; const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
    const v = (i, j) => hash3(seed, xi + i, yi + j) * 2 - 1;
    const a = v(0, 0) + (v(1, 0) - v(0, 0)) * sx;
    const b = v(0, 1) + (v(1, 1) - v(0, 1)) * sx;
    return a + (b - a) * sy;
  };
  const noiseCache = new Map();
  const noiseFor = (seed) => {
    const key = seed >>> 0;
    let fn = noiseCache.get(key);
    if (fn) return fn;
    const PT = Vectura.PaperTexture;
    fn = PT && typeof PT.noise2 === 'function' ? PT.noise2(key) : valueNoise(key);
    if (noiseCache.size > 64) noiseCache.delete(noiseCache.keys().next().value);
    noiseCache.set(key, fn);
    return fn;
  };

  // ---- LOD ------------------------------------------------------------------

  // On-sheet size (mm) of what differs from a plain round stroke: the edge
  // (lumps, width wobble, nib) and the pools (blobs, lift pools, corners).
  const edgeMm = (t) => Math.max(t.edgeAmpMm, t.jitter * t.laidW * 0.5, t.nib ? t.nib.strength * t.laidW * 0.5 : 0);
  const poolMm = (t) => Math.max(t.startBlobP > 0 ? t.startBlobMm : 0, t.endPoolMm, t.cornerPool * t.laidW * 0.3);
  const featureMm = (t) => Math.max(edgeMm(t), poolMm(t));

  // LOD tier: 0 native stroke, 1 skeleton (native stroke split at skips +
  // pool discs: the edge is still sub-pixel), 2 ribbon (visible edge).
  // During a pan / pinch a pen never drops to a lower tier (no popping).
  const tierFor = (t, pxPerMm, prevTier = 0, gesture = false) => {
    if (!t) return 0;
    const L = LIM();
    let tier = 0;
    if (edgeMm(t) * pxPerMm >= (L.ribbonPx || 0.75) && pxPerMm >= (L.ribbonMinPxPerMm || 0)) tier = 2;
    else if (poolMm(t) * pxPerMm >= (L.tierPx || 0.35) || (t.skipRate > 0 && t.skipLenMm * pxPerMm >= 1.5)) tier = 1;
    if (gesture && prevTier > tier) return prevTier;
    return tier;
  };

  const bucketOf = (pxPerMm) => 2 ** Math.round(Math.log2(Math.max(1e-3, pxPerMm)));

  // Sample spacing: 1.5 device px at the bucket, but never finer than a
  // quarter of the edge-noise scale. Always 1.5 · 2^-k, so the samples of a
  // coarser bucket are exactly a subset of a finer bucket's.
  const dsFor = (t, pxPerMm) => {
    const minMm = Math.max(LIM().minSampleMm || 0.012, (t ? t.edgeScaleMm : 0.2) / 4);
    const bMax = 2 ** Math.ceil(Math.log2(1.5 / minMm));
    return 1.5 / Math.min(bucketOf(pxPerMm), bMax);
  };

  // ---- flattening -----------------------------------------------------------

  const flattenCache = new WeakMap();

  const pathSig = (path, useCurves) => {
    let s = useCurves ? 1.5 : 0.5;
    const meta = path && path.meta;
    if (meta && meta.kind === 'circle') {
      return s + 7 * (meta.cx ?? meta.x ?? 0) + 11 * (meta.cy ?? meta.y ?? 0) + 13 * (meta.rx ?? meta.r ?? 0)
        + 17 * (meta.ry ?? meta.r ?? 0) + 19 * (meta.rotation || 0);
    }
    if (Array.isArray(path)) {
      s += path.length * 3.7;
      for (let i = 0; i < path.length; i += 1) {
        const p = path[i];
        if (p) s += p.x * ((i % 7) + 1.13) + p.y * ((i % 5) + 2.71);
      }
    }
    const anchors = meta && Array.isArray(meta.anchors) ? meta.anchors : null;
    if (anchors) {
      for (let i = 0; i < anchors.length; i += 1) {
        const a = anchors[i];
        if (!a) continue;
        s += (a.x || 0) * 0.31 + (a.y || 0) * 0.37;
        if (a.in) s += (a.in.x || 0) * 0.41 + (a.in.y || 0) * 0.43;
        if (a.out) s += (a.out.x || 0) * 0.47 + (a.out.y || 0) * 0.53;
      }
    }
    if (meta && (meta.closed || meta.straight || meta.baked || meta.forceCurves)) s += 0.77;
    return s;
  };

  // A recording ctx: the tracer draws into it, curves and arcs come out as
  // polylines in document mm (flatness LIMITS.flattenTolMm).
  const makeFlattenCtx = () => {
    const tol = LIM().flattenTolMm || 0.01;
    const subs = [];
    let cur = null;
    let sx = 0; let sy = 0; let lx = 0; let ly = 0;
    const push = (x, y) => {
      if (!cur) { cur = []; subs.push(cur); sx = x; sy = y; }
      cur.push(x, y); lx = x; ly = y;
    };
    const segs = (d) => clamp(Math.ceil(Math.sqrt(d / (4 * tol))), 1, 256);
    const flattenQuad = (cx, cy, x, y) => {
      const x0 = lx; const y0 = ly;
      const n = segs(Math.hypot(x0 - 2 * cx + x, y0 - 2 * cy + y));
      for (let i = 1; i <= n; i += 1) {
        const t = i / n; const u = 1 - t;
        push(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
      }
    };
    return {
      subs,
      moveTo(x, y) { cur = null; push(x, y); },
      lineTo(x, y) { push(x, y); },
      // A recording sink for PathDraw (it flattens, never emits a curve).
      quadraticCurveTo: flattenQuad,
      bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
        const x0 = lx; const y0 = ly;
        const d = Math.max(Math.hypot(x0 - 2 * c1x + c2x, y0 - 2 * c1y + c2y), Math.hypot(c1x - 2 * c2x + x, c1y - 2 * c2y + y));
        const n = segs(d * 1.5);
        for (let i = 1; i <= n; i += 1) {
          const t = i / n; const u = 1 - t;
          const a = u * u * u; const b = 3 * u * u * t; const c = 3 * u * t * t; const e = t * t * t;
          push(a * x0 + b * c1x + c * c2x + e * x, a * y0 + b * c1y + c * c2y + e * y);
        }
      },
      ellipse(cx, cy, rx, ry, rot, a0, a1, ccw) {
        let sweep = a1 - a0;
        if (!ccw && sweep < 0) sweep += Math.PI * 2;
        if (ccw && sweep > 0) sweep -= Math.PI * 2;
        if (Math.abs(a1 - a0) >= Math.PI * 2 - 1e-9) sweep = ccw ? -Math.PI * 2 : Math.PI * 2;
        const r = Math.max(rx, ry);
        const step = 2 * Math.acos(clamp(1 - tol / Math.max(r, tol), -1, 1)) || 0.1;
        const n = clamp(Math.ceil(Math.abs(sweep) / step), 4, 2048);
        const cr = Math.cos(rot || 0); const sr = Math.sin(rot || 0);
        for (let i = 0; i <= n; i += 1) {
          const a = a0 + sweep * (i / n);
          const ex = rx * Math.cos(a); const ey = ry * Math.sin(a);
          push(cx + ex * cr - ey * sr, cy + ex * sr + ey * cr);
        }
      },
      arc(cx, cy, r, a0, a1, ccw) { this.ellipse(cx, cy, r, r, 0, a0, a1, ccw); },
      closePath() {
        if (cur && (lx !== sx || ly !== sy)) push(sx, sy);
        if (cur) cur.closed = true;
        cur = null;
      },
      rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); },
    };
  };

  const defaultTrace = (ctx, path, useCurves) => {
    const meta = path && path.meta;
    if (meta && meta.kind === 'circle') {
      const cx = meta.cx ?? meta.x; const cy = meta.cy ?? meta.y;
      const rx = meta.rx ?? meta.r; const ry = meta.ry ?? meta.r;
      if (![cx, cy, rx, ry].every(Number.isFinite) || rx <= 0 || ry <= 0) return;
      ctx.moveTo(cx + rx, cy);
      ctx.ellipse(cx, cy, rx, ry, meta.rotation || 0, 0, Math.PI * 2);
      return;
    }
    if (Vectura.PathDraw && Vectura.PathDraw.toCanvas) Vectura.PathDraw.toCanvas(ctx, path, { useCurves });
    else if (Array.isArray(path) && path.length) {
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
    }
  };

  const flatten = (path, useCurves = false, trace = null, knownSig = null) => {
    const sig = knownSig != null ? knownSig : pathSig(path, useCurves);
    const hit = path && typeof path === 'object' ? flattenCache.get(path) : null;
    if (hit && hit.sig === sig) return hit;
    const fctx = makeFlattenCtx();
    (trace || defaultTrace)(fctx, path, useCurves);
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    let length = 0;
    const subs = fctx.subs.filter((s) => s.length >= 2).map((s) => {
      const arr = Float64Array.from(s);
      for (let i = 0; i < arr.length; i += 2) {
        if (arr[i] < x0) x0 = arr[i]; if (arr[i] > x1) x1 = arr[i];
        if (arr[i + 1] < y0) y0 = arr[i + 1]; if (arr[i + 1] > y1) y1 = arr[i + 1];
        if (i) length += Math.hypot(arr[i] - arr[i - 2], arr[i + 1] - arr[i - 1]);
      }
      // A sub-path that ends where it starts is a loop even without
      // closePath (a full ellipse, a closed polyline): noise runs periodic.
      const n2 = arr.length;
      arr.closed = s.closed === true || (n2 >= 6 && Math.abs(arr[0] - arr[n2 - 2]) < 1e-6 && Math.abs(arr[1] - arr[n2 - 1]) < 1e-6);
      return arr;
    });
    const out = { sig, subs, length, bbox: subs.length ? { x0, y0, x1, y1 } : null };
    if (path && typeof path === 'object') flattenCache.set(path, out);
    return out;
  };

  // ---- ribbon geometry ------------------------------------------------------

  // Command buffer: [OP_POLY, n, x0, y0, …] [OP_DISC, cx, cy, r]
  const OP_POLY = 1;
  const OP_DISC = 2;
  const OP_LINE = 3; // open polyline (skeleton tier, stroked)

  class Buf {
    constructor() { this.a = new Float64Array(1024); this.n = 0; this.verts = 0; }
    grow(k) {
      if (this.n + k <= this.a.length) return;
      let len = this.a.length * 2;
      while (len < this.n + k) len *= 2;
      const b = new Float64Array(len); b.set(this.a.subarray(0, this.n)); this.a = b;
    }
    poly(xs, ys, count) {
      if (count < 3) return;
      this.grow(2 + count * 2);
      const a = this.a; let n = this.n;
      a[n++] = OP_POLY; a[n++] = count;
      for (let i = 0; i < count; i += 1) { a[n++] = xs[i]; a[n++] = ys[i]; }
      this.n = n; this.verts += count;
    }
    // Strip outline: left side a..b forward, right side b..a back.
    strip(LX, LY, RX, RY, a, b) {
      const count = (b - a + 1) * 2;
      this.grow(2 + count * 2);
      const arr = this.a; let n = this.n;
      arr[n++] = OP_POLY; arr[n++] = count;
      for (let j = a; j <= b; j += 1) { arr[n++] = LX[j]; arr[n++] = LY[j]; }
      for (let j = b; j >= a; j -= 1) { arr[n++] = RX[j]; arr[n++] = RY[j]; }
      this.n = n; this.verts += count;
    }
    line(xs, ys, count, wf = 1) {
      if (count < 2) return;
      this.grow(3 + count * 2);
      const a = this.a; let n = this.n;
      a[n++] = OP_LINE; a[n++] = count; a[n++] = wf;
      for (let i = 0; i < count; i += 1) { a[n++] = xs[i]; a[n++] = ys[i]; }
      this.n = n; this.verts += count;
    }
    disc(x, y, r) {
      if (!(r > 1e-5)) return;
      this.grow(4);
      const a = this.a; a[this.n++] = OP_DISC; a[this.n++] = x; a[this.n++] = y; a[this.n++] = r;
      this.verts += 24;
    }
    done() { return this.a.slice(0, this.n); }
  }

  // Shoelace sign of a polygon (canvas y-down): all emitted shapes are made
  // NEGATIVE (the sign of a left-forward / right-back strip and of an
  // anticlockwise arc), so nonzero filling is a union.
  const area2 = (xs, ys, n) => {
    let s = 0;
    for (let i = 0, j = n - 1; i < n; j = i, i += 1) s += xs[j] * ys[i] - xs[i] * ys[j];
    return s;
  };

  const TRI_X = [0, 0, 0];
  const TRI_Y = [0, 0, 0];
  const tri = (buf, ax, ay, bx, by, cx, cy) => {
    TRI_X[0] = ax; TRI_Y[0] = ay; TRI_X[1] = bx; TRI_Y[1] = by; TRI_X[2] = cx; TRI_Y[2] = cy;
    if (area2(TRI_X, TRI_Y, 3) > 0) { TRI_X[1] = cx; TRI_Y[1] = cy; TRI_X[2] = bx; TRI_Y[2] = by; }
    buf.poly(TRI_X, TRI_Y, 3);
  };

  const bump = (u) => (u > 3 ? 0 : Math.exp(-2.2 * u * u));
  const smooth01 = (x) => { const t = x <= 0 ? 0 : x >= 1 ? 1 : x; return t * t * (3 - 2 * t); };

  // Smooth 1D gradient noise (quintic fade), range ≈ [-1, 1]. A function of
  // arc length only, so the same mm of a stroke gets the same value at every
  // sample spacing (zoom) and every pan.
  const ihash = (seed, i) => {
    let h = Math.imul((i | 0) ^ seed, 0x27d4eb2d);
    h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 2147483648 - 1;
  };
  // Value + gradient noise: a random level AND slope at every lattice
  // point, so (unlike pure gradient noise) it does not cross zero at every
  // integer — no even "string of beads" along the edge.
  // period P > 0: the lattice wraps every P units (closed paths: the noise
  // is periodic over the path length, so there is no step at the start).
  const grad1 = (seed, x, P = 0) => {
    const i0 = Math.floor(x);
    const i = P > 0 ? ((i0 % P) + P) % P : i0;
    const i1 = P > 0 ? (i + 1) % P : i + 1;
    return grad1At(seed, i, i1, x - i0);
  };
  const grad1At = (seed, i, i1, f) => {
    const u = f * f * f * (f * (f * 6 - 15) + 10);
    const a = ihash(seed ^ 0x9e3779b9, i) * 0.55 + ihash(seed, i) * f;
    const b = ihash(seed ^ 0x9e3779b9, i1) * 0.55 + ihash(seed, i1) * (f - 1);
    return (a + (b - a) * u) * 1.25;
  };

  /**
   * Build the ribbon for one flattened path (all subpaths).
   * `flat` from flatten(); `t` from PenModel.resolveTraits; `ds` from dsFor().
   * Pure and deterministic: a function of the path (mm), the traits and ds.
   */
  const buildRibbon = (flat, t, ds, weightScale = 1) => {
    const buf = new Buf();
    if (!flat || !flat.subs.length || !t) return { cmds: buf.done(), bytes: 0, verts: 0 };
    const seed = t.seed | 0;
    const sL1 = seed ^ 0x1b873593; const sL2 = seed ^ 0x4cf5ad43;
    const sR1 = seed ^ 0x2545f491; const sR2 = seed ^ 0x7feb352d;
    const sJ = seed ^ 0x68e31da4;
    const r0 = Math.max(0.005, (t.laidW * weightScale) / 2);
    const amp = t.edgeAmpMm * weightScale;
    const esc = 1 / Math.max(0.02, t.edgeScaleMm);
    const esc2 = esc * 2.3;
    const esc3 = esc * 0.37;
    const sL3 = seed ^ 0x3c6ef372; const sR3 = seed ^ 0x5be0cd19;
    const jsc = 1 / Math.max(0.5, t.jitterScaleMm);
    const cornerCos = Math.cos(((LIM().cornerDeg || 35) * Math.PI) / 180);
    const maxSamples = LIM().maxSamplesPerPath || 400000;
    const skipCell = t.skipLenMm * 4;
    const skipP = clamp(t.skipRate * 4, 0, 0.95);
    const skipTaper = Math.max(0.3, r0 * 1.6);
    const nib = t.nib;
    const nibK = nib ? nib.strength : 0; const nibA = nib ? nib.angle : 0;
    const starve = t.starveLenMm > 0 && t.starveStrength > 0;
    const starveLen = t.starveLenMm; const starveK = t.starveStrength;
    const jitter = t.jitter; const cornerPool = t.cornerPool; const endPool = t.endPoolMm;
    const skipLen = t.skipLenMm;

    flat.subs.forEach((pts) => {
      const n0 = pts.length >> 1;
      // Drop zero-length segments.
      const px = new Float64Array(n0); const py = new Float64Array(n0);
      let m = 0;
      for (let i = 0; i < n0; i += 1) {
        const x = pts[2 * i]; const y = pts[2 * i + 1];
        if (m && Math.abs(x - px[m - 1]) < 1e-9 && Math.abs(y - py[m - 1]) < 1e-9) continue;
        px[m] = x; py[m] = y; m += 1;
      }
      const startHash = hash3(seed, qmm(px[0]), qmm(py[0]));
      const blob = startHash < t.startBlobP ? t.startBlobMm * (0.6 + 0.8 * hash3(seed + 1, qmm(px[0]), qmm(py[0]))) : 0;
      if (m < 2) {
        buf.disc(px[0], py[0], r0 + Math.max(blob, t.endPoolMm));
        return;
      }
      const segLen = new Float64Array(m - 1);
      const cum = new Float64Array(m);
      for (let i = 0; i < m - 1; i += 1) {
        segLen[i] = Math.hypot(px[i + 1] - px[i], py[i + 1] - py[i]);
        cum[i + 1] = cum[i] + segLen[i];
      }
      const total = cum[m - 1];
      const closed = pts.closed === true;
      const corner = new Uint8Array(m);
      const cornerS = [];
      const cornerTurn = [];
      for (let i = 1; i < m - 1; i += 1) {
        const ax = (px[i] - px[i - 1]) / segLen[i - 1]; const ay = (py[i] - py[i - 1]) / segLen[i - 1];
        const bx = (px[i + 1] - px[i]) / segLen[i]; const by = (py[i + 1] - py[i]) / segLen[i];
        const c = ax * bx + ay * by;
        if (c < cornerCos) { corner[i] = 1; cornerS.push(cum[i]); cornerTurn.push(Math.acos(clamp(c, -1, 1))); }
      }
      // Per-path offsets into the noise (sheet-locked through the start point).
      const pathKey = (startHash * 4294967296) | 0;
      const off = (hash3(pathKey, 3, 5) * 4096) | 0;
      // Closed path: whole lattice cells around the loop (periodic noise).
      const per = (sc) => (closed ? Math.max(1, Math.round(total * sc)) : 0);
      const P1 = per(esc); const P2 = per(esc2); const P3 = per(esc3); const PJ = per(jsc);
      const k1 = closed ? P1 / total : esc; const k2 = closed ? P2 / total : esc2;
      const k3 = closed ? P3 / total : esc3; const kJ = closed ? PJ / total : jsc;

      const step = Math.max(ds, total / maxSamples);
      const cap = Math.floor(total / step) + 3 + 2 * cornerS.length;
      const S = new Float64Array(cap); const X = new Float64Array(cap); const Y = new Float64Array(cap);
      const TX = new Float64Array(cap); const TY = new Float64Array(cap); const K = new Uint8Array(cap);
      let N = 0;
      const add = (s, x, y, tx, ty, kind) => { S[N] = s; X[N] = x; Y[N] = y; TX[N] = tx; TY[N] = ty; K[N] = kind; N += 1; };
      let k = 0;
      for (let i = 0; i < m - 1; i += 1) {
        const L = segLen[i];
        const x0 = px[i]; const y0 = py[i];
        const ddx = px[i + 1] - x0; const ddy = py[i + 1] - y0;
        const tx = ddx / L; const ty = ddy / L;
        const s0 = cum[i]; const s1 = cum[i + 1];
        if (i === 0) add(0, x0, y0, tx, ty, 0);
        const lim = s1 - 1e-9;
        while ((k + 1) * step < lim) {
          k += 1;
          const s = k * step;
          const u = (s - s0) / L;
          S[N] = s; X[N] = x0 + ddx * u; Y[N] = y0 + ddy * u; TX[N] = tx; TY[N] = ty; N += 1;
        }
        if (i + 1 === m - 1) {
          add(s1, px[i + 1], py[i + 1], tx, ty, 0);
        } else if (corner[i + 1]) {
          const L2 = segLen[i + 1];
          add(s1, px[i + 1], py[i + 1], tx, ty, 0);
          add(s1, px[i + 1], py[i + 1], (px[i + 2] - px[i + 1]) / L2, (py[i + 2] - py[i + 1]) / L2, 2);
        }
      }
      const LX = new Float64Array(N); const LY = new Float64Array(N);
      const RX = new Float64Array(N); const RY = new Float64Array(N);
      const RM = new Float64Array(N);
      const w = Math.max(r0 * 2, 0.1);
      const near = w * 3;
      let ci = 0;
      for (let j = 0; j < N; j += 1) {
        const s = S[j]; const x = X[j]; const y = Y[j];
        const nx = -TY[j]; const ny = TX[j];
        let r = r0;
        if (jitter > 0) r *= 1 + jitter * grad1(sJ, s * kJ + off, PJ);
        if (nib) r *= 1 + nibK * (2 * Math.abs(Math.sin(Math.atan2(TY[j], TX[j]) - nibA)) - 1);
        if (starve) r *= 1 - starveK * Math.min(1, s / starveLen);
        // Pools: pen-down blob, lift pool, swelling where the pen slows at corners.
        let swell = 0;
        if (!closed) {
          if (blob > 0 && s < near) swell += blob * bump(s / w);
          if (endPool > 0 && total - s < near) swell += endPool * bump((total - s) / w);
        }
        if (cornerPool > 0 && cornerS.length) {
          while (ci + 1 < cornerS.length && cornerS[ci + 1] <= s) ci += 1;
          const q0 = ci > 0 ? ci - 1 : 0;
          const q1 = Math.min(cornerS.length - 1, ci + 1);
          for (let q = q0; q <= q1; q += 1) {
            const d = Math.abs(cornerS[q] - s);
            if (d < near) swell += cornerPool * r0 * 0.9 * Math.min(1, cornerTurn[q] / 1.6) * bump(d / w);
          }
        }
        // Skips: at hashed positions the ball starves — the line thins to a
        // ragged streak dragged along one side (a partial skip, never a clean
        // round-capped gap), tapered in and out.
        let g = 1;
        let side = 0;
        if (skipP > 0) {
          const cell = Math.floor(s / skipCell);
          for (let c = cell - 1; c <= cell + 1; c += 1) {
            if (hash3(pathKey, c, 7) >= skipP) continue;
            const centre = (c + 0.2 + 0.6 * hash3(pathKey, c, 11)) * skipCell;
            const half = (skipLen * (0.5 + 0.5 * hash3(pathKey, c, 13))) / 2;
            const d = Math.abs(s - centre) - half;
            if (d < skipTaper) {
              const gc = smooth01(d / skipTaper);
              if (gc < g) { g = gc; side = hash3(pathKey, c, 19) < 0.5 ? -1 : 1; }
            }
          }
        }
        let cx = x; let cy = y;
        const skipK = 1 - g;
        if (g < 1) {
          const resid = 0.14 + 0.26 * (0.5 + 0.5 * grad1(sJ ^ 0x51ed27, s * 14 + off));
          const gEff = resid + (1 - resid) * g;
          const shift = skipK * r * 0.4 * side;
          cx += nx * shift; cy += ny * shift;
          r *= gEff; swell *= gEff;
          g = gEff;
        }
        r += swell;
        RM[j] = r;
        // Edge lumps: two octaves of noise per side along the arc length.
        let rl = r; let rr = r;
        if (amp > 0) {
          // ×1.4: edgeAmpMm is about the peak lump size. The lattice is
          // domain-warped so lumps are irregularly spaced (fibre clumps),
          // not an even scallop.
          const a = amp * g * 1.4;
          const wl = 0.9 * grad1(sL3, s * k3 + off, P3);
          const wr = 0.9 * grad1(sR3, s * k3 + off, P3);
          const u = s * k1 + off; const u2 = s * k2 + off;
          // Ink wicks OUT into the fibres: outward lumps at full size,
          // inward notches shallow (no pinched "string of beads").
          const el = 0.86 * grad1(sL1, u + wl, P1) + 0.14 * grad1(sL2, u2 + wl, P2);
          const er = 0.86 * grad1(sR1, u + wr, P1) + 0.14 * grad1(sR2, u2 + wr, P2);
          rl += a * (el > 0 ? el : 0.3 * el);
          rr += a * (er > 0 ? er : 0.3 * er);
          if (rl < 0) rl = 0;
          if (rr < 0) rr = 0;
        }
        // A starved ball drags a broken, ragged edge (not a clean thin line).
        if (skipK > 0) {
          rl *= 1 - skipK * 0.55 * (0.5 + 0.5 * grad1(sL2 ^ 0x2f, s * 34 + off));
          rr *= 1 - skipK * 0.55 * (0.5 + 0.5 * grad1(sR2 ^ 0x2f, s * 34 + off));
        }
        X[j] = cx; Y[j] = cy;
        LX[j] = cx + nx * rl; LY[j] = cy + ny * rl;
        RX[j] = cx - nx * rr; RY[j] = cy - ny * rr;
      }

      // Emit runs: strip polygons; break at corners (kind 2), gaps and folds.
      const flush = (a, b) => {
        if (b <= a) return;
        buf.strip(LX, LY, RX, RY, a, b);
      };
      let runStart = -1;
      for (let j = 0; j < N; j += 1) {
        if (runStart < 0) { runStart = j; continue; }
        if (K[j] === 2) {
          flush(runStart, j - 1);
          runStart = j;
          continue;
        }
        // Fold test against the path tangent, not the centre's step: a skip
        // drags the centre sideways, which must not read as a fold.
        const dx = TX[j]; const dy = TY[j];
        const fold = (LX[j] - LX[j - 1]) * dx + (LY[j] - LY[j - 1]) * dy < 0
          || (RX[j] - RX[j - 1]) * dx + (RY[j] - RY[j - 1]) * dy < 0;
        if (fold) {
          flush(runStart, j - 1);
          // Centre-fanned triangles cannot self-intersect.
          tri(buf, LX[j - 1], LY[j - 1], LX[j], LY[j], X[j], Y[j]);
          tri(buf, LX[j - 1], LY[j - 1], X[j], Y[j], X[j - 1], Y[j - 1]);
          tri(buf, X[j - 1], Y[j - 1], X[j], Y[j], RX[j], RY[j]);
          tri(buf, X[j - 1], Y[j - 1], RX[j], RY[j], RX[j - 1], RY[j - 1]);
          buf.disc(X[j], Y[j], Math.min(RM[j], Math.hypot(LX[j] - X[j], LY[j] - Y[j]), Math.hypot(RX[j] - X[j], RY[j] - Y[j])));
          runStart = j;
        }
      }
      if (runStart >= 0) flush(runStart, N - 1);
      // Round ends and corners.
      for (let j = 0; j < N; j += 1) {
        if (j === 0 || j === N - 1 || K[j] === 2) {
          buf.disc((LX[j] + RX[j]) / 2, (LY[j] + RY[j]) / 2, Math.hypot(LX[j] - RX[j], LY[j] - RY[j]) / 2);
        }
      }
    });
    const cmds = buf.done();
    return { cmds, bytes: cmds.length * 8 + buf.verts * 10, verts: buf.verts };
  };

  /**
   * Skeleton for the middle tier: the path's own polyline split at the skip
   * gaps (stroked natively at the laid width) plus discs for the pen-down
   * blob, the lift pool and corner pools. Independent of the zoom.
   */
  const buildSkeleton = (flat, t, weightScale = 1) => {
    const buf = new Buf();
    if (!flat || !flat.subs.length || !t) return { cmds: buf.done(), bytes: 0, verts: 0 };
    const seed = t.seed | 0;
    const r0 = Math.max(0.005, (t.laidW * weightScale) / 2);
    const cornerCos = Math.cos(((LIM().cornerDeg || 35) * Math.PI) / 180);
    const skipCell = t.skipLenMm * 4;
    const skipP = clamp(t.skipRate * 4, 0, 0.95);
    const w = Math.max(r0 * 2, 0.1);
    flat.subs.forEach((pts) => {
      const n0 = pts.length >> 1;
      const px = []; const py = [];
      for (let i = 0; i < n0; i += 1) {
        const x = pts[2 * i]; const y = pts[2 * i + 1];
        if (px.length && Math.abs(x - px[px.length - 1]) < 1e-9 && Math.abs(y - py[py.length - 1]) < 1e-9) continue;
        px.push(x); py.push(y);
      }
      const m = px.length;
      const startHash = hash3(seed, qmm(px[0]), qmm(py[0]));
      const blob = startHash < t.startBlobP ? t.startBlobMm * (0.6 + 0.8 * hash3(seed + 1, qmm(px[0]), qmm(py[0]))) : 0;
      if (m < 2) { buf.disc(px[0], py[0], r0 + Math.max(blob, t.endPoolMm)); return; }
      const cum = new Float64Array(m);
      for (let i = 1; i < m; i += 1) cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
      const total = cum[m - 1];
      const closed = pts.closed === true;
      const at = (s) => {
        let lo = 0; let hi = m - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
        const L = cum[hi] - cum[lo] || 1;
        const u = clamp((s - cum[lo]) / L, 0, 1);
        return [px[lo] + (px[hi] - px[lo]) * u, py[lo] + (py[hi] - py[lo]) * u];
      };
      // Keep intervals between the skip gaps (same hashed gaps as the ribbon).
      const pathKey = (startHash * 4294967296) | 0;
      // Pieces between the skip gaps at full width; inside a gap the ball
      // still drags a thin streak (a partial skip, not a clean break).
      const pieces = [];
      let from = 0;
      if (skipP > 0) {
        const cells = Math.floor(total / skipCell) + 1;
        for (let c = 0; c <= cells; c += 1) {
          if (hash3(pathKey, c, 7) >= skipP) continue;
          const centre = (c + 0.2 + 0.6 * hash3(pathKey, c, 11)) * skipCell;
          const half = (t.skipLenMm * (0.5 + 0.5 * hash3(pathKey, c, 13))) / 2;
          const a = Math.max(0, centre - half); const b = Math.min(total, centre + half);
          if (b <= a || a < from) continue;
          if (a > from) pieces.push([from, a, 1]);
          pieces.push([a, b, Math.round((0.2 + 0.2 * hash3(pathKey, c, 17)) * 20) / 20]);
          from = b;
        }
      }
      if (from < total) pieces.push([from, total, 1]);
      pieces.forEach(([a, b, wf]) => {
        const xs = []; const ys = [];
        const p0 = at(a); xs.push(p0[0]); ys.push(p0[1]);
        for (let i = 0; i < m; i += 1) if (cum[i] > a && cum[i] < b) { xs.push(px[i]); ys.push(py[i]); }
        const p1 = at(b); xs.push(p1[0]); ys.push(p1[1]);
        buf.line(xs, ys, xs.length, wf);
      });
      if (!closed) {
        if (blob > 0) { const p = at(Math.min(total, 0.25 * w)); buf.disc(p[0], p[1], r0 + blob * 0.87); }
        if (t.endPoolMm > 0) { const p = at(Math.max(0, total - 0.25 * w)); buf.disc(p[0], p[1], r0 + t.endPoolMm * 0.87); }
      }
      if (t.cornerPool > 0) {
        for (let i = 1; i < m - 1; i += 1) {
          const l1 = cum[i] - cum[i - 1]; const l2 = cum[i + 1] - cum[i];
          const c = ((px[i] - px[i - 1]) * (px[i + 1] - px[i]) + (py[i] - py[i - 1]) * (py[i + 1] - py[i])) / (l1 * l2);
          if (c < cornerCos) buf.disc(px[i], py[i], r0 + t.cornerPool * r0 * 0.9 * Math.min(1, Math.acos(clamp(c, -1, 1)) / 1.6));
        }
      }
    });
    const cmds = buf.done();
    return { cmds, bytes: cmds.length * 8 + buf.verts * 10, verts: buf.verts };
  };

  // Replay a command buffer into a ctx / Path2D (document mm). `mode`
  // 'fill' replays the closed shapes (polygons, discs), 'line' the open
  // skeleton polylines.
  const replay = (target, cmds, mode = 'fill', onlyWf = null) => {
    const a = cmds;
    const fill = mode !== 'line';
    let i = 0;
    while (i < a.length) {
      const op = a[i];
      if (op === OP_POLY) {
        const n = a[i + 1];
        if (fill) {
          let j = i + 2;
          target.moveTo(a[j], a[j + 1]);
          for (let q = 1; q < n; q += 1) { j += 2; target.lineTo(a[j], a[j + 1]); }
          target.closePath();
        }
        i += 2 + n * 2;
      } else if (op === OP_LINE) {
        const n = a[i + 1];
        const wf = a[i + 2];
        if (!fill && (onlyWf == null || onlyWf === wf)) {
          let j = i + 3;
          target.moveTo(a[j], a[j + 1]);
          for (let q = 1; q < n; q += 1) { j += 2; target.lineTo(a[j], a[j + 1]); }
        }
        i += 3 + n * 2;
      } else if (op === OP_DISC) {
        if (fill) {
          const x = a[i + 1]; const y = a[i + 2]; const r = a[i + 3];
          target.moveTo(x + r, y);
          target.arc(x, y, r, 0, Math.PI * 2, true);
          target.closePath();
        }
        i += 4;
      } else {
        break;
      }
    }
  };

  // Distinct line-width factors of a skeleton's polylines.
  const lineWidthsOf = (cmds) => {
    const out = [];
    let i = 0;
    while (i < cmds.length) {
      const op = cmds[i];
      if (op === OP_POLY) i += 2 + cmds[i + 1] * 2;
      else if (op === OP_LINE) { if (!out.includes(cmds[i + 2])) out.push(cmds[i + 2]); i += 3 + cmds[i + 1] * 2; }
      else if (op === OP_DISC) i += 4;
      else break;
    }
    return out;
  };

  // ---- cache ----------------------------------------------------------------

  let ribbons = new WeakMap(); // path -> Map(key -> entry)
  let entrySeq = 0;
  const combined = new Map();  // penId|slot -> { sig, fill: Path2D, lines }
  const lru = new Map();       // entry -> true (insertion order = age)
  const stats = { builds: 0, hits: 0, bytes: 0, evictions: 0, fallbacks: 0, buildMs: 0 };
  let pinned = new Set();
  // Entries drawn this frame are pinned: never evicted, so a big view can't
  // evict what it is drawing and rebuild it forever. The cap grows to 1.5×
  // the pinned set, never past ribbonHardBytes.
  let pinnedBytes = 0;
  const pin = (e) => { if (!pinned.has(e)) { pinned.add(e); pinnedBytes += e.bytes; } };
  const capBytes = () => Math.min(LIM().ribbonHardBytes || 128 * 1024 * 1024,
    Math.max(LIM().ribbonCacheBytes || 48 * 1024 * 1024, pinnedBytes * 1.5));
  const touch = (e) => { lru.delete(e); lru.set(e, true); };
  const evict = () => {
    const cap = capBytes();
    if (stats.bytes <= cap) return;
    for (const e of lru.keys()) {
      if (stats.bytes <= cap) break;
      if (pinned.has(e)) continue;
      lru.delete(e);
      if (e.owner) e.owner.delete(e.key);
      stats.bytes -= e.bytes;
      stats.evictions += 1;
    }
  };
  const hasPath2D = () => typeof G.Path2D === 'function';
  const entryFor = (path, key, sig) => {
    const m = ribbons.get(path);
    const e = m && m.get(key);
    if (e && e.sig === sig) return e;
    return null;
  };
  const store = (path, key, sig, built, meta = null) => {
    let m = ribbons.get(path);
    if (!m) { m = new Map(); ribbons.set(path, m); }
    const old = m.get(key);
    if (old) { lru.delete(old); stats.bytes -= old.bytes; }
    entrySeq += 1;
    const e = { id: entrySeq, key, sig, cmds: built.cmds, bytes: built.bytes, p2d: null, lineGroups: null, owner: m, base: meta && meta.base, ds: meta && meta.ds, ws: meta && meta.ws, kind: (meta && meta.kind) || 'ribbon' };
    m.set(key, e);
    lru.set(e, true);
    stats.bytes += e.bytes;
    // A finer ribbon supersedes the coarser fallbacks of the same pen state.
    if (e.kind === 'ribbon' && e.ds > 0) {
      m.forEach((o, k) => {
        if (o === e || o.kind !== 'ribbon' || o.base !== e.base || o.ws !== e.ws || !(o.ds > e.ds) || pinned.has(o)) return;
        m.delete(k); lru.delete(o); stats.bytes -= o.bytes;
      });
    }
    evict();
    return e;
  };
  const p2dOf = (e) => {
    if (!e.p2d && hasPath2D()) {
      const p = new G.Path2D();
      replay(p, e.cmds, 'fill');
      e.p2d = p;
      if (e.kind === 'skeleton') {
        e.lineGroups = new Map();
        lineWidthsOf(e.cmds).forEach((wf) => {
          const l = new G.Path2D();
          replay(l, e.cmds, 'line', wf);
          e.lineGroups.set(wf, l);
        });
      }
    }
    return e.p2d;
  };

  // ---- idle refinement ------------------------------------------------------

  const buildFor = (job, flat) => (job.kind === 'skeleton'
    ? buildSkeleton(flat, job.traits, job.weightScale)
    : buildRibbon(flat, job.traits, job.ds, job.weightScale));

  let queue = new Map(); // key -> job
  let waiters = new Set();
  let scheduled = false;
  let lastNotify = 0;
  const runJob = (job) => {
    if (entryFor(job.path, job.key, job.sig)) return null;
    const flat = flatten(job.path, job.useCurves, job.trace, job.sig);
    const e = store(job.path, job.key, job.sig, buildFor(job, flat), { base: job.base, ds: job.ds, ws: job.weightScale, kind: job.kind });
    stats.builds += 1;
    return e;
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      const start = now();
      let built = 0;
      for (const [k, job] of queue) {
        if (built > 0 && now() - start >= (LIM().refineSliceMs || 10)) break;
        queue.delete(k);
        const e = runJob(job);
        if (e) { pin(e); built += 1; }
      }
      if (queue.size) schedule();
      // Repaint at most every 200 ms while refining, and once when drained.
      if (built && (!queue.size || now() - lastNotify > 200)) {
        lastNotify = now();
        const ws = Array.from(waiters);
        if (!queue.size) waiters.clear();
        ws.forEach((fn) => { try { fn(); } catch (_e) { /* repaint failed */ } });
      }
    }, 0);
  };

  // ---- per-frame rendering --------------------------------------------------

  const traitsBase = (t) => (Vectura.PenModel ? Vectura.PenModel.traitsKey(t) : `${t.seed}`);

  // Resolve the geometry to draw for one collected item this frame:
  // the exact entry if cached; else build within the frame budget; else the
  // nearest cached bucket, a coarse (ds × 4) build, or null (native stroke),
  // with the exact build queued for idle refinement.
  const geometryFor = (item, t, frame, sig, flat) => {
    const ws = item.weightScale || 1;
    const base = traitsBase(t);
    const skeleton = frame.tier === 1;
    const kind = skeleton ? 'skeleton' : 'ribbon';
    const key = skeleton ? `${base}|S|${ws}` : `${base}|${frame.ds}|${ws}`;
    const hit = entryFor(item.path, key, sig);
    if (hit) { stats.hits += 1; return hit; }
    const job = { path: item.path, key, sig, useCurves: item.useCurves, trace: frame.trace, traits: t, ds: frame.ds, weightScale: ws, base, kind };
    if (skeleton || frame.spent < (LIM().buildBudgetMs || 8)) {
      const t0 = now();
      const e = store(item.path, key, sig, buildFor(job, flat), { base, ds: frame.ds, ws, kind });
      const dt = now() - t0;
      frame.spent += dt; stats.buildMs += dt; stats.builds += 1;
      return e;
    }
    frame.queue.set(`${frame.qid++}`, job);
    const m = ribbons.get(item.path);
    if (m) {
      let best = null; let bestD = Infinity;
      m.forEach((e) => {
        if (e.sig !== sig || e.base !== base || e.ws !== ws || e.kind !== 'ribbon' || !(e.ds > 0)) return;
        const d = Math.abs(Math.log2(e.ds / frame.ds));
        if (d < bestD) { bestD = d; best = e; }
      });
      if (best) return best;
    }
    if (frame.coarseSpent < (LIM().coarseBudgetMs || 12)) {
      const cds = frame.ds * 4;
      const t0 = now();
      const e = store(item.path, `${base}|${cds}|${ws}`, sig, buildRibbon(flat, t, cds, ws), { base, ds: cds, ws, kind: 'ribbon' });
      frame.coarseSpent += now() - t0;
      stats.builds += 1;
      return e;
    }
    stats.fallbacks += 1;
    return null;
  };

  const intersects = (bb, view, pad) => bb && !(bb.x1 + pad < view.x || bb.y1 + pad < view.y
    || bb.x0 - pad > view.x + view.w || bb.y0 - pad > view.y + view.h);

  const hexRgb = (hex) => {
    let h = `${hex || ''}`.replace('#', '');
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
    const v = parseInt(h.slice(0, 6), 16);
    if (!Number.isFinite(v)) return [0, 0, 0];
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  };
  const css = (rgb) => `rgb(${rgb.map((c) => Math.round(clamp(c, 0, 1) * 255)).join(',')})`;

  // Overlap darkening d: each extra coverage multiplies by g = mix(1, c, d)
  // (d = 1: full subtractive compounding c^k; d = 0: none). The union is
  // filled with u = c / g first, so a single coverage is exactly c.
  const darkenColors = (hex, d) => {
    const c = hexRgb(hex);
    const g = c.map((v) => 1 - d * (1 - v));
    const u = c.map((v, i) => (g[i] > 0 ? v / g[i] : 0));
    return { u: css(u), g: css(g) };
  };

  const OVERLAP_BATCHES = 6;

  // Cull rect: the view grown by half a view each way and snapped to a
  // half-view grid, so small pans keep the same drawn set (and its cached
  // combined path).
  const cullRect = (v) => {
    const g = Math.max(v.w, v.h) / 2 || 1;
    const x0 = Math.floor((v.x - v.w * 0.5) / g) * g;
    const y0 = Math.floor((v.y - v.h * 0.5) / g) * g;
    const x1 = Math.ceil((v.x + v.w * 1.5) / g) * g;
    const y1 = Math.ceil((v.y + v.h * 1.5) / g) * g;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  // ---- frames ---------------------------------------------------------------
  //
  // A frame is beginFrame() → drawRun() per contiguous run of one pen's
  // paths, in layer / plot order → endFrame(). Runs draw straight into the
  // caller's canvas (no per-pen scratch, no extra full-canvas composites),
  // so layer stacking between plain and model pens is exactly the draw order.

  let frame = null;
  let lastFrame = null;
  const newFrame = () => ({
    spent: 0, coarseSpent: 0, queue: new Map(), qid: 0, ds: 0, tier: 0,
    // prof: JS time per phase. Canvas 2D is deferred: raster cost lands
    // wherever the browser flushes (usually the caller's next drawImage), not
    // here — these numbers are build / submit time only.
    prof: { prep: 0, fill: 0, overlap: 0 }, tPen: 0,
    usedCombined: new Set(), runKey: '', view: null, cull: null, trace: null, traceItem: null,
  });

  const beginFrame = () => {
    pinned = new Set();
    pinnedBytes = 0;
    frame = newFrame();
    return frame;
  };

  const endFrame = (onReady) => {
    if (!frame) return;
    lastFrame = frame.prof;
    const used = frame.usedCombined;
    combined.forEach((_c, k) => { if (!used.has(k)) combined.delete(k); });
    // Replace the refine queue with this frame's (drop stale jobs).
    queue = frame.queue;
    if (queue.size) {
      if (typeof onReady === 'function') waiters.add(onReady);
      schedule();
    } else {
      waiters = new Set();
    }
    frame = null;
  };

  // Fill one run's items into `ctx` (transform = document mm → device).
  // opts: { op, alpha, color, darken } — the union pass uses `op` and
  // `alpha`; with darken > 0 the union is drawn in u = c / g and overlaps
  // compound in multiply batches of g = mix(1, c, darken).
  const fillPen = (ctx, items, t, tier, fr, opts) => {
    const geo = [];
    const native = [];
    fr.tier = tier;
    if (tier === 0) {
      items.forEach((it) => native.push(it));
    } else {
      const pad = t.laidW * 2 + t.startBlobMm + t.endPoolMm + 1;
      // Pass A: everything already cached for this view is pinned first, so
      // building the rest can never evict what this frame is about to draw.
      const ws1 = (it) => it.weightScale || 1;
      const base = traitsBase(t);
      const todo = [];
      items.forEach((item) => {
        if (item.temp || item.uncached) { native.push(item); return; }
        const sig = pathSig(item.path, item.useCurves);
        const flat = flatten(item.path, item.useCurves, fr.trace, sig);
        if (!flat.subs.length || !intersects(flat.bbox, fr.cull, pad)) return;
        const key = tier === 1 ? `${base}|S|${ws1(item)}` : `${base}|${fr.ds}|${ws1(item)}`;
        const hit = entryFor(item.path, key, sig);
        if (hit) { stats.hits += 1; pin(hit); touch(hit); geo.push(hit); return; }
        todo.push({ item, sig, flat });
      });
      // Pass B: build / fall back for the misses.
      todo.forEach(({ item, sig, flat }) => {
        const e = geometryFor(item, t, fr, sig, flat);
        if (!e) { native.push(item); return; }
        pin(e);
        touch(e);
        geo.push(e);
      });
      evict();
    }
    const tFill = now();
    fr.prof.prep += tFill - fr.tPen;
    const color = opts.color || t.inkColor || t.color;
    const darken = opts.darken > 0 ? opts.darken : 0;
    const colors = darken ? darkenColors(color, darken) : null;
    const alpha = Number.isFinite(opts.alpha) ? opts.alpha : 1;
    const usePath2D = hasPath2D() && typeof ctx.fill === 'function';
    const strokeNative = (col, op, batched) => {
      if (!native.length) return;
      ctx.save();
      ctx.globalCompositeOperation = op;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const batches = batched ? Math.min(OVERLAP_BATCHES, native.length) : 1;
      for (let b = 0; b < batches; b += 1) {
        const byW = new Map();
        native.forEach((it, i) => { if (i % batches !== b) return; const k = it.weightScale || 1; if (!byW.has(k)) byW.set(k, []); byW.get(k).push(it); });
        byW.forEach((list, k) => {
          ctx.lineWidth = t.laidW * k;
          ctx.beginPath();
          list.forEach((it) => fr.traceItem(ctx, it));
          ctx.stroke();
        });
      }
      ctx.restore();
    };
    // Combined Path2D of a set of entries, cached per run + slot and reused
    // while the drawn set is unchanged (a pan inside the cull cell), so the
    // browser can keep its tessellation of it too.
    const combinedFor = (list, slot) => {
      const key = `${fr.runKey}|${slot}`;
      const sig = list.map((e) => e.id).join(',');
      const hit = combined.get(key);
      fr.usedCombined.add(key);
      if (hit && hit.sig === sig) return hit;
      const fill = new G.Path2D();
      const lines = new Map();
      list.forEach((e) => {
        fill.addPath(p2dOf(e));
        if (e.kind === 'skeleton') {
          e.lineGroups.forEach((p, wf) => {
            const k = `${e.ws}|${wf}`;
            if (!lines.has(k)) lines.set(k, { ws: e.ws, wf, p: new G.Path2D() });
            lines.get(k).p.addPath(p);
          });
        }
      });
      const c = { sig, fill, lines };
      combined.set(key, c);
      return c;
    };
    const drawEntries = (list, col, op, slot) => {
      if (!list.length) return;
      ctx.save();
      ctx.globalCompositeOperation = op;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (usePath2D) {
        const c = combinedFor(list, slot);
        ctx.fill(c.fill);
        c.lines.forEach((g) => { ctx.lineWidth = t.laidW * (g.ws || 1) * g.wf; ctx.stroke(g.p); });
      } else {
        ctx.beginPath();
        list.forEach((e) => replay(ctx, e.cmds, 'fill'));
        ctx.fill();
        list.forEach((e) => {
          if (e.kind !== 'skeleton') return;
          lineWidthsOf(e.cmds).forEach((wf) => {
            ctx.lineWidth = t.laidW * (e.ws || 1) * wf;
            ctx.beginPath();
            replay(ctx, e.cmds, 'line', wf);
            ctx.stroke();
          });
        });
      }
      ctx.restore();
    };
    // Pass 1: the union (nonzero fill of every shape at once).
    drawEntries(geo, colors ? colors.u : color, opts.op || 'source-over', 'u');
    strokeNative(colors ? colors.u : color, opts.op || 'source-over', false);
    const tOver = now();
    fr.prof.fill += tOver - tFill;
    if (!colors) return;
    // Pass 2: overlaps compound (multiply). Paths are dealt round-robin into
    // OVERLAP_BATCHES groups and each group is one multiply pass, so a
    // crossing of two paths in different groups darkens (neighbouring paths
    // always are); two paths of the same group do not. A single coverage is
    // u × g = c exactly.
    const batches = Math.min(OVERLAP_BATCHES, geo.length);
    for (let b = 0; b < batches; b += 1) {
      drawEntries(geo.filter((_e, i) => i % batches === b), colors.g, 'multiply', `b${b}`);
    }
    strokeNative(colors.g, 'multiply', true);
    fr.prof.overlap += now() - tOver;
  };

  /**
   * Draw one contiguous run of a pen's paths into `ctx` (its transform maps
   * document mm to device px).
   *   env:  { pxPerMm, view (mm rect), trace(ctx, path, useCurves),
   *           traceItem(ctx, item), runKey }
   *   opts: { op, alpha, darken }
   * Must be called between beginFrame() and endFrame().
   */
  const drawRun = (ctx, items, t, env, opts = {}) => {
    if (!items || !items.length || !t) return;
    const own = !frame;
    if (own) beginFrame();
    const fr = frame;
    fr.view = env.view;
    fr.cull = cullRect(env.view);
    fr.trace = env.trace || null;
    fr.traceItem = env.traceItem || ((c, it) => defaultTrace(c, it.path, it.useCurves));
    fr.runKey = env.runKey || `${t.penId}`;
    const tier = t.tier != null ? t.tier : tierFor(t, env.pxPerMm);
    fr.ds = dsFor(t, env.pxPerMm);
    if (tier === 2) {
      // Visible-set budget: a ribbon costs ≈ 2 vertices per sample; above
      // LIMITS.ribbonVisibleBytes the spacing doubles (a coarser bucket,
      // still nested) instead of evicting what the frame draws.
      let len = 0;
      const pad = t.laidW * 2 + 1;
      items.forEach((it) => {
        if (it.temp || it.uncached) return;
        const f = flatten(it.path, it.useCurves, fr.trace);
        if (f.bbox && intersects(f.bbox, fr.cull, pad)) len += f.length;
      });
      const budget = LIM().ribbonVisibleBytes || 96 * 1024 * 1024;
      while ((len / fr.ds) * 2 * 26 > budget && fr.ds < 64) fr.ds *= 2;
    }
    fr.tPen = now();
    fillPen(ctx, items, t, tier, fr, opts);
    if (own) endFrame(env.onReady);
  };

  /**
   * Convenience wrapper (perf tests / thumbnails): one frame drawing every
   * pen of plan.collect (Map penId → items) into host.translucent (a ctx) in
   * host.pens order.
   */
  const renderCollected = (plan, host) => {
    const collect = plan.collect;
    if (!collect || !collect.size) return { drawn: 0 };
    beginFrame();
    let drawn = 0;
    const ctx = host.translucent;
    (host.pens || []).forEach((pen) => {
      const items = pen && collect.get(pen.id);
      const t = pen && plan.penTraits && plan.penTraits.get(pen.id);
      if (!items || !items.length || !t || !ctx) return;
      ctx.save();
      if (host.m) ctx.setTransform(host.m);
      drawRun(ctx, items, t, { pxPerMm: host.pxPerMm, view: host.view, trace: host.trace, traceItem: host.traceItem, runKey: pen.id },
        { op: 'source-over', alpha: t.alpha, darken: t.opaque ? 0 : t.overlapDarkening });
      ctx.restore();
      drawn += 1;
    });
    endFrame(host.onReady);
    return { drawn };
  };

  // ---- model picker thumbnail ----------------------------------------------

  /**
   * Draw a short sample stroke of `pen` on `paper` into `canvas` (CSS px
   * sized; drawn at devicePixelRatio). A gentle S-curve + a loop, ~24 mm wide.
   */
  const drawSample = (canvas, pen, paper, opts = {}) => {
    if (!canvas || typeof canvas.getContext !== 'function') return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const PM = Vectura.PenModel;
    const PAPERS = Vectura.PAPERS || { TYPES: {} };
    const p = paper || { type: 'cold-press', color: '#f7f2e6', texture: 0.7, bleed: 0.6, seed: 3 };
    const info = PAPERS.TYPES[p.type] || {};
    const t = PM ? PM.resolveTraits(pen, p, info) : null;
    const W = canvas.width; const H = canvas.height;
    const wMm = opts.widthMm || 24;
    const k = W / wMm;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (opts.background) { ctx.fillStyle = opts.background; ctx.fillRect(0, 0, W, H); }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const hMm = H / k;
    const pts = [];
    for (let i = 0; i <= 60; i += 1) {
      const u = i / 60;
      pts.push({ x: 2 + u * (wMm - 4), y: hMm / 2 + Math.sin(u * Math.PI * 2) * hMm * 0.22 });
    }
    const path = pts;
    ctx.globalAlpha = t ? t.alpha : 1;
    const col = (t && t.inkColor) || pen.color;
    ctx.fillStyle = col; ctx.strokeStyle = col;
    if (t) {
      const ds = dsFor(t, k);
      const built = buildRibbon(flatten(path, false), { ...t, skipRate: t.skipRate }, ds, 1);
      ctx.beginPath();
      replay(ctx, built.cmds);
      ctx.fill();
    } else {
      ctx.lineWidth = pen.width || 0.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    }
    ctx.restore();
    return true;
  };

  const clearCache = () => {
    ribbons = new WeakMap();
    combined.clear();
    lru.clear();
    pinned = new Set();
    pinnedBytes = 0;
    queue = new Map();
    waiters = new Set();
    Object.keys(stats).forEach((k) => { stats[k] = 0; });
  };

  const cacheStats = () => ({ ...stats, entries: lru.size, queued: queue.size, pinned: pinned.size, pinnedBytes, capBytes: capBytes(), lastFrame });

  // Build every queued refinement now (tests / screenshots).
  const flush = () => {
    for (const [k, job] of queue) {
      queue.delete(k);
      const e = runJob(job);
      if (e) pin(e);
    }
    const ws = Array.from(waiters);
    waiters = new Set();
    ws.forEach((fn) => { try { fn(); } catch (_e) { /* ignore */ } });
  };

  Vectura.InkRenderer = {
    tierFor,
    featureMm,
    edgeMm,
    poolMm,
    buildSkeleton,
    dsFor,
    flatten,
    buildRibbon,
    replay,
    renderCollected,
    beginFrame,
    drawRun,
    endFrame,
    drawSample,
    clearCache,
    cacheStats,
    flush,
    OP_POLY,
    OP_DISC,
    OP_LINE,
  };
})();
