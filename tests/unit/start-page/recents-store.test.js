/*
 * Unit tests for src/core/recents-store.js — window.Vectura.RecentsStore.
 * Driven with the in-memory IndexedDB fake from tests/helpers/fake-indexeddb.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { makeFakeIdb } = require('../../helpers/fake-indexeddb.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const loadModules = () => {
  const events = [];
  const win = {
    dispatchEvent: (e) => { events.push(e.type); return true; },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
  };
  win.window = win;
  const ctx = vm.createContext({ window: win, structuredClone, JSON, Promise, Map, Set, Date, Math, Error });
  ['src/config/start-page.js', 'src/core/recents-store.js'].forEach((rel) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  });
  return { V: win.Vectura, events };
};

const payload = (n = 1, pad = 0) => ({ version: 1, layers: [{ type: 'flowfield', n }], pad: 'x'.repeat(pad) });
const base = (over = {}) => ({
  name: 'Study', algorithm: 'Flow Field', paper: 'A3 · 297×420',
  pens: [{ color: '#111111', width: 0.4 }], thumb: { kind: 'svg', data: '<svg/>' },
  payload: payload(), source: 'open', ...over,
});
const quota = () => { const e = new Error('full'); e.name = 'QuotaExceededError'; return e; };

describe('RecentsStore', () => {
  let V; let events; let idb; let clock; let store;
  const mk = (opts = {}) => V.RecentsStore.create({ indexedDB: () => idb, now: () => clock, ...opts });
  const tick = () => { clock += 1000; return clock; };

  beforeEach(() => {
    ({ V, events } = loadModules());
    idb = makeFakeIdb();
    clock = 1_700_000_000_000;
    store = mk();
  });

  it('registers create()', () => {
    expect(typeof V.RecentsStore.create).toBe('function');
  });

  describe('record', () => {
    it('returns a complete entry without the payload and persists doc separately', async () => {
      const e = await store.record(base());
      expect(e).toMatchObject({
        name: 'Study', algorithm: 'Flow Field', paper: 'A3 · 297×420', cleared: false,
        hasDoc: true, hasHandle: false, source: 'open', addedAt: clock, lastOpened: clock,
        pens: [{ color: '#111111', width: 0.4 }], thumb: { kind: 'svg', data: '<svg/>' },
      });
      expect(typeof e.id).toBe('string');
      expect(e.bytes).toBeGreaterThan(0);
      expect(e).not.toHaveProperty('payload');
      expect(await store.getDoc(e.id)).toEqual(payload());
      expect([...idb.dump('vectura-start', 'docs').keys()]).toEqual([e.id]);
      expect([...idb.dump('vectura-start', 'entries').values()][0]).not.toHaveProperty('payload');
    });

    it('keeps the document\'s own paper and ink colors (#hex only) so a PNG thumbnail still shows in them', async () => {
      const e = await store.record(base({ thumb: { kind: 'png', data: 'data:image/png;base64,AAAA' }, paperColor: '#F4EFE4', inkColor: '#1d3a8a' }));
      expect(e).toMatchObject({ paperColor: '#f4efe4', inkColor: '#1d3a8a' });
      expect((await store.get(e.id))).toMatchObject({ paperColor: '#f4efe4', inkColor: '#1d3a8a' });
      const bad = await store.record(base({ name: 'Bad', paperColor: 'url(javascript:1)', inkColor: 'red' }));
      expect(bad).toMatchObject({ paperColor: '', inkColor: '' });
    });

    it('record({ id }) updates that entry in place, even under a new name', async () => {
      const a = await store.record(base());
      tick();
      const b = await store.record({ ...base(), name: 'Renamed', id: a.id, source: 'save' });
      expect(b.id).toBe(a.id);
      expect((await store.list()).map((x) => x.name)).toEqual(['Renamed']);
    });

    it('record({ forceNew }) never merges by name', async () => {
      const a = await store.record(base());
      tick();
      const b = await store.record({ ...base(), forceNew: true });
      expect(b.id).not.toBe(a.id);
      expect((await store.list()).length).toBe(2);
    });

    it('survives a reload (new store on the same IndexedDB)', async () => {
      const e = await store.record(base());
      const again = mk();
      expect((await again.list()).map((x) => x.id)).toEqual([e.id]);
      expect(await again.getDoc(e.id)).toEqual(payload());
    });

    it('dedupes by name + identical content and updates in place', async () => {
      const a = await store.record(base());
      tick();
      const b = await store.record(base({ thumb: { kind: 'png', data: 'data:image/png;base64,AA' }, source: 'save' }));
      expect(b.id).toBe(a.id);
      expect(b.addedAt).toBe(a.addedAt);
      expect(b.lastOpened).toBe(clock);
      expect(b.thumb.kind).toBe('png');
      expect(b.source).toBe('save');
      expect(await store.getDoc(a.id)).toEqual(payload());
      expect(await store.listWorks()).toHaveLength(1);
    });

    it('never merges a different file that merely shares a name (no handle): it is a new entry and the first keeps its copy', async () => {
      const a = await store.record(base({ payload: payload(1) }));
      tick();
      const b = await store.record(base({ payload: payload(2) }));
      expect(b.id).not.toBe(a.id);
      expect(await store.getDoc(a.id)).toEqual(payload(1));
      expect(await store.getDoc(b.id)).toEqual(payload(2));
      expect(await store.listWorks()).toHaveLength(2);
    });

    it('a handle record does not adopt a handle-less entry of the same name but different content', async () => {
      const a = await store.record(base({ payload: payload(1) }));
      tick();
      const b = await store.record(base({ payload: payload(2), handle: { isSameEntry: async () => false } }));
      expect(b.id).not.toBe(a.id);
      expect(await store.getDoc(a.id)).toEqual(payload(1));
    });

    it('re-recording a cleared entry un-clears it', async () => {
      const a = await store.record(base());
      await store.clearRecent();
      expect(await store.list()).toHaveLength(0);
      tick();
      await store.record(base());
      expect((await store.list()).map((x) => x.id)).toEqual([a.id]);
    });

    it('dedupes by handle.isSameEntry before name', async () => {
      const h1 = { name: 'a.vectura', isSameEntry: async (o) => o === h1 || o.__same === true };
      const a = await store.record(base({ name: 'First', handle: h1 }));
      expect(a.hasHandle).toBe(true);
      tick();
      const other = { name: 'renamed.vectura', __same: true, isSameEntry: async () => false };
      const b = await store.record(base({ name: 'Renamed on disk', handle: other }));
      expect(b.id).toBe(a.id);
      expect(b.name).toBe('Renamed on disk');
      expect(await store.listWorks()).toHaveLength(1);
      expect(await store.getHandle(a.id)).toBe(other);
    });

    it('a different handle with the same name stays separate', async () => {
      const h1 = { isSameEntry: async () => false };
      const h2 = { isSameEntry: async () => false };
      await store.record(base({ handle: h1 }));
      tick();
      await store.record(base({ handle: h2 }));
      expect(await store.listWorks()).toHaveLength(2);
    });

    it('getHandle returns null without a handle; get returns null for unknown ids', async () => {
      const e = await store.record(base());
      expect(await store.getHandle(e.id)).toBeNull();
      expect(await store.get('nope')).toBeNull();
      expect((await store.get(e.id)).id).toBe(e.id);
    });

    it('normalizes junk fields', async () => {
      const e = await store.record({ name: '', payload: payload(), thumb: { kind: 'exe', data: 'x' }, pens: 'x', source: 'weird' });
      expect(e.name).toBe('Untitled');
      expect(e.thumb).toBeNull();
      expect(e.pens).toEqual([]);
      expect(e.source).toBe('open');
    });
  });

  describe('list ordering and limits', () => {
    it('lists newest lastOpened first, limited, without payload', async () => {
      for (let i = 0; i < 10; i += 1) { tick(); await store.record(base({ name: `W${i}` })); }
      const shown = await store.list();
      expect(shown).toHaveLength(8);
      expect(shown[0].name).toBe('W9');
      expect(shown[7].name).toBe('W2');
      shown.forEach((e) => expect(e).not.toHaveProperty('payload'));
      expect(await store.list({ limit: 3 })).toHaveLength(3);
      tick();
      await store.record(base({ name: 'W0' }));
      expect((await store.list({ limit: 1 }))[0].name).toBe('W0');
    });

    it('listWorks returns everything ascending by addedAt, including cleared', async () => {
      for (let i = 0; i < 3; i += 1) { tick(); await store.record(base({ name: `W${i}` })); }
      await store.clearRecent();
      expect((await store.listWorks()).map((e) => e.name)).toEqual(['W0', 'W1', 'W2']);
      expect(await store.list()).toHaveLength(0);
      expect(await store.list({ includeCleared: true })).toHaveLength(3);
    });
  });

  describe('clearRecent / undoClear / remove', () => {
    it('hides entries, keeps them and their docs, and undo restores exactly those', async () => {
      const a = await store.record(base({ name: 'A' }));
      tick();
      const b = await store.record(base({ name: 'B' }));
      const token = await store.clearRecent();
      expect(await store.list()).toEqual([]);
      expect(await store.getDoc(a.id)).toEqual(payload());
      tick();
      await store.record(base({ name: 'C' }));
      await store.undoClear(token);
      expect((await store.list()).map((e) => e.name).sort()).toEqual(['A', 'B', 'C']);
      expect(b.id).toBeTruthy();
    });

    it('undo does not resurrect entries that were already hidden before the clear', async () => {
      await store.record(base({ name: 'A' }));
      const t1 = await store.clearRecent();
      tick();
      await store.record(base({ name: 'B' }));
      const t2 = await store.clearRecent();
      await store.undoClear(t2);
      expect((await store.list()).map((e) => e.name)).toEqual(['B']);
      await store.undoClear(t1);
      expect((await store.list()).map((e) => e.name).sort()).toEqual(['A', 'B']);
    });

    it('clear persists across a reload', async () => {
      await store.record(base());
      await store.clearRecent();
      expect(await mk().list()).toEqual([]);
    });

    it('remove deletes entry, doc and handle', async () => {
      const e = await store.record(base({ handle: { isSameEntry: async () => false } }));
      await store.remove(e.id);
      expect(await store.get(e.id)).toBeNull();
      expect(await store.getDoc(e.id)).toBeNull();
      expect(await store.getHandle(e.id)).toBeNull();
      expect(idb.dump('vectura-start', 'docs').size).toBe(0);
      expect(idb.dump('vectura-start', 'entries').size).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('fires after mutations, unsubscribes, and dispatches the window event', async () => {
      let n = 0;
      const off = store.subscribe(() => { n += 1; });
      const e = await store.record(base());
      expect(n).toBe(1);
      await store.clearRecent();
      expect(n).toBe(2);
      await store.remove(e.id);
      expect(n).toBe(3);
      off();
      await store.record(base());
      expect(n).toBe(3);
      expect(events.filter((t) => t === 'vectura:recents-changed').length).toBeGreaterThanOrEqual(4);
    });

    it('a throwing subscriber does not break the store', async () => {
      store.subscribe(() => { throw new Error('boom'); });
      await expect(store.record(base())).resolves.toBeTruthy();
    });
  });

  describe('entry cap (never deletes a work)', () => {
    it('keeps every entry and doc past the cap; lists show the newest N; the oldest thumbnails are dropped, never docs', async () => {
      const s = mk({ dbName: 'cap' });
      for (let i = 0; i < 48; i += 1) { tick(); await s.record(base({ name: `old${i}`, payload: payload(i) })); }
      await s.clearRecent();
      tick();
      await s.record(base({ name: 'fresh0', payload: payload(100) }));
      tick();
      await s.record(base({ name: 'fresh1', payload: payload(101) }));
      const works = await s.listWorks();
      expect(works).toHaveLength(50);
      expect(works.map((e) => e.name)).toContain('old0');
      expect(works.every((e) => e.hasDoc)).toBe(true);
      expect(idb.dump('cap', 'docs').size).toBe(50);
      expect((await s.list()).map((e) => e.name)).toEqual(['fresh1', 'fresh0']);
      const byName = Object.fromEntries(works.map((e) => [e.name, e]));
      expect(byName.old0.thumb).toBeNull(); // beyond the cap, oldest first: regenerable
      expect(byName.old1.thumb).toBeNull();
      expect(byName.fresh1.thumb).not.toBeNull();
      expect(byName.old2.thumb).not.toBeNull(); // within the newest 48
    });
  });

  describe('doc size budget and quota', () => {
    it('drops the oldest docs (by lastOpened) when total bytes exceed docsMaxBytes', async () => {
      const s = mk({ dbName: 'big' });
      const mb = 1024 * 1024;
      const ids = [];
      for (let i = 0; i < 4; i += 1) {
        tick();
        ids.push((await s.record(base({ name: `D${i}`, payload: payload(i, 15 * mb) }))).id);
      }
      // 4 x 15MB = 60MB > 40MB -> oldest two dropped, newest two kept
      const works = await s.listWorks();
      const byName = Object.fromEntries(works.map((e) => [e.name, e]));
      expect(byName.D0.hasDoc).toBe(false);
      expect(byName.D1.hasDoc).toBe(false);
      expect(byName.D2.hasDoc).toBe(true);
      expect(byName.D3.hasDoc).toBe(true);
      expect(await s.getDoc(ids[0])).toBeNull();
      expect(await s.getDoc(ids[3])).not.toBeNull();
      expect(idb.dump('big', 'docs').size).toBe(2);
    });

    it('a single doc over the budget is recorded without a doc', async () => {
      const e = await store.record(base({ payload: payload(1, 41 * 1024 * 1024) }));
      expect(e.hasDoc).toBe(false);
      expect(await store.getDoc(e.id)).toBeNull();
    });

    it('QuotaExceededError on the doc put drops older docs and retries', async () => {
      const a = await store.record(base({ name: 'A' }));
      tick();
      const b = await store.record(base({ name: 'B' }));
      let fails = 1;
      idb.failPut = (name) => (name === 'docs' && fails-- > 0 ? quota() : null);
      tick();
      const c = await store.record(base({ name: 'C' }));
      idb.failPut = null;
      expect(c.hasDoc).toBe(true);
      expect(await store.getDoc(c.id)).toEqual(payload());
      expect((await store.get(a.id)).hasDoc).toBe(false);
      expect((await store.get(b.id)).hasDoc).toBe(true);
    });

    it('persistent quota failure keeps the entry with hasDoc=false and does not throw', async () => {
      await store.record(base({ name: 'A' }));
      idb.failPut = (name) => (name === 'docs' ? quota() : null);
      tick();
      const e = await store.record(base({ name: 'B' }));
      idb.failPut = null;
      expect(e.hasDoc).toBe(false);
      expect((await store.get(e.id)).name).toBe('B');
      expect((await store.get(e.id)).hasDoc).toBe(false);
      expect((await store.listWorks()).find((x) => x.name === 'A').hasDoc).toBe(false);
    });
  });

  describe('write failures are reported once', () => {
    it('onWriteFailure fires a single time when the document copy cannot be stored', async () => {
      let told = 0;
      const s = mk({ dbName: 'wf', onWriteFailure: () => { told += 1; } });
      idb.failPut = (name) => (name === 'docs' ? quota() : null);
      tick(); await s.record(base({ name: 'A' }));
      tick(); await s.record(base({ name: 'B', payload: payload(2) }));
      idb.failPut = null;
      expect(told).toBe(1);
    });

    it('onWriteFailure fires when the entry write itself fails', async () => {
      let told = 0;
      const s = mk({ dbName: 'wf2', onWriteFailure: () => { told += 1; } });
      idb.failPut = (name) => (name === 'entries' ? quota() : null);
      await s.record(base({ name: 'A' }));
      idb.failPut = null;
      expect(told).toBe(1);
    });
  });

  describe('list copies', () => {
    it('list/listWorks/get hand out copies callers cannot use to mutate the store, without a JSON round trip per entry', async () => {
      const e = await store.record(base());
      const spy = vi.spyOn(JSON, 'stringify');
      const a = (await store.list())[0];
      const w = (await store.listWorks())[0];
      const g = await store.get(e.id);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
      a.name = 'x'; a.thumb.data = 'x'; a.pens[0].color = '#fff'; w.pens.length = 0; g.thumb = null;
      const again = await store.get(e.id);
      expect(again.name).toBe('Study');
      expect(again.thumb.data).toBe('<svg/>');
      expect(again.pens[0].color).toBe('#111111');
    });
  });

  describe('in-memory fallback', () => {
    const variants = {
      'no indexedDB': () => ({ indexedDB: () => null }),
      'indexedDB getter throws': () => ({ indexedDB: () => { throw new Error('denied'); } }),
      'open throws': () => ({ indexedDB: () => ({ open: () => { throw new Error('SecurityError'); } }) }),
      'open errors': () => ({ indexedDB: () => ({ open: () => { const r = {}; Promise.resolve().then(() => r.onerror && r.onerror()); return r; } }) }),
    };
    Object.entries(variants).forEach(([label, opts]) => {
      it(`works fully in memory when ${label}`, async () => {
        const s = V.RecentsStore.create({ ...opts(), now: () => clock });
        const h = { isSameEntry: async () => false };
        const a = await s.record(base({ name: 'A', handle: h }));
        tick();
        await s.record(base({ name: 'B' }));
        expect((await s.list()).map((e) => e.name)).toEqual(['B', 'A']);
        expect(await s.getDoc(a.id)).toEqual(payload());
        expect(await s.getHandle(a.id)).toBe(h);
        const t = await s.clearRecent();
        expect(await s.list()).toEqual([]);
        await s.undoClear(t);
        expect(await s.list()).toHaveLength(2);
        await s.remove(a.id);
        expect(await s.listWorks()).toHaveLength(1);
      });
    });

    it('create() with no options and no global indexedDB still works', async () => {
      const s = V.RecentsStore.create();
      const e = await s.record(base());
      expect((await s.list())[0].id).toBe(e.id);
    });
  });
});
