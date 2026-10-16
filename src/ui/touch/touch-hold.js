/*
 * Vectura Studio — TouchHold (TUX-034a).
 *
 * One long-press recogniser for touch and pen. It replaces the per-card hold timers.
 * Delegated Pointer Events on a root element, so a renderLayers() rebuild cannot leave
 * a stale closure. Mouse pointers are ignored: a mouse keeps right-click and HTML5 drag.
 *
 * API (window.Vectura.UI.TouchHold):
 *   bind(rootEl, { selector, resolve(target) -> {key, anchorEl} | null,
 *                  onFire({x, y, key, target}), pointerTypes: ['touch','pen'],
 *                  capture: false }) -> unbind()
 *   capture:true listens in the capture phase (TUX-039: an icon-button owner on <body> must
 *   start before a card owner that sits deeper in the tree).
 *   isSuppressingContextMenu() -> boolean
 *
 * Events on document (detail.t = ms since pointerdown, from performance.now()):
 *   touchhold:progress  the ring appeared
 *   touchhold:fire      the hold completed
 *   touchhold:cancel    the hold was abandoned (detail.reason)
 *
 * After a fire the lift must not run anything. TouchHold blocks touchmove (no scroll),
 * prevents touchend (no compat click) and swallows one compat mousedown/click as a backstop.
 *
 * All numbers come from Vectura.TOUCH_HOLD (src/config/context-menu.js).
 */
