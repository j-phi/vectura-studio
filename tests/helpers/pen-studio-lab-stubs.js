/*
 * In-memory stand-ins for the B (store/draft) and C (lab/complement/renderer)
 * contracts so the Pen Studio lab/pair views can be tested before those units
 * merge. Contract = plan section 1.2. Delete when the real modules load.
 */
const PAPER_LIST = [
  ['hot-press', 'Hot press', '#f8f5ec', false], ['cold-press', 'Cold press', '#f7f2e6', false],
  ['bristol-smooth', 'Bristol smooth', '#fbfbf7', false], ['bristol-vellum', 'Bristol vellum', '#f9f7ef', false],
  ['cotton-rag', 'Cotton rag', '#f4efe2', false], ['kraft', 'Kraft', '#c39a6b', false],
  ['newsprint', 'Newsprint', '#e4dfd0', false], ['tracing', 'Tracing', '#eceff0', false],
  ['watercolor', 'Watercolor', '#f5f1e8', false], ['black-stock', 'Black stock', '#1c1c1e', true],
].map(([type, name, color, dark]) => ({ type, name, color, dark }));

const MODEL_DEFAULTS = { wetness: 0.35, blobs: 1, overlap: 0.15, skips: 0, starvation: 0, coverOnDark: 0.05 };
const SIZES = [
  { label: '03', nominalWidthMm: 0.35, laidWidthMm: 0.36 },
  { label: '05', nominalWidthMm: 0.45, laidWidthMm: 0.46 },
  { label: '08', nominalWidthMm: 0.5, laidWidthMm: 0.55 },
];

const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const makeDoc = () => ({
  schema: 'vectura-pen-studio', version: 1, migratedMyPens: true,
  pens: [
    { id: 'sp-a', name: 'Micron Black', color: '#1b1b1d', model: 'sakura-pigma-micron', ink: {} },
    { id: 'sp-b', name: 'Micron Burgundy', color: '#6b1f2e', model: 'sakura-pigma-micron', ink: {} },
    { id: 'sp-w', name: 'Gelly White', color: '#f8f8f4', model: 'sakura-gelly-roll', ink: {} },
  ],
  boxes: [{ id: 'box-1', name: 'Micron set', pinned: true, open: true, items: [
    { penId: 'sp-a', sizes: ['05'] }, { penId: 'sp-b', sizes: ['05', '08'] }, { penId: 'sp-w', sizes: ['05'] },
  ] }],
});

