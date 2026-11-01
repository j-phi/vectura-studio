/**
 * Start Page plate palette (src/config/start-page-plate-palette.js) and rhythm (src/core/start-page/plate-rhythm.js)
 * against the REAL papers / pens / palettes.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILES = [
  'src/config/palettes.js', 'src/config/papers.js', 'src/config/pen-models.js', 'src/config/defaults.js',
  'src/config/start-page-colorways.js', 'src/core/start-page/colorway.js',
  'src/config/start-page-plate-palette.js', 'src/core/start-page/plate-rhythm.js',
];
const MODES = ['curated', 'random', 'wildcard', 'basic', 'mono'];
const THEMES = ['dark', 'light'];
const SEEDS = ['K7PQ2', '3AB9X', 'ZZ234', 'A2B3C', 'M5N6P'];
const plates = (n, pins = {}) => Array.from({ length: n }, (_, i) => (pins[i] ? { id: `p${i}`, pin: pins[i] } : { id: `p${i}` }));

let dom; let V; let R; let C; let PAL;
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  const ctx = dom.getInternalVMContext();
  for (const rel of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  V = dom.window.Vectura;
  R = V.StartPagePlateRhythm;
  C = V.StartPageColorway;
  PAL = V.START_PAGE_PLATE_PALETTE;
});
afterAll(() => dom?.window?.close());

const lowerHex = (h) => h.toLowerCase();
const penTable = () => new Map([...V.START_PAGE_COLORWAYS.PENS, ...V.START_PAGE_PLATE_PENS].map((p) => [p.id, p]));
const mixHex = (a, b, t) => {
  const x = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return '#' + x(a).map((v, i) => Math.round(v + (x(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const placedCw = (res) => res.map((r) => r.colorway);

describe('plate palette', () => {
  it('has 32 rhythm entries (12 light, 10 ground, 10 dark) plus 3 pin-only, unique ids', () => {
    const auto = PAL.filter((e) => !e.pinOnly);
    expect(auto.length).toBe(32);
    const n = (c) => auto.filter((e) => e.class === c).length;
    expect([n('light'), n('ground'), n('dark')]).toEqual([12, 10, 10]);
    expect(PAL.filter((e) => e.pinOnly).map((e) => e.id)).toEqual(['kraft-sepia', 'sky-prussian', 'ochre-umber']);
    expect(new Set(PAL.map((e) => e.id)).size).toBe(35);
  });
  it('pin-only colorways are reachable by pin and never placed by the rhythm', () => {
    const pins = ['kraft-sepia', 'sky-prussian', 'ochre-umber'];
    const res = R.place(plates(3, { 0: pins[0], 1: pins[1], 2: pins[2] }), { mode: 'curated' });
    expect(res.map((r) => r.colorway.id)).toEqual(pins);
    for (const mode of ['curated', 'random', 'wildcard']) {
      for (const seed of ['A', 'B', 'C', 'D']) {
        const ids = R.place(plates(40), { mode, seed }).map((r) => r.colorway.id);
        pins.forEach((p) => expect(ids, `${mode}/${seed}`).not.toContain(p));
      }
    }
  });
  it('every entry has the contract fields', () => {
    for (const e of PAL) {
      for (const k of ['id', 'name', 'class', 'ground', 'ink', 'accent', 'paperType', 'penId', 'paperName', 'penName']) expect(e[k], `${e.id}.${k}`).toBeTruthy();
      expect(['light', 'ground', 'dark']).toContain(e.class);
    }
  });
  it('contrast minimums: text >= 4.5, art >= 3, accent >= 3 (all entries)', () => {
    for (const e of PAL) {
      expect(C.contrast(e.ink, e.ground), `${e.id} text`).toBeGreaterThanOrEqual(4.5);
      expect(C.contrast(e.ink, e.ground), `${e.id} art`).toBeGreaterThanOrEqual(3);
      expect(C.contrast(e.accent, e.ground), `${e.id} accent`).toBeGreaterThanOrEqual(3);
    }
  });
  it('class matches the ground: darks are dark, lights are light', () => {
    const lum = (h) => C.contrast(h, '#000000');
    for (const e of PAL) {
      if (e.class === 'dark') expect(lum(e.ground), e.id).toBeLessThan(4);
      if (e.class === 'light') expect(lum(e.ground), e.id).toBeGreaterThan(7);
    }
  });
  it('every entry references a real paper type and real pens with the exact hex', () => {
    const pens = penTable();
    for (const e of PAL) {
      const T = V.PAPERS.TYPES[e.paperType];
      expect(T, `${e.id} paper ${e.paperType}`).toBeTruthy();
      expect(e.paperType).not.toBe('none');
      for (const [penId, hex] of [[e.penId, e.ink], [e.accentPenId, e.accent]]) {
        const p = pens.get(penId);
        expect(p, `${e.id} pen ${penId}`).toBeTruthy();
        expect(lowerHex(p.hex), `${e.id} ${penId} hex`).toBe(lowerHex(hex));
      }
    }
  });
  it('plate-only pens are real model colours', () => {
    for (const p of V.START_PAGE_PLATE_PENS) {
      const m = V.PEN_MODELS.MODELS[p.model];
      expect(m, p.id).toBeTruthy();
      const col = m.colours.find((x) => x.name === p.colour);
      expect(col, `${p.id}: ${p.colour}`).toBeTruthy();
      expect(lowerHex(col.hex)).toBe(lowerHex(p.hex));
    }
  });
  it('grounds trace to the stock, a tint of it, a palette color, or a custom color on black stock', () => {
    for (const e of PAL) {
      const base = V.PAPERS.TYPES[e.paperType].color;
      const g = e.groundFrom;
      if (g === 'stock') expect(lowerHex(e.ground), e.id).toBe(lowerHex(base));
      else if (g === 'custom') expect(e.paperType, e.id).toBe('black');
      else if (g.tint) {
        const pal = V.PALETTES.find((p) => p.id === g.tint.palette);
        expect(pal, e.id).toBeTruthy();
        expect(lowerHex(e.ground), e.id).toBe(mixHex(base, pal.colors[g.tint.index], g.tint.amount));
      } else {
        const pal = V.PALETTES.find((p) => p.id === g.palette);
        expect(pal, e.id).toBeTruthy();
        expect(lowerHex(e.ground), e.id).toBe(lowerHex(pal.colors[g.index]));
      }
    }
  });
});

describe('place: rules', () => {
  const rulesHold = (res, pinsAt = new Set()) => {
    const cws = placedCw(res);
    for (let i = 1; i < cws.length; i++) {
      if (pinsAt.has(i) && pinsAt.has(i - 1)) continue; // two pins side by side are the user's call
      const a = cws[i - 1]; const b = cws[i];
      expect(a.class === 'dark' && b.class === 'dark', `darks adjacent at ${i}: ${a.id} ${b.id}`).toBe(false);
      expect(a.id !== b.id, `same id at ${i}`).toBe(true);
      expect(a.fam !== b.fam, `same family at ${i}: ${a.id} ${b.id}`).toBe(true);
      expect(C.near({ key: a.id, paper: a.ground, ink: a.ink, ink2: null }, { key: b.id, paper: b.ground, ink: b.ink, ink2: null }), `near at ${i}: ${a.id} ${b.id}`).toBe(false);
    }
  };
  for (const mode of ['curated', 'random', 'wildcard']) {
    it(`${mode}: no adjacent darks, families or near-identical neighbors (seeds x 40 plates, both themes)`, () => {
      for (const seed of SEEDS) for (const theme of THEMES) {
        for (const n of [1, 2, 7, 40]) rulesHold(R.place(plates(n), { mode, seed, theme }));
      }
    });
    it(`${mode}: rules hold around pins`, () => {
      const pinSets = [
        { 1: 'black-white', 3: 'black-silver' },
        { 0: 'black-gold', 5: 'buff-sienna', 6: 'cobalt-butter', 12: 'black-white' },
        { 2: 'charcoal-white', 4: 'graphite-white', 8: 'bristol-indigo', 20: 'oxblood-coral', 21: 'plum-lime' },
      ];
      for (const seed of SEEDS) for (const pins of pinSets) {
        const res = R.place(plates(40, pins), { mode, seed, theme: 'dark' });
        const at = new Set(Object.keys(pins).map(Number));
        // pins only act in curated; in other modes no plate is pinned, so the full rules apply
        rulesHold(res, mode === 'curated' ? at : new Set());
        if (mode === 'curated') {
          for (const i of at) expect(res[i].colorway.id).toBe(pins[i]);
        }
      }
    });
  }
  it('wildcard uses saturated grounds with darks interspersed, never light papers', () => {
    const res = R.place(plates(30), { mode: 'wildcard', seed: 'K7PQ2' });
    const classes = placedCw(res).map((c) => c.class);
    expect(classes.every((c) => c === 'ground' || c === 'dark')).toBe(true);
    expect(classes.filter((c) => c === 'dark').length).toBeGreaterThanOrEqual(5);
    expect(classes.filter((c) => c === 'ground').length).toBeGreaterThanOrEqual(10);
  });
  it('curated follows the L C L D C L D L C D cycle when nothing forces a bend', () => {
    const res = R.place(plates(10), { mode: 'curated', seed: 'K7PQ2' });
    expect(placedCw(res).map((c) => c.class[0].toUpperCase().replace('G', 'C'))).toEqual('LCLDCLDLCD'.split(''));
  });
  it('pins win even when they break the rhythm, and the neighbors bend around them', () => {
    const res = R.place(plates(10, { 4: 'black-white' }), { mode: 'curated', seed: 'K7PQ2' });
    expect(res[4].colorway.id).toBe('black-white');
    expect(res[4].reason).toMatch(/pin/i);
    expect(res[3].colorway.class).not.toBe('dark');
    expect(res[5].colorway.class).not.toBe('dark');
  });
  it('ignores an unknown pin id and pins outside curated', () => {
    const a = R.place(plates(6, { 2: 'no-such-colorway' }), { mode: 'curated' });
    const b = R.place(plates(6), { mode: 'curated' });
    expect(a.map((r) => r.colorway.id)).toEqual(b.map((r) => r.colorway.id));
    const w = R.place(plates(6, { 2: 'black-white' }), { mode: 'wildcard', seed: 'K7PQ2' });
    const w0 = R.place(plates(6), { mode: 'wildcard', seed: 'K7PQ2' });
    expect(w.map((r) => r.colorway.id)).toEqual(w0.map((r) => r.colorway.id));
  });
  it('random reshuffles per seed (not all seeds give the same order)', () => {
    const orders = SEEDS.map((s) => R.place(plates(12), { mode: 'random', seed: s }).map((r) => r.colorway.id).join());
    expect(new Set(orders).size).toBeGreaterThan(1);
    expect(new Set(orders).has(R.place(plates(12), { mode: 'curated' }).map((r) => r.colorway.id).join())).toBe(false);
  });
  it('is deterministic for ids, mode, seed, theme and pins', () => {
    for (const mode of MODES) {
      const args = [plates(25, { 3: 'black-gold' }), { mode, seed: 'K7PQ2', theme: 'light' }];
      expect(R.place(...args)).toEqual(R.place(...args));
    }
  });
  it('every placement carries id, a colorway and a reason', () => {
    for (const mode of MODES) {
      const res = R.place(plates(8), { mode, seed: 'K7PQ2', theme: 'dark' });
      expect(res.map((r) => r.id)).toEqual(plates(8).map((p) => p.id));
      res.forEach((r) => { expect(r.colorway.ground).toMatch(/^#/); expect(r.colorway.ink).toMatch(/^#/); expect(typeof r.reason).toBe('string'); });
    }
  });
  it('empty and junk input place nothing', () => {
    expect(R.place([], { mode: 'curated' })).toEqual([]);
    expect(R.place(null, { mode: 'basic' })).toEqual([]);
  });
});

describe('place: plain-sheet modes', () => {
  it('mono: every plate is theme ink on theme paper, uniform by design', () => {
    for (const theme of THEMES) {
      const cws = placedCw(R.place(plates(15, { 2: 'black-white' }), { mode: 'mono', theme }));
      expect(new Set(cws.map((c) => c.ground + c.ink)).size).toBe(1);
      expect(cws[0].ground).toBe(V.START_PAGE_COLORWAYS.MONO[theme].paper);
      expect(C.contrast(cws[0].ink, cws[0].ground)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('basic: theme paper, pen-box inks, neighbors differ, text readable', () => {
    for (const theme of THEMES) {
      const cws = placedCw(R.place(plates(40), { mode: 'basic', theme }));
      const paper = theme === 'dark' ? '#161618' : '#fbfaf6';
      cws.forEach((c, i) => {
        expect(c.ground).toBe(paper);
        expect(C.contrast(c.ink, c.ground), `${theme} ${i}`).toBeGreaterThanOrEqual(3);
        if (i) expect(c.ink, `${theme} ${i}`).not.toBe(cws[i - 1].ink);
      });
      expect(new Set(cws.map((c) => c.ink)).size).toBeGreaterThan(5);
    }
  });
});

describe('advise', () => {
  const placedOf = (ids) => ids.map((id, i) => ({ id: `p${i}`, colorway: PAL.find((e) => e.id === id) }));
  it('flags a manufactured two-darks case on both plates', () => {
    const p = placedOf(['buff-sienna', 'black-white', 'black-gold', 'cobalt-butter']);
    for (const i of [1, 2]) {
      const a = R.advise(p, i);
      const hit = a.find((x) => x.code === 'two-darks');
      expect(hit, `plate ${i}`).toBeTruthy();
      expect(hit.message).toMatch(/Two dark plates in a row/);
      expect(hit.fix).toEqual({ useRhythmColor: true });
    }
    expect(R.advise(p, 0)).toEqual([]);
  });
  it('flags near-identical neighbors (same family)', () => {
    const p = placedOf(['bristol-indigo', 'tracing-navy']);
    expect(R.advise(p, 1).map((x) => x.code)).toContain('near-neighbor');
  });
  it('flags low contrast on a custom colorway', () => {
    const cw = { id: 'custom', fam: 'custom', class: 'light', ground: '#f0f0f0', ink: '#d0d0d0', accent: '#d0d0d0' };
    const a = R.advise([{ id: 'x', colorway: cw }], 0);
    expect(a.map((x) => x.code)).toContain('low-contrast');
  });
  it('says nothing on a clean placement, and nothing for basic or mono', () => {
    for (const mode of ['curated', 'random', 'wildcard']) {
      const res = R.place(plates(30), { mode, seed: 'K7PQ2' });
      res.forEach((_, i) => expect(R.advise(res, i), `${mode} ${i}`).toEqual([]));
    }
    for (const mode of ['basic', 'mono']) {
      const res = R.place(plates(10), { mode, theme: 'dark' });
      res.forEach((_, i) => expect(R.advise(res, i).map((x) => x.code)).not.toContain('two-darks'));
    }
    expect(R.advise([], 3)).toEqual([]);
  });
});

describe('suggestLayouts', () => {
  it('returns only known layout ids, unique, for every class and orientation', () => {
    expect(R.LAYOUTS.length).toBe(16);
    expect(new Set(R.LAYOUTS).size).toBe(16);
    for (const cls of ['light', 'ground', 'dark']) for (const o of ['landscape', 'portrait', 'square', '3d']) {
      const s = R.suggestLayouts(cls, o);
      expect(s.length).toBeGreaterThanOrEqual(3);
      expect(new Set(s).size).toBe(s.length);
      s.forEach((l) => expect(R.LAYOUTS).toContain(l));
    }
  });
  it('leads with layouts that suit the class and the orientation', () => {
    expect(R.suggestLayouts('ground', 'portrait')[0]).toBe('vertical-word');
    expect(R.suggestLayouts('dark', 'landscape')[0]).toBe('full-bleed-band');
    expect(R.suggestLayouts('light', 'square')).toContain('specimen-frame');
  });
  it('tolerates unknown input', () => {
    expect(R.suggestLayouts('nope', 'nope').length).toBeGreaterThanOrEqual(3);
  });
});
