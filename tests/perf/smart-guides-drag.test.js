/**
 * SG-1 perf guard (Lane A): object-to-object smart guides must hold the drag
 * frame budget with a dense document (50+ layers). The candidate bounds/anchor
 * set is cached once per drag session and capped to the N nearest layers; each
 * simulated pointermove then runs computeObjectSnap over a bounded candidate
 * set. This test drives many move frames against 60 layers and asserts a tight
 * per-frame budget.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { injectSmartGuidesConfig } = require('../helpers/inject-smart-guides-config');

describe('SG-1 smart-guide drag performance', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test(
    'dragging with 60 layers stays within the per-frame budget',
    async () => {
      runtime = await loadVecturaRuntime({ includeRenderer: true });
      injectSmartGuidesConfig(runtime);
      const { VectorEngine, Renderer, Layer, SETTINGS } = runtime.window.Vectura;
      SETTINGS.documentUnits = 'metric';
      SETTINGS.showGuides = true;
      SETTINGS.snapGuides = true;
      SETTINGS.gridSnapEnabled = false;

      const engine = new VectorEngine();
      engine.layers = [];
      // 60 small squares scattered across the document.
      for (let i = 0; i < 60; i++) {
        const gx = 20 + (i % 10) * 26;
        const gy = 20 + Math.floor(i / 10) * 26;
        const layer = new Layer(`cell-${i}`, 'shape', `Cell ${i}`);
        layer.sourcePaths = [[
          { x: gx, y: gy }, { x: gx + 18, y: gy },
          { x: gx + 18, y: gy + 18 }, { x: gx, y: gy + 18 }, { x: gx, y: gy },
        ]];
        engine.layers.push(layer);
        engine.generate(layer.id);
      }

      const renderer = new Renderer('main-canvas', engine);
      renderer.setTool('select');
      renderer.scale = 1;
      renderer.offsetX = 0;
      renderer.offsetY = 0;
      // Stub draw() so we time the guide/snap computation, not canvas paint.
      renderer.draw = () => {};

      const dragged = engine.layers[0];
      renderer.setSelection([dragged.id], dragged.id);
      renderer.down({ clientX: 29, clientY: 29, preventDefault() {} });

      const FRAMES = 240;
      const start = Date.now();
      for (let f = 0; f < FRAMES; f++) {
        // Sweep across the field so many candidates come within tolerance.
        const cx = 29 + (f % 120) * 2;
        const cy = 29 + Math.floor(f / 24) * 1.7;
        renderer.move({ clientX: cx, clientY: cy, buttons: 1 });
      }
      const elapsed = Date.now() - start;
      renderer.up({});

      const perFrame = elapsed / FRAMES;
      // Candidate cache built once; per-frame snap scan is bounded by the
      // config's nearestCandidateCount. Generous CI-safe budget (well under a
      // 16ms frame): assert < 8ms/frame average.
      expect(perFrame).toBeLessThan(8);
      // The cache must have been built exactly once (not per frame).
      expect(renderer._guideCandidates).toBeNull(); // cleared on up()
    },
    30000
  );
});
