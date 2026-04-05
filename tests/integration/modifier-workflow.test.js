const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

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
    const child = new Layer('child-expanded', 'expanded', 'Child Expanded');
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
    const child = new Layer('child-remove', 'expanded', 'Child Remove');
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
    const child = new Layer('child-preserved', 'expanded', 'Child Preserved');
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
});
