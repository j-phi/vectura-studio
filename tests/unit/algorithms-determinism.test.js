const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

const clone = (value) => JSON.parse(JSON.stringify(value));

const OVERRIDES = {
  flowfield: { density: 180, maxSteps: 45, octaves: 2 },
  lissajous: { resolution: 320 },
  harmonograph: { samples: 1200, duration: 12 },
  wavetable: { lines: 28 },
  rings: { rings: 22 },
  topo: { resolution: 80, levels: 16 },
  rainfall: { count: 120, traceLength: 80, traceStep: 4, noises: [] },
  petalis: {
    count: 110,
    innerCount: 60,
    outerCount: 85,
    centerDensity: 16,
    centerRingDensity: 20,
    connectorCount: 20,
    shadings: [],
    innerOuterLock: false,
    profileTransitionPosition: 48,
    profileTransitionFeather: 35,
    designerInner: {
      profile: 'teardrop',
      anchors: [
        { t: 0, w: 0, in: null, out: { t: 0.18, w: 0 } },
        { t: 0.44, w: 0.78, in: { t: 0.3, w: 0.78 }, out: { t: 0.58, w: 0.78 } },
        { t: 1, w: 0, in: { t: 0.82, w: 0 }, out: null },
      ],
    },
    designerOuter: {
      profile: 'spatulate',
      anchors: [
        { t: 0, w: 0, in: null, out: { t: 0.24, w: 0 } },
        { t: 0.62, w: 1.12, in: { t: 0.46, w: 1.12 }, out: { t: 0.76, w: 1.12 } },
        { t: 1, w: 0, in: { t: 0.86, w: 0 }, out: null },
      ],
    },
  },
  petalisDesigner: {
    count: 95,
    innerCount: 48,
    outerCount: 70,
    centerDensity: 14,
    centerRingDensity: 18,
    shadings: [],
    innerOuterLock: false,
    profileTransitionPosition: 42,
    profileTransitionFeather: 60,
    designerInner: {
      profile: 'lanceolate',
      anchors: [
        { t: 0, w: 0, in: null, out: { t: 0.2, w: 0 } },
        { t: 0.5, w: 0.66, in: { t: 0.36, w: 0.66 }, out: { t: 0.64, w: 0.66 } },
        { t: 1, w: 0, in: { t: 0.82, w: 0 }, out: null },
      ],
    },
    designerOuter: {
      profile: 'rounded',
      anchors: [
        { t: 0, w: 0, in: null, out: { t: 0.22, w: 0 } },
        { t: 0.56, w: 1.02, in: { t: 0.4, w: 1.02 }, out: { t: 0.72, w: 1.02 } },
        { t: 1, w: 0, in: { t: 0.84, w: 0 }, out: null },
      ],
    },
  },
  spiral: { loops: 9, res: 42 },
  grid: { rows: 16, cols: 16 },
  phylla: { count: 260 },
  boids: { count: 70, steps: 90 },
  attractor: { iter: 1000 },
  hyphae: { maxBranches: 500, steps: 45 },
  shapePack: { count: 130, attempts: 1400 },
};

const buildParams = (type, defaults) => {
  const base = clone(defaults || {});
  const override = OVERRIDES[type] || {};
  const params = { ...base, ...clone(override) };

  params.seed = 4242;
  params.posX = 0;
  params.posY = 0;
  params.scaleX = 1;
  params.scaleY = 1;
  params.rotation = 0;
  params.smoothing = 0;
  params.simplify = 0;

  return params;
};

describe('Algorithm determinism', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('all registered core algorithms are deterministic for fixed seeds/params', () => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };

    const algorithmTypes = Object.keys(ALGO_DEFAULTS)
      .filter((type) => !['expanded', 'group'].includes(type))
      .filter((type) => Algorithms[type] && typeof Algorithms[type].generate === 'function');

    expect(algorithmTypes.length).toBeGreaterThan(0);

    algorithmTypes.forEach((type) => {
      const paramsA = buildParams(type, ALGO_DEFAULTS[type]);
      const paramsB = buildParams(type, ALGO_DEFAULTS[type]);

      const seed = Number.isFinite(paramsA.seed) ? paramsA.seed : 4242;
      const outA = Algorithms[type].generate(paramsA, new SeededRNG(seed), new SimpleNoise(seed), bounds) || [];
      const outB = Algorithms[type].generate(paramsB, new SeededRNG(seed), new SimpleNoise(seed), bounds) || [];

      expect(pathSignature(outA)).toBe(pathSignature(outB));
    });
  });
});
