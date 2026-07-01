/*
 * Regression: the DRAW-ORDER preview (the cyan overlay drawn while scrubbing the
 * Draw Order slider) must trace the SAME smooth curve the displayed shape uses,
 * with zero faceting, WHILE preserving the progressive "lock-step" reveal.
 *
 * The overlay traces `layer.optimizedPaths` (drawOptimizedOverlay in
 * src/render/renderer.js). Those come out of the plotter-optimization pipeline
 * (engine.js optimizeLayers). Native-cubic outlines (text glyphs, morph rings)
 * store their TRUE curve in meta.anchors and render as bezierCurveTo; the point
 * array is only a flattened cache. Three defects broke smoothness:
 *   1. simplify (linesimplify) stripped meta.anchors → overlay traced faceted
 *      lineTo segments. Fixed by the anchor-preserving skip in simplifyPaths.
 *   2. multipass offsetPath / linesort reversePath copied meta by reference
 *      without transforming the anchors → offset/reversed physical passes
 *      rendered from the ORIGINAL (un-transformed) handles, collapsing onto the
 *      base pass. Fixed in src/core/optimization-utils.js.
 *   3. the reveal was paced by the sparse chord length while the in-progress tip
 *      is sliced along the DENSE flattened arc → the last few percent of a curved
 *      glyph popped in at the fully-drawn transition. Fixed by
 *      Renderer.revealPathLength.
 *
 * Lock-step is preserved: Renderer.sliceRevealPath densely flattens the tip then
 * strips its anchors/forceCurves, so a partially-revealed curved glyph reveals as
 * a truncated dense polyline and never pops in whole.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Draw-order overlay traces smooth curves + lock-step reveal', () => {
  let runtime, window, app, engine;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = new window.Vectura.App();
    window.app = app;
    engine = app.engine;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // Count anchors that carry a real bezier handle — the exact gate
  // tracePath (renderer.js) uses to decide native-cubic vs faceted lineTo.
  const handleCount = (path) => {
    const a = path && path.meta ? path.meta.anchors : null;
    return Array.isArray(a) ? a.filter((x) => x && (x.in || x.out)).length : 0;
  };

  // A Text layer with curves ON + smoothing routes through the Catmull-Rom →
  // bezier branch (text.js), stamping meta.anchors + forceCurves even under the
  // font stub. A real opentype face produces the same anchor-bearing outline.
  function addCurvedText() {
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, {
      text: 'Oo', font: 'sans', fitToFrame: false, fontSize: 60,
      jitter: 0, curves: true, smoothing: 0.8,
    });
    return { id, layer };
  }

  test('optimizedPaths keep bezier handles + finite lineSortOrder under the default pipeline (overlay traces smooth cubics)', () => {
    const { id, layer } = addCurvedText();
    engine.generate(id);
    engine.computeAllDisplayGeometry();

    // The displayed geometry (what the base draw renders smooth) carries handles.
    const smoothSources = layer.effectivePaths.filter((p) => handleCount(p) > 0);
    expect(smoothSources.length).toBeGreaterThan(0);

    // REGRESSION: the OPTIMIZED geometry the overlay traces must carry the SAME
    // handles — else drawOptimizedOverlay → tracePath emits faceted lineTo runs.
    expect(Array.isArray(layer.optimizedPaths)).toBe(true);
    const smoothOptimized = layer.optimizedPaths.filter((p) => handleCount(p) > 0);
    expect(smoothOptimized.length).toBe(smoothSources.length);
    // line-sort still stamps a finite order the draw-order reveal + print-order
    // overlay (gradient) key on.
    smoothOptimized.forEach((p) => {
      expect(Number.isFinite(p.meta.lineSortOrder)).toBe(true);
    });

    // Both overlay branches consume THIS geometry: the gradient branch fires only
    // when there is line-sort metadata AND >1 item; the flat branch otherwise.
    // Exercise the gradient predicate so the smooth-geometry guarantee covers it.
    const renderer = app.renderer;
    const hasLineSort = layer.optimizedPaths.some((p) => renderer.hasLineSortOrderMetadata(p));
    expect(hasLineSort).toBe(true);
    expect(layer.optimizedPaths.length).toBeGreaterThan(1); // → gradient branch
    // ...and the same optimizedPaths back the flat branch too (identity), so a
    // smooth trace is guaranteed in either colouring path.
    expect(layer.optimizedPaths.every((p) => Array.isArray(p))).toBe(true);

    engine.removeLayer(id);
  });

  test('multipass offset copies carry their anchors AT the offset position (no collapse onto the base pass)', () => {
    const { id, layer } = addCurvedText();
    engine.generate(id);
    const opt = engine.ensureLayerOptimization(layer);
    const mp = opt.steps.find((s) => s.id === 'multipass');
    mp.enabled = true;
    mp.passes = 2;
    mp.offset = 3;
    mp.jitter = 0;
    mp.seed = 0;
    engine.computeAllDisplayGeometry();

    const anchored = layer.optimizedPaths.filter((p) => handleCount(p) > 0);
    // Two glyph contours × two passes = four anchored outlines.
    expect(anchored.length).toBe(4);

    // Each anchored path's first handle must sit at its OWN point[0] (within a
    // tiny epsilon). tracePath draws from the anchors, so if a translated point
    // array kept the base pass's handles, the offset copy would render at the base
    // position — visibly collapsing the two passes into one in the overlay.
    anchored.forEach((p) => {
      const a0 = p.meta.anchors[0];
      expect(Math.hypot(a0.x - p[0].x, a0.y - p[0].y)).toBeLessThan(1e-6);
    });

    // And the two passes are genuinely offset: for each glyph there exist two
    // start points separated by ~the offset distance.
    const starts = anchored.map((p) => p.meta.anchors[0]);
    const foundOffsetPair = starts.some((s1, i) =>
      starts.some((s2, j) => i !== j && Math.abs(Math.hypot(s2.x - s1.x, s2.y - s1.y) - 3) < 1e-3));
    expect(foundOffsetPair).toBe(true);

    engine.removeLayer(id);
  });

  test('reversePath reverses a native-cubic outline by swapping in/out handles (nearest sort with reverse)', () => {
    const PU = window.Vectura.OptimizationUtils;
    const forward = [
      { x: 0, y: 0 }, { x: 10, y: 0 },
    ];
    forward.meta = {
      anchors: [
        { x: 0, y: 0, in: { x: -1, y: -2 }, out: { x: 1, y: 2 } },
        { x: 10, y: 0, in: { x: 9, y: 3 }, out: { x: 11, y: -3 } },
      ],
      forceCurves: true,
      closed: false,
    };
    const rev = PU.reversePath(forward);
    // Point array reversed.
    expect(rev.map((p) => p.x)).toEqual([10, 0]);
    // Anchor order reversed, in/out swapped per vertex.
    expect(rev.meta.anchors[0].x).toBe(10);
    expect(rev.meta.anchors[0].in).toEqual({ x: 11, y: -3 }); // was vertex1.out
    expect(rev.meta.anchors[0].out).toEqual({ x: 9, y: 3 });  // was vertex1.in
    expect(rev.meta.anchors[1].in).toEqual({ x: 1, y: 2 });   // was vertex0.out
    expect(rev.meta.anchors[1].out).toEqual({ x: -1, y: -2 }); // was vertex0.in
    // Source not mutated.
    expect(forward.meta.anchors[0].in).toEqual({ x: -1, y: -2 });
  });

  test('sliceRevealPath truncates a curved glyph as a dense ANCHORLESS polyline (lock-step: no whole-glyph pop-in)', () => {
    const Renderer = window.Vectura.Renderer;
    const PU = window.Vectura.OptimizationUtils;
    const { id, layer } = addCurvedText();
    engine.generate(id);
    engine.computeAllDisplayGeometry();

    const full = (layer.optimizedPaths || []).find((p) => handleCount(p) > 0);
    expect(full).toBeTruthy();

    // Pace against the SAME dense arc the tip is sliced along (micro-pop fix):
    // the reveal length must exceed the sparse chord length.
    const chordLen = PU.pathLength(full);
    const arcLen = Renderer.revealPathLength(full);
    expect(arcLen).toBeGreaterThan(chordLen);

    const tip = Renderer.sliceRevealPath(full, arcLen * 0.5);
    expect(Array.isArray(tip)).toBe(true);
    // Dense: far more points than the sparse anchor list would trace as chords.
    expect(tip.length).toBeGreaterThan(2);
    // Lock-step: the in-progress tip must NOT carry curve handles, or it would
    // pop in as a whole native-cubic glyph while straight glyphs reveal gradually.
    expect(tip.meta.anchors).toBeUndefined();
    expect(tip.meta.forceCurves).toBeUndefined();
    expect(tip.meta.straight).toBe(true);
    // Truncated strictly shorter than the full arc.
    expect(PU.pathLength(tip)).toBeLessThan(arcLen);
    // The source path is untouched — still a smooth native-cubic outline.
    expect(handleCount(full)).toBeGreaterThan(0);

    engine.removeLayer(id);
  });
});
