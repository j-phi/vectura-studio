/**
 * Start Page "Studio picks" — window.Vectura.StartPagePicksSection.
 *
 *   create(rootEl, { artSource, colorwayFor(art, index), openArt(art, colorway, { asTemplate }), animateIn? })
 *     -> { render(): Promise, recolor(), destroy() }
 *
 * Renders the curated presets (the `kind: 'pick'` pieces of StartPageArtSource, i.e. START_PAGE_PICKS) as a grid of
 * liftable cards (StartPageLiftCard) drawn through StartPageInk in page colorways. Each card shows the name, the
 * algorithm and the collection, and has two actions, Open and Open as template; clicking the card is Open.
 * openArt is always called with the colorway the card is showing right now, so a piece opens in the colors shown.
 * Art mounts lazily as a card nears the viewport. rootEl gets id `sp-picks` (the plates empty state links to it).
 * recolor() re-resolves every colorway after a page color change. `animateIn` (a draw style or () => style) plays
 * the draw-in once on first mount; StartPageInk skips it under Still. `hover` (a startPage.hover id or () => id)
 * is the page's hover effect: default/lift keep the lift & tilt, none turns it off, any other effect id is attached
 * to the card's art on hover (StartPageMotion.bindArt).
 */
(() => {
  const W = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = W.Vectura = W.Vectura || {};

  const create = (rootEl, opts = {}) => {
    const D = rootEl.ownerDocument;
    const Dom = () => Vectura.StartPageDom;
    const Ink = () => Vectura.StartPageInk;
    let cards = []; // { art, cw, artEl, mounted, lift, bind }
    let io = null;
    let gen = 0; // bumped when the cards are torn down (stale mounts bail)
    let seq = 0; // bumped by every render() call (a newer call supersedes an older one)
    let dead = false;

    const algoLabel = (type) => {
      try { const fn = Vectura.PresetNameHeuristics && Vectura.PresetNameHeuristics.algoLabel; return (typeof fn === 'function' && fn(type)) || type || ''; } catch (_e) { return type || ''; }
    };
    const colorwayOf = (art, i) => { try { return opts.colorwayFor(art, i); } catch (_e) { return null; } };
    const hoverPref = () => (typeof opts.hover === 'function' ? opts.hover() : opts.hover) || 'default';
    const isStill = () => !!(Ink() && Ink().isStill && Ink().isStill());
    // Cards lift & tilt by default; the page's hover effect can switch that off or swap in a hover effect on the art.
    const liftOff = () => { const M = Vectura.StartPageMotion; return !!M && M.plan(hoverPref(), 'card').type !== 'lift-card'; };
    const style = () => (typeof opts.animateIn === 'function' ? opts.animateIn() : opts.animateIn) || 'plot';
    const open = (card, asTemplate) => {
      if (typeof opts.openArt !== 'function') return undefined;
      return opts.openArt(card.art, card.cw, { asTemplate: !!asTemplate });
    };

    const mountCard = async (card, myGen) => {
      if (card.mounted || dead) return;
      card.mounted = true;
      try {
        const svg = await card.art.getSvg();
        if (dead || myGen !== gen || !card.artEl.isConnected) return;
        const ink = Ink();
        if (!ink) return;
        // the whole piece, scaled up to fill the card (not the paper sheet with a small object lost in it)
        await ink.mount(card.artEl, { id: card.art.id, svg }, { colorway: card.cw, label: false, fit: 'object' });
        if (dead || myGen !== gen) return;
        const M = Vectura.StartPageMotion;
        if (M) card.bind = M.bindArt(card.artEl, { handle: () => card.artEl._spInk || null, animateIn: style, hover: hoverPref, kind: 'card' });
        // Mounted ahead of the viewport (300 px margin): hold the art blank and draw it in when the card is >= 30 % in view.
        if (typeof ink.drawIn === 'function') {
          const art = card.artEl;
          if (M && typeof M.whenVisible === 'function' && !M.isStill() && M.styleId(style()) !== 'none') {
            art.classList.add('sp-pre');
            card.visCancel = M.whenVisible(art, () => {
              card.visCancel = null;
              ink.drawIn(art, { style: style() });
              let n = 0; const reveal = () => { if (++n < 3) W.requestAnimationFrame(reveal); else art.classList.remove('sp-pre'); };
              W.requestAnimationFrame(reveal);
            });
          } else ink.drawIn(art, { style: style() });
        }
      } catch (err) { if (W.console) W.console.warn('[StartPagePicks]', err); }
    };

    const teardown = () => {
      gen += 1;
      if (io) { io.disconnect(); io = null; }
      cards.forEach((c) => {
        try { c.lift && c.lift.detach(); } catch (_e) { /* ignore */ }
        try { c.visCancel && c.visCancel(); } catch (_e) { /* ignore */ }
        try { c.bind && c.bind.destroy(); } catch (_e) { /* ignore */ }
        try { c.artEl && Ink() && Ink().unmount(c.artEl); } catch (_e) { /* ignore */ }
      });
      cards = [];
      rootEl.textContent = '';
    };

    const sigOf = (arts) => arts.map((a) => `${a.id}\u0001${a.name}`).join('\u0002');

    const render = async () => {
      if (dead) return;
      const { h } = Dom();
      const mySeq = (seq += 1);
      rootEl.id = 'sp-picks';
      rootEl.classList.add('sp-picks');
      let list = [];
      try { list = ((await opts.artSource.list()) || []).filter((a) => a && a.kind === 'pick'); } catch (_e) { list = []; }
      if (dead || mySeq !== seq) return;
      // The same picks are already on the page: keep the cards (and their mounted art) and only refresh their colors.
      // Tearing them down would collapse the section, shift the scroll position and leave the new cards un-mounted
      // below the lazy-mount margin.
      if (cards.length && sigOf(cards.map((c) => c.art)) === sigOf(list)) { api.recolor(); return; }
      // A different set: hold the current height while the cards are rebuilt so the page does not jump.
      const held = rootEl.offsetHeight;
      if (held > 0) rootEl.style.minHeight = `${held}px`;
      teardown();
      const myGen = gen;
      const release = () => { rootEl.style.minHeight = ''; };

      const head = h('div', { class: 'sp-sec-head' },
        h('div', { class: 'sp-eyebrow', text: 'Starting points' }),
        h('h2', { class: 'sp-sec-title', id: 'sp-picks-h', text: 'Studio picks' }));
      rootEl.setAttribute('aria-labelledby', 'sp-picks-h');
      if (!list.length) {
        rootEl.append(head, h('p', { class: 'sp-picks-empty', text: 'No studio picks are available right now.' }));
        release();
        return;
      }
      const grid = h('div', { class: 'sp-picks-grid' });
      list.forEach((art, i) => {
        const cw = colorwayOf(art, i);
        const artEl = h('div', { class: 'sp-pick-art' });
        const btn = h('button', { class: 'sp-pick-card', type: 'button', 'aria-label': `Open ${art.name} from the studio library` }, artEl);
        const card = { art, cw, artEl, mounted: false, lift: null };
        Vectura.StartPageDom.onOpenClick(btn, () => open(card, false));
        const meta = [algoLabel(art.algorithm), art.collection].filter(Boolean).join(' · ');
        const openBtn = h('button', { class: 'sp-pick-btn sp-pick-btn-primary', type: 'button', text: 'Open', 'aria-label': `Open ${art.name}` });
        const tplBtn = h('button', { class: 'sp-pick-btn', type: 'button', text: 'Open as template', 'aria-label': `Open as template: ${art.name}` });
        openBtn.addEventListener('click', () => open(card, false));
        tplBtn.addEventListener('click', () => open(card, true));
        grid.append(h('div', { class: 'sp-pick' },
          btn,
          h('h3', { class: 'sp-pick-name', text: art.name }),
          h('p', { class: 'sp-pick-meta', text: meta }),
          h('div', { class: 'sp-pick-acts' }, openBtn, tplBtn)));
        cards.push(card);
        const L = Vectura.StartPageLiftCard;
        if (L) card.lift = L.attach(btn, { still: () => isStill() || liftOff() });
      });
      rootEl.append(head, grid);
      release();

      if (typeof W.IntersectionObserver === 'function') {
        io = new W.IntersectionObserver((entries) => {
          entries.forEach((en) => {
            if (!en.isIntersecting) return;
            const card = cards.find((c) => c.artEl === en.target);
            if (io) io.unobserve(en.target);
            if (card) mountCard(card, myGen);
          });
        }, { rootMargin: '300px 0px' });
        cards.forEach((c) => io.observe(c.artEl));
      } else {
        cards.forEach((c) => mountCard(c, myGen));
      }
    };

    const api = {
      render,
      recolor() {
        cards.forEach((c, i) => {
          const cw = colorwayOf(c.art, i);
          if (!cw) return;
          c.cw = cw;
          const handle = c.artEl._spInk;
          if (handle && typeof handle.setColorway === 'function') handle.setColorway(cw);
        });
      },
      destroy() { dead = true; seq += 1; teardown(); rootEl.style.minHeight = ''; rootEl.removeAttribute('aria-labelledby'); },
    };
    return api;
  };

  Vectura.StartPagePicksSection = { create };
})();
