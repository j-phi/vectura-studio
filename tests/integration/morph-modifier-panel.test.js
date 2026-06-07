const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * M6 — Morph modifier integration + panel tests.
 *
 * Group A: engine-level morph pipeline invariants (no UI needed).
 * Group B: MorphPanel.build() driven against a minimal uiCtx stub.
 * Group C: multi-child / robustness / export-path coverage.
 */

// ---------------------------------------------------------------------------
// Group A + C — engine-level
// ---------------------------------------------------------------------------
describe('Morph modifier engine pipeline', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const rect = (off = 0) => [
    { x: 20 + off, y: 20 },
    { x: 60 + off, y: 20 },
    { x: 60 + off, y: 60 },
    { x: 20 + off, y: 60 },
    { x: 20 + off, y: 20 },
  ];

  // Adds a shape child with given source paths under a morph group and generates it.
  const addChild = (engine, modifierId, id, sourcePaths, opts = {}) => {
    const { Layer } = runtime.window.Vectura;
    const child = new Layer(id, 'shape', id);
    child.parentId = modifierId;
    child.sourcePaths = sourcePaths;
    if (opts.visible === false) child.visible = false;
    engine.layers.push(child);
    engine.generate(child.id);
    return child;
  };

  const newMorphEngine = () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const modifierId = engine.addModifierLayer('morph');
    return { engine, modifierId, group: () => engine.layers.find((l) => l.id === modifierId) };
  };

  test('INT-A-02: 0 visible children does not throw; morphedPaths empty', () => {
    const { engine, group } = newMorphEngine();
    expect(() => engine.computeAllDisplayGeometry()).not.toThrow();
    expect((group().morphedPaths || []).length).toBe(0);
  });

  test('INT-A-03: 1 visible child passes its paths through', () => {
    const { engine, modifierId, group } = newMorphEngine();
    const child = addChild(engine, modifierId, 'solo', [rect(0)]);
    engine.computeAllDisplayGeometry();
    const childPaths = (child.effectivePaths && child.effectivePaths.length)
      ? child.effectivePaths
      : child.paths;
    expect((group().morphedPaths || []).length).toBe(childPaths.length);
  });

  test('INT-A-04: 2 children, steps=3 → morphedPaths length 5 (1+3+1)', () => {
    const { engine, modifierId, group } = newMorphEngine();
    addChild(engine, modifierId, 'a', [rect(0)]);
    addChild(engine, modifierId, 'b', [rect(40)]);
    group().modifier.steps = 3;
    engine.computeAllDisplayGeometry();
    expect(group().morphedPaths.length).toBe(5);
  });

  test('REV-1: expandModifierLayer(morph) emits one shape layer per morphed ring', () => {
    const { engine, modifierId, group } = newMorphEngine();
    addChild(engine, modifierId, 'ea', [rect(0)]);
    addChild(engine, modifierId, 'eb', [rect(40)]);
    group().modifier.steps = 3;
    engine.computeAllDisplayGeometry();
    const ringCount = group().morphedPaths.length; // 5 (1+3+1)

    const folderId = engine.expandModifierLayer(modifierId);
    expect(folderId).toBeTruthy();
    // The morph group + its children are gone, replaced by a folder + N shapes.
    expect(engine.layers.find((l) => l.id === modifierId)).toBeUndefined();
    const shapes = engine.layers.filter((l) => l.parentId === folderId && !l.isGroup);
    expect(shapes.length).toBe(ringCount);
    // Each emitted shape carries one source path.
    shapes.forEach((s) => expect(s.sourcePaths.length).toBe(1));
  });

  test('INT-A-05: invisible child is excluded from the chain', () => {
    const { engine, modifierId, group } = newMorphEngine();
    addChild(engine, modifierId, 'va', [rect(0)]);
    addChild(engine, modifierId, 'vb', [rect(40)]);
    const hidden = addChild(engine, modifierId, 'hidden', [rect(80)], { visible: false });
    group().modifier.steps = 4;
    engine.computeAllDisplayGeometry();

    // 2 visible sources + 4 blends = 6 — hidden child must not extend the chain.
    expect(group().morphedPaths.length).toBe(6);
    // Hidden child is still consumed (does not render on its own).
    expect(hidden._morphConsumed).toBe(true);
    expect(engine.getRenderablePaths(hidden)).toEqual([]);
  });

  test('INT-A-06: removing the last child does not auto-delete the morph group', () => {
    const { engine, modifierId } = newMorphEngine();
    addChild(engine, modifierId, 'only', [rect(0)]);
    engine.computeAllDisplayGeometry();

    engine.removeLayer('only');

    expect(engine.layers.some((l) => l.id === modifierId)).toBe(true);
  });

  test('INT-A-07: dissolving the morph modifier restores children to root (parentId=null)', () => {
    const { engine, modifierId } = newMorphEngine();
    addChild(engine, modifierId, 'c1', [rect(0)]);
    addChild(engine, modifierId, 'c2', [rect(40)]);
    engine.activeLayerId = modifierId;
    engine.computeAllDisplayGeometry();

    // removeLayer on a modifier container dissolves it and preserves children.
    engine.removeLayer(modifierId);

    expect(engine.layers.some((l) => l.id === modifierId)).toBe(false);
    const c1 = engine.layers.find((l) => l.id === 'c1');
    const c2 = engine.layers.find((l) => l.id === 'c2');
    expect(c1).toBeTruthy();
    expect(c2).toBeTruthy();
    expect(c1.parentId).toBeNull();
    expect(c2.parentId).toBeNull();
    // Restored children render on their own again (no longer consumed).
    expect(c1._morphConsumed).toBeFalsy();
  });

  test('INT-A-08: undo/redo restores modifier + child structure', async () => {
    let appRuntime;
    try {
      appRuntime = await loadVecturaRuntime({
        includeRenderer: true,
        includeUi: true,
        includeApp: true,
        useIndexHtml: true,
      });
      const { window } = appRuntime;
      window.app = new window.Vectura.App();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const app = window.app;

      // Establish a baseline history checkpoint (undo needs >= 2 entries).
      app.pushHistory();
      const beforeIds = app.engine.layers.map((l) => l.id).sort();

      app.pushHistory();
      const modifierId = app.engine.addModifierLayer('morph');
      const { Layer } = window.Vectura;
      const child = new Layer('undo-child', 'shape', 'Undo Child');
      child.parentId = modifierId;
      child.sourcePaths = [rect(0)];
      app.engine.layers.push(child);
      app.engine.generate(child.id);
      app.engine.computeAllDisplayGeometry();

      expect(app.engine.layers.some((l) => l.id === modifierId)).toBe(true);

      app.undo();
      const afterUndo = app.engine.layers.map((l) => l.id).sort();
      expect(afterUndo).toEqual(beforeIds);
      expect(app.engine.layers.some((l) => l.id === modifierId)).toBe(false);

      app.redo();
      expect(app.engine.layers.some((l) => l.id === modifierId)).toBe(true);
    } finally {
      appRuntime?.cleanup?.();
    }
  });

  test('INT-C-01: 3 children sequential → 3 sources + 2*steps blends; B is shared anchor once', () => {
    const { engine, modifierId, group } = newMorphEngine();
    addChild(engine, modifierId, 'A', [rect(0)]);
    addChild(engine, modifierId, 'B', [rect(40)]);
    addChild(engine, modifierId, 'C', [rect(80)]);
    const steps = 3;
    group().modifier.steps = steps;
    group().modifier.sequenceMode = 'sequential';
    engine.computeAllDisplayGeometry();

    // 3 sources + 2 segments * steps blends. B appears exactly once as anchor.
    expect(group().morphedPaths.length).toBe(3 + 2 * steps);
  });

  test('INT-C-02: children with very different point counts resample without crashing', () => {
    const { engine, modifierId, group } = newMorphEngine();
    const tiny = [
      { x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 },
      { x: 10, y: 20 }, { x: 10, y: 10 },
    ]; // 5 pts
    const dense = [];
    for (let i = 0; i <= 200; i += 1) {
      const t = (i / 200) * Math.PI * 2;
      dense.push({ x: 60 + Math.cos(t) * 20, y: 40 + Math.sin(t) * 20 });
    } // 201 pts
    addChild(engine, modifierId, 'tiny', [tiny]);
    addChild(engine, modifierId, 'dense', [dense]);
    group().modifier.steps = 4;
    expect(() => engine.computeAllDisplayGeometry()).not.toThrow();
    // 2 sources + 4 blends (1 path per child).
    expect(group().morphedPaths.length).toBe(6);
  });

  test('INT-C-03: bezier-handle child blends are flattened (no meta.anchors on blend rings)', () => {
    const { engine, modifierId, group } = newMorphEngine();
    const bez = [
      { x: 20, y: 20 }, { x: 60, y: 20 }, { x: 60, y: 60 }, { x: 20, y: 60 },
    ];
    bez.meta = {
      anchors: [
        { x: 20, y: 20, hIn: { x: 18, y: 18 }, hOut: { x: 30, y: 20 } },
        { x: 60, y: 20, hIn: { x: 50, y: 20 }, hOut: { x: 60, y: 30 } },
        { x: 60, y: 60, hIn: { x: 60, y: 50 }, hOut: { x: 50, y: 60 } },
        { x: 20, y: 60, hIn: { x: 30, y: 60 }, hOut: { x: 20, y: 50 } },
      ],
    };
    addChild(engine, modifierId, 'bezA', [bez]);
    addChild(engine, modifierId, 'plainB', [rect(60)]);
    group().modifier.steps = 3;
    group().modifier.emitSources = false; // only blend rings in output
    expect(() => engine.computeAllDisplayGeometry()).not.toThrow();

    const rings = group().morphedPaths;
    expect(rings.length).toBe(3); // only blends
    rings.forEach((ring) => {
      expect(ring.meta && ring.meta.anchors).toBeFalsy();
    });
  });

  test('INT-C-04: raw export returns morphedPaths for group, [] for consumed children', async () => {
    let uiRuntime;
    try {
      uiRuntime = await loadVecturaRuntime({ includeUi: true });
      const { VectorEngine, Layer, _UIExportUtil } = uiRuntime.window.Vectura;
      const engine = new VectorEngine();
      const modifierId = engine.addModifierLayer('morph');
      const mkChild = (id, off) => {
        const c = new Layer(id, 'shape', id);
        c.parentId = modifierId;
        c.sourcePaths = [rect(off)];
        engine.layers.push(c);
        engine.generate(c.id);
        return c;
      };
      const ca = mkChild('exp-a', 0);
      mkChild('exp-b', 50);
      const group = engine.layers.find((l) => l.id === modifierId);
      group.modifier.steps = 4;
      engine.computeAllDisplayGeometry();

      const groupPaths = _UIExportUtil.getRawExportPaths(group);
      // 2 sources + 4 blends = 6 stroke paths from the morph group.
      expect(groupPaths.length).toBe(6);
      expect(groupPaths.length).toBeGreaterThanOrEqual(group.modifier.steps + 2);
      // Consumed children export nothing on their own.
      expect(_UIExportUtil.getRawExportPaths(ca)).toEqual([]);
    } finally {
      uiRuntime?.cleanup?.();
    }
  });
});

