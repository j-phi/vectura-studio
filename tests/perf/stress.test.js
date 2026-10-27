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

  // Review item 6: plain pens on realistic paper must cost what the
  // pre-pen-model path cost. The base-equivalent path is the same renderer
  // with the ink plan's pen traits bypassed (plain pens stroke natively into
  // the paper ink canvas, exactly as before pen models). JS-side only:
  // canvas raster is deferred and measured in the browser (see CHANGELOG).
  describe('plain pens on realistic paper vs the base-equivalent path', () => {
    let rt; let app; let r; let V;
    class Mat {
      constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) { Object.assign(this, { a, b, c, d, e, f }); }
      multiply(m) { return new Mat(this.a * m.a + this.c * m.b, this.b * m.a + this.d * m.b, this.a * m.c + this.c * m.d, this.b * m.c + this.d * m.d, this.a * m.e + this.c * m.f + this.e, this.b * m.e + this.d * m.f + this.f); }
      translate(x, y) { return this.multiply(new Mat(1, 0, 0, 1, x, y)); }
      scale(sx, sy = sx) { return this.multiply(new Mat(sx, 0, 0, sy, 0, 0)); }
    }
    // Counting 2D context: tracks the transform and counts full-canvas composites.
    const countingCtx = (canvas, counts) => {
      let m = new Mat(); const stack = [];
      const st = { globalAlpha: 1, globalCompositeOperation: 'source-over' };
      const ctx = {
        canvas,
        getTransform: () => new Mat(m.a, m.b, m.c, m.d, m.e, m.f),
        setTransform: (a, b, c, d, e, f) => { m = typeof a === 'object' ? new Mat(a.a, a.b, a.c, a.d, a.e, a.f) : new Mat(a, b, c, d, e, f); },
        resetTransform: () => { m = new Mat(); },
        translate: (x, y) => { m = m.translate(x, y); },
        scale: (x, y) => { m = m.scale(x, y); },
        save: () => stack.push({ m, s: { ...st } }),
        restore: () => { const top = stack.pop(); if (top) { m = top.m; Object.assign(st, top.s); } },
        drawImage: (img) => { if (img && img.width >= canvas.width / 2) counts.composites += 1; },
        createPattern: () => ({ setTransform() {} }),
        measureText: (t = '') => ({ width: String(t).length * 7 }),
        getLineDash: () => [],
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
        isPointInPath: () => false,
        isPointInStroke: () => false,
        fill: () => { counts.fills += 1; },
        stroke: () => { counts.strokes += 1; },
      };
      return new Proxy(ctx, {
        get(t, k) { if (k in t) return t[k]; if (k in st) return st[k]; return () => {}; },
        set(t, k, v) { if (k in st) st[k] = v; else t[k] = v; return true; },
      });
    };
    const counts = { composites: 0, fills: 0, strokes: 0 };

    beforeAll(async () => {
      rt = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true });
      rt.window.DOMMatrix = Mat;
      // jsdom has no Path2D: a no-op one lets the renderer cache combined
      // paths as it does in a browser (otherwise every frame replays geometry).
      if (typeof rt.window.Path2D !== 'function') {
        rt.window.Path2D = class { moveTo() {} lineTo() {} arc() {} ellipse() {} closePath() {} rect() {} addPath() {} quadraticCurveTo() {} bezierCurveTo() {} };
      }
      V = rt.window.Vectura;
      app = new V.App();
      r = app.renderer;
      r.canvas.width = 1600; r.canvas.height = 1000; r.ready = true;
      r._paperScratch = (name, down = 1) => {
        const c = r[name] && r[name].width === 1600 / down ? r[name] : { width: 1600 / down, height: 1000 / down };
        if (!c.ctx) { c.ctx = countingCtx(c, counts); c.getContext = () => c.ctx; }
        r[name] = c;
        return c;
      };
      const L = new V.Layer('perf-ink', 'expanded', 'Ink');
      const paths = [];
      for (let i = 0; i < 400; i += 1) {
        const p = [];
        for (let j = 0; j <= 300; j += 1) p.push({ x: 10 + j * 0.6, y: 10 + i * 0.6 + Math.sin(j / 7 + i) * 2 });
        paths.push(p);
      }
      L.paths = paths; L.effectivePaths = paths; L.penId = 'pen-plain'; L.visible = true;
      app.engine.layers = [L];
      V.SETTINGS.pens = [{ id: 'pen-plain', name: 'Plain', color: '#111111', width: 0.4 }];
      V.Paper.setActive(V.Paper.forType('cold-press'));
    });
    afterAll(() => rt?.cleanup?.());

    const frame = () => {
      const prev = r.ctx; r.ctx = countingCtx(r.canvas, counts);
      try { r.draw(); } finally { r.ctx = prev; }
    };
    const measure = (n) => {
      Object.assign(counts, { composites: 0, fills: 0, strokes: 0 });
      const t0 = Date.now();
      for (let i = 0; i < n; i += 1) frame();
      return { ms: (Date.now() - t0) / n, ...counts };
    };

    test('at fit and at 40 px/mm: no extra full-canvas composite and bounded JS cost', () => {
      const orig = r._paperInkPlan;
      const bypass = function bypassed() { const p = orig.call(this); if (p) p.penTraits = null; return p; };
      [2.5, 20].forEach((scale) => { // ≈ fit, and 40 device px / mm at DPR 2
        r.scale = scale; r.offsetX = -scale * 20; r.offsetY = -scale * 20;
        r._paperInkPlan = orig; V.InkRenderer.clearCache();
        frame(); V.InkRenderer.flush(); frame(); // warm: cache built
        const withInk = measure(6);
        r._paperInkPlan = bypass;
        frame();
        const base = measure(6);
        r._paperInkPlan = orig;
        // Same number of full-canvas composites as the base path (no per-pen
        // scratch, no second ink composite).
        expect(withInk.composites, `scale ${scale}`).toBe(base.composites);
        // JS cost: within 3x of the base path's (+ a small constant for the
        // ribbon lookup) — a per-pen scratch / rebuild per frame blows this.
        expect(withInk.ms, `scale ${scale}: ${withInk.ms} vs ${base.ms} ms`).toBeLessThan(base.ms * 3 + 40);
      });
      // Witness: the zoomed-in frame really used the ribbon (fills, no stroke).
      r.scale = 20; frame();
      const t = V.PenModel.resolveTraits(V.SETTINGS.pens[0], V.Paper.effective(), V.PAPERS.TYPES['cold-press']);
      expect(V.InkRenderer.tierFor(t, 20 * (r.getBackingDpr ? r.getBackingDpr() : 1))).toBe(2);
    }, 120000);
  });
});
