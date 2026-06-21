const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Raster-Plane — switching into Bars mode seeds See-Through OFF (UI wiring RGR).
 *
 * Bars read best as a watertight solid relief: with See-Through ON every hidden
 * back edge of every box draws, muddying the render. Selecting the Bars mode
 * should cascade See-Through OFF (mirrors the Lines-as-Planes relief cascade).
 * Before the cascade, switching to Bars left seeThrough at its previous value.
 */
describe('Raster-Plane — Bars mode seeds See-Through OFF', () => {
  let runtime, window, document, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  // Find the <select> whose control wrapper carries the given label.
  const findSelect = (label) => {
    for (const sel of document.querySelectorAll('select')) {
      let n = sel;
      for (let i = 0; i < 5 && n; i++) {
        n = n.parentElement;
        const lbl = n && n.querySelector && n.querySelector('.control-label');
        if (lbl && lbl.textContent.trim() === label) return sel;
      }
    }
    return null;
  };

  test('switching Mode to Bars sets seeThrough=false', () => {
    app.engine.addLayer('rasterPlane');
    const layer = app.engine.getActiveLayer();
    layer.params.mode = 'lines';
    layer.params.seeThrough = true;
    app.regen();
    app.ui.renderLayers();
    app.ui.buildControls();

    const sel = findSelect('Mode');
    expect(sel).toBeTruthy();
    sel.value = 'bars';
    sel.dispatchEvent(new window.Event('change'));

    expect(layer.params.mode).toBe('bars');
    expect(layer.params.seeThrough).toBe(false);
  });

  test('the cascade is scoped to Bars — other modes leave seeThrough alone', () => {
    app.engine.addLayer('rasterPlane');
    const layer = app.engine.getActiveLayer();
    layer.params.mode = 'lines';
    layer.params.seeThrough = true;
    app.regen();
    app.ui.renderLayers();
    app.ui.buildControls();

    const sel = findSelect('Mode');
    expect(sel).toBeTruthy();
    sel.value = 'topography';
    sel.dispatchEvent(new window.Event('change'));

    expect(layer.params.mode).toBe('topography');
    expect(layer.params.seeThrough).toBe(true);
  });
});