const install = (window) => {
  const V = window.Vectura = window.Vectura || {};
  const calls = { draw: [], testSpec: [] };
  V.PEN_MODELS = { MODELS: {}, LIMITS: { buildBudgetMs: 8 } };

  const Store = {
    sizesOf: () => SIZES,
    boxOf: (doc, penId) => doc.boxes.find((b) => b.items.some((i) => i.penId === penId)) || null,
    setOwnedSizes(doc, boxId, penId, labels) {
      if (!labels.length) return doc;
      return Object.assign({}, doc, { boxes: doc.boxes.map((b) => (b.id !== boxId ? b : Object.assign({}, b, {
        items: b.items.map((i) => (i.penId === penId ? Object.assign({}, i, { sizes: labels.slice() }) : i)) }))) });
    },
    toDocPen(pen, sizeLabel) {
      const s = SIZES.find((z) => z.label === sizeLabel) || SIZES[0];
      return { name: pen.name, color: pen.color, width: s.laidWidthMm, model: pen.model, size: s.label, nibMm: s.nominalWidthMm, ink: pen.ink };
    },
  };
  const Draft = {
    effectiveInk: (pen, d) => Object.assign({}, pen.ink, d.ink),
    valueOf: (pen, d, k) => (d.ink[k] != null ? d.ink[k] : (pen.ink[k] != null ? pen.ink[k] : MODEL_DEFAULTS[k])),
    set: (d, k, v) => Object.assign({}, d, { ink: Object.assign({}, d.ink, { [k]: v }) }),
    isDirty: (pen, d) => Object.keys(d.ink || {}).some((k) => d.ink[k] !== (pen.ink[k] != null ? pen.ink[k] : MODEL_DEFAULTS[k])) || d.name != null || d.desc != null,
    keyState: (pen, d, k) => {
      const saved = pen.ink[k] != null ? pen.ink[k] : MODEL_DEFAULTS[k];
      if (d.ink[k] != null && d.ink[k] !== saved) return 'draft';
      return pen.ink[k] != null ? 'saved' : 'default';
    },
    resetToModel: () => ({ ink: Object.assign({}, MODEL_DEFAULTS) }),
    commit(doc, penId, d) {
      return Object.assign({}, doc, { pens: doc.pens.map((p) => {
        if (p.id !== penId) return p;
        const ink = Object.assign({}, p.ink, d.ink);
        Object.keys(ink).forEach((k) => { if (ink[k] === MODEL_DEFAULTS[k]) delete ink[k]; });
        return Object.assign({}, p, { ink, name: d.name || p.name });
      }) });
    },
  };
  const Lab = {
    papers: () => PAPER_LIST,
    paperFor: (type) => Object.assign({ type }, PAPER_LIST.find((p) => p.type === type)),
    metrics: () => ({ blobMm: 0.12 }),
    fit(color, type, docPen) {
      const p = PAPER_LIST.find((x) => x.type === type);
      const ratio = contrast(color, p.color);
      const faint = ratio < 1.6 || (p.dark && ((docPen.ink && docPen.ink.coverOnDark) != null ? docPen.ink.coverOnDark : 0.05) < 0.3);
      return { ratio, faint, note: faint ? 'barely' : (ratio > 7 ? 'crisp' : 'reads') };
    },
    testSpec(kind, o) {
      calls.testSpec.push({ kind, mini: !!o.mini, paperType: o.paperType });
      const boxMm = o.mini ? { w: 14, h: 3 } : { w: 25, h: 2.4 };
      return { kind, boxMm, values: { nib: '0.45', laid: '0.46', bleed: '0.02', blob: '0.12', pct: '15' },
        strokes: [{ pen: o.pen, pts: [{ x: 1, y: 1 }, { x: 10, y: 1 }] }] };
    },
    weave: (n, mode) => Array.from({ length: n }, (_, i) => ({ pts: [{ x: 1, y: i }, { x: 9, y: i }],
      comp: mode === 'alt' ? i % 2 === 1 : mode === 'third' ? i % 3 === 2 : i === Math.floor(n / 2) })),
  };
  const mk = (id, hex, name, kind, real, extra) => Object.assign({ id, hex, name, kind, real }, extra || {});
  const Comp = {
    contrast,
    candidates: ({ pen, boxPens }) => [
      mk('c180', '#2e7d4f', 'Complement', 'hue', false),
      mk('c150', '#c9a048', 'Split -', 'hue', false),
      mk('c210', '#f8f8f4', 'Split +', 'hue', false),
    ].concat(boxPens.slice(0, 3).map((p) => mk('p:' + p.id, p.color, p.name, 'box', true, { penId: p.id, model: p.model }))),
    fits: (c, pen, type) => {
      const p = PAPER_LIST.find((x) => x.type === type);
      return contrast(c.hex, p.color) >= 2 && contrast(c.hex, pen.color) >= 1.25;
    },
    hidden: (cands, pen, type) => cands.filter((c) => c.real && !Comp.fits(c, pen, type)).map((c) => c.name),
    nearestOwned: (hex, owned) => owned[0] || null,
    randomize: (cands, currentId, type, rng) => {
      const pool = cands.filter((c) => c.id !== currentId);
      return pool[Math.floor(rng() * pool.length)];
    },
  };
  const IR = { drawSample: (canvas, pen, paper, opts) => { calls.draw.push({ canvas, pen, paper, opts }); return true; } };
  Object.assign(V, { PenStudioStore: Store, PenStudioDraft: Draft, PenStudioLab: Lab, PenStudioComplement: Comp, InkRenderer: IR });
  return calls;
};

// Manual rAF so tests control frames.
const installRaf = (window) => {
  let q = []; let id = 0;
  window.requestAnimationFrame = (cb) => { id += 1; q.push([id, cb]); return id; };
  window.cancelAnimationFrame = (i) => { q = q.filter((x) => x[0] !== i); };
  return { flush(max = 50) { for (let i = 0; i < max && q.length; i += 1) { const cur = q; q = []; cur.forEach(([, cb]) => cb(0)); } }, size: () => q.length };
};

const makeCtx = ({ doc, state, rng, strings } = {}) => {
  const s = Object.assign({ selPenId: 'sp-a', selBoxId: 'box-1', testSize: null, paperType: 'bristol-smooth', view: 'one', comp: null, n: 5, weave: 'alt', drafts: {}, editing: null, note: null, overlay: null }, state || {});
  const mounted = [];
  const ctx = {
    doc: doc || makeDoc(), state: s, mounted, sets: [], docs: [],
    getDoc: () => ctx.doc, getState: () => ctx.state,
    setDoc(d) { ctx.doc = d; ctx.docs.push(d); mounted.forEach((m) => m.update()); },
    set(patch) { ctx.sets.push(patch); Object.assign(ctx.state, patch); mounted.forEach((m) => m.update()); },
    L: () => strings || {}, cfg: () => ({ CURATED_PAIRS: {} }),
    rng: rng || undefined,
  };
  return ctx;
};

module.exports = { install, installRaf, makeCtx, makeDoc, PAPER_LIST, MODEL_DEFAULTS, SIZES };
