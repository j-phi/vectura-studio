const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

const polylineLength = (path) => {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
};

describe('Rainfall trace length', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const traceLengths = (overrides) => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const params = {
      ...JSON.parse(JSON.stringify(ALGO_DEFAULTS.rainfall)),
      count: 40,
      traceStep: 3,
      turbulence: 0,
      dropShape: 'none',
      trailBreaks: 'none',
      widthMultiplier: 1,
      noises: [],
      seed: 4242,
      ...overrides,
    };
    const paths = Algorithms.rainfall.generate(params, new SeededRNG(4242), new SimpleNoise(4242), BOUNDS) || [];
    return paths.filter((path) => Array.isArray(path) && path.length >= 2).map(polylineLength);
  };

  test.each([0.01, 0.5, 2])('a %s mm trace length produces traces of that length', (traceLength) => {
    const lengths = traceLengths({ traceLength });
    expect(lengths.length).toBeGreaterThan(0);
    lengths.forEach((len) => {
      expect(len).toBeGreaterThan(0);
      expect(len).toBeLessThanOrEqual(traceLength + 1e-9);
    });
    // Edge clipping can drop the last step of a few traces; the rest reach full length.
    const full = lengths.filter((len) => Math.abs(len - traceLength) < 1e-6);
    expect(full.length).toBeGreaterThan(lengths.length * 0.9);
  });

  test('long traces keep their step-based length', () => {
    const lengths = traceLengths({ traceLength: 120 });
    // 120 / 3 = 40 steps of 3 mm; edge clipping can only shorten a trace.
    expect(Math.max(...lengths)).toBeCloseTo(120, 6);
  });

  test('the Trace Length slider reaches 0.01', () => {
    const control = runtime.window.Vectura.UI.CONTROL_DEFS.rainfall.find((c) => c.id === 'traceLength');
    expect(control.min).toBe(0.01);
    expect(control.step).toBeLessThanOrEqual(0.01);
  });
});
