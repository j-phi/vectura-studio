/**
 * Start Page plates store — window.Vectura.StartPagePlatesStore.
 *
 * Persists per-plate user edits (layout, texts, pin, manual colors, frame, motion, order, removal) in
 * IndexedDB (database `vectura-start-plates`, stores `plates` + `meta`), independent of the cookie setting.
 * Falls back to memory when IndexedDB is missing or throws. Edits are never deleted by a mode change:
 * effectiveFor(record, mode) only decides what the UI applies in that mode.
 *
 * Record: { id, artId, order, hidden, layout|null, texts|null, pin|null, colors|null, basicColors|null,
 *           frame|null, motion|null, removed, removedAt? }
 *
 *   const store = Vectura.StartPagePlatesStore.create({ indexedDB: () => idb|null, dbName, onFallback? })
 *     onFallback() runs once when IndexedDB is blocked or fails to open (the store then keeps edits in memory).
 *   await store.load() -> { plates, order }       await store.upsert(id, patch) -> record (deep-merge)
 *   await store.reset(id, keys?) -> previous record | null     await store.restore(record)
 *   await store.reorder(ids) | resetOrder() -> previous order
 *   await store.remove(id) -> token | null ; await store.undoRemove(token) ; await store.add(artId, { duplicate? }) -> record
 *   store.subscribe(fn) -> unsubscribe
 *   StartPagePlatesStore.effectiveFor(record, mode) ; .canEdit(mode)
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const STORES = ['plates', 'meta'];
  const ORDER_KEY = 'order';
  const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const isPlain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

  // Field -> default value, and the full object shape used when a patch merges into a null field.
  const SHAPES = {
    texts: { word: null, title: null, description: null },
    colors: { art: null, text: null, background: null },
    basicColors: { ink: null },
    frame: { fit: null, z: null, cx: null, cy: null },
    motion: { animateIn: null, hover: null },
  };
  const FIELDS = ['layout', 'texts', 'pin', 'colors', 'basicColors', 'frame', 'motion'];

  const blank = (id, artId, order) => ({
    id, artId: artId == null ? id : artId, order: order == null ? 0 : order, hidden: false,
    layout: null, texts: null, pin: null, colors: null, basicColors: null, frame: null, motion: null, removed: false,
  });

  const merge = (base, patch) => {
    const out = isPlain(base) ? copy(base) : {};
    Object.keys(patch).forEach((k) => {
      const pv = patch[k];
      out[k] = isPlain(pv) && isPlain(out[k]) && !('fill' in pv) ? merge(out[k], pv) : copy(pv);
    });
    return out;
  };

  const applyPatch = (rec, patch) => {
    const next = copy(rec);
    Object.keys(patch || {}).forEach((k) => {
      if (k === 'id') return;
      const pv = patch[k];
      if (isPlain(pv) && SHAPES[k]) next[k] = merge(isPlain(next[k]) ? next[k] : SHAPES[k], pv);
      else next[k] = copy(pv);
    });
    return next;
  };

  const MODE_FIELDS = {
    curated: ['layout', 'texts', 'pin', 'colors', 'frame', 'motion'],
    basic: ['layout', 'texts', 'frame', 'motion', 'basicColors'],
    mono: ['layout', 'texts', 'frame', 'motion'],
    wildcard: ['layout', 'texts', 'frame', 'motion'],
    random: ['layout', 'texts', 'frame', 'motion'],
  };

  const effectiveFor = (record, mode) => {
    const allowed = MODE_FIELDS[mode] || [];
    const out = { id: record && record.id, artId: record && record.artId,
      hidden: Boolean(record && record.hidden), removed: Boolean(record && record.removed) };
    FIELDS.forEach((f) => {
      out[f] = record && allowed.includes(f) && record[f] !== undefined ? copy(record[f]) : null;
    });
    return out;
  };
  const canEdit = (mode) => mode === 'curated' || mode === 'basic';

  const create = (opts = {}) => {
    const dbName = opts.dbName || 'vectura-start-plates';
    const getIdb = typeof opts.indexedDB === 'function'
      ? opts.indexedDB
      : () => { try { return G.indexedDB || null; } catch (_e) { return null; } };

    let dbPromise = null;
    const mem = { plates: new Map(), meta: new Map() };
    const plates = new Map();
    let orderIds = [];
    const subscribers = new Set();
    let loaded = null;
    let queue = Promise.resolve();
    let seq = 0;

    // Called once when IndexedDB exists but cannot be opened (blocked, errored): edits then live in memory only.
    let told = false;
    const fellBack = () => { if (told) return; told = true; try { if (typeof opts.onFallback === 'function') opts.onFallback(); } catch (_e) { /* isolated */ } };
    const open = () => {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve) => {
        let idb = null;
        try { idb = getIdb(); } catch (_e) { idb = null; }
        if (!idb || typeof idb.open !== 'function') { resolve(null); return; }
        let req;
        try { req = idb.open(dbName, 1); } catch (_e) { fellBack(); resolve(null); return; }
        req.onupgradeneeded = () => {
          try {
            const db = req.result;
            STORES.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); });
          } catch (_e) { /* resolved via onerror */ }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { fellBack(); resolve(null); };
        req.onblocked = () => { fellBack(); resolve(null); };
      });
      return dbPromise;
    };

    const kv = async (mode, store, fn, memFn) => {
      const db = await open();
      if (!db) {
        try { return { ok: true, result: memFn(mem[store]) }; } catch (_e) { return { ok: false }; }
      }
      return new Promise((resolve) => {
        let t;
        let result;
        try {
          t = db.transaction(store, mode);
          const req = fn(t.objectStore(store));
          if (req) req.onsuccess = () => { result = req.result; };
        } catch (_e) { resolve({ ok: false }); return; }
        t.oncomplete = () => resolve({ ok: true, result });
        t.onerror = () => resolve({ ok: false });
        t.onabort = () => resolve({ ok: false });
      });
    };
    const put = (store, rec) => kv('readwrite', store, (s) => s.put(copy(rec)), (m) => { m.set(rec.id, copy(rec)); });
    const del = (store, id) => kv('readwrite', store, (s) => s.delete(id), (m) => { m.delete(id); });
    const all = (store) => kv('readonly', store, (s) => s.getAll(), (m) => Array.from(m.values()).map(copy));

    const ensureLoaded = () => {
      if (!loaded) {
        loaded = Promise.all([all('plates'), all('meta')]).then(([p, m]) => {
          if (p.ok && Array.isArray(p.result)) p.result.forEach((r) => { if (r && typeof r.id === 'string') plates.set(r.id, r); });
          if (m.ok && Array.isArray(m.result)) {
            const o = m.result.find((r) => r && r.id === ORDER_KEY);
            if (o && Array.isArray(o.ids)) orderIds = o.ids.filter((x) => typeof x === 'string');
          }
        });
      }
      return loaded;
    };

    const serial = (fn) => {
      const run = queue.then(fn, fn);
      queue = run.then(() => undefined, () => undefined);
      return run;
    };
    const notify = () => subscribers.forEach((fn) => { try { fn(); } catch (_e) { /* isolated */ } });
    const mutate = (fn) => serial(async () => { await ensureLoaded(); const r = await fn(); notify(); return r; });

    const saveOrder = () => put('meta', { id: ORDER_KEY, ids: orderIds.slice() });
    const save = async (rec) => { plates.set(rec.id, rec); await put('plates', rec); return copy(rec); };
    const snapshot = () => {
      const list = Array.from(plates.values());
      const rank = (r) => { const i = orderIds.indexOf(r.id); return i < 0 ? orderIds.length + r.order : i; };
      list.sort((a, b) => rank(a) - rank(b));
      return { plates: list.map(copy), order: orderIds.slice() };
    };

    return {
      load: () => serial(async () => { await ensureLoaded(); return snapshot(); }),
      upsert: (id, patch) => mutate(async () => {
        const base = plates.get(id) || blank(id, id, plates.size);
        return save(applyPatch(base, patch));
      }),
      reset: (id, keys) => mutate(async () => {
        const prev = plates.get(id);
        if (!prev) return null;
        const before = copy(prev);
        const next = copy(prev);
        const list = Array.isArray(keys) && keys.length ? keys : FIELDS.concat(['hidden']);
        list.forEach((k) => { if (FIELDS.includes(k)) next[k] = null; else if (k === 'hidden') next.hidden = false; });
        await save(next);
        return before;
      }),
      restore: (record) => mutate(async () => {
        if (!record || typeof record.id !== 'string') return null;
        return save(copy(record));
      }),
      reorder: (ids) => mutate(async () => {
        const list = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string');
        orderIds = list;
        for (let i = 0; i < list.length; i += 1) {
          const rec = plates.get(list[i]) || blank(list[i], list[i], i);
          rec.order = i;
          await save(rec);
        }
        await saveOrder();
        return orderIds.slice();
      }),
      resetOrder: () => mutate(async () => {
        const prev = orderIds.slice();
        orderIds = [];
        await del('meta', ORDER_KEY);
        return prev;
      }),
      remove: (id) => mutate(async () => {
        const prev = plates.get(id) || blank(id, id, plates.size);
        const token = { id, prev: copy(prev), prevOrder: orderIds.slice() };
        await save(Object.assign(copy(prev), { removed: true, removedAt: Date.now() }));
        return token;
      }),
      undoRemove: (token) => mutate(async () => {
        if (!token || !token.prev) return null;
        const rec = await save(copy(token.prev));
        if (Array.isArray(token.prevOrder) && orderIds.length) { orderIds = token.prevOrder.slice(); await saveOrder(); }
        return rec;
      }),
      // `duplicate: true` means the work already shows a plate (recorded or not): always mint a new `${artId}#n` id so the
      // original plate is never touched (its record may not exist yet).
      add: (artId, opts) => mutate(async () => {
        let id = opts && opts.duplicate ? `${artId}#${(seq += 1)}` : artId;
        while (plates.has(id)) { seq += 1; id = `${artId}#${seq}`; }
        const rec = blank(id, artId, plates.size);
        await save(rec);
        orderIds = orderIds.concat(id);
        await saveOrder();
        return copy(rec);
      }),
      subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },
    };
  };

  Vectura.StartPagePlatesStore = { create, effectiveFor, canEdit, FIELDS: FIELDS.slice() };
})();
