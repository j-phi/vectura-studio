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

  test('periodic contour tracing keeps wrapped vertical joins seam-compatible', () => {
    const trace = runtime.window.Vectura.AlgorithmRegistry._tracePeriodicFillBoundaries;
    expect(typeof trace).toBe('function');

    const result = trace(
      (x, y) => x >= 18 && x <= 22 && (y <= 8 || y >= 80),
      40,
      88,
      { vbMinX: 0, vbMinY: 0, nx: 96, ny: 192 }
    );

    expect(result).toHaveLength(2);
    result.forEach((path) => {
      const only = bbox(path);
      expect(only.minX).toBeCloseTo(17.9, 1);
      expect(only.maxX).toBeCloseTo(22.1, 1);
      const touchesSeam = path.some((pt) => Math.abs(pt.y) < 1e-6 || Math.abs(pt.y - 88) < 1e-6);
      expect(touchesSeam).toBe(true);
      const hasInteriorStemSpur = path.some((pt) => pt.y > 8.5 && pt.y < 79.5);
      expect(hasInteriorStemSpur).toBe(false);
    });
  });

  test('periodic contour tracing does not create short stray fragments for wrapped diagonals', () => {
    const trace = runtime.window.Vectura.AlgorithmRegistry._tracePeriodicFillBoundaries;
    const bandWidth = 6;
    const result = trace(
      (x, y) => {
        const wrappedDx = ((((x - (y * 0.6 + 10)) % 40) + 40) % 40);
        const distance = Math.min(wrappedDx, 40 - wrappedDx);
        return distance <= bandWidth / 2;
      },
      40,
      40,
      { vbMinX: 0, vbMinY: 0, nx: 144, ny: 144 }
    );

    expect(result.length).toBeGreaterThan(0);
    const shortOpenPaths = result.filter((path) => {
      if (!Array.isArray(path) || path.length < 2) return true;
      const first = path[0];
      const last = path[path.length - 1];
      const closed = Math.hypot(first.x - last.x, first.y - last.y) < 0.01;
      if (closed) return false;
      let length = 0;
      for (let i = 0; i + 1 < path.length; i += 1) {
        length += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
      }
      return length < 10;
    });
    expect(shortOpenPaths).toHaveLength(0);
  });

  test('periodic contour tracing uses union semantics across sibling fill shapes', () => {
    const trace = runtime.window.Vectura.AlgorithmRegistry._tracePeriodicFillBoundaries;
    expect(typeof trace).toBe('function');

    const result = trace(
      (x, y) => (
        (x >= 4 && x <= 22 && y >= 8 && y <= 26)
        || (x >= 18 && x <= 36 && y >= 8 && y <= 26)
      ),
      40,
      40,
      { vbMinX: 0, vbMinY: 0, nx: 120, ny: 120 }
    );

    expect(result).toHaveLength(1);
    const only = bbox(result[0]);
    expect(only.minX).toBeCloseTo(4, 1);
    expect(only.maxX).toBeCloseTo(36, 1);
    expect(only.minY).toBeCloseTo(8, 1);
    expect(only.maxY).toBeCloseTo(26, 1);
  });
});
