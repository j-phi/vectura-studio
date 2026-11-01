/**
 * Start Page Colorways fan — window.Vectura.UI.StartPageFan.
 *
 *   open(anchorEl, { art, index, alternates, onPick(colorway), onClose? }) -> { close() }
 *     art         { id, name, getSvg() }   the piece fanned out
 *     index       its position (plate index; kept for callers / data attributes)
 *     alternates  colorway[] (StartPageColorway.alternates(index, workId, n, …)), one card each
 *
 * A dimmed, blurred scrim covers the page and the piece's colorways spread from the anchor as tilted cards, each the
 * same art mounted through StartPageInk on that paper and pen. Clicking (or Enter on) a card calls onPick with that
 * card's own colorway object, then closes; Esc, the scrim or a resize closes without picking and returns focus to
 * the opener. Arrow keys / Home / End / Tab move between cards (focus is held inside while open). Reduced motion /
 * the still setting: no staggered fan-out, no draw-in, closes at once. Only one fan exists at a time.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const CLOSE_MS = 260;
  let current = null;

  const reducedMotion = () => {
    try { const ink = Vectura.StartPageInk; if (ink && typeof ink.isStill === 'function' && ink.isStill()) return true; } catch (_) { /* fall through */ }
    try { return !!G.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  };

  const aspectOf = (svg) => {
    const m = /viewBox="\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)\s*"/.exec(svg || '');
    const ar = m ? Number(m[3]) / Number(m[4]) : 1.414;
    return Math.max(0.7, Math.min(1.6, Number.isFinite(ar) && ar > 0 ? ar : 1.414));
  };

  const open = (anchorEl, o = {}) => {
    if (current) current.close(false, true);
    const { h } = Vectura.StartPageDom;
    const alts = Array.isArray(o.alternates) ? o.alternates.slice(0, 8) : [];
    const art = o.art || {};
    const name = String(art.name || 'this piece').replace(/\.vectura$/, '');
    const n = alts.length;
    const still = reducedMotion();
    const doc = anchorEl && anchorEl.ownerDocument ? anchorEl.ownerDocument : document;

    const scrim = h('div', { class: 'sp-fan-scrim' });
    const head = h('div', { class: 'sp-fan-head' }, h('b', { text: name }),
      h('span', { text: `${n} colorway${n === 1 ? '' : 's'} · click one to open it in the editor on that paper and pen` }), h('kbd', { text: 'Esc' }));
    const fan = h('div', { class: `sp-fan${still ? ' still' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': `Colorways of ${name}`, 'data-art-id': art.id || '', 'data-index': String(o.index == null ? '' : o.index) }, scrim, head);
    const cards = alts.map((cw, k) => {
      const pen = cw.penName || cw.name || 'pen';
      const paper = cw.paperName || cw.paper || 'paper';
      const sheetArt = h('span', { class: 'sp-fan-art' });
      const sheet = h('span', { class: 'sp-fan-sheet' }, sheetArt);
      sheet.style.background = cw.paper || '#ffffff';
      const card = h('button', { type: 'button', class: 'sp-fan-card', 'data-k': String(k), 'data-sp-paper': cw.paper || '', 'data-sp-ink': cw.ink || '',
        'aria-label': `Colorway ${ROMAN[k]} of ${name}: ${pen} on ${paper}. Open in the editor` },
      sheet, h('span', { class: 'sp-fan-cap' }, h('b', { text: ROMAN[k] }), h('span', { text: `${pen} · ${paper}` })));
      if (cw.ink2) card.dataset.spInk2 = cw.ink2;
      return { card, sheetArt, cw };
    });
    cards.forEach((c) => fan.append(c.card));
    doc.body.appendChild(fan);
    if (anchorEl) anchorEl.setAttribute('aria-expanded', 'true');

    let closed = false;
    let timer = 0;
    const cardEls = () => cards.map((c) => c.card);

    const close = (refocus = true, instant = false) => {
      if (closed) return;
      closed = true;
      if (current === handle) current = null;
      G.removeEventListener('keydown', onWinKey, true);
      G.removeEventListener('resize', onResize);
      clearTimeout(timer);
      if (anchorEl) anchorEl.setAttribute('aria-expanded', 'false');
      const ink = Vectura.StartPageInk;
      const done = () => {
        cards.forEach((c) => { try { ink && ink.unmount && ink.unmount(c.sheetArt); } catch (_) { /* noop */ } });
        fan.remove();
        if (typeof o.onClose === 'function') { try { o.onClose(); } catch (_) { /* noop */ } }
      };
      if (still || instant || !fan.classList.contains('open')) done();
      else {
        fan.classList.remove('open');
        fan.classList.add('closing');
        cards.forEach((c) => { c.card.style.transitionDelay = '0ms'; if (c.from) put(c.card, c.from); });
        timer = setTimeout(done, CLOSE_MS);
      }
      if (refocus && anchorEl && anchorEl.isConnected) { try { anchorEl.focus({ preventScroll: true }); } catch (_) { anchorEl.focus(); } }
    };
    const handle = { close: (refocus = true, instant = false) => close(refocus, instant), el: fan };
    const put = (el, p) => { el.style.setProperty('--x', `${p.x}px`); el.style.setProperty('--y', `${p.y}px`); el.style.setProperty('--r', `${p.r}deg`); el.style.setProperty('--s', String(p.s)); };

    const pick = (c) => {
      if (closed) return;
      try { if (typeof o.onPick === 'function') o.onPick(c.cw); } finally { close(false); }
    };
    cards.forEach((c) => c.card.addEventListener('click', (e) => { e.stopPropagation(); pick(c); }));
    scrim.addEventListener('click', () => close(true));
    fan.addEventListener('click', (e) => { if (e.target === fan || e.target === head) close(true); });

    const go = (e, j) => { e.preventDefault(); const els = cardEls(); els[(j + els.length) % els.length].focus({ preventScroll: true }); };
    fan.addEventListener('keydown', (e) => {
      const els = cardEls();
      const i = els.indexOf(G.document.activeElement);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(e, i + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(e, i - 1);
      else if (e.key === 'Home') go(e, 0);
      else if (e.key === 'End') go(e, els.length - 1);
      else if (e.key === 'Tab') go(e, i + (e.shiftKey ? -1 : 1));
      if (e.key !== 'Escape') e.stopPropagation();
    });
    // Esc closes the fan before anything else on the page sees it.
    const onWinKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); close(true); } };
    G.addEventListener('keydown', onWinKey, true);
    const onResize = () => close(false);
    G.addEventListener('resize', onResize);

    const layout = (ar) => {
      if (closed) return;
      const vw = G.innerWidth || 1024; const vh = G.innerHeight || 768; const gap = 28;
      const a = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : { left: vw / 2, top: vh / 2, width: 0, height: 0 };
      let W = Math.min(220, (Math.min(vw - 48, 1180) - gap * (n - 1)) / Math.max(1, n));
      let H = W / ar;
      if (H > vh * 0.42) { H = vh * 0.42; W = H * ar; }
      W = Math.max(60, W); H = Math.max(60, H);
      const step = W + gap; const span = step * (n - 1); const mid = (n - 1) / 2;
      let cx = a.left + a.width / 2; let cy = a.top + a.height / 2;
      cx = Math.max(24 + W / 2 + span / 2, Math.min(vw - 24 - W / 2 - span / 2, cx));
      cy = Math.max(96 + H / 2, Math.min(vh - 96 - H / 2, cy)); // room above for the wrapped heading, below for the wrapped captions
      const s0 = Math.min(1, Math.max(0.2, Math.min(a.width / W || 1, a.height / H || 1) * 0.9));
      fan.style.setProperty('--w', `${W}px`); fan.style.setProperty('--h', `${H}px`);
      head.style.maxWidth = `${Math.max(120, vw - 32)}px`;
      const hw = head.offsetWidth || 0;
      head.style.left = `${Math.max(16 + hw / 2, Math.min(vw - 16 - hw / 2, cx))}px`; head.style.top = `${cy - H / 2 - 18}px`; // the heading grows upward when it wraps
      cards.forEach((c, k) => {
        const off = k - mid;
        c.to = { x: cx - W / 2 + off * step, y: cy - H / 2 + off * off * 7, r: off * 3.2, s: 1 };
        c.from = { x: a.left + a.width / 2 - W / 2 + k * 4, y: a.top + a.height / 2 - H / 2 - k * 4, r: 0, s: s0 };
        c.card.style.zIndex = String(n - Math.round(Math.abs(off) * 2));
      });
      if (still) { cards.forEach((c) => put(c.card, c.to)); fan.classList.add('open'); return; }
      cards.forEach((c) => put(c.card, c.from));
      void fan.offsetWidth;
      fan.classList.add('open');
      const run = () => cards.forEach((c, k) => { c.card.style.transitionDelay = `${k * 40}ms`; put(c.card, c.to); });
      if (typeof G.requestAnimationFrame === 'function') G.requestAnimationFrame(run); else run();
    };

    const mountAll = (svg) => {
      const ink = Vectura.StartPageInk;
      if (!ink || typeof ink.mount !== 'function' || !svg) return;
      cards.forEach((c, k) => {
        Promise.resolve(ink.mount(c.sheetArt, { id: art.id || 'fan', svg }, { colorway: c.cw, fit: 'contain', pad: 0.1, label: false }))
          .then(() => { if (!closed && !still && typeof ink.drawIn === 'function') ink.drawIn(c.sheetArt, { style: 'plot', duration: 1100, delay: 180 + k * 120 }); }, () => {});
      });
    };

    Promise.resolve(typeof art.getSvg === 'function' ? art.getSvg() : '').catch(() => '').then((svg) => {
      if (closed) return;
      layout(aspectOf(svg));
      mountAll(svg);
      const first = cardEls()[0];
      if (first) { try { first.focus({ preventScroll: true }); } catch (_) { first.focus(); } }
    });

    current = handle;
    return handle;
  };

  UI.StartPageFan = { open };
})();
