/**
 * Start Page draw-in styles (Vectura.StartPageDrawStyles).
 *
 * Registers on StartPageInk (src/ui/start-page/ink.js), next to the built-in Plot:
 *   - sweep    soft diagonal wipe            (stroke pipeline: all strokes pre-drawn, masked by a moving gradient)
 *   - cascade  whole strokes land randomly   (stroke pipeline: polylines drawn on an overlay canvas)
 *   - fade     rises 16 px and fades in      (art layer: inline opacity / transform)
 *   - bleed    blurred ink settles sharp     (art layer: opacity / blur / contrast)
 *   - scan     revealed line by line         (art layer: clip-path + scan-line mask)
 *   - iris     a circle opens from centre    (art layer: clip-path)
 *   - none     art is simply there
 * Timing and look are ported from the mockup (plates3.css, shared-final/ink.js). Every style is a
 * player { frame(k 0..1), dispose(fade) }, works for svg and canvas tile handles, and finish() ends it
 * instantly with the art untouched. Word handles use the built-in left-to-right wipe for the two
 * stroke-pipeline styles. Art-layer styles set inline styles only (no stylesheet needed).
 *
 * Also: retrigger(handle, style, opts), the hover re-trigger controller.
 */
(() => {
  const W = window;
  const D = document;
  const Vectura = (W.Vectura = W.Vectura || {});
  const Ink = Vectura.StartPageInk;
  const Geo = Vectura.StartPageArtGeometry;
  if (!Ink || !Geo) throw new Error('StartPageDrawStyles requires StartPageInk and StartPageArtGeometry');

  /* ------------------------------------------------------------------ easing */
  const inOut = Geo.inOut || ((k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2));
  const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
  /* CSS-style cubic-bezier(x1,y1,x2,y2) as a function of progress */
  const bezier = (x1, y1, x2, y2) => {
    const cx = 3 * x1; const bx = 3 * (x2 - x1) - cx; const ax = 1 - cx - bx;
    const cy = 3 * y1; const by = 3 * (y2 - y1) - cy; const ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    return (x) => {
      x = clamp01(x);
      if (x === 0 || x === 1) return x;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const err = sx(t) - x; if (Math.abs(err) < 1e-5) return sy(t);
        const d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(d) < 1e-6) break;
        t -= err / d;
      }
      let lo = 0; let hi = 1; t = x;
      for (let i = 0; i < 24; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return sy(t);
    };
  };
  const E_FADE = bezier(0.2, 0.7, 0.2, 1);
  const E_BLEED = bezier(0.3, 0.6, 0.2, 1);
  const E_IRIS = bezier(0.5, 0, 0.2, 1);

  /* natural durations from the mockup; pass as drawIn's `duration` (play() does this) */
  const NATURAL_MS = { plot: 1500, sweep: 1500, cascade: 1500, fade: 900, bleed: 1200, scan: 1100, iris: 1100, none: 0 };
  const LABELS = {
    plot: 'The pen draws each line in', sweep: 'A soft wipe across', fade: 'Rises and fades in', bleed: 'Blurred ink settles sharp',
    cascade: 'Whole strokes land in random order', scan: 'Revealed line by line', iris: 'A circle opens from the center', none: 'Art is simply there',
  };

  const dispatchOverlay = (node, fade) => {
    if (!node) return;
    if (fade) { node.classList.add('sp-ink-draw-out'); setTimeout(() => node.remove(), 420); } else node.remove();
  };

  /* ------------------------------------------------------------------ stroke pipeline (sweep, cascade) */
  const pinchZoom = () => { try { const K = Vectura.KeyboardInset; return K && K.pageScale ? K.pageScale() : 1; } catch (e) { return 1; } };
  const policy = (w, h) => Geo.rasterPolicy({ cssWidth: w, cssHeight: h, dpr: Math.max(1, W.devicePixelRatio || 1), zoom: pinchZoom() });
  const strokeSetup = (h) => {
    h.measure();
    const a = h.parsed; const win = h.win || a.vb; const [vx, vy, vw, vh] = win;
    const Wd = Math.max(1, h.w); const Hd = Math.max(1, h.h);
    const pol = policy(Wd, Hd);
    const cv = D.createElement('canvas'); cv.className = 'sp-ink-draw'; cv.setAttribute('aria-hidden', 'true');
    cv.width = pol.width; cv.height = pol.height; h.box.appendChild(cv);
    const S = Math.min(Wd / vw, Hd / vh);
    const g = {
      cv, W: Wd, H: Hd, scale: pol.scale, S, OX: (Wd - vw * S) / 2 - vx * S, OY: (Hd - vh * S) / 2 - vy * S,
      lw: h.look.lw, alpha: h.look.alpha, win, vx, vy, vw, vh,
    };
    return g;
  };
  /* configure a context for stroking in CSS px (scale = device px per CSS px) */
  const strokeStyleFor = (c, h, g) => {
    c.setTransform(g.scale, 0, 0, g.scale, 0, 0); c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = g.alpha;
    const cw = h.colorway;
    if (cw.ink2) {
      const gr = c.createLinearGradient(g.vx * g.S + g.OX, g.vy * g.S + g.OY, (g.vx + g.vw) * g.S + g.OX, (g.vy + g.vh) * g.S + g.OY);
      gr.addColorStop(0, cw.ink); gr.addColorStop(1, cw.ink2); c.strokeStyle = gr;
    } else c.strokeStyle = cw.ink;
  };
  /* stroke polylines order[from..to) as whole strokes, batched by width */
  const drawStrokes = (c, h, g, order, from, to) => {
    const a = h.parsed; let curW = -1; let open = false;
    c.beginPath();
    for (let k = from; k < to; k++) {
      const j = order ? order[k] : k; const P = a.polys[j];
      if (!P || P.length < 4) continue;
      const w = g.lw * Math.max(0.5, a.widths[j] / 0.3);
      if (w !== curW) { if (open) { c.stroke(); c.beginPath(); open = false; } c.lineWidth = w; curW = w; }
      c.moveTo(P[0] * g.S + g.OX, P[1] * g.S + g.OY);
      for (let i = 2; i < P.length; i += 2) c.lineTo(P[i] * g.S + g.OX, P[i + 1] * g.S + g.OY);
      open = true;
    }
    if (open) c.stroke();
  };
  const shuffled = (n, rnd) => {
    const ord = new Uint32Array(n);
    for (let i = 0; i < n; i++) ord[i] = i;
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = ord[i]; ord[i] = ord[j]; ord[j] = t; }
    return ord;
  };

  const cascadeStyle = (h, o) => {
    if (h.kind === 'word') return h.wipePlayer();
    let g = null; let c = null; let ord = null; let done = 0;
    const rnd = (o && typeof o.random === 'function') ? o.random : Math.random;
    const player = {
      count: 0,
      frame(k) {
        if (!g) {
          g = strokeSetup(h); c = g.cv.getContext('2d'); strokeStyleFor(c, h, g);
          ord = shuffled(h.parsed.polys.length, rnd);
        }
        const n = ord.length; const upto = k >= 1 ? n : Math.min(n, Math.ceil(inOut(clamp01(k)) * n));
        if (upto > done) { drawStrokes(c, h, g, ord, done, upto); done = upto; player.count = done; }
      },
      dispose(fade) { if (g) dispatchOverlay(g.cv, fade); },
    };
    return player;
  };

  const sweepStyle = (h) => {
    if (h.kind === 'word') return h.wipePlayer();
    let g = null; let c = null; let full = null; let u = null; let tmin = 0; let tmax = 0; let soft = 0;
    return {
      frame(k) {
        if (!g) {
          g = strokeSetup(h); c = g.cv.getContext('2d');
          full = D.createElement('canvas'); full.width = g.cv.width; full.height = g.cv.height;
          const fc = full.getContext('2d'); strokeStyleFor(fc, h, g); drawStrokes(fc, h, g, null, 0, h.parsed.polys.length);
          // wipe direction: left to right, slanted like the mockup (rises 0.35 of the height across the width)
          const len = Math.hypot(g.W, 0.35 * g.H) || 1; u = [g.W / len, 0.35 * g.H / len];
          const ts = [0, g.W * u[0], g.H * u[1], g.W * u[0] + g.H * u[1]];
          tmin = Math.min.apply(null, ts); tmax = Math.max.apply(null, ts); soft = 0.28 * (tmax - tmin);
        }
        const p = inOut(clamp01(k));
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        c.clearRect(0, 0, g.cv.width, g.cv.height); c.drawImage(full, 0, 0);
        if (k < 1) {
          const f = tmin + p * (tmax - tmin + soft);
          const gr = c.createLinearGradient(u[0] * (f - soft) * g.scale, u[1] * (f - soft) * g.scale, u[0] * f * g.scale, u[1] * f * g.scale);
          gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          c.globalCompositeOperation = 'destination-in'; c.fillStyle = gr; c.fillRect(0, 0, g.cv.width, g.cv.height);
        }
        c.restore();
      },
      dispose(fade) { if (g) dispatchOverlay(g.cv, fade); },
    };
  };

  /* ------------------------------------------------------------------ art-layer styles (fade, bleed, scan, iris) */
  const SCAN_MASK = 'repeating-linear-gradient(180deg,#000 0 2px,rgba(0,0,0,.18) 2px 5px)';
  const setStyle = (el, prop, val) => { el.style.setProperty(prop, val); };
  /* per-style: state at progress k (0..1) on the art layer */
  const LAYER_FX = {
    fade: (el, k) => { const e = E_FADE(k); el.style.opacity = String(+e.toFixed(4)); el.style.transform = k >= 1 ? '' : `translateY(${(16 * (1 - e)).toFixed(2)}px)`; },
    bleed: (el, k) => {
      const e = E_BLEED(k); const settle = clamp01(k / 0.55); const sharp = E_BLEED(settle);
      el.style.opacity = String(+(0.15 + 0.85 * sharp).toFixed(4));
      el.style.filter = k >= 1 ? '' : `blur(${(12 * (1 - e)).toFixed(2)}px) contrast(${(0.7 + 0.3 * e).toFixed(3)})`;
    },
    scan: (el, k) => {
      const p = clamp01(k / 0.85); const rest = (100 * (1 - p)).toFixed(2);
      el.style.clipPath = k >= 1 ? '' : `inset(0 0 ${rest}% 0)`;
    },
    iris: (el, k) => { const r = (75 * E_IRIS(k)).toFixed(2); el.style.clipPath = k >= 1 ? '' : `circle(${r}% at 50% 50%)`; },
  };
  const layerStyle = (name) => (h) => {
    const el = h.box || h.el;
    const fx = LAYER_FX[name];
    // the finished art layers are hidden by `.sp-ink-drawing`; keep them visible, the box animates instead
    const inner = Array.prototype.slice.call(el.querySelectorAll ? el.querySelectorAll('.sp-ink-svg, .sp-ink-canvas, .sp-word-fill') : []);
    inner.forEach((n) => { n.style.opacity = '1'; });
    h.el.setAttribute('data-sp-ds', name);
    if (name === 'scan') { setStyle(el, '-webkit-mask-image', SCAN_MASK); setStyle(el, 'mask-image', SCAN_MASK); }
    el.style.willChange = name === 'iris' || name === 'scan' ? 'clip-path' : 'opacity, transform, filter';
    fx(el, 0);
    return {
      frame(k) { fx(el, clamp01(k)); },
      dispose() {
        ['opacity', 'transform', 'filter', 'clip-path', 'will-change', '-webkit-mask-image', 'mask-image'].forEach((p) => el.style.removeProperty(p));
        inner.forEach((n) => n.style.removeProperty('opacity'));
        h.el.removeAttribute('data-sp-ds');
      },
    };
  };

  const noneStyle = () => ({ frame() {}, dispose() {} });

  const STYLES = { sweep: sweepStyle, cascade: cascadeStyle, fade: layerStyle('fade'), bleed: layerStyle('bleed'), scan: layerStyle('scan'), iris: layerStyle('iris'), none: noneStyle };
  Object.keys(STYLES).forEach((name) => Ink.registerDrawStyle(name, STYLES[name]));

  /** drawIn with the style's natural duration (override with opts.duration) */
  const play = (target, style, opts) => Ink.drawIn(target, Object.assign({ style, duration: NATURAL_MS[style] || 1500 }, opts || {}));

  /* ------------------------------------------------------------------ hover re-trigger controller */
  const stillNow = () => {
    try { if (typeof Ink.isStill === 'function') return !!Ink.isStill(); } catch (e) { /* fall through */ }
    try { return !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  };
  /**
   * Hover re-trigger: fires the draw-in once per pointer entry, after the pointer has rested ~minRestMs;
   * moves under minMovePx do not count as motion; at most one run per cooldownMs; scrolling restarts the rest;
   * leaving mid-animation finishes it; does nothing while Still / reduced motion.
   * Returns { destroy(), fired() }.
   */
  const retrigger = (handle, style, options) => {
    const o = Object.assign({ minRestMs: 120, minMovePx: 4, cooldownMs: 1800 }, options || {});
    const el = handle && handle.el;
    if (!el) return { destroy() {}, fired: () => 0 };
    const nowMs = () => Date.now();
    let inside = false; let firedThisEntry = false; let timer = 0; let ax = null; let ay = null;
    let lastFire = -Infinity; let mine = false; let count = 0; let still = stillNow();
    const clear = () => { if (timer) { clearTimeout(timer); timer = 0; } };
    const arm = () => { clear(); if (inside && !firedThisEntry) timer = setTimeout(fire, o.minRestMs); };
    const fire = () => {
      timer = 0;
      if (!inside || firedThisEntry || still || stillNow()) return;
      if (nowMs() - lastFire < o.cooldownMs) return;
      if (handle.run) return;
      firedThisEntry = true; lastFire = nowMs(); mine = true; count++;
      Ink.drawIn(handle, { style, duration: o.duration || NATURAL_MS[style] || 1100 }).then(() => { mine = false; });
    };
    const isTouch = (e) => e && e.pointerType === 'touch';
    const onEnter = (e) => {
      if (isTouch(e)) return;
      inside = true; firedThisEntry = false; ax = e && e.clientX != null ? e.clientX : null; ay = e && e.clientY != null ? e.clientY : null; arm();
    };
    const onMove = (e) => {
      if (!inside || isTouch(e)) return;
      const x = e.clientX; const y = e.clientY;
      if (ax == null || ay == null) { ax = x; ay = y; return; }
      if (Math.hypot(x - ax, y - ay) < o.minMovePx) return; // jitter: not motion
      ax = x; ay = y; arm();
    };
    const onLeave = () => {
      inside = false; clear();
      if (mine && handle.run) Ink.finish(handle);
      mine = false;
    };
    const onScroll = () => { if (inside && !firedThisEntry) arm(); };
    const onMotion = (e) => {
      still = !!(e && e.detail && e.detail.still);
      if (still) { clear(); if (handle.run) Ink.finish(handle); }
    };
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointercancel', onLeave);
    W.addEventListener('scroll', onScroll, true);
    W.addEventListener('vectura:start-page-motion', onMotion);
    return {
      fired: () => count,
      destroy() {
        clear(); inside = false;
        el.removeEventListener('pointerenter', onEnter);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', onLeave);
        el.removeEventListener('pointercancel', onLeave);
        W.removeEventListener('scroll', onScroll, true);
        W.removeEventListener('vectura:start-page-motion', onMotion);
      },
    };
  };

  Vectura.StartPageDrawStyles = { STYLES: Object.keys(STYLES), NATURAL_MS, LABELS, play, retrigger, easing: { E_FADE, E_BLEED, E_IRIS } };
})();
