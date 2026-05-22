/*
 * Regression: when using direct-select to drag one open endpoint of a path
 * onto the other open endpoint, the closing segment that appears during the
 * drag is deleted upon mouse release.
 *
 * Root cause: endDirectDrag() must set sel.closed=true, revert the dragged
 * anchor to its pre-drag position, and commit via applyDirectPath() so that
 * buildPenPathFromAnchors generates the closing segment into layer.paths.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('direct-select snap-to-close — dragging endpoint onto other endpoint closes the path', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  function makeOpenPath(pts) {
    const path = pts.map((p) => ({ x: p.x, y: p.y }));
    path.meta = {
      kind: 'poly',
      closed: false,
      anchors: pts.map((p) => ({ x: p.x, y: p.y, in: null, out: null })),
    };
    return path;
  }

  function setupLayer(engine, Layer, pts) {
    const path = makeOpenPath(pts);
    const layer = new Layer('snap-close-target', 'shape', 'Target');
    layer.sourcePaths = [path];
    layer.params = {
      curves: false,
      smoothing: 0,
      simplify: 0,
      posX: 0,
      posY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    };
    engine.layers.push(layer);
    engine.generate(layer.id);
    return layer;
  }

  test('dragging anchor[0] onto anchor[lastIdx] closes the path (endpoint-to-endpoint snap)', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    // 4-anchor open path forming three sides of a square.
    const pts = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
      { x: 0,   y: 100 },
    ];
    const layer = setupLayer(engine, Layer, pts);

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    expect(sel).not.toBeNull();
    expect(sel.anchors).toHaveLength(4);
    expect(sel.closed).toBe(false);

    // Simulate dragging anchor[0] to anchor[3]'s position.
    // endDirectDrag reads drag.anchorStart (the pre-drag source position).
    const anchorStart = { x: sel.anchors[0].x, y: sel.anchors[0].y }; // {0, 0}
    sel.anchors[0].x = sel.anchors[3].x; // move to {0, 100}
    sel.anchors[0].y = sel.anchors[3].y;

    renderer.directDrag = {
      type: 'anchor',
      index: 0,
      moved: true,
      historyPushed: true,
      anchorStart,
      mergeTarget: 3,
      otherStarts: [],
      lastWorld: null,
      grabOffset: null,
      endpointSnapTarget: null,
    };

    renderer.endDirectDrag();

    // The path must now be closed.
    expect(layer.sourcePaths[0].meta.closed).toBe(true);
    // All 4 anchors must be preserved (the dragged endpoint is reverted, not removed).
    expect(layer.sourcePaths[0].meta.anchors).toHaveLength(4);
    // The rendered polyline must include a closing segment — it should have enough
    // points to span all four corners plus the return leg.
    const rendered = layer.paths[0];
    expect(Array.isArray(rendered)).toBe(true);
    // A closed 4-anchor straight-line path produces 4 segments × 2 pts each
    // minus shared interior points = at least 5 points.
    expect(rendered.length).toBeGreaterThanOrEqual(5);
    // The closing segment runs from (0,100) back to (0,0), so rendered path
    // must contain a point near (0,0) AND a point near (0,100).
    const hasOrigin = rendered.some((p) => Math.abs(p.x) < 1 && Math.abs(p.y) < 1);
    const hasCorner = rendered.some((p) => Math.abs(p.x) < 1 && Math.abs(p.y - 100) < 1);
    expect(hasOrigin).toBe(true);
    expect(hasCorner).toBe(true);
  });

  test('dragging anchor[lastIdx] onto anchor[0] closes the path (reverse direction)', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const pts = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
      { x: 0,   y: 100 },
    ];
    const layer = setupLayer(engine, Layer, pts);

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    expect(sel).not.toBeNull();
    const lastIdx = sel.anchors.length - 1; // 3
    expect(sel.closed).toBe(false);

    const anchorStart = { x: sel.anchors[lastIdx].x, y: sel.anchors[lastIdx].y };
    sel.anchors[lastIdx].x = sel.anchors[0].x;
    sel.anchors[lastIdx].y = sel.anchors[0].y;

    renderer.directDrag = {
      type: 'anchor',
      index: lastIdx,
      moved: true,
      historyPushed: true,
      anchorStart,
      mergeTarget: 0,
      otherStarts: [],
      lastWorld: null,
      grabOffset: null,
      endpointSnapTarget: null,
    };

    renderer.endDirectDrag();

    expect(layer.sourcePaths[0].meta.closed).toBe(true);
    expect(layer.sourcePaths[0].meta.anchors).toHaveLength(4);
    const rendered = layer.paths[0];
    expect(Array.isArray(rendered)).toBe(true);
    expect(rendered.length).toBeGreaterThanOrEqual(5);
  });

  test('dragging an open path endpoint onto a MIDDLE anchor does NOT close — merges instead', () => {
    // mergeTarget detection now skips intermediate anchors for endpoint drags,
    // but if somehow mergeTarget pointed at a middle node the splice path runs.
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const pts = [
      { x: 0,   y: 0   },
      { x: 50,  y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
    ];
    const layer = setupLayer(engine, Layer, pts);

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    expect(sel).not.toBeNull();

    // Move anchor[0] to anchor[1]'s position; mergeTarget=1 (middle node).
    const anchorStart = { x: sel.anchors[0].x, y: sel.anchors[0].y };
    sel.anchors[0].x = sel.anchors[1].x;
    sel.anchors[0].y = sel.anchors[1].y;

    renderer.directDrag = {
      type: 'anchor',
      index: 0,
      moved: true,
      historyPushed: true,
      anchorStart,
      mergeTarget: 1, // NOT the last endpoint
      otherStarts: [],
      lastWorld: null,
      grabOffset: null,
      endpointSnapTarget: null,
    };

    renderer.endDirectDrag();

    // isEndpointMerge = false → splice branch runs: anchor[0] is removed.
    // 3 anchors remain; path stays open.
    expect(layer.sourcePaths[0].meta.closed).toBe(false);
    expect(layer.sourcePaths[0].meta.anchors).toHaveLength(3);
  });
});
