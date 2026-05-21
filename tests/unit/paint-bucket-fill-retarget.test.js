/**
 * Regression test: updateLastPaintedFills must forward waveSmoothing and
 * waveHarmonics when the paint-bucket panel sliders change.
 *
 * Bug: FIELD_MAP in renderer.js omitted these two entries, so moving the
 * Wave Smoothing / Wave Harmonics sliders on an existing poured fill had
 * no visual effect — the stored fill record kept its original values.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer.updateLastPaintedFills — wave param retargeting', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeRenderer = (engine) => {
    const { Renderer } = runtime.window.Vectura;
    const r = new Renderer('main-canvas', engine);
    return r;
  };

  const makeEngine = (fills) => ({
    layers: [{ id: 'layer-1', fills }],
    computeAllDisplayGeometry: vi.fn(),
  });

  const waveFillRecord = (overrides = {}) => ({
    id: 'fill-abc123',
    fillType: 'wave',
    density: 5,
    angle: 0,
    amplitude: 1.0,
    waveSmoothing: 1.0,
    waveHarmonics: 1,
    padding: 0,
    shiftX: 0,
    shiftY: 0,
    region: [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ],
    ...overrides,
  });

  test('waveSmoothing is updated in the fill record when slider changes', () => {
    const rec = waveFillRecord({ waveSmoothing: 1.0 });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    const changed = renderer.updateLastPaintedFills({ fillWaveSmoothing: 0.0 });

    expect(changed).toBe(true);
    expect(rec.waveSmoothing).toBe(0.0);
  });

  test('waveHarmonics is updated in the fill record when slider changes', () => {
    const rec = waveFillRecord({ waveHarmonics: 1 });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    const changed = renderer.updateLastPaintedFills({ fillWaveHarmonics: 3 });

    expect(changed).toBe(true);
    expect(rec.waveHarmonics).toBe(3);
  });

  test('both wave params updated together', () => {
    const rec = waveFillRecord({ waveSmoothing: 1.0, waveHarmonics: 1 });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillWaveSmoothing: 0.0, fillWaveHarmonics: 2 });

    expect(rec.waveSmoothing).toBe(0.0);
    expect(rec.waveHarmonics).toBe(2);
  });

  test('computeAllDisplayGeometry is called when wave params change', () => {
    const rec = waveFillRecord();
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillWaveSmoothing: 0.5 });

    expect(engine.computeAllDisplayGeometry).toHaveBeenCalled();
  });
});
