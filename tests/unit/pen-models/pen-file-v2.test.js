import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILES = ['src/config/papers.js', 'src/core/paper.js', 'src/config/pen-models.js', 'src/core/pen-model.js', 'src/core/pen-validate.js', 'src/core/user-library-store.js', 'src/core/pen-library.js'];
const load = () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const ctx = dom.getInternalVMContext();
  FILES.forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }));
  return dom;
};

describe('pen file schema v2', () => {
  let dom; let V;
  beforeAll(() => { dom = load(); V = dom.window.Vectura; });
  afterAll(() => dom?.window?.close());
  const file = (version, pens, extra = {}) => JSON.stringify({ schema: 'vectura-pens', version, pens, ...extra });

  it('SCHEMA is v2 with minVersion 1', () => {
    expect(V.PEN_MODELS.SCHEMA).toMatchObject({ id: 'vectura-pens', version: 2, minVersion: 1 });
  });
  it('exportDoc writes v2 with catalogueRev, optional box, and nibMm/desc/penName', () => {
    const doc = V.PenLibrary.exportDoc([{ name: 'A 05', color: '#112233', width: 0.46, model: 'sakura-pigma-micron', size: '05', nibMm: 0.45, desc: 'fine', penName: 'A' }], { box: { name: 'Set' } });
    expect(doc).toMatchObject({ schema: 'vectura-pens', version: 2, catalogueRev: '2026-11-pen-lab', box: { name: 'Set' } });
    expect(doc.pens[0]).toMatchObject({ nibMm: 0.45, desc: 'fine', penName: 'A' });
    expect(V.PenLibrary.exportDoc([]).box).toBeUndefined();
  });
  it('toFilePen validates nibMm and trims desc', () => {
    const t = V.PenLibrary.toFilePen;
    expect(t({ name: 'x', color: '#000000', width: 0.3, nibMm: 99 }).nibMm).toBeUndefined();
    expect(t({ name: 'x', color: '#000000', width: 0.3, nibMm: 'a' }).nibMm).toBeUndefined();
    expect(t({ name: 'x', color: '#000000', width: 0.3, desc: 'y'.repeat(200) }).desc).toHaveLength(80);
  });
  it('parseImport accepts v1 (nibMm from model size, sizes canonicalized) and v2, refuses v3', () => {
    const v1 = V.PenLibrary.parseImport(file(1, [{ name: 'M', color: '#000000', width: 0.65, model: 'sakura-pigma-micron', size: '1' }]));
    expect(v1).toMatchObject({ ok: true, version: 1, catalogueRev: null, box: null });
    expect(v1.pens[0].size).toBe('10');
    expect(v1.pens[0].nibMm).toBe(0.6);
    const v2 = V.PenLibrary.parseImport(file(2, [{ name: 'M', color: '#000000', width: 0.46, model: 'sakura-pigma-micron', size: '05', nibMm: 0.45 }], { catalogueRev: 'r1', box: { name: 'Box' } }));
    expect(v2).toMatchObject({ ok: true, version: 2, catalogueRev: 'r1', box: { name: 'Box' } });
    expect(v2.pens[0].nibMm).toBe(0.45);
    expect(V.PenLibrary.parseImport(file(3, [{ name: 'M', color: '#000000', width: 0.4 }]))).toEqual({ ok: false, reason: 'version' });
  });
  it('My pens store keeps WRITING version 1 and a v2 pen survives', () => {
    dom.window.localStorage.clear();
    const lib = V.PenLibrary.library();
    const put = lib.put(V.PenLibrary.toFilePen({ name: 'n', color: '#000000', width: 0.3, nibMm: 0.3 }));
    expect(put.ok).toBe(true);
    const raw = JSON.parse(dom.window.localStorage.getItem(V.PEN_MODELS.LIBRARY_KEY));
    expect(raw).toMatchObject({ schema: 'vectura-pens', version: 1 });
    expect(lib.list()).toHaveLength(1);
  });
});
