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
        ['topoform-torus-contours', 'Torus Contours', 'specimen-frame', undefined, undefined],
        ['topo-mountain-range', 'Contour Survey No. 3', 'knockout-title', 'Topo', undefined],
        ['spiral-galaxy', 'Spiral Galaxy', 'full-bleed-band', 'Spiral', 'black-white'],
        ['wavetable-rolling-hills', 'Rolling Hills', 'knockout-title', 'Wavetable', undefined],
        ['shapepack-pebble-beach', 'Pebble Beach', 'full-sheet', 'Pebbles', undefined],
      ]);
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
