/**
 * Start Page lift & tilt — window.Vectura.StartPageLiftCard (the N3 behavior).
 *
 *   attach(cardEl, { still }) -> { detach() }     (a second attach on the same element returns the same handle)
 *
 * A card tilts toward the pointer (max 10 degrees), rises 5 %, and shows a broad, subtle glare that follows the
 * pointer plus a darker, soft shadow. There is no light box. Keyboard focus (:focus-visible) gives the lifted
 * state WITHOUT tilt. Still (the `still` option, a boolean or () => boolean; else StartPageInk.isStill and the
 * `vectura:start-page-motion` event) and prefers-reduced-motion switch every movement off: nothing tilts, scales or
 * glares and a card only shows its static shadow.
 *
 * Markup it adds (and detach() removes): `.sp-lift` on the card, a `.sp-lift-sh` shadow behind, a `.sp-lift-in`
 * layer that wraps the card's content (this is the layer that transforms), and a `.sp-lift-gl > i` glare INSIDE that
 * layer. The glare is clipped to the art frame and ignores the pointer, so it never covers text or controls: callers
 * keep titles and buttons outside the card element. Touch pointers are ignored. `data-sp-lift` on the card reads
 * rest | hover | focus. Styles: `.sp-lift*` in the skin (src/ui/skin).
 */
