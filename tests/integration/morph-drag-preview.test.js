const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Dragging a CHILD of a morph modifier must show a LIVE preview of the
 * fully-updated morph (the in-between rings) while dragging, not just on
 * release. The renderer caches a morph-ancestor flag at drag start and
 * schedules one coalesced display-geometry recompute per frame during the
 * move so the parent's morphedPaths refresh live.
 */
describe('Morph modifier child-drag live preview', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const square = (off) => [
    { x: 20 + off, y: 20 },
    { x: 60 + off, y: 20 },
    { x: 60 + off, y: 60 },
    { x: 20 + off, y: 60 },
    { x: 20 + off, y: 20 },
  ];

  function buildMorphGroup(engine, { Layer }) {
    const modifierId = engine.addModifierLayer('morph');
    const children = [0, 40].map((off, i) => {
      const child = new Layer(`morph-child-${i}`, 'shape', `Child ${i}`);
      child.parentId = modifierId;
      child.sourcePaths = [square(off)];
      engine.layers.push(child);
      engine.generate(child.id);
      return child;
    });
    engine.computeAllDisplayGeometry();
    return { modifierId, children };
  }

  function buildMirrorGroup(engine, { Layer }) {
    const modLayer = new Layer('mod', 'shape', 'Mirror Group');
    modLayer.isGroup = true;
    modLayer.containerRole = 'modifier';
    modLayer.groupType = 'modifier';
    modLayer.modifier = {
      type: 'mirror',
      enabled: true,
      mirrors: [{ id: 'mx1', enabled: true, type: 'line', angle: 90, xShift: 0, yShift: 0, replacedSide: 'negative' }],
    };
    const child = new Layer('mirror-child', 'shape', 'Child');
    child.parentId = modLayer.id;
    child.paths = [[{ x: 20, y: 50 }, { x: 80, y: 50 }]];
    engine.layers.push(modLayer, child);
    engine.generate(child.id);
    return { modLayer, child };
  }

  test('_dragHasMorphAncestor is true for a morph child and false for a mirror child', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];
    const { children } = buildMorphGroup(engine, { Layer });
    const renderer = new Renderer('main-canvas', engine);
    expect(renderer._dragHasMorphAncestor([children[0]])).toBe(true);

    const engine2 = new VectorEngine();
    engine2.layers = [];
    const { child: mirrorChild } = buildMirrorGroup(engine2, { Layer });
    const renderer2 = new Renderer('main-canvas', engine2);
    expect(renderer2._dragHasMorphAncestor([mirrorChild])).toBe(false);
  });

  test('_startMirrorDrag sets _morphDragActive only when a morph ancestor is involved', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];
    const { children } = buildMorphGroup(engine, { Layer });
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer._startMirrorDrag([children[0]]);
    expect(renderer._morphDragActive).toBe(true);

    const engine2 = new VectorEngine();
    engine2.layers = [];
    const { child: mirrorChild } = buildMirrorGroup(engine2, { Layer });
    const renderer2 = new Renderer('main-canvas', engine2);
    renderer2.setTool('select');
    renderer2._startMirrorDrag([mirrorChild]);
    expect(renderer2._morphDragActive).toBe(false);
  });

  // Drive requestAnimationFrame synchronously so the coalesced recompute is
  // observable in-test, and capture the queued callbacks for cancel tests.
  function installSyncRaf(window) {
    const pending = new Map();
    let nextId = 1;
    window.requestAnimationFrame = (cb) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    };
    window.cancelAnimationFrame = (id) => { pending.delete(id); };
    if (typeof globalThis !== 'undefined') {
      globalThis.requestAnimationFrame = window.requestAnimationFrame;
      globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
    }
    return {
      flush() {
        const cbs = [...pending.values()];
        pending.clear();
        cbs.forEach((cb) => cb(Date.now()));
      },
      get count() { return pending.size; },
    };
  }

  test('scheduled morph recompute refreshes the parent morphedPaths live during a child drag', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const raf = installSyncRaf(runtime.window);

    const engine = new VectorEngine();
    engine.layers = [];
    const { modifierId, children } = buildMorphGroup(engine, { Layer });
    const group = engine.layers.find((l) => l.id === modifierId);
    const before = JSON.stringify(group.morphedPaths);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.isLayerDrag = true;
    renderer._startMirrorDrag([children[0]]);
    expect(renderer._morphDragActive).toBe(true);

    // Simulate move(): translate the dragged child's source-of-truth paths,
    // then schedule the coalesced morph recompute the move() branch performs.
    const dx = 25;
    renderer.mirrorDragState.forEach((state, layerId) => {
      const layer = engine.layers.find((l) => l.id === layerId);
      layer.paths = state.basePaths.map((path) =>
        Array.isArray(path) ? path.map((pt) => ({ x: pt.x + dx, y: pt.y })) : path
      );
      engine.computeLayerEffectiveGeometry?.(layer.id);
      engine.computeLayerDisplayGeometry?.(layer.id);
    });
    // Multiple moves in a single frame must coalesce to one recompute.
    renderer._scheduleMorphDragRecompute();
    renderer._scheduleMorphDragRecompute();
    expect(raf.count).toBe(1);
    expect(renderer._morphDragRaf).not.toBeNull();

    raf.flush();

    const after = JSON.stringify(group.morphedPaths);
    expect(after).not.toBe(before); // in-between rings updated live
    expect(renderer._morphDragRaf).toBeNull();
  });

  test('_clearMorphDrag cancels a pending recompute and resets the flag (no leak into next drag)', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const raf = installSyncRaf(runtime.window);

    const engine = new VectorEngine();
    engine.layers = [];
    const { modifierId, children } = buildMorphGroup(engine, { Layer });
    const group = engine.layers.find((l) => l.id === modifierId);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.isLayerDrag = true;
    renderer._startMirrorDrag([children[0]]);
    renderer._scheduleMorphDragRecompute();
    expect(renderer._morphDragRaf).not.toBeNull();

    const snapshot = JSON.stringify(group.morphedPaths);
    renderer._clearMorphDrag();
    expect(renderer._morphDragActive).toBe(false);
    expect(renderer._morphDragRaf).toBeNull();

    // Flushing must NOT run the cancelled recompute.
    raf.flush();
    expect(JSON.stringify(group.morphedPaths)).toBe(snapshot);
  });
});
