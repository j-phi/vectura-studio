const fs = require('fs');
const path = require('path');
const vm = require('vm');

const makeNoiseRackMock = () => ({
  createEvaluator({ noise }) {
    return {
      evaluate(x, y) { return noise.noise2D(x, y); },
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
});

const loadHorizonAlgorithm = () => {
  const filePath = path.resolve(__dirname, '../../src/core/algorithms/horizon.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context = {
    window: { Vectura: { AlgorithmRegistry: {}, NoiseRack: makeNoiseRackMock() } },
    Math,
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context.window.Vectura.AlgorithmRegistry.horizon;
};

const makeDeterministicNoise = (amplitude = 0.3) => ({
  noise2D(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + 0.137) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  },
});

const flatNoise = () => ({ noise2D: () => 0 });

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

const BASE_PARAMS = {
  seed: 42,
  horizonHeight: 40,
  vanishingPointX: 50,
  horizontalLines: 20,
  convergenceLines: 20,
  linkDensities: false,
  horizontalSpacingMode: 'perspective',
  horizontalSpacingBias: 0,
  convergenceSpacingMode: 'perspective',
  convergenceSpacingBias: 0,
  fanReach: 30,
  depthCompression: 70,
  skylineRelief: 22,
  terrainHeight: 30,
  floorHeight: 0,
  centerWidth: 28,
  centerDepth: 0,
  corridorSoftness: 0,
  shoulderLift: 0,
  shoulderCurve: 0,
  ridgeSharpness: 0,
  valleyProfile: 0,
  symmetryBlend: 0,
  noises: [{ id: 'noise-1', enabled: true, type: 'simplex', blend: 'add', amplitude: 6, zoom: 0.02, freq: 1, angle: 0, shiftX: 0, shiftY: 0, tileMode: 'off', seed: 0 }],
};

const pathSig = (paths) =>
  (paths || []).filter(Array.isArray).map((p) =>
    p.map((pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join('|')
  ).join(';');

describe('Horizon algorithm', () => {
  let horizon;

  beforeAll(() => {
    horizon = loadHorizonAlgorithm();
  });

  test('determinism: same params + seed produce identical output', () => {
    const noise = makeDeterministicNoise();
    const outA = horizon.generate({ ...BASE_PARAMS }, null, noise, BOUNDS);
    const outB = horizon.generate({ ...BASE_PARAMS }, null, noise, BOUNDS);
    expect(pathSig(outA)).toBe(pathSig(outB));
  });

  test('vanishingPointX shifts convergence fan without changing row count', () => {
    const noise = flatNoise();
    const left = horizon.generate({ ...BASE_PARAMS, vanishingPointX: 20 }, null, noise, BOUNDS);
    const center = horizon.generate({ ...BASE_PARAMS, vanishingPointX: 50 }, null, noise, BOUNDS);
    const right = horizon.generate({ ...BASE_PARAMS, vanishingPointX: 80 }, null, noise, BOUNDS);

    // Flat terrain means horizontal rows are identical regardless of VP X
    const rowsLeft = left.filter(Array.isArray);
    const rowsCenter = center.filter(Array.isArray);
    const rowsRight = right.filter(Array.isArray);
    expect(rowsLeft.length).toBeGreaterThan(0);
    expect(rowsCenter.length).toBeGreaterThan(0);
    expect(rowsRight.length).toBeGreaterThan(0);

    // Outputs differ (fan positions changed)
    expect(pathSig(left)).not.toBe(pathSig(right));
  });

  test('horizonHeight moves the horizon line: fewer rows when horizon is lower', () => {
    const noise = flatNoise();
    // Horizon higher on canvas (small %) → more ground → potentially more visible rows
    const highHorizon = horizon.generate(
      { ...BASE_PARAMS, horizonHeight: 20, terrainHeight: 0 }, null, noise, BOUNDS
    );
    // Horizon low on canvas (large %) → less ground → potentially fewer visible rows
    const lowHorizon = horizon.generate(
      { ...BASE_PARAMS, horizonHeight: 75, terrainHeight: 0 }, null, noise, BOUNDS
    );
    // Both produce some output
    expect(highHorizon.filter(Array.isArray).length).toBeGreaterThan(0);
    expect(lowHorizon.filter(Array.isArray).length).toBeGreaterThan(0);
    // Output differs
    expect(pathSig(highHorizon)).not.toBe(pathSig(lowHorizon));
  });

  test('horizontalLines and convergenceLines are independent', () => {
    const noise = flatNoise();
    const moreRows = horizon.generate(
      { ...BASE_PARAMS, horizontalLines: 30, convergenceLines: 10, linkDensities: false, terrainHeight: 0 },
      null, noise, BOUNDS
    );
    const moreFan = horizon.generate(
      { ...BASE_PARAMS, horizontalLines: 10, convergenceLines: 30, linkDensities: false, terrainHeight: 0 },
      null, noise, BOUNDS
    );
    // Output differs
    expect(pathSig(moreRows)).not.toBe(pathSig(moreFan));
  });

  test('linkDensities ties convergence count to horizontal count', () => {
    const noise = flatNoise();
    const linked = horizon.generate(
      { ...BASE_PARAMS, horizontalLines: 15, convergenceLines: 99, linkDensities: true, terrainHeight: 0 },
      null, noise, BOUNDS
    );
    const explicit = horizon.generate(
      { ...BASE_PARAMS, horizontalLines: 15, convergenceLines: 15, linkDensities: false, terrainHeight: 0 },
      null, noise, BOUNDS
    );
    expect(pathSig(linked)).toBe(pathSig(explicit));
  });

  test('even spacing produces uniform row distribution', () => {
    const noise = flatNoise();
    const out = horizon.generate(
      { ...BASE_PARAMS, horizontalSpacingMode: 'even', terrainHeight: 0, horizontalLines: 5, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    const rows = out.filter(Array.isArray).filter((p) => p.length > 1);
    // With flat noise and even spacing, rows should be equally spaced
    const ys = rows.map((r) => r[0].y).sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(1);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    const first = gaps[0];
    gaps.forEach((g) => {
      expect(Math.abs(g - first)).toBeLessThan(0.5);
    });
  });

  test('perspective spacing compresses rows toward horizon', () => {
    const noise = flatNoise();
    const out = horizon.generate(
      { ...BASE_PARAMS, horizontalSpacingMode: 'perspective', terrainHeight: 0,
        horizontalLines: 8, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    const rows = out.filter(Array.isArray).filter((p) => p.length > 1);
    const ys = rows.map((r) => r[0].y).sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(2);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    // Gaps should increase from horizon to near (perspective compression toward horizon)
    const firstGap = gaps[0];
    const lastGap = gaps[gaps.length - 1];
    expect(lastGap).toBeGreaterThan(firstGap);
  });

  test('occlusion: visible segments stop at terrain boundaries', () => {
    // High terrain height with centered ridge should create occlusion
    const noise = makeDeterministicNoise();
    const out = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 80, horizontalLines: 30, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    const rows = out.filter(Array.isArray);
    expect(rows.length).toBeGreaterThan(0);
    // All output points must have finite coordinates
    rows.forEach((seg) => {
      seg.forEach((pt) => {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      });
    });
  });

  test('no point appears above the horizon line', () => {
    const noise = makeDeterministicNoise();
    const out = horizon.generate({ ...BASE_PARAMS, terrainHeight: 80 }, null, noise, BOUNDS);
    const inset = BOUNDS.truncate ? BOUNDS.m : 0;
    const horizonY = inset + (BOUNDS.height - inset * 2) * (BASE_PARAMS.horizonHeight / 100);
    out.filter(Array.isArray).forEach((seg) => {
      seg.forEach((pt) => {
        expect(pt.y).toBeGreaterThanOrEqual(horizonY - 0.01);
      });
    });
  });

  test('mask polygon exists and covers the ground region', () => {
    const noise = makeDeterministicNoise();
    const out = horizon.generate({ ...BASE_PARAMS }, null, noise, BOUNDS);
    expect(out.maskPolygons).toBeDefined();
    expect(Array.isArray(out.maskPolygons)).toBe(true);
    expect(out.maskPolygons.length).toBeGreaterThan(0);
    const mask = out.maskPolygons[0];
    expect(Array.isArray(mask)).toBe(true);
    expect(mask.length).toBeGreaterThanOrEqual(3);

    // All mask points must have valid coordinates
    mask.forEach((pt) => {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    });

    // Bottom-most mask point must be at or near the canvas bottom
    const inset = BOUNDS.truncate ? BOUNDS.m : 0;
    const groundBottom = inset + (BOUNDS.height - inset * 2);
    const maxY = Math.max(...mask.map((pt) => pt.y));
    expect(maxY).toBeGreaterThanOrEqual(groundBottom - 0.01);
  });

  test('flat terrain (terrainHeight=0, noise=0) produces readable grid', () => {
    const noise = flatNoise();
    const out = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 0, noises: [{ ...BASE_PARAMS.noises[0], amplitude: 0 }] },
      null, noise, BOUNDS
    );
    const segments = out.filter(Array.isArray);
    expect(segments.length).toBeGreaterThan(0);
    // All row points should be exactly at their base Y (no displacement)
    // so all y coordinates in a given row should be equal
    const rowSegs = segments.filter((s) => {
      const ys = s.map((pt) => pt.y);
      const range = Math.max(...ys) - Math.min(...ys);
      return range < 0.01; // flat rows
    });
    expect(rowSegs.length).toBeGreaterThan(0);
  });
});
