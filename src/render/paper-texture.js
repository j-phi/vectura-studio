/**
 * Paper texture synthesis (paper selector) — window.Vectura.PaperTexture.
 *
 * The paper surface is ONE global, non-periodic function of document
 * millimetres (seeded 2D simplex noise), so a given bump sits at the same mm
 * position at every zoom level and nothing ever repeats. It is rasterised on
 * demand in square CHUNKS on a mm grid:
 *
 *   bucket   chunk resolution in px per document mm: a power of two near the
 *            on-screen px/mm (never the sheet size), so a chunk is always about
 *            screen-sharp, from fit-to-screen on A0 to extreme zoom.
 *   chunk    CHUNK_PX × CHUNK_PX content pixels (+ a small apron so adjacent
 *            chunks overlap with identical content: no seams) covering
 *            CHUNK_PX / bucket mm.
 *
 * Each chunk holds three rasters:
 *   surface  RGBA "delta": black (shadow) or white (highlight) with alpha.
 *            Composited once per colour/strength into an OPAQUE paper image
 *            (base colour + delta × texture), so overlapping aprons are exact.
 *   skip     alpha mask of the finest, deepest tooth pits — ink is erased there
 *            (destination-out) for the dry-skip pinholes.
 *   feather  half-resolution alpha mask of fibre streaks that frays the
 *            ink-bleed halo (destination-in), so bleed wicks along fibres.
 *
 * Chunks missing for the current view are drawn from a coarse level built
 * synchronously (cheap) and refined when idle (time-sliced), then onReady()
 * asks the caller to repaint: picking a paper or zooming never blocks.
 * The cache is LRU, capped in BYTES (LIMITS.cacheBytes).
 *
 * API
 *   drawSurface(ctx, cfg, { pxPerMm, view, sheet, onReady }) -> bool
 *   drawMask(ctx, cfg, kind 'skip'|'feather', { pxPerMm, view, sheet, onReady, alpha, scale }) -> bool
 *   thumbDataURL(type, { px, stroke }) -> data URL (stroke: false = bare surface)
 *   heightField(type, seed, x0Mm, y0Mm, sizePx, bucket) -> Float32Array (pure, tests)
 *   bucketFor(pxPerMm), chunkMmFor(bucket), clearCache(), cacheStats()
 *   noise2(seed) -> (x, y) => simplex value (shared with the ink renderer)
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const papers = () => Vectura.PAPERS || { TYPES: {}, LIMITS: {} };
  const limits = () => papers().LIMITS || {};
  const typeInfo = (type) => {
    const T = papers().TYPES || {};
    return Object.prototype.hasOwnProperty.call(T, type) ? T[type] : (T.none || {});
  };

  // ---- seeded 2D simplex noise (Gustavson), range ≈ [-1, 1] ---------------

  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const GRAD = new Float32Array([
    1, 0, -1, 0, 0, 1, 0, -1, 0.7071, 0.7071, -0.7071, 0.7071, 0.7071, -0.7071, -0.7071, -0.7071,
    0.9239, 0.3827, -0.9239, 0.3827, 0.9239, -0.3827, -0.9239, -0.3827,
    0.3827, 0.9239, -0.3827, 0.9239, 0.3827, -0.9239, -0.3827, -0.9239,
  ]);
  const permCache = new Map();
  const permFor = (seed) => {
    const key = seed | 0;
    if (permCache.has(key)) return permCache.get(key);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) p[i] = i;
    let s = (Math.imul(key ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 1;
    for (let i = 255; i > 0; i -= 1) {
      s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6a09e667) >>> 0;
      const j = s % (i + 1);
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i += 1) perm[i] = p[i & 255];
    if (permCache.size > 64) permCache.delete(permCache.keys().next().value);
    permCache.set(key, perm);
    return perm;
  };

  const simplex = (perm, xin, yin) => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = (perm[ii + perm[jj]] & 15) * 2;
      t0 *= t0;
      n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = (perm[ii + i1 + perm[jj + j1]] & 15) * 2;
      t1 *= t1;
      n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = (perm[ii + 1 + perm[jj + 1]] & 15) * 2;
      t2 *= t2;
      n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2);
    }
    return 70 * n;
  };

  const smooth = (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  /**
   * Accumulate noise octaves over a w×h pixel grid whose pixel (px, py) sits
   * at mm (x0 + (px+.5)/b, y0 + (py+.5)/b). Each octave:
   *   { wl: wavelength mm, amp, ang: rotation rad, stretch (along u), off }
   * Coordinates are rotated by `ang` and stretched (slightly directional
   * felt marks). Octaves much larger than a pixel are smooth at that scale:
   * they are summed on ONE shared coarse grid and interpolated once with a
   * separable Catmull-Rom (C1, so the emboss that differentiates the field
   * shows no facets); fine octaves are evaluated per pixel.
   */
  const addOctaves = (out, w, h, x0, y0, b, perm, octaves) => {
    const live = octaves.filter((o) => o && o.amp > 0);
    if (!live.length) return;
    const prep = live.map((o) => ({
      ...o,
      ca: Math.cos(o.ang || 0),
      sa: Math.sin(o.ang || 0),
      inv: 1 / o.wl,
      st: o.stretch || 1,
      off: o.off || 0,
      wavePx: o.wl * b,
    }));
    const sampleAll = (list, xm, ym) => {
      let v = 0;
      for (let k = 0; k < list.length; k += 1) {
        const o = list[k];
        const u = (xm * o.ca + ym * o.sa) / o.st;
        const vv = -xm * o.sa + ym * o.ca;
        v += o.amp * simplex(perm, u * o.inv + o.off, vv * o.inv - o.off);
      }
      return v;
    };
    const fine = prep.filter((o) => o.wavePx < 8);
    const smoothList = prep.filter((o) => o.wavePx >= 8);
    if (fine.length) {
      for (let py = 0; py < h; py += 1) {
        const ym = y0 + (py + 0.5) / b;
        for (let px = 0; px < w; px += 1) out[py * w + px] += sampleAll(fine, x0 + (px + 0.5) / b, ym);
      }
    }
    if (!smoothList.length) return;
    const minWave = Math.min(...smoothList.map((o) => o.wavePx));
    const step = Math.max(1, Math.min(12, Math.floor(minWave / 4)));
    const gw = Math.ceil(w / step) + 4;
    const gh = Math.ceil(h / step) + 4;
    const grid = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy += 1) {
      const ym = y0 + ((gy - 1) * step + 0.5) / b;
      for (let gx = 0; gx < gw; gx += 1) grid[gy * gw + gx] = sampleAll(smoothList, x0 + ((gx - 1) * step + 0.5) / b, ym);
    }
    // Catmull-Rom weights per output column / row (they repeat every step).
    const weights = (n) => {
      const idx = new Int32Array(n);
      const wts = new Float32Array(n * 4);
      for (let p = 0; p < n; p += 1) {
        const f = p / step;
        const g0 = Math.floor(f);
        const t = f - g0;
        const t2 = t * t; const t3 = t2 * t;
        idx[p] = g0; // grid index of p1 is g0 + 1 (grid is offset by one)
        wts[p * 4] = 0.5 * (-t3 + 2 * t2 - t);
        wts[p * 4 + 1] = 0.5 * (3 * t3 - 5 * t2 + 2);
        wts[p * 4 + 2] = 0.5 * (-3 * t3 + 4 * t2 + t);
        wts[p * 4 + 3] = 0.5 * (t3 - t2);
      }
      return { idx, wts };
    };
    const cx = weights(w);
    const cy = weights(h);
    // Horizontal pass: every grid row → w columns.
    const tmp = new Float32Array(gh * w);
    for (let gy = 0; gy < gh; gy += 1) {
      const row = gy * gw;
      for (let px = 0; px < w; px += 1) {
        const g = row + cx.idx[px];
        const k = px * 4;
        tmp[gy * w + px] = grid[g] * cx.wts[k] + grid[g + 1] * cx.wts[k + 1] + grid[g + 2] * cx.wts[k + 2] + grid[g + 3] * cx.wts[k + 3];
      }
    }
    // Vertical pass.
    for (let py = 0; py < h; py += 1) {
      const g = cy.idx[py];
      const k = py * 4;
      const w0 = cy.wts[k]; const w1 = cy.wts[k + 1]; const w2 = cy.wts[k + 2]; const w3 = cy.wts[k + 3];
      const r0 = g * w; const r1 = r0 + w; const r2 = r1 + w; const r3 = r2 + w;
      const o = py * w;
      for (let px = 0; px < w; px += 1) {
        out[o + px] += tmp[r0 + px] * w0 + tmp[r1 + px] * w1 + tmp[r2 + px] * w2 + tmp[r3 + px] * w3;
      }
    }
  };

  // Single-octave convenience wrapper.
  const addOctave = (out, w, h, x0, y0, b, perm, wl, amp, ang = 0, stretch = 1, off = 0) => addOctaves(out, w, h, x0, y0, b, perm, [{ wl, amp, ang, stretch, off }]);

  // Octave weight: fade an octave in as it becomes resolvable (wavelength
  // 1.5 → 3 px), so detail appears smoothly as you zoom instead of popping.
  const resolveWeight = (wavelengthMm, b) => {
    const wgt = smooth(1.5, 3, wavelengthMm * b);
    return wgt < 0.04 ? 0 : wgt;
  };

  /**
   * Tooth relief in [-1, 1] over a pixel grid (pure; used by chunks + tests).
   * Felt-mark pattern: two broad octaves give irregular rounded cells, a
   * slightly directional stretch, and tanh shaping makes flat plateaus with
   * soft valleys rather than pebbles.
   */
  const heightGrid = (info, seed, x0, y0, w, h, b) => {
    const perm = permFor(seed * 7 + 11);
    const out = new Float32Array(w * h);
    const g = Math.max(0.15, info.grainMm || 1);
    const ang = info.grainAngle || 0;
    const st = info.grainStretch || 1;
    const octaves = [[g * 1.7, 1], [g * 0.8, 0.5], [g * 0.38, 0.22]];
    let total = 0;
    addOctaves(out, w, h, x0, y0, b, perm, octaves.map(([wl, amp], k) => {
      total += amp;
      return { wl, amp: amp * resolveWeight(wl, b), ang: ang + k * 0.4, stretch: st, off: k * 17.3 };
    }));
    const k = 1.3;
    const norm = Math.tanh(k);
    for (let i = 0; i < out.length; i += 1) out[i] = Math.tanh((out[i] / total) * k * 1.6) / norm;
    return out;
  };

  const heightField = (type, seed, x0, y0, size, bucket) => heightGrid(typeInfo(type), seed, x0, y0, size, size, bucket);

  // ---- deterministic per-cell RNG for fibres / speckles --------------------

  const cellRng = (seed, cx, cy, salt) => {
    let s = (Math.imul(cx | 0, 0x27d4eb2d) ^ Math.imul(cy | 0, 0x165667b1) ^ Math.imul((seed * 31 + salt) | 0, 0x9e3779b1)) >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const FIBRE_CELL_MM = 4;

  // Fibres and speckles placed per 4 mm cell from the cell's own RNG, so a
  // fibre is the same fibre in every chunk and at every zoom level.
  const drawStrands = (ctx, info, seed, x0, y0, wMm, hMm, b) => {
    if (!ctx || typeof ctx.stroke !== 'function') return;
    const density = info.fiberDensity || 0;
    const speckle = info.speckle || 0;
    const lenMm = info.fiberLenMm || 1;
    const fibres = density > 0 && lenMm * b >= 3;
    const dots = speckle > 0 && 0.06 * b >= 0.35;
    if (!fibres && !dots) return;
    const reach = lenMm * 1.4 + 0.5;
    const cx0 = Math.floor((x0 - reach) / FIBRE_CELL_MM);
    const cx1 = Math.floor((x0 + wMm + reach) / FIBRE_CELL_MM);
    const cy0 = Math.floor((y0 - reach) / FIBRE_CELL_MM);
    const cy1 = Math.floor((y0 + hMm + reach) / FIBRE_CELL_MM);
    const cellArea = FIBRE_CELL_MM * FIBRE_CELL_MM;
    const tone = info.fiberTone || 0;
    // Fibres stay perceptible at arm's length (as on real kraft/rag) by
    // keeping a 0.6 px minimum stroke; sub-pixel fibres fade by √width.
    const widthMm = 0.05;
    const widthPx = widthMm * b;
    const lineW = Math.max(0.6, widthPx);
    const thin = Math.min(1, Math.sqrt(widthPx / 0.6));
    ctx.lineCap = 'round';
    for (let cy = cy0; cy <= cy1; cy += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        if (fibres) {
          const rand = cellRng(seed, cx, cy, 101);
          const expect = cellArea * density * 0.22;
          const count = Math.floor(expect) + (rand() < expect % 1 ? 1 : 0);
          for (let n = 0; n < count; n += 1) {
            const x = (cx + rand()) * FIBRE_CELL_MM;
            const y = (cy + rand()) * FIBRE_CELL_MM;
            const len = lenMm * (0.45 + rand() * 0.9);
            const ang = rand() * Math.PI * 2;
            const bend = (rand() - 0.5) * len * 0.6;
            const light = rand() < (tone + 1) / 2;
            const alpha = (0.06 + rand() * 0.14) * thin;
            const wMul = 0.6 + rand() * 0.9;
            ctx.strokeStyle = light ? `rgba(255,255,255,${alpha.toFixed(3)})` : `rgba(0,0,0,${alpha.toFixed(3)})`;
            ctx.lineWidth = lineW * wMul;
            const dx = Math.cos(ang) * len * 0.5;
            const dy = Math.sin(ang) * len * 0.5;
            const sx = (x - dx - x0) * b; const sy = (y - dy - y0) * b;
            const ex = (x + dx - x0) * b; const ey = (y + dy - y0) * b;
            const qx = (x - Math.sin(ang) * bend - x0) * b; const qy = (y + Math.cos(ang) * bend - y0) * b;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.bezierCurveTo(sx + (2 / 3) * (qx - sx), sy + (2 / 3) * (qy - sy), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey);
            ctx.stroke();
          }
        }
        if (dots && typeof ctx.ellipse === 'function') {
          const rand = cellRng(seed, cx, cy, 211);
          const expect = cellArea * speckle * 0.05;
          const count = Math.floor(expect) + (rand() < expect % 1 ? 1 : 0);
          for (let n = 0; n < count; n += 1) {
            const x = (cx + rand()) * FIBRE_CELL_MM;
            const y = (cy + rand()) * FIBRE_CELL_MM;
            const r = (0.03 + rand() * rand() * 0.14) * b;
            const alpha = (0.12 + rand() * 0.35) * Math.min(1, r / 0.6);
            ctx.fillStyle = `rgba(20,16,12,${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.ellipse((x - x0) * b, (y - y0) * b, Math.max(0.35, r), Math.max(0.3, r * (0.5 + rand() * 0.5)), rand() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  };

  // ---- canvas helpers ------------------------------------------------------

  const makeCanvas = (w, h) => {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  const imageDataFor = (ctx, w, h) => {
    if (ctx && typeof ctx.createImageData === 'function') {
      try { return ctx.createImageData(w, h); } catch (_e) { /* fall through */ }
    }
    if (typeof G.ImageData === 'function') {
      try { return new G.ImageData(w, h); } catch (_e) { /* fall through */ }
    }
    return null;
  };

  // ---- dry-skip threshold (per paper, zoom-independent) --------------------

  const pitThresholds = new Map();
  const pitValue = (h, fine) => (1 - (h + 1) / 2) * 0.35 + ((fine + 1) / 2) * 0.65;
  const fineOctave = (out, w, h, x0, y0, b, seed) => addOctave(out, w, h, x0, y0, b, permFor(seed * 7 + 53), 0.2, resolveWeight(0.2, b), 0, 1, 3.1);

  // Threshold so `coverage` of the sheet is pits, calibrated once per paper on
  // a fixed full-detail sample (so pinholes don't change with zoom).
  const pitThreshold = (type, seed) => {
    const key = `${type}|${seed}`;
    if (pitThresholds.has(key)) return pitThresholds.get(key);
    const info = typeInfo(type);
    const coverage = Math.max(0, Math.min(0.4, (info.dryskip || 0) * 0.06));
    let thr = 2;
    if (coverage > 0) {
      const b = 16;
      const n = 64;
      const hh = heightGrid(info, seed, 0, 0, n, n, b);
      const ff = new Float32Array(n * n);
      fineOctave(ff, n, n, 0, 0, b, seed);
      const vals = [];
      for (let i = 0; i < n * n; i += 1) vals.push(pitValue(hh[i], ff[i]));
      vals.sort((p, q) => p - q);
      thr = vals[Math.min(vals.length - 1, Math.floor(vals.length * (1 - coverage)))];
    }
    pitThresholds.set(key, thr);
    return thr;
  };

  // ---- chunks --------------------------------------------------------------

  const CHUNK_PX = () => limits().chunkPx || 256;
  const APRON = () => limits().apronPx || 2;

  const bucketFor = (pxPerMm) => {
    const L = limits();
    const lo = L.minBucket || 0.25;
    const hi = L.maxBucket || 128;
    const v = Number.isFinite(pxPerMm) && pxPerMm > 0 ? pxPerMm : 4;
    const bb = 2 ** Math.round(Math.log2(v));
    return Math.max(lo, Math.min(hi, bb));
  };

  const chunkMmFor = (bucket) => CHUNK_PX() / bucket;

  const cache = new Map();
  const stats = { hits: 0, misses: 0, builds: 0, bytes: 0 };
  const entryBytes = (e) => {
    let n = 0;
    ['surface', 'skip', 'feather', 'comp'].forEach((k) => { const c = e[k]; if (c && c.width) n += c.width * c.height * 4; });
    return n;
  };
  // Chunks drawn in the current frame are PINNED: never evicted, so a big
  // viewport can't evict what it is about to draw and re-queue it forever.
  // The cap grows with the visible set (×1.5, bounded by hardCacheBytes).
  let pinned = new Set();
  let pinnedBytes = 0;
  const capBytes = () => {
    const L = limits();
    const base = L.cacheBytes || 64 * 1024 * 1024;
    const hard = L.hardCacheBytes || 128 * 1024 * 1024;
    return Math.min(hard, Math.max(base, pinnedBytes * 1.5));
  };
  const evict = () => {
    const cap = capBytes();
    if (stats.bytes <= cap) return;
    for (const [k, e] of cache) {
      if (stats.bytes <= cap) break;
      if (pinned.has(k)) continue;
      stats.bytes -= e.bytes || 0;
      cache.delete(k);
    }
  };

  const chunkKey = (cfg, b, i, j) => `${cfg.type}|${Number.isFinite(cfg.seed) ? cfg.seed : 1}|${b}|${i}|${j}`;

  /** Rasterise one chunk (surface + skip + feather). */
  const buildChunk = (type, seed, b, i, j) => {
    const info = typeInfo(type);
    const N = CHUNK_PX();
    const A = APRON();
    const W = N + 2 * A;
    const C = N / b;
    // mm of the canvas's (0,0) corner (apron included)
    const x0 = i * C - A / b;
    const y0 = j * C - A / b;
    const surface = makeCanvas(W, W);
    if (!surface) return null;
    stats.builds += 1;
    const ctx = surface.getContext('2d');
    // Height on a grid with a 1 px border for the emboss differences.
    const HW = W + 2;
    const hgt = heightGrid(info, seed, x0 - 1 / b, y0 - 1 / b, HW, HW, b);
    const fine = new Float32Array(W * W);
    fineOctave(fine, W, W, x0, y0, b, seed);
    const mot = new Float32Array(W * W);
    if ((info.mottle || 0) > 0) {
      const mp = permFor(seed * 7 + 37);
      // Formation: flocculent ~5–10 mm clouds over a broad ~30 mm swell.
      addOctaves(mot, W, W, x0, y0, b, mp, [
        { wl: 8, amp: 0.6, ang: 0.3, stretch: 1.2, off: 5.5 },
        { wl: 30, amp: 0.4, ang: 1.1, stretch: 1.0, off: 9.1 },
      ]);
    }
    // Micro-fibre web: under magnification paper is a mat of fine fibres.
    // Streak noise along a wandering fibre direction, faded in only once
    // ~50 µm streaks resolve (deep zoom), so fit-to-screen is unchanged.
    const web = new Float32Array(W * W);
    const webW = resolveWeight(0.05, b);
    if (webW > 0) {
      const ap = permFor(seed * 7 + 71);
      const sp = permFor(seed * 7 + 79);
      const angle = new Float32Array(W * W);
      addOctave(angle, W, W, x0, y0, b, ap, 18, 1);
      for (let py = 0; py < W; py += 1) {
        const ym = y0 + (py + 0.5) / b;
        for (let px = 0; px < W; px += 1) {
          const xm = x0 + (px + 0.5) / b;
          const phi = angle[py * W + px] * Math.PI;
          const ca = Math.cos(phi);
          const sa = Math.sin(phi);
          web[py * W + px] = webW * simplex(sp, (xm * ca + ym * sa) / 0.9, (-xm * sa + ym * ca) / 0.05);
        }
      }
    }
    const tooth = info.tooth || 0;
    const g = Math.max(0.15, info.grainMm || 1);
    // Emboss: slope per mm along the light diagonal × grain size gives a
    // dimensionless, zoom-independent relief; kept low so the sheet reads as
    // paper, not stucco.
    const relief = 0.1 * tooth;
    const diag = (2 * Math.SQRT2) / b;
    const img = imageDataFor(ctx, W, W);
    const skip = makeCanvas(W, W);
    const skCtx = skip && skip.getContext('2d');
    const skImg = skCtx ? imageDataFor(skCtx, W, W) : null;
    const thr = pitThreshold(type, seed);
    const pitSoft = 0.012;
    if (img) {
      const d = img.data;
      for (let py = 0; py < W; py += 1) {
        for (let px = 0; px < W; px += 1) {
          const hi = (py + 1) * HW + (px + 1);
          const hc = hgt[hi];
          const slope = (hgt[hi - HW - 1] - hgt[hi + HW + 1]) / diag;
          let delta = slope * g * relief
            + hc * 0.035 * tooth
            + mot[py * W + px] * 0.11 * (info.mottle || 0)
            + fine[py * W + px] * 0.025
            + web[py * W + px] * 0.05;
          if (delta < 0) delta *= 0.65;
          if (delta > 0.5) delta = 0.5; else if (delta < -0.5) delta = -0.5;
          const o = (py * W + px) * 4;
          const v = delta >= 0 ? 255 : 0;
          d[o] = v; d[o + 1] = v; d[o + 2] = v;
          d[o + 3] = Math.round(Math.abs(delta) * 2 * 255);
          if (skImg) {
            const m = smooth(-0.5, 0.5, (pitValue(hc, fine[py * W + px]) - thr) / pitSoft);
            skImg.data[o + 3] = Math.round(m * 255);
          }
        }
      }
      if (typeof ctx.putImageData === 'function') ctx.putImageData(img, 0, 0);
      if (skImg && typeof skCtx.putImageData === 'function') skCtx.putImageData(skImg, 0, 0);
    }
    drawStrands(ctx, info, seed, x0, y0, W / b, W / b, b);
    // Feather (half resolution): fibre streaks whose direction wanders over
    // ~2 cm, contrast-shaped so the bleed halo frays rather than glows.
    const FW = Math.ceil(W / 2);
    const feather = makeCanvas(FW, FW);
    const fCtx = feather && feather.getContext('2d');
    const fImg = fCtx ? imageDataFor(fCtx, FW, FW) : null;
    if (fImg) {
      const hb = b / 2;
      const ap = permFor(seed * 7 + 71);
      const sp = permFor(seed * 7 + 73);
      const angle = new Float32Array(FW * FW);
      addOctave(angle, FW, FW, x0, y0, hb, ap, 18, 1);
      for (let py = 0; py < FW; py += 1) {
        const ym = y0 + (py + 0.5) / hb;
        for (let px = 0; px < FW; px += 1) {
          const xm = x0 + (px + 0.5) / hb;
          const phi = angle[py * FW + px] * Math.PI;
          const ca = Math.cos(phi);
          const sa = Math.sin(phi);
          const u = (xm * ca + ym * sa) / 1.6;
          const v = (-xm * sa + ym * ca) / 0.14;
          const streak = simplex(sp, u, v) * resolveWeight(0.14, hb) + simplex(sp, xm * 1.7 + 40, ym * 1.7) * 0.5;
          const f = 0.12 + 0.88 * smooth(-0.35, 0.45, streak);
          fImg.data[(py * FW + px) * 4 + 3] = Math.round(f * 255);
        }
      }
      if (typeof fCtx.putImageData === 'function') fCtx.putImageData(fImg, 0, 0);
    }
    return { surface, skip, feather, b, i, j, x0, y0, sizeMm: W / b };
  };

  const getChunk = (cfg, b, i, j, build) => {
    const key = chunkKey(cfg, b, i, j);
    if (cache.has(key)) {
      const hit = cache.get(key);
      cache.delete(key);
      cache.set(key, hit);
      stats.hits += 1;
      return hit;
    }
    if (!build) return null;
    stats.misses += 1;
    const built = buildChunk(cfg.type, Number.isFinite(cfg.seed) ? cfg.seed : 1, b, i, j);
    if (!built) return null;
    built.key = key;
    built.bytes = entryBytes(built);
    cache.set(key, built);
    stats.bytes += built.bytes;
    evict();
    return built;
  };

  // Opaque paper image for a chunk: stock colour + delta × texture.
  const compositeFor = (chunk, color, texture) => {
    if (chunk.comp && chunk.compColor === color && chunk.compTexture === texture) return chunk.comp;
    let c = chunk.comp;
    if (!c) {
      c = makeCanvas(chunk.surface.width, chunk.surface.height);
      if (!c) return null;
      chunk.comp = c;
      chunk.bytes += c.width * c.height * 4;
      stats.bytes += c.width * c.height * 4;
    }
    const cx = c.getContext('2d');
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = color;
    cx.fillRect(0, 0, c.width, c.height);
    cx.globalAlpha = texture;
    if (typeof cx.drawImage === 'function') cx.drawImage(chunk.surface, 0, 0);
    cx.globalAlpha = 1;
    chunk.compColor = color;
    chunk.compTexture = texture;
    return c;
  };

  // ---- idle refinement queue ----------------------------------------------

  // Refinement queue: ONLY the active paper's chunks for the current view,
  // nearest the view centre first (replaced on every frame, so switching
  // paper or panning drops stale jobs). Built in time-budgeted slices
  // (several chunks per ~10 ms slice, at least one), repainting after each.
  let queue = new Map(); // key -> { cfg, b, i, j }
  const waiters = new Set();
  let scheduled = false;
  const SLICE_MS = () => limits().refineSliceMs || 10;
  // Repaint gap while refining: ≥180 ms and ≥3× the caller's measured
  // repaint cost (reportRepaintCost), so slow full-frame repaints can't
  // starve the refinement.
  let repaintCost = 0;
  const repaintGap = () => Math.max(180, repaintCost * 3);
  const reportRepaintCost = (ms) => {
    if (Number.isFinite(ms) && ms >= 0) repaintCost = repaintCost ? repaintCost * 0.5 + ms * 0.5 : ms;
  };
  let lastNotify = 0;
  const now = () => (G.performance && typeof G.performance.now === 'function' ? G.performance.now() : Date.now());
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      const start = now();
      let built = 0;
      for (const [key, job] of queue) {
        if (built > 0 && now() - start >= SLICE_MS()) break;
        queue.delete(key);
        if (!cache.has(key)) {
          const c = getChunk(job.cfg, job.b, job.i, job.j, true);
          if (c && job.pin) { pinned.add(key); pinnedBytes += c.bytes || 0; }
          built += 1;
        }
      }
      if (queue.size) schedule();
      // Repaint at most every REPAINT_MS while refining (a repaint costs a
      // full frame), and once when the queue drains.
      if (built && (!queue.size || now() - lastNotify >= repaintGap())) {
        lastNotify = now();
        const ws = Array.from(waiters);
        if (!queue.size) waiters.clear();
        ws.forEach((fn) => { try { fn(); } catch (_e) { /* caller repaint failed */ } });
      }
    }, 0);
  };

  /**
   * Visible chunk range for a view (mm rect) clipped to the sheet.
   */
  const chunkRange = (b, view, sheet) => {
    const C = chunkMmFor(b);
    const x0 = Math.max(view.x, sheet.x);
    const y0 = Math.max(view.y, sheet.y);
    const x1 = Math.min(view.x + view.w, sheet.x + sheet.w);
    const y1 = Math.min(view.y + view.h, sheet.y + sheet.h);
    if (!(x1 > x0 && y1 > y0)) return null;
    return { i0: Math.floor(x0 / C), i1: Math.floor((x1 - 1e-9) / C), j0: Math.floor(y0 / C), j1: Math.floor((y1 - 1e-9) / C) };
  };

  const chunkCount = (r) => (r ? (r.i1 - r.i0 + 1) * (r.j1 - r.j0 + 1) : 0);
  const CHUNK_BYTES = () => {
    const W = CHUNK_PX() + 2 * APRON();
    const FW = Math.ceil(W / 2);
    return W * W * 4 * 3 + FW * FW * 4;
  };

  /**
   * The bucket actually used for a view: the on-screen one, stepped down
   * (coarser) until the visible set fits the visible-set budget, so a huge
   * retina viewport never needs more chunks than memory allows.
   */
  const bucketForView = (pxPerMm, view, sheet) => {
    const L = limits();
    const budget = L.visibleBytes || 64 * 1024 * 1024;
    const lo = L.minBucket || 0.25;
    let b = bucketFor(pxPerMm);
    while (b > lo && chunkCount(chunkRange(b, view, sheet)) * CHUNK_BYTES() > budget) b /= 2;
    return b;
  };

  const centreOrder = (r, view, b) => {
    const C = chunkMmFor(b);
    const cx = view.x + view.w / 2;
    const cy = view.y + view.h / 2;
    const out = [];
    for (let j = r.j0; j <= r.j1; j += 1) {
      for (let i = r.i0; i <= r.i1; i += 1) {
        const dx = (i + 0.5) * C - cx;
        const dy = (j + 0.5) * C - cy;
        out.push({ i, j, d: dx * dx + dy * dy });
      }
    }
    out.sort((p, q) => p.d - q.d);
    return out;
  };

  /**
   * Collect the chunks to draw, coarse → fine:
   *   1. a cheap fallback level (bucket/8) built now if missing — the same mm
   *      lattice, so it is the same paper, just softer;
   *   2. any cached intermediate levels (bucket/4, bucket/2) on top;
   *   3. the exact chunks we have.
   * When called for the main surface (`allowQueue`), the visible chunks are
   * pinned and the queue is REPLACED with this view's missing chunks: first
   * the bucket/4 level (fast, looks right), then exact, nearest the centre
   * first. Jobs for another paper / bucket / view are dropped.
   */
  const plan = (cfg, pxPerMm, view, sheet, onReady, allowQueue = true) => {
    const b = bucketForView(pxPerMm, view, sheet);
    const range = chunkRange(b, view, sheet);
    if (!range) return { layers: [], complete: true, b };
    const L = limits();
    const lo = L.minBucket || 0.25;
    const job = { type: cfg.type, seed: cfg.seed };
    const keep = new Set();
    const nextQueue = new Map();
    const layers = [];
    const exact = [];
    const missing = [];
    centreOrder(range, view, b).forEach(({ i, j }) => {
      const key = chunkKey(cfg, b, i, j);
      keep.add(key);
      const c = getChunk(cfg, b, i, j, false);
      if (c) exact.push(c); else missing.push({ i, j, key });
    });
    if (missing.length) {
      const fb = Math.max(lo, b / 8);
      const levels = [];
      for (let lb = fb; lb < b; lb *= 2) levels.push(lb);
      levels.forEach((lb, n) => {
        const r = chunkRange(lb, view, sheet);
        if (!r) return;
        const sync = n === 0; // only the coarsest is built synchronously
        centreOrder(r, view, lb).forEach(({ i, j }) => {
          const key = chunkKey(cfg, lb, i, j);
          const c = getChunk(cfg, lb, i, j, sync);
          if (c) { layers.push(c); keep.add(key); } else if (allowQueue && lb === b / 4) {
            nextQueue.set(key, { cfg: job, b: lb, i, j, pin: true });
            keep.add(key);
          }
        });
      });
      if (allowQueue) missing.forEach(({ i, j, key }) => nextQueue.set(key, { cfg: job, b, i, j, pin: true }));
    }
    if (allowQueue) {
      pinned = keep;
      pinnedBytes = 0;
      keep.forEach((k) => { const e = cache.get(k); if (e) pinnedBytes += e.bytes || 0; });
      queue = nextQueue;
      if (queue.size) {
        if (typeof onReady === 'function') waiters.add(onReady);
        schedule();
      } else {
        waiters.clear();
      }
    }
    exact.forEach((c) => layers.push(c));
    return { layers, complete: missing.length === 0, b };
  };

  const drawChunk = (ctx, c, image) => {
    if (!image || typeof ctx.drawImage !== 'function') return;
    ctx.drawImage(image, c.x0, c.y0, c.sizeMm, c.sizeMm);
  };

  /**
   * Draw the textured sheet (opaque) onto ctx, which must already be in
   * document-mm space. view/sheet are mm rects.
   */
  const drawSurface = (ctx, cfg, opts = {}) => {
    if (!ctx || !cfg || !cfg.type) return false;
    const { pxPerMm, view, sheet, onReady } = opts;
    const p = plan(cfg, pxPerMm, view, sheet, onReady);
    if (!p.layers.length) return false;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sheet.x, sheet.y, sheet.w, sheet.h);
    ctx.clip();
    if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = true;
    p.layers.forEach((c) => drawChunk(ctx, c, compositeFor(c, cfg.color, cfg.texture)));
    ctx.restore();
    return true;
  };

  /**
   * Draw a mask ('skip' | 'feather') with the current composite op.
   * Never queues refinement on its own (the surface pass does).
   */
  const drawMask = (ctx, cfg, kind, opts = {}) => {
    if (!ctx || !cfg || !cfg.type) return false;
    const { pxPerMm, view, sheet } = opts;
    const p = plan(cfg, pxPerMm, view, sheet, null, false);
    if (!p.layers.length) return false;
    p.layers.forEach((c) => drawChunk(ctx, c, c[kind]));
    return true;
  };

  const thumbCache = new Map();

  /**
   * A swatch for the paper menu: the stock colour, its surface texture and a
   * short ink stroke showing how the paper takes ink (≈16 mm of paper).
   */
  const thumbDataURL = (type, opts = {}) => {
    const px = opts.px || 96;
    const withStroke = opts.stroke !== false;
    const key = `${type}|${px}|${withStroke ? 's' : '-'}`;
    if (thumbCache.has(key)) return thumbCache.get(key);
    const c = makeCanvas(px, px);
    if (!c) return '';
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    const Paper = Vectura.Paper;
    const info = typeInfo(type);
    const color = (Paper && Paper.baseColorFor) ? Paper.baseColorFor(type) : (info.color || '#ffffff');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, px, px);
    if (type !== 'none' && typeof ctx.drawImage === 'function') {
      const b = px / 16;
      const chunk = buildChunk(type, 7, b, 0, 0);
      if (chunk && chunk.surface) {
        ctx.globalAlpha = info.defaultTexture || 0.6;
        const A = APRON();
        ctx.drawImage(chunk.surface, A, A, px, px, 0, 0, px, px);
        ctx.globalAlpha = 1;
      }
    }
    const dark = Paper && Paper.luminance ? Paper.luminance(color) < 0.18 : false;
    ctx.strokeStyle = dark ? '#f2efe6' : '#1d2433';
    ctx.globalAlpha = info.inkOpacity || 1;
    ctx.lineWidth = Math.max(1.5, px * 0.03);
    ctx.lineCap = 'round';
    if (withStroke && typeof ctx.bezierCurveTo === 'function') {
      ctx.beginPath();
      ctx.moveTo(px * 0.14, px * 0.7);
      ctx.bezierCurveTo(px * 0.38, px * 0.2, px * 0.6, px * 0.95, px * 0.86, px * 0.36);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    let url = '';
    try { url = typeof c.toDataURL === 'function' ? c.toDataURL('image/png') : ''; } catch (_e) { url = ''; }
    thumbCache.set(key, url);
    return url;
  };

  const clearCache = () => {
    cache.clear();
    queue.clear();
    pinned = new Set();
    pinnedBytes = 0;
    waiters.clear();
    thumbCache.clear();
    pitThresholds.clear();
    stats.hits = 0;
    stats.misses = 0;
    stats.builds = 0;
    stats.bytes = 0;
  };

  const cacheStats = () => ({
    ...stats,
    size: cache.size,
    queued: queue.size,
    queuedKeys: Array.from(queue.keys()),
    pinned: pinned.size,
    keys: Array.from(cache.keys()),
  });

  // Run queued refinement now (tests / screenshots).
  const flush = () => {
    for (const [key, job] of queue) {
      queue.delete(key);
      if (!cache.has(key)) getChunk(job.cfg, job.b, job.i, job.j, true);
    }
    const ws = Array.from(waiters);
    waiters.clear();
    ws.forEach((fn) => { try { fn(); } catch (_e) { /* noop */ } });
  };

  Vectura.PaperTexture = {
    drawSurface,
    drawMask,
    thumbDataURL,
    heightField,
    bucketFor,
    chunkMmFor,
    clearCache,
    cacheStats,
    reportRepaintCost,
    flush,
    simplex: (seed, x, y) => simplex(permFor(seed), x, y),
    // Fast seeded 2D simplex for one seed (the ink renderer's mm-locked edge
    // noise): returns (x, y) => value in ≈[-1, 1].
    noise2: (seed) => { const perm = permFor(seed); return (x, y) => simplex(perm, x, y); },
  };
})();
