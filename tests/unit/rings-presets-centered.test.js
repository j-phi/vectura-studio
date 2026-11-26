const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Every Rings preset must sit centered on the canvas.
 *
 * Two presets (Cybersigil, No Moon) once shipped with offsetX/offsetY of
 * (-83, 23), which pushed the rings off-center. This applies each preset the
 * way the preset picker does (ALGO_DEFAULTS + preset params), generates the
 * layer, and checks the ring center offset is zero and the drawn geometry's
 * bounding-box center stays near the canvas center (organic ring drift (a few mm, varying run to run) moves
 * the box a little, so that check is loose).
 */
describe('rings presets are centered on the canvas', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const ringPresets = () => runtime.window.Vectura.PRESETS.filter((p) => p.preset_system === 'rings');

  test('there are rings presets to check', () => {
    expect(ringPresets().length).toBeGreaterThan(0);
  });

  test('no rings preset offsets the ring center', () => {
    const offenders = ringPresets()
      .filter((p) => (p.params?.offsetX ?? 0) !== 0 || (p.params?.offsetY ?? 0) !== 0)
      .map((p) => p.id);
    expect(offenders).toEqual([]);
  });

  test('each preset draws geometry whose bounding-box center is near the canvas center', () => {
    const { VectorEngine, ALGO_DEFAULTS } = runtime.window.Vectura;
    const measured = [];
    for (const preset of ringPresets()) {
      const engine = new VectorEngine();
      const id = engine.addLayer('rings');
      const layer = engine.getLayerById(id);
      layer.params = { ...JSON.parse(JSON.stringify(ALGO_DEFAULTS.rings)), ...(preset.params || {}), preset: preset.id };
      engine.generate(id);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const path of layer.paths || []) {
        const pts = Array.isArray(path) ? path : path.points || [];
        for (const pt of pts) {
          if (!Number.isFinite(pt?.x) || !Number.isFinite(pt?.y)) continue;
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
        }
      }
      expect(maxX, `${preset.id} drew nothing`).toBeGreaterThan(-Infinity);
      const { width, height } = engine.getBounds();
      measured.push({
        id: preset.id,
        dx: Math.round(((minX + maxX) / 2 - width / 2) * 10) / 10,
        dy: Math.round(((minY + maxY) / 2 - height / 2) * 10) / 10,
      });
    }
    const bad = measured.filter((o) => Math.abs(o.dx) > 20 || Math.abs(o.dy) > 20);
    expect(bad, JSON.stringify(measured)).toEqual([]);
  });
});
