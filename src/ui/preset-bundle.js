/*
 * Vectura Studio — Preset Bundle (Phase 2).
 *
 * Export/import of ALL localStorage user presets as a single schema-versioned
 * JSON file (`vectura-presets.json`). This is the portable interchange format:
 * the graceful fallback for browsers without the File System Access API
 * (Safari/Firefox), and a hand-carry path between machines on any browser.
 *
 * User presets live in localStorage under `vectura.user_presets.<system>` (a
 * JSON array per algorithm) — the same keys the gallery reads/writes. This
 * module is storage-only (no UI) so it is unit-testable with jsdom localStorage.
 *
 * Registered as window.Vectura.PresetBundle.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  const PREFIX = 'vectura.user_presets.';
  const SCHEMA = 'vectura-presets';
  const VERSION = 1;

  const systemFromKey = (key) => key.slice(PREFIX.length);

  const readArray = (key) => {
    try {
      const raw = typeof localStorage !== 'undefined' && localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  };

  // Enumerate every `vectura.user_presets.<system>` key currently in localStorage.
  const presetKeys = () => {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) keys.push(k);
      }
    } catch (_) { /* no localStorage */ }
    return keys;
  };

  // { schema, version, presets: { <system>: [presetObj, …] } }. Empty systems omitted.
  const exportAll = () => {
    const presets = {};
    for (const key of presetKeys()) {
      const arr = readArray(key);
      if (arr.length) presets[systemFromKey(key)] = arr;
    }
    return { schema: SCHEMA, version: VERSION, presets };
  };

  const countAll = () => {
    let n = 0;
    for (const key of presetKeys()) n += readArray(key).length;
    return n;
  };

  // Trigger a download of the bundle. `stamp` (optional) is appended to the
  // filename by the caller-provided string (timestamps come from the caller —
  // this module stays deterministic/testable).
  const download = (stamp) => {
    const bundle = exportAll();
    try {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = stamp ? `vectura-presets-${stamp}.json` : 'vectura-presets.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch (_) { return false; }
  };

  const isValidBundle = (bundle) =>
    !!bundle && typeof bundle === 'object' && bundle.schema === SCHEMA &&
    bundle.presets && typeof bundle.presets === 'object';

  // Import a bundle. mode 'merge' (default) adds bundle presets to existing ones,
  // de-duping by preset id (bundle wins on collision); mode 'replace' overwrites
  // each present system wholesale. Returns { imported, systems } or null on bad input.
  const importBundle = (bundle, mode = 'merge') => {
    if (!isValidBundle(bundle)) return null;
    let imported = 0;
    const systems = [];
    for (const system of Object.keys(bundle.presets)) {
      const incoming = Array.isArray(bundle.presets[system]) ? bundle.presets[system] : [];
      if (!incoming.length) continue;
      const key = PREFIX + system;
      let next;
      if (mode === 'replace') {
        next = incoming.slice();
      } else {
        const existing = readArray(key);
        const byId = new Map(existing.map((p) => [p.id, p]));
        incoming.forEach((p) => { if (p && p.id) byId.set(p.id, p); }); // bundle wins
        next = Array.from(byId.values());
      }
      try { localStorage.setItem(key, JSON.stringify(next)); } catch (_) { /* quota */ }
      imported += incoming.length;
      systems.push(system);
    }
    return { imported, systems };
  };

  Vectura.PresetBundle = { SCHEMA, VERSION, exportAll, countAll, download, importBundle, isValidBundle };
})();