(() => {
  'use strict';
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = (G.Vectura = G.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const cfg = () => Vectura.TOUCH_HOLD || null;
  const now = () => (G.performance && typeof G.performance.now === 'function' ? G.performance.now() : Date.now());

  // Module-wide state: only one hold can be active (single primary finger).
  let active = null;          // the hold in progress (pointer is down)
  let lastFireAt = -Infinity; // now() of the last fire
  let swallow = null;         // { off() } while the compat-event swallower is armed

  const doc = () => G.document;
  const emit = (type, detail) => {
    const d = doc();
    if (!d) return;
    try { d.dispatchEvent(new G.CustomEvent(type, { detail })); } catch (_e) { /* noop */ }
  };

  const isSuppressingContextMenu = () => {
    const c = cfg();
    if (!c) return false;
    return !!active || (now() - lastFireAt) < c.contextMenuSuppressMs;
  };

  const disarmSwallow = () => { if (swallow) { swallow.off(); swallow = null; } };

  // Swallow the next compat mousedown and click once (capture phase) for ghostClickMs.
  // A new pointerdown means a real new gesture: stop swallowing.
  const armSwallow = () => {
    const c = cfg();
    const d = doc();
    disarmSwallow();
    const seen = new Set();
    const eat = (e) => {
      if (seen.has(e.type)) return;
      seen.add(e.type);
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const TYPES = ['mousedown', 'mouseup', 'click'];
    const onDown = () => disarmSwallow();
    TYPES.forEach((t) => d.addEventListener(t, eat, true));
    d.addEventListener('pointerdown', onDown, true);
    const timer = setTimeout(disarmSwallow, c.ghostClickMs);
    swallow = {
      off() {
        clearTimeout(timer);
        TYPES.forEach((t) => d.removeEventListener(t, eat, true));
        d.removeEventListener('pointerdown', onDown, true);
      },
    };
  };

  // Block native scroll/compat click for the rest of a fired touch.
  const installBlockers = () => {
    const d = doc();
    const c = cfg();
    const onMove = (e) => { if (e.cancelable) e.preventDefault(); };
    const onEnd = (e) => { if (e.type === 'touchend' && e.cancelable) e.preventDefault(); off(); };
    let timer = null;
    function off() {
      d.removeEventListener('touchmove', onMove, true);
      d.removeEventListener('touchend', onEnd, true);
      d.removeEventListener('touchcancel', onEnd, true);
      if (timer) clearTimeout(timer);
    }
    d.addEventListener('touchmove', onMove, { capture: true, passive: false });
    d.addEventListener('touchend', onEnd, { capture: true, passive: false });
    d.addEventListener('touchcancel', onEnd, { capture: true, passive: false });
    return { off, expire: () => { timer = setTimeout(off, c.ghostClickMs); } };
  };

  const makeRing = (x, y, fillMs) => {
    const d = doc();
    const ring = d.createElement('div');
    ring.className = 'touch-hold-ring';
    ring.setAttribute('data-touch-hold-progress', '');
    ring.setAttribute('aria-hidden', 'true');
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.setProperty('--th-fill-ms', `${fillMs}ms`);
    const fill = d.createElement('i');
    fill.className = 'touch-hold-ring-fill';
    ring.appendChild(fill);
    d.body.appendChild(ring);
    return ring;
  };

  const bind = (rootEl, opts = {}) => {
    const c = cfg();
    if (!rootEl || !c || typeof opts.onFire !== 'function') return () => {};
    const selector = opts.selector || '[data-layer-id]';
    const resolve = opts.resolve || ((t) => ({ key: t.getAttribute('data-layer-id'), anchorEl: t }));
    const types = opts.pointerTypes || ['touch', 'pen'];
    const d = doc();

    const endActive = (reason, h) => {
      if (!h || active !== h) return;
      clearTimeout(h.ringTimer);
      clearTimeout(h.fireTimer);
      if (h.ring) { h.ring.remove(); h.ring = null; }
      d.removeEventListener('pointermove', h.onMove, true);
      d.removeEventListener('pointerup', h.onUp, true);
      d.removeEventListener('pointercancel', h.onUp, true);
      if (h.restoreDrag) h.restoreDrag();
      if (!h.fired) emit('touchhold:cancel', { t: now() - h.t0, reason, key: h.key });
      active = null;
    };

    const fire = (h) => {
      if (active !== h) return;
      let target = h.target;
      if (!target.isConnected) {
        // renderLayers() rebuilt the card while held: find it again by id.
        const id = String(h.key).replace(/(["\\])/g, '\\$1');
        target = rootEl.querySelector(`${selector}[data-layer-id="${id}"]`) || target;
      }
      clearTimeout(h.ringTimer);
      // A canvas hold has no card to pop: the progress ring itself pops, then goes (popRing).
      let popEl = target;
      if (h.popRing) {
        if (!h.ring) h.ring = makeRing(h.x, h.y, 0);
        popEl = h.ring;
        const ring = h.ring;
        setTimeout(() => ring.remove(), c.popMs);
      } else if (h.ring) { h.ring.remove(); }
      h.ring = null;
      h.fired = true;
      lastFireAt = now();
      h.blockers = installBlockers();
      popEl.classList.add('touch-hold-pop');
      popEl.style.setProperty('--th-pop-ms', `${c.popMs}ms`);
      popEl.style.setProperty('--th-pop-scale', String(c.popScale));
      setTimeout(() => popEl.classList.remove('touch-hold-pop'), c.popMs);
      try { if (G.navigator && typeof G.navigator.vibrate === 'function') G.navigator.vibrate(c.vibrateMs); } catch (_e) { /* noop */ }
      emit('touchhold:fire', { t: now() - h.t0, key: h.key });
      opts.onFire({ x: h.x, y: h.y, key: h.key, target });
    };

    const onDown = (e) => {
      if (!types.includes(e.pointerType)) return;
      if (active) {
        // A second pointer (pinch, palm) abandons the hold.
        if (e.pointerId !== active.pointerId) endActive('second-pointer', active);
        return;
      }
      disarmSwallow();
      const el = e.target && e.target.closest ? e.target.closest(selector) : null;
      if (!el || !rootEl.contains(el)) return;
      const hit = resolve(el, e);
      if (!hit) return;
      const h = {
        pointerId: e.pointerId, x: e.clientX, y: e.clientY, t0: now(), target: el, key: hit.key,
        fired: false, ring: null, ringTimer: 0, fireTimer: 0, blockers: null, restoreDrag: null,
        slopPx: hit.slopPx || 0, popRing: !!hit.popRing,
      };
      // A draggable card would start a native HTML drag (lift + ghost image) on a touch hold.
      if (el.draggable === true) {
        el.draggable = false;
        h.restoreDrag = () => { el.draggable = true; };
      }
      h.onMove = (ev) => {
        if (ev.pointerId !== h.pointerId || h.fired) return;
        if (Math.hypot(ev.clientX - h.x, ev.clientY - h.y) >= (h.slopPx || c.slopPx)) endActive('moved', h);
      };
      h.onUp = (ev) => {
        if (ev.pointerId !== h.pointerId) return;
        if (h.fired) {
          // The finger lifted after the menu opened: eat what the browser sends next.
          if (h.blockers) h.blockers.expire();
          armSwallow();
          endActive('lift', h);
        } else {
          endActive(ev.type === 'pointercancel' ? 'pointercancel' : 'lift', h);
        }
      };
      active = h;
      d.addEventListener('pointermove', h.onMove, true);
      d.addEventListener('pointerup', h.onUp, true);
      d.addEventListener('pointercancel', h.onUp, true);
      h.ringTimer = setTimeout(() => {
        if (active !== h) return;
        h.ring = makeRing(h.x, h.y, c.holdMs - c.ringDelayMs);
        emit('touchhold:progress', { t: now() - h.t0, key: h.key });
      }, c.ringDelayMs);
      h.fireTimer = setTimeout(() => fire(h), c.holdMs);
    };

    // A native long-press contextmenu would open a second menu under the finger.
    const onContext = (e) => {
      if (!isSuppressingContextMenu()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    const cap = !!opts.capture;
    rootEl.addEventListener('pointerdown', onDown, cap);
    rootEl.addEventListener('contextmenu', onContext, true);
    return () => {
      rootEl.removeEventListener('pointerdown', onDown, cap);
      rootEl.removeEventListener('contextmenu', onContext, true);
      if (active) endActive('unbind', active);
    };
  };

  UI.TouchHold = { bind, isSuppressingContextMenu };
})();
