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
});
