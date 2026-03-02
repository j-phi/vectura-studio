const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (value) => JSON.parse(JSON.stringify(value));

const pathRelief = (path = []) => {
  const ys = path.map((point) => point?.y).filter(Number.isFinite);
  if (!ys.length) return 0;
  return Math.max(...ys) - Math.min(...ys);
};

const samplePathYAtX = (path = [], x) => {
  if (!path.length) return Number.NaN;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (x < minX || x > maxX) continue;
    const span = Math.max(1e-6, b.x - a.x);
    const t = (x - a.x) / span;
    return a.y + (b.y - a.y) * t;
  }
  const first = path[0];
  const last = path[path.length - 1];
  return x <= first.x ? first.y : last.y;
};

const getRanges = (path = []) => {
  const xs = path.map((point) => point?.x).filter(Number.isFinite);
  const ys = path.map((point) => point?.y).filter(Number.isFinite);
  return {
    minX: xs.length ? Math.min(...xs) : Number.NaN,
    maxX: xs.length ? Math.max(...xs) : Number.NaN,
    x: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
    y: ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
    avgY: ys.length ? ys.reduce((sum, value) => sum + value, 0) / ys.length : 0,
  };
};

const classifyHorizonPaths = (paths = []) => {
  const taggedRows = paths.filter((path) => path?.meta?.horizonRole === 'row');
  const taggedColumns = paths.filter((path) => path?.meta?.horizonRole === 'column');
  if (taggedRows.length || taggedColumns.length) {
    return {
      horizontal: taggedRows.slice().sort((a, b) => (a.meta?.horizonRowIndex ?? 0) - (b.meta?.horizonRowIndex ?? 0)),
      vertical: taggedColumns.slice().sort((a, b) => (a.meta?.horizonColumnIndex ?? 0) - (b.meta?.horizonColumnIndex ?? 0)),
    };
  }
  const horizontal = [];
  const vertical = [];
  const horizonStarts = paths
    .map((path) => path?.[0]?.y)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const skylineStart = horizonStarts.length ? horizonStarts[0] : 0;
  paths.forEach((path) => {
    const range = getRanges(path);
    const start = path?.[0];
    const end = path?.[path.length - 1];
    const originatesAtSkyline = Number.isFinite(start?.y) ? start.y <= skylineStart + 6 : false;
    const descendsTowardViewer = Number.isFinite(start?.y) && Number.isFinite(end?.y) ? end.y - start.y > 20 : false;
    if (originatesAtSkyline && descendsTowardViewer) vertical.push(path);
    else if (range.x >= range.y) horizontal.push(path);
    else vertical.push(path);
  });
  horizontal.sort((a, b) => getRanges(a).avgY - getRanges(b).avgY);
  return { horizontal, vertical };
};

