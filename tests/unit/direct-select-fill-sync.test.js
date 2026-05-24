/**
 * Regression test: fill regions must update when direct select reshapes a closed path.
 *
 * Bug: _applySelectionPath() called engine.generate() but never updated layer.fills[n].region.
 * The fill polygon stayed at the original boundary while the path moved, so the rendered
 * fill geometry no longer matched the new path shape.
 *
 * Fix: _applySelectionPath() now calls _syncFillRegionsToEditedPath() before engine.generate(),
 * which re-derives rec.region from the current anchor positions using centroid-in-oldPolygon
 * matching. Renderer.startDirectDrag() snapshots the initial path polygon so subsequent frames
 * have a "previous boundary" to match against.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Direct-select fill sync', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  // --- helpers ---

  const makeLayer = (fills = []) => ({
    id: 'layer-1',
    type: 'shape',
    fills,
    sourcePaths: [[]],   // one empty path at index 0
    paths: [],
    params: { posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    visible: true,
  });

  const makeEngine = (layer) => ({
    layers: [layer],
    generate: vi.fn(),
    computeAllDisplayGeometry: vi.fn(),
  });

  const makeRenderer = (engine) => {
    const { Renderer } = runtime.window.Vectura;
    return new Renderer('main-canvas', engine);
  };

  // Square anchors: 0,0 → 100,0 → 100,100 → 0,100 (closed)
  const squareAnchors = () => [
    { x: 0,   y: 0,   in: null, out: null },
    { x: 100, y: 0,   in: null, out: null },
    { x: 100, y: 100, in: null, out: null },
    { x: 0,   y: 100, in: null, out: null },
  ];

  // Modified anchors: bottom edge shifted to y=200 (making a taller rectangle)
  const tallAnchors = () => [
    { x: 0,   y: 0,   in: null, out: null },
    { x: 100, y: 0,   in: null, out: null },
    { x: 100, y: 200, in: null, out: null },
    { x: 0,   y: 200, in: null, out: null },
  ];

  // A fill whose region polygon lies inside the square (centroid at ~50,50)
  const squareFill = () => ({
    id: 'fill-1',
    fillType: 'hatch',
    angle: 45,
    density: 5,
    shiftX: 0,
    shiftY: 0,
    region: [
      { x: 5,  y: 5  },
      { x: 95, y: 5  },
      { x: 95, y: 95 },
      { x: 5,  y: 95 },
    ],
    innerRegion: null,
  });

  const centroid = (polygon) => ({
    x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length,
    y: polygon.reduce((s, p) => s + p.y, 0) / polygon.length,
  });

  // -------------------------------------------------------------------
  // Test: fill region updates when an endpoint is moved via direct select
  // -------------------------------------------------------------------

  test('fill region centroid moves downward after bottom anchors are shifted', () => {
    const fill = squareFill();
    const layer = makeLayer([fill]);
    const engine = makeEngine(layer);
    const renderer = makeRenderer(engine);

    // Simulate startDirectDrag(): snapshot the old boundary from the initial anchors
    renderer.directDrag = {
      oldPathPolygon: renderer._penAnchorsToPolygon(squareAnchors(), true),
    };

    const originalCentroidY = centroid(fill.region).y;  // ≈ 50

    // Simulate the user having moved the bottom anchors to y=200
    renderer._applySelectionPath({
      layerId: 'layer-1',
      pathIndex: 0,
      anchors: tallAnchors(),
      closed: true,
      selectedIndices: new Set([2, 3]),
      meta: {},
    });

    const newCentroidY = centroid(fill.region).y;

    // Fill region should now be centred on the taller rectangle (~100) not the square (~50)
    expect(newCentroidY).toBeGreaterThan(originalCentroidY + 20);
  });

  // -------------------------------------------------------------------
  // Test: open paths (non-closed) are skipped — fills not touched
  // -------------------------------------------------------------------

  test('fill region is NOT changed when path is open', () => {
    const fill = squareFill();
    const layer = makeLayer([fill]);
    const engine = makeEngine(layer);
    const renderer = makeRenderer(engine);

    renderer.directDrag = {
      oldPathPolygon: renderer._penAnchorsToPolygon(squareAnchors(), true),
    };

    const regionSnapshot = fill.region.map((p) => ({ ...p }));

    renderer._applySelectionPath({
      layerId: 'layer-1',
      pathIndex: 0,
      anchors: tallAnchors(),
      closed: false,          // ← open path
      selectedIndices: new Set([2]),
      meta: {},
    });

    // Region must be unchanged
    fill.region.forEach((pt, i) => {
      expect(pt.x).toBeCloseTo(regionSnapshot[i].x);
      expect(pt.y).toBeCloseTo(regionSnapshot[i].y);
    });
  });

  // -------------------------------------------------------------------
  // Test: fill whose centroid is outside the old polygon is not touched
  // -------------------------------------------------------------------

  test('fill whose centroid is outside the edited path is left alone', () => {
    // Fill is far away (at x=500, y=500) — centroid not inside the 0-100 square
    const farFill = {
      id: 'fill-far',
      fillType: 'hatch',
      region: [
        { x: 450, y: 450 }, { x: 550, y: 450 },
        { x: 550, y: 550 }, { x: 450, y: 550 },
      ],
      innerRegion: null,
    };

    const layer = makeLayer([farFill]);
    const engine = makeEngine(layer);
    const renderer = makeRenderer(engine);

    renderer.directDrag = {
      oldPathPolygon: renderer._penAnchorsToPolygon(squareAnchors(), true),
    };

    const regionSnapshot = farFill.region.map((p) => ({ ...p }));

    renderer._applySelectionPath({
      layerId: 'layer-1',
      pathIndex: 0,
      anchors: tallAnchors(),
      closed: true,
      selectedIndices: new Set([2, 3]),
      meta: {},
    });

    // Far fill should be untouched
    farFill.region.forEach((pt, i) => {
      expect(pt.x).toBeCloseTo(regionSnapshot[i].x);
      expect(pt.y).toBeCloseTo(regionSnapshot[i].y);
    });
  });

  // -------------------------------------------------------------------
  // Test: oldPathPolygon is updated for the next drag frame
  // -------------------------------------------------------------------

  test('oldPathPolygon updates to the new boundary after each apply', () => {
    const fill = squareFill();
    const layer = makeLayer([fill]);
    const engine = makeEngine(layer);
    const renderer = makeRenderer(engine);

    renderer.directDrag = {
      oldPathPolygon: renderer._penAnchorsToPolygon(squareAnchors(), true),
    };

    renderer._applySelectionPath({
      layerId: 'layer-1',
      pathIndex: 0,
      anchors: tallAnchors(),
      closed: true,
      selectedIndices: new Set([2, 3]),
      meta: {},
    });

    // After the apply, oldPathPolygon should reflect the tall rectangle
    const newOld = renderer.directDrag.oldPathPolygon;
    expect(newOld).toBeDefined();
    const maxY = Math.max(...newOld.map((p) => p.y));
    expect(maxY).toBeGreaterThan(150);  // tall rectangle reaches y=200
  });

  // -------------------------------------------------------------------
  // Test: innerRegion (donut) is cleared when region is replaced
  // -------------------------------------------------------------------

  test('innerRegion is cleared when fill region is replaced', () => {
    const donutFill = {
      id: 'fill-donut',
      fillType: 'hatch',
      region: [
        { x: 5, y: 5 }, { x: 95, y: 5 },
        { x: 95, y: 95 }, { x: 5, y: 95 },
      ],
      innerRegion: [
        { x: 30, y: 30 }, { x: 70, y: 30 },
        { x: 70, y: 70 }, { x: 30, y: 70 },
      ],
    };

    const layer = makeLayer([donutFill]);
    const engine = makeEngine(layer);
    const renderer = makeRenderer(engine);

    renderer.directDrag = {
      oldPathPolygon: renderer._penAnchorsToPolygon(squareAnchors(), true),
    };

    renderer._applySelectionPath({
      layerId: 'layer-1',
      pathIndex: 0,
      anchors: tallAnchors(),
      closed: true,
      selectedIndices: new Set([2, 3]),
      meta: {},
    });

    expect(donutFill.innerRegion).toBeNull();
  });

  // -------------------------------------------------------------------
  // Test: _penAnchorsToPolygon returns sensible polygon for a square
  // -------------------------------------------------------------------

  test('_penAnchorsToPolygon returns polygon covering the anchor bounds', () => {
    const fill = squareFill();
    const layer = makeLayer([fill]);
    const engine = makeEngine(layer);
    const renderer = makeRenderer(engine);

    const poly = renderer._penAnchorsToPolygon(squareAnchors(), true);

    expect(Array.isArray(poly)).toBe(true);
    expect(poly.length).toBeGreaterThan(4);

    const minX = Math.min(...poly.map((p) => p.x));
    const maxX = Math.max(...poly.map((p) => p.x));
    const minY = Math.min(...poly.map((p) => p.y));
    const maxY = Math.max(...poly.map((p) => p.y));

    expect(minX).toBeCloseTo(0, 0);
    expect(maxX).toBeCloseTo(100, 0);
    expect(minY).toBeCloseTo(0, 0);
    expect(maxY).toBeCloseTo(100, 0);
  });
});
