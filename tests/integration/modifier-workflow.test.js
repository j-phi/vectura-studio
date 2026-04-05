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
});
