const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * M6 — Morph modifier serialization tests.
 *
 * Verifies that morph modifier containers round-trip through
 * exportState/importState with every parameter field intact, that the
 * transient morph fields (morphedPaths, _morphConsumed) never leak into the
 * serialized output, and that an unknown future modifier type loads without
 * throwing.
 */
describe('Morph modifier serialization', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  // Builds an engine with a morph group + `childCount` shape children, each
  // with a single distinct closed-ish polyline source path.
  const buildMorphEngine = (childCount = 2) => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const modifierId = engine.addModifierLayer('morph');
    const children = [];
    for (let i = 0; i < childCount; i += 1) {
      const child = new Layer(`morph-child-${i}`, 'shape', `Morph Child ${i}`);
      child.parentId = modifierId;
      const off = i * 30;
      child.sourcePaths = [[
        { x: 20 + off, y: 20 },
        { x: 60 + off, y: 20 },
        { x: 60 + off, y: 60 },
        { x: 20 + off, y: 60 },
        { x: 20 + off, y: 20 },
      ]];
      engine.layers.push(child);
      engine.generate(child.id);
      children.push(child);
    }
    engine.computeAllDisplayGeometry();
    return { engine, modifierId, children };
  };

  test('INT-A-01: morph container + children round-trip with all fields intact', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const { engine, modifierId } = buildMorphEngine(2);

    const group = engine.layers.find((l) => l.id === modifierId);
    // Pre-flight: morph compute produced transient output.
    expect(Array.isArray(group.morphedPaths)).toBe(true);
    expect(group.morphedPaths.length).toBeGreaterThan(0);

    const exported = engine.exportState();
    const next = new VectorEngine();
    next.importState(exported);

    const imported = next.layers.find((l) => l.id === modifierId);
    expect(imported).toBeTruthy();
    expect(imported.containerRole).toBe('modifier');
    expect(imported.isGroup).toBe(true);
    expect(imported.modifier.type).toBe('morph');

    // Every morph field survives the round-trip.
    const m = imported.modifier;
    expect(m.steps).toBe(6);
    expect(m.easing).toBe('linear');
    expect(m.resampleCount).toBe(128);
    expect(m.emitSources).toBe(true);
    expect(m.sequenceMode).toBe('sequential');
    expect(m.correspondenceMode).toBe('centroid-angle');
    expect(m.multiPathStrategy).toBe('merge-centroid');
    expect(m.closureMode).toBe('auto');
    expect(m.windingCheck).toBe(true);
    expect(m.smoothing).toBe(0);
    expect(m.fillMode).toBe('morph');
    expect(m.fillRegenLimit).toBe(0);

    // Children re-parent correctly.
    const importedChildren = next.layers.filter((l) => l.parentId === modifierId);
    expect(importedChildren.length).toBe(2);
    importedChildren.forEach((c) => expect(c.parentId).toBe(modifierId));
  });

  test('morphedPaths is transient and absent from exported state', () => {
    const { engine, modifierId } = buildMorphEngine(2);
    const exported = engine.exportState();

    // No serialized layer object carries the transient morph cache.
    const json = JSON.stringify(exported);
    expect(json).not.toContain('morphedPaths');

    const exportedGroup = exported.layers.find((l) => l.id === modifierId);
    expect(exportedGroup).toBeTruthy();
    expect(Object.prototype.hasOwnProperty.call(exportedGroup, 'morphedPaths')).toBe(false);
  });

  test('_morphConsumed flag is transient and absent from exported state', () => {
    const { engine, children } = buildMorphEngine(2);

    // Pre-flight: compute marks leaves consumed on the live engine.
    expect(children[0]._morphConsumed).toBe(true);

    const exported = engine.exportState();
    expect(JSON.stringify(exported)).not.toContain('_morphConsumed');
    exported.layers.forEach((l) => {
      expect(Object.prototype.hasOwnProperty.call(l, '_morphConsumed')).toBe(false);
    });
  });

  test('backward compat: importing an unknown modifier type does not throw', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const { engine, modifierId } = buildMorphEngine(2);

    const exported = engine.exportState();
    const group = exported.layers.find((l) => l.id === modifierId);
    group.modifier.type = 'future_modifier';

    const next = new VectorEngine();
    expect(() => {
      next.importState(exported);
      next.computeAllDisplayGeometry();
    }).not.toThrow();

    // The layer still loads (geometry passes through, no crash).
    const imported = next.layers.find((l) => l.id === modifierId);
    expect(imported).toBeTruthy();
    expect(imported.modifier.type).toBe('future_modifier');
  });

  test('round-trip after re-compute: imported morph re-derives morphedPaths of the same length', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const { engine, modifierId } = buildMorphEngine(2);

    const group = engine.layers.find((l) => l.id === modifierId);
    const beforeLen = group.morphedPaths.length;
    expect(beforeLen).toBeGreaterThan(0);

    const exported = engine.exportState();
    const next = new VectorEngine();
    next.importState(exported);
    next.computeAllDisplayGeometry();

    const imported = next.layers.find((l) => l.id === modifierId);
    expect(Array.isArray(imported.morphedPaths)).toBe(true);
    expect(imported.morphedPaths.length).toBe(beforeLen);
  });
});
