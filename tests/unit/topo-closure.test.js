const fs = require('fs');
const path = require('path');
const vm = require('vm');

const loadTopoAlgorithm = () => {
  const filePath = path.resolve(__dirname, '../../src/core/algorithms/topo.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context = {
    window: { Vectura: { AlgorithmRegistry: {} } },
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
      resolution: 120,
      levels: 30,
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
