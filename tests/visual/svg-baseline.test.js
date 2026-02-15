const fs = require('fs');
const path = require('path');

const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathsToSvg } = require('../helpers/svg');

const clone = (value) => JSON.parse(JSON.stringify(value));
const UPDATE_BASELINES = process.env.VECTURA_UPDATE_BASELINES === '1';

const SCENARIOS = [
  {
    id: 'flowfield-canonical',
    type: 'flowfield',
    seed: 101,
    overrides: { density: 120, maxSteps: 40, stepLen: 4, octaves: 2 },
  },
  {
    id: 'lissajous-canonical',
    type: 'lissajous',
    seed: 202,
    overrides: { freqX: 4.6, freqY: 7.2, phase: 1.1, resolution: 360, damping: 0.0012, scale: 0.9 },
  },
  {
    id: 'petalis-canonical',
    type: 'petalis',
    seed: 303,
    overrides: {
      count: 95,
      ringMode: 'single',
      centerDensity: 12,
      centerRing: false,
      centerConnectors: false,
      shadings: [],
      petalModifiers: [],
    },
  },
  {
    id: 'rainfall-canonical',
    type: 'rainfall',
    seed: 404,
    overrides: {
      count: 110,
      traceLength: 75,
      traceStep: 4,
      dropShape: 'none',
      dropFill: 'none',
      trailBreaks: 'sparse',
      noises: [],
    },
  },
  {
    id: 'shape-pack-canonical',
    type: 'shapePack',
    seed: 505,
    overrides: { shape: 'circle', count: 120, minR: 1, maxR: 14, padding: 0.5, attempts: 1800 },
  },
];

describe('SVG visual baselines', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test.each(SCENARIOS)('matches baseline: $id', ({ id, type, seed, overrides }) => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const baselineDir = path.resolve(__dirname, '../baselines/svg');
    const baselinePath = path.join(baselineDir, `${id}.svg`);

    const params = {
      ...clone(ALGO_DEFAULTS[type] || {}),
      ...clone(overrides || {}),
      seed,
      posX: 0,
      posY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      smoothing: 0,
      simplify: 0,
    };

    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };

    const paths = Algorithms[type].generate(params, new SeededRNG(seed), new SimpleNoise(seed), bounds) || [];
    const actual = pathsToSvg({ width: bounds.width, height: bounds.height, paths, precision: 3 });

    if (UPDATE_BASELINES) {
      fs.mkdirSync(baselineDir, { recursive: true });
      fs.writeFileSync(baselinePath, actual, 'utf8');
      expect(fs.existsSync(baselinePath)).toBe(true);
      return;
    }

    expect(fs.existsSync(baselinePath)).toBe(true);
    const expected = fs.readFileSync(baselinePath, 'utf8');
    expect(actual).toBe(expected);
  });
});
