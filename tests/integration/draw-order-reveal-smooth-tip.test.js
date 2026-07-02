/*
 * Regression (implementer-2 angle — sliceRevealPath / applyReveal): the cyan
 * DRAW-ORDER preview must trace the SAME smooth curve the displayed shape
 * renders — including its IN-PROGRESS tip — while still revealing in lock-step
 * (a curved glyph must NOT pop in whole while straight glyphs beside it reveal).
 *
 * Native-cubic outlines (text glyphs, morph rings) store their TRUE curve in
 * meta.anchors and draw via bezierCurveTo; the point array is only a sparse
 * chord cache. Four coordinated fixes keep the whole cyan run — body AND tip —
 * smooth without breaking lock-step:
 *   1. engine.simplifyPaths passes anchor-bearing paths through untouched, so
 *      layer.optimizedPaths (what the overlay traces) keep their handles.
 *   2. Renderer.sliceRevealPath densely flattens the smooth curve
 *      (GeometryUtils.flattenSmoothedPath) BEFORE arc-length truncation, then
 *      strips anchors/forceCurves and tags meta.straight — a dense, smooth,
 *      still-partial tip that cannot pop in whole.
 *   3. Renderer.revealPathLength paces the reveal along that SAME dense arc, so
 *      the tip reaches 100% exactly at the fully-drawn handoff (no tail pop).
 *   4. OptimizationUtils.offsetPath / reversePath transform the anchors so
 *      multipass-offset and reversed line-sort passes render at the right place.
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
  for (let i = 1; i < arr.length; i++) {
    s += Math.hypot(arr[i].x - arr[i - 1].x, arr[i].y - arr[i - 1].y);
  }
  return s;
};
// The exact gate tracePath uses to pick native-cubic vs. faceted lineTo.
const handleCount = (p) => {
  const a = p && p.meta ? p.meta.anchors : null;
  return Array.isArray(a) ? a.filter((x) => x && (x.in || x.out)).length : 0;
};

describe('Draw-order reveal: smooth tip + lock-step (sliceRevealPath / applyReveal)', () => {
  let runtime, window, app, engine, layer, id;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = new window.Vectura.App();
    window.app = app;
    engine = app.engine;
    id = engine.addLayer('text');
    layer = engine.layers.find((l) => l.id === id);
    // curves:true + smoothing>0 routes glyph outlines through the Catmull-Rom →
    // bezier branch (text.js), stamping meta.anchors + forceCurves even under the
    // jsdom stub font (font-independent). A real opentype face yields the same.
    Object.assign(layer.params, {
      text: 'Oo', font: 'sans', fitToFrame: false,
      fontSize: 60, jitter: 0, curves: true, smoothing: 0.8,
    });
    engine.generate(id);
    engine.computeAllDisplayGeometry();
  });

  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  test('(1) optimizedPaths keep bezier handles + finite lineSortOrder (whole cyan run is smooth)', () => {
    const smoothSources = layer.effectivePaths.filter((p) => handleCount(p) > 0);
    expect(smoothSources.length).toBeGreaterThan(0);
    const smoothOptimized = layer.optimizedPaths.filter((p) => handleCount(p) > 0);
    // REGRESSION: before the simplifyPaths skip, linesimplify stripped these
    // anchors → the overlay traced faceted lineTo segments.
    expect(smoothOptimized.length).toBe(smoothSources.length);
    smoothOptimized.forEach((p) => {
      expect(Number.isFinite(p.meta.lineSortOrder)).toBe(true);
    });
  });

  test('(2) sliceRevealPath tip is DENSE, smooth, anchor-less + still partial (lock-step)', () => {
    const Renderer = window.Vectura.Renderer;
    const full = layer.effectivePaths.find((p) => handleCount(p) > 0);
    expect(full).toBeTruthy();

    const arcLen = Renderer.revealPathLength(full);
    const revealLen = arcLen * 0.5;

    // How many source vertices the OLD sparse slice would have kept.
    let acc = 0;
    let sparseCount = 1;
    for (let i = 1; i < full.length; i++) {
      const seg = Math.hypot(full[i].x - full[i - 1].x, full[i].y - full[i - 1].y);
      if (acc + seg >= revealLen) { sparseCount++; break; }
      sparseCount++;
      acc += seg;
    }

    const tip = Renderer.sliceRevealPath(full, revealLen);
    expect(Array.isArray(tip)).toBe(true);
    // Smoothness: the flattened tip is markedly denser than the sparse cache.
    expect(tip.length).toBeGreaterThan(sparseCount * 1.2);
    // It went through the dense-flatten path (finalizeFlattened tags straight).
    expect(tip.meta.straight).toBe(true);
    // Lock-step: no curve handles on the tip → it can never pop in whole.
    expect(tip.meta.anchors).toBeUndefined();
    expect(tip.meta.forceCurves).toBeUndefined();
    // Genuinely partial, not the whole contour.
    expect(arcLength(tip)).toBeLessThan(arcLen);
    // Source path untouched — still a smooth native-cubic outline.
    expect(handleCount(full)).toBeGreaterThan(0);
  });

  test('(3) reveal is paced along the same dense arc — no tail pop at full-draw handoff', () => {
    const Renderer = window.Vectura.Renderer;
    const PU = window.Vectura.OptimizationUtils;
    const full = layer.effectivePaths.find((p) => handleCount(p) > 0);

    const chordLen = PU.pathLength(full);
    const arcLen = Renderer.revealPathLength(full);
    // The reveal record's `length:` (revealPathLength) must be the DENSE arc the
    // tip is sliced along — strictly longer than the sparse chord cache. If it
    // were the chord length the pen would "reach 100%" a few percent early and
    // the tail would snap to the full native cubic.
    expect(arcLen).toBeGreaterThan(chordLen);

    // Slicing at exactly the paced length returns the FULL dense polyline (the
    // cutoff is never reached), so the tip → fully-drawn transition is seamless.
    const atEnd = Renderer.sliceRevealPath(full, arcLen);
    expect(Math.abs(arcLength(atEnd) - arcLen)).toBeLessThan(1e-6);
  });

  test('(4) multipass offset + reverse transform the anchors, not just the points', () => {
    const PU = window.Vectura.OptimizationUtils;

    // offsetPath: anchors translate with the point array (no collapse onto base).
    const base = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    base.meta = {
      anchors: [
        { x: 0, y: 0, in: null, out: { x: 3, y: 4 } },
        { x: 10, y: 0, in: { x: 7, y: -4 }, out: null },
      ],
      forceCurves: true, closed: false,
    };
    const off = PU.offsetPath(base, 5, -2);
    expect(off.meta).not.toBe(base.meta); // cloned, not shared by reference
    expect(off.meta.anchors[0].x).toBe(5);
    expect(off.meta.anchors[0].out).toEqual({ x: 8, y: 2 });
    expect(off.meta.anchors[1].in).toEqual({ x: 12, y: -6 });
    // The handle sits at the offset vertex → tracePath draws the copy offset.
    expect(Math.hypot(off.meta.anchors[0].x - off[0].x,
      off.meta.anchors[0].y - off[0].y)).toBeLessThan(1e-6);
    expect(base.meta.anchors[0].x).toBe(0); // source untouched

    // reversePath: anchor order reversed AND in/out swapped per vertex. The
    // reversed vertex's INCOMING handle is the old OUTGOING handle, and vice-versa.
    const rev = PU.reversePath(base);
    expect(rev.map((p) => p.x)).toEqual([10, 0]);
    expect(rev.meta.anchors[0].x).toBe(10);                   // old v1 first now
    expect(rev.meta.anchors[0].in).toBeNull();               // v1.out was null
    expect(rev.meta.anchors[0].out).toEqual({ x: 7, y: -4 }); // was v1.in
    expect(rev.meta.anchors[1].in).toEqual({ x: 3, y: 4 });   // was v0.out
    expect(rev.meta.anchors[1].out).toBeNull();               // v0.in was null
    expect(base.meta.anchors[1].in).toEqual({ x: 7, y: -4 }); // source untouched
  });
});
