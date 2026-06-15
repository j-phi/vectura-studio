/*
 * Vectura Studio — Preset Sync (Phase 3, read-back from disk).
 *
 * The write direction (browser → folder) is handled at save time by the gallery's
 * mirrorToFolder. This module is the READ direction: pulling external changes in a
 * connected folder back into localStorage so presets edited on another machine
 * (via Dropbox/iCloud/Drive) — or hand-edited on disk — appear in the app.
 *
 * Design (locked 2026-06-07):
 *   - ADDITIVE-ONLY. A file missing from disk never deletes its browser preset
 *     (no tombstones). pullFromFolder only ever adds or updates localStorage.
 *   - LAST-WRITE-WINS. A preset present on both sides is pulled in only when the
 *     disk copy is strictly newer; a strictly-newer browser copy is never clobbered.
 *     "Newer" = max(meta.savedAt, file mtime) on disk vs the preset's browser savedAt.
 *   - No FS watcher exists in browsers, so callers trigger this on connect, launch,
 *     tab focus, and a manual Refresh button — never reactively.
 *   - Pull writes ONLY localStorage; it never writes back to disk, so it can't loop
 *     with the write path. It is idempotent: a second pull with no disk change is a
 *     no-op (imported/updated both 0).
 *
 * Storage shape mirrors PresetBundle: vectura.user_presets.<system> → preset[].
 * On-disk file shape (written by buildDoc / the gallery):
 *   { type:'vectura', version, name,
 *     meta:{ presetId, group, system, savedAt }, layers:[{ type, params }] }
 * Files without meta (older Phase-2 writes, hand-made) still import — matched by
 * (system, slugified name) and assigned a deterministic id.
 *
 * Registered as window.Vectura.PresetSync. Storage-only (no UI) and dependency-
 * injectable (opts.store) so it is unit-testable with jsdom localStorage.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  const PREFIX = 'vectura.user_presets.';

  // Transform/seed keys that are never part of a preset's look — stripped on
  // import so a hand-made or cross-version file can't reintroduce a position/seed.
  // Mirrors the gallery's STRIP and scripts/build-user-presets.js TRANSFORM_KEYS.
  const STRIP = new Set(['seed', 'posX', 'posY', 'scaleX', 'scaleY', 'rotation']);

  const slug = (str) =>
    String(str == null ? '' : str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const readArray = (key) => {
    try {
      const raw = typeof localStorage !== 'undefined' && localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  };

  const writeArray = (key, arr) => {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(arr)); }
    catch (_) { /* quota / security — caller's localStorage stays authoritative */ }
  };

  const stripParams = (params) =>
    Object.fromEntries(Object.entries(params || {}).filter(([k]) => !STRIP.has(k)));

  // Build the on-disk doc for a preset. The single source of truth for the file
  // format so the gallery's save mirror and the connect-seed write identically.
  // `now` is injectable for deterministic tests; defaults to wall-clock.
  const buildDoc = (system, preset, now) => {
    const p = preset || {};
    const savedAt = Number(p.savedAt) || (typeof now === 'function' ? now() : Date.now());
    return {
      type: 'vectura',
      version: (window.Vectura || {}).VERSION,
      name: p.name || system,
      meta: { presetId: p.id || null, group: p.group || 'User', system, savedAt },
      layers: [{ type: system, params: { ...(p.params || {}) } }],
    };
  };

  // Parse a disk doc into a normalized preset, or null if it isn't a usable
  // single-layer preset for `system`. `slugName` is the filename slug used as the
  // name fallback for nameless files; `mtime` is the file's last-modified epoch ms.
  const parseDoc = (system, doc, slugName, mtime) => {
    if (!doc || typeof doc !== 'object' || doc.type !== 'vectura') return null;
    const layers = Array.isArray(doc.layers) ? doc.layers : [];
    const layer = layers.find((l) => l && l.type === system) || layers[0];
    if (!layer || !layer.params || typeof layer.params !== 'object') return null;
    const meta = (doc.meta && typeof doc.meta === 'object') ? doc.meta : {};
    const name = (typeof doc.name === 'string' && doc.name.trim())
      ? doc.name.trim()
      : (slugName || system);
    // Prefer the embedded logical save time, but let a newer raw file mtime win so
    // a hand-edit that doesn't bump meta.savedAt is still picked up.
    const savedAt = Math.max(Number(meta.savedAt) || 0, Number(mtime) || 0) || 0;
    return {
      id: (typeof meta.presetId === 'string' && meta.presetId) ? meta.presetId : null,
      name,
      group: (typeof meta.group === 'string' && meta.group) ? meta.group : 'User',
      params: stripParams(layer.params),
      savedAt,
    };
  };

  // Reconcile one parsed disk entry into a system's preset list (mutated in place).
  // Returns 'imported' | 'updated' | null (no change). Additive + LWW; never deletes.
  const reconcileOne = (system, list, entry) => {
    // Match by stable id first, then by slugified name (handles meta-less files
    // and keeps repeated pulls idempotent since the filename == slug(name)).
    let idx = entry.id ? list.findIndex((p) => p.id === entry.id) : -1;
    if (idx < 0) idx = list.findIndex((p) => slug(p.name) === slug(entry.name));

    if (idx < 0) {
      // New on disk → import. A deterministic id keeps a meta-less file from
      // re-importing as a duplicate on the next pull.
      const id = entry.id || `user-${system}-${slug(entry.name) || 'preset'}`;
      // If that synthesized id already exists (different name, same slug edge), skip.
      if (list.some((p) => p.id === id)) return null;
      list.push({
        id,
        name: entry.name,
        preset_system: system,
        group: entry.group || 'User',
        params: entry.params,
        savedAt: entry.savedAt || 0,
      });
      return 'imported';
    }

    const cur = list[idx];
    const curSaved = Number(cur.savedAt) || 0;
    // Pull only when the disk copy is strictly newer — never clobber a newer
    // (or equal) browser copy. Equal timestamps → no-op → idempotent.
    if (entry.savedAt > curSaved) {
      list[idx] = {
        ...cur,
        name: entry.name,
        group: cur.group || entry.group || 'User',
        params: entry.params,
        savedAt: entry.savedAt,
      };
      return 'updated';
    }
    return null;
  };

  // Pull all presets from the connected folder into localStorage.
  // Returns { imported, updated, skipped }. Resolves to all-zero (never throws)
  // when there's no store / no folder / no permission.
  const pullFromFolder = async (opts = {}) => {
    const out = { imported: 0, updated: 0, skipped: 0 };
    const Store = opts.store || (window.Vectura && window.Vectura.PresetFolderStore);
    if (!Store || typeof Store.readAll !== 'function') return out;

    let files;
    try { files = await Store.readAll(); } catch (_) { return out; }
    if (!Array.isArray(files) || !files.length) return out;

    // Group entries by system so each localStorage key is read/written once.
    const bySystem = new Map();
    for (const f of files) {
      const entry = parseDoc(f.system, f.doc, f.slug, f.mtime);
      if (!entry) { out.skipped += 1; continue; }
      if (!bySystem.has(f.system)) bySystem.set(f.system, []);
      bySystem.get(f.system).push(entry);
    }

    for (const [system, entries] of bySystem) {
      const key = PREFIX + system;
      const list = readArray(key);
      let dirty = false;
      for (const entry of entries) {
        const res = reconcileOne(system, list, entry);
        if (res === 'imported') { out.imported += 1; dirty = true; }
        else if (res === 'updated') { out.updated += 1; dirty = true; }
      }
      if (dirty) writeArray(key, list);
    }
    return out;
  };

  Vectura.PresetSync = { slug, buildDoc, parseDoc, reconcileOne, pullFromFolder, STRIP };
})();
