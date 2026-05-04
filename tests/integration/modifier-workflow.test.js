const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

describe('Modifier workflow integration', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('mirror modifier containers roundtrip through engine state', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const modifierId = engine.addModifierLayer('mirror');
    const modifier = engine.layers.find((layer) => layer.id === modifierId);
    const child = new Layer('child-expanded', 'shape', 'Child Expanded');
    child.parentId = modifierId;
    child.sourcePaths = [[
      { x: 180, y: 20 },
      { x: 190, y: 20 },
    ]];
    engine.layers.push(child);
    engine.generate(child.id);
    engine.computeAllDisplayGeometry();

    expect(child.effectivePaths.length).toBeGreaterThan(child.paths.length);

    const exported = engine.exportState();
    const next = new VectorEngine();
    next.importState(exported);
    const importedModifier = next.layers.find((layer) => layer.id === modifierId);
    const importedChild = next.layers.find((layer) => layer.id === 'child-expanded');

    expect(importedModifier.containerRole).toBe('modifier');
    expect(importedModifier.modifier.type).toBe('mirror');
    expect(importedChild.parentId).toBe(modifierId);
    expect(importedChild.effectivePaths.length).toBeGreaterThan(importedChild.paths.length);
  });

  test('removing the last child does not auto-delete a modifier container', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const modifierId = engine.addModifierLayer('mirror');
    const child = new Layer('child-remove', 'shape', 'Child Remove');
    child.parentId = modifierId;
    child.sourcePaths = [[
      { x: 180, y: 20 },
      { x: 190, y: 20 },
    ]];
    engine.layers.push(child);
    engine.generate(child.id);

    engine.removeLayer('child-remove');

    expect(engine.layers.some((layer) => layer.id === modifierId)).toBe(true);
  });

  test('removing a modifier dissolves it and preserves its children', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const modifierId = engine.addModifierLayer('mirror');
    const child = new Layer('child-preserved', 'shape', 'Child Preserved');
    child.parentId = modifierId;
    child.sourcePaths = [[
      { x: 180, y: 20 },
      { x: 190, y: 20 },
    ]];
    engine.layers.push(child);
    engine.generate(child.id);
    engine.activeLayerId = modifierId;
    engine.computeAllDisplayGeometry();

    engine.removeLayer(modifierId);

    const preserved = engine.layers.find((layer) => layer.id === 'child-preserved');
    expect(engine.layers.some((layer) => layer.id === modifierId)).toBe(false);
    expect(preserved).toBeTruthy();
    expect(preserved.parentId).toBeNull();
    expect(engine.activeLayerId).toBe('child-preserved');
  });

  test('masked child content mirrors against a mirrored closed mask parent', () => {
    const { VectorEngine, Layer, Masking, OptimizationUtils } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const modifierId = engine.addModifierLayer('mirror');
    const modifier = engine.layers.find((layer) => layer.id === modifierId);
    modifier.modifier.mirrors = [
      {
        ...modifier.modifier.mirrors[0],
        enabled: true,
        angle: 90,
        xShift: -18,
        yShift: 0,
        replacedSide: 'positive',
      },
    ];

    const circle = [];
    circle.meta = { kind: 'circle', cx: 176, cy: 105, r: 28 };
    const maskParent = new Layer('mask-parent', 'shape', 'Mask Parent');
    maskParent.parentId = modifierId;
    maskParent.sourcePaths = [circle];
    maskParent.mask.enabled = true;

    const waveform = new Layer('masked-wave', 'shape', 'Masked Wave');
    waveform.parentId = maskParent.id;
    waveform.sourcePaths = [
      [
        { x: 150, y: 92 },
        { x: 166, y: 100 },
        { x: 182, y: 92 },
        { x: 198, y: 100 },
      ],
      [
        { x: 150, y: 116 },
        { x: 166, y: 108 },
        { x: 182, y: 116 },
        { x: 198, y: 108 },
      ],
    ];

    engine.layers.push(maskParent, waveform);
    engine.generate(maskParent.id);
    engine.generate(waveform.id);
    engine.computeAllDisplayGeometry();

    const silhouettes = Masking.getLayerSilhouette(maskParent, engine, engine.getBounds());
    const xs = (waveform.displayPaths || []).flat().map((pt) => pt.x).filter(Number.isFinite);

    expect(silhouettes).toHaveLength(2);
    expect(silhouettes.every((polygon) => OptimizationUtils.isClosedPath(polygon))).toBe(true);
    expect(Math.min(...xs)).toBeLessThan(120);
    expect(Math.max(...xs)).toBeGreaterThan(150);
    expect(waveform.displayMaskActive).toBe(true);
  });

  test('modifier outside masked group reflects the whole masked unit to the opposite side', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();

    // Modifier at the top level; mask rect is its child.
    const modifierId = engine.addModifierLayer('mirror');

    // Mask rect entirely to the right of the mirror axis.
    const maskRect = new Layer('mod-out-mask', 'shape', 'Mask Rect');
    maskRect.parentId = modifierId;
    maskRect.sourcePaths = [[
      { x: 160, y: 80 },
      { x: 220, y: 80 },
      { x: 220, y: 130 },
      { x: 160, y: 130 },
      { x: 160, y: 80 },
    ]];
    maskRect.mask.enabled = true;

    // Content line crossing the whole canvas; masked group clips it to the rect.
    const content = new Layer('mod-out-content', 'shape', 'Content');
    content.parentId = maskRect.id;
    content.sourcePaths = [[{ x: 100, y: 105 }, { x: 230, y: 105 }]];

    engine.layers.push(maskRect, content);
    engine.generate(maskRect.id);
    engine.generate(content.id);
    engine.computeAllDisplayGeometry();

    const axisX = engine.getBounds().width / 2;
    const xs = (content.displayPaths || []).flat().map((pt) => pt.x).filter(Number.isFinite);

    expect(content.displayMaskActive).toBe(true);
    // A reflected copy of the masked rect must appear on the opposite side of the axis.
    expect(Math.min(...xs)).toBeLessThan(axisX);
    // Original masked content must also be present on its own side.
    expect(Math.max(...xs)).toBeGreaterThan(160);
  });

  test('modifier inside masked group keeps reflections clipped to the mask boundary (regression)', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    // Mask rect at root; modifier is nested inside it.
    const maskRect = new Layer('mod-in-mask', 'shape', 'Mask Rect');
    maskRect.sourcePaths = [[
      { x: 160, y: 80 },
      { x: 220, y: 80 },
      { x: 220, y: 130 },
      { x: 160, y: 130 },
      { x: 160, y: 80 },
    ]];
    maskRect.mask.enabled = true;
    engine.layers.push(maskRect);

    const modifierId = engine.addModifierLayer('mirror');
    const innerMod = engine.layers.find((l) => l.id === modifierId);
    innerMod.parentId = maskRect.id;

    const content = new Layer('mod-in-content', 'shape', 'Content');
    content.parentId = modifierId;
    content.sourcePaths = [[{ x: 100, y: 105 }, { x: 230, y: 105 }]];
    engine.layers.push(content);

    engine.generate(maskRect.id);
    engine.generate(content.id);
    engine.computeAllDisplayGeometry();

    const xs = (content.displayPaths || []).flat().map((pt) => pt.x).filter(Number.isFinite);

    expect(content.displayMaskActive).toBe(true);
    // The modifier mirrors only inside the mask; no content should escape to the left of the mask.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(160);
    expect(Math.max(...xs)).toBeLessThanOrEqual(220);
  });
});

