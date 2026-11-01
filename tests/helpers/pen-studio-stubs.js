/*
 * In-memory fakes of the Pen Studio contracts owned by other units
 * (plan §1): PenStudioStore / PenStudioDraft (B), PenStudioLab (C), plus the
 * small slice of PEN_MODELS / PenLibrary / PensPanel the shell touches.
 * Unit E tests load the real UI files against these; integration replaces
 * them with the real modules.
 */
const clone = (v) => JSON.parse(JSON.stringify(v));

const MODELS = {
  'sakura-pigma-micron': {
    id: 'sakura-pigma-micron', label: 'Pigma Micron', short: 'Micron', inkClass: 'pigment-fineliner', confidence: 0.75,
    sizes: [
      { label: '005', nominalWidthMm: 0.2, laidWidthMm: 0.22 },
      { label: '05', nominalWidthMm: 0.45, laidWidthMm: 0.46 },
      { label: '08', nominalWidthMm: 0.5, laidWidthMm: 0.55 },
    ],
    defaultSize: '05',
    colours: [{ name: 'Black', hex: '#1b1b1d' }, { name: 'Sepia', hex: '#5a3d2b' }],
  },
  'gelly-roll': {
    id: 'gelly-roll', label: 'Gelly Roll', short: 'Gelly Roll', inkClass: 'opaque-gel', confidence: 0.7,
    sizes: [{ label: '05', nominalWidthMm: 0.4, laidWidthMm: 0.45 }],
    defaultSize: '05',
    colours: [{ name: 'White', hex: '#f8f8f4' }],
  },
};

const PLAIN_SIZES = [
  { label: '0.3', nominalWidthMm: 0.3, laidWidthMm: 0.3 },
  { label: '0.5', nominalWidthMm: 0.5, laidWidthMm: 0.5 },
];

const sizesOf = (model) => (model && MODELS[model] ? MODELS[model].sizes : PLAIN_SIZES);

