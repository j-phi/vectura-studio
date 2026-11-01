/**
 * Start Page "open in exactly the colors shown": StartPageOpenArt.freezeColorway (pure) maps a resolved
 * colorway (paper + ink + ink2 + special fill) onto a .vectura payload.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILES = ['src/core/utils.js', 'src/config/papers.js', 'src/core/paper.js', 'src/ui/start-page/open-art.js'];

let V;
let O;
beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  const ctx = dom.getInternalVMContext();
  for (const rel of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  V = dom.window.Vectura;
  O = V.StartPageOpenArt;
});

const layer = (id, penId, extra = {}) => ({ id, type: 'wavetable', isGroup: false, penId, color: '#111111', strokeWidth: 0.3, params: {}, ...extra });
const doc = (over = {}) => ({
  type: 'vectura',
  version: '1.0.0',
  state: {
    engine: { layers: [layer('a', 'pen-1'), layer('b', 'pen-2'), layer('c', 'pen-1')], activeLayerId: 'a' },
    settings: {
      paperSize: 'a4', margin: 12, strokeWidth: 0.4,
      paper: { type: 'cold-press', color: '#f0e8d8', texture: 0.37, bleed: 0.2, scale: 1.5, seed: 77 },
      bgColor: '#f0e8d8',
      pens: [
        { id: 'pen-1', name: 'Pen 1', color: '#112233', width: 0.4 },
        { id: 'pen-2', name: 'Pen 2', color: '#445566', width: 0.6 },
        { id: 'pen-3', name: 'Pen 3', color: '#778899', width: 0.8 },
      ],
      ...over,
    },
  },
  images: {},
});
const WILD = { paper: '#1f3a8a', ink: '#e8c15a', ink2: '#ffffff', paperType: 'none' };

describe('freezeColorway', () => {
  it('does not mutate the input and returns a new payload', () => {
    const src = doc();
    const before = JSON.stringify(src);
    const out = O.freezeColorway(src, WILD);
    expect(JSON.stringify(src)).toBe(before);
    expect(out).not.toBe(src);
    expect(out.type).toBe('vectura');
  });

  it('sets the paper type, color and bgColor', () => {
    const s = O.freezeColorway(doc(), WILD).state.settings;
    expect(s.paper.type).toBe('none');
    expect(s.paper.color).toBe('#1f3a8a');
    expect(s.bgColor).toBe('#1f3a8a');
  });

  it('takes texture/bleed defaults from the catalogue when the paper type changes', () => {
    const T = V.PAPERS.TYPES['hot-press'] ? 'hot-press' : Object.keys(V.PAPERS.TYPES).find((k) => k !== 'none' && k !== 'cold-press');
    const s = O.freezeColorway(doc(), { ...WILD, paperType: T }).state.settings;
    expect(s.paper.type).toBe(T);
    expect(s.paper.texture).toBeCloseTo(V.PAPERS.TYPES[T].defaultTexture, 5);
    expect(s.paper.bleed).toBeCloseTo(V.PAPERS.TYPES[T].defaultBleed, 5);
    expect(s.paper.seed).not.toBe(77);
  });

  it('keeps the document texture/bleed/seed when the paper type is unchanged', () => {
    const s = O.freezeColorway(doc(), { ...WILD, paperType: 'cold-press' }).state.settings;
    expect(s.paper).toMatchObject({ type: 'cold-press', color: '#1f3a8a', texture: 0.37, bleed: 0.2, scale: 1.5, seed: 77 });
  });

  it('falls back to plain paper for a missing or unknown paperType', () => {
    expect(O.freezeColorway(doc(), { paper: '#abcdef', ink: '#000000' }).state.settings.paper.type).toBe('none');
    expect(O.freezeColorway(doc(), { paper: '#abcdef', ink: '#000000', paperType: 'nope' }).state.settings.paper.type).toBe('none');
  });

  it('recolors the first used pen with ink and the second used pen with ink2; leaves unused pens alone', () => {
    const out = O.freezeColorway(doc(), WILD);
    const pens = out.state.settings.pens;
    expect(pens.find((p) => p.id === 'pen-1').color).toBe('#e8c15a');
    expect(pens.find((p) => p.id === 'pen-2').color).toBe('#ffffff');
    expect(pens.find((p) => p.id === 'pen-3').color).toBe('#778899');
    expect(pens.map((p) => p.width)).toEqual([0.4, 0.6, 0.8]);
    const layers = out.state.engine.layers;
    expect(layers.map((l) => l.color)).toEqual(['#e8c15a', '#ffffff', '#e8c15a']);
    expect(layers.map((l) => l.penId)).toEqual(['pen-1', 'pen-2', 'pen-1']);
  });

  it('uses the first USED pen as primary, not the first listed pen', () => {
    const d = doc();
    d.state.engine.layers = [layer('a', 'pen-3'), layer('b', 'pen-2')];
    const pens = O.freezeColorway(d, WILD).state.settings.pens;
    expect(pens.find((p) => p.id === 'pen-3').color).toBe('#e8c15a');
    expect(pens.find((p) => p.id === 'pen-2').color).toBe('#ffffff');
    expect(pens.find((p) => p.id === 'pen-1').color).toBe('#112233');
  });

  it('a single-pen document takes ink only, even when ink2 is set', () => {
    const d = doc();
    d.state.engine.layers = [layer('a', 'pen-1'), layer('b', 'pen-1')];
    const pens = O.freezeColorway(d, WILD).state.settings.pens;
    expect(pens.find((p) => p.id === 'pen-1').color).toBe('#e8c15a');
    expect(pens.find((p) => p.id === 'pen-2').color).toBe('#445566');
  });

  it('a two-pen document with no ink2 recolors EVERY used pen and layer in the ink (the plate draws all pens in one ink)', () => {
    const out = O.freezeColorway(doc(), { ...WILD, ink2: null });
    const pens = out.state.settings.pens;
    expect(pens.find((p) => p.id === 'pen-1').color).toBe('#e8c15a');
    expect(pens.find((p) => p.id === 'pen-2').color).toBe('#e8c15a');
    expect(pens.find((p) => p.id === 'pen-3').color).toBe('#778899'); // unused: untouched
    expect(out.state.engine.layers.map((l) => l.color)).toEqual(['#e8c15a', '#e8c15a', '#e8c15a']);
  });

  it('a three-pen duotone steps evenly from ink to ink2 (two pens: exactly ink, ink2)', () => {
    const d = doc();
    d.state.engine.layers = [layer('a', 'pen-1'), layer('b', 'pen-2'), layer('c', 'pen-3')];
    const out = O.freezeColorway(d, { paper: '#000000', ink: '#000000', ink2: '#ffffff', fill: 'duotone' });
    expect(out.state.settings.pens.map((p) => p.color)).toEqual(['#000000', '#808080', '#ffffff']);
    expect(out.state.engine.layers.map((l) => l.color)).toEqual(['#000000', '#808080', '#ffffff']);
  });

  it('ignores groups and layers that point at an unknown pen (falls back to the first pen)', () => {
    const d = doc();
    d.state.engine.layers = [{ id: 'g', isGroup: true, penId: 'pen-3' }, layer('a', 'ghost')];
    const out = O.freezeColorway(d, WILD);
    expect(out.state.settings.pens.find((p) => p.id === 'pen-1').color).toBe('#e8c15a');
    expect(out.state.settings.pens.find((p) => p.id === 'pen-3').color).toBe('#778899');
    expect(out.state.engine.layers[1].color).toBe('#e8c15a');
  });

  it('creates a pen when the document has none', () => {
    const d = doc({ pens: [] });
    d.state.engine.layers = [layer('a', null)];
    const out = O.freezeColorway(d, WILD);
    expect(out.state.settings.pens).toHaveLength(1);
    expect(out.state.settings.pens[0]).toMatchObject({ id: 'pen-1', color: '#e8c15a' });
    expect(out.state.engine.layers[0].penId).toBe('pen-1');
  });

  it('pins the pen so a theme change cannot recolor it (themeManaged false)', () => {
    const d = doc();
    d.state.settings.pens[0].themeManaged = true;
    expect(O.freezeColorway(d, WILD).state.settings.pens[0].themeManaged).toBe(false);
  });

  it('keeps every other settings key and the rest of the engine untouched', () => {
    const out = O.freezeColorway(doc(), WILD);
    expect(out.state.settings).toMatchObject({ paperSize: 'a4', margin: 12, strokeWidth: 0.4 });
    expect(out.state.engine.activeLayerId).toBe('a');
    expect(out.state.engine.layers[0].strokeWidth).toBe(0.3);
    expect(out.images).toEqual({});
  });

  it('accepts a bare state object (engine + settings) as well as a { state } payload', () => {
    const bare = doc().state;
    const out = O.freezeColorway(bare, WILD);
    expect(out.settings.paper.color).toBe('#1f3a8a');
    expect(out.engine.layers[0].color).toBe('#e8c15a');
  });

  it('normalizes #rgb inks and rejects non-hex colors', () => {
    const out = O.freezeColorway(doc(), { paper: '#fff', ink: '#abc', ink2: 'red' });
    expect(out.state.settings.paper.color).toBe('#ffffff');
    expect(out.state.settings.pens[0].color).toBe('#aabbcc');
    expect(out.state.settings.pens[1].color).toBe('#aabbcc'); // every used pen takes the ink
    const bad = O.freezeColorway(doc(), { paper: 'url(x)', ink: '"><img>' });
    expect(bad.state.settings.paper.color).toBe('#f0e8d8');
    expect(bad.state.settings.pens[0].color).toBe('#112233');
  });

  it('throws on something that is not a document', () => {
    expect(() => O.freezeColorway(null, WILD)).toThrow();
    expect(() => O.freezeColorway({ foo: 1 }, WILD)).toThrow();
  });
});

describe('special fills', () => {
  it('freezes each fill as a solid representative ink and stashes the fill in settings.startPageFill', () => {
    ['iridescent', 'iridescent-animated', 'duotone', 'metallic-gold', 'metallic-silver', 'sunset'].forEach((fill) => {
      const out = O.freezeColorway(doc(), { paper: '#101010', paperType: 'none', fill });
      const s = out.state.settings;
      expect(s.pens[0].color).toMatch(/^#[0-9a-f]{6}$/);
      expect(s.pens[0].color).toBe(O.FILL_INKS[fill]);
      expect(s.startPageFill).toMatchObject({ kind: fill, ink: O.FILL_INKS[fill] });
    });
  });

  it('prefers the caller\'s own displayed ink over the table when one is supplied', () => {
    const out = O.freezeColorway(doc(), { paper: '#101010', ink: '#c9a24a', fill: 'metallic-gold' });
    expect(out.state.settings.pens[0].color).toBe('#c9a24a');
    expect(out.state.settings.startPageFill.ink).toBe('#c9a24a');
  });

  it('a duotone keeps ink and ink2 as its two solid pens', () => {
    const out = O.freezeColorway(doc(), { paper: '#101010', ink: '#ff00aa', ink2: '#00ffaa', fill: 'duotone' });
    expect(out.state.settings.pens[0].color).toBe('#ff00aa');
    expect(out.state.settings.pens[1].color).toBe('#00ffaa');
    expect(out.state.settings.startPageFill).toMatchObject({ kind: 'duotone', ink: '#ff00aa', ink2: '#00ffaa' });
  });

  it('a plain colorway clears a stale startPageFill carried by the source document', () => {
    const d = doc({ startPageFill: { kind: 'sunset', ink: '#e8603c' } });
    expect(O.freezeColorway(d, WILD).state.settings.startPageFill).toBeUndefined();
  });

  it('an unknown fill kind is ignored', () => {
    const out = O.freezeColorway(doc(), { ...WILD, fill: 'plaid' });
    expect(out.state.settings.startPageFill).toBeUndefined();
    expect(out.state.settings.pens[0].color).toBe('#e8c15a');
  });
});

describe('own-color detection and names', () => {
  it('sameAsOwn: paper and ink within a tiny tolerance, and never with a fill or a second ink', () => {
    const own = { paper: '#101010', ink: '#eeeeee' };
    expect(O.sameAsOwn({ paper: '#101010', ink: '#eeeeee' }, own)).toBe(true);
    expect(O.sameAsOwn({ paper: '#111010', ink: '#efeeee' }, own)).toBe(true);
    expect(O.sameAsOwn({ paper: '#101010', ink: '#d0d0d0' }, own)).toBe(false);
    expect(O.sameAsOwn({ paper: '#101010', ink: '#eeeeee', fill: 'sunset' }, own)).toBe(false);
    expect(O.sameAsOwn({ paper: '#101010', ink: '#eeeeee', ink2: '#ff0000' }, own)).toBe(false);
    expect(O.sameAsOwn({ paper: '#101010', ink: '#eeeeee' }, null)).toBe(false);
  });
  it('baseName never stacks suffixes', () => {
    expect(O.baseName('hills.vectura')).toBe('hills');
    expect(O.baseName('hills (colorway)')).toBe('hills');
    expect(O.baseName('hills (colorway) copy')).toBe('hills');
    expect(O.baseName('hills copy (colorway).vectura')).toBe('hills');
    expect(O.baseName('')).toBe('Untitled');
  });
});

describe('freezeColorway keeps pen names', () => {
  const two = () => { const d = doc(); d.state.engine.layers = [layer('a', 'pen-1'), layer('b', 'pen-2')]; return d; };
  const three = () => { const d = doc(); d.state.engine.layers = [layer('a', 'pen-1'), layer('b', 'pen-2'), layer('c', 'pen-3')]; return d; };
  const names = (o) => o.state.settings.pens.map((p) => p.name);
  const CW = { ...WILD, penNameA: 'Micron Black', penNameB: 'Gelly White', nudgedA: false, nudgedB: false, penName: 'Micron Black + White' };

  it('names the primary and secondary used pens after the colorway pens', () => {
    const n = names(O.freezeColorway(two(), CW));
    expect(n[0]).toBe('Micron Black');
    expect(n[1]).toBe('Gelly White');
  });
  it('never labels a contrast-nudged ink with the catalogue pen name', () => {
    const n = names(O.freezeColorway(two(), { ...CW, nudgedA: true, nudgedB: true }));
    expect(n.slice(0, 2)).toEqual(['Pen 1', 'Pen 2']);
  });
  it('intermediate duotone pens keep their document names', () => {
    const n = names(O.freezeColorway(three(), CW));
    expect(n[0]).toBe('Micron Black');
    expect(n[1]).toBe('Pen 2');
    expect(n[2]).toBe('Pen 3');
  });
  it('a special fill keeps document names', () => {
    expect(names(O.freezeColorway(two(), { ...CW, fill: 'duotone' })).slice(0, 2)).toEqual(['Pen 1', 'Pen 2']);
  });
  it('without ink2 only the primary pen is renamed, from penName when penNameA is absent', () => {
    const n = names(O.freezeColorway(two(), { paper: '#fff', ink: '#112233', penName: 'Plate Ink' }));
    expect(n.slice(0, 2)).toEqual(['Plate Ink', 'Pen 2']);
  });
  it('penNameA null (theme ink) leaves names alone', () => {
    expect(names(O.freezeColorway(two(), { paper: '#fff', ink: '#112233', penName: 'Pen 1 \u00b7 theme ink', penNameA: null })).slice(0, 2)).toEqual(['Pen 1', 'Pen 2']);
  });
});
