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

const pathLength = (path = []) => {
  let total = 0;
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1];
    const b = path[index];
    if (!a || !b) continue;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
};

const average = (values = []) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : Number.NaN;
};

const getSpacingStats = (values = []) => {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length < 2) return { average: Number.NaN, maxDeviation: Number.NaN, deltas: [] };
  const deltas = [];
  for (let i = 1; i < finite.length; i++) {
    deltas.push(finite[i] - finite[i - 1]);
  }
  const avg = average(deltas);
  const maxDeviation = Math.max(...deltas.map((delta) => Math.abs(delta - avg)));
  return { average: avg, maxDeviation, deltas };
};

const groupSegmentsByIndex = (paths = [], metaKey) => {
  const grouped = new Map();
  paths.forEach((path) => {
    const index = path?.meta?.[metaKey];
    if (!Number.isFinite(index)) return;
    if (!grouped.has(index)) grouped.set(index, []);
    grouped.get(index).push(path);
  });
  return grouped;
};

const pointInPolygon = (point, polygon = []) => {
  if (!point || !Array.isArray(polygon) || polygon.length < 4) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const intersects =
      (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / Math.max(1e-6, b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
};

const classifyHorizonPaths = (paths = []) => {
  const taggedRows = paths.filter((path) => path?.meta?.horizonRole === 'row');
  const taggedColumns = paths.filter((path) => path?.meta?.horizonRole === 'column');
  if (taggedRows.length || taggedColumns.length) {
    const horizontal = taggedRows.slice().sort((a, b) => {
      const rowDelta = (a.meta?.horizonRowIndex ?? 0) - (b.meta?.horizonRowIndex ?? 0);
      if (rowDelta !== 0) return rowDelta;
      return (a.meta?.horizonRowSegmentIndex ?? 0) - (b.meta?.horizonRowSegmentIndex ?? 0);
    });
    const vertical = taggedColumns.slice().sort((a, b) => {
      const columnDelta = (a.meta?.horizonColumnIndex ?? 0) - (b.meta?.horizonColumnIndex ?? 0);
      if (columnDelta !== 0) return columnDelta;
      return (a.meta?.horizonColumnSegmentIndex ?? 0) - (b.meta?.horizonColumnSegmentIndex ?? 0);
    });
    return {
      horizontal,
      vertical,
      horizontalByIndex: groupSegmentsByIndex(horizontal, 'horizonRowIndex'),
      verticalByIndex: groupSegmentsByIndex(vertical, 'horizonColumnIndex'),
      metrics: paths.horizonMetrics || null,
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
  return {
    horizontal,
    vertical,
    horizontalByIndex: groupSegmentsByIndex(horizontal, 'horizonRowIndex'),
    verticalByIndex: groupSegmentsByIndex(vertical, 'horizonColumnIndex'),
    metrics: paths.horizonMetrics || null,
  };
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

  const renderLegacyHorizon3D = (overrides = {}) =>
    render({
      lineStructure: 'horizon-3d',
      lines: 96,
      horizonHorizontalLines: 20,
      horizonVerticalLines: 24,
      horizonHeight: 29,
      horizonDepthPerspective: 88,
      horizonVanishingX: 50,
      horizonVanishingPower: 84,
      horizonFanReach: 64,
      horizonRelief: 34,
      horizonCenterDampening: 86,
      horizonCenterWidth: 36,
      horizonCenterBasin: 68,
      horizonShoulderLift: 64,
      horizonMirrorBlend: 62,
      horizonValleyProfile: 54,
      noises: [
        {
          ...clone(runtime.window.Vectura.ALGO_DEFAULTS.wavetable?.noises?.[0] || {}),
          type: 'billow',
          amplitude: 13.8,
          zoom: 0.0048,
          freq: 1,
          angle: 0,
          seed: 11,
        },
        {
          ...clone(runtime.window.Vectura.ALGO_DEFAULTS.wavetable?.noises?.[0] || {}),
          type: 'ridged',
          amplitude: 3.8,
          zoom: 0.0076,
          freq: 1,
          angle: 0,
          seed: 53,
        },
        {
          ...clone(runtime.window.Vectura.ALGO_DEFAULTS.wavetable?.noises?.[0] || {}),
          type: 'simplex',
          amplitude: 0.7,
          zoom: 0.0132,
          freq: 1,
          angle: 0,
          seed: 101,
        },
      ],
      ...overrides,
    });

  test('higher depth perspective preserves stronger foreground terrain than the horizon', () => {
    const flat = classifyHorizonPaths(render({ horizonDepthPerspective: 0 }));
    const deep = classifyHorizonPaths(render({ horizonDepthPerspective: 100 }));
    const flatRows = flat.metrics?.rows || [];
    const deepRows = deep.metrics?.rows || [];
    const farIndex = 0;
    const nearIndex = Math.max(0, deepRows.length - 1);
    const flatRatio =
      pathRelief(flatRows[Math.max(0, flatRows.length - 1)]?.points) / Math.max(1e-6, pathRelief(flatRows[farIndex]?.points));
    const deepRatio =
      pathRelief(deepRows[nearIndex]?.points) / Math.max(1e-6, pathRelief(deepRows[farIndex]?.points));

    expect(pathRelief(deepRows[nearIndex]?.points)).toBeGreaterThan(pathRelief(flatRows[Math.max(0, flatRows.length - 1)]?.points));
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
    expect(horizontalRange.y).toBeLessThanOrEqual(verticalRange.y);
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
    const spreadAtDepthIndex = (columns = [], pointIndex = 0) => {
      const xs = columns
        .map((column) => column?.points?.[pointIndex]?.x)
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

    const lowColumns = low.metrics?.columns || [];
    const highColumns = high.metrics?.columns || [];
    const lowTopSpread = spreadAtDepthIndex(lowColumns, 0);
    const lowBottomSpread = spreadAtDepthIndex(lowColumns, Math.max(0, lowColumns[0]?.points?.length - 1 || 0));
    const highTopSpread = spreadAtDepthIndex(highColumns, 0);
    const highBottomSpread = spreadAtDepthIndex(highColumns, Math.max(0, highColumns[0]?.points?.length - 1 || 0));
    const topRatioLow = lowTopSpread / Math.max(1e-6, lowBottomSpread);
    const topRatioHigh = highTopSpread / Math.max(1e-6, highBottomSpread);
    const coverageLow = bottomCoverage(low.vertical);
    const coverageHigh = bottomCoverage(high.vertical);
    expect(topRatioHigh).toBeLessThan(topRatioLow + 0.2);
    expect(coverageHigh.min).toBeLessThanOrEqual(coverageLow.min + 6);
    expect(coverageHigh.max).toBeGreaterThanOrEqual(coverageLow.max - 8);
    expect(coverageHigh.min).toBeLessThanOrEqual(bounds.m + 14);
    expect(coverageHigh.max).toBeGreaterThanOrEqual(bounds.width - bounds.m - 33);
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

  test('Horizon reports exact underlying row and column counts from the regularized grid', () => {
    const rendered = render({
      horizonHorizontalLines: 18,
      horizonVerticalLines: 26,
      horizonHeight: 30,
      horizonVanishingPower: 78,
      horizonFanReach: 55,
    });
    const classified = classifyHorizonPaths(rendered);

    expect(classified.metrics?.horizontalCount).toBe(18);
    expect(classified.metrics?.verticalCount).toBe(26);
    expect(classified.horizontalByIndex.size).toBeLessThanOrEqual(18);
    expect(classified.verticalByIndex.size).toBeLessThanOrEqual(26);
  });

  test('regularized Horizon columns keep monotonic ordering and stable spacing at the skyline and foreground', () => {
    const rendered = render({
      horizonHorizontalLines: 22,
      horizonVerticalLines: 22,
      horizonHeight: 31,
      horizonVanishingPower: 84,
      horizonFanReach: 54,
      horizonDepthPerspective: 95,
      horizonRelief: 32,
      horizonCenterDampening: 88,
      horizonCenterWidth: 42,
      horizonCenterBasin: 58,
      horizonShoulderLift: 46,
      horizonMirrorBlend: 36,
      horizonValleyProfile: 28,
      lineOffset: 180,
    });
    const classified = classifyHorizonPaths(rendered);
    const columns = classified.metrics?.columns || [];

    expect(columns).toHaveLength(22);
    for (let rowIndex = 0; rowIndex < (classified.metrics?.horizontalCount || 0); rowIndex++) {
      const xs = columns
        .map((column) => column.points?.[rowIndex]?.x)
        .filter(Number.isFinite);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]).toBeGreaterThan(xs[i - 1]);
      }
    }

    const skylineXs = columns.map((column) => column.points?.[0]?.x);
    const foregroundXs = columns.map((column) => column.points?.[column.points.length - 1]?.x);
    const skylineSpacing = getSpacingStats(skylineXs);
    const foregroundSpacing = getSpacingStats(foregroundXs);

    expect(skylineSpacing.maxDeviation).toBeLessThanOrEqual(Math.max(1.5, skylineSpacing.average * 0.16));
    expect(foregroundSpacing.maxDeviation).toBeLessThanOrEqual(Math.max(3, foregroundSpacing.average * 0.2));
  });

  test('occluded columns can reappear, but only under the same column identity and behind nearer terrain', () => {
    const rendered = render({
      horizonHeight: 28,
      horizonHorizontalLines: 26,
      horizonVerticalLines: 30,
      horizonDepthPerspective: 100,
      horizonVanishingPower: 88,
      horizonFanReach: 52,
      horizonRelief: 48,
      horizonCenterDampening: 78,
      horizonCenterWidth: 34,
      horizonCenterBasin: 54,
      horizonShoulderLift: 68,
      horizonMirrorBlend: 44,
      horizonValleyProfile: 52,
      noises: [
        {
          ...clone(runtime.window.Vectura.ALGO_DEFAULTS.wavetable?.noises?.[0] || {}),
          type: 'billow',
          amplitude: 24,
          zoom: 0.007,
          freq: 1,
          angle: 90,
        },
        {
          ...clone(runtime.window.Vectura.ALGO_DEFAULTS.wavetable?.noises?.[0] || {}),
          type: 'ridged',
          amplitude: 8,
          zoom: 0.015,
          freq: 1,
          angle: 90,
        },
      ],
    });
    const classified = classifyHorizonPaths(rendered);
    const multiSegmentColumns = Array.from(classified.verticalByIndex.entries()).filter(([, segments]) => segments.length > 1);

    expect(multiSegmentColumns.length).toBeGreaterThan(0);
    multiSegmentColumns.forEach(([columnIndex, segments]) => {
      segments.forEach((segment) => {
        expect(segment.meta?.horizonColumnIndex).toBe(columnIndex);
      });

      const sorted = segments
        .slice()
        .sort((a, b) => average(a.map((point) => point?.y)) - average(b.map((point) => point?.y)));
      for (let segmentIndex = 1; segmentIndex < sorted.length; segmentIndex++) {
        const prev = sorted[segmentIndex - 1];
        const next = sorted[segmentIndex];
        const prevEnd = prev[prev.length - 1];
        const nextStart = next[0];
        const gapMidpoint = {
          x: (prevEnd.x + nextStart.x) * 0.5,
          y: (prevEnd.y + nextStart.y) * 0.5,
        };
        const hiddenByBand = (rendered.maskPolygons || []).some((polygon) => pointInPolygon(gapMidpoint, polygon));

        expect(hiddenByBand).toBe(true);
      }
    });
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

    expect(wideCoverage.min).toBeLessThanOrEqual(tightCoverage.min + 3);
    expect(wideCoverage.max).toBeGreaterThanOrEqual(tightCoverage.max - 3);
    expect(wideCoverage.min).toBeLessThanOrEqual(bounds.m + 14);
    expect(wideCoverage.max).toBeGreaterThanOrEqual(bounds.width - bounds.m - 14);
  });

  test('legacy Horizon 3D input migrates into canonical Horizon metrics and keeps projected ordering monotonic', () => {
    const rendered = renderLegacyHorizon3D({
      horizonHorizontalLines: 16,
      horizonVerticalLines: 20,
      horizonVanishingPower: 78,
      horizonFanReach: 58,
    });
    const classified = classifyHorizonPaths(rendered);
    const columns = classified.metrics?.columns || [];
    const rows = classified.metrics?.rows || [];

    expect(classified.metrics?.mode).toBe('horizon');
    expect(classified.metrics?.horizontalCount).toBe(16);
    expect(classified.metrics?.verticalCount).toBe(20);
    expect(columns).toHaveLength(20);
    expect(rows).toHaveLength(16);

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const xs = columns.map((column) => column.points?.[rowIndex]?.x).filter(Number.isFinite);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]).toBeGreaterThan(xs[i - 1]);
      }
    }

    const rowDepths = rows.map((row) => row.cameraDepth).filter(Number.isFinite);
    for (let i = 1; i < rowDepths.length; i++) {
      expect(rowDepths[i]).toBeGreaterThan(rowDepths[i - 1]);
    }
  });

  test('legacy Horizon 3D input keeps reappearing occluded columns under the same identity', () => {
    const rendered = renderLegacyHorizon3D({
      horizonHorizontalLines: 24,
      horizonVerticalLines: 28,
      horizonHeight: 27,
      horizonRelief: 52,
      horizonCenterWidth: 30,
      horizonCenterBasin: 72,
      horizonShoulderLift: 82,
      horizonValleyProfile: 68,
      horizonFanReach: 70,
    });
    const classified = classifyHorizonPaths(rendered);
    const multiSegmentColumns = Array.from(classified.verticalByIndex.entries()).filter(([, segments]) => segments.length > 1);

    expect(multiSegmentColumns.length).toBeGreaterThan(0);
    multiSegmentColumns.forEach(([columnIndex, segments]) => {
      segments.forEach((segment) => {
        expect(segment.meta?.horizonColumnIndex).toBe(columnIndex);
      });

      const sorted = segments
        .slice()
        .sort((a, b) => average(a.map((point) => point?.y)) - average(b.map((point) => point?.y)));
      for (let segmentIndex = 1; segmentIndex < sorted.length; segmentIndex++) {
        const prev = sorted[segmentIndex - 1];
        const next = sorted[segmentIndex];
        const prevAvgY = average(prev.map((point) => point?.y));
        const nextAvgY = average(next.map((point) => point?.y));

        expect(nextAvgY).toBeGreaterThan(prevAvgY);
      }
    });
  });

  test('legacy Horizon 3D input does not emit detached floater stubs on steep shoulders after migration', () => {
    const rendered = renderLegacyHorizon3D({
      horizonHorizontalLines: 26,
      horizonVerticalLines: 30,
      horizonHeight: 27,
      horizonRelief: 58,
      horizonCenterWidth: 28,
      horizonCenterBasin: 76,
      horizonShoulderLift: 88,
      horizonValleyProfile: 72,
      horizonFanReach: 72,
      horizonVanishingPower: 90,
    });
    const classified = classifyHorizonPaths(rendered);
    const shortInteriorSegments = classified.vertical.filter((segment) => {
      const range = getRanges(segment);
      const touchesEdge = range.minX <= bounds.m + 2 || range.maxX >= bounds.width - bounds.m - 2;
      return !touchesEdge && pathLength(segment) < 6;
    });

    expect(shortInteriorSegments).toHaveLength(0);
    expect(rendered.maskPolygons?.length || 0).toBeGreaterThan(0);
  });

  test('engine importState normalizes legacy Horizon line structures to canonical Horizon', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.importState({
      activeLayerId: 'legacy-horizon',
      layers: [
        {
          id: 'legacy-horizon',
          type: 'wavetable',
          name: 'Legacy Horizon',
          params: {
            lineStructure: 'horizon-3d',
            horizonHorizontalLines: 12,
            horizonVerticalLines: 14,
            horizonHeight: 33,
          },
          paramStates: {},
          visible: true,
        },
      ],
    });

    const layer = engine.layers[0];

    expect(layer?.id).toBe('legacy-horizon');
    expect(layer?.params?.lineStructure).toBe('horizon');
  });
});
