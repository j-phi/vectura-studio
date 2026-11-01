/* The ten example plates reference real bundled presets, are pre-rendered, and the manifest is current. */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const ROOT = path.resolve(__dirname, '../../..');

describe('example plates config', () => {
  it('lists ten examples, each a bundled preset with a pre-rendered file and a current hash', async () => {
    const runtime = await loadVecturaRuntime({ includeUi: true, useIndexHtml: true });
    try {
      const V = runtime.window.Vectura;
      const ex = V.START_PAGE_PICKS.EXAMPLE_PLATES;
      expect(ex).toHaveLength(10);
      const byId = new Map(V.PRESETS.map((p) => [p.id, p]));
      for (const e of ex) {
        expect(byId.has(e.presetId), `${e.presetId} is a bundled preset`).toBe(true);
        expect(e.title).toBeTruthy();
        expect(V.StartPagePlateType.LAYOUTS.some((l) => l.id === e.layout)).toBe(true);
        const file = path.join(ROOT, 'assets/start-page/picks', `${e.presetId}.svg`);
        expect(fs.existsSync(file), `${e.presetId}.svg`).toBe(true);
        expect(V.START_PAGE_PICKS_ART.hashByPick[e.presetId]).toBe(V.StartPageArtSource.hashOf(byId.get(e.presetId)));
      }
      const arts = V.StartPageArtSource.examples();
      expect(arts).toHaveLength(10);
      expect(arts.every((a) => a.kind === 'pick' && a.example === true && a.id.startsWith('example:'))).toBe(true);
      // the five added from the mockup, in order, with the layout/word/pin mapped to the app's real ids
      expect(ex.slice(5).map((e) => [e.presetId, e.title, e.layout, e.word, e.pin])).toEqual([
        ['topoform-torus-contours', 'Torus Contours', 'specimen-frame', undefined, 'kraft-sepia'],
        ['topo-mountain-range', 'Contour Survey No. 3', 'knockout-title', 'Topo', 'black-silver'],
        ['spiral-galaxy', 'Spiral Galaxy', 'full-bleed-band', 'Spiral', 'sky-prussian'],
        ['wavetable-rolling-hills', 'Rolling Hills', 'knockout-title', 'Wavetable', 'ochre-umber'],
        ['shapepack-pebble-beach', 'Pebble Beach', 'full-sheet', 'Pebbles', 'lavender-violet'],
      ]);
      // the whole ten in order: no two dark plates side by side, no neighbouring colorways that share a hue family
      const R = V.StartPagePlateRhythm;
      const placed = R.place(ex.map((e, i) => ({ id: 'p' + i, pin: e.pin || (i === 1 ? 'black-white' : null) })), { mode: 'curated', theme: 'dark' }).map((r) => r.colorway);
      for (let i = 1; i < placed.length; i++) {
        expect(placed[i].class === 'dark' && placed[i - 1].class === 'dark', `dark ${i}/${i + 1}`).toBe(false);
        expect(placed[i].fam === placed[i - 1].fam, `family ${i}/${i + 1}`).toBe(false);
      }
      // every pin is a real palette id, and no two dark pins sit side by side
      const pal = new Map(V.START_PAGE_PLATE_PALETTE.map((c) => [c.id, c]));
      ex.filter((e) => e.pin).forEach((e) => expect(pal.has(e.pin), e.pin).toBe(true));
      for (let i = 1; i < ex.length; i++) {
        const a = ex[i - 1].pin && pal.get(ex[i - 1].pin); const b = ex[i].pin && pal.get(ex[i].pin);
        expect(!!(a && b && a.class === 'dark' && b.class === 'dark'), `plates ${i} and ${i + 1}`).toBe(false);
      }
    } finally { runtime.cleanup(); }
  });
});

describe('example plates config: hover', () => {
  it('every hover is a hover-fx effect id, and plate 7 (Contour Survey No. 3) is iridescent with the hologram hover on black stock', async () => {
    const fx = fs.readFileSync(path.join(ROOT, 'src/ui/start-page/hover-fx/index.js'), 'utf8');
    const ids = [...(/const EFFECTS = \{([\s\S]*?)\n  \};/.exec(fx)[1]).matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
    expect(ids).toContain('holo');
    const runtime = await loadVecturaRuntime({ includeUi: true, useIndexHtml: true });
    try {
      const ex = runtime.window.Vectura.START_PAGE_PICKS.EXAMPLE_PLATES;
      ex.filter((e) => e.hover != null).forEach((e) => expect(ids, e.presetId).toContain(e.hover));
      const p7 = ex[6];
      expect(p7.presetId).toBe('topo-mountain-range');
      expect(p7.hover).toBe('holo');
      expect(p7.pin).toBe('black-silver');
      expect(JSON.parse(JSON.stringify(p7.colors))).toEqual({ art: { fill: 'iridescent' }, title: { fill: 'iridescent' }, band: '#1c1c1e' }); // band = the black stock, so the big word sits on the dark ground
      expect(ex.filter((e) => e.hover).map((e) => e.presetId)).toEqual(['topo-mountain-range']);
    } finally { runtime.cleanup(); }
  });
});
