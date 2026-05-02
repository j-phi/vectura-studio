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

const loadTerrainAlgorithm = () => {
  const filePath = path.resolve(__dirname, '../../src/core/algorithms/terrain.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context = {
    window: { Vectura: { AlgorithmRegistry: {}, NoiseRack: makeNoiseRackMock() } },
    Math,
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context.window.Vectura.AlgorithmRegistry.terrain;
};

const makeDeterministicNoise = () => ({
  noise2D(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + 0.137) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  },
});

const flatNoise = () => ({ noise2D: () => 0 });

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

const BASE = {
  seed: 42,
  perspectiveMode: 'one-point',
  horizonHeight: 50,
  vanishingPointX: 50,
  vpLeftX: 20,
  vpRightX: 80,
  isoAngle: 30,
  depthCompression: 60,
  depthScale: 80,
  depthSlices: 30,
  xResolution: 80,
  occlusion: true,
  mountainAmplitude: 40,
  mountainFrequency: 0.008,
  mountainOctaves: 5,
  mountainLacunarity: 2.0,
  mountainGain: 0.5,
  peakSharpness: 2.0,
  valleyCount: 0,
  valleyDepth: 30,
  valleyWidth: 20,
  valleyShape: 0.4,
  valleyMeander: 40,
  riversEnabled: false,
  riverCount: 2,
  riverWidth: 3,
  riverDepth: 8,
  riverMeander: 50,
  oceansEnabled: false,
  waterLevel: 20,
  drawCoastline: true,
  noises: [],
};

