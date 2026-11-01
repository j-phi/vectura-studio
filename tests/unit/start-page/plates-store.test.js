/*
 * Unit tests for src/core/start-page/plates-store.js — window.Vectura.StartPagePlatesStore.
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

const loadModule = () => {
  const win = {};
  win.window = win;
  const ctx = vm.createContext({ window: win, structuredClone, JSON, Promise, Map, Set, Date, Math, Error, Array, Object });
  const rel = 'src/core/start-page/plates-store.js';
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  return win.Vectura.StartPagePlatesStore;
};

describe('StartPagePlatesStore', () => {
  let S;
  let idb;
  const fresh = () => S.create({ indexedDB: () => idb });
  beforeEach(() => { S = loadModule(); idb = makeFakeIdb(); });

  it('round trips through a fresh store instance (reload)', async () => {
    const a = fresh();
    const rec = await a.upsert('w1', { layout: 'left', texts: { title: 'Hi' }, pin: 'p1', colors: { art: '#ff0000' } });
    expect(rec.texts).toEqual({ word: null, title: 'Hi', description: null });
    const b = fresh();
    const { plates } = await b.load();
    expect(plates).toHaveLength(1);
    expect(plates[0]).toMatchObject({ id: 'w1', layout: 'left', pin: 'p1', removed: false, hidden: false });
    expect(plates[0].colors).toEqual({ art: '#ff0000', text: null, background: null, title: null, band: null });
  });

  it('deep-merges patches and keeps fill objects whole', async () => {
    const s = fresh();
    await s.upsert('w1', { colors: { art: { fill: 'sunset' } } });
    const r = await s.upsert('w1', { colors: { text: '#111111' }, texts: { word: 'A' } });
    await s.upsert('w1', { texts: { title: 'T' } });
    expect(r.colors).toEqual({ art: { fill: 'sunset' }, text: '#111111', background: null, title: null, band: null });
    const r2 = await s.upsert('w1', { colors: { art: { fill: 'duotone' } } });
    expect(r2.colors.art).toEqual({ fill: 'duotone' });
    const { plates } = await fresh().load();
    expect(plates[0].texts).toEqual({ word: 'A', title: 'T', description: null });
  });

  it('curated edits survive curated -> mono -> curated exactly', async () => {
    const s = fresh();
    const rec = await s.upsert('w1', {
      layout: 'wide', texts: { title: 'X' }, pin: 'pal', colors: { art: '#abcdef', background: { fill: 'metallic-gold' } },
      basicColors: { ink: '#123456' }, frame: { fit: 'fill', z: 2, cx: 0.1, cy: 0.2 }, motion: { hover: 'lift' },
    });
    const cur = S.effectiveFor(rec, 'curated');
    S.effectiveFor(rec, 'mono');
    const stored = (await fresh().load()).plates[0];
    expect(stored).toEqual(rec);
    expect(S.effectiveFor(stored, 'curated')).toEqual(cur);
  });

  it('effectiveFor table', () => {
    const rec = { id: 'a', artId: 'a', order: 0, hidden: false, removed: false, layout: 'L', texts: { word: 'w', title: null, description: null },
      pin: 'p', colors: { art: '#fff', text: null, background: null }, basicColors: { ink: '#000' },
      frame: { fit: 'fit', z: 1, cx: 0, cy: 0 }, motion: { animateIn: 'a', hover: 'h' } };
    const keys = (m) => Object.keys(S.effectiveFor(rec, m)).filter((k) => ['layout', 'texts', 'pin', 'colors', 'basicColors', 'frame', 'motion'].includes(k) && S.effectiveFor(rec, m)[k] !== null).sort();
    expect(keys('curated')).toEqual(['colors', 'frame', 'layout', 'motion', 'pin', 'texts']);
    expect(keys('basic')).toEqual(['basicColors', 'frame', 'layout', 'motion', 'texts']);
    ['mono', 'wildcard', 'random'].forEach((m) => expect(keys(m)).toEqual(['frame', 'layout', 'motion', 'texts']));
    expect(S.effectiveFor(rec, 'curated').colors).toEqual(rec.colors);
    expect(rec.colors.art).toBe('#fff'); // input not mutated
  });

  it('canEdit only for curated and basic', () => {
    expect(['curated', 'basic', 'mono', 'wildcard', 'random', 'x'].map(S.canEdit))
      .toEqual([true, true, false, false, false, false]);
  });

  it('reorder persists and resetOrder returns the previous order', async () => {
    const s = fresh();
    await s.upsert('a', { layout: 'x' });
    await s.reorder(['c', 'a', 'b']);
    const l = await fresh().load();
    expect(l.order).toEqual(['c', 'a', 'b']);
    expect(l.plates.map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(await s.resetOrder()).toEqual(['c', 'a', 'b']);
    expect((await fresh().load()).order).toEqual([]);
  });

  it('remove / undoRemove', async () => {
    const s = fresh();
    await s.upsert('a', { layout: 'x' });
    const token = await s.remove('a');
    expect((await fresh().load()).plates[0].removed).toBe(true);
    const back = await s.undoRemove(token);
    expect(back.removed).toBe(false);
    expect((await fresh().load()).plates[0]).toMatchObject({ removed: false, layout: 'x' });
  });

  it('reset all / some fields returns the previous record; restore undoes it', async () => {
    const s = fresh();
    const rec = await s.upsert('a', { layout: 'x', pin: 'p', colors: { art: '#fff' } });
    const prev = await s.reset('a', ['pin']);
    expect(prev).toEqual(rec);
    let cur = (await fresh().load()).plates[0];
    expect(cur.pin).toBeNull();
    expect(cur.layout).toBe('x');
    await s.reset('a');
    cur = (await fresh().load()).plates[0];
    expect([cur.layout, cur.colors]).toEqual([null, null]);
    await s.restore(prev);
    expect((await fresh().load()).plates[0]).toEqual(rec);
    expect(await s.reset('missing')).toBeNull();
  });

  it('add creates a new plate appended to the order, uniquely keyed', async () => {
    const s = fresh();
    const a = await s.add('preset-1');
    const b = await s.add('preset-1');
    expect(a.id).toBe('preset-1');
    expect(b.id).not.toBe(a.id);
    expect(b.artId).toBe('preset-1');
    expect((await fresh().load()).order).toEqual([a.id, b.id]);
  });

  it('subscribe fires on mutations; works from memory without IndexedDB', async () => {
    const s = S.create({ indexedDB: () => null });
    let n = 0;
    const off = s.subscribe(() => { n += 1; });
    await s.upsert('a', { layout: 'x' });
    expect(n).toBe(1);
    off();
    await s.upsert('a', { layout: 'y' });
    expect(n).toBe(1);
    expect((await s.load()).plates[0].layout).toBe('y');
  });

  it('survives IndexedDB put failures without rejecting', async () => {
    idb.failPut = () => new Error('boom');
    const s = fresh();
    const r = await s.upsert('a', { layout: 'x' });
    expect(r.layout).toBe('x');
  });

  it('add({ duplicate }) always mints a new `${artId}#n` id, recorded or not, and removing it leaves the original alone', async () => {
    const st = fresh();
    const a = await st.add('w9', { duplicate: true }); // w9 has no record at all
    expect(a.id).toMatch(/^w9#\d+$/);
    expect(a.artId).toBe('w9');
    const b = await st.add('w9', { duplicate: true });
    expect(b.id).not.toBe(a.id);
    const tok = await st.remove(a.id);
    expect(tok.id).toBe(a.id);
    const { plates } = await st.load();
    expect(plates.find((r) => r.id === 'w9')).toBeUndefined(); // the original was never touched
    expect(plates.find((r) => r.id === a.id).removed).toBe(true);
    expect(plates.find((r) => r.id === b.id).removed).toBe(false);
  });

  it('remove stamps removedAt so a later open or save of the work can bring the plate back', async () => {
    const st = fresh();
    await st.upsert('w1', { layout: 'x' });
    const t0 = Date.now();
    await st.remove('w1');
    const rec = (await st.load()).plates.find((r) => r.id === 'w1');
    expect(rec.removed).toBe(true);
    expect(rec.removedAt).toBeGreaterThanOrEqual(t0);
  });

  it('onFallback fires once when IndexedDB is blocked, and the store keeps working from memory', async () => {
    const blocked = { open() { const req = {}; setTimeout(() => { if (req.onblocked) req.onblocked(); }, 0); return req; } };
    let told = 0;
    const st = S.create({ indexedDB: () => blocked, onFallback: () => { told += 1; } });
    await st.upsert('w1', { layout: 'x' });
    await st.upsert('w2', { layout: 'y' });
    expect(told).toBe(1);
    expect((await st.load()).plates).toHaveLength(2);
  });

  it('onFallback fires once when a write fails (quota / abort), and the edit still lives in memory', async () => {
    let told = 0;
    const st = S.create({ indexedDB: () => idb, onFallback: () => { told += 1; } });
    await st.load();
    idb.failPut = (name) => { const e = new Error('full'); e.name = 'QuotaExceededError'; return name === 'plates' ? e : null; };
    await st.upsert('w1', { layout: 'x' });
    await st.upsert('w2', { layout: 'y' });
    idb.failPut = null;
    expect(told).toBe(1);
    expect((await st.load()).plates.map((p) => p.id).sort()).toEqual(['w1', 'w2']);
  });
});
