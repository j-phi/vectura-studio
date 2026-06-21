const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Raster-Plane — "Lines as Planes" seeds relief defaults (UI wiring RGR).
 *
 * Enabling Lines as Planes should cascade the relief-friendly defaults: a small
 * Base Height lift (so flat regions still extrude a curtain) and See-Through OFF
 * (so the solid faces occlude). Before the cascade, toggling it on left
 * baseHeight at 0 and seeThrough at its previous value.
 */
describe('Raster-Plane — Lines as Planes seeds relief defaults', () => {
  let runtime, window, document, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  // Find the checkbox whose control wrapper carries the given label.
  const findCheckbox = (label) => {
    for (const cb of document.querySelectorAll('input[type="checkbox"]')) {
      let n = cb;
      for (let i = 0; i < 5 && n; i++) {
        n = n.parentElement;
        const lbl = n && n.querySelector && n.querySelector('.control-label');
        if (lbl && lbl.textContent.trim() === label) return cb;
      }
    }
    return null;
  };

  test('toggling Lines as Planes ON sets baseHeight=1 and seeThrough=false', () => {
    app.engine.addLayer('rasterPlane');
    const layer = app.engine.getActiveLayer();
    layer.params.mode = 'lines';
    layer.params.horizontalLinesAsPlanes = false;
    layer.params.baseHeight = 0;
    layer.params.seeThrough = true;
    app.regen();
    app.ui.renderLayers();
    app.ui.buildControls();

    const cb = findCheckbox('Lines as Planes');
    expect(cb).toBeTruthy();
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change'));

    expect(layer.params.horizontalLinesAsPlanes).toBe(true);
    expect(layer.params.baseHeight).toBeCloseTo(1, 5);
    expect(layer.params.seeThrough).toBe(false);
    expect(layer.params.depthBias).toBeCloseTo(1.5, 5);
  });

  test('the cascade is scoped to enabling — turning it OFF does not re-seed', () => {
    app.engine.addLayer('rasterPlane');
    const layer = app.engine.getActiveLayer();
    layer.params.mode = 'lines';
    layer.params.horizontalLinesAsPlanes = true;
    layer.params.baseHeight = 0.7;
    layer.params.seeThrough = false;
    app.regen();
    app.ui.renderLayers();
    app.ui.buildControls();

    const cb = findCheckbox('Lines as Planes');
    expect(cb).toBeTruthy();
    cb.checked = false;
    cb.dispatchEvent(new window.Event('change'));

    // Turning it off must not clobber the user's tuned baseHeight back to the seed.
    expect(layer.params.horizontalLinesAsPlanes).toBe(false);
    expect(layer.params.baseHeight).toBeCloseTo(0.7, 5);
  });
});
