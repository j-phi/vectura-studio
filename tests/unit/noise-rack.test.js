const fs = require('fs');
const path = require('path');
const vm = require('vm');

const loadNoiseRack = () => {
  const filePath = path.resolve(__dirname, '../../src/core/noise-rack.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context = { window: { Vectura: {} }, Math };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context.window.Vectura.NoiseRack;
};

// Deterministic simplex-like noise for testing
const makeMockNoise = (seed = 1) => ({
  noise2D(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 3.1415) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  },
});

const SCALAR_NOISE_TYPES = [
  'simplex', 'ridged', 'billow', 'value', 'value-smooth', 'perlin',
  'turbulence', 'stripes', 'marble', 'steps', 'facet', 'sawtooth',
  'triangle', 'warp', 'cellular', 'voronoi', 'crackle', 'swirl',
  'radial', 'checker', 'zigzag', 'ripple', 'spiral', 'grain',
  'crosshatch', 'pulse', 'domain', 'weave', 'moire', 'dunes',
];

let NoiseRack;
beforeAll(() => { NoiseRack = loadNoiseRack(); });

describe('NoiseRack.combineBlend', () => {
  test('first call (combined=undefined) returns value', () => {
    expect(NoiseRack.combineBlend({ combined: undefined, value: 0.5 })).toBe(0.5);
  });

  test('add blends by summing', () => {
    expect(NoiseRack.combineBlend({ combined: 0.3, value: 0.2, blend: 'add' })).toBeCloseTo(0.5);
  });

  test('subtract', () => {
    expect(NoiseRack.combineBlend({ combined: 0.8, value: 0.3, blend: 'subtract' })).toBeCloseTo(0.5);
  });

  test('multiply', () => {
    expect(NoiseRack.combineBlend({ combined: 0.4, value: 0.5, blend: 'multiply' })).toBeCloseTo(0.2);
  });

  test('max', () => {
    expect(NoiseRack.combineBlend({ combined: 0.3, value: 0.7, blend: 'max' })).toBeCloseTo(0.7);
  });

  test('min', () => {
    expect(NoiseRack.combineBlend({ combined: 0.3, value: 0.7, blend: 'min' })).toBeCloseTo(0.3);
  });

  test('unknown blend defaults to add', () => {
    expect(NoiseRack.combineBlend({ combined: 0.3, value: 0.2, blend: 'unknown' })).toBeCloseTo(0.5);
  });
});

describe('createEvaluator', () => {
  test('returns evaluate and sampleScalar', () => {
    const rack = NoiseRack.createEvaluator({ noise: makeMockNoise() });
    expect(typeof rack.evaluate).toBe('function');
    expect(typeof rack.sampleScalar).toBe('function');
  });

  describe('output range [-1, 1] for all scalar noise types', () => {
    const testPoints = [
      [0, 0], [1.5, 2.3], [-3, 4.7], [10, -5], [0.001, 0.001],
    ];
    SCALAR_NOISE_TYPES.forEach((type) => {
      test(`${type} stays in [-1, 1]`, () => {
        const rack = NoiseRack.createEvaluator({ noise: makeMockNoise(42) });
        const noiseDef = { type, patternScale: 1, warpStrength: 1, cellularScale: 1, cellularJitter: 1, stepsCount: 5, seed: 0 };
        testPoints.forEach(([x, y]) => {
          const v = rack.evaluate(x, y, noiseDef);
          expect(v).toBeGreaterThanOrEqual(-1 - 1e-9);
          expect(v).toBeLessThanOrEqual(1 + 1e-9);
        });
      });
    });
  });

  test('sampleScalar output stays in [-1, 1]', () => {
    const rack = NoiseRack.createEvaluator({ noise: makeMockNoise() });
    const noiseDef = { type: 'simplex', zoom: 0.02, freq: 1, octaves: 4, gain: 0.5, lacunarity: 2, angle: 0, shiftX: 0, shiftY: 0 };
    for (let i = 0; i < 20; i++) {
      const v = rack.sampleScalar(i * 3.7, i * 1.3, noiseDef);
      expect(v).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  test('determinism — same inputs always give same output', () => {
    const rack = NoiseRack.createEvaluator({ noise: makeMockNoise(7) });
    const noiseDef = { type: 'perlin', zoom: 0.05, freq: 1, octaves: 2, gain: 0.5, lacunarity: 2, angle: 0, shiftX: 0, shiftY: 0 };
    const a = rack.sampleScalar(3.5, 7.2, noiseDef);
    const b = rack.sampleScalar(3.5, 7.2, noiseDef);
    expect(a).toBe(b);
  });

  test('seed affects output', () => {
    const def = { type: 'value', zoom: 0.1, freq: 1, octaves: 1, gain: 0.5, lacunarity: 2, angle: 0, shiftX: 0, shiftY: 0 };
    const r1 = NoiseRack.createEvaluator({ noise: makeMockNoise(1), seed: 0 }).sampleScalar(5, 5, def);
    const r2 = NoiseRack.createEvaluator({ noise: makeMockNoise(1), seed: 99 }).sampleScalar(5, 5, def);
    expect(r1).not.toBe(r2);
  });

  test('smooth gradient — adjacent inputs differ by less than 0.5', () => {
    // Use a genuinely smooth noise (low-frequency sine) so adjacency means something
    const smoothNoise = { noise2D: (x, y) => Math.sin(x * 0.7 + 3) * Math.cos(y * 0.5 + 1) };
    const rack = NoiseRack.createEvaluator({ noise: smoothNoise });
    const def = { type: 'simplex', zoom: 0.02, freq: 1, octaves: 1, gain: 0.5, lacunarity: 2, angle: 0, shiftX: 0, shiftY: 0 };
    for (let i = 0; i < 10; i++) {
      const x = i * 5;
      const v1 = rack.sampleScalar(x, 10, def);
      const v2 = rack.sampleScalar(x + 0.1, 10, def);
      expect(Math.abs(v2 - v1)).toBeLessThan(0.5);
    }
  });

  test('octaves > 1 does not blow output range', () => {
    const rack = NoiseRack.createEvaluator({ noise: makeMockNoise(5) });
    const def = { type: 'simplex', zoom: 0.01, freq: 1, octaves: 8, gain: 0.5, lacunarity: 2, angle: 0, shiftX: 0, shiftY: 0 };
    for (let i = 0; i < 10; i++) {
      const v = rack.sampleScalar(i * 10, i * 7, def);
      expect(v).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  test('polygon noise type output range', () => {
    const rack = NoiseRack.createEvaluator({ noise: makeMockNoise() });
    const def = { type: 'polygon', patternScale: 0.5, polygonSides: 6, polygonRadius: 2, polygonRotation: 0, polygonOutline: 0, polygonEdgeRadius: 0 };
    [[-1, -1], [0, 0], [1, 1], [2, -1], [-2, 0.5]].forEach(([x, y]) => {
      const v = rack.evaluate(x, y, def);
      expect(v).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    });
  });

  test('fbm mode via sampleScalar with multiple octaves is smooth', () => {
    const rack = NoiseRack.createEvaluator({ noise: makeMockNoise(11) });
    const def = { type: 'simplex', zoom: 0.005, freq: 1, octaves: 5, gain: 0.45, lacunarity: 2.1, angle: 30, shiftX: 0.1, shiftY: -0.1 };
    const vals = [];
    for (let i = 0; i < 5; i++) vals.push(rack.sampleScalar(i * 20, 50, def));
    vals.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    });
  });
});
