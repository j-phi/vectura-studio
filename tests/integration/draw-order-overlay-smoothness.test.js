/*
 * Regression: the DRAW ORDER preview (cyan overlay shown while scrubbing the
 * Draw Order slider) must trace the SAME smooth curve the displayed shape
 * renders — no faceting — while still revealing progressively (lock-step): a
 * curved glyph must NOT pop in whole while straight glyphs beside it reveal.
 *
 * Two defects, two guards:
 *  (A) The plotter optimization pipeline's `linesimplify` step stripped the
 *      bezier handles (meta.anchors) from every path, so `layer.optimizedPaths`
 *      — what the overlay traces — were anchor-less polylines that tracePath
 *      drew as lineTo segments. Fixed in engine.js simplifyPaths (anchored
 *      paths pass through untouched). Guard: optimizedPaths retain their
 *      handles + lineSortOrder.
 *  (B) The single in-progress path is truncated by Renderer.sliceRevealPath,
 *      which sliced the sparse chord cache → a faceted tip. Fixed by densely
 *      flattening the smooth curve (GeometryUtils.flattenSmoothedPath) BEFORE
 *      slicing. Guard: the truncated tip is dense (many more points than the
 *      sparse cache) AND still a partial polyline with no anchors (lock-step).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const arcLength = (arr) => {
  let s = 0;
  for (let i = 1; i < arr.length; i++) s += Math.hypot(arr[i].x - arr[i - 1].x, arr[i].y - arr[i - 1].y);
  return s;
};
const hasHandles = (p) => Array.isArray(p?.meta?.anchors)
  && p.meta.anchors.some((a) => a && (a.in || a.out));

describe('Draw-order overlay smoothness + lock-step reveal', () => {
  let runtime, window, app, layer;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = new window.Vectura.App();
    window.app = app;
    const engine = app.engine;
    const id = engine.addLayer('text');
    layer = engine.layers.find((l) => l.id === id);
    // curves:true + smoothing>0 routes glyph outlines through the Catmull-Rom →
    // bezier branch, producing meta.anchors + forceCurves even under the jsdom
    // stub font (font-independent). A real opentype face yields the same shape.
    Object.assign(layer.params, {
      text: 'Oo', font: 'sans', fitToFrame: false, fontSize: 60, jitter: 0, curves: true, smoothing: 0.8,
    });
    engine.generate(id);
    engine.computeAllDisplayGeometry?.();
  });

  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  test('source display geometry carries real bezier handles', () => {
    expect(layer.effectivePaths.length).toBeGreaterThan(0);
    layer.effectivePaths.forEach((p) => expect(hasHandles(p)).toBe(true));
  });

  test('(A) optimizedPaths preserve the bezier handles + lineSortOrder', () => {
    expect(layer.optimizedPaths.length).toBeGreaterThan(0);
    layer.optimizedPaths.forEach((p) => {
      // Before the fix these anchors were stripped by linesimplify → the whole
      // cyan run rendered faceted.
      expect(hasHandles(p)).toBe(true);
      expect(Number.isFinite(p.meta.lineSortOrder)).toBe(true);
    });
  });

  test('(B) sliceRevealPath yields a dense, smooth, still-partial tip', () => {
    const p = layer.effectivePaths[0];
    const total = arcLength(p);
    const revealLen = total * 0.5;

    // Baseline: how many source vertices the OLD (sparse) slice would have kept.
    let acc = 0;
    let sparseCount = 1;
    for (let i = 1; i < p.length; i++) {
      const seg = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      if (acc + seg >= revealLen) { sparseCount++; break; }
      sparseCount++;
      acc += seg;
    }

    const tip = window.Vectura.Renderer.sliceRevealPath(p, revealLen);

    // Smoothness: the flattened tip is markedly denser than the sparse cache.
    expect(tip.length).toBeGreaterThan(sparseCount * 1.2);
    // It went through the dense-flatten path (finalizeFlattened tags straight).
    expect(tip.meta.straight).toBe(true);
    // Lock-step: the tip is a TRUNCATED polyline — no anchors/forceCurves, so a
    // curved glyph can never pop in whole via bezierCurveTo.
    expect(tip.meta.anchors).toBeUndefined();
    expect(tip.meta.forceCurves).toBeUndefined();
    // It is genuinely partial, not the whole contour.
    expect(arcLength(tip)).toBeLessThan(total);
  });
});
