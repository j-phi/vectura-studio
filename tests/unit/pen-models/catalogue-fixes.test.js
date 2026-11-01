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

describe('pen catalogue fixes', () => {
  let dom; let V;
  beforeAll(() => { dom = load(); V = dom.window.Vectura; });
  afterAll(() => dom?.window?.close());
  const M = (id) => V.PEN_MODELS.MODELS[id];
  const laid = (id, label) => M(id).sizes.find((s) => s.label === label)?.laidWidthMm;

  it('Micron sizes are the real 003..12 range with canonical labels', () => {
    expect(M('sakura-pigma-micron').sizes.map((s) => s.label)).toEqual(['003', '005', '01', '02', '03', '04', '05', '08', '10', '12']);
    const s04 = M('sakura-pigma-micron').sizes.find((s) => s.label === '04');
    expect([s04.nominalWidthMm, s04.laidWidthMm]).toEqual([0.4, 0.42]);
    const s12 = M('sakura-pigma-micron').sizes.find((s) => s.label === '12');
    expect([s12.nominalWidthMm, s12.laidWidthMm]).toEqual([0.7, 0.74]);
    expect(M('sakura-pigma-micron').overlapDarkening).toBe(0.15);
  });
  it("sizeOf resolves the legacy Micron '1' alias to '10'; canonicalSize maps it", () => {
    const m = M('sakura-pigma-micron');
    expect(V.PenModel.sizeOf(m, '1').label).toBe('10');
    expect(V.PenModel.sizeOf(m, '10').label).toBe('10');
    expect(V.PenModel.sizeOf(m, 'nope')).toBe(null);
    expect(V.PenModel.canonicalSize('sakura-pigma-micron', '1')).toBe('10');
    expect(V.PenModel.canonicalSize('sakura-pigma-micron', '05')).toBe('05');
    expect(V.PenModel.canonicalSize('plain', '1')).toBe('1');
  });
  it("validatePen canonicalizes size aliases ('1' -> '10')", () => {
    const p = V.PenValidate.validatePen({ id: 'p1', name: 'x', color: '#000000', width: 0.65, model: 'sakura-pigma-micron', size: '1' });
    expect(p.size).toBe('10');
    const q = V.PenValidate.validatePen({ id: 'p2', name: 'x', color: '#000000', width: 0.5, model: 'sakura-pigma-micron', size: '05' });
    expect(q.size).toBe('05');
  });
  it('value fixes', () => {
    expect(laid('stabilo-point-88', '0.4')).toBe(0.4);
    expect(laid('sakura-gelly-roll-classic', '05')).toBe(0.3);
    expect(laid('sakura-gelly-roll-metallic', '10')).toBe(0.45);
    expect(M('uniball-signo-broad-um153').skip.rate).toBe(0.03);
    expect(M('sakura-gelly-roll-moonlight').opacity).toBe(0.9);
  });
  it('CATALOGUE_REV is exported', () => {
    expect(V.PEN_MODELS.CATALOGUE_REV).toBe('2026-11-pen-lab');
    expect(V.PEN_MODELS.LIMITS.studioStarveLenMm).toBe(3000);
  });
});
