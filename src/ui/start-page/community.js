/**
 * Start Page "Community" — window.Vectura.StartPageCommunity.
 *
 *   create(rootEl, { leadArt, colorway, notify: { get(), set(bool) }, openArt?(art, colorway) })
 *     -> { render(): Promise, recolor(colorway?), destroy() }
 *
 * Honest by design: one line saying sharing is coming later, a Notify switch, the user's lead plate (or, on first
 * run, a studio pick) as a liftable card, and empty slots. There is no feed, no names, no avatars, no counts.
 * `leadArt` and `colorway` may be values or functions returning them. The Notify switch persists through the
 * passed accessor (the Start Page backs it with the `startPage.communityNotify` preference). The lead card opens
 * through openArt (when given) in exactly the colorway it shows.
 */
(() => {
  const W = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = W.Vectura = W.Vectura || {};

  const LINE = 'Coming later: a shared wall of pieces that Vectura artists choose to publish. Nothing of yours is shared unless you do.';
  const SLOTS = 4;

  const create = (rootEl, opts = {}) => {
    const D = rootEl.ownerDocument;
    const Ink = () => Vectura.StartPageInk;
    const val = (v) => (typeof v === 'function' ? v() : v);
    const hoverPref = () => val(opts.hover) || 'default';
    const isStill = () => !!(Ink() && Ink().isStill && Ink().isStill());
    const liftOff = () => { const M = Vectura.StartPageMotion; return !!M && M.plan(hoverPref(), 'card').type !== 'lift-card'; };
    let cw = null;
    let lead = null;
    let lift = null;
    let artEl = null;
    let io = null;
    let bind = null;
    let gen = 0;
    let dead = false;

    const teardown = () => {
      gen += 1;
      if (io) { io.disconnect(); io = null; }
      try { lift && lift.detach(); } catch (_e) { /* ignore */ }
      try { bind && bind.destroy(); } catch (_e) { /* ignore */ }
      bind = null;
      try { artEl && Ink() && Ink().unmount(artEl); } catch (_e) { /* ignore */ }
      lift = null; artEl = null;
      rootEl.textContent = '';
    };

    const mountLead = async (myGen) => {
      try {
        const svg = await lead.getSvg();
        if (dead || myGen !== gen || !artEl || !artEl.isConnected) return;
        const ink = Ink();
        if (!ink) return;
        await ink.mount(artEl, { id: lead.id, svg }, { colorway: cw, label: false, fit: 'object' });
        if (dead || myGen !== gen) return;
        const M = Vectura.StartPageMotion;
        if (M && artEl) bind = M.bindArt(artEl, { handle: () => artEl._spInk || null, animateIn: 'plot', hover: hoverPref, kind: 'card' });
        // It plots in when the lead piece is scrolled into view (>= 30 %), not when it mounts ahead of the viewport.
        if (M && artEl && typeof M.whenVisible === 'function' && !M.isStill() && typeof ink.drawIn === 'function') {
          const el = artEl;
          el.classList.add('sp-pre');
          M.whenVisible(el, () => {
            ink.drawIn(el, { style: 'plot' });
            let n = 0; const reveal = () => { if (++n < 3) W.requestAnimationFrame(reveal); else el.classList.remove('sp-pre'); };
            W.requestAnimationFrame(reveal);
          });
        }
      } catch (err) { if (W.console) W.console.warn('[StartPageCommunity]', err); }
    };

    const render = async () => {
      teardown();
      if (dead) return;
      const { h } = Vectura.StartPageDom;
      const myGen = gen;
      lead = val(opts.leadArt) || null;
      cw = val(opts.colorway) || null;
      rootEl.classList.add('sp-community');
      rootEl.setAttribute('aria-labelledby', 'sp-cm-h');

      const status = h('p', { class: 'sp-cm-status', 'aria-live': 'polite' });
      const sw = h('button', { class: 'sp-cm-switch', type: 'button', role: 'switch', 'aria-labelledby': 'sp-cm-sw-l' },
        h('span', { class: 'sp-cm-sw-l', id: 'sp-cm-sw-l', text: 'Notify me here when it opens' }),
        h('span', { class: 'sp-switch', 'aria-hidden': 'true' }, h('span', { class: 'sp-switch-knob' })));
      const sync = (on) => { sw.setAttribute('aria-checked', on ? 'true' : 'false'); };
      let on = false;
      try { on = !!(opts.notify && opts.notify.get()); } catch (_e) { on = false; }
      sync(on);
      sw.addEventListener('click', () => {
        on = sw.getAttribute('aria-checked') !== 'true';
        try { opts.notify && opts.notify.set(on); } catch (_e) { /* the toggle still reflects the click */ }
        sync(on);
        status.textContent = on ? 'Okay. We will put a note on this page when it opens.' : 'Okay, no note.';
      });

      const left = h('div', { class: 'sp-cm-copy' },
        h('div', { class: 'sp-eyebrow', text: 'Later' }),
        h('h2', { class: 'sp-sec-title', id: 'sp-cm-h', text: 'Community' }),
        h('p', { class: 'sp-cm-line', text: LINE }),
        sw, status);

      const row = h('div', { class: 'sp-cm-row' });
      if (lead) {
        artEl = h('div', { class: 'sp-cm-art' });
        const label = lead.kind === 'pick' ? 'A studio pick, as a shared piece would look' : 'Your lead plate, once you publish it';
        let card;
        if (typeof opts.openArt === 'function') {
          card = h('button', { class: 'sp-cm-card', type: 'button', 'aria-label': `${lead.name}: ${label.toLowerCase()}. Open it` }, artEl);
          Vectura.StartPageDom.onOpenClick(card, () => opts.openArt(lead, cw));
        } else {
          card = h('div', { class: 'sp-cm-card', role: 'img', 'aria-label': `${lead.name}: ${label.toLowerCase()}` }, artEl);
        }
        lift = Vectura.StartPageLiftCard ? Vectura.StartPageLiftCard.attach(card, { still: () => isStill() || liftOff() }) : null;
        row.append(h('div', { class: 'sp-cm-slot sp-cm-lead' }, card, h('span', { class: 'sp-cm-label', text: label })));
      }
      for (let i = lead ? 1 : 0; i < SLOTS; i += 1) {
        row.append(h('div', { class: 'sp-cm-slot sp-cm-empty', 'aria-hidden': 'true' }, h('i')));
      }
      rootEl.append(h('div', { class: 'sp-cm-grid' }, left, row));

      if (lead && cw) {
        if (typeof W.IntersectionObserver === 'function') {
          io = new W.IntersectionObserver((entries) => {
            if (entries.some((en) => en.isIntersecting)) { if (io) io.disconnect(); mountLead(myGen); }
          }, { rootMargin: '300px 0px' });
          io.observe(artEl);
        } else mountLead(myGen);
      }
    };

    return {
      render,
      recolor(next) {
        const c = next || val(opts.colorway);
        if (!c) return;
        cw = c;
        const handle = artEl && artEl._spInk;
        if (handle && typeof handle.setColorway === 'function') handle.setColorway(c);
      },
      destroy() { dead = true; teardown(); rootEl.removeAttribute('aria-labelledby'); },
    };
  };

  Vectura.StartPageCommunity = { create };
})();
