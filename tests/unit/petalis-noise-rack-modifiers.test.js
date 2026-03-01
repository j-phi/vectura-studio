const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

const clone = (value) => JSON.parse(JSON.stringify(value));

describe('Petalis Noise Rack modifiers', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('nested modifier noise stacks are deterministic', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const params = {
      ...clone(ALGO_DEFAULTS.petalisDesigner),
      seed: 4242,
      count: 72,
      innerCount: 36,
      outerCount: 54,
      centerModifiers: [
        {
          id: 'center-noise-1',
          enabled: true,
          type: 'radialNoise',
          amount: 2.5,
          seed: 77,
          noises: [
            {
              id: 'noise-1',
              enabled: true,
              type: 'fbm',
              blend: 'add',
              amplitude: 1,
              zoom: 0.16,
              freq: 1,
              angle: 0,
              shiftX: 0,
              shiftY: 0,
              tileMode: 'off',
              tilePadding: 0,
              patternScale: 1,
              warpStrength: 1,
              cellularScale: 1,
              cellularJitter: 1,
              stepsCount: 5,
              seed: 5,
              octaves: 3,
              lacunarity: 2,
              gain: 0.5,
              noiseStyle: 'linear',
              noiseThreshold: 0,
              imageWidth: 1,
              imageHeight: 1,
              microFreq: 0,
            },
          ],
        },
      ],
      petalModifiers: [
        {
          id: 'petal-noise-1',
          enabled: true,
          type: 'noise',
          target: 'both',
          amount: 1.4,
          seed: 91,
          noises: [
            {
              id: 'noise-1',
              enabled: true,
              type: 'domain',
              blend: 'add',
              amplitude: 1,
              zoom: 0.22,
              freq: 1,
              angle: 20,
              shiftX: 0.1,
              shiftY: -0.1,
              tileMode: 'off',
              tilePadding: 0,
              patternScale: 1,
              warpStrength: 1.4,
              cellularScale: 1,
              cellularJitter: 1,
              stepsCount: 5,
              seed: 8,
              octaves: 2,
              lacunarity: 2,
              gain: 0.5,
              noiseStyle: 'linear',
              noiseThreshold: 0,
              imageWidth: 1,
              imageHeight: 1,
              microFreq: 0,
            },
          ],
        },
      ],
    };

    const seed = params.seed;
    const outA = Algorithms.petalisDesigner.generate(params, new SeededRNG(seed), new SimpleNoise(seed), bounds) || [];
    const outB = Algorithms.petalisDesigner.generate(
      clone(params),
      new SeededRNG(seed),
      new SimpleNoise(seed),
      bounds
    ) || [];

    expect(outA.length).toBeGreaterThan(0);
    expect(pathSignature(outA)).toBe(pathSignature(outB));
  });
});
