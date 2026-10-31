/**
 * Start Page DOM helpers — window.Vectura.StartPageDom. `h(tag, attrs, ...kids)` builds an element without
 * ever parsing user text as HTML (text goes through textContent / text nodes).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v; // trusted, developer-authored markup only (icons)
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => { el.dataset[dk] = dv; });
      else el.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((kid) => { if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid)); });
    return el;
  };
  const pad2 = (n) => String(n).padStart(2, '0');

  /* onOpenClick(el, handler): the ONE way art opens on a pointer click. A drag (orbiting a live 3D model, or any
   * wobbly press) or a long press ends in a `click` the browser still fires; this swallows it. Only a genuine quick
   * single click reaches `handler`: pointer down and up within CLICK.maxMovePx (CLICK.maxMoveTouchPx for touch/pen)
   * and CLICK.maxPressMs. A click with no preceding pointer gesture (keyboard Enter/Space on a button, assistive
   * tech) is always honoured. Thresholds live in START_PAGE.CLICK (src/config/start-page.js); the fallback below only
   * covers harnesses that load this file without the config. Returns a detach function. */
  const CLICK_FALLBACK = { maxMovePx: 5, maxMoveTouchPx: 10, maxPressMs: 350, clickGapMs: 700 };
  const clickCfg = () => Object.assign({}, CLICK_FALLBACK, (Vectura.START_PAGE && Vectura.START_PAGE.CLICK) || {});
  const nowMs = () => ((G.performance && G.performance.now) ? G.performance.now() : Date.now());
  const onOpenClick = (el, handler) => {
    let g = null; // the pointer gesture in flight
    let verdict = null; // how the last finished gesture ended: { ok, at }
    const down = (e) => {
      if (e.button > 0) return;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: nowMs(), moved: false, coarse: e.pointerType === 'touch' || e.pointerType === 'pen' };
      verdict = null;
    };
    const move = (e) => {
      if (!g || g.moved || e.pointerId !== g.id) return;
      const c = clickCfg();
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > (g.coarse ? c.maxMoveTouchPx : c.maxMovePx)) g.moved = true;
    };
    const up = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const t = nowMs();
      move(e);
      verdict = { ok: !g.moved && t - g.t <= clickCfg().maxPressMs, at: t };
      g = null;
    };
    const cancel = () => { if (g) { verdict = { ok: false, at: nowMs() }; g = null; } };
    const key = () => { verdict = null; };
    const click = (e) => {
      const v = verdict; verdict = null;
      if (v && !v.ok && nowMs() - v.at <= clickCfg().clickGapMs) return; // the click that follows a drag or long press
      handler(e);
    };
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move, true);
    el.addEventListener('pointerup', up, true);
    el.addEventListener('pointercancel', cancel, true);
    el.addEventListener('keydown', key, true);
    el.addEventListener('click', click);
    return () => {
      el.removeEventListener('pointerdown', down, true); el.removeEventListener('pointermove', move, true);
      el.removeEventListener('pointerup', up, true); el.removeEventListener('pointercancel', cancel, true);
      el.removeEventListener('keydown', key, true); el.removeEventListener('click', click);
    };
  };
  Vectura.StartPageDom = { h, pad2, onOpenClick };
})();
