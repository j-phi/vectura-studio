const fs = require('fs');
const path = require('path');
const vm = require('vm');

const makeNoiseRackMock = () => ({
  createEvaluator({ noise }) {
    return {
      evaluate(x, y) { return noise.noise2D(x, y); },
      sampleScalar(x, y, def) { return noise.noise2D(x * (def?.zoom ?? 1), y * (def?.zoom ?? 1)); },
    };
  },
  resolveEffectiveZoom(noiseDef, fallbackZoom = 1) {
    const rawZoom = Math.max(0.0001, noiseDef?.zoom ?? fallbackZoom);
    if ((noiseDef?.type || 'simplex') !== 'polygon') return rawZoom;
    const referenceZoom = Math.max(0.0001, noiseDef?.polygonZoomReference ?? fallbackZoom);
    return (referenceZoom * referenceZoom) / rawZoom;
  },
  combineBlend({ combined, value, blend = 'add' }) {
    if (combined === undefined) return value;
    if (blend === 'subtract') return combined - value;
    if (blend === 'multiply') return combined * value;
    if (blend === 'max') return Math.max(combined, value);
    if (blend === 'min') return Math.min(combined, value);
    return combined + value;
  },
  defaultConfigFor(algorithmId, params = {}) {
    const p = params || {};
    const layer = {
      enabled: true,
      type: p.noiseType || 'simplex',
      blend: 'add',
      amplitude: 1,
      zoom: p.noiseScale ?? 0.003,
      freq: 1,
      angle: 0,
      shiftX: p.noiseOffsetX ?? 0,
      shiftY: p.noiseOffsetY ?? 0,
      tileMode: 'off',
      tilePadding: 0,
      patternScale: 1,
      warpStrength: 1,
      cellularScale: 1,
      cellularJitter: 1,
      stepsCount: 5,
      seed: 0,
      octaves: p.octaves ?? 3,
      lacunarity: p.lacunarity ?? 2.0,
      gain: p.gain ?? 0.5,
      noiseStyle: 'linear',
      noiseThreshold: 0,
      imageWidth: 1,
      imageHeight: 1,
      microFreq: 0,
      imageInvertColor: false,
      imageInvertOpacity: false,
      imageId: p.noiseImageId || '',
      imageName: p.noiseImageName || '',
      imagePreview: '',
      imageAlgo: p.imageAlgo || 'luma',
      imageEffects: [],
      polygonZoomReference: p.noiseScale ?? 0.003,
      polygonRadius: 2,
      polygonSides: 6,
      polygonRotation: 0,
      polygonOutline: 0,
      polygonEdgeRadius: 0,
    };
    if (algorithmId === 'terrain') return { stack: [], layer: { ...layer, amplitude: 0, zoom: 0.01 } };
    return { stack: [layer], layer };
  },
});

const loadTopoAlgorithm = () => {
  const filePath = path.resolve(__dirname, '../../src/core/algorithms/topo.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context = {
    window: {
      Vectura: {
        AlgorithmRegistry: {},
        NoiseRack: makeNoiseRackMock(),
        AlgorithmUtils: {
          clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
          clamp01: (v) => Math.max(0, Math.min(1, v)),
          lerp: (a, b, t) => a + (b - a) * t,
          frac: (v) => v - Math.floor(v),
          applyPad: (t, pad) => {
            if (pad <= 0) return t;
            const span = 1 - pad * 2;
            if (span <= 0) return 0.5;
            return Math.max(0, Math.min(1, (t - pad) / span));
          },
        },
      },
    },
    Math,
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context.window.Vectura.AlgorithmRegistry.topo;
};

const makeDeterministicNoise = () => ({
  noise2D(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + 0.137) * 43758.5453;
    const fract = n - Math.floor(n);
    return fract * 2 - 1;
  },
});

const isClosedPath = (path) => {
  if (!Array.isArray(path) || path.length < 3) return false;
  const first = path[0];
  const last = path[path.length - 1];
  return first.x === last.x && first.y === last.y;
};

describe('Topo mapping closure', () => {
  test('smooth/bezier mapping preserves closed contour loops', () => {
    const topo = loadTopoAlgorithm();
    const bounds = {
      width: 320,
      height: 220,
      m: 20,
      dW: 280,
      dH: 180,
      truncate: true,
    };
    const baseParams = {
      resolution: 50,
      levels: 15,
      noiseType: 'simplex',
      noiseScale: 0.003,
      noiseOffsetX: 0,
      noiseOffsetY: 0,
      octaves: 3,
      lacunarity: 2.0,
      gain: 0.5,
      sensitivity: 1,
      thresholdOffset: 0,
      seed: 4242,
    };

    const marchingPaths = topo.generate(
      { ...baseParams, mappingMode: 'marching' },
      null,
      makeDeterministicNoise(),
      bounds
    );
    const marchingClosedCount = marchingPaths.filter(isClosedPath).length;
    expect(marchingClosedCount).toBeGreaterThan(0);

    ['smooth', 'bezier', 'gradient'].forEach((mappingMode) => {
      const mapped = topo.generate(
        { ...baseParams, mappingMode },
        null,
        makeDeterministicNoise(),
        bounds
      );
      const mappedClosedCount = mapped.filter(isClosedPath).length;
      expect(mappedClosedCount).toBe(marchingClosedCount);
    });
  });
});
