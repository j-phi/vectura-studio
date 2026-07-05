/*
 * Regression: scissors-cutting a CLOSED path at an anchor produces one OPEN
 * path whose first and last anchors are coincident (the cut seam). The
 * renderer's pathToAnchors must respect the explicit meta.closed === false —
 * previously `closedByPoints` (first == last within epsilon) overrode it, so
 * the next setDirectSelection/refreshDirectSelection re-parsed the cut ring
 * as CLOSED, merged the two seam endpoints back into one anchor, and the
 * write-back re-closed the source path — silently undoing the cut (dragging
 * the seam point moved "both sides" as if never cut).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('direct-select after scissors cut — cut ring stays open', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  function makeClosedSquare() {
    const anchors = [
      { x: 0, y: 0, in: null, out: null },
      { x: 100, y: 0, in: null, out: null },
      { x: 100, y: 100, in: null, out: null },
      { x: 0, y: 100, in: null, out: null },
    ];
    const path = anchors.map((p) => ({ x: p.x, y: p.y }));
    path.push({ x: 0, y: 0 }); // closing point
    path.meta = { kind: 'poly', closed: true, anchors };
    return path;
  }

  function setupCutRing() {
    const { VectorEngine, Layer, Renderer, PathEditOps } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('cut-ring-target', 'shape', 'Target');
    layer.sourcePaths = [makeClosedSquare()];
    layer.params = {
      curves: false, smoothing: 0, simplify: 0,
      posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0,
    };
    engine.layers.push(layer);
    engine.generate(layer.id);

    const app = { engine, pushHistory() {} };
    const res = PathEditOps.cutAtAnchors(
      [{ layerId: layer.id, pathIndex: 0, anchorIndex: 2 }], { app }
    );
    expect(res.changed).toBe(true);
    // Sanity (ops-level contract, already covered by unit tests): one OPEN
    // path, 5 anchors, coincident seam endpoints at the cut anchor (100,100).
    expect(layer.sourcePaths).toHaveLength(1);
    expect(layer.sourcePaths[0].meta.closed).toBe(false);
    expect(layer.sourcePaths[0].meta.anchors).toHaveLength(5);

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);
    return { engine, layer, renderer };
  }

  test('setDirectSelection parses the cut ring as OPEN with both seam anchors', () => {
    const { layer, renderer } = setupCutRing();
    const sel = renderer.setDirectSelection(layer, 0);
    expect(sel).not.toBeNull();
    // Previously: closed=true and the coincident seam endpoints merged to 4.
    expect(sel.closed).toBe(false);
    expect(sel.anchors).toHaveLength(5);
    expect(sel.anchors[0]).toMatchObject({ x: 100, y: 100 });
    expect(sel.anchors[4]).toMatchObject({ x: 100, y: 100 });
  });

  test('dragging one seam endpoint separates the pieces instead of re-closing', () => {
    const { layer, renderer } = setupCutRing();
    const sel = renderer.setDirectSelection(layer, 0);
    // Move only the seam START anchor (as a direct-selection drag would).
    sel.anchors[0].x = 140;
    sel.anchors[0].y = 150;
    renderer.applyDirectPath();

    const meta = layer.sourcePaths[0].meta;
    // The write-back must keep the path OPEN...
    expect(meta.closed).toBe(false);
    expect(meta.anchors).toHaveLength(5);
    // ...move only the dragged seam endpoint...
    expect(meta.anchors[0]).toMatchObject({ x: 140, y: 150 });
    // ...and leave its coincident twin in place (the cut is real).
    expect(meta.anchors[4]).toMatchObject({ x: 100, y: 100 });
  });

  function beginAnchorDrag(renderer, sel, index) {
    renderer.directDrag = {
      type: 'anchor',
      index,
      moved: false,
      historyPushed: true,
      anchorStart: { x: sel.anchors[index].x, y: sel.anchors[index].y },
      otherStarts: [],
      mergeTarget: null,
      oldPathPolygon: null,
    };
  }

  test('a jitter-click on the seam point does NOT re-weld the cut', () => {
    const { layer, renderer } = setupCutRing();
    const sel = renderer.setDirectSelection(layer, 0);
    sel.selectedIndices = new Set([0]);
    // Simulate pointerdown on the seam anchor (100,100) followed by a
    // sub-pixel pointermove before release — what a real mouse click does.
    beginAnchorDrag(renderer, sel, 0);
    renderer.updateDirectDrag({ x: 100.4, y: 100.2 }, {});
    renderer.endDirectDrag();

    const meta = layer.sourcePaths[0].meta;
    // Previously the coincident twin endpoint was detected as a merge target
    // at distance ~0 and the release spliced it → closed:true, 4 anchors.
    expect(meta.closed).toBe(false);
    expect(meta.anchors).toHaveLength(5);
  });

  test('dragging the seam endpoint away and back onto the twin still joins', () => {
    const { layer, renderer } = setupCutRing();
    const sel = renderer.setDirectSelection(layer, 0);
    sel.selectedIndices = new Set([0]);
    beginAnchorDrag(renderer, sel, 0);
    renderer.updateDirectDrag({ x: 160, y: 160 }, {}); // leave the seam region
    renderer.updateDirectDrag({ x: 100.5, y: 100.5 }, {}); // drop back on twin
    renderer.endDirectDrag();

    const meta = layer.sourcePaths[0].meta;
    // Intentional endpoint→endpoint merge must keep working: ring re-closes.
    expect(meta.closed).toBe(true);
    expect(meta.anchors).toHaveLength(4);
  });

  test('refreshDirectSelection keeps the open parse (no re-weld on refresh)', () => {
    const { layer, renderer } = setupCutRing();
    const sel = renderer.setDirectSelection(layer, 0);
    sel.selectedIndices = new Set([4]);
    renderer.refreshDirectSelection();
    expect(renderer.directSelection.closed).toBe(false);
    expect(renderer.directSelection.anchors).toHaveLength(5);
    expect([...renderer.directSelection.selectedIndices]).toEqual([4]);
  });
});
