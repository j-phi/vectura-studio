/**
 * Regression tests: fill regions must update whenever direct-select reshapes a
 * closed pen path — regardless of whether the edit came from dragging an anchor,
 * dragging a bezier handle, a keyboard nudge, or any other caller of
 * _applySelectionPath().
 *
 * Bug: _applySelectionPath() called engine.generate() but never updated
 * layer.fills[n].region. The fill polygon stayed at the original boundary while
 * the path changed, so the rendered fill geometry no longer matched the path.
 *
 * Fix: _applySelectionPath() now uses a two-phase approach:
 *   1. Before engine.generate(): identify fills whose centroid is inside
 *      layer.paths[pathIndex] (the pre-edit world-space path from the last
 *      engine.generate() call).
 *   2. After engine.generate(): replace their rec.region with the new
 *      layer.paths[pathIndex] (now reflecting the edited geometry).
 *
 * This works for all edit paths (drag, bezier, nudge, etc.) because
 * layer.paths always holds the most recent world-space render of the path.
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

  // Square world-space path (the "old" path before editing, as engine would have set it)
  const squareWorldPath = () => [
    { x: 0,   y: 0   }, { x: 50,  y: 0   }, { x: 100, y: 0   },
    { x: 100, y: 50  }, { x: 100, y: 100  },
    { x: 50,  y: 100 }, { x: 0,   y: 100  }, { x: 0,   y: 50  },
  ];

  // Taller rectangle world-space path (what engine would produce after moving bottom anchors to y=200)
  const tallWorldPath = () => [
    { x: 0,   y: 0   }, { x: 50,  y: 0   }, { x: 100, y: 0   },
    { x: 100, y: 100  }, { x: 100, y: 200 },
    { x: 50,  y: 200 }, { x: 0,   y: 200 }, { x: 0,   y: 100 },
  ];

  const squareAnchors = () => [
    { x: 0,   y: 0,   in: null, out: null },
    { x: 100, y: 0,   in: null, out: null },
    { x: 100, y: 100, in: null, out: null },
    { x: 0,   y: 100, in: null, out: null },
  ];

  const tallAnchors = () => [
    { x: 0,   y: 0,   in: null, out: null },
    { x: 100, y: 0,   in: null, out: null },
    { x: 100, y: 200, in: null, out: null },
    { x: 0,   y: 200, in: null, out: null },
  ];

  // A fill whose region was sampled from the square (centroid ≈ 50, 50)
  const squareFill = () => ({
    id: 'fill-1',
    fillType: 'hatch',
    angle: 45,
    density: 5,
    shiftX: 0,
    shiftY: 0,
    region: [
      { x: 5,  y: 5  }, { x: 95, y: 5  },
      { x: 95, y: 95 }, { x: 5,  y: 95 },
    ],
    innerRegion: null,
  });

  const makeLayer = (fills = [], oldWorldPath = null) => ({
    id: 'layer-1',
    type: 'shape',
    fills,
    sourcePaths: [[]],
    // layer.paths[0] = the world-space path from the last engine.generate() call.
    // This is what _findFillsForPath reads to identify which fills to update.
    paths: oldWorldPath ? [oldWorldPath] : [],
    params: { posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    visible: true,
  });

  // Mock engine.generate updates layer.paths[0] to newPath, simulating the engine.
  const makeEngine = (layer, newWorldPath) => ({
    layers: [layer],
    generate: vi.fn(() => {
      layer.paths = [newWorldPath];
    }),
    computeAllDisplayGeometry: vi.fn(),
  });

  const makeRenderer = (engine) => {
    const { Renderer } = runtime.window.Vectura;
    return new Renderer('main-canvas', engine);
  };

  const centroid = (polygon) => ({
    x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length,
    y: polygon.reduce((s, p) => s + p.y, 0) / polygon.length,
  });

  // -------------------------------------------------------------------
  // Core: fill region updates after any _applySelectionPath call
  // -------------------------------------------------------------------

  test('fill region centroid moves when bottom anchors are shifted downward', () => {
    const fill = squareFill();
    const layer = makeLayer([fill], squareWorldPath());
    const engine = makeEngine(layer, tallWorldPath());
    const renderer = makeRenderer(engine);

    const originalCentroidY = centroid(fill.region).y;  // ≈ 50

    renderer._applySelectionPath({
      layerId: 'layer-1',
      pathIndex: 0,
      anchors: tallAnchors(),
      closed: true,
      selectedIndices: new Set([2, 3]),
      meta: {},
    });

    const newCentroidY = centroid(fill.region).y;
    // The new world path extends to y=200, centroid should be around 100
    expect(newCentroidY).toBeGreaterThan(originalCentroidY + 30);
  });

  test('fill region is set to the new world-space path after edit', () => {
    const fill = squareFill();
    const layer = makeLayer([fill], squareWorldPath());
    const engine = makeEngine(layer, tallWorldPath());
    const renderer = makeRenderer(engine);

    renderer._applySelectionPath({
      layerId: 'layer-1',
      pathIndex: 0,
      anchors: tallAnchors(),
      closed: true,
      selectedIndices: new Set([2, 3]),
      meta: {},
    });

    // region should now match the tall world path
    const maxY = Math.max(...fill.region.map((p) => p.y));
    expect(maxY).toBeCloseTo(200, 0);
  });

  // -------------------------------------------------------------------
  // Open paths are skipped — fills not touched
  // -------------------------------------------------------------------

  test('fill region is NOT changed when path is open', () => {
    const fill = squareFill();
    const layer = makeLayer([fill], squareWorldPath());
    const engine = makeEngine(layer, tallWorldPath());
    const renderer = makeRenderer(engine);

    const regionSnapshot = fill.region.map((p) => ({ ...p }));

    renderer._applySelectionPath({
      layerId: 'layer-1',
      pathIndex: 0,
      anchors: tallAnchors(),
      closed: false,          // ← open path — fills must not be touched
      selectedIndices: new Set([2]),
      meta: {},
    });

    fill.region.forEach((pt, i) => {
      expect(pt.x).toBeCloseTo(regionSnapshot[i].x);
      expect(pt.y).toBeCloseTo(regionSnapshot[i].y);
    });
  });

  // -------------------------------------------------------------------
  // Fill whose centroid is NOT inside the old path is left alone
  // -------------------------------------------------------------------

  test('fill whose centroid is outside the edited path is not touched', () => {
    const farFill = {
      id: 'fill-far',
      fillType: 'hatch',
      region: [
        { x: 450, y: 450 }, { x: 550, y: 450 },
        { x: 550, y: 550 }, { x: 450, y: 550 },
      ],
      innerRegion: null,
    };
    const layer = makeLayer([farFill], squareWorldPath());
    const engine = makeEngine(layer, tallWorldPath());
    const renderer = makeRenderer(engine);

    const regionSnapshot = farFill.region.map((p) => ({ ...p }));

    renderer._applySelectionPath({
      layerId: 'layer-1',
      pathIndex: 0,
      anchors: tallAnchors(),
      closed: true,
      selectedIndices: new Set([2, 3]),
      meta: {},
    });

    farFill.region.forEach((pt, i) => {
      expect(pt.x).toBeCloseTo(regionSnapshot[i].x);
      expect(pt.y).toBeCloseTo(regionSnapshot[i].y);
    });
  });

  // -------------------------------------------------------------------
  // innerRegion (donut) is cleared when region is replaced
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
    const layer = makeLayer([donutFill], squareWorldPath());
    const engine = makeEngine(layer, tallWorldPath());
    const renderer = makeRenderer(engine);

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
  // No layer.paths → graceful no-op (new layer, no previous generate)
  // -------------------------------------------------------------------

  test('gracefully skips fill sync when layer.paths is empty (new layer)', () => {
    const fill = squareFill();
    // layer.paths is empty — simulates a brand-new layer before first generate()
    const layer = makeLayer([fill]);  // no oldWorldPath
    const engine = makeEngine(layer, squareWorldPath());
    const renderer = makeRenderer(engine);

    const regionSnapshot = fill.region.map((p) => ({ ...p }));

    expect(() => {
      renderer._applySelectionPath({
        layerId: 'layer-1',
        pathIndex: 0,
        anchors: squareAnchors(),
        closed: true,
        selectedIndices: new Set(),
        meta: {},
      });
    }).not.toThrow();

    // No old world path to match against → fill region stays unchanged
    fill.region.forEach((pt, i) => {
      expect(pt.x).toBeCloseTo(regionSnapshot[i].x);
      expect(pt.y).toBeCloseTo(regionSnapshot[i].y);
    });
  });

  // -------------------------------------------------------------------
  // _penAnchorsToPolygon utility — kept as a helper for other uses
  // -------------------------------------------------------------------

  test('_penAnchorsToPolygon returns polygon covering the anchor bounds', () => {
    const layer = makeLayer([]);
    const engine = makeEngine(layer, []);
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

  // -------------------------------------------------------------------
  // Works for bezier handle drag (no directDrag set — other call sites)
  // -------------------------------------------------------------------

  test('fill syncs even when directDrag is not set (bezier handle, nudge, etc.)', () => {
    const fill = squareFill();
    const layer = makeLayer([fill], squareWorldPath());
    const engine = makeEngine(layer, tallWorldPath());
    const renderer = makeRenderer(engine);

    // Explicitly ensure directDrag is null — simulates non-drag callers
    renderer.directDrag = null;

    const originalCentroidY = centroid(fill.region).y;

    renderer._applySelectionPath({
      layerId: 'layer-1',
      pathIndex: 0,
      anchors: tallAnchors(),
      closed: true,
      selectedIndices: new Set(),
      meta: {},
    });

    expect(centroid(fill.region).y).toBeGreaterThan(originalCentroidY + 30);
  });
});
