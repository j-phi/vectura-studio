const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Pattern fill boundary tracing', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const rect = (x, y, w, h) => ([
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ]);

  const circle = (cx, cy, r, steps = 24) => {
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const theta = (i / steps) * Math.PI * 2;
      points.push({
        x: cx + Math.cos(theta) * r,
        y: cy + Math.sin(theta) * r,
      });
    }
    return points;
  };

  const bbox = (path) => ({
    minX: Math.min(...path.map((pt) => pt.x)),
    maxX: Math.max(...path.map((pt) => pt.x)),
    minY: Math.min(...path.map((pt) => pt.y)),
    maxY: Math.max(...path.map((pt) => pt.y)),
  });

  test('removes additive subpaths fully swallowed by a larger fill silhouette', () => {
    const trace = runtime.window.Vectura.AlgorithmRegistry._traceFilledGroupVisibleBoundaries;
    expect(typeof trace).toBe('function');

    const outer = rect(0, 0, 40, 40);
    const swallowed = circle(20, 20, 4);
    const result = trace([outer, swallowed]);

    expect(result).toHaveLength(1);
    const only = bbox(result[0]);
    expect(only.minX).toBeCloseTo(0, 3);
    expect(only.maxX).toBeCloseTo(40, 3);
    expect(only.minY).toBeCloseTo(0, 3);
    expect(only.maxY).toBeCloseTo(40, 3);
  });

  test('merges adjacent filled rectangles into one outer perimeter', () => {
    const trace = runtime.window.Vectura.AlgorithmRegistry._traceFilledGroupVisibleBoundaries;

    const left = rect(0, 0, 20, 20);
    const right = rect(20, 0, 20, 20);
    const result = trace([left, right]);

    expect(result).toHaveLength(1);
    const only = bbox(result[0]);
    expect(only.minX).toBeCloseTo(0, 3);
    expect(only.maxX).toBeCloseTo(40, 3);
    expect(only.minY).toBeCloseTo(0, 3);
    expect(only.maxY).toBeCloseTo(20, 3);
    expect(result[0].length).toBeGreaterThanOrEqual(5);
  });

  test('merges vertically adjacent filled rectangles into one seam-compatible perimeter', () => {
    const trace = runtime.window.Vectura.AlgorithmRegistry._traceFilledGroupVisibleBoundaries;

    const top = rect(0, 0, 40, 44);
    const bottom = rect(0, 44, 40, 44);
    const result = trace([top, bottom]);

    expect(result).toHaveLength(1);
    const only = bbox(result[0]);
    expect(only.minX).toBeCloseTo(0, 3);
    expect(only.maxX).toBeCloseTo(40, 3);
    expect(only.minY).toBeCloseTo(0, 3);
    expect(only.maxY).toBeCloseTo(88, 3);
    const hasInternalSeamSegment = result[0].some((pt, index, path) => {
      const next = path[index + 1];
      if (!next) return false;
      return Math.abs(pt.y - 44) < 0.001
        && Math.abs(next.y - 44) < 0.001
        && Math.abs(pt.x - next.x) > 0.001;
    });
    expect(hasInternalSeamSegment).toBe(false);
  });
});
