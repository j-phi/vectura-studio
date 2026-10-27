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
 * Each chunk holds:
 *   sq       the quantised SHADE field (Uint16): zero-mean relief / fibres /
 *            mottle in linear light, attenuated by the display MTF of each
 *            feature's on-screen size. Composited per colour/strength through
 *            a 4096-entry LUT into an OPAQUE paper image whose mean luminance
 *            equals the chosen paper colour (lit facets brighten, shadowed
 *            ones darken), so overlapping aprons are exact.
 *   skip     alpha mask of the finest, deepest tooth pits — ink is erased there
 *            (destination-out) for the dry-skip pinholes.
 *   feather  half-resolution alpha mask of fibre streaks that frays the
 *            ink-bleed halo (destination-in), so bleed wicks along fibres.
 *
 * Paper Scale (cfg.scale) multiplies every physical size: the texture lives
 * in texture-mm (document mm ÷ scale), so chunks are scale-independent and
 * a Scale drag reuses them.
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
 *   surfacePixels(cfg, x0Mm, y0Mm, sizePx, bucket) -> RGBA (pure; what a chunk shows)
 *   mtfWeight(wavelengthMm, bucket), scaleOf(cfg), shadeStats(type, seed, bucket)
 *   albedoField(type, x0Mm, y0Mm, sizePx, bucket) -> Float32Array | null (image papers)
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
   *   { wl: wavelength mm, amp, amp2?, ang: rotation rad, stretch (along u), off }
   * Coordinates are rotated by `ang` and stretched (slightly directional
   * felt marks). Octaves much larger than a pixel are smooth at that scale:
   * they are summed on ONE shared coarse grid and interpolated once with a
   * separable Catmull-Rom (C1, so the emboss that differentiates the field
   * shows no facets); fine octaves are evaluated per pixel.
   * With `out2`, a second sum with the octaves' `amp2` weights is written in
   * the same pass (one noise evaluation feeds both: the pure field and the
   * display-attenuated one).
   */
  const addOctaves = (out, w, h, x0, y0, b, perm, octaves, out2 = null) => {
    const live = octaves.filter((o) => o && (o.amp > 0 || (out2 && o.amp2 > 0)));
    if (!live.length) return;
    const prep = live.map((o) => ({
      ...o,
      a2: out2 ? (o.amp2 || 0) : 0,
      ca: Math.cos(o.ang || 0),
      sa: Math.sin(o.ang || 0),
      inv: 1 / o.wl,
      st: o.stretch || 1,
      off: o.off || 0,
      wavePx: o.wl * b,
    }));
    let v2 = 0;
    const sampleAll = (list, xm, ym) => {
      let v = 0;
      v2 = 0;
      for (let k = 0; k < list.length; k += 1) {
        const o = list[k];
        const u = (xm * o.ca + ym * o.sa) / o.st;
        const vv = -xm * o.sa + ym * o.ca;
        const n = simplex(perm, u * o.inv + o.off, vv * o.inv - o.off);
        v += o.amp * n;
        v2 += o.a2 * n;
      }
      return v;
    };
    const fine = prep.filter((o) => o.wavePx < 8);
    const smoothList = prep.filter((o) => o.wavePx >= 8);
    if (fine.length) {
      for (let py = 0; py < h; py += 1) {
        const ym = y0 + (py + 0.5) / b;
        for (let px = 0; px < w; px += 1) {
          out[py * w + px] += sampleAll(fine, x0 + (px + 0.5) / b, ym);
          if (out2) out2[py * w + px] += v2;
        }
      }
    }
    if (!smoothList.length) return;
    const minWave = Math.min(...smoothList.map((o) => o.wavePx));
    const step = Math.max(1, Math.min(12, Math.floor(minWave / 4)));
    const gw = Math.ceil(w / step) + 4;
    const gh = Math.ceil(h / step) + 4;
    const grid = new Float32Array(gw * gh);
    const grid2 = out2 ? new Float32Array(gw * gh) : null;
    for (let gy = 0; gy < gh; gy += 1) {
      const ym = y0 + ((gy - 1) * step + 0.5) / b;
      for (let gx = 0; gx < gw; gx += 1) {
        grid[gy * gw + gx] = sampleAll(smoothList, x0 + ((gx - 1) * step + 0.5) / b, ym);
        if (grid2) grid2[gy * gw + gx] = v2;
      }
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
    const tmp = new Float32Array(gh * w);
    const interp = (src, dst) => {
      // Horizontal pass: every grid row → w columns.
      for (let gy = 0; gy < gh; gy += 1) {
        const row = gy * gw;
        for (let px = 0; px < w; px += 1) {
          const g = row + cx.idx[px];
          const k = px * 4;
          tmp[gy * w + px] = src[g] * cx.wts[k] + src[g + 1] * cx.wts[k + 1] + src[g + 2] * cx.wts[k + 2] + src[g + 3] * cx.wts[k + 3];
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
          dst[o + px] += tmp[r0 + px] * w0 + tmp[r1 + px] * w1 + tmp[r2 + px] * w2 + tmp[r3 + px] * w3;
        }
      }
    };
    interp(grid, out);
    if (grid2) interp(grid2, out2);
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
   * Display MTF: the contrast a surface feature of this wavelength keeps once
   * it is only a few device pixels across. Seen from arm's length (or on a
   * screen at fit) paper tooth whose features are ~2 px wide is a faint
   * shimmer, not embossed stucco: exp(-(k/λpx)²) with k = LIMITS.mtfPx
   * (≈ 0.37 at 3 px, 0.57 at 4 px, 0.87 at 8 px, → 1 when zoomed in). The
   * bump positions never move (the field is the same; only its contrast is
   * attenuated), so zooming in reveals the detail smoothly.
   */
  const mtfWeight = (wavelengthMm, b) => {
    const lp = wavelengthMm * b;
    const k = limits().mtfPx || 3;
    return resolveWeight(wavelengthMm, b) * Math.exp(-(k / lp) * (k / lp));
  };

  // Felt-mark octaves (× grainMm): two broad ones give irregular rounded
  // cells, a third adds the crisp rim of each cell.
  const TOOTH_OCTAVES = [[1.7, 1], [0.8, 0.5], [0.38, 0.22]];
  const TOOTH_K = 1.3;
  // Fast tanh (Padé 3/2, clamped): monotonic, |error| < 0.025 — the shaping
  // runs twice per pixel per chunk, where Math.tanh dominated the profile.
  const ftanh = (x) => {
    if (x >= 3) return 1;
    if (x <= -3) return -1;
    const x2 = x * x;
    return (x * (27 + x2)) / (27 + 9 * x2);
  };
  const TOOTH_NORM = ftanh(TOOTH_K);

  /**
   * Tooth relief in [-1, 1] over a pixel grid (pure; used by chunks + tests).
   * Felt-mark pattern: a slightly directional stretch, and tanh shaping makes
   * flat plateaus with soft valleys rather than pebbles.
   * `shaded` (optional, same size): the same relief with every octave
   * attenuated by the display MTF — what the eye sees at this zoom. The pure
   * field (pits for dry-skip, tests) is unchanged by it.
   */
  const proceduralHeightGrid = (info, seed, x0, y0, w, h, b, shaded = null) => {
    const perm = permFor(seed * 7 + 11);
    const out = new Float32Array(w * h);
    const g = Math.max(0.15, info.grainMm || 1);
    const ang = info.grainAngle || 0;
    const st = info.grainStretch || 1;
    let total = 0;
    addOctaves(out, w, h, x0, y0, b, perm, TOOTH_OCTAVES.map(([m, amp], k) => {
      total += amp;
      const wl = g * m;
      return { wl, amp: amp * resolveWeight(wl, b), amp2: amp * mtfWeight(wl, b), ang: ang + k * 0.4, stretch: st, off: k * 17.3 };
    }), shaded);
    const k = (TOOTH_K * 1.6) / total;
    const inv = 1 / TOOTH_NORM;
    for (let i = 0; i < out.length; i += 1) out[i] = ftanh(out[i] * k) * inv;
    if (shaded) for (let i = 0; i < shaded.length; i += 1) shaded[i] = ftanh(shaded[i] * k) * inv;
    return out;
  };

  // ---- image-based papers (custom papers made from a photo/scan) -----------
  //
  // A custom type registered with an `image` block carries a tileable,
  // de-lit texture (src/render/paper-image.js). Once its maps are decoded the
  // surface samples them in document mm (tileMm per tile, wrapping), so the
  // texture is locked to the sheet and zoom-stable like the noise. Past the
  // image's native resolution the procedural tooth is blended in so the
  // surface stays sharp. Papers without an image never reach this code.

  const imageMapsFor = (info) => {
    const PI = Vectura.PaperImage;
    if (!info || !info.image || !PI || typeof PI.mapsFor !== 'function') return null;
    const maps = PI.mapsFor(info.image);
    return maps && maps.tileMm > 0 && maps.w > 0 && maps.h > 0 ? maps : null;
  };

  // Sample one map field over a w×h pixel grid starting at mm (x0, y0).
  // `bias` > 0 picks a coarser mip (the display-MTF view of the photo: its
  // finest texels are attenuated like the procedural octaves).
  const imageGrid = (maps, field, x0, y0, w, h, b, bias = 0) => {
    const PI = Vectura.PaperImage;
    // Pick the mip level nearest the chunk resolution (no aliasing when
    // zoomed out): level L has (w / 2^L) / tileMm px per mm.
    const native = maps.w / maps.tileMm;
    const mips = PI.mipsFor ? PI.mipsFor(maps) : [maps];
    const L = Math.max(0, Math.min(mips.length - 1, Math.floor(Math.log2(Math.max(1, native / b)) + bias)));
    const lvl = mips[L];
    const src = lvl[field];
    const lw = lvl.w;
    const lh = lvl.h;
    const out = new Float32Array(w * h);
    const k = lw / maps.tileMm; // level px per mm (tiles are square px per mm)
    // Bilinear wrap sampling with the per-column / per-row taps precomputed
    // (the grid is axis-aligned), so a chunk costs two lookups per pixel.
    const cx0 = new Int32Array(w); const cx1 = new Int32Array(w); const ctu = new Float32Array(w);
    for (let px = 0; px < w; px += 1) {
      const u = (x0 + (px + 0.5) / b) * k - 0.5;
      const fu = Math.floor(u);
      const xa = ((fu % lw) + lw) % lw;
      cx0[px] = xa; cx1[px] = xa + 1 === lw ? 0 : xa + 1; ctu[px] = u - fu;
    }
    for (let py = 0; py < h; py += 1) {
      const v = (y0 + (py + 0.5) / b) * k - 0.5;
      const fv = Math.floor(v);
      const ya = ((fv % lh) + lh) % lh;
      const r0 = ya * lw;
      const r1 = (ya + 1 === lh ? 0 : ya + 1) * lw;
      const tv = v - fv;
      const row = py * w;
      for (let px = 0; px < w; px += 1) {
        const a0 = src[r0 + cx0[px]]; const a1 = src[r0 + cx1[px]];
        const b0 = src[r1 + cx0[px]]; const b1 = src[r1 + cx1[px]];
        const tu = ctu[px];
        const a = a0 + (a1 - a0) * tu;
        out[row + px] = a + (b0 + (b1 - b0) * tu - a) * tv;
      }
    }
    return out;
  };

  // Weight of the procedural micro-tooth over an image: 0 while the image is
  // at least screen-resolution, rising over the next three zoom octaves.
  const microWeight = (maps, b) => {
    const native = maps.w / maps.tileMm;
    if (b <= native) return 0;
    return Math.min(1, Math.log2(b / native) / 3) * 0.45;
  };

  // Mip bias for the shaded view of a photo: one level coarser while its
  // texels are under ~4 device px, fading to none once well resolved.
  const imageBias = (maps, b) => {
    const native = maps.w / maps.tileMm;
    return b < native * 2 ? 1 : 0;
  };

  const heightGrid = (info, seed, x0, y0, w, h, b, shaded = null) => {
    const maps = imageMapsFor(info);
    if (!maps) return proceduralHeightGrid(info, seed, x0, y0, w, h, b, shaded);
    const out = imageGrid(maps, 'height', x0, y0, w, h, b);
    if (shaded) shaded.set(imageGrid(maps, 'height', x0, y0, w, h, b, imageBias(maps, b)));
    const mw = microWeight(maps, b);
    if (mw > 0.01) {
      const microS = shaded ? new Float32Array(w * h) : null;
      const micro = proceduralHeightGrid(info, seed, x0, y0, w, h, b, microS);
      for (let i = 0; i < out.length; i += 1) out[i] = Math.max(-1, Math.min(1, out[i] * (1 - mw * 0.5) + micro[i] * mw));
      if (shaded) for (let i = 0; i < out.length; i += 1) shaded[i] = Math.max(-1, Math.min(1, shaded[i] * (1 - mw * 0.5) + microS[i] * mw));
    }
    return out;
  };

  const heightField = (type, seed, x0, y0, size, bucket) => heightGrid(typeInfo(type), seed, x0, y0, size, size, bucket);
  const albedoField = (type, x0, y0, size, bucket) => {
    const maps = imageMapsFor(typeInfo(type));
    return maps ? imageGrid(maps, 'albedo', x0, y0, size, size, bucket) : null;
  };

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

  // Fibres and speckles are rasterised in JS straight into the shade field
  // (no canvas read-back; identical in every environment). Each is placed
  // per 4 mm cell from the cell's own RNG, so a fibre is the same fibre in
  // every chunk and at every zoom level. Coverage is area-preserving: a
  // sub-pixel fibre spreads its (physical) width over a pixel at reduced
  // contrast instead of being drawn with a fake minimum width — the same
  // display-MTF law as the relief, so at fit fibres are a faint hint and they
  // resolve as you zoom in. Light fibres brighten (+), dark ones darken (−).
  const FIBRE_K = 1.1;
  const SPECK_K = 1.4;

  // Fibre: polyline `pts` (px) with half width hw; per-pixel max coverage of
  // this fibre (stamp/cov) so its own segments never double-count.
  const rasterFibre = (S, W, stamp, cov, id, pts, hw, amp) => {
    const thin = hw * 2 < 1;
    const reach = thin ? 1 : hw + 0.5;
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const ax = pts[k]; const ay = pts[k + 1]; const bx = pts[k + 2]; const by = pts[k + 3];
      const minX = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + reach));
      const minY = Math.max(0, Math.floor(Math.min(ay, by) - reach));
      const maxY = Math.min(W - 1, Math.ceil(Math.max(ay, by) + reach));
      if (minX > maxX || minY > maxY) continue;
      const dx = bx - ax; const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1e-9;
      for (let py = minY; py <= maxY; py += 1) {
        const cy = py + 0.5;
        for (let px = minX; px <= maxX; px += 1) {
          const cx = px + 0.5;
          let t = ((cx - ax) * dx + (cy - ay) * dy) / len2;
          t = t < 0 ? 0 : (t > 1 ? 1 : t);
          const ex = ax + dx * t - cx; const ey = ay + dy * t - cy;
          const d = Math.sqrt(ex * ex + ey * ey);
          // Area-preserving AA: ∫ coverage across the fibre = its width.
          const c = thin ? hw * 2 * (1 - d) : Math.min(1, hw + 0.5 - d);
          if (c <= 0) continue;
          const idx = py * W + px;
          if (stamp[idx] !== id) { stamp[idx] = id; cov[idx] = 0; }
          if (c > cov[idx]) { S[idx] += (c - cov[idx]) * amp; cov[idx] = c; }
        }
      }
    }
  };

  // The fibres / speckles of one 4 mm cell, in mm (deterministic per cell).
  const cellFibres = (info, seed, cx, cy, fn) => {
    const density = info.fiberDensity || 0;
    const lenMm = info.fiberLenMm || 1;
    const tone = info.fiberTone || 0;
    const rand = cellRng(seed, cx, cy, 101);
    const expect = FIBRE_CELL_MM * FIBRE_CELL_MM * density * 0.22;
    const count = Math.floor(expect) + (rand() < expect % 1 ? 1 : 0);
    for (let n = 0; n < count; n += 1) {
      const x = (cx + rand()) * FIBRE_CELL_MM;
      const y = (cy + rand()) * FIBRE_CELL_MM;
      const len = lenMm * (0.45 + rand() * 0.9);
      const ang = rand() * Math.PI * 2;
      const bend = (rand() - 0.5) * len * 0.6;
      const light = rand() < (tone + 1) / 2;
      const alpha = 0.08 + rand() * 0.16;
      const wMul = 0.6 + rand() * 0.9;
      const dx = Math.cos(ang) * len * 0.5;
      const dy = Math.sin(ang) * len * 0.5;
      fn(x - dx, y - dy, x - Math.sin(ang) * bend, y + Math.cos(ang) * bend, x + dx, y + dy, 0.025 * wMul, (light ? 1 : -1) * alpha * FIBRE_K, len);
    }
  };
  const cellSpeckles = (info, seed, cx, cy, fn) => {
    const rand = cellRng(seed, cx, cy, 211);
    const expect = FIBRE_CELL_MM * FIBRE_CELL_MM * (info.speckle || 0) * 0.05;
    const count = Math.floor(expect) + (rand() < expect % 1 ? 1 : 0);
    for (let n = 0; n < count; n += 1) {
      const x = (cx + rand()) * FIBRE_CELL_MM;
      const y = (cy + rand()) * FIBRE_CELL_MM;
      const r = 0.03 + rand() * rand() * 0.14;
      const alpha = 0.12 + rand() * 0.35;
      const ry = r * (0.5 + rand() * 0.5);
      const rot = rand() * Math.PI;
      fn(x, y, r, ry, rot, -alpha * SPECK_K);
    }
  };
  // Below a few px a fibre (and a sub-0.35 px speckle) is only a mean tint:
  // skip the work, fading in.
  const fibreFadeAt = (info, b) => ((info.fiberDensity || 0) > 0 ? smooth(3, 6, (info.fiberLenMm || 1) * b) : 0);
  const dotFadeAt = (info, b) => ((info.speckle || 0) > 0 ? smooth(0.35, 0.7, 0.06 * b) : 0);
  const bezierPts = (pts, sx, sy, qx, qy, ex, ey, segs) => {
    pts.length = 0;
    for (let k = 0; k <= segs; k += 1) {
      const t = k / segs; const u = 1 - t;
      pts.push(u * u * sx + 2 * u * t * qx + t * t * ex, u * u * sy + 2 * u * t * qy + t * t * ey);
    }
    return pts;
  };

  /**
   * Mean shade the strands add per pixel at bucket b — exact for the
   * rasteriser (area-preserving coverage: a fibre covers length × width, a
   * speckle its ellipse), measured over a fixed 8×8-cell block with the same
   * cell RNG. Subtracted so fibres and speckles are zero-mean too.
   */
  const strandMeanCache = new Map();
  const strandMean = (type, seed, b) => {
    const key = `${type}|${seed}|${b}`;
    if (strandMeanCache.has(key)) return strandMeanCache.get(key);
    const info = typeInfo(type);
    const ff = fibreFadeAt(info, b);
    const df = dotFadeAt(info, b);
    let acc = 0;
    const pts = [];
    if (ff > 0 || df > 0) {
      for (let cy = 0; cy < 8; cy += 1) {
        for (let cx = 0; cx < 8; cx += 1) {
          if (ff > 0) {
            cellFibres(info, seed, cx, cy, (sx, sy, qx, qy, ex, ey, hwMm, amp, len) => {
              const segs = Math.max(2, Math.min(24, Math.ceil((len * b) / 3)));
              bezierPts(pts, sx, sy, qx, qy, ex, ey, segs);
              let L = 0;
              for (let k = 0; k + 3 < pts.length; k += 2) L += Math.hypot(pts[k + 2] - pts[k], pts[k + 3] - pts[k + 1]);
              acc += L * 2 * hwMm * amp * ff; // mm²
            });
          }
          if (df > 0) cellSpeckles(info, seed, cx, cy, (x, y, r, ry, rot, amp) => { acc += Math.PI * r * ry * amp * df; });
        }
      }
    }
    const out = acc / (64 * FIBRE_CELL_MM * FIBRE_CELL_MM);
    if (strandMeanCache.size > 96) strandMeanCache.delete(strandMeanCache.keys().next().value);
    strandMeanCache.set(key, out);
    return out;
  };

  const rasterStrands = (S, W, info, seed, x0, y0, b) => {
    const fibreFade = fibreFadeAt(info, b);
    const dotFade = dotFadeAt(info, b);
    if (!(fibreFade > 0) && !(dotFade > 0)) return;
    const wMm = W / b;
    const reach = (info.fiberLenMm || 1) * 1.4 + 0.5;
    const cx0 = Math.floor((x0 - reach) / FIBRE_CELL_MM);
    const cx1 = Math.floor((x0 + wMm + reach) / FIBRE_CELL_MM);
    const cy0 = Math.floor((y0 - reach) / FIBRE_CELL_MM);
    const cy1 = Math.floor((y0 + wMm + reach) / FIBRE_CELL_MM);
    // Per-pixel max-coverage scratch, allocated on the first fibre that
    // actually touches this chunk.
    let stamp = null;
    let cov = null;
    let id = 0;
    const pts = [];
    const fibre = (msx, msy, mqx, mqy, mex, mey, hwMm, amp, len) => {
      const sx = (msx - x0) * b; const sy = (msy - y0) * b;
      const qx = (mqx - x0) * b; const qy = (mqy - y0) * b;
      const ex = (mex - x0) * b; const ey = (mey - y0) * b;
      const hw = hwMm * b;
      // Off-chunk fibres (bbox test) cost nothing.
      const pad = hw + 1;
      if (Math.max(sx, ex, qx) < -pad || Math.min(sx, ex, qx) > W + pad || Math.max(sy, ey, qy) < -pad || Math.min(sy, ey, qy) > W + pad) return;
      const segs = Math.max(2, Math.min(24, Math.ceil((len * b) / 3)));
      if (!stamp) { stamp = new Int32Array(W * W); cov = new Float32Array(W * W); }
      id += 1;
      rasterFibre(S, W, stamp, cov, id, bezierPts(pts, sx, sy, qx, qy, ex, ey, segs), hw, amp * fibreFade);
    };
    const speck = (x, y, rMm, ryMm, rot, ampFull) => {
      const r = rMm * b; const ry = ryMm * b;
      const ccx = (x - x0) * b; const ccy = (y - y0) * b;
      const minX = Math.max(0, Math.floor(ccx - r - 1)); const maxX = Math.min(W - 1, Math.ceil(ccx + r + 1));
      const minY = Math.max(0, Math.floor(ccy - r - 1)); const maxY = Math.min(W - 1, Math.ceil(ccy + r + 1));
      if (minX > maxX || minY > maxY) return;
      const ca = Math.cos(rot); const sa = Math.sin(rot);
      const amp = (ampFull * dotFade) / 16;
      // 4×4 supersampling: exact area at any size.
      for (let py = minY; py <= maxY; py += 1) {
        for (let px = minX; px <= maxX; px += 1) {
          let hits = 0;
          for (let sy = 0; sy < 4; sy += 1) {
            for (let sx = 0; sx < 4; sx += 1) {
              const ux = px + (sx + 0.5) / 4 - ccx; const uy = py + (sy + 0.5) / 4 - ccy;
              const lx = (ux * ca + uy * sa) / r; const ly = (-ux * sa + uy * ca) / ry;
              if (lx * lx + ly * ly <= 1) hits += 1;
            }
          }
          if (hits) S[py * W + px] += hits * amp;
        }
      }
    };
    for (let cy = cy0; cy <= cy1; cy += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        if (fibreFade > 0) cellFibres(info, seed, cx, cy, fibre);
        if (dotFade > 0) cellSpeckles(info, seed, cx, cy, speck);
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
    ['skip', 'feather', 'comp'].forEach((k) => { const c = e[k]; if (c && c.width) n += c.width * c.height * 4; });
    if (e.sq) n += e.sq.byteLength;
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

  // Chunks live in TEXTURE space (document mm ÷ paper scale): a chunk's
  // pixels depend only on (type, seed, bucket, i, j), never on the Scale
  // slider — scale only changes which bucket/chunks a view needs and where
  // they are drawn, so dragging Scale reuses chunks instead of rebuilding.
  const chunkKey = (cfg, b, i, j) => `${cfg.type}|${Number.isFinite(cfg.seed) ? cfg.seed : 1}|${b}|${i}|${j}`;

  // ---- shading (zero-mean relief in linear light) ---------------------------
  //
  // The surface is a SHADE field s (dimensionless, zero-mean): emboss of the
  // MTF-attenuated relief under a top-left light, cavity tone, formation
  // mottle, fine tooth, micro-fibre web, a photo's albedo and the fibres /
  // speckles. A pixel's colour is, in LINEAR light,
  //   out = gain · C · (1 + texture · s) + texture · SHEEN · s
  // so lit facets brighten and shadowed ones darken around the chosen paper
  // colour C (the old overlay only darkened: the sheet read grey). SHEEN is
  // a small additive term so dark stock still shows its tooth. `gain`
  // (≈1) is solved per paper / bucket / colour / strength on a fixed sample
  // of the field so the sheet's mean luminance equals C's even where
  // highlights clip on near-white stock.
  const SHEEN = 0.03;

  const shadeGrid = (info, seed, x0, y0, W, b, withStrands = true) => {
    const HW = W + 2;
    const hs = new Float32Array(HW * HW);
    // Height on a grid with a 1 px border for the emboss differences: the
    // pure field (dry-skip pits) and the display-attenuated one (shading).
    const hgt = heightGrid(info, seed, x0 - 1 / b, y0 - 1 / b, HW, HW, b, hs);
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
    // Streak noise along a wandering fibre direction, attenuated by the
    // display MTF of its ~50 µm streaks (deep zoom only).
    const web = new Float32Array(W * W);
    const webW = mtfWeight(0.04, b);
    if (webW > 0.01) {
      const ap = permFor(seed * 7 + 71);
      const sp = permFor(seed * 7 + 79);
      const angle = new Float32Array(W * W);
      // Fibres in a sheet cross at random: the local direction changes over
      // ~0.6 mm (a felt, not brushed metal).
      addOctave(angle, W, W, x0, y0, b, ap, 0.6, 1);
      // Each streak layer has a FIXED orientation (6 of them, 30° apart) and
      // the two nearest the local direction are blended:
      // rotating global coordinates by a varying angle sweeps the streak
      // phase (∝ distance from the origin) into moiré rings at deep zoom.
      const DIRS = 6;
      const dca = []; const dsa = [];
      for (let k = 0; k < DIRS; k += 1) { dca.push(Math.cos((k * Math.PI) / DIRS)); dsa.push(Math.sin((k * Math.PI) / DIRS)); }
      for (let py = 0; py < W; py += 1) {
        const ym = y0 + (py + 0.5) / b;
        for (let px = 0; px < W; px += 1) {
          const xm = x0 + (px + 0.5) / b;
          let u = ((angle[py * W + px] * DIRS) % DIRS + DIRS) % DIRS; // orientation in DIRS steps (mod π)
          const k0 = Math.floor(u) % DIRS;
          const k1 = (k0 + 1) % DIRS;
          u -= Math.floor(u);
          const w0 = 1 - u;
          const n0 = simplex(sp, (xm * dca[k0] + ym * dsa[k0]) / 0.3 + k0 * 13.1, (-xm * dsa[k0] + ym * dca[k0]) / 0.04);
          const n1 = simplex(sp, (xm * dca[k1] + ym * dsa[k1]) / 0.3 + k1 * 13.1, (-xm * dsa[k1] + ym * dca[k1]) / 0.04);
          web[py * W + px] = webW * (n0 * w0 + n1 * u) / Math.sqrt(w0 * w0 + u * u);
        }
      }
    }
    // Image papers: the photo's de-lit albedo (display-MTF mip) is a
    // light/dark delta on the paper colour (so the colour slider tints it).
    const imgMaps = imageMapsFor(info);
    const albedo = imgMaps ? imageGrid(imgMaps, 'albedo', x0, y0, W, W, b, imageBias(imgMaps, b)) : null;
    // The photo already shows its paper's tone; its height (high-passed,
    // percentile-normalised) is steeper than the procedural tooth, so image
    // papers use a gentler emboss.
    const SH = shadeK();
    const imageRelief = imgMaps ? 0.3 : 1;
    const tooth = info.tooth || 0;
    const g = Math.max(0.15, info.grainMm || 1);
    // Emboss: slope per mm along the light diagonal × grain size gives a
    // dimensionless, zoom-independent relief.
    const relief = SH.relief * tooth * imageRelief;
    const cavity = SH.cavity * tooth * imageRelief;
    const mottle = SH.mottle * (info.mottle || 0);
    const fineK = resolveWeight(0.2, b) > 0 ? SH.fine * mtfWeight(0.2, b) / resolveWeight(0.2, b) : 0;
    const diag = (2 * Math.SQRT2) / b;
    const s = new Float32Array(W * W);
    for (let py = 0; py < W; py += 1) {
      for (let px = 0; px < W; px += 1) {
        const hi = (py + 1) * HW + (px + 1);
        const slope = (hs[hi - HW - 1] - hs[hi + HW + 1]) / diag;
        const k = py * W + px;
        let v = slope * g * relief
          + hs[hi] * cavity
          + mot[k] * mottle
          + fine[k] * fineK
          + web[k] * SH.web;
        if (albedo) v += albedo[k] * SH.albedo;
        s[k] = v;
      }
    }
    if (withStrands) rasterStrands(s, W, info, seed, x0, y0, b);
    return { s, hgt, fine, HW };
  };

  // Shading coefficients (LIMITS.shade overrides, for calibration).
  const SHADE_DEFAULTS = { relief: 0.2, cavity: 0.08, mottle: 0.16, fine: 0.12, web: 0.22, albedo: 2.2 };
  const shadeK = () => ({ ...SHADE_DEFAULTS, ...(limits().shade || {}) });

  // A photo's maps need not be zero-mean (a user's height scan, a tile with
  // a tone bias): their exact mean over the tile (a mip level is a box
  // filter, so it has the same mean) is what the shade must subtract.
  const mapMeans = new WeakMap();
  const imageMean = (info, b) => {
    const maps = imageMapsFor(info);
    if (!maps) return 0;
    let m = mapMeans.get(maps);
    if (!m) {
      const avg = (f) => { let t = 0; for (let i = 0; i < f.length; i += 1) t += f[i]; return f.length ? t / f.length : 0; };
      m = { albedo: maps.albedo ? avg(maps.albedo) : 0, height: maps.height ? avg(maps.height) : 0 };
      mapMeans.set(maps, m);
    }
    const SH = shadeK();
    const mw = microWeight(maps, b);
    const hk = mw > 0.01 ? 1 - mw * 0.5 : 1;
    return SH.albedo * m.albedo + SH.cavity * (info.tooth || 0) * 0.3 * m.height * hk;
  };

  // Fixed calibration sample of the shade field per (paper, seed, bucket):
  // 768 tiny 2×2 patches scattered over ~25 cm of the sheet (a golden-angle
  // lattice), so the sample is close to independent draws of the field at
  // every zoom — it sees all scales of the relief without building a chunk.
  const statsCache = new Map();
  const SAMPLE_N = 768;
  const SAMPLE_PATCH = 2;
  const statsFor = (type, seed, b) => {
    const key = `${type}|${seed}|${b}`;
    if (statsCache.has(key)) return statsCache.get(key);
    const info = typeInfo(type);
    const P = SAMPLE_PATCH;
    const samples = new Float32Array(SAMPLE_N * P * P);
    for (let k = 0; k < SAMPLE_N; k += 1) {
      const rr = 125 * Math.sqrt((k + 0.5) / SAMPLE_N);
      const th = k * 2.399963229728653;
      const { s } = shadeGrid(info, seed, 130 + rr * Math.cos(th), 130 + rr * Math.sin(th), P, b, false);
      samples.set(s, k * P * P);
    }
    // Every term of the shade is zero-mean by construction (slopes of a
    // stationary field, symmetric tanh relief, simplex mottle/web; strands
    // are corrected exactly by strandMean), so the sample is centred and
    // used ONLY for what clipping does to the mean (solveGain): a sample
    // mean would add sampling noise, not remove bias.
    let mean = 0;
    for (let i = 0; i < samples.length; i += 1) mean += samples[i];
    mean /= samples.length;
    for (let i = 0; i < samples.length; i += 1) samples[i] -= mean;
    const out = { mean: imageMean(info, b), sampleMean: mean, samples };
    if (statsCache.size > 96) statsCache.delete(statsCache.keys().next().value);
    statsCache.set(key, out);
    return out;
  };

  // ---- colour LUT: quantised shade -> packed RGBA ---------------------------

  const Q = 4096;
  const S_RANGE = 2; // shade quantised over [-2, 2]
  const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  const toLin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const encode = (v) => {
    const x = v <= 0 ? 0 : (v >= 1 ? 1 : v);
    return Math.round(255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055));
  };
  const rgbOf = (color) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(color || '').trim());
    const n = m ? parseInt(m[1], 16) : 0xffffff;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const clip01 = (v) => (v <= 0 ? 0 : (v >= 1 ? 1 : v));

  // Exposure gain so the mean linear luminance over the sample equals C's.
  const solveGain = (lin, t, samples) => {
    const target = lumOf(lin[0], lin[1], lin[2]);
    if (!(t > 0) || !(target > 0)) return 1;
    const meanY = (gain) => {
      let acc = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const x = samples[i];
        const m = gain * (1 + t * x);
        const sh = t * SHEEN * x;
        acc += lumOf(clip01(lin[0] * m + sh), clip01(lin[1] * m + sh), clip01(lin[2] * m + sh));
      }
      return acc / samples.length;
    };
    let lo = 0.6; let hi = 1.6;
    if (meanY(hi) <= target) return hi;
    if (meanY(lo) >= target) return lo;
    for (let k = 0; k < 18; k += 1) {
      const mid = (lo + hi) / 2;
      if (meanY(mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };

  const lutCache = new Map();
  const lutFor = (type, seed, b, color, texture) => {
    const t = Math.max(0, Math.min(1, Number(texture) || 0));
    const key = `${type}|${seed}|${b}|${color}|${t}`;
    const hit = lutCache.get(key);
    if (hit) return hit;
    const rgb = rgbOf(color);
    const lin = rgb.map(toLin);
    const gain = solveGain(lin, t, statsFor(type, seed, b).samples);
    const lut = new Uint32Array(Q);
    for (let q = 0; q < Q; q += 1) {
      const x = (q / (Q - 1)) * 2 * S_RANGE - S_RANGE;
      const m = gain * (1 + t * x);
      const sh = t * SHEEN * x;
      const r = encode(lin[0] * m + sh); const g = encode(lin[1] * m + sh); const bb = encode(lin[2] * m + sh);
      lut[q] = LITTLE ? ((255 << 24) | (bb << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (bb << 8) | 255) >>> 0;
    }
    const out = { lut, gain };
    if (lutCache.size > 64) lutCache.delete(lutCache.keys().next().value);
    lutCache.set(key, out);
    return out;
  };

  // Quantised, mean-corrected shade of a W×W region (what a chunk stores).
  const shadeQuant = (type, seed, x0, y0, W, b) => {
    const info = typeInfo(type);
    const field = shadeGrid(info, seed, x0, y0, W, b, true);
    const mean = statsFor(type, seed, b).mean + strandMean(type, seed, b);
    const sq = new Uint16Array(W * W);
    const fs = field.s;
    const qk = (Q - 1) / (2 * S_RANGE);
    const q0 = (S_RANGE - mean) * qk + 0.5;
    for (let i = 0; i < sq.length; i += 1) {
      const q = (fs[i] * qk + q0) | 0;
      sq[i] = q < 0 ? 0 : (q > Q - 1 ? Q - 1 : q);
    }
    return { sq, field };
  };

  /**
   * Opaque RGBA of the textured paper over a size×size pixel grid at mm
   * (x0, y0), bucket px/mm — exactly what a chunk composites (pure; tests
   * measure realism on it: mean luminance, highlights, contrast vs zoom).
   */
  const surfacePixels = (cfg, x0, y0, size, b) => {
    const type = cfg && cfg.type;
    const seed = Number.isFinite(cfg && cfg.seed) ? cfg.seed : 1;
    const { sq } = shadeQuant(type, seed, x0, y0, size, b);
    const { lut } = lutFor(type, seed, b, cfg.color || typeInfo(type).color || '#ffffff', cfg.texture);
    const out = new Uint8ClampedArray(size * size * 4);
    const o32 = new Uint32Array(out.buffer);
    for (let i = 0; i < sq.length; i += 1) o32[i] = lut[sq[i]];
    return out;
  };

  /** Rasterise one chunk (shade + skip + feather). */
  const buildChunk = (type, seed, b, i, j) => {
    const info = typeInfo(type);
    const N = CHUNK_PX();
    const A = APRON();
    const W = N + 2 * A;
    const C = N / b;
    // mm of the canvas's (0,0) corner (apron included)
    const x0 = i * C - A / b;
    const y0 = j * C - A / b;
    const skip = makeCanvas(W, W);
    if (!skip) return null;
    stats.builds += 1;
    const { sq, field } = shadeQuant(type, seed, x0, y0, W, b);
    const { hgt, fine, HW } = field;
    const skCtx = skip.getContext('2d');
    const skImg = skCtx ? imageDataFor(skCtx, W, W) : null;
    if (skImg) {
      const thr = pitThreshold(type, seed);
      const pitSoft = 0.012;
      for (let py = 0; py < W; py += 1) {
        for (let px = 0; px < W; px += 1) {
          const k = py * W + px;
          const m = smooth(-0.5, 0.5, (pitValue(hgt[(py + 1) * HW + (px + 1)], fine[k]) - thr) / pitSoft);
          skImg.data[k * 4 + 3] = Math.round(m * 255);
        }
      }
      if (typeof skCtx.putImageData === 'function') skCtx.putImageData(skImg, 0, 0);
    }
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
    return { type, seed, sq, W, skip, feather, b, i, j, x0, y0, sizeMm: W / b };
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

  let scratch = null;
  let scratch32 = null;
  const scratchImage = (ctx, W) => {
    if (scratch && scratch.width === W && scratch.height === W) return scratch;
    const img = imageDataFor(ctx, W, W);
    // A stub / foreign context may hand back a short buffer: composite plain.
    if (!img || !img.data || !img.data.buffer || img.data.length < W * W * 4) return null;
    scratch = img;
    scratch32 = new Uint32Array(img.data.buffer, img.data.byteOffset, W * W);
    return scratch;
  };

  // Opaque paper image for a chunk: the shade through the colour LUT.
  const compositeFor = (chunk, color, texture) => {
    if (chunk.comp && chunk.compColor === color && chunk.compTexture === texture) return chunk.comp;
    let c = chunk.comp;
    if (!c) {
      c = makeCanvas(chunk.W, chunk.W);
      if (!c) return null;
      chunk.comp = c;
      chunk.bytes = (chunk.bytes || 0) + c.width * c.height * 4;
      if (cache.get(chunk.key) === chunk) stats.bytes += c.width * c.height * 4;
    }
    const cx = c.getContext('2d');
    // One scratch ImageData shared by every chunk (putImageData copies), so a
    // Texture / colour drag allocates nothing per chunk.
    const img = cx ? scratchImage(cx, chunk.W) : null;
    if (img && typeof cx.putImageData === 'function') {
      const { lut } = lutFor(chunk.type, chunk.seed, chunk.b, color, texture);
      const o32 = scratch32;
      const sq = chunk.sq;
      const n = sq.length;
      for (let i = 0; i < n; i += 1) o32[i] = lut[sq[i]];
      cx.putImageData(img, 0, 0);
    } else if (cx) {
      cx.globalAlpha = 1;
      cx.globalCompositeOperation = 'source-over';
      cx.fillStyle = color;
      cx.fillRect(0, 0, c.width, c.height);
    }
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
    return W * W * (2 + 4 + 4) + FW * FW * 4; // shade + skip + composite, feather
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

  // Paper Scale (cfg.scale, 1 = the calibrated physical grain): the texture
  // lives in texture-mm = document mm ÷ scale, so a view is planned in
  // texture space (px per texture-mm = on-screen px/mm × scale) and each
  // chunk is drawn scale× larger in document mm.
  const scaleOf = (cfg) => {
    const L = limits();
    const v = Number(cfg && cfg.scale);
    if (!Number.isFinite(v) || v <= 0) return 1;
    return Math.max(L.scaleMin || 0.25, Math.min(L.scaleMax || 3, v));
  };
  const toTexture = (opts, sc) => ({
    pxPerMm: (opts.pxPerMm || 0) * sc,
    view: { x: opts.view.x / sc, y: opts.view.y / sc, w: opts.view.w / sc, h: opts.view.h / sc },
    sheet: { x: opts.sheet.x / sc, y: opts.sheet.y / sc, w: opts.sheet.w / sc, h: opts.sheet.h / sc },
  });

  const drawChunk = (ctx, c, image, sc = 1) => {
    if (!image || typeof ctx.drawImage !== 'function') return;
    ctx.drawImage(image, c.x0 * sc, c.y0 * sc, c.sizeMm * sc, c.sizeMm * sc);
  };

  /**
   * Draw the textured sheet (opaque) onto ctx, which must already be in
   * document-mm space. view/sheet are mm rects.
   */
  const drawSurface = (ctx, cfg, opts = {}) => {
    if (!ctx || !cfg || !cfg.type || !opts.view || !opts.sheet) return false;
    const { sheet, onReady } = opts;
    const sc = scaleOf(cfg);
    const tx = toTexture(opts, sc);
    const p = plan(cfg, tx.pxPerMm, tx.view, tx.sheet, onReady);
    if (!p.layers.length) return false;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sheet.x, sheet.y, sheet.w, sheet.h);
    ctx.clip();
    if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = true;
    p.layers.forEach((c) => drawChunk(ctx, c, compositeFor(c, cfg.color, cfg.texture), sc));
    ctx.restore();
    return true;
  };

  /**
   * Draw a mask ('skip' | 'feather') with the current composite op.
   * Never queues refinement on its own (the surface pass does).
   */
  const drawMask = (ctx, cfg, kind, opts = {}) => {
    if (!ctx || !cfg || !cfg.type || !opts.view || !opts.sheet) return false;
    const sc = scaleOf(cfg);
    const tx = toTexture(opts, sc);
    const p = plan(cfg, tx.pxPerMm, tx.view, tx.sheet, null, false);
    if (!p.layers.length) return false;
    p.layers.forEach((c) => drawChunk(ctx, c, c[kind], sc));
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
      const comp = chunk ? compositeFor(chunk, color, info.defaultTexture || 0.4) : null;
      if (comp) {
        const A = APRON();
        ctx.drawImage(comp, A, A, px, px, 0, 0, px, px);
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

  // clearCache(type): drop only that paper type's chunks, thumbnail and
  // dry-skip threshold (a custom paper's parameters changed); other papers'
  // cached work stays. No argument: clear everything.
  const clearType = (type) => {
    const prefix = `${type}|`;
    for (const [k, e] of cache) {
      if (k.startsWith(prefix)) { stats.bytes -= e.bytes || 0; cache.delete(k); pinned.delete(k); }
    }
    for (const k of Array.from(queue.keys())) if (k.startsWith(prefix)) queue.delete(k);
    for (const k of Array.from(thumbCache.keys())) if (k.startsWith(prefix)) thumbCache.delete(k);
    for (const k of Array.from(pitThresholds.keys())) if (k.startsWith(prefix)) pitThresholds.delete(k);
    for (const k of Array.from(statsCache.keys())) if (k.startsWith(prefix)) statsCache.delete(k);
    for (const k of Array.from(strandMeanCache.keys())) if (k.startsWith(prefix)) strandMeanCache.delete(k);
    for (const k of Array.from(lutCache.keys())) if (k.startsWith(prefix)) lutCache.delete(k);
    if (stats.bytes < 0) stats.bytes = 0;
  };

  const clearCache = (type) => {
    if (typeof type === 'string' && type) { clearType(type); return; }
    cache.clear();
    queue.clear();
    pinned = new Set();
    pinnedBytes = 0;
    waiters.clear();
    thumbCache.clear();
    pitThresholds.clear();
    statsCache.clear();
    strandMeanCache.clear();
    lutCache.clear();
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
    albedoField,
    surfacePixels,
    shadeStats: (type, seed, b) => { const sd = Number.isFinite(seed) ? seed : 1; const st = statsFor(type, sd, b); return { sampleMean: st.sampleMean, strandMean: strandMean(type, sd, b), n: st.samples.length }; },
    mtfWeight,
    scaleOf,
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
