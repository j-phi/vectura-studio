/**
 * Pen Studio box / pen files. PenLibrary schema v2 belongs to unit A and is not
 * merged yet, so exportDoc / parseImport are replaced below by a stub that
 * follows the contract: exportDoc(pens,{box}) -> {schema,version:2,appVersion,
 * catalogueRev,box?,pens}; parseImport accepts 1<=version<=2 -> {ok,pens,rejected,
 * version,catalogueRev,box}. Records keep nibMm / penName / desc.
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
const KEEP = ['name', 'color', 'width', 'model', 'size', 'nibMm', 'penName', 'desc', 'ink', 'effect', 'color2'];

const stubV2 = (PL) => {
  PL.exportDoc = (pens, opts) => {
    const out = { schema: 'vectura-pens', version: 2, appVersion: 'test', catalogueRev: 'test-rev' };
    if (opts && opts.box) out.box = { name: opts.box.name };
    out.pens = pens.map((p) => { const r = {}; KEEP.forEach((k) => { if (p[k] !== undefined) r[k] = JSON.parse(JSON.stringify(p[k])); }); return r; });
    return out;
  };
  PL.parseImport = (text) => {
    let doc;
    try { doc = JSON.parse(text); } catch (_e) { return { ok: false, reason: 'parse' }; }
    if (!doc || doc.schema !== 'vectura-pens') return { ok: false, reason: 'schema' };
    if (Math.floor(Number(doc.version)) > 2) return { ok: false, reason: 'version' };
    if (!Array.isArray(doc.pens) || !doc.pens.length) return { ok: false, reason: 'empty' };
    let rejected = 0; const pens = [];
    doc.pens.forEach((raw) => {
      if (!raw || !/^#[0-9a-f]{6}$/i.test(raw.color) || !(raw.width > 0)) { rejected += 1; return; }
      const r = {}; KEEP.forEach((k) => { if (raw[k] !== undefined) r[k] = raw[k]; });
      pens.push(r);
    });
    if (!pens.length) return { ok: false, reason: 'empty', rejected };
    return { ok: true, pens, rejected, version: Number(doc.version), catalogueRev: doc.catalogueRev || null, box: doc.box ? { name: String(doc.box.name || '') } : null };
  };
};

const load = () => {
  const store = new Map();
  const win = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }, crypto: globalThis.crypto, console };
  win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  FILES.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  stubV2(win.Vectura.PenLibrary);
  return win.Vectura;
};

let V; let S;
beforeEach(() => { V = load(); S = V.PenStudioStore; });

const sample = () => {
  const first = S.createBox(S.emptyDoc(), 'Fine / liners');
  const boxId = first.boxId;
  const doc = S.createBox(first.doc, 'Other').doc;
  const a = S.addPen(doc, boxId, { name: 'Micron Black', color: '#1b1b1d', model: 'sakura-pigma-micron', sizes: ['005', '05'], ink: { skips: 0.1 } });
  const b = S.addPen(a.doc, boxId, { name: 'Sienna', color: '#9a3412', model: null, sizes: ['0.3'] });
  return { doc: b.doc, boxId, a: a.penId, b: b.penId };
};

describe('toDocPen', () => {
  it('builds a pen file record with laid width and nib', () => {
    const { doc, a, b } = sample();
    expect(S.toDocPen(S.penById(doc, a), '05')).toEqual({ name: 'Micron Black', color: '#1b1b1d', width: 0.46, model: 'sakura-pigma-micron', size: '05', nibMm: 0.45, ink: { skips: 0.1 } });
    expect(S.toDocPen(S.penById(doc, b), '0.3')).toEqual({ name: 'Sienna', color: '#9a3412', width: 0.3, nibMm: 0.3 });
  });
});

describe('export', () => {
  it('exports a box with one record per owned size and penName as the base', () => {
    const { doc, boxId } = sample();
    const r = S.exportBox(doc, boxId);
    expect(r.ok).toBe(true);
    expect(r.filename).toBe('fine-liners.vectura-pens.json');
    const file = JSON.parse(r.text);
    expect(file).toMatchObject({ schema: 'vectura-pens', version: 2, box: { name: 'Fine / liners' } });
    expect(file.pens.map((p) => p.name)).toEqual(['Micron Black 005', 'Micron Black 05', 'Sienna']);
    expect(file.pens.map((p) => p.penName)).toEqual(['Micron Black', 'Micron Black', 'Sienna']);
    expect(r.count).toBe(3);
  });

  it('refuses an empty box', () => {
    const { doc } = sample();
    expect(S.exportBox(doc, doc.boxes[1].id)).toEqual({ ok: false, reason: 'empty' });
  });

  it('exports one pen at one size without a box', () => {
    const { doc, a } = sample();
    const file = JSON.parse(S.exportPen(doc, a, '05').text);
    expect(file.box).toBeUndefined();
    expect(file.pens).toHaveLength(1);
    expect(file.pens[0]).toMatchObject({ name: 'Micron Black', size: '05', nibMm: 0.45 });
  });
});

describe('import', () => {
  it('round-trips a box, reusing pens with the same name and color', () => {
    const { doc, boxId } = sample();
    const r = S.importBox(doc, S.exportBox(doc, boxId).text);
    expect(r.ok).toBe(true);
    const box = r.doc.boxes.find((b) => b.id === r.boxId);
    expect(box.name).toBe('Fine / liners (imported)');
    expect(box.items).toHaveLength(2);
    expect(r.doc.pens).toHaveLength(doc.pens.length);
    expect(box.items[0].sizes).toEqual(['005', '05']);
    expect(r.count).toBe(2);
  });

  it('creates new grouped pens in a fresh studio', () => {
    const { doc, boxId } = sample();
    const r = S.importBox(S.emptyDoc(), S.exportBox(doc, boxId).text);
    expect(r.doc.pens).toHaveLength(2);
    const micron = r.doc.pens.find((p) => p.name === 'Micron Black');
    expect(micron).toMatchObject({ model: 'sakura-pigma-micron', ink: { skips: 0.1 }, color: '#1b1b1d' });
    expect(r.doc.boxes[0].items.find((i) => i.penId === micron.id).sizes).toEqual(['005', '05']);
    const plain = r.doc.pens.find((p) => p.name === 'Sienna');
    expect(plain.model).toBeNull();
    expect(r.doc.boxes[0].items.find((i) => i.penId === plain.id).sizes).toEqual(['0.3']);
  });

  it('imports a v1 file (no box, no penName) into "Imported box"', () => {
    const v1 = JSON.stringify({ schema: 'vectura-pens', version: 1, appVersion: '1.4.0', pens: [
      { name: 'Old', color: '#336699', width: 0.46, model: 'sakura-pigma-micron', size: '05' },
      { name: 'Custom width', color: '#aa5500', width: 0.31, model: 'sakura-pigma-micron', size: 'custom' },
      { name: 'Broken', color: 'blue', width: 0.3 },
    ] });
    const r = S.importBox(S.emptyDoc(), v1);
    expect(r.ok).toBe(true);
    expect(r.doc.boxes[0].name).toBe('Imported box (imported)');
    expect(r.rejected).toBe(1);
    expect(r.count).toBe(2);
    expect(r.doc.boxes[0].items.map((i) => i.sizes)).toEqual([['05'], ['02']]);
  });

  it('passes parse errors through and leaves the doc to the caller', () => {
    const d = S.emptyDoc();
    expect(S.importBox(d, 'nope')).toEqual({ ok: false, reason: 'parse' });
    expect(S.importBox(d, JSON.stringify({ schema: 'x' }))).toEqual({ ok: false, reason: 'schema' });
    expect(S.importBox(d, JSON.stringify({ schema: 'vectura-pens', version: 3, pens: [{}] }))).toEqual({ ok: false, reason: 'version' });
  });

  it('refuses when the box limit is reached', () => {
    let d = S.emptyDoc();
    for (let i = 0; i < V.PEN_STUDIO.LIMITS.maxBoxes; i += 1) d = S.createBox(d).doc;
    expect(S.importBox(d, '{}')).toEqual({ ok: false, reason: 'full' });
  });
});
