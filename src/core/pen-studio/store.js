/**
 * Pen Studio store — window.Vectura.PenStudioStore. Pure data operations on the
 * studio document plus load / save to localStorage (no DOM).
 *
 *   Doc       = { schema:'vectura-pen-studio', version:1, pens:[StudioPen], boxes:[Box], migratedMyPens }
 *   StudioPen = { id:'sp-xxxxxxx', name, desc?, color:'#rrggbb', model:modelId|null, ink:{…}, effect?, color2? }
 *   Box       = { id:'box-xxxxxxx', name, pinned, open, items:[{ penId, sizes:[label,…] }] }
 *
 * Every op returns a NEW doc (inputs are never mutated). Ops that can refuse
 * return { ok:false, reason } and the caller keeps its doc.
 *   load() / save(doc)                       first run seeds STARTER_BOXES and copies a
 *                                            non-empty My pens library once; save never
 *                                            alters vectura.penLibrary
 *   createBox renameBox setPinned setOpen deleteBox sortedBoxes
 *   addPen movePen removePen setOwnedSizes boxOf updatePen saveAsNew
 *   sizesOf toDocPen exportBox exportPen importBox
 * File I/O goes through Vectura.PenLibrary (exportDoc / parseImport, schema v2).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const CFG = () => Vectura.PEN_STUDIO || {};
  const LIM = () => Object.assign({ maxBoxes: 32, maxPens: 256, nameMax: 48, descMax: 80, boxNameMax: 48, maxBytes: 512 * 1024 }, CFG().LIMITS || {});
  const SCHEMA = () => CFG().SCHEMA || { id: 'vectura-pen-studio', version: 1 };
  const PM = () => Vectura.PEN_MODELS || {};
  const MODELS = () => PM().MODELS || {};
  const strings = () => (Vectura.UI_CONSTANTS && Vectura.UI_CONSTANTS.PEN_STUDIO) || {};
  const HEX = /^#[0-9a-f]{6}$/i;
  const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

  // ---- small helpers -------------------------------------------------------
  const cleanText = (v, max) => {
    if (typeof v !== 'string') return '';
    // eslint-disable-next-line no-control-regex
    return v.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  };
  const cleanName = (v) => cleanText(v, LIM().nameMax);
  const cleanDesc = (v) => cleanText(v, LIM().descMax);
  const cleanBoxName = (v) => cleanText(v, LIM().boxNameMax);
  const clone = (o) => Vectura.Utils.clone(o);
  const rnd = () => {
    if (G.crypto && typeof G.crypto.getRandomValues === 'function') { const a = new Uint32Array(1); G.crypto.getRandomValues(a); return a[0]; }
    return Math.floor(Math.random() * 0xffffffff);
  };
  const newId = (prefix, taken) => {
    for (let i = 0; i < 1000; i += 1) {
      let s = prefix;
      for (let j = 0; j < 7; j += 1) s += ID_CHARS[rnd() % ID_CHARS.length];
      if (!taken.has(s)) return s;
    }
    return `${prefix}${Date.now().toString(36)}`;
  };
  const idsOf = (list) => new Set(list.map((x) => x.id));

  // ---- catalogue / sizes ---------------------------------------------------
  const modelOf = (id) => (typeof id === 'string' && own(MODELS(), id) ? MODELS()[id] : null);
  const plainSizes = () => (CFG().PLAIN_SIZES || []).slice();
  // sizesOf(model|null): a model id or model object -> its sizes; null -> plain sizes.
  const sizesOf = (model) => {
    const m = typeof model === 'string' ? modelOf(model) : model;
    if (m && Array.isArray(m.sizes) && m.sizes.length) return m.sizes.slice();
    return plainSizes();
  };
  const canonicalLabel = (modelId, label) => {
    const PMo = Vectura.PenModel;
    if (modelId && PMo && typeof PMo.canonicalSize === 'function') {
      try { const c = PMo.canonicalSize(modelId, label); if (typeof c === 'string' && c) return c; } catch (_e) { /* fall through */ }
    }
    return label;
  };
  const defaultSizeLabel = (modelId) => {
    const m = modelOf(modelId);
    if (m) return (m.defaultSize && sizesOf(m).some((s) => s.label === m.defaultSize)) ? m.defaultSize : sizesOf(m)[0].label;
    return (sizesOf(null)[0] || {}).label;
  };
  // Valid, canonical, de-duplicated labels in model order; never empty.
  const normSizes = (modelId, labels, fallbackDefault = true) => {
    const all = sizesOf(modelId);
    const want = new Set((Array.isArray(labels) ? labels : []).map((l) => canonicalLabel(modelId, String(l))));
    const out = all.filter((s) => want.has(s.label)).map((s) => s.label);
    if (!out.length && fallbackDefault) out.push(defaultSizeLabel(modelId));
    return out;
  };
  const nearestSizeLabel = (modelId, widthMm) => {
    const all = sizesOf(modelId);
    if (!Number.isFinite(widthMm)) return defaultSizeLabel(modelId);
    let best = all[0]; let bd = Infinity;
    all.forEach((s) => { const d = Math.abs(s.laidWidthMm - widthMm); if (d < bd) { bd = d; best = s; } });
    return best.label;
  };

  // ---- ink -----------------------------------------------------------------
  const inkKeys = () => {
    const keys = new Set(PM().INK_KEYS || []);
    (CFG().SLIDERS || []).forEach((s) => keys.add(s.key));
    return keys;
  };
  const limitOf = (key) => {
    const l = (PM().PARAM_LIMITS || {})[key];
    if (l) return l;
    const s = (CFG().SLIDERS || []).find((x) => x.key === key);
    return s ? [s.min, s.max] : null;
  };
  const clampInk = (key, v) => {
    const lim = limitOf(key);
    return lim ? Math.min(lim[1], Math.max(lim[0], v)) : v;
  };
  // Model default of an ink key for a studio pen. Uses PenModel.inkDefaults and
  // falls back to the model traits for keys it does not report.
  const modelDefault = (pen, key) => {
    const model = pen && modelOf(pen.model);
    const probe = { model: model ? model.id : undefined, effect: pen && pen.effect };
    const PMo = Vectura.PenModel;
    if (PMo && typeof PMo.inkDefaults === 'function') {
      const d = PMo.inkDefaults(probe);
      if (d && own(d, key) && Number.isFinite(d[key])) return d[key];
    }
    const b = model || PM().PLAIN_TRAITS || {};
    switch (key) {
      case 'overlap': return Number.isFinite(b.overlapDarkening) ? b.overlapDarkening : 0;
      case 'starvation': return Number.isFinite(b.starvation && b.starvation.strength) ? b.starvation.strength : 0;
      case 'coverOnDark': return Number.isFinite(b.coverOnDark) ? b.coverOnDark : 1;
      case 'blobs': return 1;
      default: return 0;
    }
  };
  const sameNum = (a, b) => Math.abs(a - b) < 1e-9;
  const cleanInk = (pen, ink) => {
    const keys = inkKeys();
    const out = {};
    if (!ink || typeof ink !== 'object' || Array.isArray(ink)) return out;
    Object.keys(ink).forEach((k) => {
      if (!keys.has(k)) return;
      const raw = ink[k];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return;
      const v = clampInk(k, raw);
      if (sameNum(v, modelDefault(pen, k))) return; // default-valued keys are not stored
      out[k] = v;
    });
    return out;
  };

  // ---- document ------------------------------------------------------------
  const emptyDoc = () => ({ schema: SCHEMA().id, version: SCHEMA().version, pens: [], boxes: [], migratedMyPens: false });
  const penById = (doc, id) => doc.pens.find((p) => p.id === id) || null;
  const boxById = (doc, id) => doc.boxes.find((b) => b.id === id) || null;
  const itemIn = (box, penId) => (box ? box.items.find((i) => i.penId === penId) || null : null);
  const withBoxes = (doc, boxes) => Object.assign({}, doc, { boxes });
  const mapBox = (doc, boxId, fn) => withBoxes(doc, doc.boxes.map((b) => (b.id === boxId ? fn(b) : b)));
  // Drop pens no box holds.
  const gc = (doc) => {
    const held = new Set();
    doc.boxes.forEach((b) => b.items.forEach((i) => held.add(i.penId)));
    return Object.assign({}, doc, { pens: doc.pens.filter((p) => held.has(p.id)) });
  };

  const buildPen = (spec, taken) => {
    const color = typeof spec.color === 'string' && HEX.test(spec.color) ? spec.color.toLowerCase() : null;
    if (!color) return null;
    const model = modelOf(spec.model) ? spec.model : null;
    const pen = {
      id: spec.id && /^sp-[a-z0-9]{1,24}$/.test(spec.id) && !taken.has(spec.id) ? spec.id : newId('sp-', taken),
      name: cleanName(spec.name) || (modelOf(model) ? modelOf(model).short : 'Pen'),
      color,
      model,
      ink: {},
    };
    const desc = cleanDesc(spec.desc);
    if (desc) pen.desc = desc;
    const effects = PM().EFFECTS;
    if (typeof spec.effect === 'string' && /^[a-z]{1,24}$/.test(spec.effect) && (!effects || own(effects, spec.effect))) pen.effect = spec.effect;
    if (typeof spec.color2 === 'string' && HEX.test(spec.color2)) pen.color2 = spec.color2.toLowerCase();
    pen.ink = cleanInk(pen, spec.ink);
    return pen;
  };

  // Rebuild a stored / untrusted doc from whitelisted fields.
  const sanitizeDoc = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.schema !== SCHEMA().id) return null;
    if (!Array.isArray(raw.pens) || !Array.isArray(raw.boxes)) return null;
    const doc = emptyDoc();
    doc.migratedMyPens = !!raw.migratedMyPens;
    const taken = new Set();
    raw.pens.slice(0, LIM().maxPens).forEach((p) => {
      if (!p || typeof p !== 'object') return;
      const pen = buildPen(p, taken);
      if (pen) { taken.add(pen.id); doc.pens.push(pen); }
    });
    const boxIds = new Set();
    raw.boxes.slice(0, LIM().maxBoxes).forEach((b) => {
      if (!b || typeof b !== 'object') return;
      const id = typeof b.id === 'string' && /^box-[a-z0-9]{1,24}$/.test(b.id) && !boxIds.has(b.id) ? b.id : newId('box-', boxIds);
      boxIds.add(id);
      const seen = new Set();
      const items = [];
      (Array.isArray(b.items) ? b.items : []).forEach((it) => {
        const pen = it && penById(doc, it.penId);
        if (!pen || seen.has(pen.id)) return;
        seen.add(pen.id);
        items.push({ penId: pen.id, sizes: normSizes(pen.model, it.sizes) });
      });
      doc.boxes.push({ id, name: cleanBoxName(b.name) || 'Box', pinned: !!b.pinned, open: b.open !== false, items });
    });
    return gc(doc);
  };

  // ---- seeding -------------------------------------------------------------
  const resolveStarter = (spec) => {
    if (spec && spec.plain) {
      const c = (CFG().PLAIN_COLORS ? CFG().PLAIN_COLORS() : []).find((x) => x.id === spec.plain);
      return c ? { name: c.name, color: c.hex, model: null, sizes: [defaultSizeLabel(null)] } : null;
    }
    const m = spec && modelOf(spec.catalog);
    if (!m) return null;
    const col = (m.colours || []).find((c) => c.name === spec.color);
    if (!col) return null;
    const out = { name: spec.name || `${m.short} ${col.name}`, color: col.hex, model: m.id, sizes: spec.sizes };
    if (col.effect && col.effect !== 'plain' && col.effect !== m.effect) out.effect = col.effect;
    if (col.color2) out.color2 = col.color2;
    return out;
  };
  const seedStarters = (doc) => {
    let d = doc;
    (CFG().STARTER_BOXES || []).forEach((sb) => {
      const made = createBox(d, sb.name);
      if (!made.boxId) return;
      d = made.doc;
      if (sb.pinned) d = setPinned(d, made.boxId, true);
      d = setOpen(d, made.boxId, true);
      (sb.pens || []).forEach((spec) => {
        const r = resolveStarter(spec);
        if (!r) return;
        const added = addPen(d, made.boxId, r);
        if (added.penId) d = added.doc;
      });
    });
    return d;
  };
  const migrateMyPens = (doc) => {
    const lib = Vectura.PenLibrary && Vectura.PenLibrary.library && Vectura.PenLibrary.library();
    let list = [];
    try { list = lib ? lib.list() : []; } catch (_e) { list = []; }
    if (!list.length) return doc;
    const made = createBox(doc, 'My pens');
    if (!made.boxId) return doc;
    let d = made.doc;
    list.forEach((e) => {
      const model = modelOf(e.model) ? e.model : null;
      const size = (model && e.size && sizesOf(model).some((s) => s.label === canonicalLabel(model, e.size)))
        ? canonicalLabel(model, e.size) : nearestSizeLabel(model, e.width);
      const added = addPen(d, made.boxId, { name: e.name, color: e.color, model, sizes: [size], ink: e.ink, effect: e.effect, color2: e.color2 });
      if (added.penId) d = added.doc;
    });
    return d;
  };

  // ---- persistence ---------------------------------------------------------
  const storage = () => { try { return G.localStorage || null; } catch (_e) { return null; } };
  const isQuota = (err) => {
    const U = Vectura.UserLibraryStore;
    if (U && U.isQuotaError) return U.isQuotaError(err);
    return !!err && (/quota/i.test(String(err.name || '')) || Number(err.code) === 22 || Number(err.code) === 1014);
  };
  // Set by load() when storage holds a newer document: it is kept untouched and
  // this session runs in memory only.
  let memoryOnly = null;
  const status = () => ({ memoryOnly: !!memoryOnly, reason: memoryOnly });
  const save = (doc) => {
    if (memoryOnly) return { ok: false, reason: memoryOnly };
    const ls = storage();
    if (!ls) return { ok: false, reason: 'unavailable' };
    let text;
    try { text = JSON.stringify(doc); } catch (_e) { return { ok: false, reason: 'unavailable' }; }
    if (text.length > LIM().maxBytes) return { ok: false, reason: 'quota' };
    try { ls.setItem(CFG().STORAGE_KEY || 'vectura.penStudio', text); } catch (e) { return { ok: false, reason: isQuota(e) ? 'quota' : 'unavailable' }; }
    return { ok: true };
  };
  const load = () => {
    const ls = storage();
    let doc = null;
    let rawText = null;
    memoryOnly = null;
    if (ls) {
      try {
        rawText = ls.getItem(CFG().STORAGE_KEY || 'vectura.penStudio') || null;
        if (rawText) {
          const raw = JSON.parse(rawText);
          if (raw && typeof raw === 'object' && raw.schema === SCHEMA().id && Number(raw.version) > SCHEMA().version) memoryOnly = 'newer';
          else doc = sanitizeDoc(raw);
        }
      } catch (_e) { doc = null; }
    }
    if (doc) return doc;
    // Unreadable or wrong-schema data is copied aside before anything is written.
    if (rawText && !memoryOnly) {
      try {
        const bak = CFG().BACKUP_KEY || 'vectura.penStudio.bak';
        if (ls.getItem(bak) == null) ls.setItem(bak, rawText);
      } catch (_e) { /* best effort */ }
    }
    // First run: starter boxes, then My pens once. After unreadable data the
    // migration is not repeated (the user may have deleted that box).
    doc = seedStarters(emptyDoc());
    if (!rawText) doc = migrateMyPens(doc);
    doc.migratedMyPens = true;
    save(doc); // best effort; refused in memory-only mode, failure leaves storage as it was
    return doc;
  };

  // ---- box ops -------------------------------------------------------------
  function createBox(doc, name) {
    if (doc.boxes.length >= LIM().maxBoxes) return { ok: false, reason: 'full', doc, boxId: null };
    let nm = cleanBoxName(name);
    if (!nm) {
      const tpl = strings().NEW_BOX_NAME || 'My box {n}';
      const used = new Set(doc.boxes.map((b) => b.name));
      let n = 1;
      nm = cleanBoxName(tpl.replace('{n}', String(n)));
      while (used.has(nm) && n < 1000) { n += 1; nm = cleanBoxName(tpl.replace('{n}', String(n))); }
    }
    const id = newId('box-', idsOf(doc.boxes));
    return { ok: true, doc: withBoxes(doc, doc.boxes.concat([{ id, name: nm, pinned: false, open: true, items: [] }])), boxId: id };
  }
  function renameBox(doc, boxId, name) {
    const nm = cleanBoxName(name);
    if (!nm || !boxById(doc, boxId)) return doc;
    return mapBox(doc, boxId, (b) => Object.assign({}, b, { name: nm }));
  }
  function setPinned(doc, boxId, pinned) {
    return boxById(doc, boxId) ? mapBox(doc, boxId, (b) => Object.assign({}, b, { pinned: !!pinned })) : doc;
  }
  function setOpen(doc, boxId, open) {
    return boxById(doc, boxId) ? mapBox(doc, boxId, (b) => Object.assign({}, b, { open: !!open })) : doc;
  }
  function deleteBox(doc, boxId) {
    if (!boxById(doc, boxId)) return doc;
    return gc(withBoxes(doc, doc.boxes.filter((b) => b.id !== boxId)));
  }
  // Pinned boxes first, otherwise the stored order.
  const sortedBoxes = (doc) => doc.boxes.map((b, i) => ({ b, i })).sort((x, y) => (Number(!!y.b.pinned) - Number(!!x.b.pinned)) || (x.i - y.i)).map((x) => x.b);

  // ---- pen ops -------------------------------------------------------------
  const boxOf = (doc, penId) => doc.boxes.find((b) => itemIn(b, penId)) || null;
  function addPen(doc, boxId, spec) {
    const box = boxById(doc, boxId);
    if (!box) return { ok: false, reason: 'missing', doc, penId: null };
    if (doc.pens.length >= LIM().maxPens) return { ok: false, reason: 'full', doc, penId: null };
    const pen = buildPen(Object.assign({}, spec, { id: null }), idsOf(doc.pens));
    if (!pen) return { ok: false, reason: 'invalid', doc, penId: null };
    const sizes = normSizes(pen.model, spec && spec.sizes);
    const next = withBoxes(Object.assign({}, doc, { pens: doc.pens.concat([pen]) }), doc.boxes.map((b) => (b.id === boxId ? Object.assign({}, b, { open: true, items: b.items.concat([{ penId: pen.id, sizes }]) }) : b)));
    return { ok: true, doc: next, penId: pen.id };
  }
  function movePen(doc, penId, fromBoxId, toBoxId) {
    const from = boxById(doc, fromBoxId); const to = boxById(doc, toBoxId);
    const item = itemIn(from, penId);
    if (!from || !to || !item || fromBoxId === toBoxId) return doc;
    return withBoxes(doc, doc.boxes.map((b) => {
      if (b.id === fromBoxId) return Object.assign({}, b, { items: b.items.filter((i) => i.penId !== penId) });
      if (b.id === toBoxId) return Object.assign({}, b, { open: true, items: itemIn(b, penId) ? b.items : b.items.concat([{ penId, sizes: item.sizes.slice() }]) });
      return b;
    }));
  }
  function removePen(doc, boxId, penId) {
    if (!itemIn(boxById(doc, boxId), penId)) return doc;
    return gc(mapBox(doc, boxId, (b) => Object.assign({}, b, { items: b.items.filter((i) => i.penId !== penId) })));
  }
  function setOwnedSizes(doc, boxId, penId, labels) {
    const pen = penById(doc, penId);
    if (!pen || !itemIn(boxById(doc, boxId), penId)) return doc;
    const sizes = normSizes(pen.model, labels, false);
    if (!sizes.length) return doc;
    return mapBox(doc, boxId, (b) => Object.assign({}, b, { items: b.items.map((i) => (i.penId === penId ? { penId, sizes } : i)) }));
  }
  function updatePen(doc, penId, patch) {
    const pen = penById(doc, penId);
    if (!pen || !patch) return doc;
    const next = Object.assign({}, pen);
    if (own(patch, 'name')) { const nm = cleanName(patch.name); if (nm) next.name = nm; }
    if (own(patch, 'desc')) { const d = cleanDesc(patch.desc); if (d) next.desc = d; else delete next.desc; }
    if (own(patch, 'ink')) next.ink = cleanInk(next, patch.ink);
    return Object.assign({}, doc, { pens: doc.pens.map((p) => (p.id === penId ? next : p)) });
  }
  function saveAsNew(doc, srcPenId, boxId, name, ink, desc) {
    const src = penById(doc, srcPenId);
    const box = boxById(doc, boxId);
    if (!src || !box) return { ok: false, reason: 'missing' };
    const nm = cleanName(name);
    if (!nm) return { ok: false, reason: 'name-empty' };
    const key = nm.toLowerCase();
    if (box.items.some((i) => { const p = penById(doc, i.penId); return p && p.name.toLowerCase() === key; })) return { ok: false, reason: 'name-taken' };
    if (doc.pens.length >= LIM().maxPens) return { ok: false, reason: 'full' };
    const srcItem = itemIn(box, srcPenId) || itemIn(boxOf(doc, srcPenId), srcPenId);
    const d = desc === undefined ? src.desc : desc;
    const pen = buildPen({ name: nm, desc: d, color: src.color, model: src.model, effect: src.effect, color2: src.color2, ink: ink === undefined ? src.ink : ink }, idsOf(doc.pens));
    const item = { penId: pen.id, sizes: normSizes(pen.model, srcItem ? srcItem.sizes : null) };
    const next = withBoxes(Object.assign({}, doc, { pens: doc.pens.concat([pen]) }), doc.boxes.map((b) => {
      if (b.id !== boxId) return b;
      const at = b.items.findIndex((i) => i.penId === srcPenId);
      const items = at >= 0 ? b.items.slice(0, at + 1).concat([item], b.items.slice(at + 1)) : b.items.concat([item]);
      return Object.assign({}, b, { open: true, items });
    }));
    return { ok: true, doc: next, penId: pen.id };
  }

  // ---- pen files -----------------------------------------------------------
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pens';
  const sizeOfPen = (pen, label) => {
    const all = sizesOf(pen.model);
    return all.find((s) => s.label === label) || all.find((s) => s.label === defaultSizeLabel(pen.model)) || all[0];
  };
  // Pen file record (PenLibrary.toFilePen shape + nibMm) for one owned size.
  function toDocPen(pen, sizeLabel) {
    const size = sizeOfPen(pen, sizeLabel);
    const rec = { name: pen.name, color: pen.color, width: size.laidWidthMm };
    if (pen.model) { rec.model = pen.model; rec.size = size.label; }
    rec.nibMm = size.nominalWidthMm;
    if (pen.ink && Object.keys(pen.ink).length) rec.ink = Object.assign({}, pen.ink);
    if (pen.effect) rec.effect = pen.effect;
    if (pen.color2) rec.color2 = pen.color2;
    return rec;
  }
  const records = (pen, labels) => labels.map((l) => {
    const r = toDocPen(pen, l);
    r.penName = pen.name;
    if (labels.length > 1) r.name = `${pen.name} ${r.size || sizeOfPen(pen, l).label}`.slice(0, LIM().nameMax);
    return r;
  });
  const writeFile = (recs, boxName, stem) => {
    const PL = Vectura.PenLibrary;
    if (!PL || !PL.exportDoc || !recs.length) return { ok: false, reason: 'empty' };
    const file = PL.exportDoc(recs, boxName ? { box: { name: boxName } } : undefined);
    if (!file || !Array.isArray(file.pens) || !file.pens.length) return { ok: false, reason: 'empty' };
    let text;
    try { text = JSON.stringify(file, null, 2); } catch (_e) { return { ok: false, reason: 'invalid' }; }
    return { ok: true, text, filename: `${slug(stem)}.vectura-pens.json`, count: file.pens.length };
  };
  function exportBox(doc, boxId) {
    const box = boxById(doc, boxId);
    if (!box) return { ok: false, reason: 'missing' };
    const recs = [];
    box.items.forEach((i) => { const p = penById(doc, i.penId); if (p) recs.push(...records(p, i.sizes)); });
    return writeFile(recs, box.name, box.name);
  }
  function exportPen(doc, penId, sizeLabel) {
    const pen = penById(doc, penId);
    if (!pen) return { ok: false, reason: 'missing' };
    const own1 = boxOf(doc, penId);
    const owned = (itemIn(own1, penId) || { sizes: [defaultSizeLabel(pen.model)] }).sizes;
    const labels = sizeLabel ? [canonicalLabel(pen.model, sizeLabel)] : owned;
    return writeFile(records(pen, labels), null, pen.name);
  }
  function importBox(doc, text) {
    const PL = Vectura.PenLibrary;
    if (!PL || !PL.parseImport) return { ok: false, reason: 'unavailable' };
    if (doc.boxes.length >= LIM().maxBoxes) return { ok: false, reason: 'full' };
    const res = PL.parseImport(text);
    if (!res || !res.ok) return { ok: false, reason: (res && res.reason) || 'parse' };
    // Group records of one pen (same base name, color, model) into one pen with several sizes.
    const groups = [];
    const index = new Map();
    res.pens.forEach((r) => {
      const model = modelOf(r.model) ? r.model : null;
      const base = cleanName(r.penName || r.name) || 'Pen';
      const key = [base.toLowerCase(), String(r.color).toLowerCase(), model || ''].join('|');
      const size = (model && r.size && sizesOf(model).some((s) => s.label === canonicalLabel(model, r.size)))
        ? canonicalLabel(model, r.size) : nearestSizeLabel(model, Number(r.width));
      let g = index.get(key);
      if (!g) { g = { name: base, color: r.color, model, sizes: [], ink: r.ink, effect: r.effect, color2: r.color2, desc: r.desc }; index.set(key, g); groups.push(g); }
      g.sizes.push(size);
    });
    const defName = strings().IMPORT_BOX_DEFAULT || 'Imported box';
    const boxName = cleanBoxName(`${cleanBoxName(res.box && res.box.name) || defName} (imported)`);
    const made = createBox(doc, boxName);
    if (!made.boxId) return { ok: false, reason: 'full' };
    let d = made.doc;
    let count = 0;
    let rejected = res.rejected || 0;
    groups.forEach((g) => {
      const existing = d.pens.find((p) => p.name.toLowerCase() === g.name.toLowerCase() && p.color === String(g.color).toLowerCase() && (p.model || null) === g.model);
      if (existing) {
        const sizes = normSizes(existing.model, g.sizes);
        d = mapBox(d, made.boxId, (b) => Object.assign({}, b, { items: b.items.concat([{ penId: existing.id, sizes }]) }));
        count += 1;
        return;
      }
      const added = addPen(d, made.boxId, g);
      if (added.penId) { d = added.doc; count += 1; } else rejected += 1;
    });
    if (!count) return { ok: false, reason: 'empty' };
    return { ok: true, doc: d, boxId: made.boxId, count, rejected };
  }

  Vectura.PenStudioStore = {
    load, save, status, emptyDoc, sanitizeDoc,
    createBox, renameBox, setPinned, setOpen, deleteBox, sortedBoxes,
    addPen, movePen, removePen, setOwnedSizes, boxOf, updatePen, saveAsNew,
    sizesOf, toDocPen, exportBox, exportPen, importBox,
    // shared with PenStudioDraft
    modelDefault, cleanInk, cleanName, cleanDesc, defaultSizeLabel,
    penById, boxById,
  };
})();
