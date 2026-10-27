/**
 * User library store — window.Vectura.UserLibraryStore.
 *
 * A small, generic, browser-local library of user-made items (custom papers
 * today; "My pens" reuses it). Items live in ONE localStorage key as
 *   { schema, version, <itemsKey>: [ item, … ] }
 * and the same document shape is the export/import file format.
 *
 *   const store = Vectura.UserLibraryStore.create({
 *     key: 'vectura.customPapers',   // localStorage key
 *     schema: 'vectura-papers',      // file/storage schema id
 *     version: 1,                    // current schema version (files with a higher one are refused)
 *     itemsKey: 'papers',            // array key in the document
 *     validate: (raw) => item|null,  // whitelists/clamps an untrusted item (id is handled here)
 *     max: 64,                       // max items
 *     maxBytes: 512 * 1024,          // import / storage size cap
 *     idPrefix: 'custom-',           // ids are idPrefix + 7 [a-z0-9]
 *     fileStem: 'vectura-papers',    // export file name stem
 *     appVersion: () => '1.4.30',    // stamped into exports
 *   });
 *
 *   store.list() / get(id) / has(id) / newId()
 *   store.put(item)            -> { ok, item } | { ok:false, reason }
 *   store.rename(id, name)     -> { ok, item } | { ok:false, reason }
 *   store.remove(id)           -> { ok } | { ok:false, reason }
 *   store.exportOne(id) / exportAll() -> { ok, text, filename, count }
 *   store.importBundle(text, 'merge') -> { ok, added:[items], skipped, renamed, rejected, full }
 *                                      | { ok:false, reason }
 *   store.onChange(fn) -> unsubscribe   (also dispatches window 'vectura:library-change' {key})
 *
 * reason ∈ 'invalid' | 'missing' | 'full' | 'quota' | 'unavailable'
 *        | 'too-large' | 'parse' | 'schema' | 'version' | 'empty'.
 *
 * Safety: every localStorage access is in try/catch (private mode, blocked
 * storage, quota); JSON is parsed in try; items are rebuilt by `validate` from
 * whitelisted keys (so `__proto__`/`constructor` keys never reach an object);
 * ids must match /^<prefix>[a-z0-9]{1,24}$/ or are replaced; items live in an
 * array, never an id-keyed object. Import merges: content identical to an
 * existing item is skipped; a clashing id gets a new id; a clashing name
 * becomes "Name (2)". A failed write leaves the stored library unchanged.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const DEFAULT_MAX_BYTES = 512 * 1024;
  const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const reEscape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const isQuotaError = (err) => {
    if (!err) return false;
    const name = String(err.name || '');
    const code = Number(err.code);
    return /quota/i.test(name) || code === 22 || code === 1014 || /quota/i.test(String(err.message || ''));
  };

  // Control characters out, whitespace collapsed, trimmed, capped. Names are
  // always rendered escaped / as textContent; this keeps them one tidy line.
  const cleanName = (value, maxLen = 48) => {
    if (typeof value !== 'string') return '';
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, maxLen).trim();
  };

  // Copies handed out by the store are exactly what localStorage persists: a JSON
  // round-trip, not a generic deep clone. Vectura.Utils.clone (structuredClone)
  // hung the WebKit touch smoke in CI on these null-prototype items (PR #125), and
  // JSON semantics are the contract here anyway (stored data is JSON).
  const asStored = (v) => JSON.parse(JSON.stringify(v));

  const create = (opts = {}) => {
    const key = String(opts.key || '');
    const schema = String(opts.schema || '');
    const version = Math.max(1, Math.floor(Number(opts.version) || 1));
    const itemsKey = String(opts.itemsKey || 'items');
    const validate = typeof opts.validate === 'function' ? opts.validate : (() => null);
    const max = Math.max(1, Math.floor(Number(opts.max) || 64));
    const maxBytes = Math.max(1024, Math.floor(Number(opts.maxBytes) || DEFAULT_MAX_BYTES));
    const idPrefix = String(opts.idPrefix || 'item-');
    const nameKey = String(opts.nameKey || 'name');
    const nameMax = Math.max(1, Math.floor(Number(opts.nameMax) || 48));
    const fileStem = String(opts.fileStem || schema || 'vectura-library');
    const appVersion = typeof opts.appVersion === 'function' ? opts.appVersion : (() => (Vectura.APP_VERSION || ''));
    const getStorage = typeof opts.storage === 'function'
      ? opts.storage
      : () => { try { return G.localStorage || null; } catch (_e) { return null; } };
    const idRe = new RegExp(`^${reEscape(idPrefix)}[a-z0-9]{1,24}$`);
    const listeners = new Set();

    const isValidId = (id) => typeof id === 'string' && idRe.test(id);

    // Rebuild one untrusted item: validate() whitelists its fields, the id is
    // kept only when well-formed (else null — callers assign a fresh one).
    const sanitize = (raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      let item = null;
      try { item = validate(raw); } catch (_e) { item = null; }
      if (!item || typeof item !== 'object') return null;
      const out = { id: isValidId(raw.id) ? raw.id : null };
      Object.keys(item).forEach((k) => {
        if (k === 'id' || k === '__proto__' || k === 'constructor' || k === 'prototype') return;
        out[k] = item[k];
      });
      out[nameKey] = cleanName(out[nameKey], nameMax);
      return out;
    };

    // Content identity ignores the id (an item exported, deleted and
    // re-imported is still the same item).
    const contentKey = (item) => {
      const { id: _id, ...rest } = item;
      return JSON.stringify(rest);
    };

    const read = () => {
      const ls = getStorage();
      if (!ls) return [];
      let raw = null;
      try { raw = ls.getItem(key); } catch (_e) { return []; }
      if (raw == null || raw.length > maxBytes * 2) return [];
      let doc = null;
      try { doc = JSON.parse(raw); } catch (_e) { return []; }
      if (!doc || typeof doc !== 'object' || doc.schema !== schema) return [];
      const arr = Array.isArray(doc[itemsKey]) ? doc[itemsKey] : [];
      const seen = new Set();
      const out = [];
      for (const rawItem of arr) {
        if (out.length >= max) break;
        const item = sanitize(rawItem);
        if (!item || !item.id || seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
      return out;
    };

    const notify = () => {
      listeners.forEach((fn) => { try { fn(); } catch (_e) { /* listener errors never break a write */ } });
      try {
        if (typeof G.dispatchEvent === 'function' && typeof G.CustomEvent === 'function') {
          G.dispatchEvent(new G.CustomEvent('vectura:library-change', { detail: { key } }));
        }
      } catch (_e) { /* noop */ }
    };

    const docFor = (items) => ({ schema, version, appVersion: String(appVersion() || ''), [itemsKey]: items });

    const write = (items) => {
      const ls = getStorage();
      if (!ls) return { ok: false, reason: 'unavailable' };
      let text;
      try { text = JSON.stringify(docFor(items)); } catch (_e) { return { ok: false, reason: 'invalid' }; }
      if (text.length > maxBytes) return { ok: false, reason: 'quota' };
      try {
        ls.setItem(key, text);
      } catch (err) {
        return { ok: false, reason: isQuotaError(err) ? 'quota' : 'unavailable' };
      }
      notify();
      return { ok: true };
    };

    const randomId = () => {
      let s = '';
      const rnd = (G.crypto && typeof G.crypto.getRandomValues === 'function')
        ? () => { const a = new Uint32Array(1); G.crypto.getRandomValues(a); return a[0]; }
        : () => Math.floor(Math.random() * 0xffffffff);
      for (let i = 0; i < 7; i += 1) s += ID_CHARS[rnd() % ID_CHARS.length];
      return idPrefix + s;
    };

    const newIdAgainst = (taken) => {
      for (let i = 0; i < 1000; i += 1) {
        const id = randomId();
        if (!taken.has(id)) return id;
      }
      return `${idPrefix}${Date.now().toString(36)}`;
    };

    // "Name" -> "Name (2)", "Name (3)", … against the names already taken.
    const uniqueName = (name, takenNames) => {
      const base = cleanName(name, nameMax) || 'Untitled';
      if (!takenNames.has(base.toLowerCase())) return base;
      const stem = base.replace(/\s\((\d+)\)$/, '');
      for (let n = 2; n < 10000; n += 1) {
        const suffix = ` (${n})`;
        const candidate = `${stem.slice(0, Math.max(1, nameMax - suffix.length))}${suffix}`;
        if (!takenNames.has(candidate.toLowerCase())) return candidate;
      }
      return base;
    };

    const namesOf = (items, exceptId = null) => new Set(items
      .filter((it) => it.id !== exceptId)
      .map((it) => String(it[nameKey] || '').toLowerCase()));

    const list = () => asStored(read());
    const get = (id) => {
      const found = read().find((it) => it.id === id);
      return found ? asStored(found) : null;
    };
    const has = (id) => read().some((it) => it.id === id);
    const newId = () => newIdAgainst(new Set(read().map((it) => it.id)));

    // Insert or replace (by id). A new item gets a fresh id when it has none
    // (or a malformed one) and a unique name.
    const put = (rawItem) => {
      const item = sanitize(rawItem);
      if (!item) return { ok: false, reason: 'invalid' };
      const items = read();
      const idx = item.id ? items.findIndex((it) => it.id === item.id) : -1;
      if (idx >= 0) {
        item[nameKey] = uniqueName(item[nameKey], namesOf(items, item.id));
        items[idx] = item;
      } else {
        if (items.length >= max) return { ok: false, reason: 'full' };
        if (!item.id) item.id = newIdAgainst(new Set(items.map((it) => it.id)));
        item[nameKey] = uniqueName(item[nameKey], namesOf(items));
        items.push(item);
      }
      const res = write(items);
      return res.ok ? { ok: true, item: asStored(item) } : res;
    };

    const rename = (id, name) => {
      const items = read();
      const idx = items.findIndex((it) => it.id === id);
      if (idx < 0) return { ok: false, reason: 'missing' };
      const clean = cleanName(name, nameMax);
      if (!clean) return { ok: false, reason: 'invalid' };
      const next = { ...items[idx], [nameKey]: uniqueName(clean, namesOf(items, id)) };
      const item = sanitize(next);
      if (!item) return { ok: false, reason: 'invalid' };
      item.id = id;
      items[idx] = item;
      const res = write(items);
      return res.ok ? { ok: true, item: asStored(item) } : res;
    };

    const remove = (id) => {
      const items = read();
      const next = items.filter((it) => it.id !== id);
      if (next.length === items.length) return { ok: false, reason: 'missing' };
      return write(next);
    };

    const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';

    const exportItems = (items, filename) => {
      try {
        return { ok: true, text: JSON.stringify(docFor(items), null, 2), filename, count: items.length };
      } catch (_e) {
        return { ok: false, reason: 'invalid' };
      }
    };
    const exportOne = (id) => {
      const item = read().find((it) => it.id === id);
      if (!item) return { ok: false, reason: 'missing' };
      return exportItems([item], `${fileStem}-${slug(item[nameKey])}.json`);
    };
    const exportAll = () => exportItems(read(), `${fileStem}.json`);

    const importBundle = (text, mode = 'merge') => {
      if (mode !== 'merge') return { ok: false, reason: 'invalid' };
      if (typeof text !== 'string') return { ok: false, reason: 'parse' };
      if (text.length > maxBytes) return { ok: false, reason: 'too-large' };
      let doc = null;
      try { doc = JSON.parse(text); } catch (_e) { return { ok: false, reason: 'parse' }; }
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, reason: 'schema' };
      if (doc.schema !== schema) return { ok: false, reason: 'schema' };
      const v = Number(doc.version);
      if (!Number.isFinite(v) || v < 1) return { ok: false, reason: 'schema' };
      if (Math.floor(v) > version) return { ok: false, reason: 'version' };
      const incoming = Array.isArray(doc[itemsKey]) ? doc[itemsKey] : null;
      if (!incoming) return { ok: false, reason: 'schema' };
      if (!incoming.length) return { ok: false, reason: 'empty' };

      const items = read();
      const keys = new Set(items.map(contentKey));
      const ids = new Set(items.map((it) => it.id));
      const added = [];
      let skipped = 0;
      let renamed = 0;
      let rejected = 0;
      let full = false;
      for (const rawItem of incoming) {
        const item = sanitize(rawItem);
        if (!item) { rejected += 1; continue; }
        const ck = contentKey(item);
        // Identical content already in the library (under any id): skip.
        if (keys.has(ck)) { skipped += 1; continue; }
        if (items.length >= max) { full = true; rejected += 1; continue; }
        let changed = false;
        if (!item.id || ids.has(item.id)) {
          if (item.id) changed = true;
          item.id = newIdAgainst(ids);
        }
        const name = uniqueName(item[nameKey], namesOf(items));
        if (name !== item[nameKey]) changed = true;
        item[nameKey] = name;
        if (changed) renamed += 1;
        ids.add(item.id);
        keys.add(ck);
        items.push(item);
        added.push(item);
      }
      if (!added.length) {
        return { ok: true, added: [], skipped, renamed, rejected, full };
      }
      const res = write(items);
      if (!res.ok) return res;
      return { ok: true, added: asStored(added), skipped, renamed, rejected, full };
    };

    const onChange = (fn) => {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    };

    return {
      key, schema, version, max, maxBytes, idPrefix,
      isValidId,
      list, get, has, newId, put, rename, remove,
      exportOne, exportAll, importBundle, onChange,
    };
  };

  Vectura.UserLibraryStore = { create, cleanName, isQuotaError };
})();
