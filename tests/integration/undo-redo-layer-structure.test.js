const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

const createSquarePath = (x, y, size) => ([
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
  { x, y },
]);

const createLinePath = (x1, y1, x2, y2) => ([
  { x: x1, y: y1 },
  { x: x2, y: y2 },
]);

const resetHistory = (app) => {
  app.history = [];
  app.redoStack = [];
  app.pushHistory();
};

describe('Undo/redo layer-structure integration', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('group and ungroup roundtrip through undo/redo with multi-selection intact', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });

    const { window } = runtime;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    app.engine.addLayer('wavetable');
    const firstId = app.engine.getActiveLayer().id;
    const secondId = app.engine.addLayer('rings');
    app.renderer.setSelection([firstId, secondId], secondId);
    app.engine.activeLayerId = secondId;
    resetHistory(app);

    app.ui.groupSelection();

    const group = app.engine.layers.find((layer) => layer.isGroup && layer.groupType === 'group');
    expect(group).toBeTruthy();
    expect(app.engine.layers.find((layer) => layer.id === firstId)?.parentId).toBe(group.id);
    expect(app.engine.layers.find((layer) => layer.id === secondId)?.parentId).toBe(group.id);

    app.undo();

    expect(app.engine.layers.some((layer) => layer.id === group.id)).toBe(false);
    expect(app.engine.layers.find((layer) => layer.id === firstId)?.parentId).toBeNull();
    expect(app.engine.layers.find((layer) => layer.id === secondId)?.parentId).toBeNull();

    app.redo();

    const regrouped = app.engine.layers.find((layer) => layer.id === group.id);
    expect(regrouped).toBeTruthy();
    expect(app.engine.layers.find((layer) => layer.id === firstId)?.parentId).toBe(group.id);
    expect(app.engine.layers.find((layer) => layer.id === secondId)?.parentId).toBe(group.id);
    expect(Array.from(app.renderer.selectedLayerIds)).toEqual(expect.arrayContaining([firstId, secondId]));

    app.ui.ungroupSelection();

    expect(app.engine.layers.some((layer) => layer.id === group.id)).toBe(false);
    expect(app.engine.layers.find((layer) => layer.id === firstId)?.parentId).toBeNull();
    expect(app.engine.layers.find((layer) => layer.id === secondId)?.parentId).toBeNull();

    app.undo();
    expect(app.engine.layers.some((layer) => layer.id === group.id)).toBe(true);

    app.redo();
    expect(app.engine.layers.some((layer) => layer.id === group.id)).toBe(false);
  });

  test('mask enable and hide-layer toggles roundtrip through undo/redo', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });

    const { window } = runtime;
    const { Layer } = window.Vectura;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    const maskParent = new Layer('undo-mask-parent', 'shape', 'Mask Parent');
    maskParent.sourcePaths = [createSquarePath(80, 80, 100)];
    maskParent.params.curves = false;
    maskParent.params.smoothing = 0;
    maskParent.params.simplify = 0;

    const child = new Layer('undo-mask-child', 'shape', 'Masked Child');
    child.parentId = maskParent.id;
    child.sourcePaths = [createLinePath(40, 130, 220, 130)];
    child.params.curves = false;
    child.params.smoothing = 0;
    child.params.simplify = 0;

    app.engine.layers = [maskParent, child];
    app.engine.activeLayerId = maskParent.id;
    app.engine.generate(maskParent.id);
    app.engine.generate(child.id);
    app.engine.computeAllDisplayGeometry();
    app.renderer.setSelection([maskParent.id], maskParent.id);
    resetHistory(app);

    const editor = app.ui.buildMaskEditor(maskParent, { compact: true });
    const inputs = editor.querySelectorAll('input[type="checkbox"]');
    const enableInput = inputs[0];
    const hideInput = inputs[1];

    enableInput.checked = true;
    enableInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(maskParent.mask.enabled).toBe(true);
    expect(child.displayMaskActive).toBe(true);

    hideInput.checked = true;
    hideInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(maskParent.mask.hideLayer).toBe(true);

    app.undo();
    let restoredMaskParent = app.engine.layers.find((layer) => layer.id === maskParent.id);
    expect(restoredMaskParent.mask.enabled).toBe(true);
    expect(restoredMaskParent.mask.hideLayer).toBe(false);

    app.undo();
    restoredMaskParent = app.engine.layers.find((layer) => layer.id === maskParent.id);
    expect(restoredMaskParent.mask.enabled).toBe(false);
    expect(restoredMaskParent.mask.hideLayer).toBe(false);

    app.redo();
    restoredMaskParent = app.engine.layers.find((layer) => layer.id === maskParent.id);
    expect(restoredMaskParent.mask.enabled).toBe(true);
    expect(restoredMaskParent.mask.hideLayer).toBe(false);

    app.redo();
    restoredMaskParent = app.engine.layers.find((layer) => layer.id === maskParent.id);
    expect(restoredMaskParent.mask.enabled).toBe(true);
    expect(restoredMaskParent.mask.hideLayer).toBe(true);
  });

  test('modifier insertion and mirror edits roundtrip through undo/redo', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });

    const { window } = runtime;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    app.engine.addLayer('wavetable');
    const baseLayer = app.engine.getActiveLayer();
    app.renderer.setSelection([baseLayer.id], baseLayer.id);
    app.engine.activeLayerId = baseLayer.id;
    resetHistory(app);

    app.ui.insertMirrorModifier();

    let modifier = app.engine.getActiveLayer();
    expect(modifier.containerRole).toBe('modifier');
    expect(baseLayer.parentId).toBe(modifier.id);

    app.undo();
    expect(app.engine.layers.some((layer) => layer.id === modifier.id)).toBe(false);
    expect(app.engine.layers.find((layer) => layer.id === baseLayer.id)?.parentId).toBeNull();

    app.redo();
    modifier = app.engine.layers.find((layer) => layer.id === modifier.id);
    expect(modifier).toBeTruthy();
    expect(app.engine.layers.find((layer) => layer.id === baseLayer.id)?.parentId).toBe(modifier.id);

    const controls = window.document.createElement('div');
    app.ui.buildMirrorModifierControls(modifier, controls);
    const angleInput = controls.querySelector('input[type="number"]');
    const initialAngle = modifier.modifier.mirrors[0].angle;
    angleInput.value = '45';
    angleInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(modifier.modifier.mirrors[0].angle).toBe(45);

    app.undo();
    modifier = app.engine.layers.find((layer) => layer.id === modifier.id);
    expect(modifier.modifier.mirrors[0].angle).toBe(initialAngle);

    app.redo();
    modifier = app.engine.layers.find((layer) => layer.id === modifier.id);
    expect(modifier.modifier.mirrors[0].angle).toBe(45);
  });

  test('assigning layers into and out of a container roundtrips through undo/redo', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });

    const { window } = runtime;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    app.engine.addLayer('wavetable');
    const baseLayer = app.engine.getActiveLayer();
    const modifierId = app.engine.addModifierLayer('mirror');
    const modifier = app.engine.layers.find((layer) => layer.id === modifierId);
    resetHistory(app);

    app.ui.assignLayersToParent(modifierId, [baseLayer], {
      captureHistory: true,
      selectAssigned: true,
      primaryId: baseLayer.id,
    });
    expect(app.engine.layers.find((layer) => layer.id === baseLayer.id)?.parentId).toBe(modifierId);

    app.undo();
    expect(app.engine.layers.find((layer) => layer.id === baseLayer.id)?.parentId).toBeNull();

    app.redo();
    expect(app.engine.layers.find((layer) => layer.id === baseLayer.id)?.parentId).toBe(modifierId);

    const currentOrder = app.engine.layers.map((layer) => layer.id).reverse();
    const rootOrder = currentOrder.filter((id) => id !== baseLayer.id);
    rootOrder.unshift(baseLayer.id);
    app.ui.assignLayersToRoot([baseLayer], {
      captureHistory: true,
      nextEngineOrder: rootOrder.slice().reverse(),
      selectAssigned: true,
      primaryId: baseLayer.id,
    });
    expect(app.engine.layers.find((layer) => layer.id === baseLayer.id)?.parentId).toBeNull();

    app.undo();
    expect(app.engine.layers.find((layer) => layer.id === baseLayer.id)?.parentId).toBe(modifier.id);

    app.redo();
    expect(app.engine.layers.find((layer) => layer.id === baseLayer.id)?.parentId).toBeNull();
  });
});
