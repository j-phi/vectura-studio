/**
 * Image-based paper textures — window.Vectura.PaperImage.
 *
 * Turns a photo/scan of paper (JPG/PNG/WebP, optional separate height or
 * displacement map) into a tileable, de-lit texture that the procedural
 * paper code (src/render/paper-texture.js) samples in document millimetres,
 * exactly like its noise: isotropic, locked to the sheet, stable across zoom.
 *
 * Import pipeline (processImport, browser, never blocks for long — every
 * heavy pass yields to the event loop):
 *   1. sniff the bytes (PNG / JPEG / WebP only — never SVG/HTML), size and
 *      dimension caps, decode via createImageBitmap / Image (try/catch)
 *   2. downscale to IMPORT.workMaxPx
 *   3. luminance → de-light: divide by a heavily blurred copy so lighting
 *      gradients and vignetting go (mean 0.5)
 *   4. make tileable: blend with a half-offset copy through a feathered
 *      weight, so the wrap edge is continuous (no seams)
 *   5. the same for the height map when one is supplied
 *   6. encode the tile (grey WebP, JPEG fallback) under IMPORT.tileMaxBytes,
 *      halving the size until it fits; physical size = tileMm (from the scan
 *      DPI or the tile width the user gives, or provider metadata)
 *
 * Render maps (mapsFromPixels, pure): albedo = de-lit luminance around 0,
 * height = high-pass of the height source normalised to [-1, 1]. The paper
 * colour tints the albedo (it is applied as a light/dark delta on the paper
 * colour, like the procedural surface).
 *
 * Pure helpers (exported for tests): luminance, boxBlurWrap, delight,
 * makeTileable, highPass, mapsFromPixels, sampleWrap, seamScore,
 * sniffMime, validateDataUrl, tileMmFrom.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const cfg = () => ((Vectura.PAPERS && Vectura.PAPERS.IMAGE) || {
    MIME: ['image/png', 'image/jpeg', 'image/webp'],
    fileMaxBytes: 40 * 1024 * 1024,
    minPx: 16,
    maxPx: 16384,
    workMaxPx: 2048,
    tileMaxPx: 1024,
    tileMaxBytes: 1536 * 1024,
    defaultDpi: 300,
    tileMmMin: 5,
    tileMmMax: 2000,
  });

  const yieldNow = () => new Promise((res) => {
    if (typeof G.setTimeout === 'function') G.setTimeout(res, 0); else res();
  });

  // ---- pure image maths -----------------------------------------------------

  // sRGB byte -> linear light (table).
  const LIN = (() => {
    const t = new Float32Array(256);
    for (let i = 0; i < 256; i += 1) {
      const c = i / 255;
      t[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }
    return t;
  })();

  /**
   * RGBA bytes -> Float32 luminance 0..1 (Rec. 709). linear: true weighs
   * linear light (physically meaningful for de-lighting and height).
   */
  const luminance = (rgba, w, h, opts = {}) => {
    const out = new Float32Array(w * h);
    if (opts.linear) {
      for (let i = 0, o = 0; i < out.length; i += 1, o += 4) {
        out[i] = 0.2126 * LIN[rgba[o]] + 0.7152 * LIN[rgba[o + 1]] + 0.0722 * LIN[rgba[o + 2]];
      }
      return out;
    }
    for (let i = 0, o = 0; i < out.length; i += 1, o += 4) {
      out[i] = (0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]) / 255;
    }
    return out;
  };

  // Edge handling: 'wrap' (tiles) or 'mirror' (a photo's real borders).
  const edgeIndex = (i, n, mirror) => {
    if (!mirror) return ((i % n) + n) % n;
    const p = 2 * n;
    let m = ((i % p) + p) % p;
    if (m >= n) m = p - 1 - m;
    return m;
  };

  // One separable running-sum box blur pass.
  const blurAxis = (src, w, h, r, horizontal, mirror = false) => {
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
    }
    return out;
  };

  /** Box blur (3 passes ≈ Gaussian), wrapping (default) or mirroring at the edges. */
  const boxBlurWrap = (f, w, h, radius, opts = {}) => {
    const r = Math.max(1, Math.min(Math.floor(radius), Math.floor(Math.min(w, h) / 2) - 1));
    const mirror = opts.edge === 'mirror';
    let cur = f;
    for (let pass = 0; pass < 3; pass += 1) {
      cur = blurAxis(cur, w, h, r, true, mirror);
      cur = blurAxis(cur, w, h, r, false, mirror);
    }
    return cur;
  };

  /**
   * De-light: luminance / heavily blurred luminance, rescaled to mean 0.5.
   * Removes lighting gradients and vignetting (scale > radius) and keeps the
   * paper's own structure.
   */
  // Radius ≈ 7 % of the tile: three box passes ≈ a Gaussian with σ ≈ 5–10 %.
  const delight = (lum, w, h, radius = Math.max(4, Math.round(Math.min(w, h) * 0.07))) => {
    // The photo is not a tile yet: mirror its borders so the lighting
    // estimate does not wrap bright edges onto dark ones.
    const low = boxBlurWrap(lum, w, h, radius, { edge: 'mirror' });
    const out = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0; i < out.length; i += 1) {
      out[i] = lum[i] / Math.max(1e-3, low[i]);
      sum += out[i];
    }
    const mean = sum / out.length || 1;
    for (let i = 0; i < out.length; i += 1) out[i] = Math.max(0, Math.min(1, (out[i] / mean) * 0.5));
    return out;
  };

  /**
   * Make an image tileable: blend it with its half-offset copy. The weight of
   * the offset copy is 1 at the image border (where the original has its
   * seam) and 0 in the centre (where the offset copy has its seam), with a
   * smooth feather between, so neither seam survives.
   */
  const makeTileable = (f, w, h, feather = 0.5) => {
    const out = new Float32Array(w * h);
    const hw = w / 2;
    const hh = h / 2;
    const fz = Math.max(1e-3, Math.min(1, feather));
    const smooth = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < h; y += 1) {
      const dy = Math.abs(y + 0.5 - hh) / hh; // 0 centre .. 1 border
      const sy = (y + Math.floor(hh)) % h;
      for (let x = 0; x < w; x += 1) {
        const dx = Math.abs(x + 0.5 - hw) / hw;
        const d = Math.max(dx, dy);
        const t = Math.max(0, Math.min(1, (d - (1 - fz)) / fz));
        const wOff = smooth(t);
        const sx = (x + Math.floor(hw)) % w;
        out[y * w + x] = f[y * w + x] * (1 - wOff) + f[sy * w + sx] * wOff;
      }
    }
    return out;
  };

  /**
   * High-pass (detail), percentile-normalised: the 2nd..98th percentile of
   * |detail| maps to ±1 (robust to specks and dust), clamped to [-1, 1].
   */
  const highPass = (f, w, h, radius) => {
    const low = boxBlurWrap(f, w, h, radius);
    const out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i += 1) out[i] = f[i] - low[i];
    // Percentile on a strided sample (cheap on large tiles).
    const step = Math.max(1, Math.floor(out.length / 16384));
    const sample = [];
    for (let i = 0; i < out.length; i += step) sample.push(Math.abs(out[i]));
    sample.sort((a, b) => a - b);
    const p98 = sample[Math.min(sample.length - 1, Math.floor(sample.length * 0.98))] || 1e-6;
    const k = 1 / Math.max(1e-6, p98);
    for (let i = 0; i < out.length; i += 1) out[i] = Math.max(-1, Math.min(1, out[i] * k));
    return out;
  };

  /**
   * Render maps from a decoded (already de-lit, tileable) grey tile and an
   * optional height tile. albedo: luminance delta around 0 (≈ -1..1);
   * height: [-1, 1] (from the height source when given, else the tile's own
   * fine detail).
   */
  const mapsFromPixels = (tile, opts = {}) => {
    const { w, h } = tile;
    const lum = tile.lum || luminance(tile.data, w, h);
    let mean = 0;
    for (let i = 0; i < lum.length; i += 1) mean += lum[i];
    mean /= lum.length || 1;
    // Albedo = the paper colour × a small residual: lum / mean − 1 (≈ ±5–10 %
    // on real paper), clamped.
    const albedo = new Float32Array(w * h);
    const m = Math.max(1e-3, mean);
    for (let i = 0; i < albedo.length; i += 1) albedo[i] = Math.max(-1, Math.min(1, lum[i] / m - 1));
    let height;
    if (opts.height && opts.height.w === w && opts.height.h === h) {
      const hl = opts.height.lum || luminance(opts.height.data, w, h);
      height = highPass(hl, w, h, Math.max(2, Math.round(Math.min(w, h) / 16)));
    } else {
      height = highPass(lum, w, h, Math.max(2, Math.round(Math.min(w, h) / 64)));
    }
    return { w, h, tileMm: opts.tileMm, albedo, height };
  };

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
    const x1 = (x0 + 1) % w;
    const y1 = (y0 + 1) % h;
    const a = map[y0 * w + x0] + (map[y0 * w + x1] - map[y0 * w + x0]) * tu;
    const b = map[y1 * w + x0] + (map[y1 * w + x1] - map[y1 * w + x0]) * tu;
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

  // Decode the first `max` bytes of a base64 string (pure; no atob needed).
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const base64ToBytes = (b64, max = 64) => {
    const src = String(b64).slice(0, Math.ceil(max / 3) * 4).replace(/=+$/, '');
    const out = [];
    let buf = 0;
    let bits = 0;
    for (let i = 0; i < src.length; i += 1) {
      const v = B64.indexOf(src[i]);
      if (v < 0) return null;
      buf = (buf << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((buf >> bits) & 0xff);
      }
    }
    return new Uint8Array(out);
  };

  const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

  /**
   * A data URL is accepted only as base64 PNG/JPEG/WebP whose bytes really
   * are that format, under maxBytes (decoded). Returns the URL or null.
   */
  const validateDataUrl = (value, maxBytes = cfg().tileMaxBytes) => {
    if (typeof value !== 'string' || value.length > Math.ceil(maxBytes * 4 / 3) + 64) return null;
    const m = DATA_URL_RE.exec(value);
    if (!m) return null;
    const pad = m[2].endsWith('==') ? 2 : m[2].endsWith('=') ? 1 : 0;
    if ((m[2].length / 4) * 3 - pad > maxBytes) return null;
    const head = base64ToBytes(m[2], 16);
    if (!head || sniffMime(head) !== m[1]) return null;
    return value;
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
  const refFor = (tile, height) => `img-${hashString(`${tile || ''}|${height || ''}`)}`;

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

  /** Decode a Blob / data URL to { data: RGBA, w, h }, scaled to ≤ maxPx. */
  const decode = async (source, maxPx = cfg().workMaxPx) => {
    if (decoder) return decoder(source, maxPx);
    let bitmap = null;
    try {
      if (typeof G.createImageBitmap === 'function' && source && typeof source !== 'string') {
        bitmap = await G.createImageBitmap(source);
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
    const sw = bitmap.width || bitmap.naturalWidth;
    const sh = bitmap.height || bitmap.naturalHeight;
    const C = cfg();
    if (!(sw >= C.minPx && sh >= C.minPx) || sw > C.maxPx || sh > C.maxPx) {
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
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    const img = ctx.getImageData(0, 0, w, h);
    return { data: img.data, w, h, srcW: sw, srcH: sh };
  };

  // Grey Float32 0..1 -> data URL (WebP, JPEG fallback) under maxBytes,
  // halving the dimensions until it fits.
  const encodeGrey = (f, w, h, maxBytes) => {
    let curF = f; let cw = w; let ch = h;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const c = makeCanvas(cw, ch);
      const ctx = c && c.getContext('2d');
      if (!ctx) return null;
      const img = ctx.createImageData(cw, ch);
      for (let i = 0, o = 0; i < cw * ch; i += 1, o += 4) {
        const v = Math.round(Math.max(0, Math.min(1, curF[i])) * 255);
        img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      for (const [type, q] of [['image/webp', 0.9], ['image/jpeg', 0.88], ['image/webp', 0.75], ['image/jpeg', 0.7]]) {
        let url = '';
        try { url = c.toDataURL(type, q); } catch (_e) { url = ''; }
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

  const resampleTo = (f, w, h, nw, nh) => {
    if (nw === w && nh === h) return f;
    const out = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y += 1) {
      for (let x = 0; x < nw; x += 1) out[y * nw + x] = sampleWrap(f, w, h, ((x + 0.5) * w) / nw - 0.5, ((y + 0.5) * h) / nh - 0.5);
    }
    return out;
  };

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

  /** Validate an untrusted Blob/File: { ok, mime } | { ok:false, reason }. */
  const checkBlob = async (blob) => {
    const C = cfg();
    if (!blob || typeof blob !== 'object') return { ok: false, reason: 'image-type' };
    if (Number(blob.size) > C.fileMaxBytes) return { ok: false, reason: 'image-too-large' };
    const head = await readBytes(blob, 16);
    const mime = head ? sniffMime(head) : null;
    if (!mime || !C.MIME.includes(mime)) return { ok: false, reason: 'image-type' };
    return { ok: true, mime };
  };

  /**
   * Full import: Blob (+ optional height Blob) ->
   *   { image: { tile, height?, tileMm, w, h, ref }, meanColor, srcW, srcH }
   * opts: { dpi, tileMm, onProgress(0..1) }. Throws { reason } on failure.
   */
  const processImport = async (blob, opts = {}) => {
    const C = cfg();
    const progress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
    const chk = await checkBlob(blob);
    if (!chk.ok) throw Object.assign(new Error(chk.reason), { reason: chk.reason });
    let heightChk = null;
    if (opts.heightBlob) {
      heightChk = await checkBlob(opts.heightBlob);
      if (!heightChk.ok) throw Object.assign(new Error(heightChk.reason), { reason: heightChk.reason });
    }
    progress(0.05);
    const img = await decode(blob, C.workMaxPx);
    await yieldNow();
    progress(0.2);
    const { w, h } = img;
    // Mean colour of the photo: becomes the paper colour (the tile is a
    // light/dark delta on it, so the colour slider re-tints it).
    let r = 0; let g = 0; let bl = 0;
    for (let o = 0; o < img.data.length; o += 4) { r += img.data[o]; g += img.data[o + 1]; bl += img.data[o + 2]; }
    const npx = Math.max(1, img.data.length / 4);
    const hex = (v) => Math.round(Math.max(0, Math.min(255, v / npx))).toString(16).padStart(2, '0');
    const meanColor = `#${hex(r)}${hex(g)}${hex(bl)}`;
    let lum = luminance(img.data, w, h, { linear: true });
    await yieldNow();
    lum = delight(lum, w, h);
    await yieldNow();
    progress(0.45);
    lum = makeTileable(lum, w, h);
    await yieldNow();
    progress(0.6);
    let heightLum = null;
    if (opts.heightBlob) {
      const himg = await decode(opts.heightBlob, C.workMaxPx);
      await yieldNow();
      let hl = luminance(himg.data, himg.w, himg.h, { linear: true });
      hl = resampleTo(hl, himg.w, himg.h, w, h);
      await yieldNow();
      heightLum = makeTileable(hl, w, h);
      await yieldNow();
    }
    progress(0.75);
    // Embedded tile: ≤ tileMaxPx and ≤ tileMaxBytes.
    const k = Math.min(1, C.tileMaxPx / Math.max(w, h));
    const tw = Math.max(16, Math.round(w * k));
    const th = Math.max(16, Math.round(h * k));
    const tileF = resampleTo(lum, w, h, tw, th);
    const budget = heightLum ? Math.floor(C.tileMaxBytes / 2) : C.tileMaxBytes;
    const tile = encodeGrey(tileF, tw, th, budget);
    await yieldNow();
    if (!tile) throw Object.assign(new Error('encode'), { reason: 'image-encode' });
    let height = null;
    if (heightLum) {
      const hf = resampleTo(heightLum, w, h, tile.w, tile.h);
      height = encodeGrey(hf, tile.w, tile.h, budget);
      if (!height || height.w !== tile.w) height = null;
    }
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
   * Decode an image block's tile (+ height) into render maps; resolves the
   * maps (cached by ref). Never throws: resolves null on failure.
   */
  const loadMaps = (image) => {
    if (!image || !image.ref || !image.tile) return Promise.resolve(null);
    if (mapsCache.has(image.ref)) return Promise.resolve(mapsCache.get(image.ref));
    if (pending.has(image.ref)) return pending.get(image.ref);
    const p = (async () => {
      try {
        const t = await decode(image.tile, cfg().tileMaxPx * 2);
        let hgt = null;
        if (image.height) {
          const hh = await decode(image.height, cfg().tileMaxPx * 2);
          if (hh.w === t.w && hh.h === t.h) hgt = hh;
        }
        await yieldNow();
        const maps = mapsFromPixels(t, { height: hgt, tileMm: image.tileMm });
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
    tileMmFrom,
    sniffMime,
    validateDataUrl,
    refFor,
    checkBlob,
    decode,
    processImport,
    mapsFor,
    loadMaps,
    setDecoder,
    putMaps,
    clearMaps,
    blobToDataUrl,
  };
})();
