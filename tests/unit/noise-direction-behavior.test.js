const fs = require('fs');
const path = require('path');
const vm = require('vm');

const makeNoiseRackMock = (sampleValue = 1) => ({
  createEvaluator() {
    return {
      evaluate() { return sampleValue; },
      sampleScalar() { return sampleValue; },
    };
  },
  combineBlend({ combined, value, blend = 'add' }) {
    if (combined === undefined) return value;
    if (blend === 'subtract') return combined - value;
    if (blend === 'multiply') return combined * value;
    if (blend === 'max') return Math.max(combined, value);
    if (blend === 'min') return Math.min(combined, value);
    return combined + value;
  },
  resolveEffectiveZoom(noiseDef, fallbackZoom = 1) {
    const rawZoom = Math.max(0.0001, noiseDef?.zoom ?? fallbackZoom);
    if ((noiseDef?.type || 'simplex') !== 'polygon') return rawZoom;
    const referenceZoom = Math.max(0.0001, noiseDef?.polygonZoomReference ?? fallbackZoom);
    return (referenceZoom * referenceZoom) / rawZoom;
  },
});

const loadAlgorithm = (name, sampleValue = 1) => {
  const filePath = path.resolve(__dirname, `../../src/core/algorithms/${name}.js`);
  const code = fs.readFileSync(filePath, 'utf8');
  const context = {
    window: { Vectura: { AlgorithmRegistry: {}, NoiseRack: makeNoiseRackMock(sampleValue) } },
    Math,
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context.window.Vectura.AlgorithmRegistry[name];
};

describe('Noise direction behavior', () => {
  test('wavetable treats positive amplitude as upward displacement', () => {
    const wavetable = loadAlgorithm('wavetable', 1);
    const bounds = {
      width: 240,
      height: 240,
      m: 20,
      dW: 200,
      dH: 200,
      truncate: true,
    };
    const rng = { nextFloat: () => 0.5, nextInt: () => 0 };
    const baseParams = {
      lines: 2,
      gap: 1,
      lineOffset: 180,
      lineStructure: 'horizontal',
      dampenExtremes: false,
      edgeFade: 0,
      edgeFadeThreshold: 0,
      edgeFadeFeather: 0,
      verticalFade: 0,
      verticalFadeThreshold: 0,
      verticalFadeFeather: 0,
      tilt: 0,
      overlapPadding: 0,
      noises: [{ type: 'simplex', amplitude: 5, zoom: 0.02, polygonZoomReference: 0.02 }],
    };

    const positive = wavetable.generate(baseParams, rng, null, bounds);
    const negative = wavetable.generate({
      ...baseParams,
      noises: [{ type: 'simplex', amplitude: -5, zoom: 0.02, polygonZoomReference: 0.02 }],
    }, rng, null, bounds);

    const baseY = bounds.m;
    expect(positive[0][0].y).toBeCloseTo(baseY - 5, 6);
    expect(negative[0][0].y).toBeCloseTo(baseY + 5, 6);
  });

  test('grid shift mode treats positive amplitude as upward displacement', () => {
    const grid = loadAlgorithm('grid', 1);
    const bounds = {
      width: 240,
      height: 240,
      m: 20,
      dW: 200,
      dH: 200,
      truncate: false,
    };
    const rng = { nextFloat: () => 0.5 };
    const baseParams = {
      rows: 1,
      cols: 1,
      distortion: 12,
      chaos: 0,
      type: 'shift',
    };

    const positive = grid.generate({
      ...baseParams,
      noises: [{ type: 'simplex', amplitude: 1, zoom: 0.05, polygonZoomReference: 0.05 }],
    }, rng, null, bounds);
    const negative = grid.generate({
      ...baseParams,
      noises: [{ type: 'simplex', amplitude: -1, zoom: 0.05, polygonZoomReference: 0.05 }],
    }, rng, null, bounds);

    const baseY = bounds.m;
    expect(positive[0][0].y).toBeCloseTo(baseY - baseParams.distortion, 6);
    expect(negative[0][0].y).toBeCloseTo(baseY + baseParams.distortion, 6);
  });

  test('rings keeps positive amplitude as outward radial displacement', () => {
    const rings = loadAlgorithm('rings', 1);
    const bounds = {
      width: 220,
      height: 220,
      m: 20,
      dW: 180,
      dH: 180,
      truncate: false,
    };
    const params = {
      rings: 1,
      centerDiameter: 0,
      gap: 1,
      noises: [{ type: 'simplex', amplitude: 8, zoom: 0.001, polygonZoomReference: 0.001 }],
    };

    const paths = rings.generate(params, null, null, bounds);
    const firstPoint = paths[0][0];
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;
    const baseRadius = Math.max(0.1, Math.min(bounds.width, bounds.height) / 2);
    const actualRadius = Math.hypot(firstPoint.x - cx, firstPoint.y - cy);

    expect(actualRadius).toBeGreaterThan(baseRadius);
  });
});
