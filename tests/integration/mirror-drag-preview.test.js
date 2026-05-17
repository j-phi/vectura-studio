const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Mirror modifier drag preview', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('_computeMirrorDragPreviewPaths returns null for layer with no ancestor modifiers', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('plain-layer', 'shape', 'Plain');
    engine.layers.push(layer);
    engine.generate(layer.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');

    const temp = { dx: 20, dy: 0, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
    const result = renderer._computeMirrorDragPreviewPaths(layer, temp);
    expect(result).toBeNull();
  });

  test('_computeMirrorDragPreviewPaths re-reflects paths at the dragged position', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer, Modifiers } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];

    // Build a modifier layer with one vertical mirror (angle=90 → vertical axis at center)
    const modLayer = new Layer('mod-layer', 'shape', 'Mirror Group');
    modLayer.isGroup = true;
    modLayer.containerRole = 'modifier';
    modLayer.groupType = 'modifier';
    modLayer.modifier = {
      type: 'mirror',
      enabled: true,
      mirrors: [
        {
          id: 'mx1',
          enabled: true,
          type: 'line',
          angle: 90,
          xShift: 0,
          yShift: 0,
          replacedSide: 'negative',
        },
      ],
    };

    // Child layer with a simple path on the left side of the vertical axis
    const child = new Layer('child-layer', 'shape', 'Child');
    child.parentId = modLayer.id;

    engine.layers.push(modLayer, child);
    engine.generate(child.id);

    // Manually set source paths (left of center at x=100 for a 200-wide doc)
    child.paths = [
      [
        { x: 20, y: 50 },
        { x: 80, y: 50 },
      ],
    ];
    // Recompute effective paths so the layer has a mirror applied at rest
    engine.computeAllDisplayGeometry?.();

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');

    const temp = { dx: 10, dy: 0, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
    const result = renderer._computeMirrorDragPreviewPaths(child, temp);

    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // The preview must differ from naively translating effectivePaths by (dx, dy):
    // a correct mirror preview has the reflected copy at a different position than
    // just shifting the pre-computed effectivePaths.
    if (child.effectivePaths?.length) {
      const naiveTranslated = child.effectivePaths.map((path) =>
        path.map((pt) => ({ x: pt.x + temp.dx, y: pt.y + temp.dy }))
      );
      const resultFlat = result.flatMap((p) => p.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)).join('|');
      const naiveFlat = naiveTranslated.flatMap((p) => p.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)).join('|');
      expect(resultFlat).not.toBe(naiveFlat);
    }
  });

  test('_computeMirrorDragPreviewPaths returns null when tempTransform is null', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];
    const child = new Layer('child', 'shape', 'Child');
    engine.layers.push(child);
    engine.generate(child.id);

    const renderer = new Renderer('main-canvas', engine);
    expect(renderer._computeMirrorDragPreviewPaths(child, null)).toBeNull();
    expect(renderer._computeMirrorDragPreviewPaths(null, { dx: 5, dy: 0 })).toBeNull();
  });
});
