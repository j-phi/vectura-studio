const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Mirror modifier drag preview', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('_getMirrorDragPreviewLayerIds returns null when no layers have mirror ancestors', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('plain', 'shape', 'Plain');
    engine.layers.push(layer);
    engine.generate(layer.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.tempTransform = { dx: 10, dy: 0, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };

    const result = renderer._getMirrorDragPreviewLayerIds(new Set([layer.id]));
    expect(result).toBeNull();
  });

  test('_getMirrorDragPreviewLayerIds returns the id of a child layer inside a mirror modifier', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];

    const modLayer = new Layer('mod', 'shape', 'Mirror Group');
    modLayer.isGroup = true;
    modLayer.containerRole = 'modifier';
    modLayer.groupType = 'modifier';
    modLayer.modifier = {
      type: 'mirror',
      enabled: true,
      mirrors: [{ id: 'mx1', enabled: true, type: 'line', angle: 90, xShift: 0, yShift: 0, replacedSide: 'negative' }],
    };

    const child = new Layer('child', 'shape', 'Child');
    child.parentId = modLayer.id;

    engine.layers.push(modLayer, child);
    engine.generate(child.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.tempTransform = { dx: 10, dy: 0, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };

    const result = renderer._getMirrorDragPreviewLayerIds(new Set([child.id]));
    expect(result).not.toBeNull();
    expect(result.has(child.id)).toBe(true);
  });

  test('_getMirrorDragPreviewLayerIds returns null for empty or missing selectedIds', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];

    const renderer = new Renderer('main-canvas', engine);
    expect(renderer._getMirrorDragPreviewLayerIds(null)).toBeNull();
    expect(renderer._getMirrorDragPreviewLayerIds(new Set())).toBeNull();
  });

  test('drawMirrorDragPreview does not throw for a layer inside a mirror group with paths', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];

    const modLayer = new Layer('mod2', 'shape', 'Mirror Group 2');
    modLayer.isGroup = true;
    modLayer.containerRole = 'modifier';
    modLayer.groupType = 'modifier';
    modLayer.modifier = {
      type: 'mirror',
      enabled: true,
      mirrors: [{ id: 'mx2', enabled: true, type: 'line', angle: 90, xShift: 0, yShift: 0, replacedSide: 'negative' }],
    };

    const child = new Layer('child2', 'shape', 'Child 2');
    child.parentId = modLayer.id;
    engine.layers.push(modLayer, child);
    engine.generate(child.id);
    child.paths = [[{ x: 20, y: 50 }, { x: 80, y: 50 }]];

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.tempTransform = { dx: 10, dy: 0, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };

    const mirrorDragLayers = new Set([child.id]);
    expect(() => renderer.drawMirrorDragPreview(mirrorDragLayers)).not.toThrow();
  });
});
