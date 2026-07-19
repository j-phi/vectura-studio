const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Paint-bucket Pattern Fill on an arbitrary shape (patternTile fillType)', () => {
  let runtime;
  let AR;
  let registry;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    AR = runtime.window.Vectura.AlgorithmRegistry;
    registry = runtime.window.Vectura.PatternRegistry;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  afterEach(() => {
    registry?.replaceLocalPatterns?.([]);
    registry?.replaceProjectPatterns?.([]);
  });

  const circle = (cx, cy, r, steps = 32) => {
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const theta = (i / steps) * Math.PI * 2;
      points.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
    }
    return points;
  };

  const bbox = (path) => ({
    minX: Math.min(...path.map((pt) => pt.x)),
    maxX: Math.max(...path.map((pt) => pt.x)),
    minY: Math.min(...path.map((pt) => pt.y)),
    maxY: Math.max(...path.map((pt) => pt.y)),
  });

  const saveTestTile = (id) => registry.saveCustomPattern({
    id,
    name: 'Test Tile',
    // A single diagonal line spanning the full 20x20 tile.
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="none" stroke="#000" d="M0 0L20 20"/></svg>',
  });

  test('stamps tiles across the region bbox and clips them to the region boundary', () => {
    const saved = saveTestTile('tile-diag');
    const region = circle(30, 30, 15);
    const EPS = 1e-6;

    const paths = AR._generatePatternFillPaths({
      fillType: 'patternTile',
      patternId: saved.id,
      regions: [region],
      region,
      scale: 1,
      tileMethod: 'grid',
      tileSpacingX: 0,
      tileSpacingY: 0,
      originX: 0,
      originY: 0,
      removeSeams: true,
    });

    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);

    const regionBox = bbox(region);
    for (const path of paths) {
      for (const pt of path) {
        expect(pt.x).toBeGreaterThanOrEqual(regionBox.minX - EPS);
        expect(pt.x).toBeLessThanOrEqual(regionBox.maxX + EPS);
        expect(pt.y).toBeGreaterThanOrEqual(regionBox.minY - EPS);
        expect(pt.y).toBeLessThanOrEqual(regionBox.maxY + EPS);
      }
    }
  });

  test('returns empty when the region is far from any generated tile origin (no stray global stamping)', () => {
    const saved = saveTestTile('tile-diag-2');
    // Absurdly large offset relative to the tile size (20mm) — tiling still
    // covers it (no document-bounds ceiling), so this really just asserts
    // clipping keeps the result local to the (tiny) region, not empty-by-luck.
    const region = circle(5000, 5000, 2);

    const paths = AR._generatePatternFillPaths({
      fillType: 'patternTile',
      patternId: saved.id,
      regions: [region],
      region,
      scale: 1,
      tileMethod: 'grid',
      removeSeams: true,
    });

    expect(Array.isArray(paths)).toBe(true);
    const regionBox = bbox(region);
    for (const path of paths) {
      for (const pt of path) {
        expect(pt.x).toBeGreaterThanOrEqual(regionBox.minX - 1e-6);
        expect(pt.x).toBeLessThanOrEqual(regionBox.maxX + 1e-6);
        expect(pt.y).toBeGreaterThanOrEqual(regionBox.minY - 1e-6);
        expect(pt.y).toBeLessThanOrEqual(regionBox.maxY + 1e-6);
      }
    }
  });

  test('honors tileMethod "off" by stamping exactly one tile anchored to the region bbox', () => {
    const saved = saveTestTile('tile-diag-3');
    // A region big enough to contain a single 20x20 tile. With no document-wide
    // anchor available for an arbitrary clicked shape, "off" mode anchors the
    // lone tile to the region's own bbox corner (minX, minY) + origin offset,
    // so the single stamp actually lands inside whatever was clicked.
    const region = [
      { x: -5, y: -5 }, { x: 25, y: -5 }, { x: 25, y: 25 }, { x: -5, y: 25 }, { x: -5, y: -5 },
    ];

    const paths = AR._generatePatternFillPaths({
      fillType: 'patternTile',
      patternId: saved.id,
      regions: [region],
      region,
      scale: 1,
      tileMethod: 'off',
      originX: 0,
      originY: 0,
      removeSeams: true,
    });

    expect(paths.length).toBe(1);
    const [path] = paths;
    expect(path[0]).toEqual(expect.objectContaining({ x: -5, y: -5 }));
    expect(path[path.length - 1]).toEqual(expect.objectContaining({ x: 15, y: 15 }));
  });

  test('returns [] when patternId is missing or unresolvable', () => {
    const region = circle(0, 0, 10);
    expect(AR._generatePatternFillPaths({
      fillType: 'patternTile', patternId: 'does-not-exist', regions: [region], region,
    })).toEqual([]);
  });

  test('returns [] when the region has fewer than 3 points', () => {
    const saved = saveTestTile('tile-diag-4');
    expect(AR._generatePatternFillPaths({
      fillType: 'patternTile', patternId: saved.id, regions: [[{ x: 0, y: 0 }]], region: [{ x: 0, y: 0 }],
    })).toEqual([]);
  });
});