function installStubs(window, opts = {}) {
  const V = (window.Vectura = window.Vectura || {});
  let seq = 0;
  const nid = (p) => `${p}-${(++seq).toString(36).padStart(7, '0')}`;
  const storage = { saved: null, failSave: null, saves: 0 };

  V.PEN_MODELS = { MODELS, ORDER: Object.keys(MODELS), CLASS_LABELS: { 'pigment-fineliner': 'pigment fineliner', 'opaque-gel': 'opaque gel' } };
  V.PEN_STUDIO = {
    LIMITS: { maxBoxes: 32, maxPens: 256, nameMax: 48, descMax: 80, boxNameMax: 48 },
    PLAIN_SIZES,
    PLAIN_COLORS: () => [{ name: 'Navy', hex: '#0f172a' }, { name: 'Teal', hex: '#0f766e' }],
    SLIDERS: [],
  };

  const dedupe = (arr) => Array.from(new Set(arr));
  const findBox = (doc, id) => doc.boxes.find((b) => b.id === id);
  const penOf = (doc, id) => doc.pens.find((p) => p.id === id);

  const Store = {
    load() {
      if (storage.saved) return clone(storage.saved);
      return opts.doc ? clone(opts.doc) : seedDoc();
    },
    save(doc) {
      if (storage.failSave) return { ok: false, reason: storage.failSave };
      storage.saved = clone(doc);
      storage.saves += 1;
      return { ok: true };
    },
    sortedBoxes: (doc) => doc.boxes.map((b, i) => [b, i]).sort((a, b) => (b[0].pinned ? 1 : 0) - (a[0].pinned ? 1 : 0) || a[1] - b[1]).map((x) => x[0]),
    createBox(doc, name) {
      const d = clone(doc);
      const id = nid('box');
      d.boxes.push({ id, name: name || 'Box', pinned: false, open: true, items: [] });
      return { doc: d, boxId: id };
    },
    setPinned(doc, id, v) { const d = clone(doc); findBox(d, id).pinned = !!v; return d; },
    setOpen(doc, id, v) { const d = clone(doc); findBox(d, id).open = !!v; return d; },
    deleteBox(doc, id) {
      const d = clone(doc);
      d.boxes = d.boxes.filter((b) => b.id !== id);
      const used = new Set(d.boxes.flatMap((b) => b.items.map((i) => i.penId)));
      d.pens = d.pens.filter((p) => used.has(p.id));
      return d;
    },
    addPen(doc, boxId, spec) {
      const d = clone(doc);
      const id = nid('sp');
      d.pens.push({ id, name: spec.name, color: spec.color, model: spec.model || null, ink: spec.ink || {}, ...(spec.desc ? { desc: spec.desc } : {}) });
      const box = findBox(d, boxId);
      box.items.push({ penId: id, sizes: spec.sizes.slice() });
      box.open = true;
      return { doc: d, penId: id };
    },
    movePen(doc, penId, from, to) {
      const d = clone(doc);
      const src = findBox(d, from);
      const item = src.items.find((i) => i.penId === penId);
      src.items = src.items.filter((i) => i.penId !== penId);
      const dst = findBox(d, to);
      if (!dst.items.some((i) => i.penId === penId)) dst.items.push(item);
      dst.open = true;
      return d;
    },
    removePen(doc, boxId, penId) {
      const d = clone(doc);
      const box = findBox(d, boxId);
      box.items = box.items.filter((i) => i.penId !== penId);
      if (!d.boxes.some((b) => b.items.some((i) => i.penId === penId))) d.pens = d.pens.filter((p) => p.id !== penId);
      return d;
    },
    setOwnedSizes(doc, boxId, penId, labels) {
      if (!labels.length) return doc;
      const d = clone(doc);
      findBox(d, boxId).items.find((i) => i.penId === penId).sizes = labels;
      return d;
    },
    boxOf: (doc, penId) => doc.boxes.find((b) => b.items.some((i) => i.penId === penId)) || null,
    updatePen(doc, penId, patch) { const d = clone(doc); Object.assign(penOf(d, penId), patch); return d; },
    saveAsNew(doc, srcId, boxId, name, ink, desc) {
      const nm = String(name || '').trim();
      if (!nm) return { ok: false, reason: 'name-empty' };
      const d = clone(doc);
      const box = findBox(d, boxId);
      if (box.items.some((i) => penOf(d, i.penId).name.toLowerCase() === nm.toLowerCase())) return { ok: false, reason: 'name-taken' };
      const src = penOf(d, srcId);
      const id = nid('sp');
      d.pens.push({ ...clone(src), id, name: nm, ink: ink || {}, ...(desc ? { desc } : {}) });
      const srcItem = box.items.find((i) => i.penId === srcId);
      const at = srcItem ? box.items.indexOf(srcItem) + 1 : box.items.length;
      box.items.splice(at, 0, { penId: id, sizes: srcItem ? srcItem.sizes.slice() : [sizesOf(src.model)[0].label] });
      return { ok: true, doc: d, penId: id };
    },
    sizesOf,
    toDocPen(sp, label) {
      const sz = sizesOf(sp.model).find((s) => s.label === label) || sizesOf(sp.model)[0];
      const out = { name: sp.name, color: sp.color, width: sz.laidWidthMm, nibMm: sz.nominalWidthMm };
      if (sp.model) { out.model = sp.model; out.size = sz.label; }
      if (sp.ink && Object.keys(sp.ink).length) out.ink = { ...sp.ink };
      return out;
    },
    exportBox(doc, boxId) {
      const box = findBox(doc, boxId);
      const pens = box.items.flatMap((i) => i.sizes.map((s) => Store.toDocPen(penOf(doc, i.penId), s)));
      return { ok: true, text: JSON.stringify({ schema: 'vectura-pens', version: 2, box: { name: box.name }, pens }), filename: 'box.vectura-pens.json' };
    },
    exportPen(doc, penId, label) {
      return { ok: true, text: JSON.stringify({ schema: 'vectura-pens', version: 2, pens: [Store.toDocPen(penOf(doc, penId), label)] }), filename: 'pen.vectura-pens.json' };
    },
    importBox(doc, text) {
      let f = null;
      try { f = JSON.parse(text); } catch (_e) { return { ok: false, reason: 'parse' }; }
      if (!f || f.schema !== 'vectura-pens') return { ok: false, reason: 'schema' };
      if (f.version > 2) return { ok: false, reason: 'version' };
      if (!Array.isArray(f.pens) || !f.pens.length) return { ok: false, reason: 'empty' };
      let d = clone(doc);
      const made = Store.createBox(d, `${(f.box && f.box.name) || 'Imported box'} (imported)`);
      d = made.doc;
      f.pens.forEach((p) => {
        const r = Store.addPen(d, made.boxId, { name: p.name, color: p.color, model: p.model || null, sizes: [p.size || sizesOf(p.model)[0].label] });
        d = r.doc;
      });
      return { ok: true, doc: d, boxId: made.boxId, count: f.pens.length, rejected: 0 };
    },
  };

  function seedDoc() {
    const d = {
      schema: 'vectura-pen-studio', version: 1, migratedMyPens: true,
      pens: [
        { id: 'sp-black', name: 'Micron Black', color: '#1b1b1d', model: 'sakura-pigma-micron', ink: {} },
        { id: 'sp-sepia', name: 'Micron Sepia', color: '#5a3d2b', model: 'sakura-pigma-micron', ink: { wetness: 0.5 } },
        { id: 'sp-white', name: 'Gelly White', color: '#f8f8f4', model: 'gelly-roll', ink: {} },
        { id: 'sp-navy', name: 'Navy', color: '#0f172a', model: null, ink: {} },
      ],
      boxes: [
        { id: 'box-a', name: 'Micron set', pinned: false, open: true, items: [{ penId: 'sp-black', sizes: ['005', '05'] }, { penId: 'sp-sepia', sizes: ['05'] }] },
        { id: 'box-b', name: 'Night papers', pinned: true, open: true, items: [{ penId: 'sp-white', sizes: ['05'] }] },
        { id: 'box-c', name: 'Studio inks', pinned: false, open: false, items: [{ penId: 'sp-navy', sizes: ['0.3'] }] },
      ],
    };
    return d;
  }

  const Draft = {
    effectiveInk: (pen, draft) => ({ ...(pen.ink || {}), ...((draft && draft.ink) || {}) }),
    isDirty: (pen, draft) => !!draft && (Object.keys(draft.ink || {}).length > 0 || (draft.name != null && draft.name !== pen.name) || (draft.desc != null && draft.desc !== (pen.desc || ''))),
    set: (draft, k, v) => ({ ...draft, ink: { ...(draft.ink || {}), [k]: v } }),
    defaultSaveNewName: (pen, draft) => `${(draft && draft.name) || pen.name} (custom)`,
  };

  const PAPERS = [
    { type: 'bristol-smooth', name: 'Bristol smooth', color: '#f4f1ea', dark: false },
    { type: 'black-stock', name: 'Black stock', color: '#111111', dark: true },
  ];
  const lum = (h) => {
    const c = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const Lab = {
    papers: () => PAPERS,
    fit(color, paperType) {
      const p = PAPERS.find((x) => x.type === paperType) || PAPERS[0];
      const a = lum(color); const b = lum(p.color);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return { ratio, note: ratio < 1.6 ? 'barely' : 'reads', faint: ratio < 1.6 };
    },
  };

  V.PenStudioStore = Store;
  V.PenStudioDraft = Draft;
  V.PenStudioLab = Lab;

  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  V.PenLibrary = {
    toFilePen(p) {
      if (!p || !/^#[0-9a-f]{6}$/i.test(p.color || '') || !(p.width > 0)) return null;
      const out = { name: p.name || 'Pen', color: p.color, width: p.width };
      ['model', 'size', 'nibMm', 'ink'].forEach((k) => { if (own(p, k)) out[k] = p[k]; });
      return out;
    },
    applyEntry(pen, entry) {
      const rec = V.PenLibrary.toFilePen(entry);
      if (!pen || !rec) return false;
      pen.color = rec.color; pen.width = rec.width;
      ['model', 'size', 'nibMm', 'ink'].forEach((k) => { if (own(rec, k)) pen[k] = rec[k]; else delete pen[k]; });
      return true;
    },
    newPenId: (taken) => { let i = 1; while (taken.has(`pen-t${i}`)) i += 1; return `pen-t${i}`; },
  };

  // Same observable behaviour as pens-panel.js commitPenEdit.
  V.PensPanel = {
    commitPenEdit(app, pen, mutate) {
      const before = JSON.stringify(pen);
      const draft = JSON.parse(before);
      if (mutate(draft) === false) return false;
      if (JSON.stringify(draft) === before) return false;
      if (app.pushHistory) app.pushHistory();
      Object.keys(pen).forEach((k) => { if (!(k in draft)) delete pen[k]; });
      Object.assign(pen, draft);
      app.engine.layers.forEach((l) => { if (l.penId === pen.id) { l.color = pen.color; l.strokeWidth = pen.width; } });
      if (app.render) app.render();
      return true;
    },
  };

  V.SETTINGS = {
    paper: { type: 'bristol-smooth' },
    pens: [{ id: 'pen-1', name: 'Pen 1', color: '#ffffff', width: 0.3, themeManaged: true }],
  };

  const downloads = [];
  V.Download = { saveBlob: (blob, filename) => { downloads.push({ blob, filename }); return Promise.resolve('downloaded'); } };

  return { Store, Draft, Lab, storage, downloads, seedDoc };
}

function makeApp(window) {
  const V = window.Vectura;
  const history = [];
  const app = {
    history,
    pushHistory: () => history.push(JSON.stringify(V.SETTINGS.pens)),
    engine: { layers: [{ id: 'l1', penId: 'pen-1', color: '#ffffff', strokeWidth: 0.3 }] },
    render: () => {},
    setProjectPaper: () => { throw new Error('setProjectPaper must not be called'); },
    syncPen1ToPaper: () => { throw new Error('syncPen1ToPaper must not be called'); },
    ui: { renderPens() {}, renderLayers() {} },
  };
  return app;
}

// Loads modal + the three unit-E UI files into a JSDOM and installs the fakes.
// The lab / pair views (unit F) are replaced by recorders that expose their
// ctx so tests can drive ctx.set / ctx.getState exactly as F will.
function setupStudio(opts = {}) {
  const { loadUIComponent } = require('./load-ui-component');
  const rt = loadUIComponent(['focus', 'modal', 'src/ui/pen-studio/dialogs', 'src/ui/pen-studio/boxes-view', 'src/ui/pen-studio/studio']);
  const { window, document } = rt;
  const stubs = installStubs(window, opts);
  const calls = { lab: [], pair: [] };
  const sub = (key, name) => ({
    mount(el, ctx) {
      const node = document.createElement('div');
      node.className = `stub-${key}`;
      el.appendChild(node);
      const rec = { ctx, updates: 0, destroyed: false };
      calls[key].push(rec);
      return { update() { rec.updates += 1; }, destroy() { rec.destroyed = true; node.remove(); } };
    },
  });
  if (!opts.noSubviews) {
    window.Vectura.UI.PenStudioLab = sub('lab');
    window.Vectura.UI.PenStudioPair = sub('pair');
  }
  const app = makeApp(window);
  const q = (sel, root) => (root || document).querySelector(sel);
  const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const byText = (sel, text, root) => qa(sel, root).find((e) => e.textContent.trim() === text);
  return { ...rt, ...stubs, app, calls, studio: window.Vectura.UI.PenStudio, V: window.Vectura, q, qa, click, key, type, byText };
}

module.exports = { installStubs, makeApp, setupStudio, MODELS, PLAIN_SIZES };
