const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Lasso → direct selection (vertices, not whole layers)', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('_applyDirectLasso populates directSelection.selectedIndices for vertices inside the polygon and ignores vertices outside', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const layer = new Layer('lasso-target', 'shape', 'Target');
    layer.sourcePaths = [[
      { x: 10, y: 50 },
      { x: 30, y: 50 },
      { x: 50, y: 50 },
      { x: 70, y: 50 },
      { x: 90, y: 50 },
    ]];
    engine.layers.push(layer);
    engine.computeAllDisplayGeometry();

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    // Polygon enclosing only vertices at indices 1 and 2 (x ∈ [20, 60]).
    const poly = [
      { x: 20, y: 30 },
      { x: 60, y: 30 },
      { x: 60, y: 70 },
      { x: 20, y: 70 },
    ];

    renderer._applyDirectLasso(poly);

    expect(renderer.directSelection).not.toBeNull();
    expect(renderer.directSelection.layerId).toBe(layer.id);
    const picked = Array.from(renderer.directSelection.selectedIndices).sort((a, b) => a - b);
    expect(picked).toEqual([1, 2]);
  });

  test('_applyDirectLasso does NOT select the whole layer for a polygon that touches the layer but encloses no vertex', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const layer = new Layer('lasso-no-vertex', 'shape', 'No Vertex');
    layer.sourcePaths = [[
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ]];
    engine.layers.push(layer);
    engine.computeAllDisplayGeometry();

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    // Polygon crosses the segment between the two endpoints but encloses neither.
    const poly = [
      { x: 40, y: 30 },
      { x: 60, y: 30 },
      { x: 60, y: 70 },
      { x: 40, y: 70 },
    ];

    renderer._applyDirectLasso(poly);

    expect(renderer.directSelection).toBeNull();
    expect(renderer.selectedLayerIds.has(layer.id)).toBe(false);
  });
});
