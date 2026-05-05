const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer.worldToSourcePoint near-zero scale precision', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const createRendererAndLayer = (overrides = {}) => {
    const { Renderer, Layer } = runtime.window.Vectura;
    const engine = {
      layers: [],
      currentProfile: { width: 240, height: 180 },
      getBounds() {
        return { width: 240, height: 180, m: 20, dW: 200, dH: 140, truncate: true };
      },
    };
    const renderer = new Renderer('main-canvas', engine);
    const layer = new Layer('test-layer', 'shape', 'Test');
    layer.origin = { x: 0, y: 0 };
    layer.params.posX = 0;
    layer.params.posY = 0;
    layer.params.rotation = 0;
    layer.params.scaleX = overrides.scaleX ?? 1;
    layer.params.scaleY = overrides.scaleY ?? 1;
    engine.layers = [layer];
    return { renderer, layer };
  };

  test('returns finite numbers with normal scaleX = 1', () => {
    const { renderer, layer } = createRendererAndLayer({ scaleX: 1, scaleY: 1 });
    const result = renderer.worldToSourcePoint(layer, { x: 50, y: 25 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });

  test('round-trip forward(inverse(p)) matches p with normal scale (e.g. 2.5)', () => {
    const { renderer, layer } = createRendererAndLayer({ scaleX: 2.5, scaleY: 2.5 });
    const p = { x: 73.25, y: -19.5 };
    const src = renderer.worldToSourcePoint(layer, p);
    const back = renderer.sourceToWorldPoint(layer, src);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  test('returns finite numbers with scaleX = 1e-9 (below epsilon)', () => {
    const { renderer, layer } = createRendererAndLayer({ scaleX: 1e-9, scaleY: 1 });
    const result = renderer.worldToSourcePoint(layer, { x: 10, y: 10 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    // Result should NOT equal the unscaled coordinate (i.e. fix is not the old "/1" fallback)
    expect(result.x).not.toBeCloseTo(10, 6);
    // Sign should be positive: ux = 10 (positive), divided by +1e-6 -> large positive
    expect(result.x).toBeGreaterThan(0);
  });

  test('returns finite numbers with scaleX = -1e-9 and preserves sign of inverse direction', () => {
    const { renderer, layer } = createRendererAndLayer({ scaleX: -1e-9, scaleY: 1 });
    const result = renderer.worldToSourcePoint(layer, { x: 10, y: 10 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    // ux = 10 (positive), divided by -1e-6 -> large negative
    expect(result.x).toBeLessThan(0);
    // Should not be the unscaled value
    expect(result.x).not.toBeCloseTo(10, 6);
  });

  test('returns finite numbers with scaleX = 0 (no NaN)', () => {
    const { renderer, layer } = createRendererAndLayer({ scaleX: 0, scaleY: 0 });
    const result = renderer.worldToSourcePoint(layer, { x: 10, y: 10 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.y)).toBe(false);
  });
});
