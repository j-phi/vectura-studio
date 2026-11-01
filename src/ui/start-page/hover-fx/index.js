/**
 * Start Page hover effects loader (Vectura.StartPageHoverFx).
 *
 *   StartPageHoverFx.attach(artEl, effectId, { handle, crop, pointer }) -> controller
 *
 * Lazy-loads only the requested effect's file (a dynamic <script> whose URL is resolved relative to this
 * file), plus core.js for the WebGL effects. Attaches to the hovered art element only and destroys itself
 * 2.6 s after the pointer leaves. Still / reduced motion: the WebGL effects show their still frame and
 * Lift & tilt, Glare sweep and Re-plot are off.
 *
 * Effects: lift, glare, replot (DOM, no WebGL) and holo, ripple, stipple, breeze, gravity, current (WebGL).
 */
(() => {
  'use strict';
  const W = window;
  const D = document;
  const Vectura = (W.Vectura = W.Vectura || {});
  if (Vectura.StartPageHoverFx) return;

  const LEAVE_MS = 2600;
  const SELF = (D.currentScript && D.currentScript.src) || '';
  let base = SELF ? SELF.replace(/[^/]*$/, '') : '';
  // The release query (?v=) of this file rides on every lazy file, so a release never pairs a new index.js with stale effects.
  const QUERY = (/\?[^#]*/.exec(SELF) || [''])[0];

  const EFFECTS = {
    lift: { name: 'Lift & tilt', file: 'lift.js', kind: 'simple' },
    glare: { name: 'Glare sweep', file: 'glare.js', kind: 'simple' },
    replot: { name: 'Re-plot', file: 'replot.js', kind: 'simple' },
    holo: { name: 'Hologram Foil', file: 'holo.js', kind: 'gl' },
    ripple: { name: 'Pressure Ripple', file: 'ripple.js', kind: 'gl' },
    stipple: { name: 'Stipple Weather', file: 'stipple.js', kind: 'gl' },
    breeze: { name: 'Paper Breeze', file: 'breeze.js', kind: 'gl' },
    gravity: { name: 'Gravity Well', file: 'gravity.js', kind: 'gl' },
    current: { name: 'Light Current', file: 'current.js', kind: 'gl' },
  };
  const CORE_FILE = 'core.js';

  /* ------------------------------------------------------------------ motion */
  const state = { still: false };
  const mq = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const isStill = () => {
    try { const Ink = Vectura.StartPageInk; if (Ink && typeof Ink.isStill === 'function') return !!Ink.isStill(); } catch (e) { /* fall through */ }
    return state.still || !!(mq && mq.matches);
  };
  W.addEventListener('vectura:start-page-motion', (e) => { if (e && e.detail && typeof e.detail.still === 'boolean') state.still = e.detail.still; });

  /* ------------------------------------------------------------------ script loading */
  const loaded = new Map(); // url -> Promise
  const loadedFiles = [];
  const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;
  // Resolve a lazy file against the loader base (or this script, or the page) and accept it only when it
  // cannot leave the page's origin: same origin, file: -> file:, or loopback -> loopback. Never upgrades or
  // crosses origins. Same-origin http(s) files are returned root-relative so no scheme or host is ever set.
  const urlFor = (file) => {
    try {
      const page = new URL(D.baseURI);
      const u = new URL(file + QUERY, new URL(base || SELF || D.baseURI, D.baseURI));
      if (u.protocol === 'file:') return page.protocol === 'file:' ? u.href : null;
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (u.origin === page.origin) return u.pathname + u.search;
      if (LOOPBACK.test(page.hostname) && LOOPBACK.test(u.hostname) && u.protocol === page.protocol) return u.href;
      return null;
    } catch (e) { return null; }
  };
  const loadScript = (file) => {
    const url = urlFor(file);
    if (!url) return Promise.reject(new Error(`StartPageHoverFx: refusing to load ${file} from outside the page origin`));
    if (loaded.has(url)) return loaded.get(url);
    const p = new Promise((resolve, reject) => {
      const s = D.createElement('script');
      s.src = url; s.async = true;
      s.onload = () => { loadedFiles.push(file); resolve(); };
      s.onerror = () => { loaded.delete(url); reject(new Error(`StartPageHoverFx: could not load ${url}`)); };
      (D.head || D.documentElement).appendChild(s);
    });
    loaded.set(url, p);
    return p;
  };

  /* ------------------------------------------------------------------ simple (DOM) effects register here */
  const simple = {};
  const registerSimple = (id, make) => { if (typeof make === 'function') simple[id] = make; };

  /* ------------------------------------------------------------------ controllers */
  const entries = new WeakMap(); // el -> { ctl, id, timer }
  const inert = (el, id) => ({ el, effect: id, destroyed: true, ready: Promise.resolve(null), destroy() {}, inner: null });

  const attach = (el, id, opts) => {
    opts = opts || {};
    if (typeof el === 'string') el = D.querySelector(el);
    const def = EFFECTS[id];
    if (!el || !def) return inert(el, id);
    const prev = entries.get(el);
    if (prev) {
      clearTimeout(prev.timer);
      if (prev.id === id && !prev.ctl.destroyed) return prev.ctl;
      prev.ctl.destroy();
    }
    const handle = opts.handle || el._spInk || null;
    if (!handle) return inert(el, id);
    if (def.kind === 'simple' && isStill()) return inert(el, id); // Lift / Glare / Re-plot are off when Still

    const entry = { id, timer: 0, ctl: null };
    const ctl = {
      el, effect: id, destroyed: false, inner: null, loadedFiles: [],
      ready: null,
      destroy() {
        if (ctl.destroyed) return;
        ctl.destroyed = true; clearTimeout(entry.timer);
        el.removeEventListener('pointerleave', onLeave); el.removeEventListener('pointerenter', onEnter);
        try { if (ctl.inner && ctl.inner.destroy) ctl.inner.destroy(); } catch (e) { /* ignore */ }
        if (entries.get(el) === entry) entries.delete(el);
      },
    };
    const onLeave = () => { clearTimeout(entry.timer); entry.timer = setTimeout(() => ctl.destroy(), LEAVE_MS); };
    const onEnter = () => { clearTimeout(entry.timer); };
    el.addEventListener('pointerleave', onLeave); el.addEventListener('pointerenter', onEnter);
    entry.ctl = ctl; entries.set(el, entry);

    const files = def.kind === 'gl' && !Vectura.StartPageHoverFxCore ? [CORE_FILE, def.file] : [def.file];
    const needsFile = def.kind === 'gl' ? !(Vectura.StartPageHoverFxCore && Vectura.StartPageHoverFxCore.byId(id)) : !simple[id];
    const chain = needsFile ? files.reduce((p, f) => p.then(() => loadScript(f)), Promise.resolve()) : Promise.resolve();
    ctl.ready = chain.then(() => {
      if (ctl.destroyed) return ctl;
      ctl.loadedFiles = files.slice();
      const o = Object.assign({}, opts, { handle });
      if (def.kind === 'gl') ctl.inner = Vectura.StartPageHoverFxCore.attach(el, id, o);
      else if (simple[id]) ctl.inner = simple[id](el, o);
      if (ctl.inner && ctl.inner.enter && opts.hovering !== false) ctl.inner.enter();
      if (ctl.inner && ctl.inner.ready) return ctl.inner.ready.then(() => ctl);
      return ctl;
    }).catch((err) => { if (W.console) W.console.warn('[StartPageHoverFx]', err); return ctl; });
    return ctl;
  };

  const detach = (el) => { const e = entries.get(el); if (e) e.ctl.destroy(); };
  const get = (el) => { const e = entries.get(el); return e ? e.ctl : null; };

  Vectura.StartPageHoverFx = {
    EFFECTS, LEAVE_MS, attach, detach, get, registerSimple, isStill,
    ids: () => Object.keys(EFFECTS),
    setBase: (b) => { base = String(b || ''); if (base && !/\/$/.test(base)) base += '/'; },
    getBase: () => base,
    urlFor,
    loadedFiles: () => loadedFiles.slice(),
    setMotion: (o) => { if (o && typeof o.still === 'boolean') state.still = o.still; },
  };
})();
