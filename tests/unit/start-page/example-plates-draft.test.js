/*
 * Unit tests for src/core/start-page/example-plates-draft.js: the Developer Mode draft of the shipped example plates and
 * the EXAMPLE_PLATES serializer. Round trip: shipped config -> draft -> export reproduces an equivalent config.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const run = (rel, win) => vm.runInContext(read(rel), win.__ctx, { filename: rel });

const sandbox = () => {
  const win = {};
  win.window = win;
  win.__ctx = vm.createContext({ window: win, JSON, Promise, Map, Set, Date, Math, Error, Array, Object, Number, String });
  return win;
};
const evalConfig = (source) => { const win = sandbox(); vm.runInContext(source, win.__ctx, { filename: 'picks.js' }); return win.Vectura.START_PAGE_PICKS; };
const plain = (list) => JSON.parse(JSON.stringify(list));

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m }; };

describe('StartPageExamplePlates', () => {
  let M; let shipped; let source;
  beforeEach(() => {
    const win = sandbox();
    run('src/core/start-page/plates-store.js', win);
    run('src/core/start-page/example-plates-draft.js', win);
    M = win.Vectura.StartPageExamplePlates;
    source = read('src/config/start-page-picks.js');
    shipped = plain(evalConfig(source).EXAMPLE_PLATES);
  });

  it('the shipped config carries one marker-delimited EXAMPLE_PLATES region', () => {
    expect(source.match(/<example-plates:begin>/g)).toHaveLength(1);
    expect(source.match(/<example-plates:end>/g)).toHaveLength(1);
    const region = M.extractRegion(source);
    expect(region).toMatch(/const EXAMPLE_PLATES = Object\.freeze\(\[/);
    expect(region.trimEnd().endsWith('// <example-plates:end>')).toBe(true);
  });

  it('round trip: shipped config -> draft -> export -> equivalent config', () => {
    const draft = M.fromShipped(shipped);
    expect(draft).toHaveLength(shipped.length);
    const next = M.replaceRegion(source, M.serialize(draft));
    expect(plain(evalConfig(next).EXAMPLE_PLATES)).toEqual(shipped);
    // the rest of the file is untouched and a second export is a no-op
    expect(M.replaceRegion(next, M.serialize(M.fromShipped(plain(evalConfig(next).EXAMPLE_PLATES))))).toBe(next);
    expect(next.replace(M.extractRegion(next), '')).toBe(source.replace(M.extractRegion(source), ''));
  });

  it('the live store round trips too, after edits, and the frozen entries survive', async () => {
    const store = M.create({ storage: memStorage(), shipped });
    await store.upsert('example:rainfall-downpour', { texts: { title: 'Heavy Rain' }, layout: 'full-sheet', pin: 'black-white' });
    const exported = plain(evalConfig(M.replaceRegion(source, M.serialize(store.plates()))).EXAMPLE_PLATES);
    expect(exported.find((e) => e.presetId === 'rainfall-downpour')).toEqual({ presetId: 'rainfall-downpour', title: 'Heavy Rain', word: 'Rainfall', layout: 'full-sheet', pin: 'black-white' });
    expect(exported).toHaveLength(shipped.length);
    expect(Object.isFrozen(evalConfig(M.replaceRegion(source, M.serialize(store.plates()))).EXAMPLE_PLATES[0])).toBe(true);
  });

  it('serializes quotes and backslashes safely and omits empty fields', () => {
    const block = M.serialize([{ presetId: 'a-b', title: "Tom's \\ Plate", word: '', layout: null, pin: undefined }]);
    const list = new Function('Object', `${block}\nreturn EXAMPLE_PLATES;`)(Object);
    expect(plain(list)).toEqual([{ presetId: 'a-b', title: "Tom's \\ Plate" }]);
  });

  it('replaceRegion refuses a file without the markers', () => {
    expect(() => M.replaceRegion('const x = 1;', M.serialize([]))).toThrow(/markers/);
  });

  it('starts as the shipped list, is not dirty, and persists a draft to storage', async () => {
    const st = memStorage();
    const a = M.create({ storage: st, shipped });
    expect(a.isDirty()).toBe(false);
    expect(st._m.size).toBe(0);
    await a.upsert('example:spiral-galaxy', { texts: { word: 'Whorl' } });
    expect(a.isDirty()).toBe(true);
    const b = M.create({ storage: st, shipped }); // a reload
    expect(b.plates().find((p) => p.presetId === 'spiral-galaxy').word).toBe('Whorl');
    expect(b.plates().map((p) => p.key)).toEqual(a.plates().map((p) => p.key));
  });

  it('adds (also a duplicate preset), removes with undo, reorders and resets the order', async () => {
    const store = M.create({ storage: memStorage(), shipped });
    const first = shipped[0].presetId;
    const added = await store.add(first, { title: 'Again' });
    expect(added.id).toBe(`example:${first}#1`);
    expect(store.plates().at(-1)).toMatchObject({ presetId: first, title: 'Again', key: `example:${first}#1` });
    const tok = await store.remove('example:rainfall-downpour');
    expect(store.plates().some((p) => p.presetId === 'rainfall-downpour')).toBe(false);
    await store.undoRemove(tok);
    expect(store.plates().map((p) => p.presetId).indexOf('rainfall-downpour')).toBe(2);
    const ids = (await store.load()).order;
    await store.reorder(ids.slice().reverse());
    expect((await store.load()).order).toEqual(ids.slice().reverse());
    await store.resetOrder();
    expect((await store.load()).order).toEqual(ids);
  });

  it('Reset to shipped drops the draft (storage is cleared) and can be undone', async () => {
    const st = memStorage();
    const store = M.create({ storage: st, shipped });
    await store.remove('example:rainfall-downpour');
    await store.add('spiral-galaxy');
    const tok = await store.resetToShipped();
    expect(store.isDirty()).toBe(false);
    expect(st._m.size).toBe(0);
    expect(M.serialize(store.plates())).toBe(M.serialize(M.fromShipped(shipped)));
    await store.undoReset(tok);
    expect(store.isDirty()).toBe(true);
  });

  it('notifies subscribers and tolerates unavailable storage', async () => {
    const store = M.create({ storage: { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() {} }, shipped });
    let n = 0;
    const off = store.subscribe(() => { n += 1; });
    await store.upsert('example:spiral-galaxy', { layout: 'full-sheet' });
    expect(n).toBe(1);
    off();
    await store.upsert('example:spiral-galaxy', { layout: 'text-wrap' });
    expect(n).toBe(1);
    expect(store.plates().find((p) => p.presetId === 'spiral-galaxy').layout).toBe('text-wrap');
  });
});


describe('StartPageExamplePlates: optional manual colors', () => {
  let M; let source; let shipped;
  beforeEach(() => {
    const win = sandbox();
    run('src/core/start-page/plates-store.js', win);
    run('src/core/start-page/example-plates-draft.js', win);
    M = win.Vectura.StartPageExamplePlates;
    source = read('src/config/start-page-picks.js');
    shipped = plain(evalConfig(source).EXAMPLE_PLATES);
  });
  const withColors = (colors) => [{ presetId: 'spiral-galaxy', title: 'Spiral Galaxy', word: 'Spiral', layout: 'full-bleed-band', pin: 'sky-prussian', colors }];
  const evalBlock = (block) => new Function('Object', `${block}\nreturn EXAMPLE_PLATES;`)(Object);

  it('serializes all five roles (hex swatches and special-fill ids) in a fixed role order and evaluates to the same colors', () => {
    const colors = { band: '#c0392b', title: { fill: 'metallic-gold' }, background: '#101010', text: { fill: 'duotone' }, art: { fill: 'iridescent' } };
    const block = M.serialize(withColors(colors));
    expect(block).toContain("colors: Object.freeze({ art: Object.freeze({ fill: 'iridescent' }), text: Object.freeze({ fill: 'duotone' }), background: '#101010', title: Object.freeze({ fill: 'metallic-gold' }), band: '#c0392b' })");
    const out = evalBlock(block)[0];
    expect(plain(out.colors)).toEqual(colors);
    expect(Object.isFrozen(out.colors)).toBe(true);
    expect(Object.isFrozen(out.colors.title)).toBe(true);
  });

  it('round trips byte for byte: serialize(fromShipped(eval(serialize(x)))) is identical', () => {
    const block = M.serialize(withColors({ title: { fill: 'sunset' }, band: '#aabbcc' }));
    const again = M.serialize(M.fromShipped(plain(evalBlock(block))));
    expect(again).toBe(block);
    const file = M.replaceRegion(source, block);
    expect(M.replaceRegion(file, M.serialize(M.fromShipped(plain(evalConfig(file).EXAMPLE_PLATES))))).toBe(file);
  });

  it('back-compat: entries without colors serialize byte-identically to the shipped file', () => {
    expect(M.serialize(M.fromShipped(shipped))).toBe(M.extractRegion(source));
    expect(M.serialize(M.fromShipped(shipped))).not.toContain('colors');
  });

  it('omits null, empty and all-Auto colors', () => {
    ['', null, {}, { art: null, band: null }, { band: 'nope' }].forEach((c) => {
      const block = M.serialize(withColors(c === '' ? undefined : c));
      expect(block).not.toContain('colors');
    });
    expect(M.serialize(withColors({ art: null, band: '#000000' }))).toContain("colors: Object.freeze({ band: '#000000' })");
  });

  it('validates on load: unknown roles, malformed hex, unknown fills and wrong types are ignored, never thrown', () => {
    const bad = {
      art: '#12', text: 'red', background: { fill: 'rainbow' }, title: 42, band: ['#fff'], rim: '#ffffff', bg: '#ffffff', __proto__x: '#ffffff',
    };
    expect(() => M.fromShipped(withColors(bad))).not.toThrow();
    expect(M.fromShipped(withColors(bad))[0].colors).toBeNull();
    const mixed = M.fromShipped(withColors({ art: '#ABC', title: { fill: 'sunset', extra: 1 }, band: '#zzzzzz', rim: '#ffffff' }))[0].colors;
    expect(mixed).toEqual({ art: '#ABC', title: { fill: 'sunset' } });
    expect(Object.isFrozen(mixed)).toBe(true);
    expect(Object.isFrozen(mixed.title)).toBe(true);
    ['str', 5, [], true].forEach((c) => expect(M.fromShipped(withColors(c))[0].colors).toBeNull());
  });

  it('quotes safely: only validated values reach the output, so a hostile string cannot break out', () => {
    const block = M.serialize(withColors({ art: "#fff'); alert(1);//", band: { fill: "x'y" } }));
    expect(block).not.toContain('alert');
    expect(evalBlock(block)).toHaveLength(1);
  });

  it('the draft store carries colors: edits land in plates(), persist, mark it dirty, and a reload keeps them', async () => {
    const st = memStorage();
    const a = M.create({ storage: st, shipped });
    const id = 'example:spiral-galaxy';
    await a.upsert(id, { colors: { band: '#c0392b' } });
    await a.upsert(id, { colors: { title: { fill: 'sunset' } } });
    expect(a.isDirty()).toBe(true);
    expect(a.plates().find((p) => p.key === id).colors).toEqual({ title: { fill: 'sunset' }, band: '#c0392b' });
    const b = M.create({ storage: st, shipped });
    expect(b.plates().find((p) => p.key === id).colors).toEqual({ title: { fill: 'sunset' }, band: '#c0392b' });
    expect(M.serialize(b.plates())).toContain("colors: Object.freeze({ title: Object.freeze({ fill: 'sunset' }), band: '#c0392b' })");
    // back to Auto: the draft is clean again
    await a.upsert(id, { colors: null });
    expect(a.isDirty()).toBe(false);
    expect(M.serialize(a.plates())).toBe(M.extractRegion(source));
  });

  it('a malformed stored draft is sanitized on load, and reset(colors) clears them', async () => {
    const st = memStorage();
    st.setItem(M.KEY, JSON.stringify({ v: 1, plates: [{ key: 'example:spiral-galaxy', presetId: 'spiral-galaxy', colors: { art: 'nope', band: '#112233', zzz: 1 } }] }));
    const store = M.create({ storage: st, shipped });
    expect(store.plates()[0].colors).toEqual({ band: '#112233' });
    await store.reset('example:spiral-galaxy', ['colors']);
    expect(store.plates()[0].colors).toBeNull();
  });

  it('shipped entries that carry colors seed the draft and are not dirty until changed', () => {
    const seeded = withColors({ title: { fill: 'sunset' } });
    const store = M.create({ storage: memStorage(), shipped: seeded });
    expect(store.isDirty()).toBe(false);
    expect(store.plates()[0].colors).toEqual({ title: { fill: 'sunset' } });
  });
});
