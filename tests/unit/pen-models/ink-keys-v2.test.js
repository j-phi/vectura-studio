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

describe('new ink keys', () => {
  let dom; let V;
  beforeAll(() => { dom = load(); V = dom.window.Vectura; });
  afterAll(() => dom?.window?.close());
  const paper = (t) => ({ ...V.Paper.forType(t) });
  const info = (t) => V.PAPERS.TYPES[t];
  const mp = (id, extra = {}) => ({ ...V.PenModel.applyModel({ id: 'pen-a', name: 'A', color: '#222222', width: 0.4 }, id), ...extra });

  it('INK_KEYS and PARAM_LIMITS carry overlap, starvation, coverOnDark', () => {
    const { INK_KEYS, PARAM_LIMITS } = V.PEN_MODELS;
    ['overlap', 'starvation', 'coverOnDark'].forEach((k) => expect(INK_KEYS).toContain(k));
    expect(PARAM_LIMITS.overlap).toEqual([0, 1]);
    expect(PARAM_LIMITS.starvation).toEqual([0, 0.9]);
    expect(PARAM_LIMITS.coverOnDark).toEqual([0, 1]);
  });
  it('validatePen clamps the new keys', () => {
    const p = V.PenValidate.validatePen({ id: 'p', name: 'x', color: '#000000', width: 0.3, model: 'stabilo-point-88', ink: { overlap: 5, starvation: 2, coverOnDark: -1 } });
    expect(p.ink).toMatchObject({ overlap: 1, starvation: 0.9, coverOnDark: 0 });
  });
  it('inkDefaults come from the model', () => {
    const d = V.PenModel.inkDefaults(mp('sakura-gelly-roll-classic'));
    expect(d.overlap).toBe(0);
    expect(d.starvation).toBe(0.35);
    expect(d.coverOnDark).toBe(0.8);
  });
  it('overlap changes overlapDarkening', () => {
    const base = V.PenModel.resolveTraits(mp('stabilo-point-88'), paper('bristol-smooth'), info('bristol-smooth'));
    const lo = V.PenModel.resolveTraits(mp('stabilo-point-88', { ink: { overlap: 0.1 } }), paper('bristol-smooth'), info('bristol-smooth'));
    expect(base.overlapDarkening).toBeCloseTo(0.6);
    expect(lo.overlapDarkening).toBeCloseTo(0.1);
  });
  it('coverOnDark changes alpha on dark stock; starvation changes starveStrength', () => {
    const dark = { ...paper('bristol-smooth'), color: '#111111' };
    const a = V.PenModel.resolveTraits(mp('sakura-gelly-roll-classic'), dark, info('bristol-smooth'));
    const b = V.PenModel.resolveTraits(mp('sakura-gelly-roll-classic', { ink: { coverOnDark: 0.4 } }), dark, info('bristol-smooth'));
    expect(b.alpha).toBeLessThan(a.alpha);
    const s = V.PenModel.resolveTraits(mp('sakura-gelly-roll-classic', { ink: { starvation: 0.6 } }), paper('bristol-smooth'), info('bristol-smooth'));
    expect(s.starveStrength).toBeCloseTo(0.6);
  });
  it('starvation falls back to studioStarveLenMm when the model has no length', () => {
    const t = V.PenModel.resolveTraits(mp('sakura-pigma-micron', { ink: { starvation: 0.5 } }), paper('bristol-smooth'), info('bristol-smooth'));
    expect(t.starveStrength).toBeCloseTo(0.5);
    expect(t.starveLenMm).toBe(V.PEN_MODELS.LIMITS.studioStarveLenMm);
    const none = V.PenModel.resolveTraits(mp('sakura-pigma-micron'), paper('bristol-smooth'), info('bristol-smooth'));
    expect(none.starveStrength).toBe(0);
  });
});
