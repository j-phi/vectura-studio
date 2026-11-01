/**
 * Start Page motion wiring — window.Vectura.StartPageMotion.
 *
 * The glue between the page preferences (startPage.animateIn, startPage.hover, Still) and the P3 modules
 * (StartPageDrawStyles, StartPageHoverFx, StartPageLiftCard, StartPageOrbit3D). One source of truth for "is
 * motion allowed": StartPageInk.isStill() (the Still toggle OR prefers-reduced-motion), announced on the
 * `vectura:start-page-motion` window event.
 *
 *   isStill()                       -> boolean
 *   styleId(pref, fallback?)        -> a registered draw-style id; accepts the preference enum ('fade-up', 'ink-bleed',
 *                                      'stroke-cascade', 'scan-lines') and the style ids the editor stores ('fade', ...)
 *   hoverId(pref)                   -> a hover-fx id ('holo' also answers to the editor's 'hologram'), or null
 *   plan(pref, kind)                -> { type: 'none' | 'retrigger' | 'lift-card' | 'fx', id? }
 *                                      kind 'plate': default/retrigger re-trigger the animate-in; 'card': default/lift lift the card.
 *   artType(art)                    -> the Vectura algorithm type of a piece ('topoform', 'terrain', ...), '' when unknown
 *   modelFor(art)                   -> a live 3D model id for the piece, or null
 *   bindArt(artEl, { handle(), animateIn(), hover(), kind }) -> { sync(), destroy() }
 *       Hover on ONE art element. 'retrigger' installs the draw-in re-trigger controller; an effect id lazy-loads that
 *       effect (StartPageHoverFx.attach) on first pointer entry, on this element only. Still / reduced motion: nothing.
 *   replay(handle, pref?)           -> Promise  plays the animate-in again (instant under Still)
 *   changed()                       -> tell every bound element the page preferences changed (re-evaluates its plan)
 */
