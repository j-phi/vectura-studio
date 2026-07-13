/**
 * Regression: the universal Simplify slider must not destroy bezier anchors.
 *
 * `engine.generate()`'s simplify pass (engine.js) runs simplifyPathVisvalingam /
 * simplifyPath over every path. Both call GeometryUtils.stripCurveMeta, which
 * deletes `meta.anchors` — so any path whose TRUE geometry lives in its handles
 * (text glyphs, morph rings, curve shapes) was degraded to a faceted polyline
 * the moment the slider left zero. The point array is only a flattened cache;
 * the handle list is already the compact representation.
 *
 * The export-optimization `linesimplify` step already guarded against exactly
 * this; the display pass did not. This pins the guard on the display pass.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const hasHandles = (path) => {
  const anchors = path?.meta?.anchors;
  return Array.isArray(anchors) && anchors.some((a) => a && (a.in || a.out));
};

describe('universal Simplify preserves bezier anchors', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  // Drive the real cascade (ALGO_DEFAULTS -> factory preset -> Layer merge),
  // not a bare algo.generate(params) call, which would supply the very values
  // under test.
  const buildCurvedTextLayer = () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    layer.params.curves = true;
    layer.params.smoothing = 0.6;
    layer.params.simplify = 0;
    engine.generate(id);
    return { engine, id, layer };
  };

  test('a curved text layer has glyph paths carrying bezier handles', () => {
    const { engine, id } = buildCurvedTextLayer();
    const layer = engine.layers.find((l) => l.id === id);
    const curved = layer.paths.filter(hasHandles);
    expect(curved.length).toBeGreaterThan(0);
  });

  test('simplify > 0 keeps those handles instead of stripping them', () => {
    const { engine, id, layer } = buildCurvedTextLayer();
    const before = engine.layers.find((l) => l.id === id).paths.filter(hasHandles).length;

    layer.params.simplify = 0.5;
    engine.generate(id);

    const after = engine.layers.find((l) => l.id === id).paths.filter(hasHandles).length;
    expect(after).toBe(before);
  });

  // The guard must be narrow: it skips paths whose geometry lives in handles,
  // NOT every path. A handle-less polyline still has to decimate, or the fix
  // would have quietly turned the Simplify slider off for the whole app.
  test('simplify still decimates plain polylines that carry no handles', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('flowfield');
    const layer = engine.layers.find((l) => l.id === id);
    layer.params.simplify = 0;
    engine.generate(id);

    const points = () => engine.layers
      .find((l) => l.id === id)
      .paths.reduce((n, p) => n + p.length, 0);

    const before = points();
    expect(engine.layers.find((l) => l.id === id).paths.some(hasHandles)).toBe(false);

    layer.params.simplify = 1;
    engine.generate(id);

    expect(points()).toBeLessThan(before * 0.9);
  });
});
