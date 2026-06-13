const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Image Surface — Curves toggle regenerates geometry (UI wiring RGR).
 *
 * The 3D algorithms bake the Curves toggle into their geometry at GENERATE time
 * (paths carry meta.straight / meta.forceCurves, which override the renderer's
 * draw-time smoothing). The generic checkbox handler used to special-case
 * `curves` to only `render()` — correct for 2D algos (curves is a draw-time
 * flag) but inert for the 3D ones, so the Image Surface Curves toggle did
 * nothing. It must `regen()` for is3d layers.
 */
describe('Image Surface — Curves toggle regenerates geometry', () => {
  let runtime, window, document, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  // Find the checkbox whose control wrapper carries the "Curves" label.
  const findCurvesCheckbox = () => {
    for (const cb of document.querySelectorAll('input[type="checkbox"]')) {
      let n = cb;
      for (let i = 0; i < 5 && n; i++) {
        n = n.parentElement;
        const lbl = n && n.querySelector && n.querySelector('.control-label');
        if (lbl && lbl.textContent.trim() === 'Curves') return cb;
      }
    }
    return null;
  };

  const curveable = (paths) => paths.filter((p) => Array.isArray(p) && p.length >= 3);

  test('toggling Curves on an Image Surface regenerates baked bézier geometry', () => {
    app.engine.addLayer('imageSurface');
    const layer = app.engine.getActiveLayer();
    layer.params.mode = 'lines';
    layer.params.curves = false;
    app.regen();
    app.ui.renderLayers();
    app.ui.buildControls();

    // Curves off → straight polylines.
    expect(layer.paths.length).toBeGreaterThan(0);
    expect(layer.paths.every((p) => p.meta && p.meta.straight === true)).toBe(true);

    const cb = findCurvesCheckbox();
    expect(cb).toBeTruthy();
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change'));

    // The toggle must have regenerated: paths now carry baked béziers, and the
    // straight flag that vetoed curving is gone. (Before the fix the handler
    // only re-rendered, so paths stayed straight and nothing curved.)
    expect(layer.params.curves).toBe(true);
    expect(curveable(layer.paths).length).toBeGreaterThan(0);
    expect(curveable(layer.paths).some((p) => p.meta && p.meta.forceCurves === true)).toBe(true);
    expect(curveable(layer.paths).every((p) => !p.meta.straight)).toBe(true);
  });

  test('toggling Curves back off regenerates straight geometry again', () => {
    app.engine.addLayer('imageSurface');
    const layer = app.engine.getActiveLayer();
    layer.params.mode = 'lines';
    layer.params.curves = true;
    app.regen();
    app.ui.renderLayers();
    app.ui.buildControls();
    expect(curveable(layer.paths).some((p) => p.meta && p.meta.forceCurves === true)).toBe(true);

    const cb = findCurvesCheckbox();
    expect(cb).toBeTruthy();
    cb.checked = false;
    cb.dispatchEvent(new window.Event('change'));

    expect(layer.params.curves).toBe(false);
    expect(layer.paths.every((p) => p.meta && p.meta.straight === true)).toBe(true);
    expect(layer.paths.some((p) => p.meta && p.meta.forceCurves)).toBe(false);
  });

  test('a 2D algorithm keeps the cheap draw-time path (Curves does not regen)', () => {
    app.engine.addLayer('flowfield');
    app.ui.renderLayers();
    app.ui.buildControls();

    let regenCount = 0;
    const orig = app.regen.bind(app);
    app.regen = (...a) => { regenCount += 1; return orig(...a); };

    const cb = findCurvesCheckbox();
    expect(cb).toBeTruthy();
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change'));

    expect(app.engine.getActiveLayer().params.curves).toBe(true);
    expect(regenCount).toBe(0); // draw-time flag → render only, no regen
  });
});
