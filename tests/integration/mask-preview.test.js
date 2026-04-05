const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Mask preview integration', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('renderer preview state activates for a dragged mask parent and clears afterward', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];

    const maskParent = new Layer('preview-mask-parent', 'expanded', 'Mask Parent');
    maskParent.sourcePaths = [[
      { x: 80, y: 80 },
      { x: 160, y: 80 },
      { x: 160, y: 140 },
      { x: 80, y: 140 },
      { x: 80, y: 80 },
    ]];
    maskParent.mask.enabled = true;

    const child = new Layer('preview-mask-child', 'expanded', 'Masked Child');
    child.parentId = maskParent.id;
    child.sourcePaths = [[
      { x: 20, y: 110 },
      { x: 220, y: 110 },
    ]];

    engine.layers.push(maskParent, child);
    engine.generate(maskParent.id);
    engine.generate(child.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.setSelection([maskParent.id], maskParent.id);
    renderer.tempTransform = { dx: 24, dy: 0, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 }, rotation: 0 };

    const preview = renderer.startMaskPreview(maskParent);

    expect(preview).toBeTruthy();
    expect(Array.from(preview.descendantIds)).toContain(child.id);
    expect(preview.entries).toHaveLength(1);
    expect(preview.entries[0].layerId).toBe(child.id);
    expect(preview.entries[0].paths[0][0].x).toBeLessThan(80);

    renderer.clearMaskPreview();

    expect(renderer.maskPreview).toBeNull();
  });
});