const sig = (paths) =>
  (paths || []).filter(Array.isArray).map((p) =>
    p.map((pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join('|')
  ).join(';');

describe('Terrain algorithm', () => {
  let terrain;

  beforeAll(() => {
    terrain = loadTerrainAlgorithm();
  });

  test('returns a non-empty array of point paths', () => {
    const paths = terrain.generate({ ...BASE }, null, makeDeterministicNoise(), BOUNDS);
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((path) => {
      expect(Array.isArray(path)).toBe(true);
      path.forEach((pt) => {
        expect(typeof pt.x).toBe('number');
        expect(typeof pt.y).toBe('number');
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      });
    });
  });

  test('determinism: same seed produces identical paths', () => {
    const noise = makeDeterministicNoise();
    const a = terrain.generate({ ...BASE }, null, noise, BOUNDS);
    const b = terrain.generate({ ...BASE }, null, noise, BOUNDS);
    expect(sig(a)).toBe(sig(b));
  });

  test('different seeds produce different paths when valleys are present', () => {
    const noise = makeDeterministicNoise();
    const a = terrain.generate({ ...BASE, valleyCount: 3, seed: 1 }, null, noise, BOUNDS);
    const b = terrain.generate({ ...BASE, valleyCount: 3, seed: 999 }, null, noise, BOUNDS);
    expect(sig(a)).not.toBe(sig(b));
  });

  test('all five perspective modes generate output without throwing', () => {
    const noise = makeDeterministicNoise();
    ['orthographic', 'one-point', 'one-point-landscape', 'two-point', 'isometric'].forEach((mode) => {
      const out = terrain.generate({ ...BASE, perspectiveMode: mode }, null, noise, BOUNDS);
      expect(Array.isArray(out)).toBe(true);
      expect(out.length).toBeGreaterThan(0);
    });
  });

  test('one-point-landscape emits a horizon-tagged horizontal line at horizonY', () => {
    const noise = flatNoise();
    const out = terrain.generate(
      { ...BASE, perspectiveMode: 'one-point-landscape', horizonHeight: 50, mountainAmplitude: 0, valleyCount: 0, noises: [] },
      null, noise, BOUNDS
    );
    const horizon = out.filter((p) => p?.meta?.kind === 'horizon');
    expect(horizon.length).toBe(1);
    const [start, end] = horizon[0];
    // Spans the canvas width within the inset and is horizontal
    expect(start.x).toBeLessThan(end.x);
    expect(Math.abs(start.y - end.y)).toBeLessThan(1e-9);
    // 50% horizon height with margin 20 of 220 -> horizonY = 20 + 0.5 * 180 = 110
    expect(start.y).toBeCloseTo(110, 5);
  });

  test('regular one-point does NOT emit a horizon line path', () => {
    const out = terrain.generate({ ...BASE, perspectiveMode: 'one-point' }, null, makeDeterministicNoise(), BOUNDS);
    const horizon = out.filter((p) => p?.meta?.kind === 'horizon');
    expect(horizon.length).toBe(0);
  });

  test('one-point-landscape: terrain peaks above horizon occlude the horizon line', () => {
    const out = terrain.generate({
      ...BASE,
      perspectiveMode: 'one-point-landscape',
      horizonHeight: 50,
      mountainAmplitude: 90,
      peakSharpness: 1.2,
      valleyCount: 0,
      occlusion: true,
      depthSlices: 60,
      xResolution: 200,
      noises: [],
    }, null, makeDeterministicNoise(), BOUNDS);
    const horizon = out.filter((p) => p?.meta?.kind === 'horizon');
    const totalHorizonWidth = horizon.reduce((sum, seg) => {
      if (Array.isArray(seg) && seg.length >= 2) {
        return sum + (seg[seg.length - 1].x - seg[0].x);
      }
      return sum;
    }, 0);
    // With heavy mountains, peaks rise above the horizon at SOME columns,
    // so the visible horizon must be strictly shorter than the full inner width.
    expect(totalHorizonWidth).toBeLessThan(280);
    // But the horizon should not be fully gone for typical terrain — at least
    // some visible segment should remain (peaks don't cover the entire width).
    expect(totalHorizonWidth).toBeGreaterThan(0);
  });

  test('one-point-landscape with occlusion off draws the full horizon line', () => {
    const out = terrain.generate({
      ...BASE,
      perspectiveMode: 'one-point-landscape',
      horizonHeight: 50,
      mountainAmplitude: 90,
      occlusion: false,
      noises: [],
    }, null, makeDeterministicNoise(), BOUNDS);
    const horizon = out.filter((p) => p?.meta?.kind === 'horizon');
    expect(horizon.length).toBe(1);
    const seg = horizon[0];
    expect(seg[seg.length - 1].x - seg[0].x).toBeCloseTo(280, 0);
  });

  test('one-point-landscape: scanlines fill the area below the horizon (content guaranteed)', () => {
    // With flat terrain, scanlines should still cover the canvas from horizonY downward.
    // Verify at least one scanline reaches the lower portion of the canvas.
    const out = terrain.generate({
      ...BASE,
      perspectiveMode: 'one-point-landscape',
      horizonHeight: 40,
      mountainAmplitude: 0,
      valleyCount: 0,
      occlusion: false,
      noises: [],
    }, null, flatNoise(), BOUNDS);
    // horizonY = 20 + 0.4 * 180 = 92. groundBottom = 200.
    const ys = out
      .filter((p) => p?.meta?.kind !== 'horizon' && Array.isArray(p))
      .flatMap((p) => p.map((pt) => pt.y));
    const maxY = Math.max(...ys);
    // Lowest scanline must be near groundBottom (within 5% of inner height).
    expect(maxY).toBeGreaterThan(195);
  });

  test('rack noise actually displaces the heightfield (output changes when amplitude is set)', () => {
    const noise = makeDeterministicNoise();
    const without = terrain.generate({ ...BASE, mountainAmplitude: 0, valleyCount: 0, occlusion: false, noises: [] }, null, noise, BOUNDS);
    const withRack = terrain.generate({
      ...BASE,
      mountainAmplitude: 0,
      valleyCount: 0,
      occlusion: false,
      noises: [{ id: 'noise-1', enabled: true, type: 'simplex', blend: 'add', amplitude: 9, zoom: 0.02, freq: 1, angle: 0, shiftX: 0, shiftY: 0 }],
    }, null, noise, BOUNDS);
    expect(sig(without)).not.toBe(sig(withRack));

    // Quantify: with amplitude=9 the noise should produce on the order of ~1mm peak
    // displacement after the 0.05 scale and projection — i.e. it must actually deform
    // rows visibly, not just shift them by floating-point noise.
    const ysWithout = without.filter(Array.isArray).flatMap((p) => p.map((pt) => pt.y));
    const ysWith = withRack.filter(Array.isArray).flatMap((p) => p.map((pt) => pt.y));
    const range = (arr) => Math.max(...arr) - Math.min(...arr);
    expect(range(ysWith)).toBeGreaterThan(range(ysWithout) + 0.5);
  });

  test('one-point compresses distant scanlines: row gaps decrease toward the horizon', () => {
    // Use flat noise + flat terrain so each scanline is a single straight row at y = horizonY + t^exp * rowSpan.
    const params = {
      ...BASE,
      perspectiveMode: 'one-point',
      depthCompression: 80,
      depthSlices: 40,
      xResolution: 60,
      mountainAmplitude: 0,
      valleyCount: 0,
      occlusion: false,
      noises: [],
    };
    const out = terrain.generate(params, null, flatNoise(), BOUNDS);
    // Each scanline (with flat terrain, no occlusion) is one polyline whose points share a y value.
    // Take the y of the midpoint of each scanline as the row's y, sorted by row index.
    const rows = out
      .filter(Array.isArray)
      .map((p) => p[Math.floor(p.length / 2)]?.y)
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b);
    // After near→far reversal in iteration, sorted ascending = top of canvas (far) → bottom (near).
    // Expect successive gaps to grow as we move toward the camera (perspective expansion).
    // Equivalently: differences should be monotonically non-decreasing.
    let increasing = 0;
    let total = 0;
    for (let i = 2; i < rows.length; i++) {
      const dPrev = rows[i - 1] - rows[i - 2];
      const dCur = rows[i] - rows[i - 1];
      total += 1;
      if (dCur >= dPrev - 1e-6) increasing += 1;
    }
    // Allow a small tolerance for floating-point drift; require >90% monotonic.
    expect(increasing / total).toBeGreaterThan(0.9);
  });

  test('orthographic mode produces evenly-spaced rows (no perspective compression)', () => {
    const params = {
      ...BASE,
      perspectiveMode: 'orthographic',
      depthSlices: 30,
      xResolution: 60,
      mountainAmplitude: 0,
      valleyCount: 0,
      occlusion: false,
      noises: [],
    };
    const out = terrain.generate(params, null, flatNoise(), BOUNDS);
    const rows = out
      .filter(Array.isArray)
      .map((p) => p[Math.floor(p.length / 2)]?.y)
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < rows.length; i++) gaps.push(rows[i] - rows[i - 1]);
    const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length;
    const maxDev = Math.max(...gaps.map((g) => Math.abs(g - mean)));
    expect(maxDev).toBeLessThan(mean * 0.05 + 1e-3);
  });

  test('enabling rivers adds river-tagged paths', () => {
    const noise = makeDeterministicNoise();
    const without = terrain.generate({ ...BASE, riversEnabled: false }, null, noise, BOUNDS);
    const withRivers = terrain.generate({ ...BASE, riversEnabled: true, riverCount: 3 }, null, noise, BOUNDS);
    const riverCount = withRivers.filter((p) => p?.meta?.kind === 'river').length;
    expect(riverCount).toBeGreaterThan(0);
    expect(without.filter((p) => p?.meta?.kind === 'river').length).toBe(0);
  });

  test('enabling oceans + drawCoastline emits coastline paths', () => {
    const noise = makeDeterministicNoise();
    const out = terrain.generate(
      { ...BASE, oceansEnabled: true, drawCoastline: true, waterLevel: 30, mountainAmplitude: 60 },
      null, noise, BOUNDS
    );
    const coast = out.filter((p) => p?.meta?.kind === 'coastline');
    expect(coast.length).toBeGreaterThan(0);
  });

  test('disabling occlusion yields more total points than enabling it', () => {
    const noise = makeDeterministicNoise();
    const occluded = terrain.generate({ ...BASE, occlusion: true, mountainAmplitude: 80 }, null, noise, BOUNDS);
    const wireframe = terrain.generate({ ...BASE, occlusion: false, mountainAmplitude: 80 }, null, noise, BOUNDS);
    const sumPoints = (paths) => paths.reduce((s, p) => s + (Array.isArray(p) ? p.length : 0), 0);
    expect(sumPoints(wireframe)).toBeGreaterThan(sumPoints(occluded));
  });

  test('depthSlices increases the number of scanlines', () => {
    const noise = flatNoise();
    const fewer = terrain.generate({ ...BASE, depthSlices: 10, mountainAmplitude: 0, occlusion: false }, null, noise, BOUNDS);
    const more = terrain.generate({ ...BASE, depthSlices: 60, mountainAmplitude: 0, occlusion: false }, null, noise, BOUNDS);
    expect(more.filter(Array.isArray).length).toBeGreaterThan(fewer.filter(Array.isArray).length);
  });

  test('formula() returns a non-empty descriptive string', () => {
    const text = terrain.formula({ perspectiveMode: 'two-point', depthSlices: 50, xResolution: 200, riversEnabled: true });
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('two-point');
  });
});
