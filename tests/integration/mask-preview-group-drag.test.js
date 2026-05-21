const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Mask preview when mask + child are dragged together', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const buildScene = (window) => {
    const { VectorEngine, Renderer, Layer } = window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const maskParent = new Layer('group-drag-mask-parent', 'shape', 'Mask Parent');
    maskParent.sourcePaths = [[
      { x: 80, y: 80 }, { x: 160, y: 80 }, { x: 160, y: 140 }, { x: 80, y: 140 }, { x: 80, y: 80 },
    ]];
    maskParent.mask.enabled = true;

    const child = new Layer('group-drag-mask-child', 'shape', 'Masked Child');
    child.parentId = maskParent.id;
    child.sourcePaths = [[{ x: 20, y: 110 }, { x: 220, y: 110 }]];

    engine.layers.push(maskParent, child);
    engine.generate(maskParent.id);
    engine.generate(child.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    return { engine, renderer, maskParent, child };
  };

  test('selecting the whole mask group suppresses re-mask preview so geometry moves rigidly', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { renderer, maskParent, child } = buildScene(runtime.window);

    renderer.setSelection([maskParent.id, child.id], maskParent.id);
    renderer.startMaskPreviewForSelection(renderer.getSelectedLayers());

    // The only masked descendant is also selected and moving with the mask, so
    // there is nothing to re-mask: the preview must be empty/null and the child
    // must NOT be skipped during normal drawing (it renders rigidly with tempTransform).
    expect(renderer.maskPreview).toBeNull();
    expect(renderer.shouldSkipLayerForMaskPreview(child)).toBe(false);
  });

  test('selecting only the mask still re-masks the unselected child', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { renderer, maskParent, child } = buildScene(runtime.window);

    renderer.setSelection([maskParent.id], maskParent.id);
    renderer.startMaskPreviewForSelection(renderer.getSelectedLayers());

    expect(renderer.maskPreview).toBeTruthy();
    expect(renderer.maskPreview.descendantIds.has(child.id)).toBe(true);
    expect(renderer.maskPreview.entries.map((e) => e.layerId)).toContain(child.id);
    expect(renderer.shouldSkipLayerForMaskPreview(child)).toBe(true);
  });

  test('mixed selection re-masks only the unselected descendant', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { engine, renderer, maskParent, child } = runtimeScene(runtime.window);

    // second child under the same mask, left unselected
    const { Layer } = runtime.window.Vectura;
    const child2 = new Layer('group-drag-mask-child-2', 'shape', 'Masked Child 2');
    child2.parentId = maskParent.id;
    child2.sourcePaths = [[{ x: 20, y: 100 }, { x: 220, y: 100 }]];
    engine.layers.push(child2);
    engine.generate(child2.id);

    renderer.setSelection([maskParent.id, child.id], maskParent.id);
    renderer.startMaskPreviewForSelection(renderer.getSelectedLayers());

    expect(renderer.maskPreview).toBeTruthy();
    // selected child moves rigidly (not previewed); unselected child2 is re-masked
    expect(renderer.shouldSkipLayerForMaskPreview(child)).toBe(false);
    expect(renderer.shouldSkipLayerForMaskPreview(child2)).toBe(true);
    expect(renderer.maskPreview.entries.map((e) => e.layerId)).toEqual([child2.id]);
  });

  function runtimeScene(window) {
    return buildScene(window);
  }
});
