/**
 * Start Page plate editor — window.Vectura.StartPagePlateEditor.
 *
 * The inline editor of one plate: words (with suggestion chips), the 16-way layout radiogroup, the grouped colorway
 * picker, manual colors (Artwork / Text / Background with special fills; Basic shows Ink only), contrast warnings,
 * rhythm advice, art framing (drag / wheel / pinch / keyboard, Fit / Fill, 50–400 % slider, Reset), per-plate motion,
 * Reset plate and Remove plate. Keyboard accessible; Done or Esc closes and returns focus to the opener.
 *
 *   open(plateEl, { record, art, mode, index, colorway, placed, specs?, orientation?, onChange(patch), onReset(keys),
 *                   onRemove(), onClose() }) -> { close(), update(record) }
 *     record     a StartPagePlatesStore record; art { id, name, algorithm, collection, svg, model?, ownColors }
 *     colorway   the rhythm-placed colorway of this plate; placed = StartPagePlateRhythm.place(...) output of the page
 *     specs      [[label, value]] of the plate (Paper, Pen, Stock, Line, Strokes, Plot time ...), used for suggestions
 *     onChange   called with a store patch for EVERY change ({ layout }, { texts: { word } }, { pin }, { colors: { art } },
 *                { basicColors: { ink } }, { frame }, { motion: { hover } } ...), also for Undo (the previous value as a patch)
 *     onReset    called with the keys to reset; Undo patches every key back through onChange
 *   close() / update(record) / setPlate(newPlateEl) (after the section re-renders the plate for a new layout).
 *   The editor previews live on the rendered plate (StartPagePlateColors.apply + the art handle's setFrame); the section
 *   re-applies the same values from the store, which is idempotent. The panel is inserted right after plateEl.
 *   Undo toasts use Vectura.UI.overlays.Toast.show with an action.
 */
