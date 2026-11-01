const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

describe('layers panel duplicate with a mask and its masked child selected', () => {
  let runtime;
  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const boot = async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    const { window } = runtime;
    window.app = new window.Vectura.App();
    await waitForUi();
    const e = window.app.engine;
    const mk = (t) => { const r = e.addLayer(t); return e.getLayerById(typeof r === 'string' ? r : r.id); };
    const mask = mk('rings');
    const child = mk('wavetable');
    child.parentId = mask.id;
    mask.mask.enabled = true;
    window.app.ui.renderLayers();
    return { window, e, mask, child };
  };

  test('_lvlDupSel copies each of mask and child exactly once', async () => {
    const { window, e, mask, child } = await boot();
    window.app.renderer.setSelection([mask.id, child.id], child.id);
    const n = e.layers.length;
    window.app.ui._lvlDupSel();
    expect(e.layers.length).toBe(n + 2);
    expect(e.layers.filter((l) => l.type === 'wavetable').length).toBe(2);
    expect(e.layers.filter((l) => l.type === 'rings').length).toBe(2);
  });

  test('duplicateLayers selects the mask copy and its copied child', async () => {
    const { window, e, mask } = await boot();
    const dups = window.app.ui.duplicateLayers([mask]);
    expect(dups.length).toBe(1);
    const sel = [...window.app.renderer.selectedLayerIds];
    const kids = e.layers.filter((l) => l.parentId === dups[0].id);
    expect(kids.length).toBe(1);
    expect(sel).toContain(dups[0].id);
    expect(sel).toContain(kids[0].id);
  });
});
