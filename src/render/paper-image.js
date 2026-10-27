/**
 * Image-based paper textures — window.Vectura.PaperImage.
 *
 * Turns a photo/scan of paper (JPG/PNG/WebP, optional separate height or
 * displacement map) into a tileable, de-lit texture that the procedural
 * paper code (src/render/paper-texture.js) samples in document millimetres,
 * exactly like its noise: isotropic, locked to the sheet, stable across zoom.
 *
 * Import pipeline (processImport, browser):
 *   1. sniff the bytes (PNG / JPEG / WebP only — never SVG/HTML) and read the
 *      pixel size from the file HEADER before anything is decoded (caps on
 *      bytes, sides and total pixels: no decompression bombs)
 *   2. decode straight to the working size (createImageBitmap resize, or
 *      <img> + canvas); transparent pixels are composited over white
 *   3. luminance → de-light: divide by a heavily blurred copy so lighting
 *      gradients and vignetting go (mean 0.5)
 *   4. make tileable: a separable four-way cross-fade of the image and its
 *      half-offset copies, variance-preserving, so no copy's wrap seam is
 *      ever visible (neither at the tile edge nor through the centre)
 *   5. the same for the height map when one is supplied
 *   6. encode the tile (grey WebP, JPEG fallback) under IMAGE.tileMaxBytes,
 *      halving the size until it fits; physical size = tileMm
 *
 * Every pixel pass is a generator that yields per row; runSliced() drives
 * it in ≤ ~12 ms slices (yielding to the event loop between slices), so a
 * 4096 px import never blocks the UI. The same generators run synchronously
 * through runSync() for the pure helpers and tests.
 *
 * Render maps (mapsFromPixels): albedo = de-lit luminance residual around 0,
 * height = high-pass of the height source normalised to [-1, 1]. The paper
 * colour tints the albedo (a light/dark delta on the paper colour).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const cfg = () => ((Vectura.PAPERS && Vectura.PAPERS.IMAGE) || {
    MIME: ['image/png', 'image/jpeg', 'image/webp'],
    fileMaxBytes: 40 * 1024 * 1024,
    minPx: 16,
    maxPx: 16384,
    maxPixels: 64 * 1024 * 1024,
    embedMaxPx: 2048,
    workMaxPx: 2048,
    tileMaxPx: 1024,
    tileMaxBytes: 1536 * 1024,
    defaultDpi: 300,
    tileMmMin: 5,
    tileMmMax: 2000,
    sliceMs: 12,
  });

  const yieldNow = () => new Promise((res) => {
    if (typeof G.setTimeout === 'function') G.setTimeout(res, 0); else res();
  });
  const clock = () => (G.performance && typeof G.performance.now === 'function' ? G.performance.now() : Date.now());

  // ---- slicing ------------------------------------------------------------------

  /** Run a row generator to completion (synchronous). */
  const runSync = (gen) => {
    let r;
    do { r = gen.next(); } while (!r.done);
    return r.value;
  };

  /**
   * Drive a row generator in time slices: each slice runs steps until
   * `budgetMs` has passed, then yields to the event loop. opts: { budgetMs,
   * now, yieldFn, signal, onSlice(steps) } (now/yieldFn/onSlice are seams for
   * tests). Throws { reason: 'aborted' } when the signal aborts.
   */
  const runSliced = async (gen, opts = {}) => {
    const budget = opts.budgetMs != null ? opts.budgetMs : (cfg().sliceMs || 12);
    const now = opts.now || clock;
    const yieldFn = opts.yieldFn || yieldNow;
    for (;;) {
      if (opts.signal && opts.signal.aborted) throw Object.assign(new Error('aborted'), { reason: 'aborted' });
      const t0 = now();
      let steps = 0;
      let r;
      do { r = gen.next(); steps += 1; } while (!r.done && now() - t0 < budget);
      if (opts.onSlice) opts.onSlice(steps);
      if (r.done) return r.value;
      await yieldFn();
    }
  };

  // ---- pure image maths (row generators) -------------------------------------

  // sRGB byte -> linear light (table).
  const LIN = (() => {
    const t = new Float32Array(256);
    for (let i = 0; i < 256; i += 1) {
      const c = i / 255;
      t[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }
    return t;
  })();

  // Transparent pixels read as paper (white), not black.
  function* flattenAlphaGen(rgba, w, h) {
    for (let y = 0; y < h; y += 1) {
      for (let o = y * w * 4, e = o + w * 4; o < e; o += 4) {
        const a = rgba[o + 3];
        if (a < 255) {
          const k = a / 255;
          rgba[o] = Math.round(rgba[o] * k + 255 * (1 - k));
          rgba[o + 1] = Math.round(rgba[o + 1] * k + 255 * (1 - k));
          rgba[o + 2] = Math.round(rgba[o + 2] * k + 255 * (1 - k));
          rgba[o + 3] = 255;
        }
      }
      yield;
    }
    return rgba;
  }

  function* luminanceGen(rgba, w, h, linear) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let i = y * w, o = i * 4, e = i + w; i < e; i += 1, o += 4) {
        const a = rgba[o + 3] === undefined ? 255 : rgba[o + 3];
        const k = a / 255;
        // Composite over white (alpha may be absent in tests' plain arrays).
        const r = rgba[o] * k + 255 * (1 - k);
        const g = rgba[o + 1] * k + 255 * (1 - k);
        const b = rgba[o + 2] * k + 255 * (1 - k);
        out[i] = linear
          ? 0.2126 * LIN[Math.round(r)] + 0.7152 * LIN[Math.round(g)] + 0.0722 * LIN[Math.round(b)]
          : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      }
      yield;
    }
    return out;
  }

  /**
   * RGBA bytes -> Float32 luminance 0..1 (Rec. 709), composited over white.
   * linear: true weighs linear light (for de-lighting and height).
   */
  const luminance = (rgba, w, h, opts = {}) => runSync(luminanceGen(rgba, w, h, Boolean(opts.linear)));

  // Edge handling: 'wrap' (tiles) or 'mirror' (a photo's real borders).
  const edgeIndex = (i, n, mirror) => {
    if (!mirror) return ((i % n) + n) % n;
    const p = 2 * n;
    let m = ((i % p) + p) % p;
    if (m >= n) m = p - 1 - m;
    return m;
  };

  // One separable running-sum box blur pass, one line per step.
  function* blurAxisGen(src, w, h, r, horizontal, mirror) {
    const out = new Float32Array(w * h);
    const n = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const k = 2 * r + 1;
    const at = (line, i) => (horizontal ? src[line * w + edgeIndex(i, n, mirror)] : src[edgeIndex(i, n, mirror) * w + line]);
    for (let line = 0; line < lines; line += 1) {
      let sum = 0;
      for (let i = -r; i <= r; i += 1) sum += at(line, i);
      for (let i = 0; i < n; i += 1) {
        const idx = horizontal ? line * w + i : i * w + line;
        out[idx] = sum / k;
        sum += at(line, i + r + 1) - at(line, i - r);
      }
      yield;
    }
    return out;
  }

  function* boxBlurGen(f, w, h, radius, mirror) {
    const r = Math.max(1, Math.min(Math.floor(radius), Math.floor(Math.min(w, h) / 2) - 1));
    let cur = f;
    for (let pass = 0; pass < 3; pass += 1) {
      cur = yield* blurAxisGen(cur, w, h, r, true, mirror);
      cur = yield* blurAxisGen(cur, w, h, r, false, mirror);
    }
    return cur;
  }

  /** Box blur (3 passes ≈ Gaussian), wrapping (default) or mirroring at the edges. */
  const boxBlurWrap = (f, w, h, radius, opts = {}) => runSync(boxBlurGen(f, w, h, radius, opts.edge === 'mirror'));

  // Radius ≈ 7 % of the tile: three box passes ≈ a Gaussian with σ ≈ 5–10 %.
  function* delightGen(lum, w, h, radius = Math.max(4, Math.round(Math.min(w, h) * 0.07))) {
    // The photo is not a tile yet: mirror its borders so the lighting
    // estimate does not wrap bright edges onto dark ones.
    const low = yield* boxBlurGen(lum, w, h, radius, true);
    const out = new Float32Array(w * h);
    let sum = 0;
    for (let y = 0; y < h; y += 1) {
      for (let i = y * w, e = i + w; i < e; i += 1) {
        out[i] = lum[i] / Math.max(1e-3, low[i]);
        sum += out[i];
      }
      yield;
    }
    const mean = sum / out.length || 1;
    for (let y = 0; y < h; y += 1) {
      for (let i = y * w, e = i + w; i < e; i += 1) out[i] = Math.max(0, Math.min(1, (out[i] / mean) * 0.5));
      yield;
    }
    return out;
  }

  /**
   * De-light: luminance / heavily blurred luminance, rescaled to mean 0.5.
   * Removes lighting gradients and vignetting (scale > radius) and keeps the
   * paper's own structure.
   */
  const delight = (lum, w, h, radius) => runSync(delightGen(lum, w, h, radius));

  /**
   * Make an image tileable: a separable four-way cross-fade of the image A
   * and its half-offset copies B (x), C (y) and D (x+y):
   *   w_A = a(x)·a(y), w_B = (1−a(x))·a(y), w_C = a(x)·(1−a(y)), w_D = (1−a(x))·(1−a(y))
   * with a(t) = sin²(π t) (0 at the border, 1 in the centre). Each copy's
   * wrap seam (A at the border, B at x = W/2, C at y = H/2, D at both) lies
   * exactly where its weight is 0, so no seam is ever exposed. The blend is
   * variance-preserving (deviation from the mean / √Σw²), so cross-faded
   * areas keep the paper's contrast instead of turning into flat blobs.
   */
  function* makeTileableGen(f, w, h) {
    const out = new Float32Array(w * h);
    let mean = 0;
    for (let i = 0; i < f.length; i += 1) mean += f[i];
    mean /= f.length || 1;
    const hw = Math.floor(w / 2);
    const hh = Math.floor(h / 2);
    const ax = new Float32Array(w);
    for (let x = 0; x < w; x += 1) { const s = Math.sin((Math.PI * (x + 0.5)) / w); ax[x] = s * s; }
    for (let y = 0; y < h; y += 1) {
      const s = Math.sin((Math.PI * (y + 0.5)) / h);
      const ay = s * s;
      const y2 = (y + hh) % h;
      for (let x = 0; x < w; x += 1) {
        const x2 = (x + hw) % w;
        const a = ax[x];
        const wA = a * ay; const wB = (1 - a) * ay; const wC = a * (1 - ay); const wD = (1 - a) * (1 - ay);
        const dev = wA * (f[y * w + x] - mean) + wB * (f[y * w + x2] - mean)
          + wC * (f[y2 * w + x] - mean) + wD * (f[y2 * w + x2] - mean);
        const norm = Math.sqrt(wA * wA + wB * wB + wC * wC + wD * wD) || 1;
        out[y * w + x] = Math.max(0, Math.min(1, mean + dev / norm));
      }
      yield;
    }
    return out;
  }
  const makeTileable = (f, w, h) => runSync(makeTileableGen(f, w, h));

  /**
   * High-pass (detail), percentile-normalised: the 98th percentile of
   * |detail| maps to ±1 (robust to specks and dust), clamped to [-1, 1].
   */
  function* highPassGen(f, w, h, radius) {
    const low = yield* boxBlurGen(f, w, h, radius, false);
    const out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i += 1) out[i] = f[i] - low[i];
    const step = Math.max(1, Math.floor(out.length / 16384));
    const sample = [];
    for (let i = 0; i < out.length; i += step) sample.push(Math.abs(out[i]));
    sample.sort((a, b) => a - b);
    yield;
    const p98 = sample[Math.min(sample.length - 1, Math.floor(sample.length * 0.98))] || 1e-6;
    const k = 1 / Math.max(1e-6, p98);
    for (let i = 0; i < out.length; i += 1) out[i] = Math.max(-1, Math.min(1, out[i] * k));
    return out;
  }
  const highPass = (f, w, h, radius) => runSync(highPassGen(f, w, h, radius));

  function* mapsGen(tile, opts = {}) {
    const { w, h } = tile;
    const lum = tile.lum || (yield* luminanceGen(tile.data, w, h, false));
    let mean = 0;
    for (let i = 0; i < lum.length; i += 1) mean += lum[i];
    mean /= lum.length || 1;
    // Albedo = the paper colour × a small residual: lum / mean − 1 (≈ ±5–10 %
    // on real paper), clamped.
    const albedo = new Float32Array(w * h);
    const m = Math.max(1e-3, mean);
    for (let i = 0; i < albedo.length; i += 1) albedo[i] = Math.max(-1, Math.min(1, lum[i] / m - 1));
    yield;
    let height;
    if (opts.height && opts.height.w === w && opts.height.h === h) {
      const hl = opts.height.lum || (yield* luminanceGen(opts.height.data, w, h, false));
      height = yield* highPassGen(hl, w, h, Math.max(2, Math.round(Math.min(w, h) / 16)));
    } else {
      height = yield* highPassGen(lum, w, h, Math.max(2, Math.round(Math.min(w, h) / 64)));
    }
    return { w, h, tileMm: opts.tileMm, albedo, height };
  }

  /**
   * Render maps from a decoded (already de-lit, tileable) grey tile and an
   * optional height tile. albedo: luminance residual around 0 (≈ -1..1);
   * height: [-1, 1] (from the height source when given, else the tile's own
   * fine detail).
   */
  const mapsFromPixels = (tile, opts = {}) => runSync(mapsGen(tile, opts));

  /**
   * Box-filtered mip levels of a map's fields (level 0 = the map), cached on
   * the maps object. Sampling a level whose px/mm is near the chunk's
   * resolution avoids aliasing (shimmer) when zoomed out.
   */
  const mipsFor = (maps) => {
    if (maps._mips) return maps._mips;
    const levels = [{ w: maps.w, h: maps.h, height: maps.height, albedo: maps.albedo }];
    let cur = levels[0];
    while (cur.w >= 8 && cur.h >= 8 && cur.w % 2 === 0 && cur.h % 2 === 0) {
      const w = cur.w / 2; const h = cur.h / 2;
      const next = { w, h, height: new Float32Array(w * h), albedo: new Float32Array(w * h) };
      ['height', 'albedo'].forEach((k) => {
        const src = cur[k]; const dst = next[k];
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const i = 2 * y * cur.w + 2 * x;
            dst[y * w + x] = (src[i] + src[i + 1] + src[i + cur.w] + src[i + cur.w + 1]) / 4;
          }
        }
      });
      levels.push(next);
      cur = next;
    }
    Object.defineProperty(maps, '_mips', { value: levels, enumerable: false });
    return levels;
  };

  /** Bilinear sample of a w×h map at pixel coords (u, v), wrapping. */
  const sampleWrap = (map, w, h, u, v) => {
    const fu = Math.floor(u);
    const fv = Math.floor(v);
    const tu = u - fu;
    const tv = v - fv;
    const x0 = ((fu % w) + w) % w;
    const y0 = ((fv % h) + h) % h;
    const x1 = x0 + 1 === w ? 0 : x0 + 1;
    const y1 = y0 + 1 === h ? 0 : y0 + 1;
    const r0 = y0 * w;
    const r1 = y1 * w;
    const a = map[r0 + x0] + (map[r0 + x1] - map[r0 + x0]) * tu;
    const b = map[r1 + x0] + (map[r1 + x1] - map[r1 + x0]) * tu;
    return a + (b - a) * tv;
  };

  /**
   * Seam score: mean |difference| across the wrap edges divided by the mean
   * |difference| between interior neighbours. ≈1 for a seamless tile, ≫1
   * when the edges don't match.
   */
  const seamScore = (f, w, h) => {
    let edge = 0; let ne = 0; let inner = 0; let ni = 0;
    for (let y = 0; y < h; y += 1) {
      edge += Math.abs(f[y * w + w - 1] - f[y * w]); ne += 1;
      for (let x = 0; x < w - 1; x += 1) { inner += Math.abs(f[y * w + x + 1] - f[y * w + x]); ni += 1; }
    }
    for (let x = 0; x < w; x += 1) {
      edge += Math.abs(f[(h - 1) * w + x] - f[x]); ne += 1;
      for (let y = 0; y < h - 1; y += 1) { inner += Math.abs(f[(y + 1) * w + x] - f[y * w + x]); ni += 1; }
    }
    return (edge / ne) / Math.max(1e-9, inner / ni);
  };

  /**
   * Seam profile over the WHOLE tile (wrap edge and interior): for every
   * column boundary (x → x+1, wrapping) the mean |step| down the image, and
   * the same per row boundary; returns the worst boundary / median boundary.
   * A seamless tile is ≈ 1–1.3; a hard seam anywhere (e.g. through the
   * centre of a badly blended tile) stands out as a spike.
   */
  const seamProfile = (f, w, h) => {
    const cols = new Float64Array(w);
    const rows = new Float64Array(h);
    for (let y = 0; y < h; y += 1) {
      const yn = (y + 1) % h;
      for (let x = 0; x < w; x += 1) {
        const xn = x + 1 === w ? 0 : x + 1;
        const v = f[y * w + x];
        cols[x] += Math.abs(f[y * w + xn] - v);
        rows[y] += Math.abs(f[yn * w + x] - v);
      }
    }
    const worst = (arr) => {
      const s = Array.from(arr).sort((a, b) => a - b);
      const med = s[Math.floor(s.length / 2)] || 1e-9;
      return s[s.length - 1] / Math.max(1e-9, med);
    };
    return Math.max(worst(cols), worst(rows));
  };

  /** Physical tile width in mm from a pixel width and a scan DPI. */
  const tileMmFrom = ({ pxWidth, dpi, tileMm }) => {
    const C = cfg();
    let mm = Number(tileMm);
    if (!(mm > 0)) {
      const d = Number(dpi) > 0 ? Number(dpi) : C.defaultDpi;
      mm = (Number(pxWidth) / d) * 25.4;
    }
    if (!Number.isFinite(mm)) mm = 100;
    return Math.max(C.tileMmMin, Math.min(C.tileMmMax, Math.round(mm * 100) / 100));
  };

  // ---- validation -------------------------------------------------------------

  /** Magic-byte sniff: 'image/png' | 'image/jpeg' | 'image/webp' | null. */
  const sniffMime = (bytes) => {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
      && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    return null;
  };

  /**
   * Pixel size from the file header, without decoding: PNG (IHDR), JPEG
   * (first SOFn marker) and WebP (VP8 / VP8L / VP8X). { w, h } or null.
   */
  const imageSize = (bytes) => {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    const mime = sniffMime(b);
    const be16 = (o) => (b[o] << 8) | b[o + 1];
    const be32 = (o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    if (mime === 'image/png') {
      if (b.length < 24 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
      return { w: be32(16), h: be32(20) };
    }
    if (mime === 'image/jpeg') {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) { o += 1; continue; }
        const m = b[o + 1];
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { o += m === 0xff ? 1 : 2; continue; }
        if (m === 0xd9 || m === 0xda) return null; // end of image / start of scan before any frame header
        const len = be16(o + 2);
        if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: be16(o + 7), h: be16(o + 5) };
        o += 2 + len;
      }
      return null;
    }
    if (mime === 'image/webp') {
      if (b.length < 30) return null;
      const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (chunk === 'VP8 ') return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
      if (chunk === 'VP8L') {
        const b0 = b[21]; const b1 = b[22]; const b2 = b[23]; const b3 = b[24];
        return { w: 1 + (b0 | ((b1 & 0x3f) << 8)), h: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) };
      }
      if (chunk === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      return null;
    }
    return null;
  };

  // Size limits: { minPx, maxPx, maxPixels } -> true when within.
  const sizeOk = (sz, maxPx, maxPixels) => {
    const C = cfg();
    return Boolean(sz) && sz.w >= C.minPx && sz.h >= C.minPx && sz.w <= maxPx && sz.h <= maxPx && sz.w * sz.h <= maxPixels;
  };

  // Decode the first `max` bytes of a base64 string (pure; no atob needed).
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const B64I = (() => { const t = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i += 1) t[B64.charCodeAt(i)] = i; return t; })();
  const base64ToBytes = (b64, max = 64) => {
    const src = String(b64).slice(0, Math.ceil(max / 3) * 4).replace(/=+$/, '');
    const out = new Uint8Array(Math.floor((src.length * 3) / 4));
    let buf = 0;
    let bits = 0;
    let n = 0;
    for (let i = 0; i < src.length; i += 1) {
      const c = src.charCodeAt(i);
      const v = c < 128 ? B64I[c] : -1;
      if (v < 0) return null;
      buf = ((buf << 6) | v) & 0xffffff;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[n] = (buf >> bits) & 0xff;
        n += 1;
      }
    }
    return out.subarray(0, n);
  };

  const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
  const HEAD_BYTES = 256 * 1024; // enough to reach a JPEG SOF behind EXIF/ICC

  // Validated tiles by string identity (a 1.5 MB tile is validated and hashed
  // once, not on every normalize / slider input). Small LRU.
  const validCache = new Map();
  const VALID_CACHE_MAX = 24;
  const rememberValid = (value, info) => {
    if (validCache.has(value)) validCache.delete(value);
    validCache.set(value, info);
    while (validCache.size > VALID_CACHE_MAX) validCache.delete(validCache.keys().next().value);
    return info;
  };
  let validations = 0;

  /**
   * Validate an embedded image data URL: base64 PNG/JPEG/WebP whose bytes
   * really are that format, ≤ maxBytes decoded, and whose HEADER dimensions
   * are within the embedded-tile cap (IMAGE.embedMaxPx per side) — checked
   * before anything is decoded. Returns { url, mime, w, h } or null.
   */
  const validateDataUrlInfo = (value, maxBytes = cfg().tileMaxBytes) => {
    if (typeof value !== 'string') return null;
    const cached = validCache.get(value);
    if (cached && cached.maxBytes >= maxBytes && cached.bytes <= maxBytes) return cached;
    if (value.length > Math.ceil(maxBytes * 4 / 3) + 64) return null;
    validations += 1;
    const m = DATA_URL_RE.exec(value);
    if (!m) return null;
    const pad = m[2].endsWith('==') ? 2 : m[2].endsWith('=') ? 1 : 0;
    const bytes = (m[2].length / 4) * 3 - pad;
    if (bytes > maxBytes) return null;
    const head = base64ToBytes(m[2], m[1] === 'image/jpeg' ? HEAD_BYTES : 64);
    if (!head || sniffMime(head) !== m[1]) return null;
    const C = cfg();
    const sz = imageSize(head);
    const embedMax = C.embedMaxPx || C.tileMaxPx * 2;
    if (!sizeOk(sz, embedMax, embedMax * embedMax)) return null;
    return rememberValid(value, { url: value, mime: m[1], w: sz.w, h: sz.h, bytes, maxBytes });
  };
  const validateDataUrl = (value, maxBytes) => {
    const info = validateDataUrlInfo(value, maxBytes);
    return info ? info.url : null;
  };

  // Small deterministic content hash (FNV-1a over a string) for texture refs.
  const hashString = (s) => {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
    }
    return `${h1.toString(36)}${h2.toString(36)}`.slice(0, 16).padEnd(8, '0');
  };
  // Refs are cached per (tile, height) string pair: hashing a 1.5 MB string
  // once is fine, on every edit it is not.
  const refCache = new Map();
  let hashes = 0;
  const refFor = (tile, height) => {
    const t = tile || '';
    const hgt = height || '';
    const byTile = refCache.get(t);
    if (byTile && byTile.has(hgt)) return byTile.get(hgt);
    hashes += 1;
    const ref = `img-${hashString(`${t}|${hgt}`)}`;
    if (refCache.size >= VALID_CACHE_MAX) refCache.delete(refCache.keys().next().value);
    const m = byTile || new Map();
    m.set(hgt, ref);
    refCache.set(t, m);
    return ref;
  };

  // ---- browser decode / encode -------------------------------------------------

  const makeCanvas = (w, h) => {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  const blobToDataUrl = (blob) => new Promise((resolve) => {
    try {
      const fr = new G.FileReader();
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    } catch (_e) {
      resolve(null);
    }
  });

  // Overridable seam (tests inject a decoder; the browser uses the DOM).
  let decoder = null;

  /**
   * Decode a Blob / data URL to { data: RGBA, w, h }, scaled to ≤ maxPx.
   * `size` (from the header) lets createImageBitmap decode straight to the
   * working size instead of materialising the full image first.
   */
  const decode = async (source, maxPx = cfg().workMaxPx, size = null) => {
    if (decoder) return decoder(source, maxPx);
    const C = cfg();
    let bitmap = null;
    let sw = size ? size.w : 0;
    let sh = size ? size.h : 0;
    const k0 = sw && sh ? Math.min(1, maxPx / Math.max(sw, sh)) : 1;
    try {
      // A (validated) data URL becomes a Blob first, so createImageBitmap can
      // decode it off the main thread (an <img> decode + draw of a 1–2k tile
      // was a ~300 ms main-thread task).
      if (typeof source === 'string' && typeof G.createImageBitmap === 'function' && typeof G.fetch === 'function' && source.startsWith('data:image/')) {
        try { source = await (await G.fetch(source)).blob(); } catch (_e) { /* keep the string: <img> path */ }
      }
      if (typeof G.createImageBitmap === 'function' && source && typeof source !== 'string') {
        // A plain createImageBitmap decodes off the main thread; asking it to
        // resize costs a long main-thread task (measured ~200 ms at 4096 px),
        // so only very large images (memory) are resized while decoding.
        bitmap = sw && sh && k0 < 1 && sw * sh > (C.resizeOnDecodePixels || 24e6)
          ? await G.createImageBitmap(source, { resizeWidth: Math.max(1, Math.round(sw * k0)), resizeHeight: Math.max(1, Math.round(sh * k0)), resizeQuality: 'high' })
          : await G.createImageBitmap(source);
      } else {
        // No createImageBitmap: decode through <img> from a data URL (no
        // object URL to manage).
        const url = typeof source === 'string' ? source : await blobToDataUrl(source);
        if (!url) throw new Error('no decoder');
        bitmap = await new Promise((resolve, reject) => {
          const img = new G.Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('decode failed'));
          img.src = url;
        });
      }
    } catch (_e) {
      throw Object.assign(new Error('decode'), { reason: 'decode' });
    }
    if (!sw || !sh) {
      sw = bitmap.width || bitmap.naturalWidth;
      sh = bitmap.height || bitmap.naturalHeight;
    }
    if (!sizeOk({ w: sw, h: sh }, C.maxPx, C.maxPixels || Infinity)) {
      if (bitmap.close) bitmap.close();
      throw Object.assign(new Error('dimensions'), { reason: 'dimensions' });
    }
    const k = Math.min(1, maxPx / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * k));
    const h = Math.max(1, Math.round(sh * k));
    const c = makeCanvas(w, h);
    const ctx = c && c.getContext('2d');
    if (!ctx) throw Object.assign(new Error('canvas'), { reason: 'decode' });
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    // Draw and read back in horizontal strips, yielding between them, so a
    // 2048 px readback is never one long main-thread task.
    const data = new Uint8ClampedArray(w * h * 4);
    const STRIP = 128;
    for (let y = 0; y < h; y += STRIP) {
      const sh2 = Math.min(STRIP, h - y);
      const bw = bitmap.width || bitmap.naturalWidth || sw;
      const bh = bitmap.height || bitmap.naturalHeight || sh;
      ctx.drawImage(bitmap, 0, (y / h) * bh, bw, (sh2 / h) * bh, 0, y, w, sh2);
      data.set(ctx.getImageData(0, y, w, sh2).data, y * w * 4);
      if (y + STRIP < h) await yieldNow();
    }
    if (bitmap.close) bitmap.close();
    return { data, w, h, srcW: sw, srcH: sh };
  };

  const canvasToDataUrl = (c, type, q) => new Promise((resolve) => {
    // toBlob encodes off the main thread where supported.
    if (typeof c.toBlob === 'function') {
      try {
        c.toBlob((blob) => {
          if (!blob) { resolve(''); return; }
          blobToDataUrl(blob).then((u) => resolve(u || ''));
        }, type, q);
        return;
      } catch (_e) { /* fall through */ }
    }
    try { resolve(c.toDataURL(type, q)); } catch (_e) { resolve(''); }
  });

  function* greyImageGen(ctx, f, w, h) {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      for (let i = y * w, o = i * 4, e = i + w; i < e; i += 1, o += 4) {
        const v = Math.round(Math.max(0, Math.min(1, f[i])) * 255);
        img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
      }
      yield;
    }
    return img;
  }

  // Grey Float32 0..1 -> data URL (WebP, JPEG fallback) under maxBytes,
  // halving the dimensions until it fits.
  const encodeGrey = async (f, w, h, maxBytes, slice) => {
    let curF = f; let cw = w; let ch = h;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const c = makeCanvas(cw, ch);
      const ctx = c && c.getContext('2d');
      if (!ctx) return null;
      ctx.putImageData(await slice(greyImageGen(ctx, curF, cw, ch)), 0, 0);
      for (const [type, q] of [['image/webp', 0.9], ['image/jpeg', 0.88], ['image/webp', 0.75], ['image/jpeg', 0.7]]) {
        const url = await canvasToDataUrl(c, type, q);
        if (url.startsWith(`data:${type};`) && url.length * 0.75 <= maxBytes) return { url, w: cw, h: ch };
      }
      // Too big: halve (box-average) and retry.
      const nw = Math.max(16, Math.floor(cw / 2));
      const nh = Math.max(16, Math.floor(ch / 2));
      const next = new Float32Array(nw * nh);
      for (let y = 0; y < nh; y += 1) {
        for (let x = 0; x < nw; x += 1) {
          const x2 = Math.min(cw - 1, x * 2); const y2 = Math.min(ch - 1, y * 2);
          next[y * nw + x] = (curF[y2 * cw + x2] + curF[y2 * cw + Math.min(cw - 1, x2 + 1)]
            + curF[Math.min(ch - 1, y2 + 1) * cw + x2] + curF[Math.min(ch - 1, y2 + 1) * cw + Math.min(cw - 1, x2 + 1)]) / 4;
        }
      }
      curF = next; cw = nw; ch = nh;
    }
    return null;
  };

  function* resampleGen(f, w, h, nw, nh) {
    if (nw === w && nh === h) return f;
    const out = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y += 1) {
      for (let x = 0; x < nw; x += 1) out[y * nw + x] = sampleWrap(f, w, h, ((x + 0.5) * w) / nw - 0.5, ((y + 0.5) * h) / nh - 0.5);
      yield;
    }
    return out;
  }

  const readBytes = async (blob, n) => {
    try {
      const part = blob.slice ? blob.slice(0, n) : blob;
      if (part.arrayBuffer) return new Uint8Array(await part.arrayBuffer());
      return await new Promise((resolve, reject) => {
        const fr = new G.FileReader();
        fr.onload = () => resolve(new Uint8Array(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsArrayBuffer(part);
      });
    } catch (_e) {
      return null;
    }
  };

  /**
   * Validate an untrusted Blob/File before decoding: type by magic bytes,
   * byte size, and pixel size from the header (sides ≤ maxPx, total ≤
   * maxPixels). { ok, mime, w, h } | { ok:false, reason }.
   */
  const checkBlob = async (blob) => {
    const C = cfg();
    if (!blob || typeof blob !== 'object') return { ok: false, reason: 'image-type' };
    if (Number(blob.size) > C.fileMaxBytes) return { ok: false, reason: 'image-too-large' };
    const head = await readBytes(blob, HEAD_BYTES);
    const mime = head ? sniffMime(head) : null;
    if (!mime || !C.MIME.includes(mime)) return { ok: false, reason: 'image-type' };
    const sz = imageSize(head);
    if (!sizeOk(sz, C.maxPx, C.maxPixels || Infinity)) return { ok: false, reason: 'dimensions' };
    return { ok: true, mime, w: sz.w, h: sz.h };
  };

  /**
   * Full import: Blob (+ optional height Blob) ->
   *   { image: { tile, height?, tileMm, w, h, ref }, meanColor, srcW, srcH }
   * opts: { dpi, tileMm, onProgress(0..1), signal, slice } (slice = a
   * runSliced-compatible driver; tests inject one). Throws { reason }.
   */
  const processImport = async (blob, opts = {}) => {
    const C = cfg();
    const progress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
    const slice = opts.slice || ((gen) => runSliced(gen, { signal: opts.signal }));
    const abortCheck = () => { if (opts.signal && opts.signal.aborted) throw Object.assign(new Error('aborted'), { reason: 'aborted' }); };
    const chk = await checkBlob(blob);
    if (!chk.ok) throw Object.assign(new Error(chk.reason), { reason: chk.reason });
    let hchk = null;
    if (opts.heightBlob) {
      hchk = await checkBlob(opts.heightBlob);
      if (!hchk.ok) throw Object.assign(new Error(hchk.reason), { reason: hchk.reason });
    }
    progress(0.05);
    const img = await decode(blob, C.workMaxPx, chk);
    abortCheck();
    progress(0.2);
    const { w, h } = img;
    await slice(flattenAlphaGen(img.data, w, h));
    // Mean colour of the photo: becomes the paper colour (the tile is a
    // light/dark delta on it, so the colour slider re-tints it).
    const sums = await slice((function* meanGen(d) {
      const acc = [0, 0, 0];
      for (let y = 0; y < h; y += 1) {
        for (let o = y * w * 4, e = o + w * 4; o < e; o += 4) { acc[0] += d[o]; acc[1] += d[o + 1]; acc[2] += d[o + 2]; }
        yield;
      }
      return acc;
    }(img.data)));
    const [r, g, bl] = sums;
    const npx = Math.max(1, img.data.length / 4);
    const hex = (v) => Math.round(Math.max(0, Math.min(255, v / npx))).toString(16).padStart(2, '0');
    const meanColor = `#${hex(r)}${hex(g)}${hex(bl)}`;
    let lum = await slice(luminanceGen(img.data, w, h, true));
    lum = await slice(delightGen(lum, w, h));
    progress(0.45);
    lum = await slice(makeTileableGen(lum, w, h));
    progress(0.6);
    let heightLum = null;
    if (opts.heightBlob) {
      const himg = await decode(opts.heightBlob, C.workMaxPx, hchk);
      abortCheck();
      let hl = await slice(luminanceGen(himg.data, himg.w, himg.h, true));
      hl = await slice(resampleGen(hl, himg.w, himg.h, w, h));
      heightLum = await slice(makeTileableGen(hl, w, h));
    }
    progress(0.75);
    // Embedded tile: ≤ tileMaxPx and ≤ tileMaxBytes.
    const k = Math.min(1, C.tileMaxPx / Math.max(w, h));
    const tw = Math.max(16, Math.round(w * k));
    const th = Math.max(16, Math.round(h * k));
    const tileF = await slice(resampleGen(lum, w, h, tw, th));
    const budget = heightLum ? Math.floor(C.tileMaxBytes / 2) : C.tileMaxBytes;
    const tile = await encodeGrey(tileF, tw, th, budget, slice);
    abortCheck();
    if (!tile) throw Object.assign(new Error('encode'), { reason: 'image-encode' });
    let height = null;
    if (heightLum) {
      const hf = await slice(resampleGen(heightLum, w, h, tile.w, tile.h));
      height = await encodeGrey(hf, tile.w, tile.h, budget, slice);
      if (!height || height.w !== tile.w) height = null;
    }
    abortCheck();
    progress(1);
    const tileMm = tileMmFrom({ pxWidth: img.srcW || w, dpi: opts.dpi, tileMm: opts.tileMm });
    const out = {
      tile: tile.url,
      tileMm,
      w: tile.w,
      h: tile.h,
      ref: refFor(tile.url, height ? height.url : ''),
    };
    if (height) out.height = height.url;
    return { image: out, meanColor, srcW: img.srcW || w, srcH: img.srcH || h };
  };

  // ---- decoded render maps (cache by ref) ---------------------------------------

  const mapsCache = new Map();
  const pending = new Map();

  /** Decoded maps for an embedded image block, or null (decode started). */
  const mapsFor = (image) => {
    if (!image || !image.ref) return null;
    return mapsCache.get(image.ref) || null;
  };

  /**
   * Decode an image block's tile (+ height) into render maps (time-sliced);
   * resolves the maps (cached by ref). Never throws: resolves null on failure.
   */
  const loadMaps = (image) => {
    if (!image || !image.ref || !image.tile) return Promise.resolve(null);
    if (mapsCache.has(image.ref)) return Promise.resolve(mapsCache.get(image.ref));
    if (pending.has(image.ref)) return pending.get(image.ref);
    const p = (async () => {
      try {
        const embedMax = cfg().embedMaxPx || cfg().tileMaxPx * 2;
        const ti = validateDataUrlInfo(image.tile);
        if (!ti) return null; // never decode an unvalidated (possibly huge) tile
        const t = await decode(image.tile, embedMax, ti);
        let hgt = null;
        if (image.height) {
          const hi = validateDataUrlInfo(image.height);
          const hh = hi ? await decode(image.height, embedMax, hi) : null;
          if (hh && hh.w === t.w && hh.h === t.h) hgt = hh;
        }
        const maps = await runSliced(mapsGen(t, { height: hgt, tileMm: image.tileMm }));
        await yieldNow();
        mipsFor(maps); // build the mip chain now, not inside the first chunk build
        mapsCache.set(image.ref, maps);
        return maps;
      } catch (_e) {
        return null;
      } finally {
        pending.delete(image.ref);
      }
    })();
    pending.set(image.ref, p);
    return p;
  };

  // Tests / seams.
  const setDecoder = (fn) => { decoder = typeof fn === 'function' ? fn : null; };
  const putMaps = (ref, maps) => { mapsCache.set(ref, maps); };
  const clearMaps = () => { mapsCache.clear(); pending.clear(); };
  const stats = () => ({ validations, hashes });

  Vectura.PaperImage = {
    luminance,
    boxBlurWrap,
    delight,
    makeTileable,
    highPass,
    mapsFromPixels,
    sampleWrap,
    mipsFor,
    seamScore,
    seamProfile,
    tileMmFrom,
    sniffMime,
    imageSize,
    validateDataUrl,
    validateDataUrlInfo,
    refFor,
    checkBlob,
    decode,
    processImport,
    mapsFor,
    loadMaps,
    runSync,
    runSliced,
    gens: { luminanceGen, delightGen, makeTileableGen, highPassGen, mapsGen, resampleGen, boxBlurGen },
    setDecoder,
    putMaps,
    clearMaps,
    stats,
    blobToDataUrl,
  };
})();