(() => {
  const W = typeof window !== 'undefined' ? window : globalThis;
  const D = W.document;
  const Vectura = W.Vectura = W.Vectura || {};

  const LAYOUT_GLYPHS = {
    'vertical-word': '<rect x="5" y="3" width="3" height="24" fill="currentColor" opacity=".5"/><rect x="13" y="4" width="26" height="22" rx="1"/><path d="M44 9h12M44 14h12M44 19h8"/>',
    'spec-sheet': '<rect x="19" y="5" width="22" height="20" rx="1"/><circle cx="30" cy="15" r="5"/><path d="M45 9h11M45 14h11M45 19h8M4 9h11M4 14h11"/>',
    'text-wrap': '<circle cx="14" cy="15" r="9" fill="currentColor" opacity=".35"/><path d="M28 7h28M28 12h28M28 17h28M28 22h20"/>',
    'waterfall': '<path d="M4 6h22M4 12h16M4 17h11M4 22h7" stroke-width="2.4"/><rect x="36" y="5" width="20" height="20" rx="1"/>',
    'knockout': '<rect x="6" y="5" width="48" height="12" fill="currentColor" opacity=".45"/><rect x="6" y="20" width="9" height="7"/><path d="M20 22h12M20 26h8"/>',
    'full-sheet': '<rect x="6" y="3" width="36" height="24" rx="1"/><path d="M47 9h9M47 14h9M47 19h7"/>',
    'full-bleed-band': '<rect x="3" y="3" width="54" height="16" fill="currentColor" opacity=".3"/><path d="M5 24h20M33 24h22"/>',
    'diptych': '<rect x="5" y="4" width="22" height="22" rx="1"/><path d="M33 8h22M33 13h22M33 18h14"/>',
    'specimen-frame': '<rect x="14" y="4" width="32" height="20" rx="1"/><rect x="18" y="8" width="24" height="12" opacity=".5"/><path d="M20 27h20"/>',
    'big-numeral': '<path d="M5 6h12v18H5z" stroke-width="2.4"/><rect x="34" y="5" width="21" height="20" rx="1"/>',
    'words-both-sides': '<rect x="4" y="3" width="3" height="24" fill="currentColor" opacity=".5"/><rect x="53" y="3" width="3" height="24" fill="currentColor" opacity=".5"/><rect x="14" y="4" width="32" height="22" rx="1"/>',
    'plot-stages': '<rect x="3" y="5" width="11" height="9"/><rect x="16" y="5" width="11" height="9"/><rect x="29" y="5" width="11" height="9"/><rect x="42" y="5" width="15" height="9" fill="currentColor" opacity=".35"/><path d="M4 21h40"/>',
    'knockout-title': '<rect x="4" y="3" width="52" height="16" opacity=".5"/><rect x="4" y="9" width="26" height="6" fill="currentColor" opacity=".6"/><path d="M5 24h24M36 24h19"/>',
    'detail-full': '<rect x="4" y="3" width="30" height="24" rx="1"/><rect x="40" y="4" width="16" height="12" rx="1"/><path d="M40 21h16M40 25h12"/>',
    'four-crops': '<rect x="4" y="3" width="11" height="11"/><rect x="17" y="3" width="11" height="11"/><rect x="4" y="16" width="11" height="11"/><rect x="17" y="16" width="11" height="11"/><path d="M36 9h20M36 14h20M36 19h14"/>',
    'pull-quote': '<path d="M5 7h26M5 12h22M5 17h24M5 24h12"/><rect x="38" y="4" width="18" height="22" rx="1"/>',
  };
  const LAYOUT_IDS = Object.keys(LAYOUT_GLYPHS);

  const AI_STYLES = [['plot', 'Plot'], ['sweep', 'Sweep'], ['fade', 'Fade up'], ['bleed', 'Ink bleed'], ['cascade', 'Stroke cascade'],
    ['scan', 'Scan lines'], ['iris', 'Iris'], ['none', 'None']];
  const HOVER_STYLES = [['none', 'None'], ['lift', 'Lift & tilt'], ['glare', 'Glare sweep'], ['replot', 'Re-plot'], ['hologram', 'Hologram foil'],
    ['ripple', 'Pressure ripple'], ['stipple', 'Stipple weather'], ['breeze', 'Paper breeze'], ['gravity', 'Gravity well'], ['current', 'Light current']];
  const GROUPS = [['light', 'Light papers'], ['ground', 'Color grounds'], ['dark', 'Darks']];
  const PARTS = [['art', 'Artwork'], ['text', 'Text'], ['background', 'Background']];
  const FIELDS_BY_MODE = {
    curated: ['layout', 'texts', 'pin', 'colors', 'frame', 'motion'],
    basic: ['layout', 'texts', 'basicColors', 'frame', 'motion'],
  };
  const ALL_FIELDS = ['layout', 'texts', 'pin', 'colors', 'basicColors', 'frame', 'motion'];
  const TEXT_FIELDS = [['word', 'Set word', 24, 'the vertical, waterfall, knockout and band words'], ['title', 'Title', 60, ''], ['description', 'Description', 320, 'suggested from the algorithm and the file']];

  /* ------------------------------------------------------------------ helpers */
  const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pad2 = (n) => String(n).padStart(2, '0');
  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  const h = (tag, attrs, ...kids) => {
    const n = D.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v; // developer-authored glyph markup only
      else n.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((c) => { if (c != null && c !== false) n.append(c.nodeType ? c : D.createTextNode(c)); });
    return n;
  };
  const merge = (base, patch) => {
    const out = isPlain(base) ? copy(base) : {};
    Object.keys(patch).forEach((k) => {
      const pv = patch[k];
      out[k] = isPlain(pv) && isPlain(out[k]) && !('fill' in pv) ? merge(out[k], pv) : copy(pv);
    });
    return out;
  };
  const SHAPE = { texts: { word: null, title: null, description: null }, colors: { art: null, text: null, background: null },
    basicColors: { ink: null }, frame: { fit: null, z: null, cx: null, cy: null }, motion: { animateIn: null, hover: null } };
  const applyLocal = (rec, patch) => {
    const next = copy(rec);
    Object.keys(patch).forEach((k) => {
      const pv = patch[k];
      if (isPlain(pv) && SHAPE[k]) next[k] = merge(isPlain(next[k]) ? next[k] : SHAPE[k], pv); else next[k] = copy(pv);
    });
    return next;
  };
  // The patch that puts the previous values back.
  const undoOf = (rec, patch) => {
    const u = {};
    Object.keys(patch).forEach((k) => {
      const pv = patch[k];
      if (isPlain(pv) && SHAPE[k] && k !== 'frame') {
        u[k] = {};
        Object.keys(pv).forEach((s) => { const prev = rec[k] && rec[k][s] !== undefined ? rec[k][s] : null; u[k][s] = copy(prev); });
      } else u[k] = rec[k] === undefined ? null : copy(rec[k]);
    });
    return u;
  };
  const pretty = (name) => String(name || '').replace(/\.vectura$/i, '').replace(/[-_]+/g, ' ').trim().replace(/\b[a-z]/g, (c) => c.toUpperCase());

  const T = () => Vectura.StartPagePlateType;
  const R = () => Vectura.StartPagePlateRhythm;
  const Colors = () => Vectura.StartPagePlateColors;
  const Fills = () => Vectura.StartPagePlateFills;
  const Store = () => Vectura.StartPagePlatesStore;
  const Geo = () => Vectura.StartPageArtGeometry;

  const toastApi = () => Vectura.UI && Vectura.UI.overlays && Vectura.UI.overlays.Toast;

  /* ------------------------------------------------------------------ suggestions */
  const specMap = (specs) => {
    const m = {};
    const list = T() ? T().normSpecs(specs) : [];
    list.forEach((s) => { m[String(s.label).toLowerCase()] = s.value; });
    return m;
  };
  const algoBaseOf = (art) => String((art && art.algorithm) || '').split(/[·,]/)[0].trim();
  const noteFor = (art) => {
    const D0 = Vectura.DESCRIPTIONS || {};
    const base = algoBaseOf(art).toLowerCase().replace(/[^a-z0-9]/g, '');
    const k = Object.keys(D0).find((x) => x.toLowerCase() === base) || Object.keys(D0).find((x) => base && (x.toLowerCase().includes(base) || base.includes(x.toLowerCase())));
    return k ? D0[k] : '';
  };
  const suggestionsFor = (art, specs, orientation) => {
    const sp = specMap(specs);
    const algo = algoBaseOf(art);
    const mirror = /mirror/i.test((art && art.algorithm) || '');
    const nice = pretty(art && art.name);
    const paper = (sp.paper || '').split(/\s*·\s*/)[0];
    const longest = nice.replace(/[‘’'.]/g, '').split(/\s+/).filter((w) => w.length > 2).sort((a, b) => b.length - a.length)[0];
    const uniq = (a) => Array.from(new Set(a.filter(Boolean)));
    const words = [['Algorithm', algo], mirror ? ['Modifier', 'Mirror'] : null, ['Title', longest], ['Collection', art && art.collection], ['Paper', paper]]
      .filter((x) => x && x[1]);
    const titles = uniq([nice, algo ? `${algo} study` : '', paper && nice ? `${nice}, ${paper}` : '']);
    const note = noteFor(art);
    const first = T() ? T().firstSentence(note) : note;
    const stats = sp.line && sp.strokes && sp['plot time'] ? ` The pen travels ${sp.line} in ${sp.strokes} strokes, about ${sp['plot time']} on the plotter.` : '';
    const where = [sp.paper && `Set on ${sp.paper}`, sp.pen && `in ${sp.pen}`, sp.stock && `on ${sp.stock}`].filter(Boolean).join(' ');
    const descs = uniq([
      note,
      first && stats ? `${first.replace(/\.$/, '')}.${stats}` : '',
      where ? `${where}.${sp['plot time'] ? ` Plot time ${sp['plot time']}.` : ''}` : '',
      `${nice}: ${algo}${mirror ? ' with the mirror modifier' : ''}, ${orientation} ${paper || 'sheet'}${sp.pen ? `, plated in ${sp.pen}` : ''}${sp.stock ? ` on ${sp.stock}` : ''}.`,
    ]);
    return { words, titles, descs, defaults: { word: algo, title: nice, description: descs[0] || '' } };
  };
  const orientationOf = (art, plateEl, given) => {
    if (given) return given;
    if (art && art.model) return '3d';
    if (plateEl && plateEl.dataset && plateEl.dataset.orientation) return plateEl.dataset.orientation;
    try {
      const vb = Geo().parseArtSvg(art.svg).vb; const r = vb[2] / vb[3];
      return r > 1.15 ? 'landscape' : r < 0.87 ? 'portrait' : 'square';
    } catch (e) { return 'landscape'; }
  };

  /* ------------------------------------------------------------------ palette swatches */
  const inkSwatches = () => {
    const seen = new Set(); const out = [];
    (Vectura.START_PAGE_PLATE_PALETTE || []).forEach((e) => [[e.ink, e.penName], [e.accent, e.penName]].forEach(([c, n]) => {
      const k = String(c).toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push([k, n]); }
    }));
    return out.slice(0, 30);
  };
  const groundSwatches = () => {
    const seen = new Set(); const out = [];
    (Vectura.START_PAGE_PLATE_PALETTE || []).forEach((e) => { const k = e.ground.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push([k, e.paperName]); } });
    return out.slice(0, 32);
  };

  /* ------------------------------------------------------------------ roving radiogroup */
  const roving = (group, itemSel, pick) => {
    group.addEventListener('keydown', (e) => {
      const items = Array.from(group.querySelectorAll(itemSel)).filter((n) => !n.disabled);
      const at = items.indexOf(e.target.closest(itemSel));
      if (at < 0) return;
      let to = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (at + 1) % items.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (at - 1 + items.length) % items.length;
      else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = items.length - 1;
      if (to < 0) return;
      e.preventDefault(); e.stopPropagation();
      items[to].focus();
      pick(items[to]);
    });
  };
  const setRadios = (items, isOn) => items.forEach((n) => { const on = isOn(n); n.setAttribute('aria-checked', String(on)); n.tabIndex = on ? 0 : -1; });
  const ensureTabStop = (items) => { if (items.length && !items.some((n) => n.tabIndex === 0)) items[0].tabIndex = 0; };

  /* ------------------------------------------------------------------ open */
  const open = (plateEl, o) => {
    o = o || {};
    if (!plateEl || !plateEl.parentNode) throw new Error('StartPagePlateEditor.open: plateEl must be in the document');
    const prior = plateEl.parentNode.querySelector(':scope > [data-plate-editor]');
    if (prior && prior._spe) prior._spe.close();

    const art = o.art || {};
    const mode = o.mode || 'curated';
    const index = o.index | 0;
    const placed = Array.isArray(o.placed) ? o.placed : [];
    const baseOpen = o.colorway || (placed[index] && placed[index].colorway) || {};
    const orientation = orientationOf(art, plateEl, o.orientation);
    const sug = suggestionsFor(art, o.specs, orientation);
    const editsColor = mode === 'curated' || mode === 'basic';
    const is3d = !!(art && art.model) || orientation === '3d';
    const restoreTo = D.activeElement && D.activeElement !== D.body ? D.activeElement : null;
    let rec = copy(o.record) || {};
    let closedFlag = false;
    let framing = false;
    let burst = null;
    let lastToast = null;
    let pending = null;      // text field waiting on the debounce
    let timer = 0;
    let descAt = 0;
    let preview = null;      // a live, uncommitted color { part, value }
    let framePreview = null; // a live, uncommitted frame
    const uid = `spe-${Math.random().toString(36).slice(2, 7)}`;

    const eff = () => {
      const S = Store();
      const e = S && S.effectiveFor ? S.effectiveFor(rec, mode) : rec;
      return e || {};
    };
    const colorsNow = () => {
      const e = eff();
      const c = mode === 'basic' ? { art: e.basicColors && e.basicColors.ink != null ? e.basicColors.ink : null } : copy(e.colors || {});
      if (preview) c[preview.part] = preview.value;
      return c;
    };
    const baseColorway = () => {
      const pin = mode === 'curated' ? rec.pin : null;
      const pal = Vectura.START_PAGE_PLATE_PALETTE || [];
      if (pin) { const e = pal.find((x) => x.id === pin); if (e) return e; }
      if (!pin && o.colorway && !(o.record && o.record.pin) ) return baseOpen;
      if (!pin && mode === 'curated' && R() && placed.length) {
        const fresh = R().place(placed.map((p) => ({ id: p.id })), { mode, theme: o.theme || (D.documentElement.dataset.theme) || 'dark', seed: o.seed });
        return (fresh[index] && fresh[index].colorway) || baseOpen;
      }
      return baseOpen;
    };
    const resolved = () => Colors().resolve(baseColorway(), colorsNow(), { still: false });

    /* ---- toast + commit ---- */
    const showToast = (message, undo) => {
      const Tt = toastApi();
      if (!Tt || typeof Tt.show !== 'function') return;
      try { if (lastToast && lastToast.dismiss) lastToast.dismiss(); } catch (e) { /* ignore */ }
      try {
        lastToast = Tt.show({ message, variant: 'info', duration: undo ? 8000 : 3500,
          ...(undo ? { action: { label: 'Undo', ariaLabel: `Undo: ${message}`, onAction: () => undo() } } : {}) });
      } catch (e) { lastToast = null; }
    };
    const commit = (patch, message, burstKey) => {
      let undo = undoOf(rec, patch);
      const now = Date.now();
      if (burstKey && burst && burst.key === burstKey && now - burst.t < 1200) undo = burst.undo; else if (burstKey) burst = { key: burstKey, undo, t: now };
      if (burstKey && burst) burst.t = now;
      rec = applyLocal(rec, patch);
      if (typeof o.onChange === 'function') o.onChange(copy(patch));
      showToast(message, () => {
        burst = null;
        rec = applyLocal(rec, undo);
        if (typeof o.onChange === 'function') o.onChange(copy(undo));
        syncAll();
      });
      syncAll();
    };

    /* ---- build ---- */
    const root = h('section', { class: 'spe', 'data-plate-editor': '', role: 'group', 'aria-label': `Edit plate ${pad2(index + 1)}: ${(eff().texts && eff().texts.title) || sug.defaults.title}`, tabindex: '-1' });
    const doneBtn = h('button', { type: 'button', class: 'spe-btn spe-btn-p', 'data-spe-done': '', text: 'Done' });
    root.appendChild(h('div', { class: 'spe-h' },
      h('b', { class: 'spe-h-t', text: `Edit plate ${pad2(index + 1)}` }),
      h('span', { class: 'spe-h-s', text: `${sug.defaults.title} · ${orientation} art · changes apply as you go` }),
      h('span', { class: 'spe-grow' }), doneBtn));
    const grid = h('div', { class: 'spe-grid' });
    root.appendChild(grid);
    const colA = h('div', { class: 'spe-col' }); const colB = h('div', { class: 'spe-col' });
    grid.append(colA, colB);

    const section = (col, id, title, hint, openIt) => {
      const body = h('div', { class: 'spe-sec-b' });
      const d = h('details', { class: 'spe-sec', 'data-spe-sec': id }, h('summary', { class: 'spe-sec-h' }, h('span', { class: 'spe-sec-t', text: title }), hint ? h('em', { text: hint }) : null), body);
      if (openIt) d.open = true;
      col.appendChild(d);
      return body;
    };

    /* words */
    const textBody = section(colA, 'words', 'Words', 'word, title and description', true);
    const inputs = {}; const chipHosts = {};
    TEXT_FIELDS.forEach(([f, label, max, hint]) => {
      const id = `${uid}-${f}`;
      const ctl = f === 'description'
        ? h('textarea', { id, 'data-spe-field': f, maxlength: String(max), rows: '3', class: 'spe-in' })
        : h('input', { id, type: 'text', 'data-spe-field': f, maxlength: String(max), class: 'spe-in', autocomplete: 'off', spellcheck: 'false' });
      inputs[f] = ctl;
      const chips = h('div', { class: 'spe-sugs', 'aria-label': `Suggested ${f === 'description' ? 'descriptions' : `${f}s`}` });
      chipHosts[f] = chips;
      textBody.appendChild(h('div', { class: 'spe-f' }, h('label', { class: 'spe-l', for: id }, label, hint ? h('em', { text: hint }) : null), ctl, chips));
      const flush = () => { if (pending === f) { pending = null; clearTimeout(timer); } commitText(f); };
      ctl.addEventListener('input', () => { pending = f; clearTimeout(timer); timer = setTimeout(() => { if (pending === f) { pending = null; commitText(f); } }, 320); });
      ctl.addEventListener('change', flush);
      ctl.addEventListener('blur', () => { if (pending === f) flush(); });
    });
    const suggestDesc = h('button', { type: 'button', class: 'spe-chip', 'data-spe-suggest-desc': '' }, h('span', { text: 'Suggest a description' }));
    chipHosts.description.appendChild(suggestDesc);
    const buildChips = () => {
      const cur = eff().texts || {};
      const fill = (f, list, kind) => {
        Array.from(chipHosts[f].querySelectorAll('[data-spe-sug]')).forEach((n) => n.remove());
        list.filter(([, v]) => v !== cur[f]).slice(0, f === 'word' ? 4 : 3).forEach(([k, v]) => {
          const b = h('button', { type: 'button', class: 'spe-chip', 'data-spe-sug': f, 'data-value': v }, h('span', { class: 'spe-chip-k', text: k }), h('span', { text: v }));
          chipHosts[f].insertBefore(b, chipHosts[f].firstChild);
        });
      };
      fill('word', sug.words, 'word');
      fill('title', sug.titles.map((v) => ['Title', v]), 'title');
    };
    const commitText = (f) => {
      const raw = inputs[f].value.trim();
      const v = raw === '' ? null : raw;
      const cur = (eff().texts && eff().texts[f]) != null ? eff().texts[f] : null;
      if (v === cur) { if (v === null) inputs[f].value = sug.defaults[f] || ''; return; }
      commit({ texts: { [f]: v } }, `Plate ${pad2(index + 1)} ${f === 'description' ? 'description' : f} ${v === null ? 'back to Auto' : 'updated'}.`, `text-${f}`);
    };
    textBody.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-spe-sug]');
      if (chip) { inputs[chip.dataset.speSug].value = chip.dataset.value; pending = null; commitText(chip.dataset.speSug); inputs[chip.dataset.speSug].focus(); return; }
      if (e.target.closest('[data-spe-suggest-desc]')) {
        if (!sug.descs.length) return;
        const cur = inputs.description.value.trim();
        let v = sug.descs[descAt % sug.descs.length]; descAt += 1;
        if (v === cur && sug.descs.length > 1) { v = sug.descs[descAt % sug.descs.length]; descAt += 1; }
        inputs.description.value = v; pending = null; commitText('description');
      }
    });

    /* layout */
    const layBody = section(colA, 'layout', 'Layout', '', true);
    const layHint = h('em', { class: 'spe-l-hint' });
    layBody.appendChild(h('span', { class: 'spe-l', id: `${uid}-lay` }, 'Layout ', layHint));
    const layGroup = h('div', { class: 'spe-lays', role: 'radiogroup', 'aria-label': 'Layout' });
    const layNames = {}; (T() ? T().LAYOUTS : []).forEach((l) => { layNames[l.id] = l.name; });
    const layBtns = LAYOUT_IDS.map((id) => {
      const b = h('button', { type: 'button', class: 'spe-lay', role: 'radio', 'data-layout': id, 'aria-checked': 'false', tabindex: '-1' },
        h('span', { class: 'spe-lay-g', 'aria-hidden': 'true', html: `<svg viewBox="0 0 60 30" focusable="false" fill="none" stroke="currentColor" stroke-width="1.4">${LAYOUT_GLYPHS[id]}</svg>` }),
        h('span', { class: 'spe-lay-n', text: layNames[id] || id }));
      return b;
    });
    layBtns.forEach((b) => layGroup.appendChild(b));
    layBody.appendChild(layGroup);
    const layChips = h('div', { class: 'spe-sugs spe-lay-sugs' });
    layBody.appendChild(layChips);
    const pickLayout = (id) => {
      if (id === (eff().layout || suggestedLayout()) && eff().layout === id) return;
      commit({ layout: id }, `Plate ${pad2(index + 1)} set as ${(layNames[id] || id).toLowerCase()}.`, 'layout');
    };
    layGroup.addEventListener('click', (e) => { const b = e.target.closest('[data-layout]'); if (b) pickLayout(b.dataset.layout); });
    roving(layGroup, '[data-layout]', (b) => pickLayout(b.dataset.layout));
    layChips.addEventListener('click', (e) => { const b = e.target.closest('[data-spe-sug-layout]'); if (b) pickLayout(b.dataset.layout); });
    const suggestions = () => (R() ? R().suggestLayouts(resolved().colorway.class, orientation) : []);
    const suggestedLayout = () => suggestions()[0] || LAYOUT_IDS[0];

    /* colorway picker (Curated) */
    let palBody = null; let palGroup = null;
    const pinBtns = [];
    if (mode === 'curated') {
      palBody = section(colB, 'colorway', 'Colorway', `${(Vectura.START_PAGE_PLATE_PALETTE || []).length} named plate colorways · Auto follows the page rhythm`, true);
      palGroup = h('div', { class: 'spe-pal', role: 'radiogroup', 'aria-label': 'Colorway' });
      const top = h('div', { class: 'spe-pal-top' });
      const autoB = h('button', { type: 'button', class: 'spe-pchip', role: 'radio', 'data-pin': '', 'aria-checked': 'false', tabindex: '-1' }, h('i', { class: 'spe-sw-auto' }), h('span', { text: 'Auto · rhythm' }));
      const ownB = h('button', { type: 'button', class: 'spe-pchip', role: 'radio', 'data-pin': 'own', 'aria-checked': 'false', tabindex: '-1' }, h('i', { class: 'spe-sw-own' }), h('span', { text: "The file's own colors" }));
      top.append(autoB, ownB); palGroup.appendChild(top); pinBtns.push(autoB, ownB);
      GROUPS.forEach(([cls, name]) => {
        const wrap = h('div', { class: 'spe-pal-g', 'data-spe-pal-group': cls }, h('span', { class: 'spe-pal-gl', text: name }));
        const sw = h('div', { class: 'spe-pal-sw' });
        (Vectura.START_PAGE_PLATE_PALETTE || []).filter((e) => e.class === cls).forEach((e) => {
          const b = h('button', { type: 'button', class: 'spe-swb', role: 'radio', 'data-pin': e.id, 'aria-checked': 'false', tabindex: '-1', 'aria-label': `${e.penName} on ${e.paperName}`, title: `${e.penName} on ${e.paperName}`, style: `--g:${e.ground};--i:${e.ink}` });
          sw.appendChild(b); pinBtns.push(b);
        });
        wrap.appendChild(sw); palGroup.appendChild(wrap);
      });
      palBody.appendChild(palGroup);
      palBody.appendChild(h('div', { class: 'spe-now', 'data-spe-now': '' }));
      const pickPin = (b) => {
        const v = b.dataset.pin;
        if (v === 'own') {
          const oc = art.ownColors || {};
          if (!oc.ink || !oc.paper) return;
          commit({ pin: null, colors: { art: oc.ink, background: oc.paper } }, `Plate ${pad2(index + 1)} uses the file's own colors.`, 'pin');
        } else {
          const pin = v === '' ? null : v;
          if (pin === (rec.pin || null) && !(rec.colors && (rec.colors.art || rec.colors.background))) return;
          commit({ pin }, `Plate ${pad2(index + 1)} ${pin ? 'pinned to' : 'back to'} ${pin ? ((Vectura.START_PAGE_PLATE_PALETTE || []).find((x) => x.id === pin) || {}).name || pin : 'the rhythm'}.`, 'pin');
        }
      };
      palGroup.addEventListener('click', (e) => { const b = e.target.closest('[data-pin]'); if (b) pickPin(b); });
      roving(palGroup, '[data-pin]', pickPin);
    }

    /* advice + contrast live below the pickers */
    const adviceBox = h('div', { class: 'spe-advice', 'data-spe-advice': '', 'aria-live': 'polite' });
    const contrastBox = h('div', { class: 'spe-contrast', 'data-spe-contrast': '', role: 'status', 'aria-live': 'polite' });
    if (palBody) palBody.appendChild(adviceBox);
    adviceBox.addEventListener('click', (e) => {
      if (e.target.closest('[data-spe-use-rhythm]')) commit({ pin: null }, `Plate ${pad2(index + 1)} back to the rhythm's color.`, 'pin');
    });

    /* manual colors */
    const mcBody = editsColor ? section(colB, 'colors', mode === 'basic' ? 'Ink' : 'Manual colors', mode === 'basic' ? 'Basic: theme colors, your ink choices · saved separately from Curated' : 'override the rhythm for this plate · saved in Curated', mode === 'basic') : null;
    const mcParts = {};
    if (mcBody) {
      (mode === 'basic' ? [PARTS[0]] : PARTS).forEach(([part, label]) => {
        const items = [];
        const auto = h('button', { type: 'button', class: 'spe-mc-auto', role: 'radio', 'data-mc-auto': '', 'aria-checked': 'false', tabindex: '-1', text: 'Auto' });
        const custom = h('input', { type: 'color', class: 'spe-mc-cu', 'aria-label': `${label}: custom color`, value: '#808080' });
        const sws = h('div', { class: 'spe-mc-sws' });
        (part === 'background' ? groundSwatches() : inkSwatches()).forEach(([c, n]) => {
          const b = h('button', { type: 'button', class: 'spe-mc-sw', role: 'radio', 'data-mc-swatch': '', 'data-value': c, 'aria-checked': 'false', tabindex: '-1', 'aria-label': `${n} ${c}`, title: n, style: `--c:${c}` });
          sws.appendChild(b); items.push(b);
        });
        const sps = h('div', { class: 'spe-mc-sps' });
        Fills().KINDS.forEach((k) => {
          const css = Fills().css(k.id, { ink: baseOpen.ink, accent: baseOpen.accent, onDark: part === 'background' ? false : true }, { still: true });
          const b = h('button', { type: 'button', class: 'spe-mc-sp', role: 'radio', 'data-fill': k.id, 'aria-checked': 'false', tabindex: '-1', style: `--f:${css}` }, h('i'), k.name);
          sps.appendChild(b); items.push(b);
        });
        const group = h('div', { class: 'spe-mc-g', role: 'radiogroup', 'aria-label': mode === 'basic' ? 'Artwork ink' : label });
        group.append(auto, sws, sps);
        const head = h('div', { class: 'spe-mc-h' }, h('b', { text: mode === 'basic' ? 'Artwork ink' : label }), h('label', { class: 'spe-mc-cul' }, 'Custom ', custom));
        const block = h('div', { class: 'spe-mc', 'data-mc-part': part }, head, group);
        mcBody.appendChild(block);
        mcParts[part] = { block, auto, custom, items: [auto].concat(items), group };
        const setPart = (value) => {
          const cur = colorsNow()[part] != null ? colorsNow()[part] : null;
          if (same(cur, value)) return;
          const names = { art: mode === 'basic' ? 'ink' : 'artwork', text: 'text', background: 'background' };
          const what = value == null ? 'back to Auto' : Fills().isFill(value) ? `set to ${Fills().KINDS.find((k) => k.id === value.fill).name}` : `set to ${value}`;
          const patch = mode === 'basic' ? { basicColors: { ink: value } } : { colors: { [part]: value } };
          preview = null;
          commit(patch, `Plate ${pad2(index + 1)}: ${names[part]} ${what}.`, `mc-${part}`);
        };
        const pickItem = (b) => {
          if (b.hasAttribute('data-mc-auto')) setPart(null);
          else if (b.hasAttribute('data-fill')) setPart({ fill: b.dataset.fill });
          else setPart(b.dataset.value);
        };
        group.addEventListener('click', (e) => { const b = e.target.closest('[role="radio"]'); if (b) pickItem(b); });
        roving(group, '[role="radio"]', pickItem);
        custom.addEventListener('input', () => { preview = { part, value: custom.value }; paint(); syncContrast(); });
        custom.addEventListener('change', () => { preview = null; setPart(custom.value); });
      });
      const reset = h('button', { type: 'button', class: 'spe-lnk', 'data-spe-reset-colors': '', text: mode === 'basic' ? 'Reset ink' : 'Reset colors' });
      mcBody.appendChild(contrastBox);
      mcBody.appendChild(h('div', {}, reset));
      reset.addEventListener('click', () => {
        const key = mode === 'basic' ? 'basicColors' : 'colors';
        if (rec[key] == null) return;
        commit({ [key]: null }, `Plate ${pad2(index + 1)} ${mode === 'basic' ? 'ink' : 'colors'} reset to the rhythm.`);
      });
    }

    /* frame */
    const frBody = section(colB, 'frame', 'Frame art', 'the art fills its shape; drag it to choose the crop', false);
    const frToggle = h('button', { type: 'button', class: 'spe-btn', 'data-spe-frame-toggle': '', 'aria-pressed': 'false', text: 'Frame art', disabled: is3d, title: is3d ? 'Live 3D models turn instead' : null });
    const fitBtns = [['contain', 'Fit'], ['cover', 'Fill']].map(([v, n]) => h('button', { type: 'button', class: 'spe-pt', 'data-spe-fit': v, 'aria-pressed': 'false', text: n }));
    const zoom = h('input', { type: 'range', min: '50', max: '400', step: '5', value: '100', 'data-spe-zoom': '', 'aria-label': 'Scale the art' });
    const zoomOut = h('output', { 'data-spe-zoom-out': '', text: '100%' });
    const frReset = h('button', { type: 'button', class: 'spe-lnk', 'data-spe-frame-reset': '', text: 'Reset framing' });
    const frCtl = h('div', { class: 'spe-fr-ctl', 'data-spe-frame-controls': '', hidden: true },
      h('span', { class: 'spe-seg', role: 'group', 'aria-label': 'Fit or fill' }, fitBtns),
      h('label', { class: 'spe-fr-z' }, 'Scale ', zoom, zoomOut), frReset);
    frBody.append(h('div', { class: 'spe-fr-row' }, frToggle), frCtl,
      h('p', { class: 'spe-fr-hint', text: is3d ? 'Live 3D models turn when you drag them; framing applies to flat art.' : 'Drag the art · scroll or pinch to scale · arrows move it (Shift: bigger) · + − scale · Enter or Esc to finish · the dashed line is the frame' }));

    /* motion */
    const moBody = section(colB, 'motion', 'Motion', "this plate's art; the page default is in Settings", false);
    const mkSel = (field, label, list) => {
      const s = h('select', { class: 'spe-sel', 'data-spe-motion': field, 'aria-label': label },
        h('option', { value: '', text: 'Page default' }), list.map(([v, n]) => h('option', { value: v, text: n })));
      s.addEventListener('change', () => {
        const v = s.value === '' ? null : s.value;
        commit({ motion: { [field]: v } }, `Plate ${pad2(index + 1)} ${field === 'animateIn' ? 'animates in with' : 'hover:'} ${v ? (list.find((x) => x[0] === v) || [0, v])[1] : 'the page default'}.`);
      });
      moBody.appendChild(h('label', { class: 'spe-mo' }, label, ' ', s));
      return s;
    };
    const selAnim = mkSel('animateIn', 'Animate in', AI_STYLES);
    const selHover = mkSel('hover', 'Hover', HOVER_STYLES);

    /* footer */
    const resetBtn = h('button', { type: 'button', class: 'spe-lnk', 'data-spe-reset': '', text: 'Reset plate' });
    const removeBtn = h('button', { type: 'button', class: 'spe-lnk spe-lnk-d', 'data-spe-remove': '', text: 'Remove plate' });
    root.appendChild(h('div', { class: 'spe-foot' }, resetBtn, removeBtn, h('span', { class: 'spe-grow' }), h('span', { class: 'spe-keys', text: 'Arrow keys move through options · Esc closes' })));

    /* ---- frame logic ---- */
    const mainPrint = () => { const c = plateEl._spl; const p = c && c.prints && c.prints.find((x) => x.main); return p ? p.el : null; };
    const handle = () => { const p = mainPrint(); return (p && p._spInk) || null; };
    const frameNow = () => {
      if (framePreview) return framePreview;
      const f = eff().frame;
      return { fit: (f && f.fit) === 'contain' ? 'contain' : 'cover', z: f && Number.isFinite(+f.z) ? +f.z : 1, cx: f && f.cx != null ? +f.cx : null, cy: f && f.cy != null ? +f.cy : null };
    };
    const boxOf = (hd, fit) => {
      try {
        if (fit === 'cover' && hd.parsed) return Geo().inkInfo(hd.parsed).box;
        if (hd.parsed && hd.parsed.vb) return hd.parsed.vb;
      } catch (e) { /* fall through */ }
      return [0, 0, 100, 100];
    };
    const centerOf = (f) => {
      if (f.cx != null && f.cy != null) return [f.cx, f.cy];
      const hd = handle();
      if (hd && hd.win) { const b = boxOf(hd, f.fit); return [(hd.win[0] + hd.win[2] / 2 - b[0]) / b[2], (hd.win[1] + hd.win[3] / 2 - b[1]) / b[3]]; }
      return [0.5, 0.5];
    };
    const r = (v, n) => +(+v).toFixed(n);
    const previewFrame = (f) => {
      framePreview = f;
      const hd = handle();
      if (hd && hd.setFrame) hd.setFrame({ z: f.z, cx: f.cx, cy: f.cy }, f.fit);
      zoom.value = String(Math.round(f.z * 100)); zoomOut.textContent = `${Math.round(f.z * 100)}%`;
    };
    const frameMove = (dxPx, dyPx, zMul) => {
      const f = frameNow(); const hd = handle();
      let [cx, cy] = centerOf(f);
      const b = hd ? boxOf(hd, f.fit) : [0, 0, 100, 100];
      if (dxPx || dyPx) {
        const s = hd && hd.s ? hd.s : 0;
        if (s) { cx -= dxPx / s / b[2]; cy -= dyPx / s / b[3]; } else { cx -= dxPx * 0.002; cy -= dyPx * 0.002; }
      }
      const z = zMul ? clamp(f.z * zMul, 0.5, 4) : f.z;
      const n = { fit: f.fit, z: r(z, 3), cx: r(clamp(cx, -0.5, 1.5), 4), cy: r(clamp(cy, -0.5, 1.5), 4) };
      previewFrame(n);
      return n;
    };
    const commitFrame = (n, msg) => { framePreview = null; commit({ frame: { fit: n.fit, z: n.z, cx: n.cx, cy: n.cy } }, msg || `Plate ${pad2(index + 1)} reframed.`, 'frame'); };
    const syncFrame = () => {
      const f = frameNow();
      setRadiosPressed();
      zoom.value = String(Math.round(f.z * 100)); zoomOut.textContent = `${Math.round(f.z * 100)}%`;
    };
    const setRadiosPressed = () => { const f = frameNow(); fitBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.speFit === f.fit))); };

    const printKey = (e) => {
      const st = e.shiftKey ? 24 : 6; let moved = null;
      if (e.key === 'ArrowLeft') moved = frameMove(-st, 0); else if (e.key === 'ArrowRight') moved = frameMove(st, 0);
      else if (e.key === 'ArrowUp') moved = frameMove(0, -st); else if (e.key === 'ArrowDown') moved = frameMove(0, st);
      else if (e.key === '+' || e.key === '=') moved = frameMove(0, 0, 1.1); else if (e.key === '-' || e.key === '_') moved = frameMove(0, 0, 1 / 1.1);
      else if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endFraming(true); return; }
      else return;
      e.preventDefault(); e.stopPropagation();
      commitFrame(moved);
    };
    const pts = new Map(); let dragged = false;
    const printDown = (e) => {
      e.preventDefault(); e.stopPropagation();
      const id = e.pointerId == null ? 0 : e.pointerId;
      pts.set(id, { x: e.clientX, y: e.clientY }); dragged = false;
      try { mainPrint().setPointerCapture(id); } catch (err) { /* synthetic or released */ }
    };
    const printMove = (e) => {
      const id = e.pointerId == null ? 0 : e.pointerId;
      if (!pts.has(id)) return;
      const p0 = pts.get(id);
      if (pts.size === 2) {
        const [a, b] = Array.from(pts.values()); const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        pts.set(id, { x: e.clientX, y: e.clientY });
        const [c, d] = Array.from(pts.values()); const d1 = Math.hypot(c.x - d.x, c.y - d.y);
        if (d0 > 4) frameMove(0, 0, d1 / d0);
      } else { frameMove(e.clientX - p0.x, e.clientY - p0.y); pts.set(id, { x: e.clientX, y: e.clientY }); }
      dragged = true;
    };
    const printUp = (e) => {
      const id = e.pointerId == null ? 0 : e.pointerId;
      if (!pts.has(id)) return;
      pts.delete(id);
      if (!pts.size && dragged && framePreview) { dragged = false; commitFrame(framePreview); }
    };
    const printWheel = (e) => { e.preventDefault(); e.stopPropagation(); commitFrame(frameMove(0, 0, Math.exp(-e.deltaY * 0.0015))); };
    const printClick = (e) => { e.preventDefault(); e.stopPropagation(); };
    const beginFraming = () => {
      const pr = mainPrint();
      if (!pr || is3d) return;
      framing = true;
      pr.classList.add('spe-framing'); pr.setAttribute('aria-roledescription', 'art framing area');
      pr.setAttribute('aria-label', 'Frame the art: drag or use arrow keys to move, plus and minus to scale, Enter to finish');
      pr.tabIndex = 0;
      pr.addEventListener('keydown', printKey); pr.addEventListener('pointerdown', printDown); pr.addEventListener('pointermove', printMove);
      pr.addEventListener('pointerup', printUp); pr.addEventListener('pointercancel', printUp);
      pr.addEventListener('wheel', printWheel, { passive: false }); pr.addEventListener('click', printClick, true);
      frToggle.setAttribute('aria-pressed', 'true'); frCtl.hidden = false;
      const det = frToggle.closest('details'); if (det) det.open = true;
      try { if (pr.scrollIntoView) pr.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* ignore */ }
      pr.focus({ preventScroll: true });
    };
    const endFraming = (focusToggle) => {
      const pr = mainPrint();
      framing = false; pts.clear();
      if (pr) {
        pr.classList.remove('spe-framing'); pr.removeAttribute('aria-roledescription'); pr.removeAttribute('aria-label');
        pr.removeEventListener('keydown', printKey); pr.removeEventListener('pointerdown', printDown); pr.removeEventListener('pointermove', printMove);
        pr.removeEventListener('pointerup', printUp); pr.removeEventListener('pointercancel', printUp);
        pr.removeEventListener('wheel', printWheel); pr.removeEventListener('click', printClick, true);
        pr.tabIndex = -1;
      }
      frToggle.setAttribute('aria-pressed', 'false');
      if (focusToggle) frToggle.focus();
    };
    frToggle.addEventListener('click', () => { if (framing) endFraming(false); else beginFraming(); });
    fitBtns.forEach((b) => b.addEventListener('click', () => {
      const n = { fit: b.dataset.speFit, z: 1, cx: null, cy: null };
      previewFrame(n); framePreview = null;
      commit({ frame: n }, `Plate ${pad2(index + 1)} art set to ${b.dataset.speFit === 'contain' ? 'fit' : 'fill'}.`, 'frame');
    }));
    zoom.addEventListener('input', () => { const f = frameNow(); const [cx, cy] = f.cx != null ? [f.cx, f.cy] : centerOf(f); previewFrame({ fit: f.fit, z: r(+zoom.value / 100, 3), cx: f.cx != null ? cx : null, cy: f.cx != null ? cy : null }); });
    zoom.addEventListener('change', () => { const f = framePreview || frameNow(); const [cx, cy] = centerOf(f); commitFrame({ fit: f.fit, z: r(+zoom.value / 100, 3), cx: r(cx, 4), cy: r(cy, 4) }); });
    frReset.addEventListener('click', () => {
      framePreview = null;
      const hd = handle(); if (hd && hd.setFrame) hd.setFrame(null, 'cover');
      commit({ frame: null }, `Plate ${pad2(index + 1)} framing reset.`, 'frame');
    });

    /* ---- reset / remove / close ---- */
    resetBtn.addEventListener('click', () => {
      const keys = (FIELDS_BY_MODE[mode] || ['layout', 'texts', 'frame', 'motion']).slice();
      const prev = {}; ALL_FIELDS.forEach((k) => { prev[k] = rec[k] === undefined ? null : copy(rec[k]); });
      keys.forEach((k) => { rec[k] = null; });
      framePreview = null; preview = null;
      if (typeof o.onReset === 'function') o.onReset(keys.slice());
      showToast(`Plate ${pad2(index + 1)} reset.`, () => {
        rec = applyLocal(rec, prev);
        if (typeof o.onChange === 'function') o.onChange(copy(prev));
        syncAll();
      });
      syncAll();
    });
    removeBtn.addEventListener('click', () => {
      flushPending();
      if (typeof o.onRemove === 'function') o.onRemove();
      close(false);
    });
    doneBtn.addEventListener('click', () => close(true));
    const flushPending = () => { if (pending) { const f = pending; pending = null; clearTimeout(timer); commitText(f); } };
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); close(true); }
    });

    /* ---- painting + sync ---- */
    const paint = () => {
      if (!editsColor || !Colors()) return;
      try { Colors().apply(plateEl, resolved()); } catch (e) { if (W.console) W.console.warn('[StartPagePlateEditor] paint', e); }
    };
    const fmt = (c) => `${(Math.round(c * 10) / 10).toFixed(1)}:1`;
    const syncContrast = () => {
      if (!editsColor) return;
      const res = resolved();
      contrastBox.textContent = '';
      if (res.contrast.warnings.length) res.contrast.warnings.forEach((w) => contrastBox.appendChild(h('span', { class: 'spe-warn', 'data-warn': w.code, text: `${w.message} ` })));
      else contrastBox.appendChild(h('span', { class: 'spe-ok', text: `Contrast: text ${fmt(res.contrast.text)} · art ${fmt(res.contrast.art)}` }));
    };
    const syncAdvice = () => {
      adviceBox.textContent = '';
      if (mode !== 'curated' || !R()) return;
      // the colorway the plate really shows: a manual background changes its class (dark or light)
      const list = R().advise(placed.map((p, i) => (i === index ? { id: p.id, colorway: Colors().resolve(baseColorway(), colorsNow(), { still: false }).colorway } : p)), index);
      const msgs = list.filter((a) => a.code !== 'low-contrast' || !colorsNow().art);
      if (msgs.length) {
        const w = h('div', { class: 'spe-warn spe-advice-w' }, msgs.map((a) => a.message).join(' '));
        if (rec.pin) w.append(' ', h('button', { type: 'button', class: 'spe-lnk', 'data-spe-use-rhythm': '', text: "Use the rhythm's color" }));
        adviceBox.appendChild(w);
      } else adviceBox.appendChild(h('div', { class: 'spe-ok', text: 'Rhythm holds: no dark or near-identical neighbors.' }));
    };
    const syncPins = () => {
      if (!palGroup) return;
      const pin = rec.pin || '';
      const oc = art.ownColors || {};
      const c = colorsNow();
      const ownOn = !pin && oc.ink && oc.paper && c.art && String(c.art).toLowerCase() === String(oc.ink).toLowerCase() && c.background && String(c.background).toLowerCase() === String(oc.paper).toLowerCase();
      setRadios(pinBtns, (b) => (b.dataset.pin === 'own' ? !!ownOn : !ownOn && b.dataset.pin === pin));
      ensureTabStop(pinBtns);
      const now = palBody.querySelector('[data-spe-now]');
      const res = resolved();
      if (now) now.textContent = `${res.colorway.penName || ''}${res.colorway.penName && res.colorway.paperName ? ' on ' : ''}${res.colorway.paperName || ''}`;
    };
    const syncColors = () => {
      if (!mcBody) return;
      const c = colorsNow();
      Object.keys(mcParts).forEach((part) => {
        const v = c[part] != null ? c[part] : null; const p = mcParts[part];
        setRadios(p.items, (b) => {
          if (b.hasAttribute('data-mc-auto')) return v == null;
          if (b.hasAttribute('data-fill')) return Fills().isFill(v) && v.fill === b.dataset.fill;
          return typeof v === 'string' && v.toLowerCase() === b.dataset.value;
        });
        ensureTabStop(p.items);
        if (typeof v === 'string') p.custom.value = /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : p.custom.value;
        else { const res = resolved(); p.custom.value = (part === 'background' ? res.ground.hex : part === 'text' ? (res.colorway.textInk || res.colorway.ink) : res.colorway.ink).replace(/^(#[0-9a-f]{3})$/i, (m) => `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`).slice(0, 7); }
      });
      const resetC = mcBody.querySelector('[data-spe-reset-colors]');
      resetC.disabled = (mode === 'basic' ? rec.basicColors : rec.colors) == null;
    };
    const syncLayout = () => {
      const sg = suggestions(); const want = sg[0];
      const cur = eff().layout || want;
      setRadios(layBtns, (b) => b.dataset.layout === cur);
      ensureTabStop(layBtns);
      layBtns.forEach((b) => {
        const mark = b.querySelector('.spe-lay-sg');
        if (b.dataset.layout === want) { b.setAttribute('data-suggested', ''); if (!mark) b.appendChild(h('span', { class: 'spe-lay-sg', text: 'Suggested' })); } else { b.removeAttribute('data-suggested'); if (mark) mark.remove(); }
      });
      layHint.textContent = `suggested for ${orientation} art: ${layNames[want] || want}`;
      layChips.textContent = '';
      const cls = resolved().colorway.class;
      layChips.appendChild(h('span', { class: 'spe-chip-l', text: `${cls === 'dark' ? 'Dark' : cls === 'ground' ? 'Color' : 'Light'} ground · suggested layouts:` }));
      sg.filter((l) => l !== cur).forEach((l) => layChips.appendChild(h('button', { type: 'button', class: 'spe-chip', 'data-spe-sug-layout': '', 'data-layout': l }, h('span', { class: 'spe-chip-k', text: 'Layout' }), h('span', { text: layNames[l] || l }))));
    };
    const syncTexts = () => {
      const t = eff().texts || {};
      TEXT_FIELDS.forEach(([f]) => { if (D.activeElement !== inputs[f] || pending !== f) { if (pending !== f) inputs[f].value = t[f] != null ? t[f] : sug.defaults[f] || ''; } });
      buildChips();
    };
    const syncMotion = () => { const m = eff().motion || {}; selAnim.value = m.animateIn || ''; selHover.value = m.hover || ''; };
    const syncAll = () => {
      if (closedFlag) return;
      syncTexts(); syncLayout(); syncPins(); syncColors(); syncContrast(); syncAdvice(); syncFrame(); syncMotion(); paint();
    };

    const close = (focusBack) => {
      if (closedFlag) return;
      flushPending();
      closedFlag = true;
      if (framing) endFraming(false);
      clearTimeout(timer);
      root.remove();
      delete root._spe;
      if (focusBack !== false) {
        const target = (restoreTo && restoreTo.isConnected ? restoreTo : null) || plateEl.querySelector('[data-slot="tools"] [data-action="edit"]') || plateEl.querySelector('[data-slot="tools"] button');
        if (target && target.focus) target.focus({ preventScroll: true });
      }
      if (typeof o.onClose === 'function') o.onClose();
    };
    const api = {
      close: () => close(true),
      update: (record) => { rec = copy(record) || {}; syncAll(); },
      /* the section re-rendered the plate (a new layout): point the editor at the new element */
      setPlate: (el) => { const was = framing; if (was) endFraming(false); plateEl = el; syncAll(); if (was) beginFraming(); }, // framing and focus survive a re-render
    };
    root._spe = api;
    plateEl.parentNode.insertBefore(root, plateEl.nextSibling);
    syncAll();
    const first = inputs.word;
    try { first.focus({ preventScroll: false }); } catch (e) { first.focus(); }
    return api;
  };

  Vectura.StartPagePlateEditor = { open, LAYOUT_IDS, AI_STYLES, HOVER_STYLES, suggestionsFor };
})();