(() => {
  const W = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = W.Vectura = W.Vectura || {};

  const STYLE_ALIAS = { 'fade-up': 'fade', 'ink-bleed': 'bleed', 'stroke-cascade': 'cascade', 'scan-lines': 'scan' };
  const STYLES = ['plot', 'sweep', 'fade', 'bleed', 'cascade', 'scan', 'iris', 'none'];
  const HOVER_ALIAS = { hologram: 'holo' };
  const FX = ['lift', 'glare', 'replot', 'holo', 'ripple', 'stipple', 'breeze', 'gravity', 'current'];
  const ALGO_ALIAS = { torus: 'topoform', 'torus contours': 'topoform', 'coiled sphere': 'spiralizer' };

  const Ink = () => Vectura.StartPageInk;
  const isStill = () => { try { const I = Ink(); return !!(I && I.isStill && I.isStill()); } catch (_) { return false; } };

  const styleId = (pref, fallback = 'plot') => {
    const raw = String(pref == null ? '' : pref);
    const id = STYLE_ALIAS[raw] || raw;
    return STYLES.includes(id) ? id : fallback;
  };
  const hoverId = (pref) => {
    const raw = String(pref == null ? '' : pref);
    const id = HOVER_ALIAS[raw] || raw;
    return FX.includes(id) ? id : null;
  };
  const plan = (pref, kind) => {
    const raw = String(pref == null || pref === '' ? 'default' : pref);
    if (raw === 'none') return { type: 'none' };
    if (raw === 'default') return kind === 'card' ? { type: 'lift-card' } : { type: 'retrigger' };
    if (raw === 'retrigger') return { type: 'retrigger' };
    const id = hoverId(raw);
    if (!id) return { type: 'none' };
    if (id === 'lift' && kind === 'card') return { type: 'lift-card' };
    return { type: 'fx', id };
  };

  const artType = (art) => {
    if (!art) return '';
    const raw = String(art.type || art.algorithm || '').trim();
    const lower = raw.toLowerCase();
    return ALGO_ALIAS[lower] || lower.replace(/[^a-z0-9]/g, '');
  };
  const modelFor = (art) => {
    try {
      const O = Vectura.StartPageOrbit3D;
      if (!O || typeof O.modelFor !== 'function') return null;
      return O.modelFor(artType(art), art && art.presetId) || null;
    } catch (_) { return null; }
  };

  /* ------------------------------------------------------------------ change fan-out */
  const bound = new Set();
  const changed = () => { bound.forEach((b) => { try { b.sync(); } catch (_) { /* ignore */ } }); };

  const bindArt = (artEl, opts = {}) => {
    const val = (f, d) => { try { return typeof f === 'function' ? f() : (f == null ? d : f); } catch (_) { return d; } };
    const kind = opts.kind === 'card' ? 'card' : 'plate';
    let ctl = null;
    let ctlKey = '';
    let dead = false;

    const dropCtl = () => { if (ctl) { try { ctl.destroy(); } catch (_) { /* ignore */ } ctl = null; ctlKey = ''; } };
    const handleNow = () => val(opts.handle, null) || artEl._spInk || null;
    // A tile's handle exists as soon as mount() is called but has no strokes until its parse resolves (`parsed === null`).
    // A hover effect cannot attach to that, so a pointer that arrives early waits: the effect attaches on the handle's ready
    // signal or the pointer's next move, whichever comes first, while the pointer is still over the art.
    const notReady = (h) => !!h && h.parsed === null;
    let inside = false;
    let retry = null;
    const stopRetry = () => { if (retry) { artEl.removeEventListener('pointermove', retry); retry = null; } };
    const tryAttach = () => {
      const p = plan(val(opts.hover, 'default'), kind);
      if (p.type !== 'fx' || isStill()) return true;
      const FxLoader = Vectura.StartPageHoverFx;
      const handle = handleNow();
      if (!FxLoader) return true;
      if (!handle || notReady(handle)) return false;
      try { FxLoader.attach(artEl, p.id, { handle }); } catch (_) { /* ignore */ }
      return true;
    };
    const waitReady = () => {
      if (retry) return;
      retry = () => { if (dead || !inside) { stopRetry(); return; } if (tryAttach()) stopRetry(); };
      artEl.addEventListener('pointermove', retry);
      const h = handleNow();
      if (h && h.ready && typeof h.ready.then === 'function') h.ready.then(() => { if (retry) retry(); }, () => {});
    };
    const onEnter = (e) => {
      if (dead || (e && e.pointerType === 'touch')) return;
      inside = true;
      if (!tryAttach()) waitReady();
    };
    const onLeave = () => { inside = false; stopRetry(); };
    const sync = () => {
      if (dead) return;
      const p = plan(val(opts.hover, 'default'), kind);
      const handle = handleNow();
      if (p.type === 'retrigger' && handle && Vectura.StartPageDrawStyles) {
        const style = styleId(val(opts.animateIn, 'plot'));
        const key = `${style}|${handle.id || ''}`;
        if (ctl && ctlKey === key && ctl.__handle === handle) return;
        dropCtl();
        ctl = Vectura.StartPageDrawStyles.retrigger(handle, style);
        ctl.__handle = handle; ctlKey = key;
        return;
      }
      dropCtl();
    };
    artEl.addEventListener('pointerenter', onEnter);
    artEl.addEventListener('pointerleave', onLeave);
    const api = {
      sync,
      destroy() {
        dead = true; dropCtl(); bound.delete(api); stopRetry();
        artEl.removeEventListener('pointerenter', onEnter);
        artEl.removeEventListener('pointerleave', onLeave);
        try { Vectura.StartPageHoverFx && Vectura.StartPageHoverFx.detach && Vectura.StartPageHoverFx.detach(artEl); } catch (_) { /* ignore */ }
      },
    };
    bound.add(api);
    sync();
    return api;
  };

  const replay = (handle, pref) => {
    const I = Ink();
    if (!I || !handle) return Promise.resolve(null);
    const style = styleId(pref);
    const D = Vectura.StartPageDrawStyles;
    if (isStill()) { I.finish(handle); return Promise.resolve(handle); }
    return D && typeof D.play === 'function' ? D.play(handle, style) : I.drawIn(handle, { style });
  };

  Vectura.StartPageMotion = { STYLES, FX, isStill, styleId, hoverId, plan, artType, modelFor, bindArt, replay, changed };
})();
