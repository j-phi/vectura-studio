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
    if (!cw.key) cw.key = `custom|${cw.paper}|${cw.ink}|${cw.ink2 || ''}`;
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
  const tintInto = (dst, src, cw) => {
    const c = dst.getContext('2d'); const w = dst.width; const h = dst.height;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, w, h);
    c.drawImage(src, 0, 0, w, h);
    c.globalCompositeOperation = 'source-in';
    if (cw.ink2) { const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, cw.ink); g.addColorStop(1, cw.ink2); c.fillStyle = g; } else c.fillStyle = cw.ink;
    c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over';
    return dst;
  };

  /* ------------------------------------------------------------------ inline SVG preparation */
  let uid = 0;
  const sanitize = (s) => s
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[\s\S]*?\]>|<!DOCTYPE[^>]*>/gi, '')
    .replace(/<(script|foreignObject|style|image|use|iframe|object|embed)\b[\s\S]*?(<\/\1\s*>|\/>)/gi, '')
    .replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:xlink:)?href\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');
  /* strokes keep their relative widths as --sp-w multipliers over the adaptive line weight */
  const prepSvg = (txt, gid) => {
    let s = sanitize(String(txt || '')).trim();
    s = s.replace(/<(g|path|circle|polyline|polygon|line)\b([^>]*)>/g, (m0, tag, attrs) => {
      let widthStyle = '';
      attrs = attrs.replace(/\sstroke-width="([\d.]+)"/, (m1, w) => { const f = +w / 0.3; if (Math.abs(f - 1) >= 0.01) widthStyle = `--sp-w:${f.toFixed(3)}`; return ''; });
      if (widthStyle) {
        if (/\sstyle="/.test(attrs)) attrs = attrs.replace(/\sstyle="/, ` style="${widthStyle};`); else attrs += ` style="${widthStyle}"`;
      }
      return `<${tag}${attrs}>`;
    });
    const vbm = s.match(/viewBox="([^"]+)"/);
    const [vx, vy, vw, vh] = vbm ? vbm[1].trim().split(/[\s,]+/).map(Number) : [0, 0, 100, 100];
    return s.replace(/<svg\b([^>]*)>/, (m0, attrs) => `<svg${attrs.replace(/\s(width|height|color)="[^"]*"/g, '')} class="sp-ink-svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">`
      + `<defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${vx}" y1="${vy}" x2="${vx + vw}" y2="${vy + vh}"><stop offset="0" style="stop-color:var(--sp-ink)"/><stop offset="1" style="stop-color:var(--sp-ink2,var(--sp-ink))"/></linearGradient></defs>`);
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
    if (h.kind === 'word') return h.wipePlayer();
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
      run.player = make(h, o);
      h.run = run; h.el.classList.add('sp-ink-drawing'); active.add(run); wake();
    }));
  };
  const setMotion = (o) => {
    if (o && typeof o.still === 'boolean') state.still = o.still;
    try { if (state.still) D.documentElement.setAttribute('data-sp-motion', 'still'); else D.documentElement.removeAttribute('data-sp-motion'); } catch (e) { /* ignore */ }
    if (isStill()) finish();
  };

  /* ------------------------------------------------------------------ tiles */
  const mount = (el, art, opts) => {
    if (typeof el === 'string') el = D.querySelector(el);
    if (!el) return Promise.reject(new Error('StartPageInk.mount: no element'));
    opts = opts || {};
    if (!art || typeof art.svg !== 'string') return Promise.reject(new Error('StartPageInk.mount: art needs { id, svg }'));
    if (el._spInk || el._spWord) unmount(el);
    const id = ++uid; const gid = `sp-g${id}`;
    const fit = opts.fit === 'cover' ? 'cover' : 'contain';
    const pad = opts.pad == null ? (fit === 'cover' ? 0 : 0.08) : opts.pad;
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
      tintInto(h.canvas, h.bmp, h.colorway);
    };
    h.raster = () => {
      if (!h.parsed || !h.w || !h.h) return Promise.resolve();
      const gen = ++h._gen; const pol = policyFor(h.w, h.h); const w0 = h.w; const h0 = h.h; const win = h.win;
      return rasterArt(art, h.parsed, { w: w0, h: h0, dpr: pol.scale, lw: h.look.lw, alpha: h.look.alpha, color: '#ffffff', win }).then((b) => {
        if (!h.alive() || gen !== h._gen) return;
        if (!h.canvas) { h.canvas = D.createElement('canvas'); h.canvas.className = 'sp-ink-canvas'; h.canvas.setAttribute('aria-hidden', 'true'); box.appendChild(h.canvas); }
        h.canvas.width = pol.width; h.canvas.height = pol.height; h.rasterScale = pol.scale; h.bmp = b; h.paint();
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
    h.setColorway = (c) => {
      h.colorway = normColorway(c); setVars(el, h.colorway); h.applyLook(); h.paint();
    };
    h.setFrame = (frame, nextFit) => {
      h.frame = frame || null; if (nextFit) h.fit = nextFit === 'cover' ? 'cover' : 'contain';
      h.measure(); h.applyLook(); h.setViewBox();
      if (h.mode === 'canvas') { clearTimeout(rT); rT = setTimeout(h.raster, 60); }
    };

    if (ro) { resizeTargets.set(box, h); ro.observe(box); }
    h.ready = parseArt(art).then((parsed) => {
      if (!h.alive()) return h;
      h.parsed = parsed; h.measure(); h.applyLook();
      const asCanvas = opts.raster === true || (opts.raster !== false && art.svg.length > (opts.rasterOver || RASTER_OVER));
      if (asCanvas) { h.mode = 'canvas'; el.classList.add('sp-ink-raster'); return h.raster(); }
      box.insertAdjacentHTML('afterbegin', prepSvg(art.svg, gid));
      h.svg = box.querySelector('svg'); h.setViewBox();
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
    if (!art || typeof art.svg !== 'string') return Promise.reject(new Error('StartPageInk.fillWord: art needs { id, svg }'));
    const o = Object.assign({ fit: false, min: 28, max: 330, outline: true, frame: null }, opts || {});
    if (el._spInk || el._spWord) unmount(el);
    el.classList.add('sp-word'); el.textContent = '';
    const font = typeof o.font === 'string' ? { family: o.font } : (o.font || {});
    if (font.family) el.style.fontFamily = font.family;
    if (font.weight) el.style.fontWeight = String(font.weight);
    if (font.size) el.style.fontSize = typeof font.size === 'number' ? `${font.size}px` : font.size;
    const txt = D.createElement('span'); txt.className = 'sp-word-text'; txt.textContent = word; el.appendChild(txt);
    const cv = D.createElement('canvas'); cv.className = 'sp-word-fill'; cv.setAttribute('aria-hidden', 'true'); el.appendChild(cv);
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
      blit(1);
    };
    const blit = (k) => {
      const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
      if (k >= 1) { c.drawImage(final, 0, 0); return; }
      c.save(); c.beginPath(); c.rect(0, 0, cv.width * Math.max(0, k), cv.height); c.clip(); c.drawImage(final, 0, 0); c.restore();
    };
    const build = () => {
      const gen = ++h._gen; const b = h.inkBox;
      h.win = Geo.artWindow(h.parsed, b.width, b.height, 'cover', h.frame);
      const look = Geo.lineLook(h.parsed, b.width, b.height, isLight(h.colorway.paper), b.width / h.win[2], h.win);
      return rasterArt(art, h.parsed, { w: b.width, h: b.height, dpr: h.dpr, lw: look.lw, alpha: look.alpha, color: '#ffffff', win: h.win }).then((bmp) => {
        if (!h.alive() || gen !== h._gen) return false;
        h.bmp = bmp; compose(); el.classList.add('sp-word-on'); return true;
      });
    };
    const refit = () => { if (!h.parsed) return; measure(); build(); };
    let rT = 0; let lastW = el.clientWidth;
    h.refit = refit;
    h.rescale = refit;
    h.onResize = () => {
      if (Math.abs(el.clientWidth - lastW) < 2) return;
      lastW = el.clientWidth; clearTimeout(rT); rT = setTimeout(refit, 150);
    };
    h.destroy = () => { clearTimeout(rT); h._gen++; };
    h.setColorway = (c) => { h.colorway = normColorway(c); setVars(el, h.colorway); compose(); };
    h.wipePlayer = () => ({
      frame(k) { blit(Geo.plotEase(k) * 1.04); },
      dispose() { blit(1); },
    });
    h.measure = () => {};
    setVars(el, h.colorway);
    if (ro) { resizeTargets.set(el, h); ro.observe(el); }
    h.ready = Promise.all([fontsReady(), parseArt(art)]).then(([, parsed]) => {
      if (!h.alive()) return h;
      h.parsed = parsed; measure(); return build().then(() => h);
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
    isStill, RASTER_OVER,
  };
})();