(() => {
  const W = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = W.Vectura = W.Vectura || {};

  const MAX_TILT = 10; // degrees
  const LIFT = 1.05;
  const REST = { rx: 0, ry: 0, s: 1, gx: 0, gy: 0, g: 0, sh: 0 };
  const handles = new WeakMap();

  const reducedMotion = () => { try { return !!W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_e) { return false; } };
  const globalStill = () => {
    try { const I = Vectura.StartPageInk; if (I && typeof I.isStill === 'function') return !!I.isStill(); } catch (_e) { /* fall through */ }
    return false;
  };
  const focusVisible = (el) => { try { return el.matches(':focus-visible'); } catch (_e) { return true; } };

  const attach = (cardEl, opts = {}) => {
    if (!cardEl) return { detach() {} };
    if (handles.has(cardEl)) return handles.get(cardEl);
    const D = cardEl.ownerDocument;
    const created = [];
    const make = (tag, cls) => { const n = D.createElement(tag); n.className = cls; n.setAttribute('aria-hidden', 'true'); created.push(n); return n; };

    // structure: [.sp-lift-sh] [.sp-lift-in > ...content... > .sp-lift-gl > i]
    let inn = Array.from(cardEl.children).find((c) => c.classList.contains('sp-lift-in')) || null;
    let wrapped = false;
    if (!inn) {
      inn = D.createElement('span'); inn.className = 'sp-lift-in';
      while (cardEl.firstChild) inn.appendChild(cardEl.firstChild);
      cardEl.appendChild(inn);
      wrapped = true;
    }
    const sh = make('span', 'sp-lift-sh');
    cardEl.insertBefore(sh, cardEl.firstChild);
    const gl = make('span', 'sp-lift-gl');
    gl.appendChild(D.createElement('i'));
    inn.appendChild(gl);
    const glI = gl.firstChild;
    const hadClass = cardEl.classList.contains('sp-lift');
    cardEl.classList.add('sp-lift');
    cardEl.setAttribute('data-sp-lift', 'rest');

    const cur = { ...REST };
    const tgt = { ...REST };
    const s = { hover: false, focus: false, live: false, raf: 0, last: 0, dead: false };

    const isStill = () => {
      const o = opts.still;
      if (typeof o === 'function') { try { if (o()) return true; } catch (_e) { /* ignore */ } } else if (o === true) return true;
      return globalStill() || reducedMotion();
    };

    const paint = () => {
      inn.style.transform = `perspective(900px) rotateX(${cur.rx.toFixed(2)}deg) rotateY(${cur.ry.toFixed(2)}deg) scale(${cur.s.toFixed(4)})`;
      glI.style.transform = `translate3d(${cur.gx.toFixed(1)}px,${cur.gy.toFixed(1)}px,0)`;
      glI.style.opacity = cur.g.toFixed(3);
      const lf = Math.max(0, (cur.s - 1) / (LIFT - 1));
      sh.style.opacity = (cur.sh * (0.55 + 0.45 * Math.min(1.2, lf))).toFixed(3);
      sh.style.transform = `translate3d(${(-cur.ry * 1.6).toFixed(1)}px,${(cur.rx * 1.2 + cur.sh * (10 + 14 * lf)).toFixed(1)}px,0) scale(${(0.94 + cur.sh * (0.04 + 0.05 * lf)).toFixed(3)})`;
    };
    const clearInline = () => {
      inn.style.transform = ''; glI.style.transform = ''; glI.style.opacity = '';
      sh.style.transform = ''; sh.style.opacity = '';
    };
    const stopLoop = () => { if (s.raf) { W.cancelAnimationFrame(s.raf); s.raf = 0; } s.live = false; cardEl.classList.remove('sp-lift-live'); };
    const frame = (now) => {
      s.raf = 0;
      if (s.dead) return;
      const dt = Math.min(64, now - s.last); s.last = now;
      const a = 1 - Math.pow(1 - 0.16, dt / 16.67);
      let d = 0;
      Object.keys(cur).forEach((k) => {
        cur[k] += (tgt[k] - cur[k]) * a;
        d = Math.max(d, Math.abs(tgt[k] - cur[k]) * (k === 'gx' || k === 'gy' ? 0.01 : 1));
      });
      paint();
      if (d < 0.0015) {
        Object.assign(cur, tgt);
        if (tgt.s === 1 && tgt.sh === 0) { clearInline(); stopLoop(); } else { paint(); stopLoop(); }
        return;
      }
      s.raf = W.requestAnimationFrame(frame);
    };
    const kick = () => {
      s.live = true; cardEl.classList.add('sp-lift-live');
      if (!s.raf) { s.last = (W.performance && W.performance.now()) || 0; s.raf = W.requestAnimationFrame(frame); }
    };
    const setState = (name) => { cardEl.setAttribute('data-sp-lift', name); };

    // Still: no movement at all; only a static shadow marks hover or focus.
    const settleStill = () => {
      stopLoop(); clearInline(); Object.assign(cur, REST); Object.assign(tgt, REST);
      if (s.hover || s.focus) sh.style.opacity = '0.6';
    };
    const aim = (x, y) => {
      if (isStill()) { settleStill(); return; }
      const r = cardEl.getBoundingClientRect();
      const nx = Math.max(-0.5, Math.min(0.5, (x - r.left) / (r.width || 1) - 0.5));
      const ny = Math.max(-0.5, Math.min(0.5, (y - r.top) / (r.height || 1) - 0.5));
      Object.assign(tgt, { rx: -ny * 2 * MAX_TILT, ry: nx * 2 * MAX_TILT, s: LIFT, gx: nx * r.width, gy: ny * r.height, g: 1, sh: 1 });
      setState('hover'); kick();
    };
    const rest = () => {
      if (isStill()) { settleStill(); setState(s.focus ? 'focus' : 'rest'); return; }
      if (s.focus) {
        const r = cardEl.getBoundingClientRect();
        Object.assign(tgt, { rx: 0, ry: 0, s: 1 + (LIFT - 1) * 0.6, gx: 0, gy: -(r.height || 0) * 0.32, g: 0.45, sh: 0.75 });
        setState('focus');
      } else { Object.assign(tgt, REST); setState('rest'); }
      kick();
    };

    const onEnter = (e) => { if (e.pointerType === 'touch') return; s.hover = true; aim(e.clientX, e.clientY); };
    const onMove = (e) => { if (e.pointerType === 'touch' || !s.hover) return; aim(e.clientX, e.clientY); };
    const onLeave = (e) => { if (e.pointerType === 'touch') return; s.hover = false; rest(); };
    const onFocusIn = (e) => { if (!focusVisible(e.target && e.target.matches ? e.target : cardEl)) return; s.focus = true; if (!s.hover) rest(); };
    const onFocusOut = () => { s.focus = false; if (!s.hover) rest(); };
    const onMotion = () => { if (isStill()) { settleStill(); setState('rest'); } };

    cardEl.addEventListener('pointerenter', onEnter);
    cardEl.addEventListener('pointermove', onMove, { passive: true });
    cardEl.addEventListener('pointerleave', onLeave);
    cardEl.addEventListener('focusin', onFocusIn);
    cardEl.addEventListener('focusout', onFocusOut);
    W.addEventListener('vectura:start-page-motion', onMotion);
    let mq = null;
    try { mq = W.matchMedia('(prefers-reduced-motion: reduce)'); if (mq && mq.addEventListener) mq.addEventListener('change', onMotion); } catch (_e) { mq = null; }

    const handle = {
      detach() {
        if (s.dead) return;
        s.dead = true; stopLoop();
        cardEl.removeEventListener('pointerenter', onEnter);
        cardEl.removeEventListener('pointermove', onMove);
        cardEl.removeEventListener('pointerleave', onLeave);
        cardEl.removeEventListener('focusin', onFocusIn);
        cardEl.removeEventListener('focusout', onFocusOut);
        W.removeEventListener('vectura:start-page-motion', onMotion);
        if (mq && mq.removeEventListener) mq.removeEventListener('change', onMotion);
        clearInline();
        created.forEach((n) => n.remove());
        if (wrapped) { while (inn.firstChild) cardEl.insertBefore(inn.firstChild, inn); inn.remove(); } else inn.style.transform = '';
        if (!hadClass) cardEl.classList.remove('sp-lift');
        cardEl.removeAttribute('data-sp-lift');
        handles.delete(cardEl);
      },
    };
    handles.set(cardEl, handle);
    return handle;
  };

  Vectura.StartPageLiftCard = { attach, MAX_TILT, LIFT };
})();
