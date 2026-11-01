/**
 * Pen Studio store — seeding, My pens migration, boxes, pens, sizes, saveAsNew,
 * persistence. PenLibrary v2 file I/O is stubbed in box-files.test.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILES = [
  'src/config/start-page-colorways.js', 'src/config/pen-models.js', 'src/config/pen-studio.js', 'src/config/ui-constants.js',
  'src/core/pen-validate.js', 'src/core/pen-model.js', 'src/core/user-library-store.js', 'src/core/pen-library.js',
  'src/core/pen-studio/store.js', 'src/core/pen-studio/draft.js',
];

const makeStorage = (opts = {}) => {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (opts.throwOn) throw opts.throwOn; m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
};

const load = (storageOpts) => {
  const ls = makeStorage(storageOpts);
  const win = { localStorage: ls, crypto: globalThis.crypto, console };
  win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  FILES.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  return { V: win.Vectura, ls, win };
};

let V; let S; let ls;
beforeEach(() => { ({ V, ls } = load()); S = V.PenStudioStore; });

const names = (doc, box) => box.items.map((i) => S.penById(doc, i.penId).name);

describe('first-run seeding', () => {
  it('seeds the four starter boxes from the real catalogue and persists them', () => {
    const doc = S.load();
    expect(doc.boxes.map((b) => b.name)).toEqual(['Micron set', 'Night papers', 'Stabilo 88 brights', 'Studio inks']);
    const micron = doc.boxes[0];
    expect(micron.pinned).toBe(true);
    expect(names(doc, micron)).toEqual(['Micron Black', 'Micron Sepia', 'Micron Burgundy', 'Micron Blue', 'Micron Green']);
    expect(micron.items[0].sizes).toEqual(['005', '05', '08']);
    expect(micron.items[1].sizes).toEqual(['01', '05']);
    const black = S.penById(doc, micron.items[0].penId);
    expect(black.color).toBe('#1b1b1d');
    expect(black.model).toBe('sakura-pigma-micron');
    expect(doc.boxes[1].pinned).toBe(true);
    expect(names(doc, doc.boxes[1])).toContain('Moonlight Pink');
    expect(doc.boxes[2].pinned).toBe(false);
    const inks = doc.boxes[3];
    expect(names(doc, inks)).toEqual(['Burnt Sienna', 'Prussian', 'Indigo', 'Teal', 'Butter']);
    expect(S.penById(doc, inks.items[0].penId).model).toBeNull();
    expect(S.penById(doc, inks.items[0].penId).color).toBe('#9a3412');
    expect(ls.getItem('vectura.penStudio')).toBeTruthy();
    expect(S.load()).toEqual(doc);
  });

  it('every starter pen resolves (no silently skipped catalogue entries)', () => {
    const doc = S.load();
    const want = V.PEN_STUDIO.STARTER_BOXES.map((b) => b.pens.length);
    expect(doc.boxes.map((b) => b.items.length)).toEqual(want);
    doc.boxes.forEach((b) => b.items.forEach((i) => {
      const p = S.penById(doc, i.penId);
      const labels = S.sizesOf(p.model).map((s) => s.label);
      i.sizes.forEach((l) => expect(labels).toContain(l));
    }));
  });

  it('sorts pinned boxes first, otherwise stable', () => {
    let doc = S.load();
    doc = S.setPinned(doc, doc.boxes[3].id, true);
    expect(S.sortedBoxes(doc).map((b) => b.name)).toEqual(['Micron set', 'Night papers', 'Studio inks', 'Stabilo 88 brights']);
  });
});

describe('My pens migration', () => {
  it('copies a non-empty My pens library once, never altering it', () => {
    const lib = V.PenLibrary.library();
    lib.put({ name: 'Mine', color: '#112233', width: 0.46, model: 'sakura-pigma-micron', size: '05' });
    lib.put({ name: 'Plain mine', color: '#445566', width: 0.5 });
    const before = ls.getItem('vectura.penLibrary');
    const doc = S.load();
    const box = doc.boxes.find((b) => b.name === 'My pens');
    expect(box).toBeTruthy();
    expect(names(doc, box)).toEqual(['Mine', 'Plain mine']);
    expect(box.items[0].sizes).toEqual(['05']);
    expect(box.items[1].sizes).toEqual(['0.5']);
    expect(doc.migratedMyPens).toBe(true);
    expect(ls.getItem('vectura.penLibrary')).toBe(before);
    const gone = S.deleteBox(doc, box.id);
    expect(S.save(gone).ok).toBe(true);
    expect(S.load().boxes.some((b) => b.name === 'My pens')).toBe(false);
  });

  it('adds no My pens box when the library is empty', () => {
    expect(S.load().boxes.some((b) => b.name === 'My pens')).toBe(false);
  });
});

describe('box and pen operations', () => {
  it('creates, renames, opens and deletes boxes without mutating the input', () => {
    const doc = S.emptyDoc();
    const a = S.createBox(doc);
    expect(doc.boxes).toHaveLength(0);
    expect(a.doc.boxes[0].name).toBe('My box 1');
    const b = S.createBox(a.doc);
    expect(b.doc.boxes[1].name).toBe('My box 2');
    let d = S.renameBox(b.doc, b.boxId, '  Fine\u0007  liners ');
    expect(d.boxes[1].name).toBe('Fine liners');
    expect(S.renameBox(d, b.boxId, '   ')).toBe(d);
    d = S.setOpen(d, b.boxId, false);
    expect(d.boxes[1].open).toBe(false);
    expect(S.deleteBox(d, b.boxId).boxes).toHaveLength(1);
  });

  it('names a new box with the first free "My box N", even after deletions', () => {
    let d = S.createBox(S.emptyDoc()).doc;
    d = S.createBox(d).doc;
    d = S.createBox(d).doc;
    d = S.deleteBox(d, d.boxes[0].id);
    expect(d.boxes.map((b) => b.name)).toEqual(['My box 2', 'My box 3']);
    d = S.createBox(d).doc;
    expect(d.boxes[2].name).toBe('My box 1');
    d = S.createBox(d).doc;
    expect(d.boxes[3].name).toBe('My box 4');
  });

  it('caps boxes', () => {
    let d = S.emptyDoc();
    for (let i = 0; i < V.PEN_STUDIO.LIMITS.maxBoxes; i += 1) d = S.createBox(d).doc;
    const r = S.createBox(d);
    expect(r.ok).toBe(false);
    expect(r.doc).toBe(d);
  });

  it('keeps owned sizes in model order and never lets them go empty', () => {
    const { doc: d0, boxId } = S.createBox(S.emptyDoc());
    const { doc, penId } = S.addPen(d0, boxId, { name: 'M', color: '#1b1b1d', model: 'sakura-pigma-micron', sizes: ['08', '005', '005'] });
    expect(doc.boxes[0].items[0].sizes).toEqual(['005', '08']);
    const one = S.setOwnedSizes(doc, boxId, penId, ['08']);
    expect(one.boxes[0].items[0].sizes).toEqual(['08']);
    expect(S.setOwnedSizes(one, boxId, penId, [])).toBe(one);
    expect(S.setOwnedSizes(one, boxId, penId, ['nope'])).toBe(one);
    const dflt = S.addPen(d0, boxId, { name: 'D', color: '#1b1b1d', model: 'sakura-pigma-micron' });
    expect(dflt.doc.boxes[0].items[0].sizes).toEqual(['05']);
  });

  it('rejects bad colors, unknown models fall back to plain', () => {
    const { doc, boxId } = S.createBox(S.emptyDoc());
    expect(S.addPen(doc, boxId, { name: 'x', color: 'red' }).ok).toBe(false);
    const r = S.addPen(doc, boxId, { name: 'x', color: '#ABCDEF', model: 'nope', sizes: ['0.5'] });
    expect(S.penById(r.doc, r.penId)).toMatchObject({ model: null, color: '#abcdef' });
    expect(r.doc.boxes[0].items[0].sizes).toEqual(['0.5']);
  });

  it('move keeps owned sizes, never duplicates, and removePen collects orphans', () => {
    const first = S.createBox(S.emptyDoc());
    const a = first.boxId;
    const second = S.createBox(first.doc);
    const b = second.boxId;
    const added = S.addPen(second.doc, a, { name: 'M', color: '#1b1b1d', model: 'sakura-pigma-micron', sizes: ['005', '08'] });
    const moved = S.movePen(added.doc, added.penId, a, b);
    expect(moved.boxes[0].items).toHaveLength(0);
    expect(moved.boxes[1].items).toEqual([{ penId: added.penId, sizes: ['005', '08'] }]);
    expect(S.movePen(moved, added.penId, b, b)).toBe(moved);
    expect(S.boxOf(moved, added.penId).id).toBe(b);
    expect(S.removePen(moved, b, added.penId).pens).toHaveLength(0);
    expect(S.deleteBox(moved, b).pens).toHaveLength(0);
  });
});

describe('updatePen', () => {
  it('stores ink minus keys equal to the model default and clamps', () => {
    const { doc, boxId } = S.createBox(S.emptyDoc());
    const { doc: d, penId } = S.addPen(doc, boxId, { name: 'M', color: '#1b1b1d', model: 'sakura-pigma-micron' });
    const wet = V.PEN_MODELS.MODELS['sakura-pigma-micron'].bleed.wetness;
    const u = S.updatePen(d, penId, { ink: { wetness: wet, blobs: 9, skips: 0.1, bogus: 1, jitter: NaN }, name: ' New ', desc: 'hello' });
    const pen = S.penById(u, penId);
    expect(pen.ink).toEqual({ blobs: 3, skips: 0.1 });
    expect(pen.name).toBe('New');
    expect(pen.desc).toBe('hello');
    expect(S.penById(S.updatePen(u, penId, { name: '  ' }), penId).name).toBe('New');
    expect(S.penById(S.updatePen(u, penId, { desc: '' }), penId).desc).toBeUndefined();
  });

  it('keeps the new studio ink keys when they differ from the model', () => {
    const { doc, boxId } = S.createBox(S.emptyDoc());
    const { doc: d, penId } = S.addPen(doc, boxId, { name: 'G', color: '#f8f8f4', model: 'sakura-gelly-roll-classic' });
    const g = V.PEN_MODELS.MODELS['sakura-gelly-roll-classic'];
    const u = S.updatePen(d, penId, { ink: { coverOnDark: g.coverOnDark, starvation: 0.5, overlap: 0.4 } });
    expect(S.penById(u, penId).ink).toEqual({ starvation: 0.5, overlap: 0.4 });
  });
});

describe('saveAsNew', () => {
  const setup = () => {
    const { doc, boxId } = S.createBox(S.emptyDoc());
    const a = S.addPen(doc, boxId, { name: 'Alpha', color: '#1b1b1d', model: 'sakura-pigma-micron', sizes: ['005', '08'], desc: 'src' });
    const b = S.addPen(a.doc, boxId, { name: 'Beta', color: '#1f3a8a', model: 'sakura-pigma-micron' });
    return { doc: b.doc, boxId, a: a.penId };
  };

  it('refuses empty and duplicate names (case-insensitive, per box)', () => {
    const { doc, boxId, a } = setup();
    expect(S.saveAsNew(doc, a, boxId, '   ', {})).toEqual({ ok: false, reason: 'name-empty' });
    expect(S.saveAsNew(doc, a, boxId, 'bEtA', {})).toEqual({ ok: false, reason: 'name-taken' });
    const other = S.createBox(doc);
    expect(S.saveAsNew(other.doc, a, other.boxId, 'beta', {}).ok).toBe(true);
  });

  it('inserts after the source, copies sizes and description, leaves the source alone', () => {
    const { doc, boxId, a } = setup();
    const r = S.saveAsNew(doc, a, boxId, 'Alpha (custom)', { skips: 0.1 });
    expect(r.ok).toBe(true);
    expect(names(r.doc, r.doc.boxes[0])).toEqual(['Alpha', 'Alpha (custom)', 'Beta']);
    expect(S.penById(r.doc, r.penId)).toMatchObject({ desc: 'src', color: '#1b1b1d', ink: { skips: 0.1 } });
    expect(r.doc.boxes[0].items[1].sizes).toEqual(['005', '08']);
    expect(S.penById(r.doc, a).ink).toEqual({});
  });

  it('can target another box', () => {
    const { doc, a } = setup();
    const m = S.createBox(doc);
    const r = S.saveAsNew(m.doc, a, m.boxId, 'Alpha 2', {});
    expect(r.doc.boxes[1].items).toHaveLength(1);
    expect(r.doc.boxes[1].items[0].sizes).toEqual(['005', '08']);
  });
});

describe('persistence', () => {
  it('quota failure leaves storage unchanged', () => {
    const seeded = load();
    const doc = seeded.V.PenStudioStore.load();
    const before = seeded.ls.getItem('vectura.penStudio');
    const err = Object.assign(new Error('full'), { name: 'QuotaExceededError', code: 22 });
    const full = load({ throwOn: err });
    full.ls.m.set('vectura.penStudio', before);
    const r = full.V.PenStudioStore.save(seeded.V.PenStudioStore.createBox(doc).doc);
    expect(r).toEqual({ ok: false, reason: 'quota' });
    expect(full.ls.getItem('vectura.penStudio')).toBe(before);
    const blocked = load({ throwOn: new Error('blocked') });
    expect(blocked.V.PenStudioStore.save(doc)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('refuses a document over the byte cap', () => {
    const big = S.emptyDoc();
    big.pens = [{ id: 'x', name: 'n'.repeat(600 * 1024) }];
    expect(S.save(big)).toEqual({ ok: false, reason: 'quota' });
    expect(ls.getItem('vectura.penStudio')).toBeNull();
  });

  it('rebuilds a hostile stored document from whitelisted fields', () => {
    ls.setItem('vectura.penStudio', JSON.stringify({
      schema: 'vectura-pen-studio', version: 1, migratedMyPens: true,
      pens: [{ id: 'sp-ok', name: 'A\u0000b', color: '#123456', model: 'sakura-pigma-micron', ink: { wetness: 5, evil: 1 } }, { id: 'sp-bad', color: 'nope' }],
      boxes: [{ id: 'box-1', name: 'B', items: [{ penId: 'sp-ok', sizes: ['zzz'] }, { penId: 'sp-bad', sizes: ['05'] }, { penId: 'ghost' }] }],
    }));
    const doc = S.load();
    expect(doc.pens).toHaveLength(1);
    expect(doc.pens[0]).toMatchObject({ name: 'A b', ink: { wetness: 1 } });
    expect(doc.boxes[0].items).toEqual([{ penId: 'sp-ok', sizes: ['05'] }]);
  });

  it('falls back to a fresh seed on corrupt JSON', () => {
    ls.setItem('vectura.penStudio', '{nope');
    expect(S.load().boxes).toHaveLength(4);
  });

  it('keeps a backup of unreadable storage before reseeding, and does not re-run My pens migration', () => {
    V.PenLibrary.library().put({ name: 'Mine', color: '#112233', width: 0.46, model: 'sakura-pigma-micron', size: '05' });
    ls.setItem('vectura.penStudio', '{nope');
    const doc = S.load();
    expect(ls.getItem('vectura.penStudio.bak')).toBe('{nope');
    expect(doc.migratedMyPens).toBe(true);
    expect(doc.boxes.map((b) => b.name)).not.toContain('My pens');
  });

  it('backs up a wrong-schema document too, and never overwrites an existing backup', () => {
    const alien = JSON.stringify({ schema: 'something-else', boxes: [], pens: [] });
    ls.setItem('vectura.penStudio', alien);
    S.load();
    expect(ls.getItem('vectura.penStudio.bak')).toBe(alien);
    ls.setItem('vectura.penStudio', '{again');
    S.load();
    expect(ls.getItem('vectura.penStudio.bak')).toBe(alien);
  });

  it('refuses to downgrade a newer document: keeps it, runs in memory only, and says why', () => {
    const newer = JSON.stringify({ schema: 'vectura-pen-studio', version: 99, pens: [], boxes: [], future: true });
    ls.setItem('vectura.penStudio', newer);
    const doc = S.load();
    expect(doc.boxes.length).toBeGreaterThan(0);
    expect(S.status()).toEqual({ memoryOnly: true, reason: 'newer' });
    expect(S.save(doc)).toEqual({ ok: false, reason: 'newer' });
    expect(ls.getItem('vectura.penStudio')).toBe(newer);
  });
});
