/**
 * Start Page example-plates draft — window.Vectura.StartPageExamplePlates.
 *
 * The model behind Developer Mode's editable example plates. The shipped EXAMPLE_PLATES (src/config/start-page-picks.js)
 * become a local DRAFT of plate records that the Plates section edits with the same tools as a user's plates; the draft
 * is held in localStorage so a reload keeps it. Nothing here touches the shipped config until you export.
 *
 *   fromShipped(list)            -> [{ key, presetId, title, word, layout, pin, colors }]   (the draft's flat form)
 *   sanitizeColors(value)        -> a frozen { art?, text?, background?, title?, band? } or null (see "colors" below)
 *   serialize(list)              -> the marker-delimited EXAMPLE_PLATES region (text), ready for replaceRegion
 *   replaceRegion(source, block) -> source with the region between the markers replaced (throws if markers are missing)
 *   extractRegion(source)        -> the current region text, or null
 *   createStore({ storage, key, shipped }) -> a plates-store look-alike for StartPagePlatesSection:
 *        load() upsert(id, patch) reset(id, keys) restore(rec) reorder(ids) resetOrder() remove(id) undoRemove(token)
 *        add(presetId, { title }) subscribe(fn)
 *        plates() -> the flat list (export form)   isDirty()   resetToShipped() -> undo token   undoReset(token)
 *   Records follow the plates-store shape (layout, texts { word, title }, pin, colors ...); only presetId, title, word, layout,
 *   pin and colors are shipped, so framing / motion / description edits are ignored by the draft.
 *
 * colors (optional): the plates store's manual colors, role -> value, where a value is a hex string ('#c0392b', '#abc') or a
 * special fill ({ fill: 'iridescent' | 'iridescent-animated' | 'duotone' | 'metallic-gold' | 'metallic-silver' | 'sunset' }).
 * Roles: art, text, background, title, band (the store's names). A missing / null role (or a missing `colors`) is Auto.
 * Unknown roles and malformed values are dropped on load, never thrown. Exported canonical form (fixed role order):
 *   Object.freeze({ presetId: 'spiral-galaxy', ..., colors: Object.freeze({ title: Object.freeze({ fill: 'sunset' }), band: '#c0392b' }) }),
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const BEGIN = '// <example-plates:begin> Developer Mode > Export defaults replaces everything up to the end marker; keep both markers.';
  const END = '// <example-plates:end>';
  const KEY = 'vectura_start_page_example_draft';
  const SHIPPED_FIELDS = ['presetId', 'title', 'word', 'layout', 'pin'];
  const ROLES = ['art', 'text', 'background', 'title', 'band']; // StartPagePlatesStore SHAPES.colors order
  const FALLBACK_FILLS = ['iridescent', 'iridescent-animated', 'duotone', 'metallic-gold', 'metallic-silver', 'sunset'];
  const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i; // what StartPagePlateColors.resolve accepts
  const fillIds = () => { const F = Vectura.StartPagePlateFills; return F && Array.isArray(F.IDS) ? F.IDS : FALLBACK_FILLS; };
  const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
  // A validated, frozen copy of a `colors` value, or null when nothing valid is left (= all Auto).
  const sanitizeColors = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const out = {};
    ROLES.forEach((role) => {
      if (!Object.prototype.hasOwnProperty.call(value, role)) return;
      const v = value[role];
      if (typeof v === 'string' && HEX.test(v)) out[role] = v;
      else if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.fill === 'string' && fillIds().includes(v.fill)) out[role] = Object.freeze({ fill: v.fill });
    });
    return Object.keys(out).length ? Object.freeze(out) : null;
  };
  const colorsOf = (c) => sanitizeColors(c);
  const colorsRecord = (c) => { const k = sanitizeColors(c); if (!k) return null; const r = {}; ROLES.forEach((role) => { r[role] = k[role] ? copy(k[role]) : null; }); return r; };

  /* ------------------------------------------------------------------ flat list <-> records */
  const keyFor = (presetId, taken) => {
    let n = 0;
    let k = `example:${presetId}`;
    while (taken.has(k)) { n += 1; k = `example:${presetId}#${n}`; }
    taken.add(k);
    return k;
  };
  const fromShipped = (list) => {
    const taken = new Set();
    return (Array.isArray(list) ? list : []).filter((e) => e && str(e.presetId)).map((e) => ({
      key: keyFor(e.presetId, taken), presetId: e.presetId, title: str(e.title), word: str(e.word), layout: str(e.layout), pin: str(e.pin), colors: colorsOf(e.colors),
    }));
  };
  const recordOf = (flat, order) => ({
    id: flat.key, artId: flat.key, presetId: flat.presetId, order, hidden: false,
    layout: flat.layout || null, texts: { word: flat.word || null, title: flat.title || null, description: null },
    pin: flat.pin || null, colors: colorsRecord(flat.colors), basicColors: null, frame: null, motion: null, removed: false,
  });
  const flatOf = (rec) => ({
    key: rec.id, presetId: rec.presetId, title: str(rec.texts && rec.texts.title), word: str(rec.texts && rec.texts.word),
    layout: str(rec.layout), pin: str(rec.pin), colors: colorsOf(rec.colors),
  });

  /* ------------------------------------------------------------------ export */
  const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
  const line = (e) => {
    const parts = SHIPPED_FIELDS.filter((f) => str(e[f])).map((f) => `${f}: ${q(e[f])}`);
    const colors = sanitizeColors(e.colors);
    if (colors) parts.push(`colors: Object.freeze({ ${ROLES.filter((r) => colors[r]).map((r) => `${r}: ${typeof colors[r] === 'string' ? q(colors[r]) : `Object.freeze({ fill: ${q(colors[r].fill)} })`}`).join(', ')} })`);
    return `    Object.freeze({ ${parts.join(', ')} }),`;
  };
  const serialize = (list) => {
    const rows = (Array.isArray(list) ? list : []).filter((e) => e && str(e.presetId));
    return [`  ${BEGIN}`, '  const EXAMPLE_PLATES = Object.freeze([', ...rows.map(line), '  ]);', `  ${END}`].join('\n');
  };
  const REGION = /^[ \t]*\/\/ <example-plates:begin>[^\n]*\n[\s\S]*?^[ \t]*\/\/ <example-plates:end>[ \t]*$/m;
  const extractRegion = (source) => { const m = REGION.exec(String(source || '')); return m ? m[0] : null; };
  const replaceRegion = (source, block) => {
    const src = String(source || '');
    if (!REGION.test(src)) throw new Error('The <example-plates:begin>/<example-plates:end> markers were not found in this file. Pick src/config/start-page-picks.js.');
    return src.replace(REGION, () => block);
  };

  /* ------------------------------------------------------------------ store */
  const isPlain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const create = (opts = {}) => {
    const storageOf = () => { if (opts.storage) return opts.storage; try { return G.localStorage || null; } catch (_e) { return null; } };
    const key = opts.key || KEY;
    const shippedFlat = () => fromShipped(typeof opts.shipped === 'function' ? opts.shipped() : opts.shipped);
    const PlatesStore = () => Vectura.StartPagePlatesStore;

    let recs = null; // ordered records
    const subscribers = new Set();
    const notify = () => subscribers.forEach((fn) => { try { fn(); } catch (_e) { /* isolated */ } });

    const fromFlats = (flats) => flats.map((f, i) => recordOf(f, i));
    const persist = () => {
      const st = storageOf();
      if (!st) return;
      try {
        if (!isDirty()) st.removeItem(key); else st.setItem(key, JSON.stringify({ v: 1, plates: plates() }));
      } catch (_e) { /* quota / disabled: the draft lives in memory */ }
    };
    const ensure = () => {
      if (recs) return recs;
      let saved = null;
      const st = storageOf();
      try {
        const raw = st && st.getItem(key);
        const doc = raw ? JSON.parse(raw) : null;
        if (doc && doc.v === 1 && Array.isArray(doc.plates)) saved = fromShipped(doc.plates.map((p) => p));
        // keys survive a round trip (duplicates keep their #n)
        if (saved) doc.plates.forEach((p, i) => { if (saved[i] && typeof p.key === 'string') saved[i].key = p.key; });
      } catch (_e) { saved = null; }
      recs = fromFlats(saved || shippedFlat());
      return recs;
    };
    const plates = () => ensure().filter((r) => !r.removed).map(flatOf);
    const sig = (e) => SHIPPED_FIELDS.map((f) => e[f] || null).concat([colorsOf(e.colors)]);
    const sameList = (a, b) => JSON.stringify(a.map(sig)) === JSON.stringify(b.map(sig));
    const isDirty = () => !sameList(plates(), shippedFlat());
    const changed = () => { ensure().forEach((r, i) => { r.order = i; }); persist(); notify(); };
    const find = (id) => ensure().find((r) => r.id === id);
    const snapshot = () => ({ plates: ensure().map(copy), order: ensure().map((r) => r.id) });
    let seq = 0;

    const applyPatch = (rec, patch) => {
      const P = PlatesStore();
      if (P && typeof P.applyPatch === 'function') return P.applyPatch(rec, patch);
      const next = copy(rec);
      Object.keys(patch || {}).forEach((k) => {
        if (k === 'id') return;
        next[k] = isPlain(patch[k]) && isPlain(next[k]) ? Object.assign({}, next[k], copy(patch[k])) : copy(patch[k]);
      });
      return next;
    };

    return {
      load: async () => snapshot(),
      upsert: async (id, patch) => {
        const i = ensure().findIndex((r) => r.id === id);
        if (i < 0) return null;
        recs[i] = applyPatch(recs[i], patch);
        changed();
        return copy(recs[i]);
      },
      reset: async (id, keys) => {
        const r = find(id);
        if (!r) return null;
        const before = copy(r);
        const list = Array.isArray(keys) && keys.length ? keys : ['layout', 'texts', 'pin', 'colors'];
        list.forEach((k) => { if (k === 'texts') r.texts = { word: null, title: null, description: null }; else if (['layout', 'pin', 'colors'].includes(k)) r[k] = null; });
        changed();
        return before;
      },
      restore: async (record) => {
        if (!record || typeof record.id !== 'string') return null;
        const i = ensure().findIndex((r) => r.id === record.id);
        if (i < 0) return null;
        recs[i] = copy(record);
        changed();
        return copy(recs[i]);
      },
      reorder: async (ids) => {
        const want = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string');
        const by = new Map(ensure().map((r) => [r.id, r]));
        const next = want.filter((id) => by.has(id)).map((id) => by.get(id));
        ensure().forEach((r) => { if (!want.includes(r.id)) next.push(r); });
        recs = next;
        changed();
        return recs.map((r) => r.id);
      },
      resetOrder: async () => {
        const prev = ensure().map((r) => r.id);
        const rank = new Map(shippedFlat().map((f, i) => [f.key, i]));
        recs = ensure().slice().sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : 1e6) - (rank.has(b.id) ? rank.get(b.id) : 1e6));
        changed();
        return prev;
      },
      remove: async (id) => {
        const i = ensure().findIndex((r) => r.id === id);
        if (i < 0) return null;
        const token = { id, index: i, rec: copy(recs[i]) };
        recs.splice(i, 1);
        changed();
        return token;
      },
      undoRemove: async (token) => {
        if (!token || !token.rec) return null;
        if (!ensure().some((r) => r.id === token.id)) recs.splice(Math.min(token.index, recs.length), 0, copy(token.rec));
        changed();
        return copy(token.rec);
      },
      add: async (presetId, o = {}) => {
        const taken = new Set(ensure().map((r) => r.id));
        let k = `example:${presetId}`;
        while (taken.has(k)) { seq += 1; k = `example:${presetId}#${seq}`; }
        const rec = recordOf({ key: k, presetId, title: str(o.title), word: str(o.word), layout: str(o.layout), pin: str(o.pin), colors: o.colors }, recs.length);
        recs.push(rec);
        changed();
        return copy(rec);
      },
      subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },
      plates,
      isDirty,
      shipped: shippedFlat,
      resetToShipped: async () => {
        const token = { recs: ensure().map(copy) };
        recs = fromFlats(shippedFlat());
        changed();
        return token;
      },
      undoReset: async (token) => {
        if (!token || !Array.isArray(token.recs)) return;
        recs = token.recs.map(copy);
        changed();
      },
    };
  };

  Vectura.StartPageExamplePlates = { create, fromShipped, sanitizeColors, serialize, replaceRegion, extractRegion, BEGIN, END, KEY, SHIPPED_FIELDS, COLOR_ROLES: ROLES };
})();
