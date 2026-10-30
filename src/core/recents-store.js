/**
 * Recents store — window.Vectura.RecentsStore.
 *
 * Browser-local history of opened/saved documents for the Start Page and
 * File > Open Recent. Bulky data lives in IndexedDB (database `vectura-start`),
 * independent of the cookie-preference setting:
 *   entries  { id, name, hash, algorithm, paper, paperColor, inkColor, pens, thumb, addedAt, lastOpened, cleared, hasDoc, hasHandle, bytes, source }
 *   docs     { id, payload }     full parsed .vectura object, dropped oldest-first when over budget
 *   handles  { id, handle }      FileSystemFileHandle (Chromium only)
 * When IndexedDB is missing or throws, the same API runs from memory.
 *
 *   const store = Vectura.RecentsStore.create({ indexedDB: () => idb|null, now: () => ms, dbName })
 *   await store.record({ name, algorithm, paper, pens, thumb, payload, handle?, source }) -> entry
 *   await store.list({ limit, includeCleared }) | listWorks() | get(id) | getDoc(id) | getHandle(id)
 *   await store.clearRecent() -> token ; await store.undoClear(token) ; await store.remove(id)
 *   store.subscribe(fn) -> unsubscribe   (also dispatches window event 'vectura:recents-changed')
 *
 * Entries are never evicted by count: past `entriesMax` only the oldest entries' thumbnails are dropped. A failed
 * storage write calls opts.onWriteFailure() once.
 *
 * Every method is async and never rejects for storage failures. Mutations are
 * serialized, so concurrent record() calls cannot interleave.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const FALLBACK_LIMITS = { recentsShown: 8, entriesMax: 48, docsMaxBytes: 40 * 1024 * 1024 };
  const limits = () => Object.assign({}, FALLBACK_LIMITS, (Vectura.START_PAGE && Vectura.START_PAGE.LIMITS) || {});

  const STORES = ['entries', 'docs', 'handles'];
  const EVENT = 'vectura:recents-changed';

  const isQuota = (err) => {
    const U = Vectura.UserLibraryStore;
    if (U && U.isQuotaError) return U.isQuotaError(err);
    return Boolean(err && /quota/i.test(String(err.name || err.message || '')));
  };

  const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  // Entries are flat apart from pens[] and thumb{}: a shallow copy per level keeps callers from mutating the store
  // without a JSON round trip of a (up to 250 KB) thumbnail on every list().
  const publicEntry = (e) => ({
    ...e,
    pens: Array.isArray(e.pens) ? e.pens.map((p) => ({ ...p })) : e.pens,
    thumb: e.thumb ? { ...e.thumb } : e.thumb,
  });

  const cleanPens = (pens) => (Array.isArray(pens) ? pens : []).slice(0, 8)
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      color: typeof p.color === 'string' ? p.color.slice(0, 32) : '#000000',
      width: Number.isFinite(Number(p.width)) ? Number(p.width) : 0.3,
    }));
  const cleanThumb = (t) => (t && (t.kind === 'svg' || t.kind === 'png') && typeof t.data === 'string' && t.data
    ? { kind: t.kind, data: t.data } : null);
  const cleanName = (n) => {
    const s = typeof n === 'string' ? n.trim().slice(0, 120) : '';
    return s || 'Untitled';
  };
  const cleanText = (v) => (typeof v === 'string' ? v.slice(0, 120) : '');
  // The document's own paper / primary ink as #rrggbb (Start Page shows a file in its own colors even for a PNG thumbnail).
  const cleanHex = (v) => (typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()) ? v.trim().toLowerCase() : '');
  const docBytes = (payload) => {
    try { return JSON.stringify(payload).length; } catch (_e) { return Infinity; }
  };
  // FNV-1a over the document JSON: tells "the same file again" from "another file with the same name".
  const docHash = (payload) => {
    let str;
    try { str = JSON.stringify(payload); } catch (_e) { return ''; }
    if (typeof str !== 'string') return '';
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return `${str.length.toString(36)}-${h.toString(36)}`;
  };
  const byOldest = (a, b) => (a.lastOpened - b.lastOpened) || (a.addedAt - b.addedAt);

  const create = (opts = {}) => {
    const dbName = opts.dbName || 'vectura-start';
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    const getIdb = typeof opts.indexedDB === 'function'
      ? opts.indexedDB
      : () => { try { return G.indexedDB || null; } catch (_e) { return null; } };

    let dbPromise = null;
    const mem = { entries: new Map(), docs: new Map(), handles: new Map() };
    const handleCache = new Map();
    const entries = new Map();
    const subscribers = new Set();
    let toldWriteFailure = false;
    // A failed write (quota, abort) leaves the work only in this tab: tell the user once.
    const writeFailed = () => {
      if (toldWriteFailure) return;
      toldWriteFailure = true;
      try { if (typeof opts.onWriteFailure === 'function') opts.onWriteFailure(); } catch (_e) { /* isolated */ }
    };
    let loaded = null;
    let queue = Promise.resolve();
    let idSeq = 0;
    let clearSeq = 0;

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
            STORES.forEach((s) => {
              if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
            });
          } catch (_e) { /* resolved via onerror */ }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      });
      return dbPromise;
    };

    // kv(op, store, arg) -> { ok, result, reason }. Memory backend when no database.
    const kv = async (mode, store, fn, memFn) => {
      const db = await open();
      if (!db) {
        try { return { ok: true, result: memFn(mem[store]) }; } catch (_e) { return { ok: false, reason: 'unavailable' }; }
      }
      return new Promise((resolve) => {
        let t;
        let result;
        try {
          t = db.transaction(store, mode);
          const req = fn(t.objectStore(store));
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
    const kvPut = (store, rec) => kv('readwrite', store, (s) => s.put(rec), (m) => { m.set(rec.id, rec); });
    const kvGet = (store, id) => kv('readonly', store, (s) => s.get(id), (m) => m.get(id));
    const kvDel = (store, id) => kv('readwrite', store, (s) => s.delete(id), (m) => { m.delete(id); });
    const kvAll = (store) => kv('readonly', store, (s) => s.getAll(), (m) => Array.from(m.values()));

    const load = () => {
      if (!loaded) {
        loaded = kvAll('entries').then((res) => {
          if (res.ok && Array.isArray(res.result)) {
            res.result.forEach((e) => { if (e && typeof e.id === 'string') entries.set(e.id, e); });
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

    const notify = () => {
      subscribers.forEach((fn) => { try { fn(); } catch (_e) { /* subscriber errors never break the store */ } });
      try {
        if (typeof G.dispatchEvent === 'function' && typeof G.CustomEvent === 'function') {
          G.dispatchEvent(new G.CustomEvent(EVENT));
        }
      } catch (_e) { /* no DOM */ }
    };

    const saveEntry = async (entry) => {
      const res = await kvPut('entries', copy(entry));
      if (!res.ok) writeFailed();
      return res;
    };

    const dropDoc = async (entry) => {
      await kvDel('docs', entry.id);
      entry.hasDoc = false;
      entry.bytes = 0;
      await saveEntry(entry);
    };

    const loadHandle = async (id) => {
      if (handleCache.has(id)) return handleCache.get(id);
      const res = await kvGet('handles', id);
      const h = res.ok && res.result && res.result.handle ? res.result.handle : null;
      if (h) handleCache.set(id, h);
      return h;
    };

    // Never merge on a name alone: a different file that shares a name must not overwrite another work's copy.
    // Match the file handle, or (no handle to compare) the name AND the same document content.
    const findExisting = async (handle, name, hash) => {
      const all = Array.from(entries.values());
      const sameDoc = (e) => e.name === name && Boolean(hash) && e.hash === hash;
      if (handle) {
        for (const e of all) {
          if (!e.hasHandle) continue;
          const h = await loadHandle(e.id);
          if (!h) continue;
          try {
            if (typeof handle.isSameEntry === 'function' && (await handle.isSameEntry(h))) return e;
            if (typeof h.isSameEntry === 'function' && (await h.isSameEntry(handle))) return e;
          } catch (_e) { /* not comparable */ }
        }
        return all.find((e) => !e.hasHandle && sameDoc(e)) || null;
      }
      return all.find(sameDoc) || null;
    };

    // The cap bounds what the lists show (list() slices to the newest N), never what is kept: no work, doc or handle
    // is deleted for being old. Past the cap only the oldest entries' thumbnails go (they are regenerable from the doc).
    const enforceEntryCap = async (keepId) => {
      const max = limits().entriesMax;
      if (entries.size <= max) return;
      const beyond = Array.from(entries.values()).sort((a, b) => byOldest(b, a)).slice(max);
      for (const e of beyond) {
        if (e.id === keepId || !e.thumb) continue;
        e.thumb = null;
        await saveEntry(e);
      }
    };

    const removeNow = async (id) => {
      entries.delete(id);
      handleCache.delete(id);
      await kvDel('entries', id);
      await kvDel('docs', id);
      await kvDel('handles', id);
    };

    const otherDocs = (id) => Array.from(entries.values()).filter((e) => e.hasDoc && e.id !== id).sort(byOldest);

    const record = (input) => serial(async () => {
      await load();
      const data = input && typeof input === 'object' ? input : {};
      const name = cleanName(data.name);
      const handle = data.handle && typeof data.handle === 'object' ? data.handle : null;
      const t = now();
      // `id` (optional): update that entry in place (Save of the document a recent already tracks).
      const byId = typeof data.id === 'string' && entries.has(data.id) ? entries.get(data.id) : null;
      // forceNew: never merge by name (a Save after New Canvas is a different document with a repeated filename)
      const hash = data.payload === undefined ? '' : docHash(data.payload);
      const existing = byId || (data.forceNew === true ? null : await findExisting(handle, name, hash));
      const entry = existing || {
        id: `r-${t.toString(36)}-${(idSeq += 1).toString(36)}`,
        addedAt: t,
      };
      Object.assign(entry, {
        name,
        algorithm: cleanText(data.algorithm),
        paper: cleanText(data.paper),
        paperColor: cleanHex(data.paperColor),
        inkColor: cleanHex(data.inkColor),
        pens: cleanPens(data.pens),
        thumb: cleanThumb(data.thumb),
        lastOpened: t,
        cleared: false,
        hash,
        source: data.source === 'save' ? 'save' : 'open',
      });
      // A Save to a different file leaves an old handle pointing at stale bytes: forget it.
      if (byId && data.source === 'save' && !handle && byId.hasHandle) {
        handleCache.delete(byId.id);
        await kvDel('handles', byId.id);
        existing.hasHandle = false;
      }
      entry.hasHandle = Boolean(existing && existing.hasHandle) || Boolean(handle);

      // Document copy: keep the budget, then retry on quota by dropping the oldest others.
      const bytes = data.payload === undefined ? Infinity : docBytes(data.payload);
      const max = limits().docsMaxBytes;
      let stored = false;
      if (bytes <= max) {
        let total = otherDocs(entry.id).reduce((n, e) => n + (e.bytes || 0), 0);
        let others = otherDocs(entry.id);
        while (total + bytes > max && others.length) {
          const victim = others.shift();
          total -= victim.bytes || 0;
          await dropDoc(victim);
        }
        for (;;) {
          const res = await kvPut('docs', { id: entry.id, payload: data.payload });
          if (res.ok) { stored = true; break; }
          if (res.reason !== 'quota') break;
          others = otherDocs(entry.id);
          if (!others.length) break;
          await dropDoc(others[0]);
        }
      }
      if (!stored && data.payload !== undefined) writeFailed(); // the document copy could not be kept (too big, quota, abort)
      if (!stored && existing && existing.hasDoc) await kvDel('docs', entry.id);
      entry.hasDoc = stored;
      entry.bytes = stored ? bytes : 0;

      if (handle) {
        handleCache.set(entry.id, handle);
        const res = await kvPut('handles', { id: entry.id, handle });
        if (!res.ok) entry.hasHandle = true; // still usable this session via the cache
      }
      entries.set(entry.id, entry);
      await saveEntry(entry);
      await enforceEntryCap(entry.id);
      notify();
      return publicEntry(entry);
    });

    const list = async (o = {}) => {
      await load();
      const limit = Number.isFinite(Number(o.limit)) && o.limit !== undefined ? Math.max(0, Number(o.limit)) : limits().recentsShown;
      return Array.from(entries.values())
        .filter((e) => o.includeCleared || !e.cleared)
        .sort((a, b) => byOldest(b, a))
        .slice(0, limit)
        .map(publicEntry);
    };

    const listWorks = async () => {
      await load();
      return Array.from(entries.values())
        .sort((a, b) => (a.addedAt - b.addedAt) || (a.lastOpened - b.lastOpened))
        .map(publicEntry);
    };

    const get = async (id) => {
      await load();
      const e = entries.get(id);
      return e ? publicEntry(e) : null;
    };

    const getDoc = async (id) => {
      await load();
      const e = entries.get(id);
      if (!e || !e.hasDoc) return null;
      const res = await kvGet('docs', id);
      return res.ok && res.result && res.result.payload !== undefined ? res.result.payload : null;
    };

    const getHandle = async (id) => {
      await load();
      const e = entries.get(id);
      if (!e || !e.hasHandle) return null;
      return loadHandle(id);
    };

    const clearRecent = () => serial(async () => {
      await load();
      const ids = [];
      for (const e of entries.values()) {
        if (e.cleared) continue;
        e.cleared = true;
        ids.push(e.id);
        await saveEntry(e);
      }
      clearSeq += 1;
      notify();
      return { id: clearSeq, ids };
    });

    const undoClear = (token) => serial(async () => {
      await load();
      const ids = token && Array.isArray(token.ids) ? token.ids : [];
      for (const id of ids) {
        const e = entries.get(id);
        if (!e || !e.cleared) continue;
        e.cleared = false;
        await saveEntry(e);
      }
      notify();
    });

    const remove = (id) => serial(async () => {
      await load();
      if (!entries.has(id)) return;
      await removeNow(id);
      notify();
    });

    const subscribe = (fn) => {
      if (typeof fn !== 'function') return () => {};
      subscribers.add(fn);
      return () => { subscribers.delete(fn); };
    };

    return { record, list, listWorks, get, getDoc, getHandle, clearRecent, undoClear, remove, subscribe };
  };

  let shared = null;
  Vectura.RecentsStore = {
    create,
    shared: () => { if (!shared) shared = create(); return shared; },
    EVENT,
  };
})();
