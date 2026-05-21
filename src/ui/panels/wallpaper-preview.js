/**
 * Vectura wallpaper preview substrate — PHASE 0 SEAM STUB.
 *
 * Owner: Team Alpha. This file currently ships a *placeholder* implementation
 * so Teams Beta (gallery) and Gamma (presets/surprise-me) can integrate against
 * a stable API today. Alpha replaces the internals (real offscreen render +
 * cache + lazy IntersectionObserver) WITHOUT changing the public signatures
 * below.
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
 * ──────────────────────────────────────────────────────────────────────────────
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const DEFAULT_SIZE = 96;

  const normSize = (size) => {
    if (typeof size === 'number' && size > 0) return { w: size, h: size };
    if (size && size.w && size.h) return { w: size.w, h: size.h };
    return { w: DEFAULT_SIZE, h: DEFAULT_SIZE };
  };

  const fullMirror = (mirror) => {
    const mods = Vectura.Modifiers;
    const base = (mods && typeof mods.createWallpaperMirror === 'function')
      ? mods.createWallpaperMirror(0)
      : { group: 'p4m', tileWidth: 60, tileHeight: 60, tileAngle: 90, rotation: 0, centerX: 0, centerY: 0, domainScale: 1, variantV1: false };
    return Object.assign({}, base, mirror || {}, { type: 'wallpaper', enabled: true });
  };

  const cacheKey = (opts = {}) => {
    const m = fullMirror(opts.mirror);
    const { w, h } = normSize(opts.size);
    const geomHash = (opts.sourcePaths && opts.sourcePaths.length)
      ? `g${opts.sourcePaths.length}:${opts.sourcePaths.reduce((n, p) => n + (p ? p.length : 0), 0)}`
      : 'motif';
    return [
      m.group, m.symmetry && m.symmetry.lattice, m.symmetry && m.symmetry.rotation,
      m.symmetry && m.symmetry.mirrors, m.tileWidth, m.tileHeight, m.tileAngle,
      m.rotation, m.centerX, m.centerY, m.domainScale, m.variantV1, w, h, geomHash,
    ].join('|');
  };

  // ── PHASE 0 placeholder paint. Alpha swaps this for a real tiled render that
  //    runs Modifiers.applyWallpaperMirrorToPaths(sourcePaths, fullMirror, bounds)
  //    and strokes the resulting paths fit to the thumbnail box. ────────────────
  const paintPlaceholder = (ctx, w, h, mirror) => {
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
  };

  const getCanvas = (targetEl, w, h) => {
    if (targetEl && targetEl.tagName === 'CANVAS') return targetEl;
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

  const render = (targetEl, opts = {}) => {
    if (!targetEl) return;
    const { w, h } = normSize(opts.size);
    const cv = getCanvas(targetEl, w, h);
    const ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return;
    paintPlaceholder(ctx, w, h, fullMirror(opts.mirror));
  };

  const thumbDataURL = (opts = {}) => {
    const { w, h } = normSize(opts.size);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return '';
    paintPlaceholder(ctx, w, h, fullMirror(opts.mirror));
    return cv.toDataURL('image/png');
  };

  Vectura.WallpaperPreview = {
    render,
    thumbDataURL,
    cacheKey,
    clearCache() {},
    _isPhase0Stub: true,
  };
})();
