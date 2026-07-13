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
 * Raster-Plane used to force-zero Smoothing (`algorithmOwnsSmoothing`) AND its
 * "Map Blur" slider collided on the same `smoothing` param id, so the universal
 * Smoothing slider was dead. With Map Blur moved to its own `mapBlur` id and the
 * override removed, both Smoothing and Simplify must visibly reshape the
 * rendered geometry. That is what this pins, and it still holds.
 *
 * The MECHANISM changed, so the assertion had to. Smoothing used to reshape by
 * running a Laplacian pass (GeometryUtils.smoothPath) that physically MOVED the
 * projected sample points — lossy, and nothing to do with curves. It now fits
 * real béziers, whose defining property is that they move the HANDLES and never
 * the sample points. Comparing raw point coordinates therefore reports "no
 * change" for a curve that is visibly, correctly different.
 *
 * So compare the geometry that is actually DRAWN — the flattened display curve,
 * via the same PathDraw the canvas and the SVG exporter use. That is mechanism-
 * agnostic: it would have caught the original dead-slider bug too, and it cannot
 * be fooled by a smoothing implementation that leaves the control points alone.
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

  // The curve as DRAWN, not the control points it is defined by.
  const drawnSnapshot = (layer) => {
    const { PathDraw } = window.Vectura;
    const useCurves = Boolean(layer.params.curves);
    return JSON.stringify(layer.paths.map((p) => {
      const drawn = PathDraw.isVerbatim(p) ? p : PathDraw.toPolyline(p, { useCurves }, 0.05);
      return (drawn.length ? drawn : p).map((pt) => [Math.round(pt.x * 100), Math.round(pt.y * 100)]);
    }));
  };

  const addLayer = (params) => {
    app.engine.addLayer('rasterPlane');
    const layer = app.engine.getActiveLayer();
    Object.assign(layer.params, { mode: 'lines', rows: 16, sampleDetail: 40, amplitude: 24, artworkSize: 150, ...params });
    app.regen();
    return layer;
  };

  test('Smoothing changes the projected line geometry', () => {
    const layer = addLayer({ smoothing: 0 });
    const sharp = drawnSnapshot(layer);
    layer.params.smoothing = 1;
    app.regen();
    const smooth = drawnSnapshot(layer);
    expect(smooth).not.toBe(sharp);
  });

  // Guard the mechanism itself: smoothing must bend the line, not relocate the
  // projected samples. If a future change reintroduces a point-moving smoother,
  // this fails even though the test above would still pass.
  test('Smoothing bends the line without moving the projected sample points', () => {
    const layer = addLayer({ smoothing: 0 });
    const controlPoints = JSON.stringify(layer.paths.map((p) => p.map((pt) => [Math.round(pt.x * 100), Math.round(pt.y * 100)])));

    layer.params.smoothing = 1;
    app.regen();

    const movedPoints = JSON.stringify(layer.paths.map((p) => p.map((pt) => [Math.round(pt.x * 100), Math.round(pt.y * 100)])));
    expect(movedPoints).toBe(controlPoints);

    const curved = layer.paths.some((p) => {
      const anchors = p.meta && p.meta.anchors;
      return Array.isArray(anchors) && anchors.some((a) => a && (a.in || a.out));
    });
    expect(curved).toBe(true);
  });

  test('Simplify reduces the point count of the display geometry', () => {
    const layer = addLayer({ simplify: 0 });
    const fullPoints = layer.stats.simplifiedPoints;
    layer.params.simplify = 1;
    app.regen();
    expect(layer.stats.simplifiedPoints).toBeLessThan(fullPoints);
  });
});
