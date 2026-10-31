/**
 * Start Page cover — window.Vectura.UI.StartPageCover. Three styles, art from the art provider:
 *   mosaic (Name in Ink, default): the word set huge, each letter a button filled with its own piece, plotted in
 *     letter by letter, with a key row (01 …) that names the piece on hover / focus;
 *   word (Cover Specimen): one piece fills the whole word;
 *   band (Portfolio band): a full-width band of one piece; a 3D piece (StartPageMotion.modelFor) is a live,
 *     drag-to-rotate StartPageOrbit3D model instead of the drawing.
 * Also the cover chrome: word picker button, info line, click-to-edit name and practice line, and the honest empty
 * state when there is no art yet. Recoloring (setColorway on every tile) never re-fits or re-plots.
 *
 *   create({ host, prefs(), arts(), colorwaysFor(arts), still(), onOpen(art, cw), onPref(key, value), onCover(override|null),
 *            onWordPick(id, custom?) }) -> { render({animate}), recolor(), refit(), tiles(), destroy(), words,
 *                                            useAsCover(art, { colorway, frame, fill }) -> Promise }
 *   useAsCover: smooth-scrolls to the top, then the piece enters the current style (mosaic: letter 01 and every letter
 *   re-plots; word: re-fills; band: cross-fades and draws in, with the plate's frame + fill) and an Undo toast is shown.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const DRAW_MS = 1250;
  // The page's "Art animates in" default as a registered draw style (the preference enum is hyphenated).
  const animStyle = (prefs) => { const M = Vectura.StartPageMotion; return M ? M.styleId(prefs && prefs.animateIn) : ((prefs && prefs.animateIn) || 'plot'); };
  const reducedMotion = () => {
    try { const ink = Vectura.StartPageInk; if (ink && typeof ink.isStill === 'function' && ink.isStill()) return true; } catch (_) { /* fall through */ }
    try { return G.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  };

  const create = (ctx) => {
    const { h, pad2, onOpenClick } = Vectura.StartPageDom;
    const Words = () => Vectura.StartPageCoverWords;
    const Ink = () => Vectura.StartPageInk;
    const host = ctx.host;
    let gen = 0;
    let tiles = []; // [{ el, art, cw, k, kind: 'word'|'tile' }]
    let timers = [];
    let ro = null;
    let lastW = 0;
    let editors = [];
    let override = null; // { art, colorway, frame, fill } set by useAsCover; survives style changes
    let hold = null; // { old, tile }: the band kept on screen while its replacement mounts (cross-fade)

    const top = h('div', { class: 'sp-cv-top' });
    const pickBtn = h('button', { type: 'button', id: 'sp-word-btn', class: 'sp-word-btn', 'aria-label': 'Choose the cover word', title: 'Choose the cover word', html: Vectura.StartPageIcons.pencil });
    const kick = h('span', { class: 'sp-cv-kick-tx', id: 'sp-cv-kick' });
    const info = h('span', { class: 'sp-cv-info', id: 'sp-cv-info' });
    // Colorways fan for the piece the cover shows (band / word: the one piece; mosaic: the letter last hovered or focused).
    const fanBtn = h('button', { type: 'button', class: 'sp-cv-fan', id: 'sp-cv-fan', hidden: true, 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: 'See this piece in other colorways' }, 'Colorways');
    top.append(h('span', { class: 'sp-cv-kick' }, pickBtn, kick), h('span', { class: 'sp-cv-end' }, info, fanBtn));
    const stage = h('div', { class: 'sp-cv-stage', id: 'sp-cv-stage' });
    const who = h('div', { class: 'sp-cv-who', id: 'sp-cv-who' });
    host.append(top, stage, who);

    const picker = UI.StartPageWordPicker.create({
      button: pickBtn, prefs: ctx.prefs,
      onPick: (id, custom) => ctx.onWordPick(id, custom),
    });

    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const clearTimers = () => { timers.forEach((t) => clearTimeout(t)); timers = []; };

    let fanHandle = null;
    let fanTile = 0; // mosaic: k of the letter the fan follows
    const closeFan = () => { if (fanHandle) { try { fanHandle.close(false, true); } catch (_) { /* noop */ } fanHandle = null; } };
    const fanTarget = () => (host.dataset.style === 'mosaic' ? (tiles.find((t) => t.k === fanTile) || tiles[0]) : tiles[0]);
    const themeKey = () => {
      if (typeof ctx.theme === 'function') return ctx.theme();
      const id = String((Vectura.SETTINGS && Vectura.SETTINGS.uiTheme) || 'dark');
      return /lark/.test(id) ? 'lark' : (/light/.test(id) ? 'light' : 'dark');
    };
    const syncFanBtn = () => {
      const t = fanTarget();
      fanBtn.hidden = !t;
      if (t) fanBtn.setAttribute('aria-label', `Colorways of ${String(t.art.name || 'this piece').replace(/\.vectura$/, '')}`);
    };
    const openFan = () => {
      const t = fanTarget();
      const Fan = (Vectura.UI && Vectura.UI.StartPageFan) || UI.StartPageFan;
      if (!t || !Fan || typeof Fan.open !== 'function') return;
      closeFan();
      const p = ctx.prefs();
      const mode = typeof ctx.mode === 'function' ? ctx.mode() : (p.seed ? 'random' : (p.colorMode || 'curated'));
      let alternates = [];
      try {
        alternates = typeof ctx.alternatesFor === 'function' ? ctx.alternatesFor(t.art, 4)
          : Vectura.StartPageColorway.alternates(0, t.art.id, 4, { mode, seed: p.seed || undefined, theme: themeKey(), works: [{ id: t.art.id }] });
      } catch (err) { if (G.console) G.console.warn('[Cover] alternates failed', err); }
      fanHandle = Fan.open(fanBtn, { art: t.art, index: 0, alternates, onPick: (cw) => ctx.onOpen(t.art, cw, { asTemplate: false }), onClose: () => { fanHandle = null; } });
    };
    fanBtn.addEventListener('click', openFan);

    const teardown = () => {
      closeFan();
      clearTimers();
      if (ro) { ro.disconnect(); ro = null; }
      editors.forEach((e) => e.destroy && e.destroy());
      editors = [];
      const ink = Ink();
      if (hold) { tiles = tiles.filter((t) => t !== hold.tile); }
      tiles.forEach((t) => {
        try { ink && ink.unmount(t.el); } catch (_) { /* noop */ }
        if (t.el._sp3d) { try { t.el._sp3d.destroy(); } catch (_) { /* noop */ } t.el._sp3d = null; }
      });
      tiles = [];
      if (hold) [...stage.children].forEach((c) => { if (c !== hold.old) c.remove(); });
      else stage.textContent = '';
    };

    const setCwData = (t) => {
      t.el.dataset.spPaper = t.cw.paper;
      t.el.dataset.spInk = t.cw.ink;
      if (t.cw.ink2) t.el.dataset.spInk2 = t.cw.ink2; else delete t.el.dataset.spInk2;
      t.el.dataset.artId = t.art.id;
    };

    const pinned = (art, cw) => (override && override.colorway && override.art.id === art.id ? override.colorway : cw);
    const lumOf = (hex) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
      if (!m) return 1;
      const n = parseInt(m[1], 16); const ch = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
    };
    // The chosen piece keeps its special fill: the spec is rebuilt from the colorway on screen (so a mode switch or a
    // restored session recolors it) and travels in colorway.fill, which is what StartPageInk paints.
    const withFill = (art, cw) => {
      if (!cw || !override || !override.fill || override.art.id !== art.id) return cw;
      const F = Vectura.StartPagePlateFills;
      const kind = typeof override.fill === 'string' ? override.fill : override.fill.kind;
      let spec = null;
      try { spec = kind && F ? F.spec(kind, { ink: cw.ink, accent: cw.ink2 || cw.ink, onDark: lumOf(cw.paper) < 0.2 }) : (override.fill && override.fill.stops ? override.fill : null); } catch (_) { spec = null; }
      return spec ? Object.assign({}, cw, { fill: spec, key: undefined }) : cw;
    };
    const cwFor = (art, cw) => withFill(art, pinned(art, cw));

    /* -------------------------------------------------------------- measuring */
    let mctx = null;
    const measure = (text) => {
      try {
        mctx = mctx || document.createElement('canvas').getContext('2d');
        if (!mctx) throw new Error('no canvas');
        mctx.font = '700 100px "Space Grotesk", system-ui, sans-serif';
        return mctx.measureText(text).width * 1.06 + 8;
      } catch (_) { return text.length * 62; }
    };
    const maxFs = () => Math.min(300, Math.max(110, (G.innerHeight || 900) * 0.3));
    const stageWidth = () => Math.max(200, stage.clientWidth || host.clientWidth || 800);
    const splitLines = (word) => {
      const ws = word.trim().split(/\s+/);
      if (ws.length < 2) return [word.trim()];
      const W = stageWidth(); const mf = maxFs();
      const one = Math.min(mf, 100 * W / measure(word) * 0.955);
      let best = null;
      for (let i = 1; i < ws.length; i++) {
        const a = ws.slice(0, i).join(' '); const b = ws.slice(i).join(' ');
        const w = Math.max(measure(a), measure(b));
        if (!best || w < best.w) best = { a, b, w };
      }
      const two = Math.min(mf * 0.7, 100 * W / best.w * 0.955);
      return two > one * 1.15 ? [best.a, best.b] : [word.trim()];
    };

    /* -------------------------------------------------------------- key row (mosaic) */
    const penShort = (n) => String(n || '').replace(/^(Sakura|Pigma|Stabilo)\s+/i, '');
    const renderKey = () => {
      stage.querySelectorAll('.sp-wline').forEach((line) => {
        const kr = line.querySelector('.sp-key-row');
        if (!kr) return;
        const r0 = kr.getBoundingClientRect();
        kr.textContent = '';
        line.querySelectorAll('.sp-lt').forEach((b) => {
          const t = tiles.find((x) => x.el.parentNode === b);
          if (!t) return;
          const r = b.getBoundingClientRect();
          const k = h('span', { class: 'sp-kk', 'data-k': String(t.k) },
            h('i', { class: 'sp-sw2' }), h('b', { text: pad2(t.k + 1) }),
            h('span', { class: 't', text: t.art.name.replace(/\.vectura$/, '') }),
            h('span', { class: 'm', text: `${t.art.algorithm || 'Piece'} · ${penShort(t.cw.penName || t.cw.name)}` }));
          k.style.left = `${(r.left - r0.left + r.width * 0.46).toFixed(1)}px`;
          k.style.setProperty('--p', t.cw.paper); k.style.setProperty('--i', t.cw.ink);
          kr.append(k);
        });
        kr.append(h('i', { class: 'sp-bar' }));
      });
    };
    const showKey = (j) => {
      const t = tiles.find((x) => x.k === j);
      if (!t) return;
      const b = t.el.parentNode;
      const kr = b.closest('.sp-wline')?.querySelector('.sp-key-row');
      const k = kr && kr.querySelector(`.sp-kk[data-k="${j}"]`);
      if (!k) return;
      stage.querySelectorAll('.sp-key-row').forEach((x) => { if (x !== kr) { x.classList.remove('act'); x.querySelectorAll('.sp-kk').forEach((y) => y.classList.remove('on')); } });
      kr.classList.add('act');
      kr.querySelectorAll('.sp-kk').forEach((x) => x.classList.toggle('on', x === k));
      const r0 = kr.getBoundingClientRect(); const r = b.getBoundingClientRect();
      const bar = kr.querySelector('.sp-bar');
      bar.style.left = `${r.left - r0.left}px`; bar.style.width = `${r.width * 0.92}px`;
      k.style.transform = 'none';
      const w = k.offsetWidth; const cx = r.left - r0.left + r.width * 0.46;
      k.style.left = `${Math.max(0, Math.min(kr.clientWidth - w, cx - w / 2))}px`;
    };
    const hideKey = () => { stage.querySelectorAll('.sp-key-row').forEach((kr) => { kr.classList.remove('act'); kr.querySelectorAll('.sp-kk').forEach((x) => { x.classList.remove('on'); x.style.transform = ''; }); }); renderKey(); };

    /* -------------------------------------------------------------- fit */
    const fitMosaic = () => {
      const rows = [...stage.querySelectorAll('.sp-word-row')];
      if (!rows.length) return;
      rows.forEach((r) => { r.style.fontSize = '100px'; });
      const w = Math.max(...rows.map((r) => r.getBoundingClientRect().width || 1));
      const two = rows.length > 1;
      const mf = maxFs() * (two ? 0.7 : 1);
      const fs = Math.max(two ? 44 : 38, Math.min(mf, 100 * stageWidth() / w * 0.955));
      rows.forEach((r) => {
        r.style.fontSize = `${fs}px`;
        const kr = r.nextElementSibling;
        const chars = [...r.querySelectorAll('.sp-vw')].map((v) => v.dataset.ch).join('');
        if (kr) kr.style.marginTop = `${Math.round(fs * (/[gjpqy]/.test(chars) ? 0.1 : 0.02))}px`;
      });
    };

    /* -------------------------------------------------------------- plot-in */
    // The word plays the prototype's sequence: hairline outline of the glyphs, then the paper wipes in left to right while
    // the pen plots the piece clipped to the letters (fillWord({ hold }) keeps the finished art off screen until then).
    // A letter never blanks: nothing solid is shown before, nothing is hidden during.
    const plotIn = (el, { delay = 0, duration = DRAW_MS, style = 'plot' } = {}) => {
      const ink = Ink();
      if (!ink || ink.isStill()) return;
      later(() => {
        const done = () => { const hd = el._spWord; if (hd && hd.release) hd.release(); };
        ink.drawIn(el, { style, duration }).then(done, done);
      }, delay);
    };
    const animates = (animate) => animate && !ctx.still() && !reducedMotion();

    /* -------------------------------------------------------------- styles */
    const buildMosaic = async (word, arts, animate, my) => {
      const chars = Words().letters(word);
      const assigned = Words().assignArts(chars.map((l) => l.ch), arts);
      if (override && assigned.length) { // the chosen piece leads: letter 01, never repeated elsewhere
        const at = assigned.findIndex((a) => a.id === override.art.id);
        if (at > 0) { const t = assigned[0]; assigned[0] = assigned[at]; assigned[at] = t; } else if (at < 0) assigned[0] = override.art;
      }
      // Start every piece now, in letter order (the first-run renders queue one after another); each letter fills as its
      // own piece arrives instead of the whole word waiting for the slowest one.
      const svgPromises = assigned.map((a) => a.getSvg().catch(() => ''));
      const cws = ctx.colorwaysFor(assigned);
      if (override && override.colorway && cws.length) cws[0] = override.colorway;
      if (override && cws.length) cws[0] = withFill(assigned[0], cws[0]);
      const lines = splitLines(word);
      let k = 0;
      stage.append(h('div', { class: `sp-word-wrap${lines.length > 1 ? ' two' : ''}`, role: 'group', 'aria-label': `${word}: each letter opens the piece it carries` },
        lines.map((ln) => h('div', { class: 'sp-wline' },
          h('div', { class: 'sp-word-row' }, [...ln].map((ch) => {
            if (!ch.trim()) return h('span', { class: 'sp-gap', 'aria-hidden': 'true' });
            const i = k++;
            const a = assigned[i];
            const vw = h('span', { class: 'sp-vw', 'aria-hidden': 'true', 'data-ch': ch, text: ch });
            const btn = h('button', { type: 'button', class: 'sp-lt', 'data-k': String(i), 'data-art-id': a.id, 'aria-label': `${ch}, ${a.name.replace(/\.vectura$/, '')}. Open` }, vw);
            vw.style.setProperty('--sp-ph', cws[i].paper); // the placeholder leans toward its final paper until the art arrives
            tiles.push({ el: vw, art: a, cw: cws[i], k: i, kind: 'word', svg: '', ch });
            return btn;
          })),
          h('div', { class: 'sp-key-row', 'aria-hidden': 'true' })))));
      const wrap = stage.querySelector('.sp-word-wrap');
      onOpenClick(wrap, (e) => {
        const b = e.target.closest && e.target.closest('.sp-lt');
        if (!b) return;
        const t = tiles.find((x) => x.k === Number(b.dataset.k));
        if (t) ctx.onOpen(t.art, t.cw);
      });
      const over = (e) => { const b = e.target.closest && e.target.closest('.sp-lt'); if (b) { fanTile = Number(b.dataset.k); syncFanBtn(); showKey(fanTile); } };
      wrap.addEventListener('pointerover', over);
      wrap.addEventListener('focusin', over);
      wrap.addEventListener('pointerleave', hideKey);
      wrap.addEventListener('focusout', (e) => { if (!wrap.contains(e.relatedTarget)) hideKey(); });
      try { if (G.document.fonts && G.document.fonts.ready) await G.document.fonts.ready; } catch (_) { /* noop */ }
      if (my !== gen) return;
      fitMosaic();
      const ink = Ink();
      const style = animStyle(ctx.prefs());
      const stagger = tiles.length > 9 ? 110 : 170;
      const started = Date.now();
      const play = animates(animate);
      // Every letter is set NOW (outline only when it will play) and fills as its own piece arrives; the draw-in
      // is scheduled on the page's clock, never on when a piece happened to render.
      const fills = tiles.map((t, j) => {
        setCwData(t);
        const p = ink.fillWord(t.el, t.ch, { id: t.art.id, svg: svgPromises[j] }, { fit: false, colorway: t.cw, hold: play });
        svgPromises[j].then((svg) => { if (my === gen) t.svg = svg; });
        if (play) plotIn(t.el, { delay: Math.max(0, 260 + j * stagger - (Date.now() - started)), style });
        return p;
      });
      signalMounted();
      await Promise.all(fills);
      if (my !== gen) return;
      renderKey();
      if (G.ResizeObserver) {
        ro = new G.ResizeObserver(() => { if (Math.abs(stage.clientWidth - lastW) > 2) { lastW = stage.clientWidth; fitMosaic(); later(renderKey, 220); } });
        lastW = stage.clientWidth; ro.observe(stage);
      }
    };

    const buildSpecimen = async (word, arts, animate, my) => {
      const art = arts[0];
      const svg = await art.getSvg().catch(() => '');
      if (my !== gen) return;
      const cw = cwFor(art, ctx.colorwaysFor([art])[0]);
      // The h1 stays the page's heading; the word inside it is a real button that opens the piece.
      const el = h('button', { type: 'button', class: 'sp-xc-word', 'aria-label': `${word}, filled with ${art.name.replace(/\.vectura$/, '')}. Open the piece` }, word);
      const heading = h('h1', { class: 'sp-xc-h' }, el);
      const cap = h('div', { class: 'sp-xc-cap' }, h('i', { class: 'sp-sw2' }), h('span', {}, h('b', { text: art.name.replace(/\.vectura$/, '') }), ` · ${art.algorithm || 'Piece'}`));
      stage.append(heading, cap);
      const t = { el, art, cw, k: 0, kind: 'word', svg, ch: word, cap };
      tiles.push(t); setCwData(t);
      cap.querySelector('.sp-sw2').style.setProperty('--p', cw.paper); cap.querySelector('.sp-sw2').style.setProperty('--i', cw.ink);
      const open = () => ctx.onOpen(art, tiles[0].cw);
      onOpenClick(el, open); // a native button: Enter and Space fire click
      try { if (G.document.fonts && G.document.fonts.ready) await G.document.fonts.ready; } catch (_) { /* noop */ }
      if (my !== gen) return;
      const ink = Ink();
      const p = ink.fillWord(el, word, { id: art.id, svg }, { fit: true, max: 290, colorway: cw, hold: animates(animate) });
      if (animates(animate)) plotIn(el, { delay: 160, duration: 2000, style: animStyle(ctx.prefs()) });
      await p;
    };

    const buildBand = async (word, arts, animate, my) => {
      const art = arts[0];
      const svg = await art.getSvg().catch(() => '');
      if (my !== gen) return;
      const cw = cwFor(art, ctx.colorwaysFor([art])[0]);
      const prefs = ctx.prefs();
      const band = h('div', { class: 'sp-pf', 'data-live-hook': 'band-3d', role: 'group', 'aria-label': `Cover band: ${art.name.replace(/\.vectura$/, '')}` });
      const text = h('div', { class: 'sp-pf-in' });
      const eyebrow = h('div', { class: 'sp-pf-eyebrow', text: prefs.showName ? 'Studio of' : 'Set in your work' });
      text.append(eyebrow);
      const slot = h('div', { class: 'sp-pf-who' });
      text.append(slot);
      const tools = h('button', { type: 'button', class: 'sp-pf-cap' },
        h('i', { class: 'sp-sw2' }), h('span', {}, 'Cover · ', h('b', { text: art.name.replace(/\.vectura$/, '') })), h('em', { text: art.algorithm || '' }));
      stage.append(band);
      const t = { el: band, art, cw, k: 0, kind: 'tile' };
      tiles.push(t);
      band.append(text, tools);
      tools.querySelector('.sp-sw2').style.setProperty('--p', cw.paper); tools.querySelector('.sp-sw2').style.setProperty('--i', cw.ink);
      onOpenClick(tools, () => ctx.onOpen(art, tiles[0].cw));
      const style = band.style;
      style.setProperty('--sp-text', cw.textInk || cw.ink);
      // A 3D piece is a live, drag-to-rotate model on the right of the band (the same place the drawing sits).
      const model = Vectura.StartPageMotion ? Vectura.StartPageMotion.modelFor(art) : null;
      const O3 = Vectura.StartPageOrbit3D;
      if (model && O3) {
        const host3d = h('div', { class: 'sp-pf-3d' });
        band.dataset.live = '3d';
        band.append(host3d);
        const paint = (c) => { band.style.background = c.paper; band.style.setProperty('--sp-paper', c.paper); band.style.setProperty('--sp-ink', c.ink); };
        paint(cw);
        const o3 = O3.mount(host3d, { model, colorway: () => (tiles.find((x) => x.el === band) || t).cw, hint: 'Drag to rotate', paper: false, label: `${art.name.replace(/\.vectura$/, '')}, ${art.algorithm || 'Piece'}` });
        band._sp3d = { setColorway(c) { paint(c); o3.setColorway(() => c); }, destroy() { o3.destroy(); } };
        setCwData(t);
        band.append(h('div', { class: 'sp-pf-fade', 'aria-hidden': 'true' }), text, tools);
        return Promise.resolve();
      }
      const p = Ink().mount(band, { id: art.id, svg }, { colorway: cw, fit: 'cover', pad: 0, label: false, frame: (override && override.art.id === art.id && override.frame && override.frame.fit !== 'contain') ? override.frame : null, fill: (override && override.art.id === art.id && override.fill) || null });
      setCwData(t);
      // Text rides above the art layer: mount() appended the art box last, so lift the overlay content. The fade
      // that lets the art dissolve under the text is a gradient overlay element (never a CSS mask on the art).
      band.append(h('div', { class: 'sp-pf-fade', 'aria-hidden': 'true' }), text, tools);
      return p.then(() => { if (animates(animate)) { plotIn(band, { delay: 120, duration: 1800, style: animStyle(ctx.prefs()) }); } });
    };

    const buildEmpty = (word) => {
      const word0 = h('div', { class: 'sp-cover-empty' },
        h('h1', { class: 'sp-cover-empty-word', text: word }),
        h('p', { text: 'Open or save a file and its art fills these letters. Until then the cover waits here.' }));
      stage.append(word0);
    };

    /* -------------------------------------------------------------- name + practice line (click to edit) */
    const editable = ({ tag, cls, key, placeholder, label, max }) => {
      const wrap = h(tag, { class: `${cls} sp-editable` });
      const renderBtn = (focus) => {
        wrap.textContent = '';
        const val = ctx.prefs()[key];
        const btn = h('button', { type: 'button', class: `sp-edit-btn${val ? '' : ' is-placeholder'}`, 'aria-label': `Edit ${label}`, title: `Click to edit ${label}`, text: val || placeholder });
        btn.addEventListener('click', edit);
        wrap.append(btn);
        if (focus) btn.focus();
      };
      const edit = () => {
        const input = h('input', { type: 'text', class: 'sp-edit-input', maxlength: String(max), 'aria-label': label, placeholder, value: ctx.prefs()[key] || '', autocomplete: 'off', spellcheck: 'false' });
        let done = false;
        const finish = (save, focus) => {
          if (done) return;
          done = true;
          if (save) ctx.onPref(key, input.value);
          renderBtn(focus);
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true, true); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false, true); }
          else e.stopPropagation();
        });
        input.addEventListener('blur', () => finish(true, false));
        wrap.textContent = '';
        wrap.append(input);
        input.focus();
        input.select();
      };
      renderBtn(false);
      return wrap;
    };
    const identityEls = () => {
      const p = ctx.prefs();
      const max = Vectura.START_PAGE?.LIMITS?.textMax || { name: 60, practiceLine: 120 };
      const els = [];
      if (p.showName) els.push(editable({ tag: 'h1', cls: 'sp-name', key: 'name', placeholder: 'Add Your Name', label: 'your name', max: max.name }));
      if (p.showLine) els.push(editable({ tag: 'p', cls: 'sp-line-text', key: 'practiceLine', placeholder: 'Add a line about your practice', label: 'the line about your practice', max: max.practiceLine }));
      return els;
    };
    const renderWho = (style) => {
      who.textContent = '';
      const els = identityEls();
      if (style === 'band') {
        const slot = stage.querySelector('.sp-pf:not(.sp-pf-old) .sp-pf-who');
        if (slot) els.forEach((e) => slot.append(e)); // band: name + line sit over the art
        return;
      }
      els.forEach((e) => who.append(e));
    };

    /* -------------------------------------------------------------- render */
    const renderInfo = (style, arts, word, usingPicks) => {
      const named = ['last-name', 'first-last'].includes(ctx.prefs().coverWord);
      kick.textContent = style === 'band' ? 'Cover' : named ? 'Studio of' : 'Set in your work';
      if (!arts.length) { info.textContent = 'Nothing to set yet'; return; }
      if (style === 'mosaic') {
        const n = Words().letters(word).length;
        info.textContent = '';
        info.append(usingPicks ? 'Set in pieces from the Vectura studio until you make your own' : 'Each letter carries one of your pieces · ', usingPicks ? '' : h('b', { text: String(n) }), usingPicks ? '' : ' letters');
      } else if (style === 'word') {
        info.textContent = '';
        info.append(`Cover word · filled with `, h('b', { text: arts[0].name.replace(/\.vectura$/, '') }));
      } else {
        info.textContent = '';
        info.append(h('b', { text: arts[0].name.replace(/\.vectura$/, '') }), ` · ${arts[0].algorithm || 'Piece'}`);
      }
    };

    // onMounted: called once the letters / word are laid out (outlines set, pieces still arriving), so the page can reveal.
    let mountedCb = null;
    let builtSig = null; // what the mounted letters were built from (see the keep path in render)
    const signalMounted = () => { const f = mountedCb; mountedCb = null; if (f) { try { f(); } catch (_) { /* noop */ } } };
    const render = async ({ animate = false, onMounted = null } = {}) => {
      const my = ++gen;
      mountedCb = onMounted;
      const prefs = ctx.prefs();
      const { word } = Words().resolve(prefs);
      const style = ['mosaic', 'word', 'band'].includes(prefs.coverStyle) ? prefs.coverStyle : 'mosaic';
      host.dataset.style = style;
      picker.sync();
      let arts = [];
      try { arts = await ctx.arts(); } catch (_) { arts = []; }
      if (my !== gen) return;
      if (override) arts = [override.art, ...arts.filter((a) => a.id !== override.art.id)];
      const usingPicks = arts.length > 0 && arts.every((a) => a.kind === 'pick');
      // Same inputs as the letters on screen (word, style, pieces, chosen cover): nothing is torn down. The mounted letters
      // stay exactly as they are (a re-render must never blank or re-plot them); only colors that changed are re-applied.
      const sig = [style, word, arts.map((a) => a.id).join('|'), override ? `${override.art.id}${JSON.stringify([override.frame, override.fill])}` : ''].join('~');
      if (!animate && style === 'mosaic' && builtSig === sig && tiles.length && tiles.every((t) => t.el.isConnected)) {
        const cws = ctx.colorwaysFor(tiles.map((t) => t.art));
        if (override && override.colorway && cws.length) cws[0] = override.colorway;
        if (override && cws.length) cws[0] = withFill(tiles[0].art, cws[0]);
        tiles.forEach((t, i) => {
          if (!cws[i] || (cws[i].key === t.cw.key && cws[i].paper === t.cw.paper && cws[i].ink === t.cw.ink)) return;
          t.cw = cws[i];
          const handle = t.el._spWord;
          if (handle && handle.setColorway) handle.setColorway(t.cw);
          setCwData(t);
        });
        renderInfo(style, arts, word, usingPicks);
        renderWho(style);
        syncFanBtn();
        signalMounted();
        return;
      }
      builtSig = null;
      teardown();
      renderInfo(style, arts, word, usingPicks);
      fanTile = 0;
      if (!arts.length) {
        fanBtn.hidden = true;
        buildEmpty(word);
        renderWho(style);
        signalMounted();
        return;
      }
      if (style === 'mosaic') await buildMosaic(word, arts, animate, my);
      else if (style === 'word') await buildSpecimen(word, arts, animate, my);
      else await buildBand(word, arts, animate, my);
      if (my !== gen) return;
      builtSig = sig;
      signalMounted();
      renderWho(style);
      syncFanBtn();
      if (style === 'band') { const slot = stage.querySelector('.sp-pf:not(.sp-pf-old) .sp-pf-who'); if (slot && !slot.childNodes.length && !prefs.showName) slot.append(h('h1', { class: 'sp-cv-word', text: word })); }
    };

    const recolor = () => {
      if (!tiles.length) return [];
      if (override) override.colorway = null; // the page mode owns the colors again
      const cws = ctx.colorwaysFor(tiles.map((t) => t.art));
      tiles.forEach((t, i) => {
        t.cw = withFill(t.art, cws[i]);
        const handle = t.el._spWord || t.el._spInk || t.el._sp3d;
        if (handle && handle.setColorway) handle.setColorway(t.cw);
        setCwData(t);
      });
      stage.querySelectorAll('.sp-kk').forEach((k) => {
        const t = tiles.find((x) => String(x.k) === k.dataset.k);
        if (t) { k.style.setProperty('--p', t.cw.paper); k.style.setProperty('--i', t.cw.ink); }
      });
      stage.querySelectorAll('.sp-xc-cap .sp-sw2, .sp-pf-cap .sp-sw2').forEach((s) => { s.style.setProperty('--p', tiles[0].cw.paper); s.style.setProperty('--i', tiles[0].cw.ink); });
      const band = stage.querySelector('.sp-pf:not(.sp-pf-old)');
      if (band) band.style.setProperty('--sp-text', tiles[0].cw.textInk || tiles[0].cw.ink);
      return cws;
    };

    const refit = () => {
      if (host.dataset.style === 'mosaic') { fitMosaic(); later(renderKey, 220); }
      tiles.forEach((t) => { const hd = t.el._spWord; if (hd && hd.refit) hd.refit(); });
    };

    /* -------------------------------------------------------------- use as cover */
    const scrollParent = () => {
      let node = host.parentElement;
      while (node && node !== document.body && node !== document.documentElement) {
        let oy = '';
        try { oy = G.getComputedStyle(node).overflowY; } catch (_) { /* noop */ }
        if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node;
        node = node.parentElement;
      }
      return null;
    };
    const scrollToTop = () => new Promise((resolve) => {
      const sc = scrollParent();
      const pos = () => (sc ? sc.scrollTop : (G.scrollY || G.pageYOffset || 0));
      if (pos() < 4) { resolve(); return; }
      const opt = { top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' };
      try { if (sc) sc.scrollTo(opt); else G.scrollTo(opt); } catch (_) { if (sc) sc.scrollTop = 0; }
      const t0 = Date.now();
      const poll = () => { if (pos() < 4 || Date.now() - t0 > 1400) setTimeout(resolve, 80); else setTimeout(poll, 30); };
      poll();
    });
    const toast = (message, onUndo) => {
      const T = Vectura.UI && Vectura.UI.overlays && Vectura.UI.overlays.Toast;
      if (!T || typeof T.show !== 'function') return null;
      try { return T.show({ message, variant: 'info', duration: 8000, action: { label: 'Undo', ariaLabel: 'Undo use as cover', onAction: () => onUndo() } }); } catch (_) { return null; }
    };
    // Re-render for a changed cover piece. A band cross-fades: the old band stays (absolute, on top) until the new one is mounted.
    const swapCover = async (animate) => {
      const style = host.dataset.style;
      const old = style === 'band' ? stage.querySelector('.sp-pf') : null;
      const oldTile = old && tiles.find((t) => t.el === old);
      const fade = !!(old && oldTile && animates(animate));
      if (fade) {
        const r = old.getBoundingClientRect();
        if (G.getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
        old.classList.add('sp-pf-old');
        old.style.width = `${r.width}px`; old.style.height = `${r.height}px`;
        hold = { old, tile: oldTile };
      }
      try { await render({ animate }); } finally { hold = null; }
      if (fade) {
        void old.offsetWidth;
        old.style.opacity = '0';
        later(() => { try { Ink() && Ink().unmount(old); } catch (_) { /* noop */ } if (old._sp3d) { try { old._sp3d.destroy(); } catch (_) { /* noop */ } } old.remove(); stage.style.position = ''; }, 460);
      }
    };
    const useAsCover = async (art, o = {}) => {
      if (!art) return false;
      const prev = override;
      await scrollToTop();
      override = { art, colorway: o.colorway || null, frame: o.frame || null, fill: o.fill || null };
      if (ctx.onCover) ctx.onCover(override);
      await swapCover(true);
      const style = host.dataset.style;
      if (style === 'mosaic' && tiles[0] && tiles[0].el.parentNode && tiles[0].el.parentNode.classList) {
        const lt = tiles[0].el.parentNode;
        lt.classList.add('sp-lt-new');
        later(() => lt.classList.remove('sp-lt-new'), 1600);
      }
      const nm = `\u201c${String(art.name || 'Piece').replace(/\.vectura$/, '')}\u201d`;
      const where = style === 'mosaic' ? 'now leads the cover word, on its first letter' : style === 'word' ? 'now fills the cover word' : 'is now the cover';
      const undo = async () => { override = prev; if (ctx.onCover) ctx.onCover(prev); await swapCover(false); };
      toast(`${nm} ${where}.`, undo);
      return { art, undo };
    };

    const destroy = () => { gen++; teardown(); };

    return {
      render, recolor, refit, destroy,
      tiles: () => tiles.map((t) => ({ el: t.el, art: t.art, cw: t.cw, k: t.k })),
      words: picker,
      syncWho: () => renderWho(host.dataset.style),
      useAsCover,
      /** Restore a saved cover piece without animating (the next render() shows it). */
      setOverride: (o) => { override = o && o.art ? { art: o.art, colorway: null, frame: o.frame || null, fill: o.fill || null } : null; },
      coverOverride: () => (override ? { ...override } : null),
    };
  };

  UI.StartPageCover = { create };
})();
