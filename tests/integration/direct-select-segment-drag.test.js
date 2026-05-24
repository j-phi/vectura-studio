/*
 * Regression: direct-select segment-edge drag must select both endpoints of the
 * clicked segment and move them together as a rigid unit.
 *
 * Key bug fixed: for closed paths, clicking the closing segment (anchor[N-1]→anchor[0])
 * must select BOTH anchor[N-1] AND anchor[0]. The previous formula
 * `Math.min(seg+1, length-1)` would clamp to seg when seg === length-1, producing
 * a single-anchor selection.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('direct-select segment drag', () => {
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

  function makeClosedPath(pts) {
    const path = pts.map((p) => ({ x: p.x, y: p.y }));
    path.meta = {
      kind: 'poly',
      closed: true,
      anchors: pts.map((p) => ({ x: p.x, y: p.y, in: null, out: null })),
    };
    return path;
  }

  function setupLayer(engine, Layer, path) {
    const layer = new Layer('seg-drag-target', 'shape', 'Target');
    layer.sourcePaths = [path];
    layer.params = {
      curves: false, smoothing: 0, simplify: 0,
      posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0,
    };
    engine.layers.push(layer);
    engine.generate(layer.id);
    return layer;
  }

  // ---------------------------------------------------------------------------
  // _selectSegmentAnchors helper — selection logic
  // ---------------------------------------------------------------------------

  test('open path: mid-segment click selects both adjacent anchors', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const layer = setupLayer(engine, Layer, makeOpenPath(pts));

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    expect(sel.closed).toBe(false);
    expect(sel.anchors).toHaveLength(4);

    // Click on segment index 1 (between anchor[1] and anchor[2])
    renderer._selectSegmentAnchors(sel, 1);
    expect([...sel.selectedIndices].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  test('closed path: mid-segment click selects both adjacent anchors', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const layer = setupLayer(engine, Layer, makeClosedPath(pts));

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    expect(sel.closed).toBe(true);
    expect(sel.anchors).toHaveLength(4);

    // Segment 1→2 of a closed square
    renderer._selectSegmentAnchors(sel, 1);
    expect([...sel.selectedIndices].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  test('closed path: closing segment (last→first) wraps to select anchor[N-1] and anchor[0]', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const layer = setupLayer(engine, Layer, makeClosedPath(pts));

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    expect(sel.closed).toBe(true);
    expect(sel.anchors).toHaveLength(4);

    // segmentIndex 3 is the closing segment: anchor[3] → anchor[0]
    renderer._selectSegmentAnchors(sel, 3);
    // Must include BOTH 3 (start) and 0 (wrapped end), not just 3
    expect(sel.selectedIndices.has(3)).toBe(true);
    expect(sel.selectedIndices.has(0)).toBe(true);
    expect(sel.selectedIndices.size).toBe(2);
  });

  test('shift+click on segment adds both endpoints to existing selection', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const layer = setupLayer(engine, Layer, makeOpenPath(pts));

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    // Pre-select anchor[0]
    sel.selectedIndices = new Set([0]);

    // Shift-click segment 2→3 (additive=true)
    renderer._selectSegmentAnchors(sel, 2, true);
    // anchor[0] still selected; anchors[2] and [3] added
    expect(sel.selectedIndices.has(0)).toBe(true);
    expect(sel.selectedIndices.has(2)).toBe(true);
    expect(sel.selectedIndices.has(3)).toBe(true);
  });

  test('shift+click on already-selected segment toggles both endpoints off', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const layer = setupLayer(engine, Layer, makeOpenPath(pts));

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    sel.selectedIndices = new Set([1, 2]);

    // Shift-click segment 1→2 again: should deselect both
    renderer._selectSegmentAnchors(sel, 1, true);
    expect(sel.selectedIndices.has(1)).toBe(false);
    expect(sel.selectedIndices.has(2)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Drag mechanics — both anchors move by the same delta
  // ---------------------------------------------------------------------------

  test('drag after segment click moves both endpoints by the same delta', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const layer = setupLayer(engine, Layer, makeOpenPath(pts));

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    // Simulate segment click: anchors[1] and [2] selected
    renderer._selectSegmentAnchors(sel, 1);
    expect([...sel.selectedIndices].sort((a, b) => a - b)).toEqual([1, 2]);

    // Prime directDrag for anchor[1] with anchor[2] as an otherStart
    const a1 = sel.anchors[1];
    const a2 = sel.anchors[2];
    renderer.directDrag = {
      type: 'anchor',
      index: 1,
      moved: false,
      historyPushed: true,
      anchorStart: { x: a1.x, y: a1.y },
      otherStarts: [{ index: 2, x: a2.x, y: a2.y, inX: undefined, inY: undefined, outX: undefined, outY: undefined }],
      mergeTarget: null,
      grabOffset: null,
      endpointSnapTarget: null,
      lastWorld: null,
    };

    // Move to anchor[1] + (20, 30)
    const targetWorld = { x: a1.x + 20, y: a1.y + 30 };
    renderer.updateDirectDrag(targetWorld, {});

    // Both anchors must have shifted by exactly (20, 30)
    expect(sel.anchors[1].x).toBeCloseTo(100 + 20);
    expect(sel.anchors[1].y).toBeCloseTo(0 + 30);
    expect(sel.anchors[2].x).toBeCloseTo(100 + 20);
    expect(sel.anchors[2].y).toBeCloseTo(100 + 30);
  });

  test('drag on closing segment moves anchor[N-1] and anchor[0] together', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const layer = setupLayer(engine, Layer, makeClosedPath(pts));

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    expect(sel.closed).toBe(true);

    // Closing segment: anchor[3] is the primary drag, anchor[0] is the other
    renderer._selectSegmentAnchors(sel, 3);
    expect(sel.selectedIndices.has(3)).toBe(true);
    expect(sel.selectedIndices.has(0)).toBe(true);

    const a3 = sel.anchors[3];
    const a0 = sel.anchors[0];
    renderer.directDrag = {
      type: 'anchor',
      index: 3,
      moved: false,
      historyPushed: true,
      anchorStart: { x: a3.x, y: a3.y },
      otherStarts: [{ index: 0, x: a0.x, y: a0.y, inX: undefined, inY: undefined, outX: undefined, outY: undefined }],
      mergeTarget: null,
      grabOffset: null,
      endpointSnapTarget: null,
      lastWorld: null,
    };

    // Move anchor[3] by (10, 15)
    const targetWorld = { x: a3.x + 10, y: a3.y + 15 };
    renderer.updateDirectDrag(targetWorld, {});

    expect(sel.anchors[3].x).toBeCloseTo(0 + 10);
    expect(sel.anchors[3].y).toBeCloseTo(100 + 15);
    expect(sel.anchors[0].x).toBeCloseTo(0 + 10);
    expect(sel.anchors[0].y).toBeCloseTo(0 + 15);
  });

  // ---------------------------------------------------------------------------
  // Click within existing multi-selection — full selection preserved
  // ---------------------------------------------------------------------------

  test('clicking on a segment connecting two selected anchors keeps the full multi-selection', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    // Open path with 4 anchors
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const layer = setupLayer(engine, Layer, makeOpenPath(pts));

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    // Pre-select anchors 0, 1, and 2 (a 3-anchor subset)
    sel.selectedIndices = new Set([0, 1, 2]);

    // Simulate a click on segment 1→2 (both endpoints in selectedIndices)
    // The segInSelection path in the pointer-down handler is what we're testing here;
    // invoke it via startDirectDrag with preserveSelection flag (the same flag the handler sets)
    renderer.startDirectDrag({ type: 'anchor', index: 1, preserveSelection: true }, {});

    // All three anchors must remain selected
    expect(sel.selectedIndices.has(0)).toBe(true);
    expect(sel.selectedIndices.has(1)).toBe(true);
    expect(sel.selectedIndices.has(2)).toBe(true);
    expect(sel.selectedIndices.size).toBe(3);
  });

  test('plain click on a segment where one endpoint is not selected replaces selection', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const layer = setupLayer(engine, Layer, makeOpenPath(pts));

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    sel.selectedIndices = new Set([0, 1, 2]);

    // Click on segment 2→3 — anchor 3 is NOT selected, so the full selection should be replaced
    renderer._selectSegmentAnchors(sel, 2, false);
    expect(sel.selectedIndices.size).toBe(2);
    expect(sel.selectedIndices.has(2)).toBe(true);
    expect(sel.selectedIndices.has(3)).toBe(true);
    expect(sel.selectedIndices.has(0)).toBe(false);
  });

  test('dragging within multi-selection moves all selected anchors together', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    // Open L-shaped path: 4 anchors
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }];
    const layer = setupLayer(engine, Layer, makeOpenPath(pts));

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    // Select anchors 0, 1, 2 — then click-drag on segment 1→2 (both selected)
    sel.selectedIndices = new Set([0, 1, 2]);

    const a0 = sel.anchors[0];
    const a1 = sel.anchors[1];
    const a2 = sel.anchors[2];
    renderer.directDrag = {
      type: 'anchor',
      index: 1,
      moved: false,
      historyPushed: true,
      anchorStart: { x: a1.x, y: a1.y },
      otherStarts: [
        { index: 0, x: a0.x, y: a0.y, inX: undefined, inY: undefined, outX: undefined, outY: undefined },
        { index: 2, x: a2.x, y: a2.y, inX: undefined, inY: undefined, outX: undefined, outY: undefined },
      ],
      mergeTarget: null,
      grabOffset: null,
      endpointSnapTarget: null,
      lastWorld: null,
    };

    // Move anchor[1] by (5, -10)
    renderer.updateDirectDrag({ x: a1.x + 5, y: a1.y - 10 }, {});

    // All three selected anchors move by (5, -10)
    expect(sel.anchors[0].x).toBeCloseTo(0 + 5);
    expect(sel.anchors[0].y).toBeCloseTo(0 - 10);
    expect(sel.anchors[1].x).toBeCloseTo(100 + 5);
    expect(sel.anchors[1].y).toBeCloseTo(0 - 10);
    expect(sel.anchors[2].x).toBeCloseTo(100 + 5);
    expect(sel.anchors[2].y).toBeCloseTo(100 - 10);
    // Anchor 3 (not selected) must NOT have moved
    expect(sel.anchors[3].x).toBeCloseTo(200);
    expect(sel.anchors[3].y).toBeCloseTo(100);
  });
});
