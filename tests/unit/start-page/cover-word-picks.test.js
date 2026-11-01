/**
 * The default cover word's hand-set run (START_PAGE_PICKS.COVER_WORD_PICKS): V e c t u r a each carry one named piece on one
 * named paper + pen. Real presets, real colorway catalogue, real art-source / cover-words wiring.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILES = [
  'src/config/palettes.js', 'src/config/papers.js', 'src/config/pen-models.js', 'src/config/defaults.js',
  'src/config/start-page.js', 'src/config/start-page-colorways.js', 'src/core/start-page/colorway.js',
  'src/core/start-page/cover-words.js', 'src/config/user-presets.js', 'src/config/start-page-picks.js', 'src/ui/start-page/art-source.js',
];
let V;
beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  const ctx = dom.getInternalVMContext();
  for (const rel of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  V = dom.window.Vectura;
});

const LETTERS = ['V', 'e', 'c', 't', 'u', 'r', 'a'];
const source = () => V.StartPageArtSource.create({ store: { listWorks: async () => [] }, renderer: {}, cache: { get: async () => null, put: async () => {} } });

describe('COVER_WORD_PICKS', () => {
  it('names one bundled preset per letter of Vectura, in letter order', () => {
    const picks = V.START_PAGE_PICKS.COVER_WORD_PICKS;
    expect(picks).toHaveLength(LETTERS.length);
    expect(picks.map((p) => p.presetId)).toEqual([
      'user-terrain-1781475148727', 'terrain-alpine', 'user-rings-1786211570394', 'flowfield-river-current',
      'dahlia-cornel', 'rainfall-downpour', 'rings-old-growth-oak',
    ]);
    const ids = new Set(V.PRESETS.map((p) => p.id));
    picks.forEach((p) => expect(ids.has(p.presetId), p.presetId).toBe(true));
  });

  it('resolves every paper + pen pairing in the real catalogue', () => {
    V.START_PAGE_PICKS.COVER_WORD_PICKS.forEach((p) => {
      const cw = V.StartPageColorway.fromCatalogue(p.paper, p.pen, p.pen2);
      expect(cw, `${p.paper} + ${p.pen}`).toBeTruthy();
      expect(cw.contrast).toBeGreaterThanOrEqual(3);
    });
    expect(V.StartPageColorway.fromCatalogue('no-such-paper', 'micron-blue')).toBeNull();
  });

  it('hangs the artwork on the pictured papers and inks', () => {
    const names = V.START_PAGE_PICKS.COVER_WORD_PICKS.map((p) => V.StartPageColorway.fromCatalogue(p.paper, p.pen, p.pen2).name);
    expect(names).toEqual([
      'Blue on Cold press · blue wash', 'Black on Newsprint', 'White on Black stock', 'Blue on Cold press · blue wash',
      'Wine Rose on Rough · rose', 'Teal on Hot press', 'Sepia on Kraft',
    ]);
  });

  it('art-source.coverPicks returns them as picks with their letter slot and pinned colorway', () => {
    const arts = source().coverPicks();
    expect(arts.map((a) => a.coverSlot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(arts.every((a) => a.kind === 'pick')).toBe(true);
    expect(arts[2].coverColorway).toEqual({ paper: 'black', pen: 'gelly-white', pen2: null });
  });

  it('assignArts puts each piece on its own letter, even a thin one', () => {
    const arts = source().coverPicks();
    // the piece for 'a' is the densest and the t / r pieces the lightest: the thin-letter rule alone would reshuffle them
    arts.forEach((a, i) => { a.bytes = i === 6 ? 900000 : 1000 + i; });
    const out = V.StartPageCoverWords.assignArts(LETTERS, arts.slice().reverse());
    expect(out.map((a) => a.coverSlot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