// ---------------------------------------------------------------------------
// Group B — MorphPanel.build() against a minimal uiCtx stub
// ---------------------------------------------------------------------------
describe('Morph modifier panel', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const rect = (off = 0) => [
    { x: 20 + off, y: 20 },
    { x: 60 + off, y: 20 },
    { x: 60 + off, y: 60 },
    { x: 20 + off, y: 60 },
    { x: 20 + off, y: 20 },
  ];

  // Builds a real engine with a morph group + 2 children, plus a minimal uiCtx
  // stub satisfying MorphPanel.build()'s dependencies.
  const buildPanelFixture = () => {
    const { VectorEngine, Layer, UI } = runtime.window.Vectura;
    const { document } = runtime;
    const engine = new VectorEngine();
    const modifierId = engine.addModifierLayer('morph');
    [0, 40].forEach((off, i) => {
      const child = new Layer(`pchild-${i}`, 'shape', `Panel Child ${i}`);
      child.parentId = modifierId;
      child.sourcePaths = [rect(off)];
      engine.layers.push(child);
      engine.generate(child.id);
    });
    engine.computeAllDisplayGeometry();

    const layer = engine.layers.find((l) => l.id === modifierId);
    const pushHistory = vi.fn();
    const refreshModifierLayer = vi.fn(() => engine.computeAllDisplayGeometry());
    const uiCtx = {
      getModifierState: (l) => l.modifier,
      refreshModifierLayer,
      app: { engine, pushHistory },
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.MorphPanel.build(uiCtx, layer, container);
    return { engine, layer, modifier: layer.modifier, uiCtx, container, pushHistory, refreshModifierLayer };
  };

  const fireEvent = (el, type) => {
    el.dispatchEvent(new runtime.window.Event(type, { bubbles: true }));
  };

  test('REV-2: getModifierState does not graft mirror-only fields onto a morph modifier', () => {
    const { VectorEngine, UI, Modifiers } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const modifierId = engine.addModifierLayer('morph');
    const layer = engine.layers.find((l) => l.id === modifierId);
    // Call the REAL prototype getModifierState (not the panel stub) with a
    // minimal `this` providing the only dependency it reads.
    const ctx = { isModifierLayer: Modifiers.isModifierLayer };
    const mod = UI.prototype.getModifierState.call(ctx, layer);
    expect(mod.type).toBe('morph');
    expect(mod.mirrors).toBeUndefined();
    expect(mod.guidesVisible).toBeUndefined();
    expect(mod.guidesLocked).toBeUndefined();
    expect(mod.enabled).toBe(true);
  });

  test('INT-B-01: renders steps slider + easing/sequence/correspondence chips', () => {
    const { container } = buildPanelFixture();
    expect(container.querySelector('[data-testid="morph-panel"]')).toBeTruthy();
    expect(container.querySelector('input[data-testid="morph-steps"]')).toBeTruthy();
    expect(container.querySelectorAll('.morph-easing-chips button').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.morph-sequence-chips button').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.morph-correspondence-chips button').length).toBeGreaterThan(0);
  });

  test('INT-B-02: steps slider input updates modifier.steps and recomputes', () => {
    const { container, modifier, refreshModifierLayer } = buildPanelFixture();
    const slider = container.querySelector('input[data-testid="morph-steps"]');
    refreshModifierLayer.mockClear();

    slider.value = '10';
    fireEvent(slider, 'pointerdown');
    fireEvent(slider, 'input');

    expect(modifier.steps).toBe(10);
    expect(refreshModifierLayer).toHaveBeenCalled();
  });

  test('INT-B-03: clicking an easing chip updates modifier.easing', () => {
    const { container, modifier } = buildPanelFixture();
    const chip = container.querySelector('.morph-easing-chips button[data-easing="ease-in"]');
    expect(chip).toBeTruthy();
    chip.dispatchEvent(new runtime.window.Event('click', { bubbles: true }));
    expect(modifier.easing).toBe('ease-in');
  });

  test('INT-B-04: panel actions never write _panel* keys onto the modifier', () => {
    const { container, modifier } = buildPanelFixture();
    container.querySelector('.morph-easing-chips button[data-easing="ease-out"]')
      .dispatchEvent(new runtime.window.Event('click', { bubbles: true }));
    container.querySelector('.morph-sequence-chips button[data-sequence="cyclic"]')
      .dispatchEvent(new runtime.window.Event('click', { bubbles: true }));
    const slider = container.querySelector('input[data-testid="morph-steps"]');
    slider.value = '8';
    fireEvent(slider, 'pointerdown');
    fireEvent(slider, 'input');
    fireEvent(slider, 'change');

    expect(Object.keys(modifier).every((k) => !k.startsWith('_panel'))).toBe(true);
  });

  test('INT-B-05: each discrete action pushes history exactly once', () => {
    const { container, pushHistory } = buildPanelFixture();

    // One chip click = exactly one push.
    pushHistory.mockClear();
    container.querySelector('.morph-easing-chips button[data-easing="ease-in"]')
      .dispatchEvent(new runtime.window.Event('click', { bubbles: true }));
    expect(pushHistory).toHaveBeenCalledTimes(1);

    // One slider drag (pointerdown + several input + change) = exactly one push.
    pushHistory.mockClear();
    const slider = container.querySelector('input[data-testid="morph-steps"]');
    fireEvent(slider, 'pointerdown');
    slider.value = '9';
    fireEvent(slider, 'input');
    slider.value = '12';
    fireEvent(slider, 'input');
    slider.value = '15';
    fireEvent(slider, 'input');
    fireEvent(slider, 'change');
    expect(pushHistory).toHaveBeenCalledTimes(1);
  });

  test('INT-B-06: Insert menu item for morph exists in the index.html DOM', async () => {
    let domRuntime;
    try {
      domRuntime = await loadVecturaRuntime({ includeUi: true, useIndexHtml: true });
      const item = domRuntime.document.querySelector(
        '#layer-add-menu .lvl-add-item[data-add="morph"]'
      );
      expect(item).toBeTruthy();
      // UI prototype also exposes the programmatic entry point.
      expect(typeof domRuntime.window.Vectura.UI.prototype.insertMorphModifier).toBe('function');
    } finally {
      domRuntime?.cleanup?.();
    }
  });

  test('INT-B-07: layers assigned into a morph group are auto-locked', async () => {
    let appRuntime;
    try {
      appRuntime = await loadVecturaRuntime({
        includeRenderer: true,
        includeUi: true,
        includeApp: true,
        useIndexHtml: true,
      });
      const { window } = appRuntime;
      window.app = new window.Vectura.App();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const app = window.app;

      const modifierId = app.engine.addModifierLayer('morph');
      app.engine.addLayer('wavetable');
      const child = app.engine.getActiveLayer();
      expect(app.ui.layerLockedIds.has(child.id)).toBe(false);

      app.ui.assignLayersToParent(modifierId, [child]);

      expect(child.parentId).toBe(modifierId);
      expect(app.ui.layerLockedIds.has(child.id)).toBe(true);
    } finally {
      appRuntime?.cleanup?.();
    }
  });

  test('INT-B-08: deleting the morph modifier unlocks restored children', async () => {
    let appRuntime;
    try {
      appRuntime = await loadVecturaRuntime({
        includeRenderer: true,
        includeUi: true,
        includeApp: true,
        useIndexHtml: true,
      });
      const { window } = appRuntime;
      window.app = new window.Vectura.App();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const app = window.app;

      const modifierId = app.engine.addModifierLayer('morph');
      app.engine.addLayer('wavetable');
      const child = app.engine.getActiveLayer();
      app.ui.assignLayersToParent(modifierId, [child]);
      expect(app.ui.layerLockedIds.has(child.id)).toBe(true);

      app.ui.unlockMirrorChildrenOnDelete(modifierId);
      app.engine.removeLayer(modifierId);

      const restored = app.engine.layers.find((l) => l.id === child.id);
      expect(restored).toBeTruthy();
      expect(restored.parentId).toBeNull();
      expect(app.ui.layerLockedIds.has(child.id)).toBe(false);
    } finally {
      appRuntime?.cleanup?.();
    }
  });
});
