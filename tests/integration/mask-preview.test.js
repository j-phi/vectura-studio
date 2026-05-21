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

    const maskParent = new Layer('preview-mask-parent', 'shape', 'Mask Parent');
    maskParent.sourcePaths = [[
      { x: 80, y: 80 },
      { x: 160, y: 80 },
      { x: 160, y: 140 },
      { x: 80, y: 140 },
      { x: 80, y: 80 },
    ]];
    maskParent.mask.enabled = true;

    const child = new Layer('preview-mask-child', 'shape', 'Masked Child');
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

  test('renderer preview state activates with isChildDrag when child of locked mask is dragged', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];

    const maskParent = new Layer('child-drag-mask-parent', 'shape', 'Mask Parent');
    maskParent.sourcePaths = [[
      { x: 80, y: 80 },
      { x: 160, y: 80 },
      { x: 160, y: 140 },
      { x: 80, y: 140 },
      { x: 80, y: 80 },
    ]];
    maskParent.mask.enabled = true;

    const child = new Layer('child-drag-mask-child', 'shape', 'Masked Child');
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
    // Lock the mask parent so only the child can be dragged
    renderer.isLayerLocked = (id) => id === maskParent.id;
    renderer.setSelection([child.id], child.id);
    renderer.tempTransform = { dx: 30, dy: 0, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 }, rotation: 0 };

    const preview = renderer.startMaskPreview(child);

    expect(preview).toBeTruthy();
    expect(preview.isChildDrag).toBe(true);
    expect(preview.maskLayerId).toBe(maskParent.id);
    expect(Array.from(preview.descendantIds)).toContain(child.id);
    expect(preview.entries).toHaveLength(1);
    expect(preview.entries[0].layerId).toBe(child.id);
    expect(Array.isArray(preview.entries[0].paths)).toBe(true);

    renderer.clearMaskPreview();
    expect(renderer.maskPreview).toBeNull();
  });

  // --- getMaskPreviewClipPolygons (renderer helper) -------------------------
  // Merged from the former tests/unit/mask-preview.test.js. Although these
  // exercise a single helper method, they require a real Renderer instance
  // (loaded via the runtime), so they belong in integration alongside the
  // startMaskPreview coverage above.
  describe('getMaskPreviewClipPolygons', () => {
    let helperRuntime;
    let helperRenderer;
    let helperMaskLayer;

    beforeAll(async () => {
      helperRuntime = await loadVecturaRuntime({ includeRenderer: true });
      const { Renderer, Layer } = helperRuntime.window.Vectura;
      const engine = {
        layers: [],
        currentProfile: { width: 240, height: 180 },
        getBounds() {
          return { width: 240, height: 180, m: 20, dW: 200, dH: 140, truncate: true };
        },
      };
      helperRenderer = new Renderer('main-canvas', engine);
      helperMaskLayer = new Layer('mask-preview-shape', 'shape', 'Mask');
      helperMaskLayer.paths = [[
        { x: 80, y: 80 },
        { x: 160, y: 80 },
        { x: 160, y: 120 },
        { x: 80, y: 120 },
        { x: 80, y: 80 },
      ]];
      engine.layers = [helperMaskLayer];
      helperRenderer.maskPreview = {
        maskLayerId: helperMaskLayer.id,
        descendantIds: new Set(),
        entries: [],
      };
    });

    afterAll(() => {
      helperRuntime?.cleanup?.();
      helperRuntime = null;
    });

    const getBounds = (polygon) => {
      const points = polygon || [];
      return {
        minX: Math.min(...points.map((point) => point.x)),
        maxX: Math.max(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxY: Math.max(...points.map((point) => point.y)),
      };
    };

    test('transformed preview clip polygons honor move, resize, and rotate transforms', () => {
      const base = helperRenderer.getMaskPreviewClipPolygons(helperMaskLayer, {
        dx: 0,
        dy: 0,
        scaleX: 1,
        scaleY: 1,
        origin: { x: 120, y: 100 },
        rotation: 0,
      })[0];
      const moved = helperRenderer.getMaskPreviewClipPolygons(helperMaskLayer, {
        dx: 20,
        dy: 10,
        scaleX: 1,
        scaleY: 1,
        origin: { x: 120, y: 100 },
        rotation: 0,
      })[0];
      const resized = helperRenderer.getMaskPreviewClipPolygons(helperMaskLayer, {
        dx: 0,
        dy: 0,
        scaleX: 1.5,
        scaleY: 0.5,
        origin: { x: 120, y: 100 },
        rotation: 0,
      })[0];
      const rotated = helperRenderer.getMaskPreviewClipPolygons(helperMaskLayer, {
        dx: 0,
        dy: 0,
        scaleX: 1,
        scaleY: 1,
        origin: { x: 120, y: 100 },
        rotation: 90,
      })[0];

      expect(moved[0].x).toBeCloseTo(base[0].x + 20, 5);
      expect(moved[0].y).toBeCloseTo(base[0].y + 10, 5);

      const baseBounds = getBounds(base);
      const resizedBounds = getBounds(resized);
      const rotatedBounds = getBounds(rotated);

      expect(resizedBounds.maxX - resizedBounds.minX).toBeGreaterThan(baseBounds.maxX - baseBounds.minX);
      expect(resizedBounds.maxY - resizedBounds.minY).toBeLessThan(baseBounds.maxY - baseBounds.minY);
      expect(rotatedBounds.maxX - rotatedBounds.minX).toBeCloseTo(baseBounds.maxY - baseBounds.minY, 5);
      expect(rotatedBounds.maxY - rotatedBounds.minY).toBeCloseTo(baseBounds.maxX - baseBounds.minX, 5);
    });

    test('getMaskPreviewClipPolygons with null temp returns unmodified clip polygons (locked-mask child drag)', () => {
      const withTransform = helperRenderer.getMaskPreviewClipPolygons(helperMaskLayer, {
        dx: 40,
        dy: 20,
        scaleX: 1,
        scaleY: 1,
        origin: { x: 120, y: 100 },
        rotation: 0,
      })[0];
      const withNull = helperRenderer.getMaskPreviewClipPolygons(helperMaskLayer, null)[0];

      // Passing null means the mask is fixed — polygons must not be shifted
      expect(withNull[0].x).toBeCloseTo(withTransform[0].x - 40, 5);
      expect(withNull[0].y).toBeCloseTo(withTransform[0].y - 20, 5);
    });
  });

  test('buildMaskPreviewState returns isChildDrag preview for child of unlocked mask', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];

    const maskParent = new Layer('unlocked-mask-parent', 'shape', 'Mask Parent');
    maskParent.sourcePaths = [[
      { x: 80, y: 80 }, { x: 160, y: 80 }, { x: 160, y: 140 }, { x: 80, y: 140 }, { x: 80, y: 80 },
    ]];
    maskParent.mask.enabled = true;

    const child = new Layer('unlocked-mask-child', 'shape', 'Child');
    child.parentId = maskParent.id;
    child.sourcePaths = [[ { x: 20, y: 110 }, { x: 220, y: 110 } ]];

    engine.layers.push(maskParent, child);
    engine.generate(maskParent.id);
    engine.generate(child.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.isLayerLocked = () => false; // nothing locked

    const preview = renderer.startMaskPreview(child);
    // Child of any masking ancestor (locked or not) should get an isChildDrag preview
    // so that the drag shows paths clipped to the mask rather than sliding pre-clipped paths.
    expect(preview).not.toBeNull();
    expect(preview.isChildDrag).toBe(true);
    expect(preview.maskLayerId).toBe(maskParent.id);
    expect(preview.descendantIds.has(child.id)).toBe(true);
    expect(preview.entries).toHaveLength(1);
    expect(preview.entries[0].layerId).toBe(child.id);
  });
});