describe('Wavetable Horizon depth perspective', () => {
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
      lineStructure: 'horizon',
      lines: 24,
      horizonHorizontalLines: 12,
      horizonVerticalLines: 12,
      horizonHeight: 44,
      noises: [
        {
          ...clone(ALGO_DEFAULTS.wavetable?.noises?.[0] || {}),
          type: 'simplex',
          amplitude: 18,
          zoom: 0.018,
          freq: 1,
          angle: 0,
        },
      ],
      ...overrides,
    };
    const seed = 4242;
    return Algorithms.wavetable.generate(params, new SeededRNG(seed), new SimpleNoise(seed), bounds) || [];
  };

  test('higher depth perspective preserves stronger foreground terrain than the horizon', () => {
    const flat = classifyHorizonPaths(render({ horizonDepthPerspective: 0 }));
    const deep = classifyHorizonPaths(render({ horizonDepthPerspective: 100 }));
    const farIndex = 0;
    const nearIndex = Math.max(0, deep.horizontal.length - 1);
    const flatRatio =
      pathRelief(flat.horizontal[nearIndex]) / Math.max(1e-6, pathRelief(flat.horizontal[farIndex]));
    const deepRatio =
      pathRelief(deep.horizontal[nearIndex]) / Math.max(1e-6, pathRelief(deep.horizontal[farIndex]));

    expect(pathRelief(deep.horizontal[nearIndex])).toBeGreaterThan(pathRelief(deep.horizontal[farIndex]));
    expect(deepRatio).toBeGreaterThan(flatRatio);
  });

  test('horizon relief restores visible displacement at the far horizon rows', () => {
    const low = classifyHorizonPaths(render({ horizonDepthPerspective: 100, horizonRelief: 0 }));
    const high = classifyHorizonPaths(render({ horizonDepthPerspective: 100, horizonRelief: 100 }));

    expect(pathRelief(high.horizontal[0])).toBeGreaterThan(pathRelief(low.horizontal[0]));
  });

  test('horizon respects line offset direction instead of forcing vertical-only noise displacement', () => {
    const vertical = classifyHorizonPaths(
      render({
        horizonDepthPerspective: 90,
        horizonRelief: 40,
        horizonCenterDampening: 0,
        horizonCenterBasin: 0,
        horizonShoulderLift: 0,
        horizonMirrorBlend: 0,
        horizonValleyProfile: 0,
        lineOffset: 180,
      })
    );
    const horizontal = classifyHorizonPaths(
      render({
        horizonDepthPerspective: 90,
        horizonRelief: 40,
        horizonCenterDampening: 0,
        horizonCenterBasin: 0,
        horizonShoulderLift: 0,
        horizonMirrorBlend: 0,
        horizonValleyProfile: 0,
        lineOffset: 90,
      })
    );
    const sampleRow = Math.min(4, vertical.horizontal.length - 1);
    const verticalRange = getRanges(vertical.horizontal[sampleRow]);
    const horizontalRange = getRanges(horizontal.horizontal[sampleRow]);

    expect(horizontalRange.x).toBeGreaterThan(verticalRange.x * 0.95);
    expect(horizontalRange.y).toBeLessThan(verticalRange.y);
  });

  test('vanishing controls pull the vertical fan inward near the skyline while keeping bottom spread', () => {
    const baseParams = {
      lines: 40,
      horizonHeight: 30,
        horizonDepthPerspective: 97,
        horizonRelief: 38,
        horizonFanReach: 42,
        horizonCenterDampening: 96,
        horizonCenterWidth: 53,
        horizonCenterBasin: 80,
      horizonShoulderLift: 91,
      horizonMirrorBlend: 1,
      horizonValleyProfile: 84,
      noises: [
        {
          ...clone(runtime.window.Vectura.ALGO_DEFAULTS.wavetable?.noises?.[0] || {}),
          type: 'billow',
          amplitude: 40.7,
          zoom: 0.006,
          freq: 1,
          angle: 93,
        },
        {
          ...clone(runtime.window.Vectura.ALGO_DEFAULTS.wavetable?.noises?.[0] || {}),
          type: 'ridged',
          amplitude: 27.7,
          zoom: 0.018,
          freq: 0.2,
          angle: 87,
        },
        {
          ...clone(runtime.window.Vectura.ALGO_DEFAULTS.wavetable?.noises?.[0] || {}),
          type: 'simplex',
          amplitude: 0.7,
          zoom: 0.026,
          freq: 1,
          angle: 274,
        },
      ],
    };
    const low = classifyHorizonPaths(render({ ...baseParams, horizonVanishingPower: 0 }));
    const high = classifyHorizonPaths(render({ ...baseParams, horizonVanishingPower: 100 }));
    const spreadAtTop = (paths = []) => {
      const xs = paths
        .map((path) => path[0]?.x)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      return xs.length ? xs[xs.length - 1] - xs[0] : 0;
    };
    const spreadAtBottom = (paths = []) => {
      const xs = paths
        .map((path) => path[path.length - 1]?.x)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      return xs.length ? xs[xs.length - 1] - xs[0] : 0;
    };
    const bottomCoverage = (paths = []) => {
      const ranges = paths.map((path) => getRanges(path));
      const mins = ranges.map((range) => range.minX).filter(Number.isFinite).sort((a, b) => a - b);
      const maxes = ranges.map((range) => range.maxX).filter(Number.isFinite).sort((a, b) => a - b);
      return {
        min: mins.length ? mins[0] : Number.NaN,
        max: maxes.length ? maxes[maxes.length - 1] : Number.NaN,
      };
    };

    const topRatioLow = spreadAtTop(low.vertical) / Math.max(1e-6, spreadAtBottom(low.vertical));
    const topRatioHigh = spreadAtTop(high.vertical) / Math.max(1e-6, spreadAtBottom(high.vertical));
    const coverageLow = bottomCoverage(low.vertical);
    const coverageHigh = bottomCoverage(high.vertical);
    const skylineRange = getRanges(high.horizontal[0]);

    expect(topRatioHigh).toBeLessThan(topRatioLow);
    expect(coverageHigh.min).toBeLessThan(coverageLow.min);
    expect(coverageHigh.max).toBeGreaterThan(coverageLow.max);
    expect(coverageHigh.min).toBeLessThanOrEqual(bounds.m + 14);
    expect(coverageHigh.max).toBeGreaterThanOrEqual(bounds.width - bounds.m - 32);

    const skyline = high.horizontal[0];
    high.vertical.forEach((path) => {
      for (const point of path) {
        if (point.x < skylineRange.minX || point.x > skylineRange.maxX) continue;
        const skylineY = samplePathYAtX(skyline, point.x);
        if (Number.isFinite(skylineY)) expect(point.y).toBeGreaterThanOrEqual(skylineY - 0.01);
      }
    });
  });

  test('explicit Horizon horizontal and vertical counts control mesh density independently', () => {
    const sparseVertical = classifyHorizonPaths(
      render({
        horizonHorizontalLines: 18,
        horizonVerticalLines: 10,
      })
    );
    const denseVertical = classifyHorizonPaths(
      render({
        horizonHorizontalLines: 18,
        horizonVerticalLines: 28,
      })
    );
    const denseHorizontal = classifyHorizonPaths(
      render({
        horizonHorizontalLines: 30,
        horizonVerticalLines: 10,
      })
    );

    expect(denseVertical.vertical.length).toBeGreaterThan(sparseVertical.vertical.length);
    expect(denseHorizontal.horizontal.length).toBeGreaterThanOrEqual(sparseVertical.horizontal.length);
  });

  test('high fan reach keeps side coverage under strong vanishing pull', () => {
    const tighter = classifyHorizonPaths(
      render({
        horizonHeight: 30,
        horizonHorizontalLines: 24,
        horizonVerticalLines: 32,
        horizonVanishingPower: 100,
        horizonFanReach: 40,
      })
    );
    const wider = classifyHorizonPaths(
      render({
        horizonHeight: 30,
        horizonHorizontalLines: 24,
        horizonVerticalLines: 32,
        horizonVanishingPower: 100,
        horizonFanReach: 100,
      })
    );
    const bottomCoverage = (paths = []) => {
      const ranges = paths.map((path) => getRanges(path));
      const mins = ranges.map((range) => range.minX).filter(Number.isFinite).sort((a, b) => a - b);
      const maxes = ranges.map((range) => range.maxX).filter(Number.isFinite).sort((a, b) => a - b);
      return {
        min: mins.length ? mins[0] : Number.NaN,
        max: maxes.length ? maxes[maxes.length - 1] : Number.NaN,
      };
    };

    const tightCoverage = bottomCoverage(tighter.vertical);
    const wideCoverage = bottomCoverage(wider.vertical);

    expect(wideCoverage.min).toBeLessThanOrEqual(tightCoverage.min + 1);
    expect(wideCoverage.max).toBeGreaterThanOrEqual(tightCoverage.max - 3);
    expect(wideCoverage.min).toBeLessThanOrEqual(bounds.m + 14);
    expect(wideCoverage.max).toBeGreaterThanOrEqual(bounds.width - bounds.m - 14);
  });
});
