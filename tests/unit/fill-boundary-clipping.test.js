/**
 * Regression tests for exact fill boundary clipping.
 *
 * All fill types that use amplitude oscillations (wavelines, zigzag) or radial
 * paths (spiral, radial) must not produce any path point outside the containing
 * polygon. Previously, these fills used point-in-polygon sampling at the
 * baseline scan height, so wave peaks near a curved boundary could poke outside.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Fill boundary clipping — no path points escape the region', () => {
  let runtime;
  let gen;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    gen = runtime.window.Vectura.AlgorithmRegistry._generatePatternFillPaths;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  // Circle polygon approximation (36 segments)
  const circle = (cx, cy, r, steps = 36) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
    }
    return pts;
  };

  // Ray-cast point-in-polygon test (with a small margin for floating-point)
  const polyContainsPoint = (poly, px, py, margin = 1e-4) => {
    // First check with strict poly containment
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi) / (yj - yi)) + xi)
        inside = !inside;
    }
    if (inside) return true;
    // Allow a tiny margin for boundary points produced by exact edge intersection
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-20) continue;
      const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
      const nx = a.x + t * dx - px, ny = a.y + t * dy - py;
      if (nx * nx + ny * ny <= margin * margin) return true;
    }
    return false;
  };

  const assertAllPointsInsideRegion = (paths, region, fillType) => {
    let violationCount = 0;
    for (const path of paths) {
      for (const pt of path) {
        if (!polyContainsPoint(region, pt.x, pt.y)) {
          violationCount++;
        }
      }
    }
    expect(violationCount).toBe(0);
  };

  const circlePoly = circle(50, 50, 40);
  const baseFill = { region: circlePoly, regions: [circlePoly], density: 5, amplitude: 1.5, angle: 30, shiftX: 0, shiftY: 0, padding: 0 };

  test('wavelines: no point escapes a circular region', () => {
    const paths = gen({ ...baseFill, fillType: 'wavelines' });
    expect(paths.length).toBeGreaterThan(0);
    assertAllPointsInsideRegion(paths, circlePoly, 'wavelines');
  });

  test('zigzag: no point escapes a circular region', () => {
    const paths = gen({ ...baseFill, fillType: 'zigzag' });
    expect(paths.length).toBeGreaterThan(0);
    assertAllPointsInsideRegion(paths, circlePoly, 'zigzag');
  });

  test('spiral: no point escapes a circular region', () => {
    const paths = gen({ ...baseFill, fillType: 'spiral' });
    expect(paths.length).toBeGreaterThan(0);
    assertAllPointsInsideRegion(paths, circlePoly, 'spiral');
  });

  test('radial: no point escapes a circular region', () => {
    const paths = gen({ ...baseFill, fillType: 'radial' });
    expect(paths.length).toBeGreaterThan(0);
    assertAllPointsInsideRegion(paths, circlePoly, 'radial');
  });

  test('wavelines: no point escapes with a rotated angle', () => {
    const paths = gen({ ...baseFill, fillType: 'wavelines', angle: 45 });
    expect(paths.length).toBeGreaterThan(0);
    assertAllPointsInsideRegion(paths, circlePoly, 'wavelines@45');
  });

  test('zigzag: no point escapes with a rotated angle', () => {
    const paths = gen({ ...baseFill, fillType: 'zigzag', angle: 45 });
    expect(paths.length).toBeGreaterThan(0);
    assertAllPointsInsideRegion(paths, circlePoly, 'zigzag@45');
  });

  test('hatch: baseline check — no point escapes (already exact)', () => {
    const paths = gen({ ...baseFill, fillType: 'hatch' });
    expect(paths.length).toBeGreaterThan(0);
    assertAllPointsInsideRegion(paths, circlePoly, 'hatch');
  });
});
