/**
 * Texture store — window.Vectura.TextureStore.
 *
 * Browser-local storage for image data that is too big for localStorage
 * (custom paper textures). IndexedDB database `vectura-textures`, object
 * store `textures`, records keyed by a content ref ('img-…'):
 *   { ref, tile: 'data:image/webp;base64,…', height?: 'data:…', tileMm, w, h, savedAt }
 *
 *   const store = Vectura.TextureStore.create({ dbName, storeName, indexedDB: () => idb })
 *   await store.put(record)  -> { ok } | { ok:false, reason: 'quota'|'unavailable'|'invalid' }
 *   await store.get(ref)     -> record | null
 *   await store.remove(ref)  -> { ok } | { ok:false, reason }
 *   await store.keys()       -> [ref…]
 *
 * Every IndexedDB call is wrapped (private mode, blocked storage, quota):
 * failures resolve a reason, never throw. Records are validated on the way
 * in and out (data URLs must be real PNG/JPEG/WebP; see PaperImage).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const REF_RE = /^img-[a-z0-9]{8,24}$/;
  const isQuota = (err) => {
    const U = Vectura.UserLibraryStore;
    if (U && U.isQuotaError) return U.isQuotaError(err);
    return Boolean(err && /quota/i.test(String(err.name || err.message || '')));
  };

  const cleanRecord = (rec) => {
    if (!rec || typeof rec !== 'object' || !REF_RE.test(rec.ref)) return null;
    const PI = Vectura.PaperImage;
    const valid = (v) => (PI && PI.validateDataUrl ? PI.validateDataUrl(v) : null);
    const tile = valid(rec.tile);
    if (!tile) return null;
    const out = { ref: rec.ref, tile };
    const height = rec.height ? valid(rec.height) : null;
    if (height) out.height = height;
    ['tileMm', 'w', 'h'].forEach((k) => {
      const n = Number(rec[k]);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    });
    out.savedAt = Number.isFinite(Number(rec.savedAt)) ? Number(rec.savedAt) : Date.now();
    return out;
  };

  const create = (opts = {}) => {
    const dbName = opts.dbName || 'vectura-textures';
    const storeName = opts.storeName || 'textures';
    const getIdb = typeof opts.indexedDB === 'function'
      ? opts.indexedDB
      : () => { try { return G.indexedDB || null; } catch (_e) { return null; } };
    let dbPromise = null;

    const open = () => {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve) => {
        let idb = null;
        try { idb = getIdb(); } catch (_e) { idb = null; }
        if (!idb || typeof idb.open !== 'function') { resolve(null); return; }
        let req;
        try { req = idb.open(dbName, 1); } catch (_e) { resolve(null); return; }
        req.onupgradeneeded = () => {
          try {
            const db = req.result;
            if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'ref' });
          } catch (_e) { /* resolved via onerror */ }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      }).then((db) => {
        if (!db) dbPromise = null; // retry next time (e.g. permission granted later)
        return db;
      });
      return dbPromise;
    };

    const tx = async (mode, fn) => {
      const db = await open();
      if (!db) return { ok: false, reason: 'unavailable' };
      return new Promise((resolve) => {
        let t;
        try {
          t = db.transaction(storeName, mode);
        } catch (err) {
          resolve({ ok: false, reason: isQuota(err) ? 'quota' : 'unavailable' });
          return;
        }
        let result;
        try {
          const req = fn(t.objectStore(storeName));
          if (req) req.onsuccess = () => { result = req.result; };
        } catch (err) {
          resolve({ ok: false, reason: isQuota(err) ? 'quota' : 'unavailable' });
          return;
        }
        t.oncomplete = () => resolve({ ok: true, result });
        t.onerror = () => resolve({ ok: false, reason: isQuota(t.error) ? 'quota' : 'unavailable' });
        t.onabort = () => resolve({ ok: false, reason: isQuota(t.error) ? 'quota' : 'unavailable' });
      });
    };

    const put = async (record) => {
      const rec = cleanRecord(record);
      if (!rec) return { ok: false, reason: 'invalid' };
      const res = await tx('readwrite', (s) => s.put(rec));
      return res.ok ? { ok: true, ref: rec.ref } : res;
    };
    const get = async (ref) => {
      if (!REF_RE.test(String(ref))) return null;
      const res = await tx('readonly', (s) => s.get(ref));
      return res.ok ? cleanRecord(res.result) : null;
    };
    const remove = async (ref) => {
      if (!REF_RE.test(String(ref))) return { ok: false, reason: 'invalid' };
      const res = await tx('readwrite', (s) => s.delete(ref));
      return res.ok ? { ok: true } : res;
    };
    const keys = async () => {
      const res = await tx('readonly', (s) => (s.getAllKeys ? s.getAllKeys() : null));
      return res.ok && Array.isArray(res.result) ? res.result.filter((k) => REF_RE.test(String(k))) : [];
    };

    return { put, get, remove, keys, REF_RE };
  };

  let shared = null;
  const shared_ = () => { if (!shared) shared = create(); return shared; };

  Vectura.TextureStore = { create, shared: shared_, REF_RE, cleanRecord };
})();
