/** Pen Studio unit C — PenStudioComplement (candidate selection + colour maths). */
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

describe('PenStudioComplement', () => {
  let V; let C;
  beforeAll(() => { V = load(); C = V.PenStudioComplement; });

  const sp = (id, name, color, model) => ({ id, name, color, model: model || null });
  const penOf = (color, model, size) => (model ? V.PenModel.applyModel({ id: 'main', color, width: 0.3 }, model, size) : { id: 'main', color, width: 0.3 });

  it('contrast: black on white is 21, symmetric', () => {
    expect(C.contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(C.contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('hsl/hex round-trip', () => {
    const [h, s, l] = C.hsl('#3a7bd5');
    expect(C.hex(h, s, l)).toBe('#3a7bd5');
  });

  it('readable pushes a pale hue to >= 2.6:1 on light and on dark paper', () => {
    ['#fbfbf7', '#1c1c1e'].forEach((paper) => {
      for (let h = 0; h < 360; h += 40) {
        const hx = C.readable(h, 0.6, 0.5, paper);
        expect(C.contrast(hx, paper), `h${h} on ${paper}`).toBeGreaterThanOrEqual(2.6);
      }
    });
  });

  it('candidates: curated first, then the 3 hues, then box mates', () => {
    const pen = penOf('#1f3a8a');
    const box = [sp('a', 'Brick', '#b04020'), sp('b', 'Olive', '#6a7a20')];
    const c = C.candidates({ pen, penId: 'main', paperType: 'bristol-smooth', boxPens: box, curated: { hex: '#9d174d', name: 'Wine Rose' } });
    expect(c.map((x) => x.id)).toEqual(['cur', 'c180', 'c150', 'c210', 'p:a', 'p:b']);
    expect(c.map((x) => x.kind)).toEqual(['curated', 'hue', 'hue', 'hue', 'box', 'box']);
    expect(c[0]).toMatchObject({ name: 'Wine Rose', real: false });
    expect(c[4]).toMatchObject({ real: true, penId: 'a' });
    c.filter((x) => x.kind === 'hue').forEach((x) => expect(C.contrast(x.hex, C.hex(...C.hsl('#fbfbf7')))).toBeGreaterThanOrEqual(2.6));
  });

  it('curated {model,color} resolves to a real catalogue pen', () => {
    const c = C.candidates({ pen: penOf('#ffffff'), paperType: 'bristol-smooth', boxPens: [], curated: { model: 'sakura-pigma-micron', color: 'Burgundy' } });
    expect(c[0]).toMatchObject({ id: 'cur', hex: '#6b1f2e', real: true, model: 'sakura-pigma-micron' });
  });

  it('box mates are capped at 3 (only ones that fit count)', () => {
    const mates = ['#aa3322', '#22aa33', '#2233aa', '#aa22aa', '#aaaa22'].map((h, i) => sp('m' + i, 'Mate ' + i, h));
    const c = C.candidates({ pen: penOf('#111111'), penId: 'main', paperType: 'bristol-smooth', boxPens: mates });
    expect(c.filter((x) => x.kind === 'box')).toHaveLength(3);
    // a mate that fails contrast does not consume a slot
    const mixed = [sp('x', 'Paper twin', '#f4f4ee'), ...mates];
    const c2 = C.candidates({ pen: penOf('#111111'), penId: 'main', paperType: 'bristol-smooth', boxPens: mixed });
    expect(c2.filter((x) => x.kind === 'box').map((x) => x.penId)).toEqual(['m0', 'm1', 'm2']);
  });

  it('the pen itself is never a box mate', () => {
    const c = C.candidates({ pen: penOf('#111111'), penId: 'self', paperType: 'bristol-smooth', boxPens: [sp('self', 'Me', '#aa3322')] });
    expect(c.filter((x) => x.kind === 'box')).toHaveLength(0);
  });

  it('rejects candidates too close to the main ink (< 1.25:1)', () => {
    const pen = penOf('#aa3322');
    const c = C.candidates({ pen, paperType: 'bristol-smooth', boxPens: [sp('t', 'Twin', '#ab3423')] });
    expect(c.find((x) => x.id === 'p:t')).toBeUndefined();
  });

  it('dark paper hides low-cover real pens, keeps high-cover ones; hidden() names them', () => {
    const micron = sp('mi', 'Micron red', '#c0262d', 'sakura-pigma-micron');
    const gelly = sp('ge', 'Gelly pink', '#ff7aa8', 'sakura-gelly-roll-classic');
    const pen = penOf('#ffffff');
    const opts = { pen, penId: 'main', paperType: 'black', boxPens: [micron, gelly] };
    const ids = C.candidates(opts).map((x) => x.id);
    expect(ids).not.toContain('p:mi');
    expect(ids).toContain('p:ge');
    expect(C.hidden(C.allCandidates(opts), pen, 'black')).toEqual(['Micron red']);
    // ...but on light paper the Micron is fine
    expect(C.candidates({ ...opts, paperType: 'bristol-smooth', pen: penOf('#111111') }).map((x) => x.id)).toContain('p:mi');
  });

  it('a user coverOnDark override on a box pen is honoured', () => {
    const micron = { ...sp('mi', 'Micron red', '#c0262d', 'sakura-pigma-micron'), ink: { coverOnDark: 0.9 } };
    const ids = C.candidates({ pen: penOf('#ffffff'), paperType: 'black', boxPens: [micron] }).map((x) => x.id);
    expect(ids).toContain('p:mi');
  });

  it('nearestOwned only considers pens that fit the paper', () => {
    const near = sp('near', 'Dark navy', '#101830', 'sakura-pigma-micron'); // closest to target but invisible on black
    const far = sp('far', 'Light blue', '#8fb8ff', 'sakura-gelly-roll-classic');
    const target = '#14213d';
    const pen = penOf('#ffffff');
    expect(C.nearestOwned(target, [near, far], pen, 'black').id).toBe('far');
    expect(C.nearestOwned(target, [near, far], pen, 'bristol-smooth').id).toBe('near');
    expect(C.nearestOwned(target, [], pen, 'black')).toBeNull();
    expect(C.nearestOwned(target, [{ ...far, id: 'main' }], pen, 'black')).toBeNull();
  });

  it('randomize: seeded, picks a pool chip or a readable Wildcard', () => {
    const cands = C.candidates({ pen: penOf('#1f3a8a'), paperType: 'bristol-smooth', boxPens: [] });
    const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
    const pooled = C.randomize(cands, 'c180', 'bristol-smooth', seq([0.1, 0.0]));
    expect(pooled.id).toBe(cands.filter((c) => c.id !== 'c180')[0].id);
    const wild = C.randomize(cands, 'c180', 'bristol-smooth', seq([0.9, 0.25, 0.5, 0.7]));
    expect(wild).toMatchObject({ name: 'Wildcard', kind: 'random', real: false });
    expect(C.contrast(wild.hex, '#fbfbf7')).toBeGreaterThanOrEqual(2.6);
    expect(C.randomize([], null, 'bristol-smooth', seq([0.1, 0.5, 0.5, 0.5])).kind).toBe('random');
  });
});