describe('Modifier workflow UI integration', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('assignLayersToRoot clears modifier parentage and recomputes geometry', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });

    const { window } = runtime;
    window.app = new window.Vectura.App();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const app = window.app;
    app.engine.addLayer('wavetable');
    const baseLayer = app.engine.getActiveLayer();
    const modifierId = app.engine.addModifierLayer('mirror');
    const modifier = app.engine.layers.find((layer) => layer.id === modifierId);
    app.ui.assignLayersToParent(modifierId, [baseLayer], { selectAssigned: true, primaryId: baseLayer.id });

    expect(baseLayer.parentId).toBe(modifierId);
    expect(baseLayer.effectivePaths.length).toBeGreaterThan(baseLayer.paths.length);

    const currentOrder = app.engine.layers.map((layer) => layer.id).reverse();
    const rootOrder = currentOrder.filter((id) => id !== baseLayer.id);
    rootOrder.unshift(baseLayer.id);
    app.ui.assignLayersToRoot([baseLayer], {
      nextEngineOrder: rootOrder.slice().reverse(),
      selectAssigned: true,
      primaryId: baseLayer.id,
    });

    expect(baseLayer.parentId).toBeNull();
    expect(baseLayer.effectivePaths.length).toBe(baseLayer.paths.length);
    expect(app.engine.layers[app.engine.layers.length - 1].id).toBe(baseLayer.id);
  });

  test('selecting a modifier child restores normal algorithm controls and edits the child in place', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });

    const { window, document } = runtime;
    window.app = new window.Vectura.App();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const app = window.app;
    app.engine.addLayer('wavetable');
    const baseLayer = app.engine.getActiveLayer();
    app.renderer.setSelection([baseLayer.id], baseLayer.id);
    const originalType = baseLayer.type;
    const nextType = originalType === 'topo' ? 'rings' : 'topo';

    app.ui.insertMirrorModifier();
    const modifier = app.engine.getActiveLayer();
    const child = app.engine.layers.find((layer) => !layer.isGroup && layer.parentId === modifier.id);

    app.renderer.setSelection([child.id], child.id);
    app.engine.activeLayerId = child.id;
    app.ui.renderLayers();
    app.ui.buildControls();

    const moduleSelect = document.getElementById('generator-module');
    const posX = document.getElementById('inp-pos-x');
    const transformSection = document.getElementById('algorithm-transform-section');
    const beforeEffectiveSignature = pathSignature(child.effectivePaths || []);

    expect(document.getElementById('left-section-primary-title')?.textContent).toBe('Algorithm');
    expect(document.getElementById('left-section-secondary-title')?.textContent).toBe('Algorithm Configuration');
    expect(moduleSelect.disabled).toBe(false);
    expect(moduleSelect.value).toBe(originalType);
    expect(transformSection?.style?.display || '').toBe('');

    moduleSelect.value = nextType;
    moduleSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(child.type).toBe(nextType);
    expect(child.parentId).toBe(modifier.id);
    expect(document.getElementById('left-section-primary-title')?.textContent).toBe('Algorithm');
    expect(document.getElementById('generator-module')?.value).toBe(nextType);

    const afterAlgorithmSignature = pathSignature(child.effectivePaths || []);
    expect(afterAlgorithmSignature).not.toBe(beforeEffectiveSignature);

    const nextPosX = (child.params.posX || 0) + 15;
    posX.value = String(nextPosX);
    posX.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(child.params.posX).toBe(nextPosX);
    expect(pathSignature(child.effectivePaths || [])).not.toBe(afterAlgorithmSignature);
  });

  test('shape-tool-created polygons and rectangles do not inherit curves from the active layer', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });

    const { window } = runtime;
    window.app = new window.Vectura.App();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const app = window.app;
    app.engine.addLayer('wavetable');
    const active = app.engine.getActiveLayer();
    active.params.curves = true;

    const polygonShape = {
      type: 'polygon',
      cx: 100,
      cy: 100,
      radius: 28,
      rotation: -Math.PI / 2,
      sides: 6,
      cornerRadii: [0, 0, 0, 0, 0, 0],
    };
    const polygonPath = app.renderer.buildShapePath(polygonShape);
    app.ui.createManualLayerFromPath({ path: polygonPath, closed: true, shape: polygonShape });
    const polygonLayer = app.engine.getActiveLayer();

    const rectShape = {
      type: 'rect',
      x1: 50,
      y1: 50,
      x2: 120,
      y2: 110,
      cornerRadii: [0, 0, 0, 0],
    };
    const rectPath = app.renderer.buildShapePath(rectShape);
    app.ui.createManualLayerFromPath({ path: rectPath, closed: true, shape: rectShape });
    const rectLayer = app.engine.getActiveLayer();

    const ovalShape = {
      type: 'oval',
      cx: 140,
      cy: 120,
      rx: 30,
      ry: 20,
    };
    const ovalPath = app.renderer.buildShapePath(ovalShape);
    app.ui.createManualLayerFromPath({ path: ovalPath, closed: true, shape: ovalShape });
    const ovalLayer = app.engine.getActiveLayer();

    expect(polygonLayer.params.curves).toBe(false);
    expect(rectLayer.params.curves).toBe(false);
    expect(ovalLayer.params.curves).toBe(true);
  });
});
