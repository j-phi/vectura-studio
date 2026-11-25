/**
 * StartPagePlateBackfill: the one-time pass that gives existing Recents entries plate lines. Driven with the REAL RecentsStore
 * over the in-memory IndexedDB fake and a fake renderer; plus a fake-store case for failures and aborts.
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
  const events = [];
  const win = { dispatchEvent: (e) => { events.push(e.type); return true; }, CustomEvent: class { constructor(t) { this.type = t; } } };
  win.window = win;
  const ctx = vm.createContext({ window: win, structuredClone, JSON, Promise, Map, Set, Date, Math, Number, Array, Object, String, Float32Array, Error, console, setTimeout });
  ['src/config/start-page.js', 'src/core/recents-store.js', 'src/core/geometry-utils.js', 'src/core/start-page/art-geometry.js',
    'src/core/start-page/plate-lines.js', 'src/core/start-page/plate-backfill.js']
    .forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }));
  return { V: win.Vectura, events };
};

const dense = (lines = 40) => {
  const f = (v) => v.toFixed(3);
  let body = '';
  for (let i = 0; i < lines; i += 1) {
    let d = `M 20.000 ${f(15 + i * 2)}`;
    for (let j = 1; j < 129; j += 1) { const x = 20 + j * 2; const y = 15 + i * 2 + Math.sin(j * 0.4 + i); d += ` C ${f(x - 1.3)} ${f(y)} ${f(x - 0.7)} ${f(y)} ${f(x)} ${f(y)}`; }
    body += `<g stroke-width="0.300"><path d="${d}"/></g>`;
  }
  return `<svg width="297mm" height="210mm" viewBox="0 0 297 210" xmlns="http://www.w3.org/2000/svg"><g stroke="#ffffff" fill="none">${body}</g></svg>`;
};
const PNG = { kind: 'png', data: 'data:image/png;base64,AAAA' };
const SVGT = { kind: 'svg', data: '<svg viewBox="0 0 1 1"/>' };

describe('StartPagePlateBackfill', () => {
  let V; let events; let clock; let store; let renders; let renderer; let B;
  const rec = (name, over = {}) => { clock += 1000; return store.record({ name, algorithm: 'Wavetable', paper: 'A4', paperColor: '#f4efe4', inkColor: '#222222', pens: [], thumb: PNG, payload: { n: name }, source: 'open', ...over }); };
  beforeEach(() => {
    ({ V, events } = load()); B = V.StartPagePlateBackfill;
    clock = 1_700_000_000_000;
    store = V.RecentsStore.create({ indexedDB: () => makeFakeIdb(), now: () => clock });
    renders = [];
    renderer = { renderDocument: async (doc, label) => { renders.push(doc.n); if (doc.n === 'boom') throw new Error('render failed'); return { svg: dense(), ownColors: { paper: '#ffffff', ink: '#000000' } }; } };
  });
  const run = (o = {}) => B.run({ store, renderer, yieldFn: async () => {}, log: () => {}, ...o });

  it('backfills only PNG-thumb entries with a stored doc and no plate, within budget, leaving everything else alone', async () => {
    const a = await rec('a'); const b = await rec('b', { thumb: null }); const c = await rec('c', { thumb: SVGT });
    const d = await rec('d', { payload: undefined }); // no stored doc
    const e = await rec('e', { plate: { kind: 'svg', data: '<svg viewBox="0 0 1 1"/>' } });
    const before = Object.fromEntries((await store.listWorks()).map((x) => [x.name, x]));
    const out = await run();
    expect(out.status).toBe('done');
    expect(out.done).toBe(2);
    expect(renders.sort()).toEqual(['a', 'b']);
    const after = Object.fromEntries((await store.listWorks()).map((x) => [x.name, x]));
    for (const n of ['a', 'b']) {
      expect(after[n].plate.kind).toBe('svg');
      expect(after[n].plate.data.length).toBeLessThanOrEqual(V.START_PAGE.LIMITS.plateLinesBytes);
      expect(after[n].plate.data).toMatch(/<rect[^>]*fill="#f4efe4"/); // the entry's own paper, not the render's
      expect(V.StartPageArtGeometry.parseArtSvg(after[n].plate.data).strokes).toBe(40);
    }
    expect(after.c.plate).toBeNull(); expect(after.d.plate).toBeNull(); expect(after.e.plate).toEqual(before.e.plate);
    for (const n of Object.keys(before)) {
      const { plate: _p, ...x } = before[n]; const { plate: _q, ...y } = after[n];
      expect(y).toEqual(x); // lastOpened, addedAt, name, hash, thumb, bytes, cleared, ... unchanged
    }
    expect((await store.listWorks()).map((x) => x.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect([a, b, c, d, e].length).toBe(5);
  });

  it('keeps a cleared entry cleared and notifies exactly once, at the end', async () => {
    await rec('a'); await rec('b');
    await store.clearRecent();
    events.length = 0;
    await run();
    expect(events.filter((t) => t === 'vectura:recents-changed').length).toBe(1);
    expect((await store.listWorks()).every((x) => x.cleared === true && x.plate)).toBe(true);
  });

  it('writes a marker so a second run does nothing, and a bumped version runs again', async () => {
    await rec('a');
    expect((await run()).status).toBe('done');
    renders.length = 0;
    await rec('later', { thumb: PNG, plate: null }); // a new entry without a plate is not touched while the marker stands
    expect((await run()).status).toBe('already');
    expect(renders).toEqual([]);
    expect((await run({ version: B.PLATE_BACKFILL_VERSION + 1 })).status).toBe('done');
    expect(renders).toEqual(['later']);
  });

  it('one failing entry does not stop the rest, is warned about once, and is not retried (marker is still written)', async () => {
    await rec('a'); await rec('boom'); await rec('z');
    const warns = [];
    const out = await run({ log: (...a) => warns.push(a) });
    expect(out).toMatchObject({ status: 'done', done: 2, failed: 1 });
    expect(warns.length).toBe(1);
    renders.length = 0;
    expect((await run()).status).toBe('already');
    expect(renders).toEqual([]);
    expect((await store.listWorks()).find((x) => x.name === 'boom').plate).toBeNull();
  });

  it('aborts cleanly without a marker when asked to stop', async () => {
    await rec('a'); await rec('b');
    let n = 0;
    const out = await run({ shouldAbort: () => (n += 1) > 1 });
    expect(out.status).toBe('aborted');
    expect(await store.getMeta(B.META_KEY)).toBeNull();
    expect((await run()).status).toBe('done');
  });

  it('does not overwrite a plate made meanwhile, and ignores an entry that vanished', async () => {
    const a = await rec('a'); const b = await rec('b');
    const mine = { kind: 'svg', data: '<svg viewBox="0 0 2 2"/>' };
    renderer.renderDocument = async (doc) => {
      if (doc.n === 'a') { await store.setPlate(a.id, mine, { notify: false }); await store.remove(b.id); }
      return { svg: dense(), ownColors: {} };
    };
    const out = await run();
    expect(out.status).toBe('done');
    expect((await store.get(a.id)).plate).toEqual(mine);
    expect(await store.get(b.id)).toBeNull();
    expect(await store.setPlate('nope', mine)).toBe(false);
  });

  it('is unavailable (a no-op) without a store or renderer', async () => {
    expect((await B.run({})).status).toBe('unavailable');
    expect((await B.run({ store, renderer: null })).status).toBe('unavailable');
  });
});
