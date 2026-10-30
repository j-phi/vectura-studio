/**
 * Start Page plate type math (src/core/start-page/plate-type.js): pure word / crop / color helpers.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ctx = { Vectura: {}, console };
ctx.window = ctx; ctx.globalThis = ctx;
let T; let R;
beforeAll(() => {
  vm.createContext(ctx);
  for (const rel of ['src/core/start-page/plate-rhythm.js', 'src/core/start-page/plate-type.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  }
  T = ctx.Vectura.StartPagePlateType;
  R = ctx.Vectura.StartPagePlateRhythm;
});

const METRICS = { width: 300, actualBoundingBoxLeft: 2, actualBoundingBoxRight: 296, actualBoundingBoxAscent: 74, actualBoundingBoxDescent: 22 };

describe('plate type: layouts table', () => {
  it('lists exactly the rhythm engine layout ids, in order', () => {
    expect(T.LAYOUTS.map((l) => l.id)).toEqual(Array.from(R.LAYOUTS));
    expect(T.LAYOUTS).toHaveLength(16);
  });
  it('every layout has a display name', () => { T.LAYOUTS.forEach((l) => expect(l.name.length).toBeGreaterThan(2)); });
});

describe('plate type: word ink box', () => {
  it('covers the whole ink including the descender and left overshoot', () => {
    const b = T.wordBox(METRICS, { pad: 4 });
    expect(b.height).toBeGreaterThanOrEqual(74 + 22 + 8);
    expect(b.y).toBe(74 + 4);
    expect(b.x).toBe(2 + 4);
    expect(b.width).toBeGreaterThanOrEqual(2 + 296 + 8);
    expect(b.y + 22).toBeLessThanOrEqual(b.height); // baseline + descent is inside the box
  });
  it('a word with a descender is taller than one without, on the same ascent', () => {
    const flat = T.wordBox({ ...METRICS, actualBoundingBoxDescent: 0 }, {});
    const desc = T.wordBox(METRICS, {});
    expect(desc.height - flat.height).toBeCloseTo(22, 5);
  });
  it('falls back to estimated metrics when the canvas cannot measure', () => {
    const m = T.estimateMetrics('Flowgrey');
    expect(m.width).toBeGreaterThan(200);
    expect(m.actualBoundingBoxDescent).toBeGreaterThan(0); // g and y
    expect(T.estimateMetrics('Rings').actualBoundingBoxDescent).toBe(22); // g
    expect(T.estimateMetrics('Mono').actualBoundingBoxDescent).toBe(0);
  });
  it('fitBox never exceeds the box on either axis', () => {
    const b = T.wordBox(METRICS, {});
    for (const [mw, mh] of [[1000, 100], [200, 400], [90, 90], [1400, 1400]]) {
      const f = T.fitBox(b, mw, mh);
      expect(f.width).toBeLessThanOrEqual(mw + 0.01);
      expect(f.height).toBeLessThanOrEqual(mh + 0.01);
    }
  });
  it('vertical box swaps the axes and rotates with the baseline on the correct side', () => {
    const b = T.wordBox(METRICS, {});
    const up = T.verticalBox(b, false); const down = T.verticalBox(b, true);
    expect(up.width).toBeCloseTo(b.height, 5); expect(up.height).toBeCloseTo(b.width, 5);
    expect(up.transform).toMatch(/rotate\(-90\)/); expect(down.transform).toMatch(/rotate\(90\)/);
  });
});

describe('plate type: crops', () => {
  it('cropStyle keeps the zoomed layer covering its window', () => {
    for (const [z, x, y] of [[2.6, 0.46, 0.46], [2.4, 0.28, 0.3], [2.4, 0.7, 0.7], [2.6, 0, 1], [1, 0.5, 0.5]]) {
      const c = T.cropStyle(z, x, y);
      expect(c.left).toBeLessThanOrEqual(0.0001); expect(c.top).toBeLessThanOrEqual(0.0001);
      expect(c.left + c.width).toBeGreaterThanOrEqual(100 - 0.0001);
      expect(c.top + c.height).toBeGreaterThanOrEqual(100 - 0.0001);
    }
  });
  it('frameFor is shape aware: only the circle zooms in a little', () => {
    expect(T.frameFor('circle').z).toBeGreaterThan(1);
    ['rect', 'square', 'portrait', 'band'].forEach((s) => expect(T.frameFor(s).z).toBe(1));
    expect(T.frameFor('square', { z: 2, cx: 0.3, cy: 0.4 })).toMatchObject({ z: 2, cx: 0.3, cy: 0.4 });
  });
  it('aspect ratios per orientation', () => {
    expect(T.aspectOf('portrait')).toBe('3/4'); expect(T.aspectOf('square')).toBe('1/1');
    expect(T.aspectOf('landscape')).toBe('4/3'); expect(T.aspectOf('3d')).toBe('1/1'); expect(T.aspectOf('nonsense')).toBe('4/3');
  });
});

describe('plate type: plate colors', () => {
  const light = { ground: '#f6eac7', ink: '#9a3412', accent: '#0c4a6e', class: 'light' };
  const dark = { ground: '#1c1c1e', ink: '#f8f8f4', accent: '#b6bac0', class: 'dark' };
  const sat = { ground: '#f59e0b', ink: '#1b1b1d', accent: '#9a3412', class: 'ground' };
  it('text, accent and muted clear 4.5:1 on every ground, the art ink clears 3:1', () => {
    for (const cw of [light, dark, sat, { ground: '#e4dfd0', ink: '#a8a8a0', accent: '#a8a8a0', class: 'light' }]) {
      const v = T.plateVars(cw);
      expect(T.contrast(v['--spl-text'], cw.ground)).toBeGreaterThanOrEqual(4.5);
      expect(T.contrast(v['--spl-acc'], cw.ground)).toBeGreaterThanOrEqual(4.5);
      expect(T.contrast(v['--spl-mute'], cw.ground)).toBeGreaterThanOrEqual(4.5);
      expect(T.contrast(v['--spl-art'], cw.ground)).toBeGreaterThanOrEqual(3);
      expect(T.contrast(v['--spl-inv'], v['--spl-ink'])).toBeGreaterThanOrEqual(4.5); // type on a pen-colour band
    }
  });
  it('accepts an Ink-style colorway (paper) and a mono textInk', () => {
    const v = T.plateVars({ paper: '#ffffff', ink: '#0a1320', textInk: '#0a1320', mode: 'mono', class: 'light' });
    expect(v['--spl-paper']).toBe('#ffffff');
  });
  it('the disc sits slightly lighter than a dark ground and never as a ring', () => {
    const v = T.plateVars(dark);
    expect(T.contrast(v['--spl-disc'], dark.ground)).toBeLessThan(1.5);
    expect(v['--spl-disc']).not.toBe(dark.ground);
  });
});

describe('plate type: copy helpers', () => {
  it('firstSentence / pad2 / normSpecs', () => {
    expect(T.firstSentence('Drift and checks. Second one.')).toBe('Drift and checks.');
    expect(T.firstSentence('No terminator')).toBe('No terminator');
    expect(T.pad2(5)).toBe('05');
    expect(T.normSpecs([['Paper', 'A3'], { label: 'Pen', value: 'Sienna' }, 'bad'])).toEqual([{ label: 'Paper', value: 'A3' }, { label: 'Pen', value: 'Sienna' }]);
  });
  it('waterfall and stage tables', () => {
    expect(T.WATERFALL).toHaveLength(5); expect(T.WATERFALL[0].scale).toBe(1);
    expect(T.STAGES).toEqual([0.25, 0.5, 0.75]);
    expect(T.CROPS_4).toHaveLength(4);
  });
});

describe('plate type: manual colors are shown exactly', () => {
  const cw = { ground: '#f4efe4', ink: '#f2ecdc', textInk: '#ece6d6', accent: '#f2ecdc' };
  it('auto colors are nudged to the contrast floor; exactInk / exactText show the pick as chosen', () => {
    const auto = T.plateVars(cw);
    expect(auto['--spl-art']).not.toBe('#f2ecdc');
    expect(auto['--spl-text']).not.toBe('#ece6d6');
    const exact = T.plateVars({ ...cw, exactInk: true, exactText: true });
    expect(exact['--spl-art']).toBe('#f2ecdc');
    expect(exact['--spl-text']).toBe('#ece6d6');
  });
});
