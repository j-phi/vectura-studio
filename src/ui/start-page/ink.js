/**
 * Start Page art runtime (Vectura.StartPageInk).
 *
 * Mounts exported plotter SVGs (strokes only) into tiles, recolored from a colorway
 * object through CSS custom properties (--sp-paper / --sp-ink / --sp-ink2):
 *   - pieces <= 250 KB stay inline vector SVG (cover/contain via a viewBox window);
 *   - larger ones rasterize into a device-pixel <canvas> sized from the LAYOUT box x
 *     devicePixelRatio x pinch-zoom scale (via KeyboardInset.pageScale) (cap 4, max 4096 px), tinted in place, and
 *     re-rasterize on resize, DPR change and pinch zoom. Never CSS mask-image.
 * Also: draw-in (style registry; Plot ships), fillWord (art clipped to glyphs), motion.
 *
 * A colorway is { paper, ink, ink2|null, key? } (see StartPageColorway). Art is
 * { id, svg } from a provider; this module never fetches.
 * Pure math lives in src/core/start-page/art-geometry.js.
 */
(() => {
  const W = window;
  const D = document;
  const Vectura = (W.Vectura = W.Vectura || {});
  const Geo = Vectura.StartPageArtGeometry;
  if (!Geo) throw new Error('StartPageInk requires StartPageArtGeometry (src/core/start-page/art-geometry.js)');

  const RASTER_OVER = 250000; // bytes of SVG text; above this a piece rasterizes
  const state = { still: false };

  /* ------------------------------------------------------------------ environment */
  const reducedMotion = () => {
    try {
      const u = Vectura.UI && Vectura.UI.utils;
      if (u && typeof u.prefersReducedMotion === 'function') return !!u.prefersReducedMotion();
    } catch (e) { /* fall through */ }
    try { return !!W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  };
  const isStill = () => state.still || reducedMotion();
  const pinchZoom = () => { try { const K = Vectura.KeyboardInset; return K && K.pageScale ? K.pageScale() : 1; } catch (e) { return 1; } };
  const devicePx = () => Math.max(1, W.devicePixelRatio || 1);
  const policyFor = (cssWidth, cssHeight) => Geo.rasterPolicy({ cssWidth, cssHeight, dpr: devicePx(), zoom: pinchZoom() });
  const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c);
  const isLight = (hex) => Geo.luminance(hex) > 0.4;

  /* ------------------------------------------------------------------ parse + raster (worker with main-thread fallback) */
  const mainLib = Geo.rasterLib((w, h) => { const c = D.createElement('canvas'); c.width = w; c.height = h; return c; });
  let worker = null;
  let workerTried = false;
  let wid = 0;
  const wcb = new Map();
  const WORKER_SRC = () => `const L=(${Geo.rasterLibSource})((w,h)=>new OffscreenCanvas(w,h));const arts=new Map();`
    + 'onmessage=e=>{const m=e.data;try{'
    + 'if(m.op==="parse"){const a=L.parse(m.text);arts.set(m.key,a);postMessage({id:m.id,art:{vb:a.vb,polys:a.polys,widths:a.widths,lens:a.lens,total:a.total,strokes:a.strokes}});}'
    + 'else if(m.op==="raster"){const a=arts.get(m.key);if(!a)throw new Error("no art");const bmp=L.raster(a,m).transferToImageBitmap();postMessage({id:m.id,bmp},[bmp]);}'
    + 'else if(m.op==="drop"){arts.delete(m.key);}'
    + '}catch(err){postMessage({id:m.id,error:String(err)});}};';
  const getWorker = () => {
    if (worker || workerTried) return worker;
    workerTried = true;
    try {
      if (typeof W.Worker !== 'undefined' && typeof W.OffscreenCanvas !== 'undefined' && W.URL && W.Blob) {
        const url = W.URL.createObjectURL(new W.Blob([WORKER_SRC()], { type: 'text/javascript' }));
        worker = new W.Worker(url);
        worker.onmessage = (e) => { const cb = wcb.get(e.data.id); wcb.delete(e.data.id); if (cb) cb(e.data); };
        worker.onerror = () => { worker = null; wcb.forEach((cb) => cb({ error: 'worker' })); wcb.clear(); };
      }
    } catch (e) { worker = null; }
    return worker;
  };
  const callWorker = (msg) => new Promise((res) => {
    const wk = getWorker();
    if (!wk) return res({ error: 'noworker' });
    const id = ++wid; let done = false;
    const fin = (d) => { if (!done) { done = true; res(d); } };
    wcb.set(id, fin);
    setTimeout(() => { if (!done) { wcb.delete(id); fin({ error: 'timeout' }); } }, 6000);
    wk.postMessage(Object.assign({ id }, msg));
  });

  const artCache = new Map(); // key -> Promise<parsed>
  const inWorker = new Set();
  const keyOf = (art) => `${art.id}:${(art.svg || '').length}`;
  const MAX_CACHE = 32;
  const parseArt = (art) => {
    const key = keyOf(art);
    if (artCache.has(key)) return artCache.get(key);
    const p = callWorker({ op: 'parse', key, text: art.svg }).then((d) => {
      if (d && d.art) { inWorker.add(key); return d.art; }
      return mainLib.parse(art.svg);
    });
    artCache.set(key, p);
    if (artCache.size > MAX_CACHE) {
      const old = artCache.keys().next().value;
      artCache.delete(old);
      if (inWorker.delete(old) && worker) worker.postMessage({ op: 'drop', key: old });
    }
    return p;
  };
  /* white (or ink) coverage bitmap of the window, at device px: ImageBitmap or canvas */
  const rasterArt = (art, parsed, m) => {
    const key = keyOf(art);
    const local = () => mainLib.raster(parsed, m);
    if (!inWorker.has(key)) return Promise.resolve(local());
    return callWorker(Object.assign({ op: 'raster', key }, m)).then((d) => (d && d.bmp ? d.bmp : local()));
  };

  /* ------------------------------------------------------------------ colorway helpers */
  const normColorway = (c) => {
    const cw = Object.assign({ paper: '#fbfaf6', ink: '#1a1a1a', ink2: null }, c || {});
    if (!cw.ink2) cw.ink2 = null;
    if (!cw.fill) cw.fill = null;
    if (!cw.key) cw.key = `custom|${cw.paper}|${cw.ink}|${cw.ink2 || ''}${cw.fill ? `|fill:${cw.fill.kind || 'custom'}` : ''}`;
    return cw;
  };
  const setVars = (el, cw) => {
    el.style.setProperty('--sp-paper', cw.paper);
    el.style.setProperty('--sp-ink', cw.ink);
    if (cw.ink2) el.style.setProperty('--sp-ink2', cw.ink2); else el.style.removeProperty('--sp-ink2');
    if (cw.ink2) el.setAttribute('data-sp-duo', ''); else el.removeAttribute('data-sp-duo');
    el.setAttribute('data-sp-key', cw.key);
  };
  /* tint a coverage bitmap with ink / duo gradient into a fresh or given canvas */
  /* special fill (additive hook): cw.fill = { type: 'conic'|'linear', angle, stops: [[0..1, hex]], anim, speed } painted
     over the coverage bitmap instead of a flat ink; `phase` (deg) turns a conic fill. */
  const fillStyle = (c, f, w, h, phase) => {
    let g = null;
    if (f.type === 'conic' && typeof c.createConicGradient === 'function') g = c.createConicGradient(((f.angle || 0) + (phase || 0)) * Math.PI / 180, w / 2, h / 2);
    else {
      const a = ((f.type === 'conic' ? 125 : (f.angle || 125)) - 90) * Math.PI / 180; const r = Math.hypot(w, h) / 2;
      g = c.createLinearGradient(w / 2 - Math.cos(a) * r, h / 2 - Math.sin(a) * r, w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
    }
    (f.stops || []).forEach((st) => { try { g.addColorStop(st[0], st[1]); } catch (e) { /* bad stop */ } });
    return g;
  };
  const tintInto = (dst, src, cw, phase) => {
    const c = dst.getContext('2d'); const w = dst.width; const h = dst.height;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, w, h);
    c.drawImage(src, 0, 0, w, h);
    c.globalCompositeOperation = 'source-in';
    if (cw.fill && cw.fill.stops) c.fillStyle = fillStyle(c, cw.fill, w, h, phase);
    else if (cw.ink2) { const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, cw.ink); g.addColorStop(1, cw.ink2); c.fillStyle = g; } else c.fillStyle = cw.ink;
    c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over';
    return dst;
  };

  /* ------------------------------------------------------------------ inline SVG preparation */
  let uid = 0;
  /*
   * Art SVG is untrusted (a crafted .vectura can carry anything through its settings). It is never handed to an HTML
   * parser: the text is parsed as XML (DOMParser), then a NEW tree is built with createElementNS from an ALLOWLIST of
   * elements and attributes. Everything else (scripts, handlers, href / xlink:href, style, foreignObject, use, image,
   * a, animate*, set ...) is dropped; text survives only inside <title>. Not well-formed XML yields null.
   */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ALLOWED_EL = new Set(['svg', 'g', 'path', 'polyline', 'polygon', 'line', 'circle', 'ellipse', 'rect', 'defs', 'clipPath', 'title']);
  const ALLOWED_ATTR = new Set(['d', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'transform',
    'viewBox', 'id', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
    'stroke-dashoffset', 'stroke-opacity', 'fill-opacity', 'fill-rule', 'clip-rule', 'clip-path', 'clipPathUnits', 'opacity', 'vector-effect']);
  const WIDTH_TAGS = new Set(['g', 'path', 'circle', 'polyline', 'polygon', 'line']);
  const LOCAL_URL = /^url\(\s*#[A-Za-z_][\w.:-]*\s*\)$/;
  const goodAttr = (name, value) => {
    if (typeof value !== 'string' || value.length > 200000) return false;
    if (/javascript:|data:|expression\(|[<>]/i.test(value)) return false;
    if (/url\(/i.test(value)) return (name === 'clip-path' || name === 'fill' || name === 'stroke') && LOCAL_URL.test(value.trim());
    if (name === 'id') return /^[A-Za-z_][\w.:-]*$/.test(value);
    return true;
  };
  const num = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
  const copyTree = (src, dst) => {
    Array.prototype.forEach.call(src.childNodes, (n) => {
      if (n.nodeType !== 1 || !ALLOWED_EL.has(n.localName) || n.localName === 'svg') return;
      const out = D.createElementNS(SVG_NS, n.localName);
      if (n.localName === 'title') out.textContent = String(n.textContent || '').slice(0, 200);
      else copyTree(n, out);
      Array.prototype.forEach.call(n.attributes, (a) => {
        if (a.namespaceURI || a.prefix || !ALLOWED_ATTR.has(a.localName) || !goodAttr(a.localName, a.value)) return;
        if (a.localName === 'stroke-width' && WIDTH_TAGS.has(n.localName) && /^[\d.]+$/.test(a.value)) {
          // strokes keep their relative widths as --sp-w multipliers over the adaptive line weight
          const f = +a.value / 0.3;
          if (Math.abs(f - 1) >= 0.01) out.style.setProperty('--sp-w', f.toFixed(3));
          return;
        }
        out.setAttribute(a.localName, a.value);
      });
      dst.appendChild(out);
    });
  };
  const safeSvg = (txt, gid) => {
    if (typeof W.DOMParser === 'undefined') return null;
    const text = String(txt || '').replace(/<!DOCTYPE[^>]*>/gi, '');
    if (/<!ENTITY/i.test(text)) return null;
    let doc;
    try { doc = new W.DOMParser().parseFromString(text.trim(), 'image/svg+xml'); } catch (e) { return null; }
    const src = doc && doc.documentElement;
    if (!src || src.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
    const svg = D.createElementNS(SVG_NS, 'svg');
    const vb = (src.getAttribute('viewBox') || '').trim();
    const vbOk = /^[\d\s.,eE+-]+$/.test(vb) ? vb : '';
    if (vbOk) svg.setAttribute('viewBox', vbOk);
    const [vx, vy, vw, vh] = vbOk ? vbOk.split(/[\s,]+/).map((v) => num(v, 0)) : [0, 0, 100, 100];
    svg.setAttribute('class', 'sp-ink-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const defs = D.createElementNS(SVG_NS, 'defs');
    const grad = D.createElementNS(SVG_NS, 'linearGradient');
    const gradId = /^[A-Za-z_][\w.:-]*$/.test(String(gid)) ? String(gid) : 'sp-grad';
    grad.setAttribute('id', gradId);
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('x1', String(vx)); grad.setAttribute('y1', String(vy));
    grad.setAttribute('x2', String(vx + vw)); grad.setAttribute('y2', String(vy + vh));
    [['0', 'stop-color:var(--sp-ink)'], ['1', 'stop-color:var(--sp-ink2,var(--sp-ink))']].forEach(([off, style]) => {
      const stop = D.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', off); stop.setAttribute('style', style);
      grad.appendChild(stop);
    });
    defs.appendChild(grad); svg.appendChild(defs);
    copyTree(src, svg);
    return svg;
  };

  /* ------------------------------------------------------------------ handles, observers, DPR / zoom watching */
  const handles = new Set(); // tile + word handles
  const resizeTargets = new WeakMap();
  const ro = typeof W.ResizeObserver !== 'undefined'
    ? new W.ResizeObserver((entries) => entries.forEach((e) => { const h = resizeTargets.get(e.target); if (h) h.onResize(); }))
    : null;
  let lastScale = 0;
  let mq = null;
  let mqOff = null;
  let vvTimer = 0;
  let vvOff = null;
  const rescaleAll = () => {
    const s = devicePx() * pinchZoom();
    if (Math.abs(s - lastScale) < 0.01) return;
    lastScale = s;
    handles.forEach((h) => h.rescale && h.rescale());
  };
  const armDpr = () => {
    try {
      mq = W.matchMedia(`(resolution: ${devicePx()}dppx)`);
      const on = () => { if (mq.removeEventListener) mq.removeEventListener('change', on); rescaleAll(); if (handles.size) armDpr(); };
      if (mq.addEventListener) mq.addEventListener('change', on);
      mqOff = () => { if (mq && mq.removeEventListener) mq.removeEventListener('change', on); };
    } catch (e) { mq = null; }
  };
  const watchEnv = () => {
    if (mqOff || vvOff) return;
    lastScale = devicePx() * pinchZoom();
    armDpr();
    try {
      const K = Vectura.KeyboardInset;
      if (K && K.onViewportChange) {
        const on = () => { clearTimeout(vvTimer); vvTimer = setTimeout(rescaleAll, 220); };
        vvOff = K.onViewportChange(on);
      }
    } catch (e) { /* no visual viewport */ }
    try {
      if (D.fonts && D.fonts.addEventListener) {
        const on = () => handles.forEach((h) => h.refit && h.refit());
        D.fonts.addEventListener('loadingdone', on);
        fontsOff = () => D.fonts.removeEventListener('loadingdone', on);
      }
    } catch (e) { /* no FontFaceSet events */ }
  };
  let fontsOff = null;
  const unwatchEnv = () => {
    if (handles.size) return;
    if (mqOff) mqOff(); mqOff = null;
    if (vvOff) vvOff(); vvOff = null;
    if (fontsOff) fontsOff(); fontsOff = null;
    clearTimeout(vvTimer);
    if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; workerTried = false; wcb.clear(); inWorker.clear(); artCache.clear(); }
  };

  /* ------------------------------------------------------------------ draw-in scheduler + style registry */
  const active = new Set();
  let rafOn = false;
  const tick = (now) => {
    for (const run of Array.from(active)) {
      if (now < run.t0) continue;
      const k = Math.min(1, (now - run.t0) / run.dur);
      run.player.frame(k);
      if (k >= 1) endRun(run, false);
    }
    if (active.size) W.requestAnimationFrame(tick); else rafOn = false;
  };
  const wake = () => { if (!rafOn) { rafOn = true; W.requestAnimationFrame(tick); } };
  const endRun = (run, instant) => {
    if (run.done) return;
    run.done = true; active.delete(run);
    run.h.run = null;
    run.player.dispose(!instant);
    run.h.el.classList.remove('sp-ink-drawing');
    run.resolve(run.h);
  };

  /* A style is a function (handle, opts) => player { frame(k 0..1), dispose(fade) }. */
  const plotStyle = (h) => {
    if (h.kind === 'word') return h.plotPlayer ? h.plotPlayer() : h.wipePlayer();
    let cv = null; let c = null; let S = 1; let OX = 0; let OY = 0; let lw = 0.6;
    let pi = 0; let pj = 1; let f = 0; let drawn = 0;
    const setup = () => {
      h.measure();
      const a = h.parsed; const win = h.win || a.vb; const [vx, vy, vw, vh] = win;
      const pol = policyFor(Math.max(1, h.w), Math.max(1, h.h));
      cv = D.createElement('canvas'); cv.className = 'sp-ink-draw'; cv.setAttribute('aria-hidden', 'true');
      cv.width = pol.width; cv.height = pol.height; h.box.appendChild(cv);
      c = cv.getContext('2d'); c.setTransform(pol.scale, 0, 0, pol.scale, 0, 0); c.lineCap = 'round'; c.lineJoin = 'round';
      S = Math.min(h.w / vw, h.h / vh); OX = (h.w - vw * S) / 2 - vx * S; OY = (h.h - vh * S) / 2 - vy * S;
      lw = h.look.lw; c.globalAlpha = h.look.alpha;
      const cw = h.colorway;
      if (cw.ink2) { const g = c.createLinearGradient(vx * S + OX, vy * S + OY, (vx + vw) * S + OX, (vy + vh) * S + OY); g.addColorStop(0, cw.ink); g.addColorStop(1, cw.ink2); c.strokeStyle = g; } else c.strokeStyle = cw.ink;
    };
    const advanceTo = (L) => {
      const a = h.parsed; L = Math.min(L, a.total);
      let curW = -1; let started = false; let px = 0; let py = 0; c.beginPath();
      while (drawn < L && pi < a.polys.length) {
        const P = a.polys[pi]; const w = lw * Math.max(0.5, a.widths[pi] / 0.3);
        if (w !== curW) { if (started) { c.stroke(); c.beginPath(); started = false; } c.lineWidth = w; curW = w; }
        const x0 = P[pj * 2 - 2], y0 = P[pj * 2 - 1], x1 = P[pj * 2], y1 = P[pj * 2 + 1];
        const seg = Math.hypot(x1 - x0, y1 - y0); const remain = seg * (1 - f);
        const sx = x0 + (x1 - x0) * f; const sy = y0 + (y1 - y0) * f;
        if (!started || sx * S + OX !== px || sy * S + OY !== py) { c.moveTo(sx * S + OX, sy * S + OY); started = true; }
        if (drawn + remain <= L) {
          px = x1 * S + OX; py = y1 * S + OY; c.lineTo(px, py); drawn += remain; f = 0; pj++;
          if (pj * 2 >= P.length) { pi++; pj = 1; }
        } else {
          const nf = f + (L - drawn) / (seg || 1);
          px = (x0 + (x1 - x0) * nf) * S + OX; py = (y0 + (y1 - y0) * nf) * S + OY; c.lineTo(px, py); f = nf; drawn = L;
        }
      }
      if (started) c.stroke();
    };
    return {
      frame(k) { if (!cv) setup(); advanceTo(h.parsed.total * Geo.plotEase(k)); },
      dispose(fade) {
        if (!cv) return;
        const node = cv;
        if (fade) { node.classList.add('sp-ink-draw-out'); setTimeout(() => node.remove(), 420); } else node.remove();
      },
    };
  };
  const DRAW_STYLES = { plot: plotStyle }; // P3 adds Sweep, Fade up, Ink bleed, Stroke cascade, Scan lines, Iris, None
  const registerDrawStyle = (name, fn) => { if (typeof fn === 'function') DRAW_STYLES[name] = fn; };

  const resolveHandle = (t) => {
    if (!t) return null;
    if (t.el && t.kind) return t;
    if (typeof t === 'string') t = D.querySelector(t);
    return (t && (t._spWord || t._spInk)) || null;
  };
  const finish = (target) => {
    if (target === undefined) { Array.from(active).forEach((r) => endRun(r, true)); return; }
    const h = resolveHandle(target);
    if (h && h.run) endRun(h.run, true);
  };
  const drawIn = (target, opts) => {
    const h = resolveHandle(target);
    if (!h) return Promise.resolve(null);
    const o = Object.assign({ style: 'plot', duration: 1500, delay: 0 }, opts || {});
    if (h.run) endRun(h.run, true);
    return h.ready.then(() => new Promise((resolve) => {
      if (!h.alive() || isStill() || o.style === 'none') return resolve(h);
      const make = DRAW_STYLES[o.style] || DRAW_STYLES.plot;
      const run = { h, o, dur: Math.max(1, o.duration), t0: performance.now() + (o.delay || 0), resolve, done: false, player: null };
      h._own = false;
      run.player = make(h, o);
      // a style that animates the element itself (fade, bleed, iris...) needs the finished letter under it
      if (h.kind === 'word' && h.release && !h._own) h.release();
      h.run = run; h.el.classList.add('sp-ink-drawing'); active.add(run); wake();
    }));
  };
  // ONE source of truth for motion: isStill() = the Still toggle OR prefers-reduced-motion. Every change (the toggle, or the
  // OS setting flipping) is announced on `vectura:start-page-motion` { detail: { still } } so draw styles, hover effects,
  // lift cards and the 3D models stop (or resume) together.
  const announceMotion = () => {
    try { W.dispatchEvent(new W.CustomEvent('vectura:start-page-motion', { detail: { still: isStill() } })); } catch (e) { /* ignore */ }
  };
  const syncMotionAttrs = () => {
    try {
      const root = D.documentElement;
      if (state.still) root.setAttribute('data-sp-motion', 'still'); else root.removeAttribute('data-sp-motion');
      if (isStill()) root.setAttribute('data-start-page-still', ''); else root.removeAttribute('data-start-page-still');
    } catch (e) { /* ignore */ }
  };
  const setMotion = (o) => {
    const before = isStill();
    if (o && typeof o.still === 'boolean') state.still = o.still;
    syncMotionAttrs();
    if (isStill()) finish();
    if (isStill() !== before) announceMotion();
  };
  try {
    const mq = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq && mq.addEventListener) mq.addEventListener('change', () => { syncMotionAttrs(); if (isStill()) finish(); announceMotion(); });
  } catch (e) { /* ignore */ }
  syncMotionAttrs();

  /* ------------------------------------------------------------------ tiles */
  // 'cover' crops to the ink; 'object' shows the whole ink box scaled up to fill; anything else contains the paper
  const fitOf = (f) => (f === 'cover' || f === 'object' ? f : 'contain');
  const mount = (el, art, opts) => {
    if (typeof el === 'string') el = D.querySelector(el);
    if (!el) return Promise.reject(new Error('StartPageInk.mount: no element'));
    opts = opts || {};
    if (!art || typeof art.svg !== 'string') return Promise.reject(new Error('StartPageInk.mount: art needs { id, svg }'));
    if (el._spInk || el._spWord) unmount(el);
    const id = ++uid; const gid = `sp-g${id}`;
    const fit = fitOf(opts.fit);
    const pad = opts.pad == null ? (fit === 'cover' ? 0 : fit === 'object' ? 0.04 : 0.08) : opts.pad;
    const h = {
      kind: 'tile', id, el, art, parsed: null, mode: 'svg', fit, frame: opts.frame || null, pad, colorway: normColorway(opts.colorway),
      w: 0, h: 0, win: null, s: 1, look: { lw: 0.6, alpha: 1 }, svg: null, canvas: null, bmp: null, rasterScale: 1, run: null, _gen: 0, _t: 0,
      alive: () => el._spInk === h,
    };
    el._spInk = h; handles.add(h); watchEnv();
    el.classList.add('sp-ink');
    el.style.setProperty('--sp-pad', `${pad * 100}%`);
    el.style.setProperty('--sp-stroke', `url(#${gid})`);
    const box = D.createElement('div'); box.className = 'sp-ink-art'; el.appendChild(box); h.box = box;
    if (opts.label !== false && !el.getAttribute('role')) el.setAttribute('role', 'img');
    setVars(el, h.colorway);

    /* layout size: clientWidth/Height ignore transforms, so a tile measured mid-animation is never rasterized small */
    h.measure = () => {
      let w = box.clientWidth; let hh = box.clientHeight;
      if (!w || !hh) { w = Math.round((el.clientWidth || 0) * (1 - 2 * pad)); hh = Math.round((el.clientHeight || 0) * (1 - 2 * pad)); }
      if (!w || !hh) { const r = box.getBoundingClientRect(); w = r.width; hh = r.height; }
      h.w = w; h.h = hh;
      if (h.parsed && w && hh) { h.win = Geo.artWindow(h.parsed, w, hh, h.fit, h.frame); h.s = w / h.win[2]; } else h.win = null;
    };
    h.applyLook = () => {
      if (!h.parsed || !h.w) return;
      h.look = Geo.lineLook(h.parsed, h.w, h.h, isLight(h.colorway.paper), h.win ? h.s : 0, h.win);
      el.style.setProperty('--sp-lw', `${h.look.lw}px`); el.style.setProperty('--sp-alpha', String(h.look.alpha));
    };
    h.setViewBox = () => {
      if (h.svg && h.win) { h.svg.setAttribute('viewBox', h.win.map((v) => +v.toFixed(3)).join(' ')); h.svg.setAttribute('preserveAspectRatio', 'none'); }
    };
    h.paint = () => {
      if (h.mode !== 'canvas' || !h.canvas || !h.bmp) return;
      tintInto(h.canvas, h.bmp, h.colorway, h.phase || 0);
    };
    /* Rastered alternates (canvas mode): a baked pose is rastered once when it is prepared, so showing it is a repaint of
     * a cached bitmap rather than a fresh raster of its whole drawing. Keyed by the raster size; a resize drops them. */
    const altBmps = new Map(); let ownBmp = null; let altKey = '';
    const rasterKey = () => { const pol = policyFor(h.w, h.h); return `${pol.width}x${pol.height}@${pol.scale}`; };
    h.raster = () => {
      if (!h.parsed || !h.w || !h.h) return Promise.resolve();
      const gen = ++h._gen; const pol = policyFor(h.w, h.h); const w0 = h.w; const h0 = h.h; const win = h.win;
      // A shown alternate (showArt) rasters in the HOME window and line look, so swapping never reframes the tile.
      const shown = h.shown; const src = shown ? shown.art : art;
      const parsedP = shown ? parseArt(shown.art) : Promise.resolve(h.parsed);
      return parsedP.then((parsed) => rasterArt(src, parsed, { w: w0, h: h0, dpr: pol.scale, lw: h.look.lw, alpha: h.look.alpha, color: '#ffffff', win })).then((b) => {
        if (!h.alive() || gen !== h._gen) return;
        if (!h.canvas) { h.canvas = D.createElement('canvas'); h.canvas.className = 'sp-ink-canvas'; h.canvas.setAttribute('aria-hidden', 'true'); box.appendChild(h.canvas); }
        h.canvas.width = pol.width; h.canvas.height = pol.height; h.rasterScale = pol.scale; h.bmp = b; h.paint();
        const key = rasterKey(); if (altKey !== key) { altBmps.clear(); altKey = key; } /* every cached pose was drawn at another size */
        if (!shown) ownBmp = b; else altBmps.set(shown.art.id, b);
        if (h.colorway.fill && h.colorway.fill.anim && !fillRaf) startFill();
      });
    };
    let rT = 0;
    h.onResize = () => {
      const ow = h.w; const oh = h.h; h.measure();
      if (Math.abs(ow - h.w) < 1 && Math.abs(oh - h.h) < 1) return;
      h.applyLook(); h.setViewBox();
      if (h.mode === 'canvas') { clearTimeout(rT); rT = setTimeout(h.raster, 180); }
    };
    h.rescale = () => { if (h.mode === 'canvas') h.raster(); };
    h.destroy = () => { clearTimeout(rT); clearTimeout(h._t); };
    /* an animated conic fill repaints at ~30 fps while the tile is on screen and motion is allowed */
    let fillRaf = 0; let fillLast = 0;
    const stopFill = () => { if (fillRaf) W.cancelAnimationFrame(fillRaf); fillRaf = 0; };
    const startFill = () => {
      stopFill();
      const f = h.colorway.fill;
      if (!f || !f.anim || isStill()) { h.phase = 0; return; }
      const tick = (t) => {
        if (!h.alive()) return;
        fillRaf = W.requestAnimationFrame(tick);
        if (isStill()) { stopFill(); h.phase = 0; h.paint(); return; }
        if (t - fillLast < 33) return;
        fillLast = t;
        const r = el.getBoundingClientRect();
        if (!el.isConnected || r.bottom < 0 || r.top > (W.innerHeight || 0)) return;
        h.phase = (t / 1000 * (f.speed || 36)) % 360; h.paint();
      };
      fillRaf = W.requestAnimationFrame(tick);
    };
    const prevDestroy = h.destroy;
    h.destroy = () => { stopFill(); prevDestroy(); };
    h.setColorway = (c) => {
      h.colorway = normColorway(c); setVars(el, h.colorway); h.applyLook();
      if (h.colorway.fill && h.mode === 'svg' && h.parsed) {
        /* the vector tile cannot carry a conic or animated fill: continue as the crisp raster */
        if (h.svg) { h.svg.remove(); h.svg = null; }
        h.mode = 'canvas'; el.classList.add('sp-ink-raster'); h.raster().then(startFill); return;
      }
      h.paint(); startFill();
    };
    h.setFrame = (frame, nextFit) => {
      h.frame = frame || null; if (nextFit) h.fit = fitOf(nextFit);
      h.measure(); h.applyLook(); h.setViewBox();
      if (h.mode === 'canvas') { clearTimeout(rT); rT = setTimeout(h.raster, 60); }
    };
    /* Alternate drawings of the SAME piece (a live 3D Scene's other camera poses: StartPageSceneOrbit). They are drawn
     * exactly like the tile's own art (same sanitizer, colorway, line look, fit and frame), in the tile's HOME window:
     * the window and look stay those of the art the tile was mounted with, so a swap never reframes or re-weights it.
     * prepareArt(alt) warms one (an off-DOM inline SVG, or a parsed raster source) and resolves when it can be shown;
     * showArt(alt) shows it, showArt(null) shows the tile's own art again. `alt` is { id, svg } with an id of its own. */
    const alts = new Map(); // alt id -> detached sanitized <svg> (svg mode)
    const MAX_ALTS = 48;
    const altNode = (a) => {
      let n = alts.get(a.id);
      if (!n) {
        n = safeSvg(a.svg, gid);
        if (!n) return null;
        alts.set(a.id, n);
        if (alts.size > MAX_ALTS) { const k = alts.keys().next().value; if (!h.shown || h.shown.art.id !== k) alts.delete(k); }
      }
      return n;
    };
    /* How many rastered poses this tile may hold: START_PAGE.SCENE_ORBIT.altBitmapMB (altBitmapMBMobile on a touch / low-memory device) over
     * the bytes of one bitmap, never fewer than 6 nor more than MAX_ALTS. The scene orbit stops baking poses past it. */
    h.altCapacity = () => {
      const C = (Vectura.START_PAGE && Vectura.START_PAGE.SCENE_ORBIT) || {};
      let mob = false;
      try { mob = (Number.isFinite(W.navigator && W.navigator.deviceMemory) && W.navigator.deviceMemory <= 4) || !!(W.matchMedia && W.matchMedia('(pointer: coarse)').matches); } catch (e) { mob = false; }
      const mb = mob ? (C.altBitmapMBMobile || 18) : (C.altBitmapMB || 32);
      const pol = policyFor(h.w || 1, h.h || 1);
      return Math.max(6, Math.min(MAX_ALTS, Math.floor(mb * 1048576 / Math.max(1, pol.width * pol.height * 4))));
    };
    h.prepareArt = (a) => h.ready.then(() => {
      if (!h.alive() || !a || typeof a.svg !== 'string') return false;
      if (h.mode === 'svg') return !!altNode(a);
      return parseArt(a).then((parsed) => {
        if (!h.canvas || !h.w || !h.h) return true;
        const key = rasterKey(); if (altKey !== key) { altBmps.clear(); altKey = key; ownBmp = null; }
        if (altBmps.has(a.id)) return true;
        const pol = policyFor(h.w, h.h);
        return rasterArt(a, parsed, { w: h.w, h: h.h, dpr: pol.scale, lw: h.look.lw, alpha: h.look.alpha, color: '#ffffff', win: h.win }).then((b) => {
          if (!h.alive() || altKey !== key) return true;
          altBmps.set(a.id, b);
          const cap = h.altCapacity();
          for (const k of Array.from(altBmps.keys())) { if (altBmps.size <= cap) break; if (!h.shown || h.shown.art.id !== k) altBmps.delete(k); }
          return true;
        }, () => true);
      }, () => false);
    });
    h.showArt = (a) => h.ready.then(() => {
      if (!h.alive() || !h.parsed) return false;
      if (a && (typeof a.svg !== 'string' || a.id === art.id)) a = null;
      if ((h.shown ? h.shown.art.id : null) === (a ? a.id : null)) return true;
      if (h.mode === 'svg') {
        const n = a ? altNode(a) : (h.ownSvg || h.svg);
        if (!n || !h.svg) return false;
        if (!h.ownSvg) h.ownSvg = h.svg;
        if (n !== h.svg) { h.svg.replaceWith(n); h.svg = n; }
        h.shown = a ? { art: a } : null;
        h.setViewBox();
        return true;
      }
      // a cached bitmap at the current raster size: repaint it (no re-raster, no async gap)
      const cached = h.canvas && altKey === rasterKey() ? (a ? altBmps.get(a.id) : ownBmp) : null;
      h.shown = a ? { art: a } : null;
      if (cached) { h._gen += 1; h.bmp = cached; h.paint(); return true; }
      return h.raster().then(() => true);
    });
    /* Continue as the crisp raster (what a large piece or a colorway fill already does). A turning 3D Scene asks for it: every baked
     * pose is rastered once when it is prepared, so turning is a repaint of a cached bitmap instead of swapping a dense inline SVG. */
    h.useRaster = () => h.ready.then(() => {
      if (!h.alive() || !h.parsed) return false;
      if (h.mode === 'canvas') return true;
      if (h.svg) { h.svg.remove(); h.svg = null; }
      h.ownSvg = null; alts.clear(); h.shown = null;
      h.mode = 'canvas'; el.classList.add('sp-ink-raster');
      return h.raster().then(() => true);
    });
    h.shownArt = () => (h.shown ? h.shown.art : art);
    const destroyAlts = h.destroy;
    h.destroy = () => { alts.clear(); h.shown = null; destroyAlts(); };

    if (ro) { resizeTargets.set(box, h); ro.observe(box); }
    h.ready = parseArt(art).then((parsed) => {
      if (!h.alive()) return h;
      h.parsed = parsed; h.measure(); h.applyLook();
      const asCanvas = opts.raster === true || h.colorway.fill || (opts.raster !== false && art.svg.length > (opts.rasterOver || RASTER_OVER));
      if (asCanvas) { h.mode = 'canvas'; el.classList.add('sp-ink-raster'); return h.raster(); }
      const safe = safeSvg(art.svg, gid);
      if (!safe) throw new Error('StartPageInk: the art is not well-formed SVG');
      box.insertBefore(safe, box.firstChild);
      h.svg = safe; h.setViewBox();
      return null;
    }).then(() => { if (h.alive()) el.classList.add('sp-ink-ready'); return h; }, (err) => {
      el.classList.add('sp-ink-error'); if (W.console) W.console.warn('[StartPageInk]', err); return h;
    });
    return h.ready;
  };

  /* ------------------------------------------------------------------ art-filled word */
  const fontsReady = () => { try { return D.fonts && D.fonts.ready ? D.fonts.ready : Promise.resolve(); } catch (e) { return Promise.resolve(); } };
  const fillWord = (el, word, art, opts) => {
    if (typeof el === 'string') el = D.querySelector(el);
    if (!el) return Promise.reject(new Error('StartPageInk.fillWord: no element'));
    // art.svg may be a promise: the word then measures and shows its outline now and fills when the art arrives.
    if (!art || !(typeof art.svg === 'string' || (art.svg && typeof art.svg.then === 'function'))) return Promise.reject(new Error('StartPageInk.fillWord: art needs { id, svg }'));
    const o = Object.assign({ fit: false, min: 28, max: 330, outline: true, frame: null, hold: false }, opts || {});
    let A = art;
    if (el._spInk || el._spWord) unmount(el);
    el.classList.add('sp-word'); el.textContent = '';
    const font = typeof o.font === 'string' ? { family: o.font } : (o.font || {});
    if (font.family) el.style.fontFamily = font.family;
    if (font.weight) el.style.fontWeight = String(font.weight);
    if (font.size) el.style.fontSize = typeof font.size === 'number' ? `${font.size}px` : font.size;
    const txt = D.createElement('span'); txt.className = 'sp-word-text'; txt.textContent = word; el.appendChild(txt);
    const cv = D.createElement('canvas'); cv.className = 'sp-word-fill'; cv.setAttribute('aria-hidden', 'true'); el.appendChild(cv);
    // hold: the word is outline-only until its draw-in plays (the prototype's sequence): a hairline of the glyphs, then the
    // paper wipes in left to right while the pen plots the piece clipped to the letters. Nothing solid shows first.
    let line = null; let lc = null;
    if (o.hold) { line = D.createElement('canvas'); line.className = 'sp-word-line'; line.setAttribute('aria-hidden', 'true'); el.appendChild(line); lc = line.getContext('2d'); }
    let shown = o.hold ? 0 : 1; // how much of the finished composite is on screen
    const final = D.createElement('canvas'); // composed, un-wiped result
    const h = {
      kind: 'word', id: ++uid, el, word, art, parsed: null, colorway: normColorway(o.colorway), inkBox: null, dpr: 1, win: null,
      run: null, _gen: 0, bmp: null, geo: null, frame: o.frame,
      alive: () => el._spWord === h,
    };
    el._spWord = h; handles.add(h); watchEnv();

    /* DOM-dependent part: fit, font metrics, canvas placement */
    const measure = () => {
      const cs = W.getComputedStyle(txt); const fam = cs.fontFamily; const wt = cs.fontWeight;
      const mc = D.createElement('canvas').getContext('2d');
      const lsPx = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
      if (o.fit && el.clientWidth) {
        const em = lsPx(cs.letterSpacing) / (parseFloat(cs.fontSize) || 16);
        mc.font = `${wt} 100px ${fam}`; try { mc.letterSpacing = `${em * 100}px`; } catch (e) { /* older engines */ }
        const w100 = mc.measureText(word).width || 1;
        el.style.fontSize = `${Math.max(o.min, Math.min(o.max, 100 * el.clientWidth / w100 * 0.985))}px`;
      }
      const cs2 = W.getComputedStyle(txt); const fs = parseFloat(cs2.fontSize) || 16; const ls = lsPx(cs2.letterSpacing);
      const fontStr = `${cs2.fontWeight} ${fs}px ${cs2.fontFamily}`;
      mc.font = fontStr; try { mc.letterSpacing = `${ls}px`; } catch (e) { /* ignore */ }
      const m = mc.measureText(word);
      const tr = txt.getBoundingClientRect(); const er = el.getBoundingClientRect();
      const asc = m.fontBoundingBoxAscent || fs * 0.92; const desc = m.fontBoundingBoxDescent || fs * 0.24;
      const lineH = tr.height || fs;
      const baseline = (tr.top - er.top) + (lineH - (asc + desc)) / 2 + asc;
      const box = Geo.wordInkBox(m, { baseline, fontSize: fs });
      const x0 = tr.left - er.left;
      const pol = policyFor(box.width, box.height);
      cv.width = Math.round(box.width * pol.scale); cv.height = Math.round(box.height * pol.scale);
      final.width = cv.width; final.height = cv.height;
      cv.style.left = `${x0 + box.left}px`; cv.style.top = `${box.top}px`; cv.style.width = `${box.width}px`; cv.style.height = `${box.height}px`;
      if (line) {
        line.width = cv.width; line.height = cv.height;
        line.style.left = cv.style.left; line.style.top = cv.style.top; line.style.width = cv.style.width; line.style.height = cv.style.height;
      }
      // never let the host clip a descender: grow its min-height to the ink box bottom
      const need = Math.ceil(box.top + box.height);
      if (need > (er.height || 0)) el.style.minHeight = `${need}px`;
      h.inkBox = box; h.dpr = pol.scale; h.geo = { fs, font: fontStr, ls };
    };
    const compose = () => {
      if (!h.bmp || !h.inkBox) return;
      const b = h.inkBox; const g = h.geo; const cw = h.colorway; const c = final.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, final.width, final.height);
      c.setTransform(h.dpr, 0, 0, h.dpr, 0, 0); c.font = g.font; try { c.letterSpacing = `${g.ls}px`; } catch (e) { /* ignore */ }
      c.textBaseline = 'alphabetic'; c.fillStyle = cw.paper; c.fillText(word, b.tx, b.ty);
      // ONE cover crop of the piece, drawn only where the glyphs are
      c.globalCompositeOperation = 'source-atop'; c.setTransform(1, 0, 0, 1, 0, 0);
      const tmp = D.createElement('canvas'); tmp.width = final.width; tmp.height = final.height;
      c.drawImage(tintInto(tmp, h.bmp, cw), 0, 0);
      c.globalCompositeOperation = 'source-over';
      if (o.outline) {
        c.setTransform(h.dpr, 0, 0, h.dpr, 0, 0); c.font = g.font; try { c.letterSpacing = `${g.ls}px`; } catch (e) { /* ignore */ }
        c.globalAlpha = 0.34; c.strokeStyle = isHex(cw.ink) ? cw.ink : '#000'; c.lineWidth = 0.9; c.lineJoin = 'round'; c.strokeText(word, b.tx, b.ty); c.globalAlpha = 1;
      }
      blit(shown);
    };
    const drawLine = () => {
      if (!lc || !h.inkBox || !h.geo) return;
      const b = h.inkBox; const g = h.geo;
      lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, line.width, line.height);
      lc.setTransform(h.dpr, 0, 0, h.dpr, 0, 0); lc.font = g.font; try { lc.letterSpacing = `${g.ls}px`; } catch (e) { /* ignore */ }
      lc.textBaseline = 'alphabetic'; lc.lineJoin = 'round'; lc.lineWidth = Math.max(0.9, Math.min(1.5, g.fs / 160));
      let tone = '';
      try { tone = W.getComputedStyle(el).getPropertyValue('--ui-text').trim(); } catch (e) { tone = ''; }
      lc.globalAlpha = 0.34; lc.strokeStyle = isHex(tone) ? tone : (isHex(h.colorway.ink) ? h.colorway.ink : '#888888'); lc.strokeText(word, b.tx, b.ty); lc.globalAlpha = 1;
    };
    const blit = (k) => {
      shown = k;
      const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
      if (k >= 1) { c.drawImage(final, 0, 0); return; }
      c.save(); c.beginPath(); c.rect(0, 0, cv.width * Math.max(0, k), cv.height); c.clip(); c.drawImage(final, 0, 0); c.restore();
    };
    const build = () => {
      const gen = ++h._gen; const b = h.inkBox;
      h.win = Geo.artWindow(h.parsed, b.width, b.height, 'cover', h.frame);
      const look = Geo.lineLook(h.parsed, b.width, b.height, isLight(h.colorway.paper), b.width / h.win[2], h.win);
      return rasterArt(A, h.parsed, { w: b.width, h: b.height, dpr: h.dpr, lw: look.lw, alpha: look.alpha, color: '#ffffff', win: h.win }).then((bmp) => {
        if (!h.alive() || gen !== h._gen) return false;
        h.bmp = bmp; compose(); drawLine(); el.classList.add('sp-word-on'); return true;
      });
    };
    const refit = () => { if (!h.parsed) return; if (h.run) endRun(h.run, true); measure(); drawLine(); build(); };
    let rT = 0; let lastW = el.clientWidth;
    h.refit = refit;
    h.rescale = refit;
    h.onResize = () => {
      if (Math.abs(el.clientWidth - lastW) < 2) return;
      lastW = el.clientWidth; clearTimeout(rT); rT = setTimeout(refit, 150);
    };
    h.destroy = () => { clearTimeout(rT); h._gen++; };
    h.setColorway = (c) => { h.colorway = normColorway(c); setVars(el, h.colorway); if (h.run) endRun(h.run, true); compose(); drawLine(); };
    h.wipePlayer = () => (h._own = true, {
      frame(k) { blit(Geo.plotEase(k) * 1.04); },
      dispose() { blit(1); if (line) line.style.display = 'none'; },
    });
    // The pen plot, clipped to the glyphs: the paper glyph is laid down, every stroke is drawn on top of it only where
    // the letter is (source-atop), and a soft left-to-right mask lets the paper wipe in just behind the pen.
    h.plotPlayer = () => {
      const cw = h.colorway;
      h._own = true;
      if (cw.fill || !h.parsed || !h.win || !h.inkBox || !h.geo) return h.wipePlayer();
      const a = h.parsed; const b = h.inkBox; const g = h.geo; const c = cv.getContext('2d');
      const win = h.win; const S = b.width / win[2]; const OX = -win[0] * S; const OY = -win[1] * S;
      const look = Geo.lineLook(a, b.width, b.height, isLight(cw.paper), S, win);
      let pi = 0; let pj = 1; let f = 0; let drawn = 0; let begun = false; let curW = -1;
      const begin = () => {
        begun = true; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
        c.setTransform(h.dpr, 0, 0, h.dpr, 0, 0); c.font = g.font; try { c.letterSpacing = `${g.ls}px`; } catch (e) { /* ignore */ }
        c.textBaseline = 'alphabetic'; c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.fillStyle = cw.paper; c.fillText(word, b.tx, b.ty);
        c.globalCompositeOperation = 'source-atop'; c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = look.alpha;
        if (cw.ink2) { const gr = c.createLinearGradient(0, 0, b.width, b.height); gr.addColorStop(0, cw.ink); gr.addColorStop(1, cw.ink2); c.strokeStyle = gr; } else c.strokeStyle = cw.ink;
      };
      const advanceTo = (L) => {
        L = Math.min(L, a.total); let started = false; let px = 0; let py = 0; c.beginPath();
        while (drawn < L && pi < a.polys.length) {
          const P = a.polys[pi]; const w = look.lw * Math.max(0.5, a.widths[pi] / 0.3);
          if (w !== curW) { if (started) { c.stroke(); c.beginPath(); started = false; } c.lineWidth = w; curW = w; }
          const x0 = P[pj * 2 - 2]; const y0 = P[pj * 2 - 1]; const x1 = P[pj * 2]; const y1 = P[pj * 2 + 1];
          const seg = Math.hypot(x1 - x0, y1 - y0); const remain = seg * (1 - f);
          const sx = x0 + (x1 - x0) * f; const sy = y0 + (y1 - y0) * f;
          if (!started || sx * S + OX !== px || sy * S + OY !== py) { c.moveTo(sx * S + OX, sy * S + OY); started = true; }
          if (drawn + remain <= L) {
            px = x1 * S + OX; py = y1 * S + OY; c.lineTo(px, py); drawn += remain; f = 0; pj++;
            if (pj * 2 >= P.length) { pi++; pj = 1; }
          } else {
            const nf = f + (L - drawn) / (seg || 1);
            px = (x0 + (x1 - x0) * nf) * S + OX; py = (y0 + (y1 - y0) * nf) * S + OY; c.lineTo(px, py); f = nf; drawn = L;
          }
        }
        if (started) c.stroke();
      };
      const mask = (p) => {
        const m = `linear-gradient(90deg,#000 0,#000 ${(p * 112 - 12).toFixed(2)}%,transparent ${(p * 112).toFixed(2)}%)`;
        cv.style.webkitMaskImage = m; cv.style.maskImage = m;
      };
      return {
        frame(k) {
          if (!begun) begin();
          const e = Geo.plotEase(k); mask(Math.min(1, e * 1.04 + 0.04));
          advanceTo(a.total * e);
        },
        dispose() {
          cv.style.webkitMaskImage = ''; cv.style.maskImage = '';
          c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
          blit(1); if (line) line.style.display = 'none';
        },
      };
    };
    // Show the finished letter now (no draw-in is coming: Still, a failed run, a style that does not play).
    h.release = () => { if (h.run) return; o.hold = false; shown = 1; if (h.bmp) { blit(1); if (line) line.style.display = 'none'; } };
    h.measure = () => {};
    setVars(el, h.colorway);
    if (ro) { resizeTargets.set(el, h); ro.observe(el); }
    const artReady = Promise.resolve(art.svg).then((svg) => { A = { id: art.id, svg: String(svg || '') }; return parseArt(A); });
    h.ready = Promise.all([fontsReady().then(() => { if (h.alive() && line) { measure(); drawLine(); } }), artReady]).then(([, parsed]) => {
      if (!h.alive()) return h;
      h.parsed = parsed; measure(); drawLine(); return build().then(() => h);
    }).then((r) => r, (err) => { el.classList.add('sp-ink-error'); if (W.console) W.console.warn('[StartPageInk]', err); return h; });
    return h.ready;
  };

  const unmount = (el) => {
    if (typeof el === 'string') el = D.querySelector(el);
    if (!el) return;
    const h = el._spInk || el._spWord;
    if (!h) return;
    if (h.run) endRun(h.run, true);
    if (h.destroy) h.destroy();
    if (ro) ro.unobserve(h.kind === 'word' ? el : h.box);
    if (h.kind === 'word') {
      el._spWord = null; el.textContent = h.word; el.style.minHeight = '';
      el.classList.remove('sp-word', 'sp-word-on', 'sp-ink-error');
      // the text node is restored (plain text, no overlay canvases)
      Array.from(el.querySelectorAll('canvas')).forEach((n) => n.remove());
    } else {
      h.box.remove(); el._spInk = null;
      ['--sp-pad', '--sp-stroke', '--sp-lw', '--sp-alpha'].forEach((p) => el.style.removeProperty(p));
      el.classList.remove('sp-ink', 'sp-ink-ready', 'sp-ink-raster', 'sp-ink-drawing', 'sp-ink-error');
    }
    ['--sp-paper', '--sp-ink', '--sp-ink2'].forEach((p) => el.style.removeProperty(p));
    el.removeAttribute('data-sp-duo'); el.removeAttribute('data-sp-key');
    handles.delete(h);
    unwatchEnv();
  };

  Vectura.StartPageInk = {
    mount, unmount, drawIn, finish, fillWord, setMotion, registerDrawStyle, DRAW_STYLES,
    isStill, RASTER_OVER, safeSvg,
  };
})();
