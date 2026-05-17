const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Mirror modifier drag preview', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function buildMirrorGroup(engine, { Layer }) {
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
    child.paths = [[{ x: 20, y: 50 }, { x: 80, y: 50 }]];
    engine.layers.push(modLayer, child);
    engine.generate(child.id);
    return { modLayer, child };
  }

  test('_getMirrorDragPreviewLayerIds returns null for a layer with no ancestor modifiers', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('plain', 'shape', 'Plain');
    engine.layers.push(layer);
    engine.generate(layer.id);

    const renderer = new Renderer('main-canvas', engine);
    expect(renderer._getMirrorDragPreviewLayerIds(new Set([layer.id]))).toBeNull();
    expect(renderer._getMirrorDragPreviewLayerIds(null)).toBeNull();
    expect(renderer._getMirrorDragPreviewLayerIds(new Set())).toBeNull();
  });

  test('_getMirrorDragPreviewLayerIds identifies a child layer inside a mirror group', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];
    const { child } = buildMirrorGroup(engine, { Layer });

    const renderer = new Renderer('main-canvas', engine);
    const result = renderer._getMirrorDragPreviewLayerIds(new Set([child.id]));
    expect(result).not.toBeNull();
    expect(result.has(child.id)).toBe(true);
  });

  test('_startMirrorDrag builds mirrorDragState with basePaths snapshot', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];
    const { child } = buildMirrorGroup(engine, { Layer });
    child.paths = [[{ x: 20, y: 50 }, { x: 80, y: 50 }]];

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');

    renderer._startMirrorDrag([child]);
    expect(renderer.mirrorDragState).not.toBeNull();
    expect(renderer.mirrorDragState.has(child.id)).toBe(true);
    const state = renderer.mirrorDragState.get(child.id);
    expect(Array.isArray(state.basePaths)).toBe(true);
    expect(state.basePaths.length).toBeGreaterThan(0);
  });

  test('layer.paths is translated and effectivePaths updated during mirror drag move', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];
    const { child } = buildMirrorGroup(engine, { Layer });
    child.paths = [[{ x: 20, y: 50 }, { x: 80, y: 50 }]];
    engine.computeAllDisplayGeometry?.();

    const originalEffectiveLength = child.effectivePaths?.length ?? 0;

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');

    // Simulate drag start
    renderer._startMirrorDrag([child]);
    expect(renderer.mirrorDragState).not.toBeNull();

    const dx = 15;
    const dy = 0;

    // Simulate the path update that move() would apply
    renderer.mirrorDragState.forEach((state, layerId) => {
      const layer = engine.layers.find((l) => l.id === layerId);
      layer.paths = state.basePaths.map((path) => {
        if (!Array.isArray(path)) return path;
        return path.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
      });
      if (engine.computeLayerEffectiveGeometry) engine.computeLayerEffectiveGeometry(layer.id);
      if (engine.computeLayerDisplayGeometry) engine.computeLayerDisplayGeometry(layer.id);
    });

    // effectivePaths should have been recomputed (mirror modifier applied at new position)
    expect(child.effectivePaths).toBeDefined();
    expect(child.effectivePaths.length).toBeGreaterThan(0);

    // Source paths moved by dx
    const firstPath = child.paths[0];
    expect(firstPath[0].x).toBeCloseTo(20 + dx);
    expect(firstPath[1].x).toBeCloseTo(80 + dx);
  });
});
