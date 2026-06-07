/*
 * Vectura Studio — Preset Folder Store (Phase 2, Chromium-only).
 *
 * A thin, feature-detected wrapper over the File System Access API + IndexedDB
 * that lets a user back their custom presets with a folder on disk so they
 * persist across browser sessions (beyond localStorage). The localStorage
 * mirror stays authoritative for the in-browser gallery; the folder is a
 * ONE-WAY, last-write-wins durable export — no sync engine, no tombstones.
 *
 * Why IndexedDB: a `FileSystemDirectoryHandle` is structured-cloneable and can
 * be stored in IndexedDB, but it is NOT JSON-serializable, so it can't live in
 * SETTINGS/cookies/localStorage. Permission to a stored handle does NOT survive
 * a reload — the caller must re-request it from a user gesture ("Reconnect").
 *
 * Everything degrades gracefully: on Safari/Firefox (no `showDirectoryPicker`)
 * `isSupported()` is false and every async method resolves to a safe no-op.
 *
 * Registered as window.Vectura.PresetFolderStore.
 *
 * Test seams (never used in production paths):
 *   __setHandleForTests(handle)  — inject a fake FileSystemDirectoryHandle
 *   __setKVForTests({get,set,del}) — inject a fake IndexedDB KV
 *   __reset()                    — clear in-memory state
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  const DB_NAME = 'vectura';
  const STORE = 'kv';
  const HANDLE_KEY = 'presetFolderHandle';
  const RW = { mode: 'readwrite' };

  // ── IndexedDB KV (best-effort) ───────────────────────────────────────────────
  // Falls back to an in-memory map when IndexedDB is unavailable (test env / old
  // browsers) so the rest of the module still works within a session. Tests can
  // inject a fake via __setKVForTests.
  const memKV = new Map();
  let kvOverride = null;

  const idbOpen = () => new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') { reject(new Error('no-indexeddb')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb-open-failed'));
    } catch (e) { reject(e); }
  });

  const idbReq = (store, op, ...args) => new Promise((resolve, reject) => {
    const r = store[op](...args);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

  const KV = {
    async get(key) {
      if (kvOverride) return kvOverride.get(key);
      try {
        const db = await idbOpen();
        const tx = db.transaction(STORE, 'readonly');
        const val = await idbReq(tx.objectStore(STORE), 'get', key);
        db.close();
        return val;
      } catch (_) { return memKV.get(key); }
    },
    async set(key, val) {
      if (kvOverride) return kvOverride.set(key, val);
      try {
        const db = await idbOpen();
        const tx = db.transaction(STORE, 'readwrite');
        await idbReq(tx.objectStore(STORE), 'put', val, key);
        db.close();
      } catch (_) { memKV.set(key, val); }
    },
    async del(key) {
      if (kvOverride) return kvOverride.del(key);
      try {
        const db = await idbOpen();
        const tx = db.transaction(STORE, 'readwrite');
        await idbReq(tx.objectStore(STORE), 'delete', key);
        db.close();
      } catch (_) { memKV.delete(key); }
    },
  };

  // ── State ─────────────────────────────────────────────────────────────────────
  let handle = null; // cached FileSystemDirectoryHandle

  const isSupported = () =>
    typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

  // Load any previously-connected handle from IndexedDB into memory. Call once at
  // startup. Does NOT request permission (that needs a user gesture).
  const init = async () => {
    if (handle) return handle;
    try { handle = (await KV.get(HANDLE_KEY)) || null; } catch (_) { handle = null; }
    return handle;
  };

  const hasHandle = () => !!handle;

  // Pick a folder (must be called from a user gesture). Persists the handle.
  const connect = async () => {
    if (!isSupported()) return null;
    let picked;
    try { picked = await window.showDirectoryPicker(RW); }
    catch (_) { return null; } // user cancelled or denied
    handle = picked;
    await KV.set(HANDLE_KEY, picked);
    return { name: picked.name };
  };

  const disconnect = async () => {
    handle = null;
    await KV.del(HANDLE_KEY);
  };

  // { connected, name, permission } — permission ∈ 'granted'|'prompt'|'denied'|'unsupported'.
  const getStatus = async () => {
    if (!isSupported()) return { connected: false, name: null, permission: 'unsupported' };
    const h = handle || (await init());
    if (!h) return { connected: false, name: null, permission: null };
    let permission = 'prompt';
    try {
      if (typeof h.queryPermission === 'function') permission = await h.queryPermission(RW);
    } catch (_) { permission = 'prompt'; }
    return { connected: true, name: h.name, permission };
  };

  // Re-request permission (must be a user gesture). Returns true on grant.
  const reconnect = async () => {
    const h = handle || (await init());
    if (!h || typeof h.requestPermission !== 'function') return false;
    let res;
    try { res = await h.requestPermission(RW); } catch (_) { return false; }
    return res === 'granted';
  };

  // Internal: ensure we have a usable handle with granted permission. `interactive`
  // allows a permission request (only pass true from a user gesture).
  const ensureWritable = async (interactive) => {
    const h = handle || (await init());
    if (!h) return null;
    let perm = 'prompt';
    try { if (typeof h.queryPermission === 'function') perm = await h.queryPermission(RW); } catch (_) {}
    if (perm === 'granted') return h;
    if (interactive && typeof h.requestPermission === 'function') {
      try { if ((await h.requestPermission(RW)) === 'granted') return h; } catch (_) {}
    }
    return null;
  };

  // Write <folder>/<system>/<slug>.vectura. Returns true on success. Silent on
  // failure (the localStorage mirror is always the authoritative copy).
  const writePreset = async (system, slug, doc) => {
    if (!system || !slug) return false;
    const h = await ensureWritable(false);
    if (!h) return false;
    try {
      const dir = await h.getDirectoryHandle(system, { create: true });
      const file = await dir.getFileHandle(`${slug}.vectura`, { create: true });
      const writable = await file.createWritable();
      await writable.write(typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2));
      await writable.close();
      return true;
    } catch (_) { return false; }
  };

  const deletePreset = async (system, slug) => {
    const h = await ensureWritable(false);
    if (!h) return false;
    try {
      const dir = await h.getDirectoryHandle(system, { create: false });
      await dir.removeEntry(`${slug}.vectura`);
      return true;
    } catch (_) { return false; }
  };

  // Scan the folder: each subdirectory is a system; each *.vectura file a preset.
  // Returns [{ system, slug, doc, mtime }] where mtime is the file's last-modified
  // epoch ms (the two-way sync's last-write-wins tiebreak for hand-edited files
  // whose embedded meta.savedAt is stale). Empty on no-permission/failure.
  const readAll = async () => {
    const h = await ensureWritable(false);
    if (!h || typeof h.values !== 'function') return [];
    const out = [];
    try {
      for await (const entry of h.values()) {
        if (entry.kind !== 'directory') continue;
        const system = entry.name;
        for await (const f of entry.values()) {
          if (f.kind !== 'file' || !/\.vectura$/i.test(f.name)) continue;
          try {
            const file = await f.getFile();
            const text = await file.text();
            out.push({
              system,
              slug: f.name.replace(/\.vectura$/i, ''),
              doc: JSON.parse(text),
              mtime: file && typeof file.lastModified === 'number' ? file.lastModified : 0,
            });
          } catch (_) { /* skip unreadable/invalid file */ }
        }
      }
    } catch (_) { /* permission revoked mid-scan */ }
    return out;
  };

  Vectura.PresetFolderStore = {
    isSupported, init, hasHandle, connect, disconnect,
    getStatus, reconnect, writePreset, deletePreset, readAll,
    // ── test seams ──
    __setHandleForTests(h) { handle = h; },
    __setKVForTests(kv) { kvOverride = kv; },
    __reset() { handle = null; kvOverride = null; memKV.clear(); },
  };
})();
