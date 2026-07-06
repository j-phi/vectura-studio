const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * The contextual task bar's "Edit Path" button (context-bar.js) switches to
 * the direct-select tool via `setActiveTool('direct')` → `renderer.setTool`
 * on a layer that is ALREADY selected (single-selection is a precondition for
 * the button to appear). Anchor/bezier-handle rendering is gated entirely on
 * `renderer.directSelection` (drawDirectSelection), which was previously only
 * populated by a fresh canvas click via findPathHitAtPoint — so switching
 * tools from the task bar left no handles visible until the user clicked the
 * path again.
 */
describe('Edit Path button establishes a direct selection on the already-selected layer', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const anchoredSquare = () => {
    const anchors = [
      { x: 20, y: 20, in: null, out: null },
      { x: 60, y: 20, in: null, out: null },
      { x: 60, y: 60, in: null, out: null },
      { x: 20, y: 60, in: null, out: null },
    ];
    const pts = anchors.map((a) => ({ x: a.x, y: a.y }));
    pts.push({ x: pts[0].x, y: pts[0].y });
    pts.meta = { kind: 'shape', closed: true, anchors };
    return pts;
  };

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('plain-shape', 'shape', 'Plain');
    layer.sourcePaths = [anchoredSquare()];
    engine.layers.push(layer);
    engine.generate(layer.id);
    engine.computeAllDisplayGeometry();
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    return { engine, renderer, layer };
  }

  test('setTool("direct") on a pre-selected shape layer immediately populates directSelection', async () => {
    const { renderer, layer } = await setup();
    renderer.selectLayer(layer);
    expect(renderer.directSelection).toBeNull();

    renderer.setTool('direct');

    expect(renderer.directSelection?.layerId).toBe(layer.id);
    expect(renderer.directSelection.anchors.length).toBeGreaterThanOrEqual(4);
  });

  test('does not clobber an already-established direct selection on the same layer', async () => {
    const { renderer, layer } = await setup();
    renderer.selectLayer(layer);
    const sel = renderer.setDirectSelection(layer, 0);
    sel.selectedIndices.add(1);

    renderer.setTool('select');
    renderer.setTool('direct');

    expect(renderer.directSelection?.layerId).toBe(layer.id);
    expect(renderer.directSelection.selectedIndices.has(1)).toBe(true);
  });

  test('does nothing when multiple layers are selected (Edit Path button is single-select only)', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const a = new Layer('a', 'shape', 'A');
    a.sourcePaths = [anchoredSquare()];
    const b = new Layer('b', 'shape', 'B');
    b.sourcePaths = [anchoredSquare()];
    engine.layers.push(a, b);
    engine.generate(a.id);
    engine.generate(b.id);
    engine.computeAllDisplayGeometry();
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.selectLayer(a);
    renderer.selectLayer(b, { additive: true });

    renderer.setTool('direct');

    expect(renderer.directSelection).toBeNull();
  });
});
