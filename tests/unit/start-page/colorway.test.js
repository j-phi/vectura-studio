/**
 * Start Page colorway engine (src/core/start-page/colorway.js) + its catalogue
 * (src/config/start-page-colorways.js) against the REAL papers / pens / palettes.
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
];
const THEMES = ['dark', 'light', 'lark'];
const SEEDS = ['K7PQ2', '3AB9X', 'ZZ234'];
const works = (n, prefix = 'w') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}-${(i * 7919) % 101}` }));

let dom;
let V;
let C;
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  const ctx = dom.getInternalVMContext();
  for (const rel of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  V = dom.window.Vectura;
  C = V.StartPageColorway;
});
afterAll(() => dom?.window?.close());

describe('catalogue resolves to the real app catalogue', () => {
  it('validateCatalogue reports no problems', () => {
    expect(C.validateCatalogue()).toEqual([]);
  });
  it('every paper is a real PAPERS type; tints/stocks cite real palette colors', () => {
    const cfg = V.START_PAGE_COLORWAYS;
    for (const p of cfg.PAPERS) {
      expect(V.PAPERS.TYPES[p.type], p.id).toBeTruthy();
      expect(p.type).not.toBe('none');
      const src = p.tint || p;
      if (src.palette) {
        const pal = V.PALETTES.find((x) => x.id === src.palette);
        expect(pal, `${p.id} palette ${src.palette}`).toBeTruthy();
        expect(pal.colors[src.index], p.id).toBeTruthy();
      }
    }
  });
  it('every pen is a real model colour or a real palette color with the recorded hex', () => {
    for (const p of V.START_PAGE_COLORWAYS.PENS) {
      if (p.model) {
        const m = V.PEN_MODELS.MODELS[p.model];
        expect(m, p.id).toBeTruthy();
        const c = m.colours.find((x) => x.name === p.colour);
        expect(c, `${p.id}: ${p.colour}`).toBeTruthy();
        expect(c.hex.toLowerCase()).toBe(p.hex.toLowerCase());
      } else {
        const pal = V.PALETTES.find((x) => x.id === p.palette);
        expect(pal, `${p.id} palette ${p.palette}`).toBeTruthy();
        expect(pal.colors[p.index].toLowerCase(), p.id).toBe(p.hex.toLowerCase());
      }
    }
  });
  it('every table reference resolves, and the checker catches a bad one', () => {
    const cfg = V.START_PAGE_COLORWAYS;
    const pens = new Set(cfg.PENS.map((p) => p.id));
    const papers = new Set(cfg.PAPERS.map((p) => p.id));
    [...cfg.CURATED, ...cfg.WILDCARD].forEach(([pa, ...ps]) => { expect(papers.has(pa), pa).toBe(true); ps.forEach((x) => expect(pens.has(x), x).toBe(true)); });
    cfg.BASIC.pens.forEach((x) => expect(pens.has(x), x).toBe(true));
    cfg.PAPERS.push({ id: 'bogus', type: 'no-such-paper' });
    cfg.WILDCARD.push(['bogus', 'no-such-pen']);
    expect(C.validateCatalogue().length).toBeGreaterThanOrEqual(2);
    cfg.PAPERS.pop(); cfg.WILDCARD.pop();
    expect(C.validateCatalogue()).toEqual([]);
  });
  it('mono dark/light papers match the Meridian document colors', () => {
    expect(V.START_PAGE_COLORWAYS.MONO.dark.paper).toBe(V.THEMES.dark.documentBg);
    expect(V.START_PAGE_COLORWAYS.MONO.dark.ink).toBe(V.THEMES.dark.pen1Color);
    expect(V.START_PAGE_COLORWAYS.MONO.light.paper).toBe(V.THEMES.light.documentBg);
    expect(V.START_PAGE_COLORWAYS.MONO.light.ink).toBe(V.THEMES.light.pen1Color);
  });
});

describe('color math', () => {
  it('contrast follows WCAG', () => {
    expect(C.contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(C.contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });
  it('ensureContrast leaves passing inks alone and nudges failing ones', () => {
    expect(C.ensureContrast('#000000', '#ffffff', 3)).toEqual({ hex: '#000000', nudged: false });
    const r = C.ensureContrast('#f8f8f4', '#ffffff', 3);
    expect(r.nudged).toBe(true);
    expect(C.contrast(r.hex, '#ffffff')).toBeGreaterThanOrEqual(3);
    const d = C.ensureContrast('#202020', '#121214', 4.5);
    expect(C.contrast(d.hex, '#121214')).toBeGreaterThanOrEqual(4.5);
  });
  it('newSeed makes 5 chars from the alphabet and honors a rand source', () => {
    const s = C.newSeed();
    expect(s).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/);
    expect(C.newSeed(() => 0)).toBe('22222');
    expect(C.SEED_ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTVWXYZ');
  });
  it('newSeed with crypto uses rejection sampling: skips the biased tail and maps by modulo', () => {
    const n = C.SEED_ALPHABET.length;
    const limit = 4294967296 - (4294967296 % n);
    const feed = [limit, 4294967295, limit + 1, 0, 1, 2, 3, n, n + 1];
    let k = 0; let fills = 0;
    const fake = { getRandomValues: (a) => { fills++; for (let i = 0; i < a.length; i++) a[i] = feed[k++ % feed.length]; return a; } };
    const desc = Object.getOwnPropertyDescriptor(dom.window, 'crypto');
    Object.defineProperty(dom.window, 'crypto', { value: fake, configurable: true });
    try {
      // The first probe fill is discarded; the three biased values are never used.
      const s = C.newSeed();
      expect(s).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/);
      expect(fills).toBeGreaterThan(0);
      const picked = [...s].map((ch) => C.SEED_ALPHABET.indexOf(ch));
      expect(picked.every((v) => v >= 0 && v < n)).toBe(true);
    } finally {
      if (desc) Object.defineProperty(dom.window, 'crypto', desc); else delete dom.window.crypto;
    }
  });
  it('newSeed falls back to Math.random when crypto is unavailable', () => {
    const desc = Object.getOwnPropertyDescriptor(dom.window, 'crypto');
    Object.defineProperty(dom.window, 'crypto', { value: undefined, configurable: true });
    try { expect(C.newSeed()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/); }
    finally { if (desc) Object.defineProperty(dom.window, 'crypto', desc); else delete dom.window.crypto; }
  });
});

describe('colorway objects and contrast floors', () => {
  it('colorways are frozen and carry the contract fields', () => {
    const cw = C.colorwayFor({ mode: 'curated', theme: 'dark', workId: 'abc', index: 0 });
    expect(Object.isFrozen(cw)).toBe(true);
    for (const k of ['key', 'mode', 'paper', 'ink', 'ink2', 'textInk', 'paperType', 'paperName', 'penId', 'penName', 'name', 'contrast', 'textContrast', 'nudged']) expect(cw, k).toHaveProperty(k);
    expect(cw.paper).toMatch(/^#[0-9a-f]{6}$/);
    expect(V.PAPERS.TYPES[cw.paperType]).toBeTruthy();
  });
  it('names read "Pen on Paper · tint"', () => {
    const cw = C.colorwayFor({ mode: 'curated', workId: 'x', index: 0 });
    expect(cw.name).toMatch(/ on /);
    const sienna = C.sequence(works(40), { mode: 'curated', theme: 'dark' }).find((c) => c.penId === 'pal-sienna');
    expect(sienna.name).toBe('Burnt Sienna on Cotton rag · buff');
  });
  for (const theme of THEMES) {
    for (const mode of ['curated', 'mono', 'basic', 'wildcard', 'random']) {
      it(`${mode}/${theme}: art >= 3:1 and text >= 4.5:1 for every produced pair`, () => {
        const seen = new Set();
        for (const seed of SEEDS) {
          const seq = C.sequence(works(60, seed), { mode, seed, theme });
          for (const cw of seq) {
            seen.add(cw.key);
            expect(cw.contrast, cw.name).toBeGreaterThanOrEqual(3);
            expect(C.contrast(cw.ink, cw.paper), cw.name).toBeGreaterThanOrEqual(3);
            if (cw.ink2) expect(C.contrast(cw.ink2, cw.paper), cw.name).toBeGreaterThanOrEqual(3);
            expect(C.contrast(cw.textInk, cw.paper), cw.name).toBeGreaterThanOrEqual(4.5);
            expect(cw.textContrast).toBeGreaterThanOrEqual(4.5);
          }
        }
        expect(seen.size).toBeGreaterThan(mode === 'mono' ? 0 : 5);
      });
    }
  }
  it('every curated, wildcard and basic catalogue pair clears the floors in every theme', () => {
    const cfg = V.START_PAGE_COLORWAYS;
    for (const theme of THEMES) {
      const all = [
        ...C.sequence(works(cfg.CURATED.length * 6), { mode: 'curated', theme }),
        ...C.sequence(works(cfg.WILDCARD.length * 3), { mode: 'wildcard', theme }),
        ...C.sequence(works(cfg.BASIC.pens.length * 2), { mode: 'basic', theme }),
      ];
      all.forEach((cw) => { expect(cw.contrast).toBeGreaterThanOrEqual(3); expect(cw.textContrast).toBeGreaterThanOrEqual(4.5); });
    }
  });
  it('mono is theme ink on theme paper', () => {
    const d = C.colorwayFor({ mode: 'mono', theme: 'dark', workId: 'a', index: 0 });
    expect([d.paper, d.ink]).toEqual(['#121214', '#e6f1ff']);
    const l = C.colorwayFor({ mode: 'mono', theme: 'light', workId: 'a', index: 0 });
    expect([l.paper, l.ink]).toEqual(['#ffffff', '#0a1320']);
    const k = C.colorwayFor({ mode: 'mono', theme: 'lark', workId: 'a', index: 0 });
    expect([k.paper, k.ink]).toEqual(['#ffffff', '#0a1320']);
    expect(new Set(C.sequence(works(8), { mode: 'mono', theme: 'dark' }).map((c) => c.key)).size).toBe(1);
  });
  it('basic uses theme paper and the pen box', () => {
    const d = C.colorwayFor({ mode: 'basic', theme: 'dark', index: 2 });
    expect(d.paper).toBe('#161618');
    expect(C.colorwayFor({ mode: 'basic', theme: 'light', index: 2 }).paper).toBe('#fbfaf6');
    expect(V.START_PAGE_COLORWAYS.BASIC.pens).toContain(d.penId);
  });
  it('basic on dark swaps unreadable box pens for light inks instead of nudging them to grey', () => {
    const seq = C.sequence(works(33), { mode: 'basic', theme: 'dark' });
    expect(seq.some((c) => c.nudged)).toBe(false);
    expect(new Set(seq.map((c) => c.ink)).size).toBe(V.START_PAGE_COLORWAYS.BASIC.pens.length);
  });
  it('wildcard includes duotones and dark stock; random is seeded', () => {
    const seq = C.sequence(works(30), { mode: 'wildcard', theme: 'dark' });
    expect(seq.some((c) => c.ink2)).toBe(true);
    expect(seq.some((c) => C.contrast(c.paper, '#000000') < 3)).toBe(true);
    const a = C.colorwayFor({ mode: 'random', seed: 'K7PQ2', index: 3 });
    expect(C.colorwayFor({ mode: 'random', seed: 'K7PQ2', index: 3 }).key).toBe(a.key);
    const keys = new Set(SEEDS.map((s) => C.colorwayFor({ mode: 'random', seed: s, index: 3 }).key));
    expect(keys.size).toBeGreaterThan(1);
  });
});

describe('near()', () => {
  it('is true for the same colorway and for tiny differences, false for distinct schemes', () => {
    const a = C.colorwayFor({ mode: 'curated', workId: 'a', index: 0 });
    expect(C.near(a, a)).toBe(true);
    const seq = C.sequence(works(20), { mode: 'curated', theme: 'dark' });
    expect(C.near(seq[0], seq[1])).toBe(false);
    expect(C.near(null, a)).toBe(false);
  });
});

describe('sequence adjacency and determinism', () => {
  for (const mode of ['curated', 'wildcard', 'random']) {
    it(`${mode}: no adjacent identical or near-identical colorways (3 seeds x 30 works)`, () => {
      for (const seed of SEEDS) {
        for (const theme of ['dark', 'light']) {
          const seq = C.sequence(works(30, seed), { mode, seed, theme });
          expect(seq).toHaveLength(30);
          for (let i = 1; i < seq.length; i++) {
            expect(seq[i].key, `${mode} ${seed} #${i}`).not.toBe(seq[i - 1].key);
            expect(C.near(seq[i], seq[i - 1]), `${mode} ${seed} #${i}: ${seq[i - 1].name} / ${seq[i].name}`).toBe(false);
          }
        }
      }
    });
  }
  it('basic: neighbor inks differ', () => {
    for (const theme of THEMES) {
      const seq = C.sequence(works(40), { mode: 'basic', theme });
      for (let i = 1; i < seq.length; i++) expect(seq[i].ink).not.toBe(seq[i - 1].ink);
    }
  });
  it('is deterministic for (mode, seed, theme, ids)', () => {
    for (const mode of C.MODES) {
      const o = { mode, seed: 'K7PQ2', theme: 'light' };
      expect(C.sequence(works(25), o)).toEqual(C.sequence(works(25), o));
    }
  });
  it('curated assignment is stable per workId (prefix of a longer list is unchanged)', () => {
    const a = C.sequence(works(10), { mode: 'curated', theme: 'dark' });
    const b = C.sequence(works(25), { mode: 'curated', theme: 'dark' });
    expect(b.slice(0, 10)).toEqual(a);
    expect(C.colorwayFor({ mode: 'curated', workId: 'zed' }).key).toBe(C.colorwayFor({ mode: 'curated', workId: 'zed', index: 9 }).key);
  });
  it('a different seed changes random', () => {
    const a = C.sequence(works(12), { mode: 'random', seed: 'K7PQ2' }).map((c) => c.key).join();
    const b = C.sequence(works(12), { mode: 'random', seed: '3AB9X' }).map((c) => c.key).join();
    expect(a).not.toBe(b);
  });
  it('pins always win, and neighbors avoid them', () => {
    const ws = works(12);
    const base = C.sequence(ws, { mode: 'curated', theme: 'dark' });
    const pin = C.colorwayFor({ mode: 'wildcard', index: 4 });
    for (const mode of C.MODES) {
      const seq = C.sequence(ws, { mode, seed: 'K7PQ2', theme: 'dark', pins: { [ws[3].id]: pin } });
      expect(seq[3]).toBe(pin);
    }
    const seq = C.sequence(ws, { mode: 'curated', theme: 'dark', pins: { [ws[3].id]: base[4] } });
    expect(seq[3]).toBe(base[4]);
    expect(C.near(seq[4], seq[3])).toBe(false);
  });
});

describe('alternates', () => {
  for (const mode of ['curated', 'wildcard', 'random', 'basic', 'mono']) {
    it(`${mode}: n distinct, slot 0 is the piece's own, neighbors never share or near-repeat a slot`, () => {
      const ws = works(24);
      const o = { mode, seed: 'K7PQ2', theme: 'dark', works: ws };
      const own = C.sequence(ws, { mode: mode === 'mono' ? 'curated' : mode, seed: 'K7PQ2', theme: 'dark' });
      let prev = null;
      ws.forEach((w, i) => {
        const alts = C.alternates(i, w.id, 3, o);
        expect(alts).toHaveLength(3);
        expect(new Set(alts.map((c) => c.key)).size).toBe(3);
        for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) expect(C.near(alts[a], alts[b]), `${mode} #${i} ${a}/${b}`).toBe(false);
        expect(alts[0].key).toBe(own[i].key);
        if (prev) {
          for (const c of alts) expect(prev.some((p) => p.key === c.key), `${mode} #${i} shares ${c.name}`).toBe(false);
          for (let s = 0; s < 3; s++) expect(C.near(alts[s], prev[s]), `${mode} #${i} slot ${s}`).toBe(false);
        }
        alts.forEach((c) => { expect(c.contrast).toBeGreaterThanOrEqual(3); expect(c.textContrast).toBeGreaterThanOrEqual(4.5); });
        prev = alts;
      });
    });
  }
  it('is deterministic and honors n', () => {
    const ws = works(6);
    const o = { mode: 'curated', seed: 'K7PQ2', theme: 'dark', works: ws };
    expect(C.alternates(4, ws[4].id, 5, o)).toEqual(C.alternates(4, ws[4].id, 5, o));
    expect(C.alternates(4, ws[4].id, 5, o)).toHaveLength(5);
    expect(C.alternates(2, ws[2].id, undefined, o)).toHaveLength(3);
  });
});

describe('audit', () => {
  it('reports per-mode minimum contrast and adjacency', () => {
    const a = C.audit(works(40), { theme: 'dark' });
    expect(Object.keys(a).sort()).toEqual([...C.MODES].sort());
    for (const m of C.MODES) {
      expect(a[m].minContrast).toBeGreaterThanOrEqual(3);
      expect(a[m].minTextContrast).toBeGreaterThanOrEqual(4.5);
    }
    for (const m of ['curated', 'wildcard', 'random']) expect(a[m].adjacentNear).toBe(0);
  });
});
