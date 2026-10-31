/**
 * Start Page Plates section — window.Vectura.UI.StartPagePlatesSection.
 *
 * The editorial run of the user's works under the color controls: header (count, explainer, + Add plate, Arrange,
 * Show dropdown), one plate per work in the user's order, the quiet "Showing x of N" line, and the honest empty state.
 * A plate is built by StartPagePlateLayouts with the layout = the store's layout || a rhythm suggestion, colored by
 * StartPagePlateRhythm.place() in the page mode with the store's saved edits applied for that mode
 * (StartPagePlatesStore.effectiveFor): Curated owns pins + manual colors, Basic owns the ink, other modes own all color.
 * Plates mount lazily near the viewport (IntersectionObserver, 800 px margin) and far-off ones drop their canvases.
 *
 * Seams (other agents' modules, all optional until merged):
 *   StartPagePlateEditor.open(plateEl, { record, art, mode, index, colorway, placed, suggestedLayout, onChange(patch),
 *     onReset(keys), onRemove(), onClose(), onReplay() }) -> { close() }      plateEl = the plate's `.sp-pl` wrapper; the wrapper
 *     holds the `.spl` article (re-rendered on layout / text / frame changes: listen for 'sp-plate-rerender').
 *   StartPageArrange.enter(listEl, { plates: [{ id, name, colorway, hidden }], onMove(ids), onResetOrder(), onExit() })
 *     -> { exit() }
 *   StartPageFan.open(anchorEl, { art, index, alternates, onPick(colorway) }) -> { close() }
 *   cover.useAsCover(art, { colorway, frame, fill }) -> Promise     (setCoverApi)
 *   StartPagePlateFills.apply(article, { art, text, background })    painting for special fills (optional)
 *   StartPageMotion.modelFor(art) -> model id | null                a live 3D model (StartPageOrbit3D); the SVG is used otherwise
 * A manual color value is '#rrggbb' or { fill: 'iridescent' | ... }.
 *
 *   create({ host, app, prefs(), setPref(key, value), arts(), mode(), seed(), theme(), still(), scroller(),
 *            onOpen(art, colorway, { asTemplate }) }) -> { render, recolor, refresh, destroy, setCoverApi, store, entries }
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const SHOW_OPTS = [[0, 'None'], [1, '1'], [3, '3'], [5, '5'], [10, '10'], [15, '15'], [20, '20'], ['all', 'All']];
  const MARGIN = '800px';
  const HEX = /^#[0-9a-f]{6}$/i;
  const PLOT_MM_PER_S = 50; // an honest ballpark for the "Plot time" spec, shown with ≈
  const SPEC_SHEET_PIN = 'black-white';

  const ICONS = {
    plus: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>',
    grip: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01"/></svg>',
    check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>',
    palette: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="11" height="16" rx="1.5"/><path d="m8 7 8-2.5 4 12-8 2.7"/></svg>',
    book: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>',
    copy: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
  };

  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  };
  const pretty = (name) => String(name || 'Untitled').replace(/\.vectura$/i, '').replace(/[-_]+/g, ' ').trim()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase()) || 'Untitled';
  const dash = (v) => (v == null || v === '' ? null : v);

  const create = (ctx) => {
    const { h, pad2, onOpenClick } = Vectura.StartPageDom;
    const Layouts = () => Vectura.StartPagePlateLayouts;
    const Rhythm = () => Vectura.StartPagePlateRhythm;
    const T = () => Vectura.StartPagePlateType;
    const Store = () => Vectura.StartPagePlatesStore;
    const host = ctx.host;
    const reduced = () => { try { return G.matchMedia('(prefers-reduced-motion: reduce)').matches || ctx.still(); } catch (_) { return false; } };

    let store = null;
    let entries = []; // [{ id, artId, art, rec }]
    let placed = [];
    let wrappers = new Map();
    let io = null;
    let unsub = null;
    let editor = null; // { id, handle, btn }
    let arrange = null;
    let headed = false; // the header has been drawn once (exampleMode is known)
    let exampleMode = false; // only example plates show (no works of the user's own): the first-run look
    let worksShown = 0; // own works among the entries
    let removedExamples = []; // example plates the user removed: listed in the Add plate menu so they can come back
    let hasExamples = false; // the bundled example set is available (the checkbox is offered)
    let removedWorks = []; // works whose plate was removed: listed in the Add plate menu so they can come back
    let fanHandle = null;
    let coverApi = null;
    let token = 0;
    let destroyed = false;
    const svgCache = new Map();
    const statCache = new Map();
    const exitTimers = new Map();

    /* ------------------------------------------------------------------ DOM shell */
    const root = h('section', { class: 'sp-plates', id: 'sp-plates', 'aria-labelledby': 'sp-pl-h' });
    const title = h('h2', { id: 'sp-pl-h', class: 'sp-pl-title', text: 'Plates' });
    const count = h('span', { class: 'sp-pl-count' });
    const explain = h('p', { class: 'sp-pl-explain', id: 'sp-pl-explain' });
    const addBtn = h('button', { type: 'button', id: 'sp-pl-add', class: 'sp-pl-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: `${ICONS.plus}<span>Add plate</span>` });
    const arrBtn = h('button', { type: 'button', id: 'sp-pl-arrange', class: 'sp-pl-btn', 'aria-pressed': 'false' });
    const showSel = h('select', { id: 'sp-pl-show', 'aria-label': 'How many plates are visible' }, SHOW_OPTS.map(([v, l]) => h('option', { value: String(v), text: l })));
    const showLbl = h('label', { class: 'sp-pl-show', for: 'sp-pl-show' }, h('span', { text: 'Show' }), showSel);
    const exBox = h('input', { type: 'checkbox', id: 'sp-pl-examples' });
    const exLbl = h('label', { class: 'sp-pl-show sp-pl-examples-toggle', for: 'sp-pl-examples' }, exBox, h('span', { text: 'Show example plates' }));
    const menu = h('div', { class: 'sp-pl-menu', role: 'menu', 'aria-label': 'Add another plate of', hidden: true });
    const liveRegion = h('div', { class: 'sp-sr', 'aria-live': 'polite', role: 'status' });
    const list = h('div', { class: 'sp-pl-list', id: 'sp-pl-list' });
    const more = h('p', { class: 'sp-pl-more' });
    const empty = h('div', { class: 'sp-pl-empty', hidden: true },
      h('b', { text: 'Your plates start with your first piece.' }),
      h('span', {}, 'Save or open a file and it hangs here automatically as Plate 01, set on its own paper. Until then, start from one of the ',
        h('a', { href: '#sp-picks', text: 'studio picks' }), ' below.'));
    root.append(
      h('header', { class: 'sp-pl-head' },
        h('div', { class: 'sp-pl-titles' }, title, count),
        h('div', { class: 'sp-pl-tools' }, addBtn, arrBtn, showLbl, exLbl, menu)),
      explain, empty, list, more, liveRegion);
    host.append(root);

    const announce = (msg) => { liveRegion.textContent = ''; setTimeout(() => { liveRegion.textContent = msg; }, 30); };
    const toast = (message, variant = 'info', action = null) => {
      const Tt = Vectura.UI && Vectura.UI.overlays && Vectura.UI.overlays.Toast;
      if (!Tt || typeof Tt.show !== 'function') return null;
      try { return Tt.show({ message, variant, duration: action ? 8000 : 3500, ...(action ? { action } : {}) }); } catch (_) { return null; }
    };

    /* ------------------------------------------------------------------ data */
    const getStore = () => {
      if (!store && Store()) {
        store = Store().create({ onFallback: () => toast("Plates can't be saved right now; changes last until you close the tab.", 'warning') });
        unsub = store.subscribe(() => { if (!destroyed) sync(); });
      }
      return store;
    };
    // The Show setting counts the user's own works; example plates (a small fixed set) are always all shown.
    const visibleCount = (n) => {
      const v = ctx.prefs().visiblePlates;
      if (v === 'all') return n;
      const k = Number(v);
      return Number.isFinite(k) ? Math.max(0, Math.min(n, k)) : Math.min(n, 5);
    };
    const showExamples = () => ctx.prefs().showExamples !== false;
    const mode = () => ctx.mode();
    const canEdit = () => !!(Store() && Store().canEdit(mode()));

    const buildEntries = (arts, snap) => {
      const byArt = new Map(arts.map((a) => [a.id, a]));
      const recs = new Map(snap.plates.map((r) => [r.id, r]));
      const cand = new Map();
      arts.forEach((a) => { const r = recs.get(a.id) || null; if (!(r && r.removed)) cand.set(a.id, { id: a.id, artId: a.id, art: a, rec: r, ...(a.example ? { example: a.exampleMeta || {} } : {}) }); });
      snap.plates.forEach((r) => {
        if (r.removed || r.id === r.artId || !byArt.has(r.artId)) return;
        cand.set(r.id, { id: r.id, artId: r.artId, art: byArt.get(r.artId), rec: r, ...(byArt.get(r.artId).example ? { example: byArt.get(r.artId).exampleMeta || {} } : {}) });
      });
      const out = [];
      snap.order.forEach((id) => { if (cand.has(id)) { out.push(cand.get(id)); cand.delete(id); } });
      cand.forEach((e) => out.push(e));
      return out;
    };

    // Example plates: bundled presets pre-rendered like the studio picks (StartPageArtSource.examples). The definitions are
    // never mutated; like works, a plate's edits / removal / order live in the plates store under the example's id.
    const loadExamples = () => {
      try {
        const Src = Vectura.StartPageArtSource;
        const P = Vectura.StartPageArtProvider;
        const list = Src && typeof Src.examples === 'function' ? Src.examples() : [];
        return (list || []).filter((a) => a && a.id && typeof a.getSvg === 'function').map((a) => {
          const get = a.getSvg.bind(a);
          return Object.assign({}, a, { getSvg: () => Promise.resolve(get()).then((svg) => (P && P.strokeSvg ? P.strokeSvg(svg) : svg)) });
        });
      } catch (_) { return []; }
    };

    const effective = (e) => (Store() && e.rec ? Store().effectiveFor(e.rec, mode()) : { layout: null, texts: null, pin: null, colors: null, basicColors: null, frame: null, motion: null });

    const isRings = (e) => /\brings?\b/i.test(`${e.art.algorithm || ''}`);
    const pinFor = (e, i) => {
      const eff = effective(e);
      if (eff.pin) return eff.pin;
      if (e.example && e.example.pin) return e.example.pin;
      return i === 1 && isRings(e) ? SPEC_SHEET_PIN : null;
    };
    const place = () => {
      const R = Rhythm();
      if (!R) return [];
      try {
        return R.place(entries.map((e, i) => ({ id: e.id, pin: pinFor(e, i) })), { mode: mode(), seed: ctx.seed(), theme: ctx.theme() });
      } catch (err) { if (G.console) G.console.warn('[Plates] rhythm failed', err); return []; }
    };

    // The colorway the plate shows: rhythm + the mode's saved manual colors (StartPagePlateColors.resolve).
    // `.resolved` carries the full resolution (fills, gradients, contrast) for Colors.apply.
    const manualColors = (e) => {
      const eff = effective(e);
      if (mode() === 'curated' && eff.colors && Object.keys(eff.colors).some((k) => eff.colors[k] != null)) return eff.colors;
      if (mode() === 'basic' && eff.basicColors && eff.basicColors.ink) return { art: eff.basicColors.ink };
      return null;
    };
    const resolveCw = (e, i) => {
      const base = placed[i] && placed[i].colorway;
      if (!base) return null;
      const colors = manualColors(e);
      const Colors = Vectura.StartPagePlateColors;
      if (colors && Colors) {
        try {
          const res = Colors.resolve(base, colors, { still: ctx.still() });
          return Object.assign({}, res.colorway, { resolved: res });
        } catch (err) { if (G.console) G.console.warn('[Plates] color resolve failed', err); }
      }
      return { ...base };
    };
    const shown = (cw) => (cw ? T().plateVars(cw) : null);
    const openCw = (e, i) => {
      const cw = resolveCw(e, i);
      if (!cw) return null;
      const v = shown(cw);
      const fill = (cw.resolved && cw.resolved.art && cw.resolved.art.kind) || null;
      // a duotone fill freezes as two solid pens: its second stop is ink2
      const spec = cw.resolved && cw.resolved.art && cw.resolved.art.fill;
      const ink2 = spec && spec.kind === 'duotone' && Array.isArray(spec.stops) && spec.stops.length > 1 ? spec.stops[spec.stops.length - 1][1] : null;
      return { key: cw.id || cw.key || null, paper: v['--spl-paper'], ink: v['--spl-art'], ink2, paperType: cw.paperType || null, fill };
    };

    /* ------------------------------------------------------------------ copy */
    const algoLabel = (e) => {
      const raw = String(e.art.algorithm || '').trim();
      if (!raw) return 'Piece';
      if (/^[a-z][a-zA-Z0-9]*$/.test(raw)) {
        try { const f = Vectura.PresetNameHeuristics && Vectura.PresetNameHeuristics.algoLabel; return (typeof f === 'function' && f(raw)) || raw; } catch (_) { return raw; }
      }
      return raw;
    };
    const defaultDescription = (e) => {
      const D = Vectura.DESCRIPTIONS || {};
      const key = Object.keys(D).find((k) => k.toLowerCase() === algoLabel(e).toLowerCase().replace(/[^a-z0-9]/g, ''));
      const first = key && T().firstSentence(D[key]);
      return first || `A plotter study in ${algoLabel(e)}.`;
    };
    const stats = (e, svg) => {
      if (statCache.has(e.art.id)) return statCache.get(e.art.id);
      let out = null;
      try {
        const a = Vectura.StartPageArtGeometry.parseArtSvg(svg);
        if (a && a.total > 0) {
          const m = a.total / 1000;
          const min = Math.max(1, Math.round(a.total / PLOT_MM_PER_S / 60));
          out = { strokes: a.strokes, line: m >= 10 ? `${Math.round(m)} m` : `${m.toFixed(1)} m`, time: min >= 60 ? `≈ ${Math.floor(min / 60)} h ${pad2(min % 60)} min` : `≈ ${min} min`, vb: a.vb };
        }
      } catch (_) { out = null; }
      statCache.set(e.art.id, out);
      return out;
    };
    const orientationOf = (svg) => {
      const m = /viewBox="([^"]+)"/.exec(svg || '');
      const vb = m ? m[1].trim().split(/[\s,]+/).map(Number) : null;
      if (!vb || !(vb[2] > 0) || !(vb[3] > 0)) return 'square';
      const r = vb[2] / vb[3];
      return r > 1.18 ? 'landscape' : r < 0.85 ? 'portrait' : 'square';
    };
    const textsFor = (e, cw, svg, i) => {
      const eff = effective(e);
      const t = eff.texts || {};
      const st = stats(e, svg);
      const specs = [['Algorithm', algoLabel(e)], ['Paper', cw && cw.paperName], ['Pen', cw && cw.penName]];
      if (st) specs.push(['Strokes', st.strokes.toLocaleString()], ['Line', st.line], ['Plot time', st.time]);
      const opened = e.art.lastOpened || (e.rec && e.rec.addedAt);
      if (opened) { try { specs.push(['Edited', new Date(opened).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })]); } catch (_) { /* noop */ } }
      return {
        word: dash(t.word) || (e.example && e.example.word) || algoLabel(e),
        title: dash(t.title) || (e.example && e.example.title) || pretty(e.art.name),
        description: dash(t.description) || defaultDescription(e),
        algorithm: algoLabel(e),
        summary: [algoLabel(e), cw && cw.paperName, cw && cw.penName].filter(Boolean).join(' · '),
        specs: specs.filter((s) => s[1]),
        actions: [
          { id: 'open', label: 'Open', ariaLabel: `Open ${dash(t.title) || pretty(e.art.name)}`, primary: true, onClick: () => open(i, false) },
          { id: 'template', label: 'Open as template', ariaLabel: `Open as template: ${dash(t.title) || pretty(e.art.name)}`, onClick: () => open(i, true) },
        ],
      };
    };

    /* ------------------------------------------------------------------ layout choice */
    // The layout suggestion follows the Curated rhythm class (not the page mode), so a mode switch recolors in place.
    let layoutClass = [];
    const computeLayoutClasses = () => {
      try {
        layoutClass = Rhythm().place(entries.map((e, i) => ({ id: e.id, pin: (e.rec && e.rec.pin) || (e.example && e.example.pin) || (i === 1 && isRings(e) ? SPEC_SHEET_PIN : null) })), { mode: 'curated', theme: 'dark' })
          .map((p) => p.colorway.class);
      } catch (_) { layoutClass = []; }
    };
    const occurrence = (i) => { let n = 0; for (let j = 0; j < i; j++) if (layoutClass[j] === layoutClass[i]) n += 1; return n; };
    const layoutFor = (e, i, orientation) => {
      const eff = effective(e);
      if (eff.layout && T().LAYOUTS.some((l) => l.id === eff.layout)) return eff.layout;
      if (e.example && e.example.layout && T().LAYOUTS.some((l) => l.id === e.example.layout)) return e.example.layout;
      return suggestedLayout(e, i, orientation);
    };
    const suggestedLayout = (e, i, orientation) => {
      if (i === 1 && isRings(e)) return 'spec-sheet';
      const sug = Rhythm().suggestLayouts(layoutClass[i] || 'light', orientation);
      return sug[occurrence(i) % sug.length] || 'text-wrap';
    };
    const frameFor = (e) => {
      const f = effective(e).frame;
      if (!f) return null;
      const out = {};
      if (f.fit) out.fit = f.fit;
      if (Number.isFinite(+f.z) && f.z !== null) out.z = +f.z;
      if (f.cx != null && f.cy != null) { out.cx = +f.cx; out.cy = +f.cy; }
      return Object.keys(out).length ? out : null;
    };

    /* ------------------------------------------------------------------ plates */
    const Motion = () => Vectura.StartPageMotion;
    const art3d = (e) => { try { const M = Motion(); return M ? M.modelFor(e.art) : null; } catch (_) { return null; } };
    // The plate's own motion (set in its editor) wins over the page defaults in Settings.
    const entryNow = (id) => entries.find((x) => x.id === id) || null;
    const plateAnimateIn = (id) => { const e = entryNow(id); const m = e ? (effective(e).motion || {}) : {}; return m.animateIn || ctx.prefs().animateIn || 'plot'; };
    const plateHover = (id) => { const e = entryNow(id); const m = e ? (effective(e).motion || {}) : {}; return m.hover || ctx.prefs().hover || 'default'; };

    const setData = (w, e, i) => {
      const cw = resolveCw(e, i);
      w.dataset.plateId = e.id;
      w.dataset.artId = e.art.id;
      w.dataset.index = String(i);
      if (e.example) w.dataset.example = '1'; else delete w.dataset.example;
      if (!cw) return cw;
      const v = shown(cw);
      w.dataset.cwId = cw.id || cw.key || '';
      w.dataset.cwClass = cw.class || '';
      w.dataset.cwFam = cw.fam || '';
      w.dataset.cwMode = cw.mode || mode();
      w.dataset.spPaper = v['--spl-paper'];
      w.dataset.spInk = v['--spl-art'];
      if (cw.resolved && cw.resolved.art && cw.resolved.art.kind) w.dataset.spFill = cw.resolved.art.kind; else delete w.dataset.spFill;
      return cw;
    };

    // Tools in the plate header: Colorways and Use as cover always; Edit only where the mode owns plate edits.
    const syncTools = (w) => {
      const art = w.querySelector('.spl');
      const slot = art && art.querySelector('[data-slot="tools"]');
      if (!slot) return;
      const isExample = w.dataset.example === '1';
      if (!slot.querySelector('[data-act="fan"]')) {
        slot.append(tool('fan', 'Colorways', ICONS.palette, 'Colorways: try this piece on other papers and pens'));
        if (!isExample) slot.append(tool('cover', 'Use as cover', ICONS.book, 'Use this piece as the cover'));
      }
      if (isExample && !slot.querySelector('.sp-pl-example')) slot.prepend(h('span', { class: 'sp-pl-example', text: 'Example', title: 'Example plate. Edit or remove it like your own; hide them all with Show example plates.' }));
      const want = canEdit();
      let ed = slot.querySelector('[data-act="edit"]');
      if (want && !ed) {
        ed = tool('edit', 'Edit', ICONS.edit, 'Edit this plate: text, layout, colors, framing');
        slot.prepend(ed);
      } else if (!want && ed) {
        if (editor && editor.id === w.dataset.plateId) closeEditor(false);
        ed.remove();
      }
    };
    const tool = (act, label, icon, titleText) => h('button', { type: 'button', class: 'sp-pl-tool', 'data-act': act, title: titleText, 'aria-label': titleText, html: `${icon}<span>${label}</span>` });

    const renderPlate = async (w) => {
      const st = w._sp;
      let e = entries.find((x) => x.id === w.dataset.plateId);
      if (!e || !st || w.hasAttribute('data-off') || arrange) return;
      const my = (st.gen = (st.gen || 0) + 1);
      st.rendering = true;
      let svg = svgCache.get(e.art.id);
      if (svg == null) {
        try { svg = await e.art.getSvg(); } catch (_) { svg = ''; }
        svgCache.set(e.art.id, svg);
      }
      st.rendering = false;
      if (destroyed || my !== st.gen || !w.isConnected || w.hasAttribute('data-off')) return;
      // A re-sync during the fetch rebuilds the entries (examples are new objects each time): carry on with the current one.
      e = entries.find((x) => x.id === w.dataset.plateId) || null;
      const i = e ? entries.indexOf(e) : -1;
      if (i < 0) return;
      const cw = setData(w, e, i);
      if (!cw || !svg) { w.dataset.state = 'error'; return; }
      const model = art3d(e);
      const orientation = model ? '3d' : orientationOf(svg);
      const eff = effective(e);
      const layout = layoutFor(e, i, orientation);
      const frame = frameFor(e);
      let article;
      try {
        article = Layouts().render(layout, {
          plate: { id: e.id, orientation, frame }, art: { id: e.art.id, svg, model }, colorway: cw, index: i, total: entries.length,
          texts: textsFor(e, cw, svg, i), frame, autoMount: false,
        });
      } catch (err) {
        if (G.console) G.console.warn('[Plates] render failed', err);
        w.dataset.state = 'error';
        return;
      }
      const inner = w.querySelector('.sp-pl-in');
      const fresh = !st.article || st.artId !== e.art.id;
      st.artId = e.art.id;
      if (st.bind) { try { st.bind.destroy(); } catch (_) { /* noop */ } st.bind = null; }
      if (st.article) { try { Layouts().destroy(st.article); } catch (_) { /* noop */ } }
      if (st.article && st.article.parentNode === inner) { st.article.replaceWith(article); } else inner.replaceChildren(article);
      st.article = article;
      st.specs = textsFor(e, cw, svg, i).specs;
      if (editor && editor.id === e.id && editor.handle && typeof editor.handle.setPlate === 'function') { try { editor.handle.setPlate(article); } catch (_) { /* noop */ } }
      st.sig = sigOf(e, i, layout);
      st.frameSig = frameSig(e);
      { const t0 = textsFor(e, cw, svg, i); st.copy = { title: t0.title, description: t0.description }; }
      st.layout = layout;
      st.orientation = orientation;
      w.dataset.layout = layout;
      w.dataset.state = 'ready';
      w.style.removeProperty('--sp-pl-h');
      syncTools(w);
      const main = article.querySelector('.spl-print');
      if (main) { main.classList.add('sp-pl-art'); onOpenClick(main, () => { if (!w.dataset.editing) open(entries.findIndex((x) => x.id === w.dataset.plateId), false); }); } // opens by plate id: a re-sync rebuilds the entry objects
      // Fresh plates draw themselves in (the plate's own style, else the page default). Still / reduced motion: shown finished.
      const M = Motion();
      const plays = !!(M && main && !model && !reduced() && !M.isStill() && M.styleId(plateAnimateIn(e.id)) !== 'none');
      if (plays && fresh) main.classList.add('sp-pre');
      const mounted = Layouts().mount(article);
      if (M && main) {
        if (st.bind) { try { st.bind.destroy(); } catch (_) { /* noop */ } }
        st.bind = M.bindArt(main, { handle: () => main._spInk || null, animateIn: () => plateAnimateIn(e.id), hover: () => plateHover(e.id), kind: 'plate' });
        Promise.resolve(mounted).then(() => {
          if (st.bind) st.bind.sync();
          if (plays && fresh && main.isConnected && main._spInk) {
            M.replay(main._spInk, plateAnimateIn(e.id));
            let n = 0;
            const reveal = () => { if (++n < 3) G.requestAnimationFrame(reveal); else main.classList.remove('sp-pre'); };
            G.requestAnimationFrame(reveal);
          } else main.classList.remove('sp-pre');
        });
        setTimeout(() => main.classList.remove('sp-pre'), 2500); // never leave a plate hidden
      }
      paintFills(article, cw);
      try { w.dispatchEvent(new G.CustomEvent('sp-plate-rerender', { bubbles: true })); } catch (_) { /* noop */ }
    };
    // Special fills and gradients are painted by StartPagePlateColors (plain Layouts.recolor drops them).
    const paintFills = (article, cw) => {
      const C = Vectura.StartPagePlateColors;
      if (!C || typeof C.apply !== 'function' || !cw) return;
      const dirty = article.dataset.artfill || article.dataset.bgfill || article.dataset.txfill;
      if (!cw.resolved && !dirty) return;
      try { C.apply(article, cw.resolved || C.resolve(cw, {}, { still: ctx.still() })); } catch (_) { /* painting is best effort */ }
    };
    // Only what forces a re-plot is in the signature: frame and caption texts (title, description) are applied in place.
    const sigOf = (e, i, layout) => JSON.stringify([i, entries.length, layout, (effective(e).texts || {}).word || null, e.art.name]);
    const frameSig = (e) => JSON.stringify(frameFor(e));
    const mainInk = (article) => { const c = article && article._spl; const p = c && c.prints && c.prints.find((x) => x.main); return (p && p.el._spInk) || null; };
    // Reframe the main print without re-mounting (the editor's own preview does the same while the user drags).
    const applyFrame = (st, e) => {
      const sig = frameSig(e);
      if (st.frameSig === sig) return;
      st.frameSig = sig;
      const hd = mainInk(st.article);
      if (!hd || typeof hd.setFrame !== 'function') return;
      const f = frameFor(e);
      try { if (f) hd.setFrame({ z: f.z == null ? 1 : f.z, cx: f.cx == null ? null : f.cx, cy: f.cy == null ? null : f.cy }, f.fit || 'cover'); else hd.setFrame(null, 'cover'); } catch (_) { /* noop */ }
    };
    // Title and description change the text nodes only. Returns false when a layout's copy cannot be patched safely.
    const patchCopy = (st, article, e, cw) => {
      const t = textsFor(e, cw, svgCache.get(e.art.id) || '', entries.indexOf(e));
      const prev = st.copy || {};
      st.copy = { title: t.title, description: t.description };
      if (prev.title === t.title && prev.description === t.description) return true;
      if (prev.title !== t.title) {
        const nodes = article.querySelectorAll('.spl-title, .spl-h b, .spl-wrap-txt > b');
        if (!nodes.length) return false;
        nodes.forEach((n) => { n.textContent = t.title; });
      }
      if (prev.description !== t.description) {
        const note = article.querySelector('.spl-note');
        if (note) {
          const cur = note.textContent;
          if (cur === prev.description) note.textContent = t.description;
          else if (cur === T().firstSentence(prev.description)) note.textContent = T().firstSentence(t.description);
          else return false;
        } else {
          // text-wrap sets the description inline, as the first words of the paragraph's closing text node
          const wrap = article.querySelector('.spl-wrap-txt');
          if (!wrap) return false;
          const node = [...wrap.childNodes].find((n) => n.nodeType === 3 && n.data.startsWith(prev.description));
          if (!node) return false;
          node.data = t.description + node.data.slice(prev.description.length);
        }
      }
      return true;
    };

    const dropPlate = (w) => {
      const st = w._sp;
      if (!st || !st.article) return;
      const hgt = w.getBoundingClientRect().height;
      if (hgt > 40) w.style.setProperty('--sp-pl-h', `${Math.round(hgt)}px`);
      if (st.bind) { try { st.bind.destroy(); } catch (_) { /* noop */ } st.bind = null; }
      try { Layouts().destroy(st.article); } catch (_) { /* noop */ }
      w.querySelector('.sp-pl-in').replaceChildren(placeholder(w));
      st.article = null; st.sig = null; st.artId = null;
      st.gen = (st.gen || 0) + 1;
      w.dataset.state = 'idle';
    };
    const placeholder = (w) => {
      const e = entries.find((x) => x.id === w.dataset.plateId);
      const i = entries.indexOf(e);
      return h('div', { class: 'sp-pl-ph', 'aria-hidden': 'true' }, h('span', { text: `Plate ${pad2(i + 1)} / ${pad2(entries.length)} · ${e ? pretty(e.art.name) : ''}` }));
    };

    // Refresh a mounted plate after a store / mode / theme change: rebuild only when its structure changed.
    const refreshPlate = (w, e, i) => {
      const st = w._sp;
      const cw = setData(w, e, i);
      if (!st || !st.article) return;
      if (!cw) return;
      const eff = effective(e);
      const layout = layoutFor(e, i, st.orientation || 'landscape');
      if (sigOf(e, i, layout) !== st.sig) { renderPlate(w); return; }
      if (!patchCopy(st, st.article, e, cw)) { renderPlate(w); return; }
      Layouts().recolor(st.article, cw);
      patchTexts(st.article, e, cw);
      applyFrame(st, e);
      w.dataset.layout = layout;
      syncTools(w);
      paintFills(st.article, cw);
    };

    // Paper / pen names in the header and spec list follow a recolor in place (no rebuild, no re-plot).
    const patchTexts = (article, e, cw) => {
      const sum = article.querySelector('.spl-hs > span');
      if (sum) sum.textContent = [algoLabel(e), cw.paperName, cw.penName].filter(Boolean).join(' · ');
      article.querySelectorAll('.spl-spec').forEach((dl) => dl.querySelectorAll('dt').forEach((dt) => {
        const label = dt.textContent.trim().toLowerCase();
        const dd = dt.nextElementSibling;
        if (dd && label === 'paper' && cw.paperName) dd.textContent = cw.paperName;
        if (dd && label === 'pen' && cw.penName) dd.textContent = cw.penName;
      }));
    };

    const makeWrapper = (e) => {
      const w = h('div', { class: 'sp-pl', 'data-state': 'idle', 'data-plate-id': e.id }, h('div', { class: 'sp-pl-in' }));
      w._sp = { article: null, sig: null, gen: 0 };
      return w;
    };

    /* ------------------------------------------------------------------ visibility, lazy mount */
    // the list also hosts the Arrange panel while arranging; only plates take part in visibility/order
    const plateEls = () => [...list.children].filter((c) => c.classList && c.classList.contains('sp-pl'));
    // Plates past the Show count are hidden; only the user's own works count, examples are never cut.
    const offSet = (k) => {
      const off = new Set();
      let seen = 0;
      entries.forEach((e) => { if (e.example) return; if (seen >= k) off.add(e.id); seen += 1; });
      return off;
    };
    const applyVisibility = (animate) => {
      const k = visibleCount(worksShown);
      const lastK = list._k;
      list._k = k;
      const offIds = offSet(k);
      plateEls().forEach((w, i) => {
        const off = offIds.has(w.dataset.plateId);
        const was = w.hasAttribute('data-off');
        if (off === was && w.dataset.visInit) return;
        w.dataset.visInit = '1';
        if (!animate || reduced()) w.setAttribute('data-instant', ''); else w.removeAttribute('data-instant');
        if (off) {
          w.setAttribute('data-off', ''); w.setAttribute('inert', ''); w.setAttribute('aria-hidden', 'true');
          if (io) io.unobserve(w);
          if (w._sp.article) { const wasEditing = editor && editor.id === w.dataset.plateId; if (wasEditing) closeEditor(false); setTimeout(() => { if (w.hasAttribute('data-off')) dropPlate(w); }, animate && !reduced() ? 420 : 0); }
        } else {
          w.removeAttribute('data-off'); w.removeAttribute('inert'); w.removeAttribute('aria-hidden');
          if (io) { io.unobserve(w); io.observe(w); } else renderPlate(w);
        }
        w.style.setProperty('--sp-pl-delay', `${Math.min(8, Math.abs(i - (lastK == null ? 0 : k))) * 25}ms`);
      });
      showSel.value = String(ctx.prefs().visiblePlates === 'all' ? 'all' : Number(ctx.prefs().visiblePlates));
      renderMore(k);
    };
    const renderMore = (k) => {
      const n = worksShown;
      more.textContent = '';
      more.hidden = !n;
      if (!n) return;
      const lnk = (v, text) => h('button', { type: 'button', class: 'sp-pl-lnk', 'data-vis-set': String(v), text });
      if (arrange) more.append(`Arranging all ${n} plates${k < n ? ` · ${n - k} hidden from the page are marked` : ''}`);
      else if (k >= n) { more.append(`Showing all ${n} plate${n === 1 ? '' : 's'}`); if (n > 5) more.append(' · ', lnk(5, 'Show 5')); }
      else if (k === 0) more.append('Plates hidden · ', lnk(5, 'Show 5'), ' · ', lnk('all', 'Show all'));
      else more.append(`Showing ${k} of ${n} · `, lnk('all', 'Show all'));
    };
    const setShow = (v) => {
      const clean = v === 'all' ? 'all' : Number(v);
      ctx.setPref('visiblePlates', clean);
      applyVisibility(true);
      announce(`${clean === 'all' ? 'All' : clean === 0 ? 'No' : clean} plates visible.`);
    };

    const setupObserver = () => {
      if (io || typeof G.IntersectionObserver !== 'function') return;
      io = new G.IntersectionObserver((records) => {
        records.forEach((r) => {
          const w = r.target;
          if (r.isIntersecting) {
            clearTimeout(exitTimers.get(w)); exitTimers.delete(w);
            if (!w._sp.article && !w._sp.rendering && !w.hasAttribute('data-off')) renderPlate(w);
          } else if (w._sp.article && !(editor && editor.id === w.dataset.plateId)) {
            clearTimeout(exitTimers.get(w));
            exitTimers.set(w, setTimeout(() => { exitTimers.delete(w); if (!arrange && w.isConnected) dropPlate(w); }, 1500));
          }
        });
      }, { root: ctx.scroller() || null, rootMargin: `${MARGIN} 0px` });
    };

    /* ------------------------------------------------------------------ sync / render */
    const header = () => {
      const n = entries.length;
      const edit = canEdit();
      root.dataset.mode = mode();
      const ne = n - worksShown;
      count.textContent = exampleMode ? `${n} examples · your own work will join them`
        : !n ? 'your work will hang here'
        : ne ? `${worksShown} work${worksShown === 1 ? '' : 's'} · ${ne} example${ne === 1 ? '' : 's'}`
        : `${n} work${n === 1 ? '' : 's'} · in your order`;
      explain.textContent = exampleMode
        ? 'These are examples. Your own plates appear here automatically when you save or open a file, one per piece, and the examples stay beside them until you hide them with Show example plates. Edit or remove any plate, examples included. Opening an example starts a new document; it becomes a plate once you save it.'
        : n
        ? `Each file you open or save becomes a plate automatically: set on its own paper and laid out for the sheet. ${edit ? 'Edit the text, layout, color and framing of any plate; drag to reorder.' : 'Colors follow the page mode; your edits return in Curated.'}`
        : '';
      explain.hidden = !n;
      if (exampleMode) explain.dataset.example = '1'; else delete explain.dataset.example;
      if (exampleMode) root.setAttribute('aria-describedby', explain.id); else root.removeAttribute('aria-describedby');
      addBtn.hidden = !(n || removedWorks.length || removedExamples.length); arrBtn.hidden = !n; showLbl.hidden = !worksShown;
      exLbl.hidden = !hasExamples; exBox.checked = showExamples();
      empty.hidden = !!n;
      arrBtn.disabled = !n; // nothing to arrange
      if (!n && arrange) exitArrange(true);
      arrBtn.setAttribute('aria-pressed', String(!!arrange));
      headed = true;
      if (typeof ctx.onHeader === 'function') { try { ctx.onHeader({ examples: exampleMode }); } catch (_) { /* noop */ } }
      arrBtn.innerHTML = arrange ? `${ICONS.check}<span>Done arranging</span>` : `${ICONS.grip}<span>Arrange</span>`;
    };

    const sync = () => {
      if (!getStore()) return Promise.resolve();
      const my = (token += 1);
      return Promise.all([ctx.arts(), getStore().load()]).then(async ([arts, snap]) => {
        if (destroyed || my !== token) return;
        if (typeof document === 'undefined' || !document) return; // resolved after the page was torn down
        const works = (arts || []).filter((a) => a && a.kind === 'work');
        // a removed work that is opened or saved again comes back (its record is stamped with the removal time)
        const back = works.filter((a) => { const r = snap.plates.find((x) => x.id === a.id); return r && r.removed && Number(r.removedAt) && Number(a.lastOpened) > Number(r.removedAt); });
        if (back.length) {
          for (const a of back) await getStore().upsert(a.id, { removed: false, removedAt: null });
          snap = await getStore().load();
          if (destroyed || my !== token) return;
        }
        // Example plates show beside the works (after them) while Show example plates is checked. A lone work cleared
        // from Recent hands the plates to the examples alone (several works stay put: curated plates).
        const all = loadExamples();
        hasExamples = all.length > 0;
        const withEx = hasExamples && showExamples();
        const ownWorks = withEx && works.length === 1 && works[0].cleared ? [] : works;
        const exArts = withEx ? all : [];
        removedExamples = all.filter((a) => { const r = snap.plates.find((x) => x.id === a.id); return r && r.removed; });
        removedWorks = ownWorks.filter((a) => { const r = snap.plates.find((x) => x.id === a.id); return r && r.removed; });
        entries = buildEntries(ownWorks.concat(exArts), snap);
        worksShown = entries.filter((e) => !e.example).length;
        exampleMode = withEx && !ownWorks.length && entries.length > 0;
        placed = place();
        computeLayoutClasses();
        const keep = new Set(entries.map((e) => e.id));
        wrappers.forEach((w, id) => {
          if (!keep.has(id)) { if (editor && editor.id === id) closeEditor(false); if (io) io.unobserve(w); if (w._sp.article) Layouts().destroy(w._sp.article); w.remove(); wrappers.delete(id); }
        });
        entries.forEach((e, i) => {
          let w = wrappers.get(e.id);
          if (!w) { w = makeWrapper(e); wrappers.set(e.id, w); }
          w.dataset.plateId = e.id;
          const cur = plateEls();
          if (cur[i] !== w) list.insertBefore(w, cur[i] || null);
        });
        header();
        applyVisibility(false);
        entries.forEach((e, i) => { const w = wrappers.get(e.id); setData(w, e, i); if (w._sp.article && !arrange) refreshPlate(w, e, i); });
        if (editor && !canEdit()) closeEditor(false);
      });
    };

    /* ------------------------------------------------------------------ actions */
    const entryOf = (el) => { const w = el.closest('.sp-pl'); const e = w && entries.find((x) => x.id === w.dataset.plateId); return e ? { w, e, i: entries.indexOf(e) } : null; };
    const open = (i, asTemplate) => {
      const e = entries[i];
      if (!e) return Promise.resolve(false);
      return ctx.onOpen(e.art, openCw(e, i), { asTemplate: !!asTemplate });
    };

    const undoToast = (message, undo) => toast(message, 'info', { label: 'Undo', onAction: undo });

    const closeEditor = (refocus = true) => {
      if (!editor) return;
      const ed = editor; editor = null;
      const w = wrappers.get(ed.id);
      if (w) delete w.dataset.editing;
      try { ed.handle && ed.handle.close && ed.handle.close(); } catch (_) { /* noop */ }
      if (refocus && ed.btn && ed.btn.isConnected) { try { ed.btn.focus({ preventScroll: true }); } catch (_) { /* noop */ } }
    };
    // Replay: draw the plate's art in again with its own style (else the page default); a live 3D model re-plots; Still shows it finished.
    const replayPlate = (id) => {
      const w = wrappers.get(id);
      const M = Motion();
      const main = w && w._sp.article && w._sp.article.querySelector('.spl-print.sp-pl-art');
      if (!M || !main) return Promise.resolve(null);
      if (main._vorbit) { if (!M.isStill()) main._vorbit.setModel(main._vorbit.model, { replot: true }); return Promise.resolve(main._vorbit); }
      return main._spInk ? M.replay(main._spInk, plateAnimateIn(id)) : Promise.resolve(null);
    };
    const openEditor = (info, btn) => {
      const Ed = Vectura.StartPagePlateEditor;
      if (!Ed || typeof Ed.open !== 'function') { toast('The plate editor is not available in this build.', 'warning'); return; }
      if (editor) closeEditor(false);
      const { w, e, i } = info;
      const art = w._sp.article;
      w.dataset.editing = '1';
      const svg = svgCache.get(e.art.id) || '';
      const handle = Ed.open(art, {
        record: e.rec ? JSON.parse(JSON.stringify(e.rec)) : { id: e.id, artId: e.artId },
        art: { id: e.art.id, name: e.art.name, algorithm: e.art.algorithm, collection: e.art.collection, svg, model: art3d(e), ownColors: e.art.ownColors },
        mode: mode(), index: i, colorway: placed[i] && placed[i].colorway, placed: placed.map((p, k) => { // neighbors count with the background they really show (a manual Curated background changes its class)
          const cwk = k === i ? null : resolveCw(entries[k], k);
          return cwk && p.colorway ? { id: p.id, colorway: Object.assign({}, p.colorway, { class: cwk.class || p.colorway.class, ground: cwk.ground || p.colorway.ground }) } : p;
        }),
        specs: w._sp.specs || [], orientation: w._sp.orientation || 'landscape',
        suggestedLayout: suggestedLayout(e, i, w._sp.orientation || 'landscape'),
        // The editor shows its own Undo toasts for changes and resets (Undo comes back through onChange).
        onChange: (patch) => getStore().upsert(e.id, patch),
        onReset: (keys) => getStore().reset(e.id, keys),
        onRemove: async () => {
          const tokenR = await getStore().remove(e.id);
          closeEditor(false);
          if (tokenR) undoToast(`Plate ${pad2(i + 1)} removed`, () => getStore().undoRemove(tokenR));
        },
        onClose: () => { if (editor && editor.id === e.id) closeEditor(true); },
        onReplay: () => replayPlate(e.id),
      });
      editor = { id: e.id, handle, btn };
    };

    const openFan = (info, btn) => {
      const LiveUI = Vectura.UI || UI; // Vectura.UI can be re-pointed after this module loads
      const Fan = (LiveUI.StartPageFan && LiveUI.StartPageFan.open ? LiveUI.StartPageFan : (UI.StartPageFan && UI.StartPageFan.open ? UI.StartPageFan : Vectura.StartPageFan));
      if (!Fan || typeof Fan.open !== 'function') { toast('Colorways are not available in this build.', 'warning'); return; }
      const { e, i } = info;
      let alternates = [];
      try {
        const works = entries.map((x) => ({ id: x.art.id }));
        alternates = Vectura.StartPageColorway.alternates(i, e.art.id, 4, { mode: mode() === 'curated' ? 'curated' : mode(), seed: ctx.seed(), theme: ctx.theme(), works });
      } catch (err) { if (G.console) G.console.warn('[Plates] alternates failed', err); }
      if (fanHandle) { try { fanHandle.close(); } catch (_) { /* noop */ } }
      fanHandle = Fan.open(btn, { art: e.art, index: i, alternates, onPick: (cw) => ctx.onOpen(e.art, cw, { asTemplate: false }) });
    };

    const useAsCover = async (info) => {
      const { e, i } = info;
      const api = (coverApi && typeof coverApi.useAsCover === 'function' ? coverApi : null) || (UI.StartPageCover && typeof UI.StartPageCover.useAsCover === 'function' ? UI.StartPageCover : null);
      if (!api) { toast('Use as cover is not available in this build.', 'warning'); return; }
      const cw = resolveCw(e, i);
      const fill = cw && cw.resolved && cw.resolved.art ? cw.resolved.art.fill : null;
      await api.useAsCover(e.art, { colorway: openCw(e, i), frame: frameFor(e), fill });
    };

    const enterArrange = () => {
      const LiveUI = Vectura.UI || UI;
      const A = (LiveUI.StartPageArrange && LiveUI.StartPageArrange.enter ? LiveUI.StartPageArrange : (UI.StartPageArrange && UI.StartPageArrange.enter ? UI.StartPageArrange : Vectura.StartPageArrange));
      if (!entries.length) return;
      if (!A || typeof A.enter !== 'function') { toast('Arranging is not available in this build.', 'warning'); return; }
      if (editor) closeEditor(false);
      if (fanHandle) { try { fanHandle.close(); } catch (_) { /* noop */ } }
      const k = visibleCount(worksShown);
      const offIds = offSet(k);
      list.dataset.arranging = 'true';
      wrappers.forEach((w) => dropPlate(w));
      arrange = A.enter(list, {
        plates: entries.map((e, i) => {
          const cw = resolveCw(e, i); const v = cw && shown(cw);
          return { id: e.id, name: textsOf(e).title, hidden: offIds.has(e.id), colorway: v ? { ground: v['--spl-paper'], paper: v['--spl-paper'], ink: v['--spl-text'], class: cw.class } : null };
        }),
        onMove: (ids) => getStore().reorder(ids),
        onResetOrder: async () => { await getStore().resetOrder(); await sync(); return entries.map((x) => x.id); },
        onExit: () => exitArrange(false),
        scroller: ctx.scroller(),
      }) || { exit() {} };
      header(); renderMore(k);
    };
    const textsOf = (e) => { const t = effective(e).texts || {}; return { title: dash(t.title) || pretty(e.art.name) }; };
    const exitArrange = (callHandle, focusBack) => {
      if (!arrange) return;
      const a = arrange; arrange = null;
      if (callHandle) { try { a.exit(); } catch (_) { /* noop */ } }
      delete list.dataset.arranging;
      header();
      if (focusBack !== false) { try { arrBtn.focus({ preventScroll: true }); } catch (_) { /* noop */ } } // the panel that held focus is gone
      applyVisibility(false);
      plateEls().forEach((w) => { if (!w.hasAttribute('data-off') && io) { io.unobserve(w); io.observe(w); } else if (!w.hasAttribute('data-off')) renderPlate(w); });
    };

    const openMenu = () => {
      menu.textContent = '';
      const seen = new Set();
      entries.forEach((e) => {
        if (seen.has(e.artId)) return; seen.add(e.artId);
        menu.append(h('button', { type: 'button', role: 'menuitem', 'data-add-art': e.artId, text: pretty(e.art.name) }));
      });
      if (removedWorks.length || removedExamples.length) {
        menu.append(h('span', { class: 'sp-pl-menu-h', role: 'presentation', text: 'Removed' }));
        removedWorks.concat(removedExamples).forEach((a) => menu.append(h('button', { type: 'button', role: 'menuitem', 'data-restore-art': a.id, text: pretty(a.name) })));
      }
      menu.hidden = false;
      addBtn.setAttribute('aria-expanded', 'true');
      menu.querySelector('button')?.focus();
    };
    const closeMenu = (refocus) => {
      if (menu.hidden) return;
      menu.hidden = true; addBtn.setAttribute('aria-expanded', 'false');
      if (refocus) addBtn.focus();
    };
    const restorePlate = async (artId) => {
      const s = getStore();
      await s.upsert(artId, { removed: false, removedAt: null });
      announce(`Restored the plate of ${pretty((removedWorks.concat(removedExamples).find((a) => a.id === artId) || { name: '' }).name)}.`);
      undoToast('Plate restored', () => s.remove(artId));
    };
    const addPlate = async (artId) => {
      const s = getStore();
      if (!(await s.load()).order.length) await s.reorder(entries.map((e) => e.id)); // keep today's order; the new plate lands last
      const rec = await s.add(artId, { duplicate: true });
      announce(`Added another plate of ${pretty((entries.find((e) => e.artId === artId) || { art: { name: '' } }).art.name)}.`);
      undoToast('Plate added', () => s.remove(rec.id));
    };

    /* ------------------------------------------------------------------ events */
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest && ev.target.closest('button');
      if (!t) return;
      if (t.dataset.visSet != null) { setShow(t.dataset.visSet); return; }
      if (t === addBtn) { menu.hidden ? openMenu() : closeMenu(true); return; }
      if (t.dataset.addArt) { closeMenu(false); addPlate(t.dataset.addArt); return; }
      if (t.dataset.restoreArt) { closeMenu(false); restorePlate(t.dataset.restoreArt); return; }
      if (t === arrBtn) { arrange ? exitArrange(true) : enterArrange(); return; }
      const act = t.dataset.act;
      if (!act || !t.closest('.spl-tools')) return;
      const info = entryOf(t);
      if (!info) return;
      if (act === 'edit') { editor && editor.id === info.e.id ? closeEditor(true) : openEditor(info, t); } else if (act === 'fan') openFan(info, t);
      else if (act === 'cover') useAsCover(info);
    });
    showSel.addEventListener('change', () => setShow(showSel.value));
    exBox.addEventListener('change', () => {
      ctx.setPref('showExamples', exBox.checked);
      announce(exBox.checked ? 'Example plates shown.' : 'Example plates hidden.');
      sync();
    });
    root.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !menu.hidden) { ev.preventDefault(); ev.stopPropagation(); closeMenu(true); }
    });
    root.addEventListener('focusout', (ev) => { if (!menu.hidden && !menu.contains(ev.relatedTarget) && ev.relatedTarget !== addBtn) closeMenu(false); });

    /* ------------------------------------------------------------------ public */
    const ctl = {
      el: root,
      get store() { return getStore(); },
      entries: () => entries.slice(),
      placed: () => placed.slice(),
      setCoverApi(api) { coverApi = api; },
      async render() {
        setupObserver();
        await sync();
        return ctl;
      },
      /** The page mode, seed or theme changed: recolor every plate in place (no re-plot, no rebuild). */
      recolor() {
        if (destroyed || !entries.length) return;
        placed = place();
        header();
        entries.forEach((e, i) => { const w = wrappers.get(e.id); if (w) refreshPlate(w, e, i); });
        if (editor && !canEdit()) closeEditor(false);
      },
      refresh: () => sync(),
      isExamples: () => (headed ? exampleMode : null), // null until the first sync has decided
      closeTransient() { closeMenu(false); closeEditor(false); if (fanHandle) { try { fanHandle.close(); } catch (_) { /* noop */ } } if (arrange) exitArrange(true, false); },
      destroy() {
        destroyed = true;
        if (io) io.disconnect();
        exitTimers.forEach((t) => clearTimeout(t));
        wrappers.forEach((w) => { if (w._sp.article) { try { Layouts().destroy(w._sp.article); } catch (_) { /* noop */ } } });
        if (unsub) unsub();
        root.remove();
      },
    };
    return ctl;
  };

  UI.StartPagePlatesSection = { create };
})();
