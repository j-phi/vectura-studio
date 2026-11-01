/**
 * Start Page cover art controls — window.Vectura.UI.StartPageCoverArtControls. Lives in Start Page settings > Cover (the gear),
 * under "Cover style": which piece and which colorway each part of the cover uses, for every cover style.
 *   mosaic (Name in Ink) = one row per letter · word (Cover Specimen) and band (Portfolio band) = one row.
 * Each row: a piece select (Automatic · Your pieces · Templates) and a colorway radiogroup of swatches (page colorway first).
 * The caller owns state; this renders and reports.
 *   create({ host, style(), slots(), arts(), colorOptions(slot), onArt(style, k, id), onColor(style, k, cw|null), onReset(style) })
 *     -> { sync, el }
 *   slots() -> [{ k, ch, art, cw, chosenId, chosenCw }]: chosenId '' = automatic, chosenCw null = follows the page colorway.
 *   arts() -> Promise<Art[]> (works first, then picks); colorOptions(slot) -> [{ id, label, cw }], the first has id 'page'.
 * sync() is cheap and idempotent: rows rebuild only when the style, slots or lists change, otherwise only values update.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const HELP = {
    mosaic: 'Pick a piece and a colorway for each letter.',
    word: 'The piece that fills the cover word, and its colorway.',
    band: 'The piece in the band, and its colorway.',
  };
  const EMPTY = 'Save or open a piece and it can go on the cover.';
  const nameOf = (a) => String((a && a.name) || 'Untitled').replace(/\.vectura$/, '');

  const create = ({ host, style, slots, arts, colorOptions, onArt, onColor, onReset }) => {
    const { h } = Vectura.StartPageDom;
    const help = h('p', { class: 'sp-set-help sp-cvart-help' });
    const list = h('div', { class: 'sp-cvart-list' });
    const empty = h('p', { class: 'sp-set-help sp-cvart-empty', text: EMPTY, hidden: true });
    const reset = h('button', { type: 'button', class: 'sp-set-btn sp-cvart-reset', 'data-act': 'reset-cover-art', text: 'Reset cover art', disabled: true });
    const el = h('div', { class: 'sp-cvart' }, help, list, empty, h('div', { class: 'sp-cvart-foot' }, reset));
    host.append(el);

    let artList = [];
    let artSig = '';
    let rowSig = null;
    let pending = false;
    let rows = []; // { k, sel, group, opts: [{ id, cw, btn }] }

    const swatchMatches = (opt, cw) => !!cw && (opt.cw.key === cw.key);
    const checkedId = (slot, opts) => {
      const cw = slot.chosenCw;
      if (!cw) return 'page';
      const byKey = opts.find((o) => o.id !== 'page' && swatchMatches(o, cw));
      if (byKey) return byKey.id;
      const byColor = opts.find((o) => o.id !== 'page' && o.cw && o.cw.paper === cw.paper && o.cw.ink === cw.ink);
      return byColor ? byColor.id : '';
    };

    const fillSelect = (sel) => {
      sel.textContent = '';
      sel.append(h('option', { value: '', text: 'Automatic' }));
      const works = artList.filter((a) => a.kind === 'work');
      const picks = artList.filter((a) => a.kind === 'pick');
      const opt = (a) => h('option', { value: a.id, text: nameOf(a) });
      if (works.length) sel.append(h('optgroup', { label: 'Your pieces' }, works.map(opt)));
      if (picks.length) sel.append(h('optgroup', { label: 'Templates' }, picks.map(opt)));
    };

    const labels = (st, slot, n) => (st === 'mosaic'
      ? { row: `Letter ${n} · ${slot.ch}`, sel: `Piece for letter ${n}, ${slot.ch}`, grp: `Colorway for letter ${n}, ${slot.ch}` }
      : { row: 'Piece', sel: 'Cover piece', grp: 'Cover colorway' });

    const pickColor = (st, row, id) => {
      const o = row.opts.find((x) => x.id === id);
      if (!o) return;
      row.opts.forEach((x) => { x.btn.setAttribute('aria-checked', String(x === o)); x.btn.tabIndex = x === o ? 0 : -1; });
      onColor(st, row.k, id === 'page' ? null : o.cw);
    };

    const buildRow = (st, slot, n) => {
      const t = labels(st, slot, n);
      const sel = h('select', { class: 'sp-set-select sp-cvart-sel', 'data-cover-art-k': String(slot.k), 'aria-label': t.sel });
      fillSelect(sel);
      const group = h('div', { class: 'sp-cvart-cw', role: 'radiogroup', 'aria-label': t.grp });
      const row = { k: slot.k, sel, group, opts: [] };
      (colorOptions(slot) || []).forEach((o) => {
        const btn = h('button', { type: 'button', role: 'radio', class: 'sp-cvart-sw', 'data-cw-id': o.id, title: o.label, 'aria-checked': 'false', tabindex: '-1' },
          h('i', {}));
        const cw = o.cw || {};
        btn.style.setProperty('--p', cw.paper || 'transparent');
        btn.style.setProperty('--i', cw.ink || 'currentColor');
        row.opts.push({ id: o.id, label: o.label, cw: o.cw, btn });
        group.append(btn);
      });
      sel.addEventListener('change', () => onArt(style(), row.k, sel.value));
      group.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('.sp-cvart-sw');
        if (b) pickColor(style(), row, b.dataset.cwId);
      });
      group.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') return; // the popover closes on Esc
        const i = row.opts.findIndex((o) => o.btn === e.target);
        if (i < 0) return;
        let j = -1;
        const n2 = row.opts.length;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n2;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n2) % n2;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = n2 - 1;
        e.stopPropagation(); // never reach the popover's own style-radiogroup arrows
        if (j < 0) return;
        e.preventDefault();
        row.opts[j].btn.focus();
        pickColor(style(), row, row.opts[j].id);
      });
      const li = h('div', { class: 'sp-cvart-row' }, h('span', { class: 'sp-cvart-label', text: t.row }), sel, group);
      row.el = li;
      return { row, li };
    };

    const focusKey = () => {
      const a = G.document && G.document.activeElement;
      if (!a || !list.contains(a)) return null;
      const r = rows.find((x) => x.el.contains(a));
      if (!r) return null;
      return { k: r.k, kind: a === r.sel ? 'sel' : 'sw', id: a.dataset && a.dataset.cwId };
    };
    const refocus = (f) => {
      if (!f) return;
      const r = rows.find((x) => x.k === f.k);
      if (!r) return;
      const t = f.kind === 'sel' ? r.sel : (r.opts.find((o) => o.id === f.id) || {}).btn;
      if (t) t.focus();
    };

    const rebuild = (st, ss) => {
      const f = focusKey();
      list.textContent = '';
      rows = ss.map((s, i) => {
        const { row, li } = buildRow(st, s, i + 1);
        list.append(li);
        return row;
      });
      refocus(f);
    };

    const values = (ss) => {
      ss.forEach((s, i) => {
        const r = rows[i];
        if (!r) return;
        if (r.sel.value !== (s.chosenId || '')) r.sel.value = s.chosenId || '';
        const want = checkedId(s, r.opts);
        const stop = r.opts.find((o) => o.id === want) || r.opts[0];
        r.opts.forEach((o) => {
          o.btn.setAttribute('aria-checked', String(o.id === want));
          o.btn.tabIndex = o === stop ? 0 : -1;
        });
      });
      reset.disabled = !ss.some((s) => s.chosenId || s.chosenCw);
    };

    const refreshArts = () => {
      if (pending || typeof arts !== 'function') return;
      pending = true;
      Promise.resolve().then(arts).then((a) => {
        pending = false;
        const next = Array.isArray(a) ? a : [];
        const sig = next.map((x) => `${x.kind}:${x.id}:${nameOf(x)}`).join('|');
        if (sig !== artSig) { artSig = sig; artList = next; rowSig = null; sync(); }
      }).catch(() => { pending = false; });
    };

    const sync = () => {
      const st = style();
      const ss = slots() || [];
      help.textContent = HELP[st] || HELP.mosaic;
      empty.hidden = ss.length > 0;
      list.hidden = ss.length === 0;
      const sig = `${st}#${artSig}#${ss.map((s) => `${s.k}.${s.ch}.${(colorOptions(s) || []).map((o) => `${o.id}:${o.cw && o.cw.key}`).join(',')}`).join('|')}`;
      if (sig !== rowSig) { rowSig = sig; rebuild(st, ss); }
      values(ss);
      refreshArts();
    };

    reset.addEventListener('click', () => { if (!reset.disabled) onReset(style()); });

    sync();
    return { sync, el };
  };

  UI.StartPageCoverArtControls = { create };
})();
