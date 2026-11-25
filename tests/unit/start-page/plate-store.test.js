/**
 * RecentsStore keeps an optional display-only `plate` ({ kind: 'svg', data }) next to `thumb`: round-trips through
 * record / update / list / get, is absent on old entries, is capped, and goes with the thumbnail past entriesMax.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
const { makeFakeIdb } = require('../../helpers/fake-indexeddb.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const load = () => {
  const win = { dispatchEvent: () => true, CustomEvent: class { constructor(t) { this.type = t; } } };
  win.window = win;
  const ctx = vm.createContext({ window: win, structuredClone, JSON, Promise, Map, Set, Date, Math, Error });
  ['src/config/start-page.js', 'src/core/recents-store.js'].forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }));
  return win.Vectura;
};
const PLATE = { kind: 'svg', data: '<svg viewBox="0 0 10 10"><g stroke-width="0.3"><path d="M0 0 5 5"/></g></svg>' };
const base = (over = {}) => ({
  name: 'Statue', algorithm: 'Wavetable', paper: 'A4', pens: [{ color: '#111111', width: 0.3 }],
  thumb: { kind: 'png', data: 'data:image/png;base64,AAAA' }, payload: { version: 1, n: 1 }, source: 'open', ...over,
});

describe('RecentsStore plate', () => {
  let V; let idb; let clock; let store;
  beforeEach(() => {
    V = load(); idb = makeFakeIdb(); clock = 1_700_000_000_000;
    store = V.RecentsStore.create({ indexedDB: () => idb, now: () => clock });
  });

  it('round-trips plate through record, get, list and listWorks, and across a reload', async () => {
    const e = await store.record(base({ plate: PLATE }));
    expect(e.plate).toEqual(PLATE);
    expect((await store.get(e.id)).plate).toEqual(PLATE);
    expect((await store.list())[0].plate).toEqual(PLATE);
    expect((await store.listWorks())[0].plate).toEqual(PLATE);
    const again = V.RecentsStore.create({ indexedDB: () => idb, now: () => clock });
    expect((await again.get(e.id)).plate).toEqual(PLATE);
  });

  it('entries recorded without a plate have none (old entries still load)', async () => {
    const e = await store.record(base());
    expect(e.plate).toBeNull();
    expect(e.thumb.kind).toBe('png');
  });

  it('an update in place replaces the plate, and a record with no plate clears a stale one', async () => {
    const e = await store.record(base({ plate: PLATE }));
    clock += 1000;
    const next = { kind: 'svg', data: '<svg viewBox="0 0 4 4"/>' };
    const u = await store.record(base({ id: e.id, plate: next }));
    expect(u.id).toBe(e.id);
    expect(u.plate).toEqual(next);
    clock += 1000;
    const c = await store.record(base({ id: e.id }));
    expect(c.plate).toBeNull();
  });

  it('rejects a malformed or oversized plate', async () => {
    const big = { kind: 'svg', data: 'x'.repeat(V.START_PAGE.LIMITS.plateBytesMax + 1) };
    expect((await store.record(base({ plate: big }))).plate).toBeNull();
    expect((await store.record(base({ name: 'b', payload: { n: 2 }, plate: { kind: 'png', data: 'data:image/png;base64,AAAA' } }))).plate).toBeNull();
    expect((await store.record(base({ name: 'c', payload: { n: 3 }, plate: { kind: 'svg', data: '' } }))).plate).toBeNull();
  });

  it('publicEntry hands out a copy: mutating a listed plate does not touch the store', async () => {
    const e = await store.record(base({ plate: PLATE }));
    const got = await store.get(e.id);
    got.plate.data = 'mutated';
    expect((await store.get(e.id)).plate).toEqual(PLATE);
  });

  it('drops the plate with the thumbnail of the oldest entries past entriesMax', async () => {
    V.START_PAGE = { ...V.START_PAGE, LIMITS: { ...V.START_PAGE.LIMITS, entriesMax: 2 } };
    const ids = [];
    for (let i = 0; i < 3; i += 1) {
      clock += 1000;
      ids.push((await store.record(base({ name: `w${i}`, payload: { n: i }, plate: PLATE }))).id);
    }
    const oldest = await store.get(ids[0]);
    expect(oldest.thumb).toBeNull();
    expect(oldest.plate).toBeNull();
    expect((await store.get(ids[2])).plate).toEqual(PLATE);
    expect((await store.get(ids[1])).plate).toEqual(PLATE);
  });
});
