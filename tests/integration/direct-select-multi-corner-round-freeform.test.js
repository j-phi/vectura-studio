/**
 * Regression: with several corners selected on a FREEFORM (non-shape) path —
 * e.g. text converted to lines — dragging one corner's rounding handle should
 * round ALL selected corners together, matching the parametric-shape behavior
 * already covered by direct-select-multi-corner-round.test.js. Previously
 * updateFreeformCornerDrag only ever spliced the single dragged anchorIndex,
 * so unselected... er, the OTHER selected corners never rounded.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('direct-select multi-corner rounding — freeform paths', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => runtime.cleanup());

  function makeSquarePath() {
    const anchors = [
      { x: 0, y: 0, in: null, out: null },
      { x: 100, y: 0, in: null, out: null },
      { x: 100, y: 100, in: null, out: null },
      { x: 0, y: 100, in: null, out: null },
    ];
    const path = anchors.map((p) => ({ x: p.x, y: p.y }));
    path.push({ x: 0, y: 0 });
    path.meta = { kind: 'poly', closed: true, anchors };
    return path;
  }

  function setup() {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('mcr-freeform', 'shape', 'Square');
    layer.sourcePaths = [makeSquarePath()];
    layer.params = {
      curves: false, smoothing: 0, simplify: 0,
      posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0,
    };
    engine.layers.push(layer);
    engine.generate(layer.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setSelection([layer.id], layer.id);
    renderer.setTool('direct');
    renderer.setDirectSelection(layer, 0);
    return { renderer, engine, layer };
  }

  test('dragging one selected corner rounds all selected freeform corners, not the others', () => {
    const { renderer } = setup();
    const sel = renderer.directSelection;
    expect(sel.anchors).toHaveLength(4);
    // Select the two diagonal hard corners: 0 (0,0) and 2 (100,100).
    sel.selectedIndices = new Set([0, 2]);

    const handles = renderer._getFreeformCornerHandles();
    const handle0 = handles.find((h) => h.anchorIndex === 0);
    expect(handle0).toBeTruthy();

    expect(renderer.beginFreeformCornerDrag(handle0)).toBe(true);
    expect(renderer.freeformCornerDrag.corners).toHaveLength(2);

    // Drag corner 0's handle inward along its bisector.
    renderer.updateFreeformCornerDrag({ x: 15, y: 15 });

    const anchors = renderer.directSelection.anchors;
    // Each rounded corner replaces 1 anchor with 2 => 4 + 2 = 6 anchors total.
    expect(anchors).toHaveLength(6);

    // Corner 0 rounded: no surviving anchor sits exactly at (0,0) anymore.
    expect(anchors.some((a) => Math.hypot(a.x, a.y) < 1)).toBe(false);

    // Corner 2 (100,100) rounded too: no anchor sits exactly at (100,100).
    expect(anchors.some((a) => Math.hypot(a.x - 100, a.y - 100) < 1)).toBe(false);

    // Untouched corners 1 (100,0) and 3 (0,100) remain exact hard corners.
    const untouched = anchors.filter((a) =>
      (Math.abs(a.x - 100) < 1e-6 && Math.abs(a.y) < 1e-6)
      || (Math.abs(a.x) < 1e-6 && Math.abs(a.y - 100) < 1e-6)
    );
    expect(untouched).toHaveLength(2);
  });

  test('dragging an unselected corner still only rounds that single corner', () => {
    const { renderer } = setup();
    const sel = renderer.directSelection;
    sel.selectedIndices = new Set([1]); // only corner 1 selected

    const handles = renderer._getFreeformCornerHandles();
    const handle0 = handles.find((h) => h.anchorIndex === 0); // grabbed corner not in selection
    expect(renderer.beginFreeformCornerDrag(handle0)).toBe(true);
    expect(renderer.freeformCornerDrag.corners).toHaveLength(1);

    renderer.updateFreeformCornerDrag({ x: 15, y: 15 });

    const anchors = renderer.directSelection.anchors;
    // Only corner 0 rounded => 4 + 1 = 5 anchors.
    expect(anchors).toHaveLength(5);
    expect(anchors.some((a) => Math.hypot(a.x, a.y) < 1)).toBe(false);
    // The other three corners remain exact.
    const exactCorners = anchors.filter((a) =>
      (Math.abs(a.x - 100) < 1e-6 && Math.abs(a.y) < 1e-6)
      || (Math.abs(a.x - 100) < 1e-6 && Math.abs(a.y - 100) < 1e-6)
      || (Math.abs(a.x) < 1e-6 && Math.abs(a.y - 100) < 1e-6)
    );
    expect(exactCorners).toHaveLength(3);
  });
});
