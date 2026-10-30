/**
 * Start Page cover — window.Vectura.UI.StartPageCover. Three styles, art from the art provider:
 *   mosaic (Name in Ink, default): the word set huge, each letter a button filled with its own piece, plotted in
 *     letter by letter, with a key row (01 …) that names the piece on hover / focus;
 *   word (Cover Specimen): one piece fills the whole word;
 *   band (Portfolio band): a full-width band of one piece (static here; `data-live-hook` marks where the live 3D
 *     model mounts in P3).
 * Also the cover chrome: word picker button, info line, click-to-edit name and practice line, and the honest empty
 * state when there is no art yet. Recoloring (setColorway on every tile) never re-fits or re-plots.
 *
 *   create({ host, prefs(), arts(), colorwaysFor(arts), still(), onOpen(art, cw), onPref(key, value),
 *            onWordPick(id, custom?) }) -> { render({animate}), recolor(), refit(), tiles(), destroy(), words }
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const DRAW_MS = 1250;
  const reducedMotion = () => { try { return G.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };

  const create = (ctx) => {
    const { h, pad2 } = Vectura.StartPageDom;
    const Words = () => Vectura.StartPageCoverWords;
    const Ink = () => Vectura.StartPageInk;
    const host = ctx.host;
    let gen = 0;
    let tiles = []; // [{ el, art, cw, k, kind: 'word'|'tile' }]
    let timers = [];
    let ro = null;
    let lastW = 0;
    let editors = [];

    const top = h('div', { class: 'sp-cv-top' });
    const pickBtn = h('button', { type: 'button', id: 'sp-word-btn', class: 'sp-word-btn', 'aria-label': 'Choose the cover word', title: 'Choose the cover word', html: Vectura.StartPageIcons.pencil });
    const kick = h('span', { class: 'sp-cv-kick-tx', id: 'sp-cv-kick' });
    const info = h('span', { class: 'sp-cv-info', id: 'sp-cv-info' });
    top.append(h('span', { class: 'sp-cv-kick' }, pickBtn, kick), info);
    const stage = h('div', { class: 'sp-cv-stage', id: 'sp-cv-stage' });
    const who = h('div', { class: 'sp-cv-who', id: 'sp-cv-who' });
    host.append(top, stage, who);

    const picker = UI.StartPageWordPicker.create({
      button: pickBtn, prefs: ctx.prefs,
      onPick: (id, custom) => ctx.onWordPick(id, custom),
    });

    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const clearTimers = () => { timers.forEach((t) => clearTimeout(t)); timers = []; };

    const teardown = () => {
      clearTimers();
      if (ro) { ro.disconnect(); ro = null; }
      editors.forEach((e) => e.destroy && e.destroy());
      editors = [];
      const ink = Ink();
      tiles.forEach((t) => { try { ink && ink.unmount(t.el); } catch (_) { /* noop */ } });
      tiles = [];
      stage.textContent = '';
    };

    const setCwData = (t) => {
      t.el.dataset.spPaper = t.cw.paper;
      t.el.dataset.spInk = t.cw.ink;
      if (t.cw.ink2) t.el.dataset.spInk2 = t.cw.ink2; else delete t.el.dataset.spInk2;
      t.el.dataset.artId = t.art.id;
    };

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
    const plotIn = (el, { delay = 0, duration = DRAW_MS, style = 'plot' } = {}) => {
      const ink = Ink();
      if (!ink || ink.isStill()) return;
      el.classList.add('sp-pre');
      later(() => {
        ink.drawIn(el, { style, duration });
        let n = 0;
        const reveal = () => { if (++n < 3) G.requestAnimationFrame(reveal); else el.classList.remove('sp-pre'); };
        G.requestAnimationFrame(reveal);
      }, delay);
      later(() => el.classList.remove('sp-pre'), delay + 400); // never leave a letter hidden
    };
    const animates = (animate) => animate && !ctx.still() && !reducedMotion();

    /* -------------------------------------------------------------- styles */
    const buildMosaic = async (word, arts, animate, my) => {
      const chars = Words().letters(word);
      const assigned = Words().assignArts(chars.map((l) => l.ch), arts);
      const svgs = await Promise.all(assigned.map((a) => a.getSvg().catch(() => '')));
      if (my !== gen) return;
      const cws = ctx.colorwaysFor(assigned);
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
            tiles.push({ el: vw, art: a, cw: cws[i], k: i, kind: 'word', svg: svgs[i], ch });
            return btn;
          })),
          h('div', { class: 'sp-key-row', 'aria-hidden': 'true' })))));
      const wrap = stage.querySelector('.sp-word-wrap');
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('.sp-lt');
        if (!b) return;
        const t = tiles.find((x) => x.k === Number(b.dataset.k));
        if (t) ctx.onOpen(t.art, t.cw);
      });
      const over = (e) => { const b = e.target.closest && e.target.closest('.sp-lt'); if (b) showKey(Number(b.dataset.k)); };
      wrap.addEventListener('pointerover', over);
      wrap.addEventListener('focusin', over);
      wrap.addEventListener('pointerleave', hideKey);
      wrap.addEventListener('focusout', (e) => { if (!wrap.contains(e.relatedTarget)) hideKey(); });
      try { if (G.document.fonts && G.document.fonts.ready) await G.document.fonts.ready; } catch (_) { /* noop */ }
      if (my !== gen) return;
      fitMosaic();
      const ink = Ink();
      const style = ctx.prefs().animateIn || 'plot';
      const fills = tiles.map((t) => {
        setCwData(t);
        return ink.fillWord(t.el, t.ch, { id: t.art.id, svg: t.svg }, { fit: false, colorway: t.cw });
      });
      if (animates(animate)) tiles.forEach((t, j) => plotIn(t.el, { delay: 260 + j * (tiles.length > 9 ? 110 : 170), style }));
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
      const cw = ctx.colorwaysFor([art])[0];
      const el = h('h1', { class: 'sp-xc-word', tabindex: '0', role: 'link', 'aria-label': `${word}, filled with ${art.name.replace(/\.vectura$/, '')}. Open the piece` }, word);
      const cap = h('div', { class: 'sp-xc-cap' }, h('i', { class: 'sp-sw2' }), h('span', {}, h('b', { text: art.name.replace(/\.vectura$/, '') }), ` · ${art.algorithm || 'Piece'}`));
      stage.append(el, cap);
      const t = { el, art, cw, k: 0, kind: 'word', svg, ch: word, cap };
      tiles.push(t); setCwData(t);
      cap.querySelector('.sp-sw2').style.setProperty('--p', cw.paper); cap.querySelector('.sp-sw2').style.setProperty('--i', cw.ink);
      const open = () => ctx.onOpen(art, tiles[0].cw);
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      try { if (G.document.fonts && G.document.fonts.ready) await G.document.fonts.ready; } catch (_) { /* noop */ }
      if (my !== gen) return;
      const ink = Ink();
      const p = ink.fillWord(el, word, { id: art.id, svg }, { fit: true, max: 290, colorway: cw });
      if (animates(animate)) plotIn(el, { delay: 160, duration: 2000, style: ctx.prefs().animateIn || 'plot' });
      await p;
    };

    const buildBand = async (word, arts, animate, my) => {
      const art = arts[0];
      const svg = await art.getSvg().catch(() => '');
      if (my !== gen) return;
      const cw = ctx.colorwaysFor([art])[0];
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
      tools.addEventListener('click', () => ctx.onOpen(art, tiles[0].cw));
      const style = band.style;
      style.setProperty('--sp-text', cw.textInk || cw.ink);
      const p = Ink().mount(band, { id: art.id, svg }, { colorway: cw, fit: 'cover', pad: 0, label: false });
      setCwData(t);
      // Text rides above the art layer: mount() appended the art box last, so lift the overlay content.
      band.append(text, tools);
      return p.then(() => { if (animates(animate)) { plotIn(band, { delay: 120, duration: 1800, style: ctx.prefs().animateIn || 'plot' }); } });
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
        const slot = stage.querySelector('.sp-pf-who');
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

    const render = async ({ animate = false } = {}) => {
      const my = ++gen;
      teardown();
      const prefs = ctx.prefs();
      const { word } = Words().resolve(prefs);
      const style = ['mosaic', 'word', 'band'].includes(prefs.coverStyle) ? prefs.coverStyle : 'mosaic';
      host.dataset.style = style;
      picker.sync();
      let arts = [];
      try { arts = await ctx.arts(); } catch (_) { arts = []; }
      if (my !== gen) return;
      const usingPicks = arts.length > 0 && arts.every((a) => a.kind === 'pick');
      renderInfo(style, arts, word, usingPicks);
      if (!arts.length) {
        buildEmpty(word);
        renderWho(style);
        return;
      }
      if (style === 'mosaic') await buildMosaic(word, arts, animate, my);
      else if (style === 'word') await buildSpecimen(word, arts, animate, my);
      else await buildBand(word, arts, animate, my);
      if (my !== gen) return;
      renderWho(style);
      if (style === 'band') { const slot = stage.querySelector('.sp-pf-who'); if (slot && !slot.childNodes.length && !prefs.showName) slot.append(h('h1', { class: 'sp-cv-word', text: word })); }
    };

    const recolor = () => {
      if (!tiles.length) return [];
      const cws = ctx.colorwaysFor(tiles.map((t) => t.art));
      tiles.forEach((t, i) => {
        t.cw = cws[i];
        const handle = t.el._spWord || t.el._spInk;
        if (handle && handle.setColorway) handle.setColorway(t.cw);
        setCwData(t);
      });
      stage.querySelectorAll('.sp-kk').forEach((k) => {
        const t = tiles.find((x) => String(x.k) === k.dataset.k);
        if (t) { k.style.setProperty('--p', t.cw.paper); k.style.setProperty('--i', t.cw.ink); }
      });
      stage.querySelectorAll('.sp-xc-cap .sp-sw2, .sp-pf-cap .sp-sw2').forEach((s) => { s.style.setProperty('--p', tiles[0].cw.paper); s.style.setProperty('--i', tiles[0].cw.ink); });
      const band = stage.querySelector('.sp-pf');
      if (band) band.style.setProperty('--sp-text', tiles[0].cw.textInk || tiles[0].cw.ink);
      return cws;
    };

    const refit = () => {
      if (host.dataset.style === 'mosaic') { fitMosaic(); later(renderKey, 220); }
      tiles.forEach((t) => { const hd = t.el._spWord; if (hd && hd.refit) hd.refit(); });
    };

    const destroy = () => { gen++; teardown(); };

    return {
      render, recolor, refit, destroy,
      tiles: () => tiles.map((t) => ({ el: t.el, art: t.art, cw: t.cw, k: t.k })),
      words: picker,
      syncWho: () => renderWho(host.dataset.style),
    };
  };

  UI.StartPageCover = { create };
})();
