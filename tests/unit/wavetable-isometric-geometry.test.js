const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (value) => JSON.parse(JSON.stringify(value));

const lineFromPath = (path = []) => {
  const start = path[0];
  const end = path[path.length - 1];
  if (!start || !end) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return {
    start,
    end,
    dx,
    dy,
    slope: Math.abs(dx) < 1e-6 ? Number.POSITIVE_INFINITY : dy / dx,
  };
};

const xAtY = (line, y) => {
  if (!line) return Number.NaN;
  if (Math.abs(line.dy) < 1e-6) return Number.NaN;
  const t = (y - line.start.y) / line.dy;
  return line.start.x + line.dx * t;
};

const average = (values = []) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : Number.NaN;
};

const deltas = (values = []) => {
  const out = [];
  for (let i = 1; i < values.length; i++) out.push(values[i] - values[i - 1]);
  return out;
};

const classifyIsometricPaths = (paths = []) => {
  const horizontal = paths
    .filter((path) => path?.meta?.isometricRole === 'horizontal')
    .sort((a, b) => (a.meta?.isometricIndex ?? 0) - (b.meta?.isometricIndex ?? 0));
  const positive = paths
    .filter((path) => path?.meta?.isometricRole === 'positive-diagonal')
    .sort((a, b) => (a.meta?.isometricIndex ?? 0) - (b.meta?.isometricIndex ?? 0));
  const negative = paths
    .filter((path) => path?.meta?.isometricRole === 'negative-diagonal')
    .sort((a, b) => (a.meta?.isometricIndex ?? 0) - (b.meta?.isometricIndex ?? 0));
  return { horizontal, positive, negative, metrics: paths.isometricMetrics || null };
};

describe('Wavetable isometric geometry', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const bounds = {
    width: 360,
    height: 240,
    m: 20,
    dW: 320,
    dH: 200,
    truncate: true,
  };

  const render = (overrides = {}) => {
    const { Algorithms, ALGO_DEFAULTS, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const params = {
      ...clone(ALGO_DEFAULTS.wavetable || {}),
      lineStructure: 'isometric',
      lines: 8,
      gap: 1,
      tilt: 0,
      noises: [
        {
          ...clone(ALGO_DEFAULTS.wavetable?.noises?.[0] || {}),
          type: 'simplex',
          amplitude: 0,
          zoom: 0.02,
          freq: 1,
          angle: 0,
        },
      ],
      ...overrides,
    };
    const seed = 4242;
    return Algorithms.wavetable.generate(params, new SeededRNG(seed), new SimpleNoise(seed), bounds) || [];
  };

  test('larger gap increases the actual spacing between isometric rows', () => {
    const tight = classifyIsometricPaths(render({ gap: 0.8 }));
    const open = classifyIsometricPaths(render({ gap: 1.6 }));
    const tightYs = tight.horizontal.map((path) => path[0]?.y).filter(Number.isFinite);
    const openYs = open.horizontal.map((path) => path[0]?.y).filter(Number.isFinite);
    const tightSpacing = average(deltas(tightYs));
    const openSpacing = average(deltas(openYs));

    expect(openSpacing).toBeGreaterThan(tightSpacing);
    expect(open.metrics?.rowSpacing).toBeGreaterThan(tight.metrics?.rowSpacing);
  });

  test('neutral row shift preserves the canonical unshifted isometric slopes', () => {
    const zeroShift = classifyIsometricPaths(render({ tilt: 0 }));
    const positiveLine = lineFromPath(zeroShift.positive[Math.floor(zeroShift.positive.length / 2)]);
    const negativeLine = lineFromPath(zeroShift.negative[Math.floor(zeroShift.negative.length / 2)]);

    expect(positiveLine.slope).toBeCloseTo(Math.sqrt(3), 3);
    expect(negativeLine.slope).toBeCloseTo(-Math.sqrt(3), 3);
    expect(zeroShift.metrics?.rowShiftShear ?? Number.NaN).toBeCloseTo(0, 6);
  });

  test('row shift measurably shears the diagonal families', () => {
    const zeroShift = classifyIsometricPaths(render({ tilt: 0 }));
    const shifted = classifyIsometricPaths(render({ tilt: 6 }));
    const zeroPositive = lineFromPath(zeroShift.positive[Math.floor(zeroShift.positive.length / 2)]);
    const shiftedPositive = lineFromPath(shifted.positive[Math.floor(shifted.positive.length / 2)]);
    const zeroNegative = lineFromPath(zeroShift.negative[Math.floor(zeroShift.negative.length / 2)]);
    const shiftedNegative = lineFromPath(shifted.negative[Math.floor(shifted.negative.length / 2)]);

    expect(shiftedPositive.slope).toBeLessThan(zeroPositive.slope);
    expect(shiftedNegative.slope).toBeLessThan(zeroNegative.slope);
    expect(Math.abs(shifted.metrics?.rowShiftShear ?? 0)).toBeGreaterThan(0);
  });

  test('row shift keeps diagonal intersections coherent across adjacent rows', () => {
    const shifted = classifyIsometricPaths(render({ tilt: 6, gap: 1.2 }));
    const rowYs = shifted.horizontal.map((path) => path[0]?.y).filter(Number.isFinite);
    const centerY = average(rowYs);
    const positivePath = shifted.positive
      .slice()
      .sort((a, b) => Math.abs(xAtY(lineFromPath(a), centerY) - 180) - Math.abs(xAtY(lineFromPath(b), centerY) - 180))[0];
    const negativePath = shifted.negative
      .slice()
      .sort((a, b) => Math.abs(xAtY(lineFromPath(a), centerY) - 180) - Math.abs(xAtY(lineFromPath(b), centerY) - 180))[0];
    const positiveLine = lineFromPath(positivePath);
    const negativeLine = lineFromPath(negativePath);
    const positiveXs = rowYs.map((y) => xAtY(positiveLine, y)).filter(Number.isFinite);
    const negativeXs = rowYs.map((y) => xAtY(negativeLine, y)).filter(Number.isFinite);
    const positiveSteps = deltas(positiveXs);
    const negativeSteps = deltas(negativeXs);
    const positiveAvg = average(positiveSteps);
    const negativeAvg = average(negativeSteps);

    expect(positiveSteps.every((step) => Math.abs(step - positiveAvg) < 1e-6)).toBe(true);
    expect(negativeSteps.every((step) => Math.abs(step - negativeAvg) < 1e-6)).toBe(true);
    expect(positiveAvg).toBeGreaterThan(0);
    expect(negativeAvg).toBeLessThan(0);
  });
});
