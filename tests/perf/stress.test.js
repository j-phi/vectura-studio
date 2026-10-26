const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Performance and stress checks', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test(
    'optimization pipeline handles large synthetic path sets',
    () => {
      const { VectorEngine } = runtime.window.Vectura;
      const engine = new VectorEngine();
      engine.addLayer('wavetable');
      const layer = engine.getActiveLayer();

      const paths = [];
      for (let i = 0; i < 2500; i++) {
        const baseY = i * 0.05;
        const path = [];
        for (let j = 0; j < 14; j++) {
          path.push({ x: j * 2.2, y: baseY + Math.sin(j * 0.4) });
        }
        paths.push(path);
      }
      layer.paths = paths;

      const start = Date.now();
      engine.optimizeLayers([layer], {
        config: {
          bypassAll: false,
          steps: [
            { id: 'linesimplify', enabled: true, bypass: false, tolerance: 0.2, mode: 'polyline' },
            { id: 'linesort', enabled: true, bypass: false, method: 'nearest', direction: 'none', grouping: 'layer' },
            { id: 'filter', enabled: true, bypass: false, minLength: 1, maxLength: 0, removeTiny: true },
          ],
        },
      });
      const elapsedMs = Date.now() - start;

      expect(Array.isArray(layer.optimizedPaths)).toBe(true);
      expect(layer.optimizedPaths.length).toBeGreaterThan(1000);
      expect(elapsedMs).toBeLessThan(10000);
    },
    30000
  );

  test(
    'high-density flowfield generation finishes under stress budget',
    () => {
      const { VectorEngine } = runtime.window.Vectura;
      const engine = new VectorEngine();
      const id = engine.addLayer('flowfield');
      const layer = engine.layers.find((item) => item.id === id);

      layer.params.density = 450;
      layer.params.maxSteps = 80;
      layer.params.minSteps = 2;
      layer.params.stepLen = 3.2;
      layer.params.noiseScale = 0.008;
      layer.params.chaos = 0.2;
      layer.params.seed = 9191;

      const start = Date.now();
      engine.generate(id);
      const elapsedMs = Date.now() - start;

      expect((layer.paths || []).length).toBeGreaterThan(50);
      expect(elapsedMs).toBeLessThan(10000);
    },
    30000
  );

  // Pen models: the ink renderer's ribbon build is time-budgeted per frame
  // and refines on idle; a dense scene (200 m of line) at 8 px/mm must never
  // block a frame on building every ribbon, must settle (no rebuild thrash)
  // and must stay within the cache's byte cap.
  describe('ink renderer ribbons (pen models)', () => {
    const scene = () => {
      const paths = [];
      let total = 0;
      for (let i = 0; total < 200000; i += 1) {
        const p = [];
        for (let j = 0; j <= 400; j += 1) {
          const x = 10 + j * 0.5;
          const y = 10 + (i % 280) * 0.7 + Math.sin(j / 7 + i) * 2;
          if (j) total += Math.hypot(x - p[j - 1].x, y - p[j - 1].y);
          p.push({ x, y });
        }
        paths.push(p);
      }
      return { paths, total };
    };
    const fakeCanvas = () => {
      const c = { width: 1600, height: 1000 };
      const ctx = new Proxy({ canvas: c }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
      c.getContext = () => ctx;
      return c;
    };

    test('200 m at 8 px/mm: frames stay within the build budget, idle refinement settles, bytes capped', () => {
      const V = runtime.window.Vectura;
      const IR = V.InkRenderer;
      IR.clearCache();
      const pen = V.PenModel.applyModel({ id: 'perf-pen', name: 'P', color: '#111111', width: 0.4 }, 'sharpie-ultra-fine');
      const t = V.PenModel.resolveTraits(pen, V.Paper.forType('cold-press'), V.PAPERS.TYPES['cold-press']);
      const pxPerMm = 8;
      t.tier = 2; // force the ribbon (worst case)
      const { paths, total } = scene();
      expect(total).toBeGreaterThanOrEqual(200000);
      const plan = { collect: new Map([['perf-pen', paths.map((path) => ({ path, useCurves: false, weightScale: 1 }))]]), penTraits: new Map([['perf-pen', t]]) };
      const scratch = fakeCanvas(); const target = fakeCanvas().getContext('2d');
      const host = {
        m: { a: pxPerMm, b: 0, c: 0, d: pxPerMm, e: 0, f: 0 }, pxPerMm,
        view: { x: 0, y: 0, w: 400, h: 400 }, pens: [pen],
        scratch: () => scratch, translucent: target, opaque: () => target,
        traceItem: () => {}, onReady: null,
      };
      const t0 = Date.now();
      IR.renderCollected(plan, host);
      const firstMs = Date.now() - t0;
      const st = IR.cacheStats();
      const L = V.PEN_MODELS.LIMITS;
      // The first frame builds within its budgets and queues the rest.
      expect(st.buildMs).toBeLessThan(L.buildBudgetMs + 250);
      expect(st.queued).toBeGreaterThan(0);
      expect(firstMs).toBeLessThan(5000);
      // Idle refinement (flushed here) settles: the next frames are all hits.
      const tb = Date.now();
      IR.flush();
      const buildAllMs = Date.now() - tb;
      IR.renderCollected(plan, host);
      const builds = IR.cacheStats().builds;
      IR.renderCollected(plan, host);
      expect(IR.cacheStats().builds).toBe(builds);
      expect(IR.cacheStats().queued).toBe(0);
      expect(IR.cacheStats().bytes).toBeLessThanOrEqual(L.ribbonHardBytes);
      // Throughput floor: the whole 200 m ribbon set builds in well under a
      // minute even on a slow CI runner (local ≈ 1–3 s).
      expect(buildAllMs).toBeLessThan(60000);
      IR.clearCache();
    }, 120000);
  });
});
