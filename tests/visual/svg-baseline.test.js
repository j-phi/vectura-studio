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
    id: 'wavetable-horizon-canonical',
    type: 'wavetable',
    seed: 454,
    overrides: {
      lineStructure: 'horizon',
      horizonHorizontalLines: 24,
      horizonVerticalLines: 28,
      horizonHeight: 30,
      horizonDepthPerspective: 97,
      horizonVanishingX: 50,
      horizonVanishingPower: 76,
      horizonFanReach: 50,
      horizonRelief: 30,
      horizonCenterDampening: 92,
      horizonCenterWidth: 40,
      horizonCenterBasin: 58,
      horizonShoulderLift: 56,
      horizonMirrorBlend: 58,
      horizonValleyProfile: 42,
      noises: [
        {
          id: 'noise-1',
          enabled: true,
          type: 'billow',
          blend: 'add',
          amplitude: 13.8,
          zoom: 0.0048,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 11,
        },
        {
          id: 'noise-2',
          enabled: true,
          type: 'ridged',
          blend: 'add',
          amplitude: 3.8,
          zoom: 0.0076,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 53,
        },
        {
          id: 'noise-3',
          enabled: true,
          type: 'simplex',
          blend: 'add',
          amplitude: 0.7,
          zoom: 0.0132,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 101,
        },
      ],
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
    id: 'wavetable-horizon-3d-canonical',
    type: 'wavetable',
    seed: 455,
    overrides: {
      lineStructure: 'horizon-3d',
      lines: 128,
      horizonHorizontalLines: 26,
      horizonVerticalLines: 34,
      horizonHeight: 33,
      horizonDepthPerspective: 90,
      horizonVanishingX: 50,
      horizonVanishingPower: 84,
      horizonFanReach: 66,
      horizonRelief: 30,
      horizonCenterDampening: 92,
      horizonCenterWidth: 52,
      horizonCenterBasin: 88,
      horizonShoulderLift: 84,
      horizonMirrorBlend: 68,
      horizonValleyProfile: 72,
      noises: [
        {
          id: 'noise-1',
          enabled: true,
          type: 'billow',
          blend: 'add',
          amplitude: 10.5,
          zoom: 0.0044,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 11,
        },
        {
          id: 'noise-2',
          enabled: true,
          type: 'ridged',
          blend: 'add',
          amplitude: 2.4,
          zoom: 0.0072,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 53,
        },
        {
          id: 'noise-3',
          enabled: true,
          type: 'simplex',
          blend: 'add',
          amplitude: 0.35,
          zoom: 0.0126,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          seed: 101,
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
];

const buildMaskedSceneSvg = (runtime) => {
  const { VectorEngine, Layer } = runtime.window.Vectura;
  const engine = new VectorEngine();
  engine.layers = [];

  const rings = new Layer('rings-target', 'expanded', 'Rings Target');
  rings.paths = [];
  const centerX = 160;
  const centerY = 138;
  const radii = [18, 32, 48, 66, 86];
  radii.forEach((radius) => {
    const ring = [];
    for (let step = 0; step <= 96; step++) {
      const theta = (step / 96) * Math.PI * 2;
      ring.push({
        x: centerX + Math.cos(theta) * radius,
        y: centerY + Math.sin(theta) * radius,
      });
    }
    rings.paths.push(ring);
  });
  rings.mask.enabled = true;

  const terrain = new Layer('terrain-mask', 'wavetable', 'Terrain Mask');
  terrain.parentId = rings.id;
  terrain.params.lineStructure = 'horizon';
  terrain.paths = [
    [
      { x: 32, y: 132 },
      { x: 86, y: 120 },
      { x: 132, y: 126 },
      { x: 160, y: 146 },
      { x: 188, y: 126 },
      { x: 234, y: 120 },
      { x: 288, y: 132 },
    ],
    [
      { x: 32, y: 156 },
      { x: 72, y: 146 },
      { x: 120, y: 154 },
      { x: 160, y: 176 },
      { x: 200, y: 154 },
      { x: 248, y: 146 },
      { x: 288, y: 156 },
    ],
  ];

  engine.layers.push(rings, terrain);
  engine.computeAllDisplayGeometry();

  return pathsToSvg({
    width: 320,
    height: 220,
    paths: [...(rings.paths || []), ...(terrain.displayPaths || [])],
    precision: 3,
  });
};

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

  test('matches baseline: masking-horizon-rings', () => {
    const baselineDir = path.resolve(__dirname, '../baselines/svg');
    const baselinePath = path.join(baselineDir, 'masking-horizon-rings.svg');
    const actual = buildMaskedSceneSvg(runtime);

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
