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
    type: 'petalisDesigner',
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
    id: 'wavetable-isometric-canonical',
    type: 'wavetable',
    seed: 456,
    overrides: {
      lineStructure: 'isometric',
      lines: 9,
      gap: 1.4,
      tilt: 0,
      noises: [
        {
          id: 'noise-1',
          enabled: true,
          type: 'simplex',
          blend: 'add',
          amplitude: 0,
          zoom: 0.02,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 11,
        },
      ],
    },
  },
  {
    id: 'wavetable-isometric-row-shift-canonical',
    type: 'wavetable',
    seed: 457,
    overrides: {
      lineStructure: 'isometric',
      lines: 9,
      gap: 1.4,
      tilt: 6,
      noises: [
        {
          id: 'noise-1',
          enabled: true,
          type: 'simplex',
          blend: 'add',
          amplitude: 0,
          zoom: 0.02,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 11,
        },
      ],
    },
  },
  {
    id: 'shape-pack-canonical',
    type: 'shapePack',
    seed: 505,
    overrides: { shape: 'circle', count: 120, minR: 1, maxR: 14, padding: 0.5, attempts: 1800 },
  },
  {
    id: 'horizon-flat-grid',
    type: 'horizon',
    seed: 601,
    overrides: {
      horizonHeight: 40,
      vanishingPointX: 50,
      horizontalLines: 10,
      convergenceLines: 10,
      terrainHeight: 0,
      noises: [{ id: 'noise-1', enabled: true, type: 'simplex', blend: 'add', amplitude: 0, zoom: 0.02, freq: 1, angle: 0, shiftX: 0, shiftY: 0, tileMode: 'off', seed: 0 }],
    },
  },
  {
    id: 'horizon-valley',
    type: 'horizon',
    seed: 602,
    overrides: {
      horizonHeight: 40,
      vanishingPointX: 50,
      horizontalLines: 18,
      convergenceLines: 14,
      terrainHeight: 55,
      centerDepth: 60,
      centerWidth: 30,
      skylineRelief: 15,
    },
  },
  {
    id: 'horizon-shoulders',
    type: 'horizon',
    seed: 603,
    overrides: {
      horizonHeight: 45,
      vanishingPointX: 50,
      horizontalLines: 16,
      convergenceLines: 12,
      terrainHeight: 45,
      shoulderLift: 50,
      shoulderCurve: 40,
      ridgeSharpness: 30,
      skylineRelief: 10,
    },
  },
];

const buildMirroredMaskedSceneSvg = (runtime) => {
  const { VectorEngine, Layer } = runtime.window.Vectura;
  const engine = new VectorEngine();
  engine.layers = [];

  const modifierId = engine.addModifierLayer('mirror');
  const modifier = engine.layers.find((layer) => layer.id === modifierId);
  modifier.modifier.mirrors = [
    {
        ...modifier.modifier.mirrors[0],
        enabled: true,
        angle: 90,
        xShift: -18,
        yShift: 0,
        replacedSide: 'positive',
      },
    ];

  const maskPath = [];
  maskPath.meta = { kind: 'circle', cx: 176, cy: 110, r: 30 };
  const maskParent = new Layer('mirror-mask-parent', 'expanded', 'Mirror Mask');
  maskParent.parentId = modifierId;
  maskParent.sourcePaths = [maskPath];
  maskParent.mask.enabled = true;

  const waveform = new Layer('mirror-masked-wave', 'expanded', 'Mirror Wave');
  waveform.parentId = maskParent.id;
  waveform.sourcePaths = [];
  for (let row = 0; row < 9; row += 1) {
    const y = 86 + row * 6;
    waveform.sourcePaths.push([
      { x: 148, y },
      { x: 160, y: y + (row % 2 === 0 ? -4 : 4) },
      { x: 176, y },
      { x: 192, y: y + (row % 2 === 0 ? 4 : -4) },
      { x: 204, y },
    ]);
  }

  engine.layers.push(maskParent, waveform);
  engine.generate(maskParent.id);
  engine.generate(waveform.id);
  engine.computeAllDisplayGeometry();

  return pathsToSvg({
    width: 297,
    height: 210,
    paths: [...(maskParent.effectivePaths || []), ...(waveform.displayPaths || [])],
    precision: 3,
  });
};

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

  test('matches baseline: mirrored-masked-circles', () => {
    const baselineDir = path.resolve(__dirname, '../baselines/svg');
    const baselinePath = path.join(baselineDir, 'mirrored-masked-circles.svg');
    const actual = buildMirroredMaskedSceneSvg(runtime);

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
