/**
 * Lane B interface (assigned to Lane A under the single-owner rule): the
 * display pipeline applies per-layer stroke style fields to the canvas ctx —
 * extended lineCap (butt|round|projecting → butt|round|square), lineJoin
 * (miter|round|bevel), miterLimit, and a layer-level dash ({enabled, pattern}
 * in document units → world mm). Defensive: absent fields fall back to the
 * historical round/round/10 defaults.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer per-layer stroke style ctx application (Lane B fields)', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeRenderer = () => {
    const { Renderer } = runtime.window.Vectura;
    const engine = { layers: [], currentProfile: { width: 300, height: 300 } };
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    // Recording ctx: capture the last-set property values + setLineDash calls.
    const rec = { lineCap: null, lineJoin: null, miterLimit: null, dash: null };
    renderer.ctx = {
      set lineCap(v) { rec.lineCap = v; },
      get lineCap() { return rec.lineCap; },
      set lineJoin(v) { rec.lineJoin = v; },
      get lineJoin() { return rec.lineJoin; },
      set miterLimit(v) { rec.miterLimit = v; },
      get miterLimit() { return rec.miterLimit; },
      setLineDash(a) { rec.dash = a; },
    };
    return { renderer, rec };
  };

  test('extended lineCap "projecting" maps to canvas "square"', () => {
    const { renderer, rec } = makeRenderer();
    renderer._applyLayerStrokeCtx({ lineCap: 'projecting' });
    expect(rec.lineCap).toBe('square');
  });

  test('butt and round caps pass through', () => {
    const { renderer, rec } = makeRenderer();
    renderer._applyLayerStrokeCtx({ lineCap: 'butt' });
    expect(rec.lineCap).toBe('butt');
    renderer._applyLayerStrokeCtx({ lineCap: 'round' });
    expect(rec.lineCap).toBe('round');
  });

  test('lineJoin + miterLimit are applied; defaults when absent', () => {
    const { renderer, rec } = makeRenderer();
    renderer._applyLayerStrokeCtx({ lineJoin: 'bevel', miterLimit: 4 });
    expect(rec.lineJoin).toBe('bevel');
    expect(rec.miterLimit).toBe(4);

    renderer._applyLayerStrokeCtx({}); // no fields → historical defaults
    expect(rec.lineCap).toBe('round');
    expect(rec.lineJoin).toBe('round');
    expect(rec.miterLimit).toBe(10);
  });

  test('invalid/zero miterLimit falls back to 10', () => {
    const { renderer, rec } = makeRenderer();
    renderer._applyLayerStrokeCtx({ miterLimit: 0 });
    expect(rec.miterLimit).toBe(10);
    renderer._applyLayerStrokeCtx({ miterLimit: 'nope' });
    expect(rec.miterLimit).toBe(10);
  });

  test('layer dash pattern converts document units to world mm (metric = passthrough)', () => {
    const { renderer } = makeRenderer();
    const { SETTINGS } = runtime.window.Vectura;
    SETTINGS.documentUnits = 'metric';
    const dash = renderer._layerDashPattern({ dash: { enabled: true, pattern: [12, 2, 12, 5] } });
    expect(dash).toEqual([12, 2, 12, 5]);
  });

  test('layer dash converts imperial document units to mm (×25.4)', () => {
    const { renderer } = makeRenderer();
    const { SETTINGS } = runtime.window.Vectura;
    SETTINGS.documentUnits = 'imperial';
    const dash = renderer._layerDashPattern({ dash: { enabled: true, pattern: [1, 0.5] } });
    expect(dash[0]).toBeCloseTo(25.4, 4);
    expect(dash[1]).toBeCloseTo(12.7, 4);
    SETTINGS.documentUnits = 'metric';
  });

  test('disabled / empty dash yields null', () => {
    const { renderer } = makeRenderer();
    expect(renderer._layerDashPattern({ dash: { enabled: false, pattern: [4, 4] } })).toBeNull();
    expect(renderer._layerDashPattern({ dash: { enabled: true, pattern: [] } })).toBeNull();
    expect(renderer._layerDashPattern({})).toBeNull();
    expect(renderer._layerDashPattern(null)).toBeNull();
  });
});
