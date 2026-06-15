const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Raster-Plane — universal output controls reach the display geometry.
 *
 * Smoothing and Simplify are engine-level post-projection passes applied in the
 * display-geometry pipeline (smoothPath / simplifyPath). Raster-Plane used to
 * force-zero Smoothing (`algorithmOwnsSmoothing`) AND its "Map Blur" slider
 * collided on the same `smoothing` param id, so the universal Smoothing slider
 * was dead. With Map Blur moved to its own `mapBlur` id and the override removed,
 * both Smoothing and Simplify must now visibly reshape the rendered geometry.
 */
describe('Raster-Plane — Smoothing & Simplify reach display geometry', () => {
  let runtime, window, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const snapshot = (paths) => JSON.stringify(paths.map((p) => p.map((pt) => [Math.round(pt.x * 100), Math.round(pt.y * 100)])));

  const addLayer = (params) => {
    app.engine.addLayer('rasterPlane');
    const layer = app.engine.getActiveLayer();
    Object.assign(layer.params, { mode: 'lines', rows: 16, sampleDetail: 40, amplitude: 24, artworkSize: 150, ...params });
    app.regen();
    return layer;
  };

  test('Smoothing changes the projected line geometry', () => {
    const layer = addLayer({ smoothing: 0 });
    const sharp = snapshot(layer.paths);
    layer.params.smoothing = 1;
    app.regen();
    const smooth = snapshot(layer.paths);
    expect(smooth).not.toBe(sharp);
  });

  test('Simplify reduces the point count of the display geometry', () => {
    const layer = addLayer({ simplify: 0 });
    const fullPoints = layer.stats.simplifiedPoints;
    layer.params.simplify = 1;
    app.regen();
    expect(layer.stats.simplifiedPoints).toBeLessThan(fullPoints);
  });
});
