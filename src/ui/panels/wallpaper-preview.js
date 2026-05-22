/**
 * Vectura wallpaper preview substrate — REAL render (Phase 1, Team Alpha).
 *
 * Renders a wallpaper-group thumbnail from the user's live layer geometry by
 * running the PURE `Modifiers.applyWallpaperMirrorToPaths(paths, mirror, bounds)`
 * transform, fitting the resulting paths to the thumbnail box, and stroking them
 * onto a <canvas>. When no source geometry is supplied, an asymmetric built-in
 * motif is tiled so each card still communicates the symmetry of its group.
 *
 * Results are memoized by `cacheKey(opts)` (includes a geometry hash) and the
 * actual paint can be deferred via IntersectionObserver until the target scrolls
 * into view. Both are non-breaking: callers just call `render()` / `thumbDataURL()`.
 *
 * ── PUBLIC API CONTRACT (do not break) ───────────────────────────────────────
 *   WallpaperPreview.render(targetEl, opts) -> void
 *     Renders a wallpaper thumbnail into `targetEl` (a <canvas> or a container
 *     element; if a container, a <canvas> is created/reused inside it).
 *
 *   WallpaperPreview.thumbDataURL(opts) -> string (data: URL)
 *     Renders offscreen and returns a PNG data URL. Useful for <img> cards.
 *
 *   WallpaperPreview.cacheKey(opts) -> string
 *     Stable key for memoization. Same key ⇒ identical pixels.
 *
 *   WallpaperPreview.clearCache() -> void
 *
 *   opts = {
 *     mirror:      object  // a wallpaper mirror config (see createWallpaperMirror):
 *                          //   { group, symmetry?, tileWidth, tileHeight, tileAngle,
 *                          //     rotation, centerX, centerY, domainScale, variantV1 }
 *                          // Partial configs are accepted; missing fields fall back
 *                          // to createWallpaperMirror() defaults.
 *     sourcePaths: Array<Array<{x,y}>>  // the user's live layer geometry. If omitted
 *                          //   or empty, a built-in motif is tiled so the card still
 *                          //   communicates the symmetry.
 *     size:        number | {w,h}       // px (default 96, square)
 *     bounds:      {x,y,width,height}?  // tiling bounds; derived from size if omitted
 *   }
 *
 * COORDINATE CONVENTION (integrator: please double-check) ──────────────────────
 *   `Modifiers.applyWallpaperMirrorToPaths` treats the tile center as
 *   `cx = bounds.width / 2 + mirror.centerX`, `cy = bounds.height / 2 + centerY`,
 *   i.e. bounds origin is the top-left (0,0), matching `engine.getBounds()` which
 *   returns `{ width, height, ... }` with no x/y. When `opts.bounds` is omitted we
 *   synthesize a SQUARE region `{ x:0, y:0, width:S, height:S }` sized to span a
 *   few tiles so the symmetry is legible in the thumbnail. We do not assume the
 *   canvas/renderer "origin at center" convention here — the transform's own
 *   center math already centers the lattice. Output paths are then fit-to-box by
 *   their computed bounding box, so absolute placement does not matter.
 * ──────────────────────────────────────────────────────────────────────────────
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const DEFAULT_SIZE = 96;
  const WALL_HUE = '#5cd99a';
  // Cap total stroked points so a grid of ~17-25 thumbnails stays cheap.
  const MAX_POINTS_PER_THUMB = 6000;

  const normSize = (size) => {
    if (typeof size === 'number' && size > 0) return { w: Math.round(size), h: Math.round(size) };
    if (size && size.w > 0 && size.h > 0) return { w: Math.round(size.w), h: Math.round(size.h) };
    return { w: DEFAULT_SIZE, h: DEFAULT_SIZE };
  };

  const fullMirror = (mirror) => {
    const mods = Vectura.Modifiers;
    const base = (mods && typeof mods.createWallpaperMirror === 'function')
      ? mods.createWallpaperMirror(0)
      : { group: 'p4m', tileWidth: 60, tileHeight: 60, tileAngle: 90, rotation: 0, centerX: 0, centerY: 0, domainScale: 1, variantV1: false };
    return Object.assign({}, base, mirror || {}, { type: 'wallpaper', enabled: true });
  };

  // ── Pure: derive a square tiling region from size when bounds not provided.
  //    We span several tile-widths so multiple lattice copies appear. Origin at
  //    top-left to match engine.getBounds() / the transform's center math.
  const deriveBounds = (mirror, size) => {
    const { w, h } = normSize(size);
    const tw = Math.max(1, Number(mirror && mirror.tileWidth) || 60);
    const th = Math.max(1, Number(mirror && mirror.tileHeight) || 60);
    // ~2 tiles across reads as a repeating pattern without exploding the tile
    // count (cost grows with bounds/tile-size squared). Square region so the
    // thumbnail aspect (usually square) maps cleanly.
    const side = Math.max(tw, th) * 2;
    return { x: 0, y: 0, width: side, height: side, _aspect: w / h };
  };

  // ── Pure: bounding box of a path set. Returns null if degenerate/empty.
  const pathsBBox = (paths) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let seen = 0;
    for (const path of (paths || [])) {
      if (!path || !path.length) continue;
      for (const pt of path) {
        if (!pt) continue;
        const x = pt.x, y = pt.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        seen++;
      }
    }
    if (seen < 2 || !Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  };

  // ── Pure: compute a uniform scale + translate that fits `bbox` into a wxh box
  //    with `margin` px padding, preserving aspect ratio and centering.
  const fitTransform = (bbox, w, h, margin) => {
    const pad = Number.isFinite(margin) ? margin : 4;
    const availW = Math.max(1, w - pad * 2);
    const availH = Math.max(1, h - pad * 2);
    const bw = bbox && bbox.width > 0 ? bbox.width : 1;
    const bh = bbox && bbox.height > 0 ? bbox.height : 1;
    const scale = Math.min(availW / bw, availH / bh);
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const cx = bbox ? (bbox.minX + bbox.maxX) / 2 : 0;
    const cy = bbox ? (bbox.minY + bbox.maxY) / 2 : 0;
    return {
      scale: safeScale,
      // map world point (x,y) -> px: (x - cx) * scale + w/2
      tx: w / 2 - cx * safeScale,
      ty: h / 2 - cy * safeScale,
    };
  };

  // ── Pure: an ASYMMETRIC built-in motif (an L-shape with a tick). Asymmetry is
  //    intentional — a symmetric motif would hide the difference between groups.
  const motifPaths = () => ([
    // L-shape (no reflective/rotational symmetry of its own)
    [{ x: -8, y: -10 }, { x: -8, y: 8 }, { x: 9, y: 8 }],
    // short diagonal tick off the corner
    [{ x: -8, y: -10 }, { x: 2, y: -4 }],
    // small detached stroke to break any accidental symmetry
    [{ x: 4, y: -8 }, { x: 9, y: -9 }],
  ]);

  const cacheKey = (opts = {}) => {
    const m = fullMirror(opts.mirror);
    const { w, h } = normSize(opts.size);
    const geomHash = geometryHash(opts.sourcePaths);
    const b = opts.bounds;
    const boundsTag = (b && Number.isFinite(b.width) && Number.isFinite(b.height))
      ? `b${Math.round(b.width)}x${Math.round(b.height)}@${Math.round(b.x || 0)},${Math.round(b.y || 0)}`
      : 'bauto';
    return [
      m.group, m.symmetry && m.symmetry.lattice, m.symmetry && m.symmetry.rotation,
      m.symmetry && m.symmetry.mirrors, m.tileWidth, m.tileHeight, m.tileAngle,
      m.rotation, m.centerX, m.centerY, m.domainScale, m.variantV1, w, h,
      boundsTag, geomHash,
    ].join('|');
  };

  // ── Pure: cheap, stable geometry hash. Includes count, total points, and a
  //    coordinate-derived fingerprint so different geometry yields a different
  //    key without serializing every point.
  const geometryHash = (paths) => {
    if (!paths || !paths.length) return 'motif';
    let total = 0;
    let acc = 2166136261; // FNV-ish accumulation over a sparse sample
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      const len = p ? p.length : 0;
      total += len;
      if (!len) continue;
      // Sample up to ~8 points per path to keep this O(paths) for big inputs.
      const step = Math.max(1, Math.floor(len / 8));
      for (let j = 0; j < len; j += step) {
        const pt = p[j];
        if (!pt) continue;
        const xv = Math.round((Number(pt.x) || 0) * 100);
        const yv = Math.round((Number(pt.y) || 0) * 100);
        acc = ((acc ^ xv) * 16777619) >>> 0;
        acc = ((acc ^ yv) * 16777619) >>> 0;
      }
    }
    return `g${paths.length}:${total}:${acc.toString(36)}`;
  };

  // ── Pure: run the keystone transform defensively. Returns the (possibly motif)
  //    paths transformed by the wallpaper mirror, or [] on any failure.
  const computeTiledPaths = (opts = {}) => {
    const mods = Vectura.Modifiers;
    const mirror = fullMirror(opts.mirror);
    const explicitBounds = opts.bounds && Number.isFinite(opts.bounds.width) && Number.isFinite(opts.bounds.height) && opts.bounds.width > 0 && opts.bounds.height > 0;
    const bounds = explicitBounds ? opts.bounds : deriveBounds(mirror, opts.size);
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;

    let source = Array.isArray(opts.sourcePaths) ? opts.sourcePaths.filter((p) => Array.isArray(p) && p.length >= 2) : [];
    let usedMotif = false;
    if (!source.length) {
      // Center the motif inside the derived bounds so the transform clips it
      // within the fundamental domain (which is positioned around bounds center).
      source = motifPaths().map((p) => p.map((pt) => ({ x: pt.x + cx, y: pt.y + cy })));
      usedMotif = true;
    } else if (!explicitBounds) {
      // Auto-derived bounds: recenter the user's geometry onto the tile center so
      // it lands inside the fundamental domain (which sits around bounds center).
      // Without this, off-center live geometry gets clipped to nothing. When the
      // caller supplies real bounds we trust their placement and skip this.
      const bb = pathsBBox(source);
      if (bb) {
        const gcx = (bb.minX + bb.maxX) / 2;
        const gcy = (bb.minY + bb.maxY) / 2;
        const dx = cx - gcx;
        const dy = cy - gcy;
        source = source.map((p) => p.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })));
      }
    }

    // Cap the SOURCE detail before the transform: the fundamental-domain copy
    // each symmetry op makes multiplies source points by (#ops × #tiles), so a
    // heavy source can blow up the output. ~800 source points is plenty for a
    // ~96px thumbnail; the post-transform capPoints() is a second safety net.
    source = capPoints(source, 800);

    if (!mods || typeof mods.applyWallpaperMirrorToPaths !== 'function') {
      // No engine available — fall back to the raw source so we still draw lines.
      return { paths: source, usedMotif };
    }
    let out;
    try {
      out = mods.applyWallpaperMirrorToPaths(source, mirror, bounds);
    } catch (_e) {
      out = source;
    }
    if (!Array.isArray(out)) out = [];
    return { paths: out, usedMotif };
  };

  // ── Pure: cap total point count by uniformly subsampling longer paths so a
  //    grid of thumbnails stays cheap to stroke. Always keeps endpoints.
  const capPoints = (paths, maxPoints) => {
    const cap = maxPoints || MAX_POINTS_PER_THUMB;
    let total = 0;
    for (const p of paths) total += (p ? p.length : 0);
    if (total <= cap) return paths;
    const ratio = cap / total;
    return paths.map((p) => {
      if (!p || p.length <= 2) return p;
      const keep = Math.max(2, Math.floor(p.length * ratio));
      if (keep >= p.length) return p;
      const step = (p.length - 1) / (keep - 1);
      const out = [];
      for (let i = 0; i < keep; i++) out.push(p[Math.round(i * step)]);
      out[out.length - 1] = p[p.length - 1];
      return out;
    });
  };

  // ── The actual pixel paint. Strokes fitted paths onto a 2D context. Never
  //    throws; paints a neutral placeholder on degenerate input.
  const paint = (ctx, w, h, opts) => {
    try {
      ctx.clearRect(0, 0, w, h);
    } catch (_e) { /* no-op stub */ }

    let tiled;
    try {
      tiled = computeTiledPaths(opts);
    } catch (_e) {
      tiled = { paths: [], usedMotif: true };
    }
    let paths = (tiled && tiled.paths) || [];
    const bbox = pathsBBox(paths);

    if (!bbox) {
      paintPlaceholder(ctx, w, h, fullMirror(opts.mirror));
      return;
    }

    paths = capPoints(paths, MAX_POINTS_PER_THUMB);
    const margin = Math.max(2, Math.round(Math.min(w, h) * 0.06));
    const t = fitTransform(bbox, w, h, margin);

    // Very-light background so transparent cards still read on any surface.
    try {
      ctx.fillStyle = 'rgba(92, 217, 154, 0.06)';
      ctx.fillRect(0, 0, w, h);
    } catch (_e) { /* no-op */ }

    try {
      ctx.lineWidth = Math.max(0.5, Math.min(w, h) / 96);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = WALL_HUE;
      ctx.beginPath();
      for (const path of paths) {
        if (!path || path.length < 2) continue;
        let started = false;
        for (const pt of path) {
          if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
          const px = pt.x * t.scale + t.tx;
          const py = pt.y * t.scale + t.ty;
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    } catch (_e) {
      paintPlaceholder(ctx, w, h, fullMirror(opts.mirror));
    }
  };

  // Neutral fallback paint (kept for genuinely-degenerate input / missing engine).
  const paintPlaceholder = (ctx, w, h, mirror) => {
    try {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(92, 217, 154, 0.10)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(92, 217, 154, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
      ctx.setLineDash([]);
      const label = (mirror && mirror.group) || 'p4m';
      ctx.fillStyle = 'rgba(120, 200, 160, 0.9)';
      ctx.font = `${Math.max(9, Math.round(w / 7))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w / 2, h / 2);
    } catch (_e) { /* stub context — nothing to draw */ }
  };

  // ── Memoization. Cache rendered PNG data URLs keyed by cacheKey(opts).
  const cache = new Map();
  const CACHE_LIMIT = 256;

  const cacheGet = (key) => cache.get(key);
  const cacheSet = (key, val) => {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, val);
    if (cache.size > CACHE_LIMIT) {
      // Evict oldest (Map preserves insertion order).
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
  };

  const getCanvas = (targetEl, w, h) => {
    if (targetEl && targetEl.tagName === 'CANVAS') {
      targetEl.width = w;
      targetEl.height = h;
      return targetEl;
    }
    let cv = targetEl && targetEl.querySelector ? targetEl.querySelector('canvas[data-wp-preview]') : null;
    if (!cv) {
      cv = document.createElement('canvas');
      cv.setAttribute('data-wp-preview', '');
      cv.style.width = '100%';
      cv.style.height = '100%';
      if (targetEl && targetEl.appendChild) targetEl.appendChild(cv);
    }
    cv.width = w;
    cv.height = h;
    return cv;
  };

  // Reusable offscreen canvas for thumbDataURL to avoid per-call allocation.
  let _offscreen = null;
  const offscreenCanvas = (w, h) => {
    if (typeof document === 'undefined' || !document.createElement) return null;
    if (!_offscreen) _offscreen = document.createElement('canvas');
    _offscreen.width = w;
    _offscreen.height = h;
    return _offscreen;
  };

  const paintCanvas = (cv, w, h, opts) => {
    const ctx = cv && cv.getContext && cv.getContext('2d');
    if (!ctx) return;
    paint(ctx, w, h, opts);
  };

  const thumbDataURL = (opts = {}) => {
    const { w, h } = normSize(opts.size);
    let key;
    try { key = cacheKey(opts); } catch (_e) { key = null; }
    if (key) {
      const hit = cacheGet(key);
      // Same key ⇒ identical pixels: serve the memoized payload (even when the
      // environment produced no dataURL, e.g. a canvas-less test harness — we
      // still avoid the repaint, which is what the memo guarantees).
      if (hit) return typeof hit.url === 'string' ? hit.url : '';
    }
    const cv = offscreenCanvas(w, h);
    if (!cv) return '';
    paintCanvas(cv, w, h, opts);
    let url = '';
    try { url = cv.toDataURL ? cv.toDataURL('image/png') : ''; } catch (_e) { url = ''; }
    if (typeof url !== 'string') url = '';
    if (key) cacheSet(key, { url });
    return url;
  };

  // ── Lazy rendering via IntersectionObserver. When a target is offscreen the
  //    paint is deferred until it scrolls into view. Degrades to immediate paint
  //    when IntersectionObserver is unavailable.
  const hasIO = (typeof G.IntersectionObserver === 'function');
  let _io = null;
  const _pending = new WeakMap(); // canvas -> { w, h, opts }

  const ensureObserver = () => {
    if (!hasIO) return null;
    if (_io) return _io;
    _io = new G.IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const cv = entry.target;
        const job = _pending.get(cv);
        if (job) {
          _pending.delete(cv);
          _io.unobserve(cv);
          paintFromCache(cv, job.w, job.h, job.opts);
        } else {
          _io.unobserve(cv);
        }
      }
    }, { rootMargin: '64px' });
    return _io;
  };

  // Paint a canvas, using the dataURL cache when warm, else paint + warm it.
  const paintFromCache = (cv, w, h, opts) => {
    let key;
    try { key = cacheKey(opts); } catch (_e) { key = null; }
    paintCanvas(cv, w, h, opts);
    if (key) {
      let url = '';
      try { url = cv.toDataURL ? cv.toDataURL('image/png') : ''; } catch (_e) { url = ''; }
      if (url) cacheSet(key, { url });
    }
  };

  const render = (targetEl, opts = {}) => {
    if (!targetEl) return;
    const { w, h } = normSize(opts.size);
    const cv = getCanvas(targetEl, w, h);
    if (!cv) return;

    const io = ensureObserver();
    if (io) {
      // Defer: queue the paint and observe. If already in view the observer
      // fires synchronously-ish on next tick; if offscreen it waits.
      _pending.set(cv, { w, h, opts });
      try { io.observe(cv); return; } catch (_e) { /* fall through to immediate */ }
    }
    // No IntersectionObserver (or observe failed) — paint immediately.
    paintFromCache(cv, w, h, opts);
  };

  Vectura.WallpaperPreview = {
    render,
    thumbDataURL,
    cacheKey,
    clearCache() {
      cache.clear();
    },
    // Internal helpers exposed for unit testing (pure, side-effect-free).
    _internal: {
      normSize,
      fullMirror,
      deriveBounds,
      pathsBBox,
      fitTransform,
      motifPaths,
      geometryHash,
      computeTiledPaths,
      capPoints,
      cacheSize: () => cache.size,
    },
  };
})();
