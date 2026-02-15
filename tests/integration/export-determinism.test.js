const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathsToSvg } = require('../helpers/svg');

const clone = (value) => JSON.parse(JSON.stringify(value));

describe('Engine -> SVG determinism', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('same seed + params produce identical SVG markup', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };

    const paramsA = clone(ALGO_DEFAULTS.lissajous);
    const paramsB = clone(ALGO_DEFAULTS.lissajous);
    paramsA.seed = 1212;
    paramsB.seed = 1212;
    paramsA.resolution = 420;
    paramsB.resolution = 420;

    const outA = Algorithms.lissajous.generate(paramsA, new SeededRNG(1212), new SimpleNoise(1212), bounds);
    const outB = Algorithms.lissajous.generate(paramsB, new SeededRNG(1212), new SimpleNoise(1212), bounds);

    const svgA = pathsToSvg({ width: bounds.width, height: bounds.height, paths: outA, precision: 3 });
    const svgB = pathsToSvg({ width: bounds.width, height: bounds.height, paths: outB, precision: 3 });

    expect(svgA).toBe(svgB);
  });
});
