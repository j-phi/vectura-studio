/**
 * Paper texture synthesis (paper selector) — window.Vectura.PaperTexture.
 *
 * Builds seamless, seeded texture tiles for the realistic paper preview:
 *
 *   getTile(cfg, pxPerMm) -> { canvas, skip, feather, bucket, key } | null
 *     canvas   RGBA surface tile. Each pixel is black (shadow) or white
 *              (highlight) with an alpha, so drawing it source-over at
 *              globalAlpha = texture darkens/lightens ANY base colour (white
 *              stock and black stock alike). Encodes mottling (formation),
 *              embossed tooth lit from the upper left, fibres and speckles.
 *     skip     alpha mask of the tooth valleys — ink is erased there
 *              (destination-out) for the dry-skip on rough/cold-press stock.
 *     feather  alpha mask that frays the ink-bleed halo along the fibres.
 *     bucket   tile pixels per document millimetre. Draw the tile as a
 *              pattern scaled by 1/bucket in document (mm) space so the
 *              texture pans and zooms with the sheet.
 *   thumbDataURL(type) -> data: URL swatch for the paper menu.
 *   bucketFor(pxPerMm), cacheKey(cfg, pxPerMm), clearCache(), cacheStats()
 *   buildFields(type, seed, bucket, size) -> { height, fine } (pure,
 *     Float32Array fields in 0..1; exposed for unit tests).
 *
 * Every noise field is periodic over the tile (lattice indices wrap), so the
 * tile repeats without seams. The cache is an LRU keyed on
 * type|seed|bucket — colour, texture strength and bleed are applied at draw
 * time and never force a rebuild.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const papers = () => Vectura.PAPERS || { TYPES: {}, LIMITS: {} };
  const limits = () => papers().LIMITS || {};

  // ---- deterministic hashing / periodic value noise -----------------------

  // 32-bit integer hash -> [0, 1).
  const hash3 = (x, y, s) => {
    let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  /**
   * Periodic fBm value noise over a size×size tile. `cellPx` is the base
   * lattice cell size in pixels; the lattice period is rounded so it divides
   * the tile exactly (seamless). Octaves finer than ~1.5 px are dropped (LOD).
   * Returns a Float32Array normalised to 0..1.
   */
  const periodicFbm = (size, cellPx, octaves, seed, gain = 0.5) => {
    const out = new Float32Array(size * size);
    let amp = 1;
    let total = 0;
    let period = Math.max(1, Math.round(size / Math.max(1, cellPx)));
    for (let o = 0; o < octaves; o += 1) {
      const cell = size / period;
      if (cell < 1.5) break;
      const s = (seed * 131 + o * 7919) | 0;
      const lattice = new Float32Array(period * period);
      for (let j = 0; j < period; j += 1) {
        for (let i = 0; i < period; i += 1) lattice[j * period + i] = hash3(i, j, s);
      }
      for (let y = 0; y < size; y += 1) {
        const fy = y / cell;
        const y0 = Math.floor(fy);
        const ty = fade(fy - y0);
        const r0 = (y0 % period) * period;
        const r1 = ((y0 + 1) % period) * period;
        for (let x = 0; x < size; x += 1) {
          const fx = x / cell;
          const x0 = Math.floor(fx);
          const tx = fade(fx - x0);
          const c0 = x0 % period;
          const c1 = (x0 + 1) % period;
          const a = lattice[r0 + c0];
          const b = lattice[r0 + c1];
          const c = lattice[r1 + c0];
          const d = lattice[r1 + c1];
          const top = a + (b - a) * tx;
          const bot = c + (d - c) * tx;
          out[y * size + x] += (top + (bot - top) * ty) * amp;
        }
      }
      total += amp;
      amp *= gain;
      period *= 2;
    }
    if (total > 0) {
      for (let i = 0; i < out.length; i += 1) out[i] /= total;
    } else {
      out.fill(0.5);
    }
    return out;
  };

  // Stretch a field so its 2nd..98th percentile spans 0..1 (value noise
  // averages towards 0.5; this restores contrast deterministically).
  const normalizeField = (f) => {
    const n = f.length;
    const step = Math.max(1, Math.floor(n / 4096));
    const sample = [];
    for (let i = 0; i < n; i += step) sample.push(f[i]);
    sample.sort((p, q) => p - q);
    const lo = sample[Math.floor(sample.length * 0.02)];
    const hi = sample[Math.floor(sample.length * 0.98)];
    const span = hi - lo > 1e-6 ? hi - lo : 1;
    for (let i = 0; i < n; i += 1) {
      const v = (f[i] - lo) / span;
      f[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return f;
  };

  const typeInfo = (type) => {
    const T = papers().TYPES || {};
    return T[type] || T.none || {};
  };

  /**
   * Pure field synthesis for a paper type at `bucket` px/mm.
   *  height  tooth relief (0 valley .. 1 peak)
   *  fine    fine fibre-scale noise (feathering / micro grain)
   */
  const buildFields = (type, seed, bucket, size) => {
    const info = typeInfo(type);
    const grainPx = Math.max(0.5, (info.grainMm || 1) * bucket);
    // Tooth: a dominant grain-sized octave plus finer detail; squaring the
    // dominant octave makes rounded "bumps" rather than a fog.
    const base = normalizeField(periodicFbm(size, grainPx * 1.6, 2, seed + 11, 0.45));
    const detail = periodicFbm(size, grainPx * 0.55, 2, seed + 23, 0.5);
    const height = new Float32Array(size * size);
    for (let i = 0; i < height.length; i += 1) {
      const b = base[i];
      height[i] = 0.78 * b * b * (3 - 2 * b) + 0.22 * detail[i];
    }
    normalizeField(height);
    // Fibre-scale micro grain (dry-skip pinholes, feathering, micro tone).
    // Formation clouds live in the separate large mottle tile.
    const fine = normalizeField(periodicFbm(size, Math.max(1.5, 0.2 * bucket), 1, seed + 53, 0.5));
    return { height, fine };
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

  // Draw `fn(dx, dy)` at the 9 wrap offsets so marks crossing an edge
  // continue on the opposite edge (keeps the tile seamless).
  const wrapped = (size, x, y, reach, fn) => {
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const px = x + ox * size;
        const py = y + oy * size;
        if (px < -reach || px > size + reach || py < -reach || py > size + reach) continue;
        fn(ox * size, oy * size);
      }
    }
  };

  const rngFor = (seed) => {
    if (typeof Vectura.SeededRNG === 'function') {
      const r = new Vectura.SeededRNG((seed * 2654435761) >>> 1);
      return () => r.nextFloat();
    }
    let s = (seed >>> 0) || 1;
    return () => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return (s & 0x7fffffff) / 0x7fffffff;
    };
  };

  // Fibres: short, gently curved strands. tone > 0 = lighter than the stock,
  // tone < 0 = darker (kraft/newsprint carry both).
  const drawFibres = (ctx, size, info, bucket, seed) => {
    const density = info.fiberDensity || 0;
    if (density <= 0 || !ctx || typeof ctx.stroke !== 'function') return;
    const lenPx = Math.max(2, (info.fiberLenMm || 1) * bucket);
    if (lenPx < 2.5) return;
    const areaMm2 = (size / bucket) * (size / bucket);
    const count = Math.min(9000, Math.round(areaMm2 * density * 0.22));
    const rand = rngFor(seed + 101);
    const tone = info.fiberTone || 0;
    const width = Math.max(0.6, 0.045 * bucket);
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const len = lenPx * (0.45 + rand() * 0.9);
      const ang = rand() * Math.PI * 2;
      const bend = (rand() - 0.5) * len * 0.6;
      const light = rand() < (tone + 1) / 2;
      const alpha = (0.06 + rand() * 0.16) * (light ? 1 : 1.1);
      ctx.strokeStyle = light ? `rgba(255,255,255,${alpha.toFixed(3)})` : `rgba(0,0,0,${alpha.toFixed(3)})`;
      ctx.lineWidth = width * (0.6 + rand() * 0.9);
      const dx = Math.cos(ang) * len * 0.5;
      const dy = Math.sin(ang) * len * 0.5;
      const nx = -Math.sin(ang) * bend;
      const ny = Math.cos(ang) * bend;
      wrapped(size, x, y, len, (ox, oy) => {
        ctx.beginPath();
        ctx.moveTo(x - dx + ox, y - dy + oy);
        // A gentle curve through the bend point (cubic equivalent of the
        // quadratic with control point (x+nx, y+ny)).
        const sx = x - dx + ox; const sy = y - dy + oy;
        const ex = x + dx + ox; const ey = y + dy + oy;
        const cx = x + nx + ox; const cy = y + ny + oy;
        ctx.bezierCurveTo(sx + (2 / 3) * (cx - sx), sy + (2 / 3) * (cy - sy), ex + (2 / 3) * (cx - ex), ey + (2 / 3) * (cy - ey), ex, ey);
        ctx.stroke();
      });
    }
  };

  // Speckles: dark inclusions (recycled pulp) — newsprint/kraft.
  const drawSpeckles = (ctx, size, info, bucket, seed) => {
    const density = info.speckle || 0;
    if (density <= 0 || !ctx || typeof ctx.fill !== 'function') return;
    const areaMm2 = (size / bucket) * (size / bucket);
    const count = Math.min(6000, Math.round(areaMm2 * density * 0.05));
    const rand = rngFor(seed + 211);
    for (let i = 0; i < count; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const r = Math.max(0.35, (0.04 + rand() * rand() * 0.18) * bucket);
      const alpha = 0.12 + rand() * 0.35;
      ctx.fillStyle = `rgba(20,16,12,${alpha.toFixed(3)})`;
      wrapped(size, x, y, r, (ox, oy) => {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * (0.5 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  };

  const bucketFor = (pxPerMm) => {
    const L = limits();
    const lo = L.minBucket || 0.5;
    const hi = L.maxBucket || 16;
    const v = Number.isFinite(pxPerMm) && pxPerMm > 0 ? pxPerMm : 4;
    const b = 2 ** Math.round(Math.log2(v));
    return Math.max(lo, Math.min(hi, b));
  };

  // Coarse buckets cover a lot of paper per tile; give them a bigger tile so
  // the formation clouds don't visibly repeat across the sheet.
  const tileSizeFor = (bucket) => {
    const base = limits().tilePx || 512;
    return bucket <= 4 ? base * 2 : base;
  };

  const cacheKey = (cfg, pxPerMm) => {
    const type = cfg && cfg.type ? cfg.type : 'none';
    const seed = cfg && Number.isFinite(cfg.seed) ? cfg.seed : 1;
    return `${type}|${seed}|${bucketFor(pxPerMm)}`;
  };

  const cache = new Map();
  const stats = { hits: 0, misses: 0, builds: 0 };

  /**
   * Build the surface / skip / feather canvases for one key.
   */
  const buildTile = (type, seed, bucket, size) => {
    const info = typeInfo(type);
    const canvas = makeCanvas(size, size);
    const skip = makeCanvas(size, size);
    const feather = makeCanvas(size, size);
    if (!canvas) return null;
    stats.builds += 1;
    const ctx = canvas.getContext('2d');
    const sctx = skip && skip.getContext('2d');
    const fctx = feather && feather.getContext('2d');
    const { height, fine } = buildFields(type, seed, bucket, size);
    const tooth = info.tooth || 0;
    // Emboss lighting from the upper left on the height map. The height
    // field's slope falls as 1/grainPx, so multiplying by grainPx keeps the
    // relief the same strength at every zoom bucket (physically constant).
    const grainPx = Math.max(1, (info.grainMm || 1) * bucket);
    const reliefGain = grainPx * 0.09;
    // Dry-skip pinholes: the pen bridges the deepest, finest pits of the
    // tooth. Coverage is a fixed fraction of the area per paper type
    // (dryskip × 6 %), picked by a quantile threshold so it is the same at
    // every zoom; the mask is crisp (pinholes, not a grey wash).
    const coverage = Math.max(0, Math.min(0.4, (info.dryskip || 0) * 0.06));
    const pit = new Float32Array(size * size);
    for (let i = 0; i < pit.length; i += 1) pit[i] = (1 - height[i]) * 0.35 + fine[i] * 0.65;
    let pitThreshold = 2;
    if (coverage > 0) {
      const step = Math.max(1, Math.floor(pit.length / 8192));
      const sample = [];
      for (let i = 0; i < pit.length; i += step) sample.push(pit[i]);
      sample.sort((p, q) => p - q);
      pitThreshold = sample[Math.min(sample.length - 1, Math.floor(sample.length * (1 - coverage)))];
    }
    const pitSoft = 0.02;
    const img = imageDataFor(ctx, size, size);
    const simg = sctx ? imageDataFor(sctx, size, size) : null;
    const fimg = fctx ? imageDataFor(fctx, size, size) : null;
    if (img) {
      const d = img.data;
      const idx = (x, y) => ((y + size) % size) * size + ((x + size) % size);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const i = y * size + x;
          const slope = height[idx(x - 1, y - 1)] - height[idx(x + 1, y + 1)];
          const shade = slope * reliefGain * tooth;
          // Valleys hold a little shadow even when unlit (ambient occlusion).
          const ao = (height[i] - 0.5) * 0.06 * tooth;
          // Formation clouds live in the separate large mottle tile (see
          // getMottleTile) so they never repeat at the grain tile's period.
          const micro = (fine[i] - 0.5) * 0.06;
          let delta = shade + ao + micro;
          // Paper reads as bright stock with soft shadows: lift the shadows.
          if (delta < 0) delta *= 0.7;
          if (delta > 0.5) delta = 0.5; else if (delta < -0.5) delta = -0.5;
          const o = i * 4;
          const v = delta >= 0 ? 255 : 0;
          d[o] = v; d[o + 1] = v; d[o + 2] = v;
          d[o + 3] = Math.round(Math.abs(delta) * 2 * 255);
          if (simg) {
            // Ink skips the deepest third of the tooth (soft threshold).
            let m = (pit[i] - pitThreshold) / pitSoft + 0.5;
            m = m < 0 ? 0 : m > 1 ? 1 : m;
            simg.data[o + 3] = Math.round(m * 255);
          }
          if (fimg) {
            const f = 0.3 + 0.7 * (0.6 * fine[i] + 0.4 * height[i]);
            fimg.data[o + 3] = Math.round((f > 1 ? 1 : f) * 255);
          }
        }
      }
      if (typeof ctx.putImageData === 'function') ctx.putImageData(img, 0, 0);
      if (simg && typeof sctx.putImageData === 'function') sctx.putImageData(simg, 0, 0);
      if (fimg && typeof fctx.putImageData === 'function') fctx.putImageData(fimg, 0, 0);
    }
    drawFibres(ctx, size, info, bucket, seed);
    drawSpeckles(ctx, size, info, bucket, seed);
    return { canvas, skip, feather, bucket, size };
  };

  const store = (key, entry) => {
    cache.set(key, entry);
    const cap = limits().tileCacheSize || 8;
    while (cache.size > cap) cache.delete(cache.keys().next().value);
  };

  const buildEntry = (cfg, pxPerMm, key) => {
    const bucket = bucketFor(pxPerMm);
    const built = buildTile(cfg.type, Number.isFinite(cfg.seed) ? cfg.seed : 1, bucket, tileSizeFor(bucket));
    if (!built) return null;
    const entry = { ...built, key };
    store(key, entry);
    return entry;
  };

  const pending = new Set();
  const schedule = (fn) => {
    if (typeof G.requestIdleCallback === 'function') G.requestIdleCallback(fn, { timeout: 120 });
    else setTimeout(fn, 0);
  };

  /**
   * Tile for a paper at the current on-screen px/mm.
   * opts.onReady: when given and the exact bucket is not cached but another
   * bucket of the same paper is, return that one now (it is still mapped in
   * real mm, just at a different resolution) and build the exact tile when
   * idle, then call onReady() so the caller can repaint — zooming never
   * hitches on a tile build. Without onReady (or on a paper's first tile)
   * the tile is built synchronously.
   */
  const getTile = (cfg, pxPerMm, opts = {}) => {
    if (!cfg || !cfg.type || cfg.type === 'none') return null;
    const key = cacheKey(cfg, pxPerMm);
    if (cache.has(key)) {
      const hit = cache.get(key);
      cache.delete(key);
      cache.set(key, hit);
      stats.hits += 1;
      return hit;
    }
    stats.misses += 1;
    if (typeof opts.onReady === 'function') {
      const prefix = key.slice(0, key.lastIndexOf('|') + 1);
      const want = bucketFor(pxPerMm);
      let near = null;
      cache.forEach((entry, k) => {
        if (!k.startsWith(prefix)) return;
        if (!near || Math.abs(Math.log2(entry.bucket / want)) < Math.abs(Math.log2(near.bucket / want))) near = entry;
      });
      if (near) {
        if (!pending.has(key)) {
          pending.add(key);
          const snapshot = { type: cfg.type, seed: cfg.seed };
          schedule(() => {
            pending.delete(key);
            if (!cache.has(key)) buildEntry(snapshot, pxPerMm, key);
            opts.onReady();
          });
        }
        return near;
      }
    }
    return buildEntry(cfg, pxPerMm, key);
  };

  // ---- large formation (mottle) tile -------------------------------------
  //
  // Mottle is low-frequency, so it lives in its own coarse tile whose period
  // (LIMITS.mottlePeriodMm, ~1 m, deliberately incommensurate with every grain
  // tile period, which are powers of two in mm) is longer than an A0 sheet's
  // short side: the clouds never visibly repeat, even on A0/A1 or long rolls,
  // and the two layers never line up into an obvious repeat.
  const mottleCache = new Map();

  const getMottleTile = (cfg) => {
    if (!cfg || !cfg.type || cfg.type === 'none') return null;
    const info = typeInfo(cfg.type);
    if (!(info.mottle > 0)) return null;
    const seed = Number.isFinite(cfg.seed) ? cfg.seed : 1;
    const key = `${cfg.type}|${seed}`;
    if (mottleCache.has(key)) return mottleCache.get(key);
    const L = limits();
    const size = L.mottleTilePx || 384;
    const periodMm = L.mottlePeriodMm || 997;
    const pxPerMm = size / periodMm;
    const canvas = makeCanvas(size, size);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    // 10–25 mm clouds plus a broad 60 mm undulation.
    const clouds = normalizeField(periodicFbm(size, Math.max(3, 22 * pxPerMm), 3, seed + 37, 0.5));
    const broad = normalizeField(periodicFbm(size, 60 * pxPerMm, 2, seed + 41, 0.5));
    const img = imageDataFor(ctx, size, size);
    if (img) {
      const d = img.data;
      for (let i = 0; i < size * size; i += 1) {
        let delta = ((clouds[i] - 0.5) * 0.7 + (broad[i] - 0.5) * 0.3) * 0.2 * info.mottle;
        if (delta > 0.5) delta = 0.5; else if (delta < -0.5) delta = -0.5;
        const o = i * 4;
        const v = delta >= 0 ? 255 : 0;
        d[o] = v; d[o + 1] = v; d[o + 2] = v;
        d[o + 3] = Math.round(Math.abs(delta) * 2 * 255);
      }
      if (typeof ctx.putImageData === 'function') ctx.putImageData(img, 0, 0);
    }
    const entry = { canvas, pxPerMm, periodMm, size, key };
    mottleCache.set(key, entry);
    while (mottleCache.size > 4) mottleCache.delete(mottleCache.keys().next().value);
    return entry;
  };

  // Seeded phase (mm) for a paper's patterns so two papers / seeds never start
  // their repeat at the sheet corner.
  const offsetMm = (cfg, salt = 0) => {
    const seed = cfg && Number.isFinite(cfg.seed) ? cfg.seed : 1;
    return { x: hash3(seed, 17, salt) * 1000, y: hash3(seed, 29, salt) * 1000 };
  };

  // Texture period in document millimetres for a tile (tests + docs): the
  // grain repeats every tileSize / bucket mm, independent of the sheet size.
  const periodMmFor = (pxPerMm) => tileSizeFor(bucketFor(pxPerMm)) / bucketFor(pxPerMm);

  const thumbCache = new Map();

  /**
   * A swatch for the paper menu: the stock colour, its surface texture and a
   * short ink stroke showing how the paper takes ink.
   */
  const thumbDataURL = (type, opts = {}) => {
    const px = opts.px || 96;
    const key = `${type}|${px}`;
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
    if (type !== 'none') {
      // 96 px swatch ≈ 16 mm of paper.
      const bucket = px / 16;
      const t = buildTile(type, 7, bucket, px);
      if (t && t.canvas && typeof ctx.drawImage === 'function') {
        ctx.globalAlpha = info.defaultTexture || 0.6;
        ctx.drawImage(t.canvas, 0, 0);
        ctx.globalAlpha = 1;
      }
    }
    // Ink sample: dark ink on light stock, light ink on dark stock.
    const dark = Paper && Paper.luminance ? Paper.luminance(color) < 0.4 : false;
    ctx.strokeStyle = dark ? '#f2efe6' : '#1d2433';
    ctx.globalAlpha = info.inkOpacity || 1;
    ctx.lineWidth = Math.max(1.5, px * 0.03);
    ctx.lineCap = 'round';
    if (typeof ctx.bezierCurveTo === 'function') {
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
    mottleCache.clear();
    thumbCache.clear();
    stats.hits = 0;
    stats.misses = 0;
    stats.builds = 0;
  };

  const cacheStats = () => ({ ...stats, size: cache.size, keys: Array.from(cache.keys()) });

  Vectura.PaperTexture = {
    getTile,
    getMottleTile,
    offsetMm,
    periodMmFor,
    thumbDataURL,
    bucketFor,
    tileSizeFor,
    cacheKey,
    clearCache,
    cacheStats,
    buildFields,
    periodicFbm,
  };
})();
