/* The five example plates reference real bundled presets, are pre-rendered, and the manifest is current. */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const ROOT = path.resolve(__dirname, '../../..');

describe('example plates config', () => {
  it('lists five examples, each a bundled preset with a pre-rendered file and a current hash', async () => {
    const runtime = await loadVecturaRuntime({ includeUi: true, useIndexHtml: true });
    try {
      const V = runtime.window.Vectura;
      const ex = V.START_PAGE_PICKS.EXAMPLE_PLATES;
      expect(ex).toHaveLength(5);
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
      expect(arts).toHaveLength(5);
      expect(arts.every((a) => a.kind === 'pick' && a.example === true && a.id.startsWith('example:'))).toBe(true);
    } finally { runtime.cleanup(); }
  });
});
