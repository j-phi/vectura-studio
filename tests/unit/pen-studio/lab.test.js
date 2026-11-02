/** Pen Studio unit C — PenStudioLab (metrics, fit, test strips, weave). */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const load = () => {
  const win = {};
  win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  ['src/config/papers.js', 'src/core/paper.js', 'src/config/pen-models.js', 'src/core/pen-model.js',
    'src/core/pen-studio/lab.js', 'src/core/pen-studio/complement.js'].forEach((rel) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  });
  return win.Vectura;
};

describe('PenStudioLab', () => {
  let V; let Lab;
  beforeAll(() => { V = load(); Lab = V.PenStudioLab; });
  const micron = (color = '#1b1b1d', size = '05') => V.PenModel.applyModel({ id: 'm', color, width: 0.3 }, 'sakura-pigma-micron', size);
  const gelly = (color = '#ffffff') => V.PenModel.applyModel({ id: 'g', color, width: 0.3 }, 'sakura-gelly-roll-classic');

  it('papers(): the 10 papers (no None) with colour + dark flag', () => {
    const ps = Lab.papers();
    expect(ps).toHaveLength(10);
    expect(ps.map((p) => p.type)).not.toContain('none');
    expect(ps.find((p) => p.type === 'black').dark).toBe(true);
    expect(ps.find((p) => p.type === 'bristol-smooth').dark).toBe(false);
    expect(Lab.paperFor('newsprint').type).toBe('newsprint');
  });

  it('metrics: laid width equals resolveTraits.laidW and grows newsprint vs bristol', () => {
    const pen = micron();
    ['bristol-smooth', 'newsprint', 'cotton-rag'].forEach((t) => {
      const tr = V.PenModel.resolveTraits(pen, Lab.paperFor(t), V.PAPERS.TYPES[t]);
      expect(Lab.metrics(pen, t).laidMm).toBe(tr.laidW);
    });
    expect(Lab.metrics(pen, 'newsprint').laidMm).toBeGreaterThan(Lab.metrics(pen, 'bristol-smooth').laidMm);
    expect(Lab.metrics(pen, 'newsprint').bleedMmPerSide).toBeGreaterThan(Lab.metrics(pen, 'bristol-smooth').bleedMmPerSide);
  });

  it('metrics: nib, overlap, opaque, skip, starve', () => {
    const m = Lab.metrics(micron(), 'bristol-smooth');
    expect(m.nibMm).toBeCloseTo(0.45, 5);
    expect(m.opaque).toBe(false);
    expect(m.overlapPct).toBeGreaterThan(0);
    expect(Lab.metrics(gelly(), 'bristol-smooth').opaque).toBe(true);
    expect(Lab.metrics({ ...micron(), nibMm: 0.9 }, 'bristol-smooth').nibMm).toBe(0.9);
    const tuned = { ...micron(), ink: { overlap: 0.8, starvation: 0.5, skips: 0.1 } };
    const mt = Lab.metrics(tuned, 'bristol-smooth');
    expect(mt.overlapPct).toBe(80);
    expect(mt.starvePct).toBe(50);
    expect(mt.skipPct).toBeCloseTo(10, 5);
  });

  it('fit: crisp / reads / barely, and barely on black stock when cover < .3', () => {
    expect(Lab.fit('#000000', 'bristol-smooth', micron()).note).toBe('crisp');
    expect(Lab.fit('#7a7f86', 'bristol-smooth', micron()).note).toBe('reads');
    const faintOnWhite = Lab.fit('#f4f4ee', 'bristol-smooth', micron());
    expect(faintOnWhite).toMatchObject({ note: 'barely', faint: true });
    expect(faintOnWhite.ratio).toBeLessThan(1.6);
    // white Micron on black stock: contrast is huge but the ink does not cover
    expect(Lab.fit('#ffffff', 'black', micron('#ffffff')).note).toBe('barely');
    expect(Lab.fit('#ffffff', 'black', gelly()).note).toBe('crisp');
    expect(Lab.fit('#ffffff', 'black', { id: 'p', color: '#ffffff', width: 0.3 }).faint).toBe(false);
    expect(Lab.fit('#ffffff', 'black', { ...micron('#ffffff'), ink: { coverOnDark: 0.9 } }).faint).toBe(false);
  });

  it('testSpec: every kind returns boxMm, strokes and values', () => {
    const pen = micron();
    const comp = micron('#c0262d');
    ['line', 'bleed', 'blob', 'cross', 'skip', 'starv'].forEach((k) => {
      const s = Lab.testSpec(k, { pen, comp, paperType: 'bristol-smooth' });
      expect(s.kind).toBe(k);
      expect(s.boxMm).toEqual({ w: 25, h: 2.4 });
      expect(s.strokes.length).toBeGreaterThan(0);
      s.strokes.forEach((st) => { expect(st.pts.length).toBeGreaterThan(1); expect(st.pen).toBeTruthy(); });
      s.strokes.forEach((st) => st.pts.forEach((p) => { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(25); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(2.4); }));
    });
    const line = Lab.testSpec('line', { pen, paperType: 'bristol-smooth' });
    expect(line.values).toEqual({ nib: '0.45', laid: Lab.metrics(pen, 'bristol-smooth').laidMm.toFixed(2) });
    expect(Lab.testSpec('line', { pen, paperType: 'bristol-smooth', mini: true }).boxMm).toEqual({ w: 14, h: 3 });
  });

  it('testSpec cross alternates pen / complement; dye vs opaque', () => {
    const pen = micron(); const comp = micron('#c0262d');
    const s = Lab.testSpec('cross', { pen, comp, paperType: 'bristol-smooth' });
    expect(s.strokes).toHaveLength(16);
    s.strokes.forEach((st, i) => expect(st.pen).toBe(i % 2 ? comp : pen));
    expect(s.values.dye).toBe(true);
    expect(Lab.testSpec('cross', { pen: gelly(), comp, paperType: 'bristol-smooth' }).values).toMatchObject({ dye: false, mode: 'opaque' });
    expect(Lab.testSpec('cross', { pen, comp, paperType: 'bristol-smooth', mini: true }).strokes).toHaveLength(8);
  });

  it('testSpec starv is a compressed preview-only fade and leaves the pen untouched', () => {
    const pen = { ...micron(), ink: { starvation: 0.6 } };
    const before = JSON.stringify(pen);
    const s = Lab.testSpec('starv', { pen, paperType: 'bristol-smooth' });
    expect(s.compressed).toBe(true);
    expect(s.values.pct).toBe(60);
    expect(s.strokes.length).toBe(12);
    expect(s.strokes[11].pen.width).toBeLessThan(s.strokes[0].pen.width);
    expect(s.strokes[11].pen.ink.opacity).toBeLessThan(s.strokes[0].pen.ink.opacity);
    expect(JSON.stringify(pen)).toBe(before);
    const none = Lab.testSpec('starv', { pen: micron(), paperType: 'bristol-smooth' });
    expect(none.strokes).toHaveLength(1);
    expect(none.values.pct).toBe(0);
  });

  it('weave: mode indices and count clamp', () => {
    const idx = (n, mode) => Lab.weave(n, mode, { w: 100, h: 60 }).map((l, i) => (l.comp ? i : -1)).filter((i) => i >= 0);
    expect(idx(5, 'alt')).toEqual([1, 3]);
    expect(idx(6, 'alt')).toEqual([1, 3, 5]);
    expect(idx(7, 'third')).toEqual([2, 5]);
    expect(idx(5, 'mid')).toEqual([2]);
    expect(idx(4, 'mid')).toEqual([2]);
    expect(Lab.weave(5, 'alt', { w: 100, h: 60 })).toHaveLength(5);
    expect(Lab.weave(1, 'alt', { w: 100, h: 60 })).toHaveLength(3);
    expect(Lab.weave(12, 'alt', { w: 100, h: 60 })).toHaveLength(7);
    const ls = Lab.weave(5, 'alt', { w: 100, h: 60 });
    ls.forEach((l) => l.pts.forEach((p) => { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(100); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(60); }));
  });
});
