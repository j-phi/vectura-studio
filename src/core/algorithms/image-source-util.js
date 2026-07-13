/**
 * Shared image-source helper for the picture-driven algorithms (Dotscreen, Weave).
 *
 * Decoded pictures live in a runtime raster store keyed by a content hash — the
 * heavy pixel buffer never travels through layer params or `.vectura` files; only
 * the lightweight `imageSrc` (data URL) + `imageId` + `imageName` descriptors are
 * persisted, and the raster is re-decoded on demand after a reload. When no
 * picture is set the helper returns a procedural shaded-sphere luminance field so
 * the algorithms render something legible immediately (and stay deterministic in
 * headless tests, where image decoding is unavailable).
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const store = (Vectura.IMAGE_SOURCES = Vectura.IMAGE_SOURCES || {});
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const MAX_DECODE = 600; // cap decoded raster's longest side (sampling speed)

  const hashStr = (s) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return 'img-' + (h >>> 0).toString(36);
  };

  // Procedural fallback: a Lambert-shaded sphere lit from the upper-left on a white
  // field — a recognisable subject for tone-driven dots/lines before any upload.
  const builtin = (u, v) => {
    const dx = (u - 0.5) * 2;
    const dy = (v - 0.5) * 2;
    const r2 = dx * dx + dy * dy;
    if (r2 > 1) return 1; // white background outside the disc
    const nz = Math.sqrt(Math.max(0, 1 - r2));
    // Light direction (normalised) from upper-left, slightly toward camera.
    const Lx = -0.45; const Ly = -0.45; const Lz = 0.77;
    const lambert = clamp(dx * Lx + dy * Ly + nz * Lz, 0, 1);
    return clamp(0.12 + 0.88 * lambert, 0, 1);
  };

  // Bilinear luminance (Rec.709), 1 = white, from an ImageData-like raster.
  const sampleRaster = (img, u, v) => {
    const w = img.width; const h = img.height; const data = img.data;
    const x = clamp(u, 0, 1) * (w - 1);
    const y = clamp(v, 0, 1) * (h - 1);
    const x0 = Math.floor(x); const y0 = Math.floor(y);
    const x1 = Math.min(w - 1, x0 + 1); const y1 = Math.min(h - 1, y0 + 1);
    const tx = x - x0; const ty = y - y0;
    const lum = (px, py) => {
      const i = (py * w + px) * 4;
      const a = data[i + 3] / 255;
      const l = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
      return l * a + (1 - a); // composite over white
    };
    const a = lum(x0, y0); const b = lum(x1, y0);
    const c = lum(x0, y1); const d = lum(x1, y1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };

  const get = (p) => (p && p.imageId && store[p.imageId]) || null;

  // Aspect ratio (w/h) of the active source — drives "contain" fitting.
  const aspect = (p) => {
    const img = get(p);
    return img && img.height ? img.width / img.height : 1;
  };

  // Apply the tonal pipeline. Returns luminance in [0,1] (1 = white). Every knob is
  // optional so each algorithm can expose only the ones it wants.
  const adjust = (luma, p) => {
    let l = luma + (Number(p.brightness) || 0) / 100;
    l = (l - 0.5) * (1 + (Number(p.contrast) || 0) / 100) + 0.5;
    const gamma = Number(p.gamma);
    if (Number.isFinite(gamma) && gamma > 0 && gamma !== 1) l = Math.pow(clamp(l, 0, 1), 1 / gamma);
    const bp = clamp((Number(p.blackPoint) || 0) / 100, 0, 0.98);
    const wpRaw = p.whitePoint == null ? 100 : Number(p.whitePoint);
    const wp = clamp((Number.isFinite(wpRaw) ? wpRaw : 100) / 100, bp + 0.02, 1);
    l = (clamp(l, 0, 1) - bp) / (wp - bp);
    l = clamp(l, 0, 1);
    return p.invert ? 1 - l : l;
  };

  // Compile the tonal pipeline ONCE for a layer: every knob is invariant across a
  // generate(), so we parse/clamp the constants up front and return a hot (luma →
  // luma) closure. Arithmetic is bit-identical to adjust() — only the constant
  // sub-expressions are hoisted out of the per-sample path. Algorithms that sample
  // the field millions of times (Weave, Dotscreen) call this instead of adjust().
  const compileAdjust = (p) => {
    const bAdd = (Number(p.brightness) || 0) / 100;
    const cMul = 1 + (Number(p.contrast) || 0) / 100;
    const gamma = Number(p.gamma);
    const useGamma = Number.isFinite(gamma) && gamma > 0 && gamma !== 1;
    const invGamma = 1 / gamma;
    const bp = clamp((Number(p.blackPoint) || 0) / 100, 0, 0.98);
    const wpRaw = p.whitePoint == null ? 100 : Number(p.whitePoint);
    const wp = clamp((Number.isFinite(wpRaw) ? wpRaw : 100) / 100, bp + 0.02, 1);
    const wpSpan = wp - bp;
    const invert = p.invert;
    return (luma) => {
      let l = luma + bAdd;
      l = (l - 0.5) * cMul + 0.5;
      if (useGamma) l = Math.pow(clamp(l, 0, 1), invGamma);
      l = (clamp(l, 0, 1) - bp) / wpSpan;
      l = clamp(l, 0, 1);
      return invert ? 1 - l : l;
    };
  };

  // Master luminance sampler for a layer: picks the decoded raster or the builtin
  // fallback, then runs the tonal pipeline. Returns (u,v) → luma in [0,1].
  const resolveLuma = (p) => {
    const img = get(p);
    const tone = compileAdjust(p);
    return img
      ? (u, v) => tone(sampleRaster(img, u, v))
      : (u, v) => tone(builtin(u, v));
  };

  // Decode a data URL into the runtime store (browser only). Calls onReady() once
  // the raster lands. Returns the imageId immediately (store fills asynchronously).
  const decode = (dataUrl, onReady) => {
    const id = hashStr(dataUrl);
    if (store[id]) { if (onReady) onReady(id); return id; }
    if (typeof document === 'undefined' || typeof Image === 'undefined') return id;
    const im = new Image();
    im.onload = () => {
      const scale = Math.min(1, MAX_DECODE / Math.max(im.width || 1, im.height || 1));
      const w = Math.max(1, Math.round((im.width || 1) * scale));
      const h = Math.max(1, Math.round((im.height || 1) * scale));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(im, 0, 0, w, h);
      try {
        store[id] = ctx.getImageData(0, 0, w, h);
        // Anything memoized off these params was computed against the procedural
        // fallback (the raster wasn't decoded yet) — retire it. `imageId` is a hash of
        // `imageSrc`, so the params do NOT change when the picture lands; without this
        // a cached preset thumbnail would show the fallback for the whole session.
        Vectura.bumpAssetEpoch?.();
      } catch (e) { /* tainted canvas — leave undecoded, fallback handles it */ }
      if (onReady) onReady(id);
    };
    im.onerror = () => { if (onReady) onReady(null); };
    im.src = dataUrl;
    return id;
  };

  // Ensure the layer's persisted picture is decoded into the store (after a reload
  // the raster is gone but imageSrc survives). No-op when already present or empty.
  const ensure = (p, onReady) => {
    if (!p || !p.imageSrc) return false;
    if (p.imageId && store[p.imageId]) return true;
    p.imageId = decode(p.imageSrc, (id) => { if (id) { p.imageId = id; } if (onReady) onReady(id); });
    return Boolean(p.imageId && store[p.imageId]);
  };

  Vectura.ImageSource = {
    store,
    hashStr,
    builtin,
    sampleRaster,
    get,
    aspect,
    adjust,
    resolveLuma,
    decode,
    ensure,
  };
})();
