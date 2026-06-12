const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Transform semantics for Illustrator-style morph sub-selection:
 *  - Selecting the morph CONTAINER (one object) and transforming it fans the
 *    committed move/resize/rotate out to every leaf, then refolds the blend.
 *    (The historical `if (layer.isGroup) return;` commit guard would otherwise
 *    silently discard a container transform.)
 *  - Transforming an isolated child commits to the child's params and refolds
 *    the parent's morphedPaths.
 *
 * Drives the same renderer-state-then-up() pattern as
 * tests/integration/multi-selection-transform.test.js.
 */
describe('Morph child + container transform commit', () => {
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

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
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
    const container = engine.layers.find((l) => l.id === modifierId);
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.setTool('select');
    return { engine, renderer, container, children };
  }

  const morphSpanX = (container) => {
    let minX = Infinity, maxX = -Infinity;
    container.morphedPaths.forEach((p) => (Array.isArray(p) ? p : []).forEach((pt) => {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
    }));
    return { minX, maxX };
  };

  // T21 — container move fans out to leaves
  test('moving the selected morph container shifts every leaf and translates the blend', async () => {
    const { renderer, container, children } = await setup();
    renderer.setSelection([container.id], container.id);
    const before = morphSpanX(container);
    const startPos = children.map((c) => ({ x: c.params.posX ?? 0, y: c.params.posY ?? 0 }));

    renderer.isLayerDrag = true;
    renderer.dragMode = 'move';
    renderer.snap = null;
    renderer.snapAllowed = false;
    renderer.tempTransform = { dx: 30, dy: 12, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
    renderer.up({});

    children.forEach((c, i) => {
      expect(c.params.posX).toBeCloseTo(startPos[i].x + 30, 4);
      expect(c.params.posY).toBeCloseTo(startPos[i].y + 12, 4);
    });
    const after = morphSpanX(container);
    expect(after.minX).toBeCloseTo(before.minX + 30, 1);
    expect(after.maxX).toBeCloseTo(before.maxX + 30, 1);
  });

  // T22 — container resize fans out to leaves
  test('resizing the selected morph container scales every leaf and the blend', async () => {
    const { renderer, container, children } = await setup();
    renderer.setSelection([container.id], container.id);
    const before = morphSpanX(container);
    const startScale = children.map((c) => ({ x: c.params.scaleX ?? 1, y: c.params.scaleY ?? 1 }));
    const bounds = renderer.getLayerBounds(container);
    const origin = renderer.getResizeAnchor('se', bounds);

    renderer.isLayerDrag = true;
    renderer.dragMode = 'resize';
    renderer.activeHandle = 'nw';
    renderer.startBounds = bounds;
    renderer.snap = null;
    renderer.snapAllowed = false;
    renderer.tempTransform = { dx: 0, dy: 0, scaleX: 2, scaleY: 2, origin, rotation: 0 };
    renderer.up({});

    children.forEach((c, i) => {
      expect(c.params.scaleX).toBeCloseTo(startScale[i].x * 2, 4);
      expect(c.params.scaleY).toBeCloseTo(startScale[i].y * 2, 4);
    });
    const after = morphSpanX(container);
    expect(after.maxX - after.minX).toBeGreaterThan((before.maxX - before.minX) * 1.5);
  });

  // T18 — moving an isolated child commits and refolds the blend
  test('moving an isolated morph child commits to the child and refolds the blend', async () => {
    const { renderer, container, children } = await setup();
    const child = children[0];
    renderer.enterMorphEditMode(child, container);
    const before = JSON.stringify(container.morphedPaths);
    const startPosX = child.params.posX ?? 0;

    renderer.isLayerDrag = true;
    renderer.dragMode = 'move';
    renderer.snap = null;
    renderer.snapAllowed = false;
    renderer._startMirrorDrag([child]);
    expect(renderer._morphDragActive).toBe(true);
    renderer.tempTransform = { dx: 18, dy: 0, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
    renderer.up({});

    expect(child.params.posX).toBeCloseTo(startPosX + 18, 4);
    expect(JSON.stringify(container.morphedPaths)).not.toBe(before);
    // Still isolated after a child edit.
    expect(renderer.groupEditMode).toEqual({ groupId: container.id, activeLayerId: child.id, kind: 'morph' });
  });

  // Drive requestAnimationFrame synchronously (pattern from morph-drag-preview).
  function installSyncRaf(window) {
    const pending = new Map();
    let nextId = 1;
    window.requestAnimationFrame = (cb) => { const id = nextId++; pending.set(id, cb); return id; };
    window.cancelAnimationFrame = (id) => { pending.delete(id); };
    if (typeof globalThis !== 'undefined') {
      globalThis.requestAnimationFrame = window.requestAnimationFrame;
      globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
    }
    return { flush() { const cbs = [...pending.values()]; pending.clear(); cbs.forEach((cb) => cb(Date.now())); } };
  }

  // M2 — resizing an isolated child refolds the blend LIVE (not just on commit)
  test('resizing an isolated child refolds morphedPaths live during the drag', async () => {
    const { renderer, container, children } = await setup();
    const raf = installSyncRaf(runtime.window);
    const child = children[0];
    renderer.enterMorphEditMode(child, container);
    // Arm the morph drag snapshot the same way the resize handle-start does.
    renderer.isLayerDrag = true;
    renderer._startMirrorDrag([child]);
    expect(renderer._morphDragActive).toBe(true);
    const before = JSON.stringify(container.morphedPaths);

    // Mid-drag resize transform (scale about an origin), then preview.
    renderer.tempTransform = { dx: 0, dy: 0, scaleX: 1.8, scaleY: 1.8, origin: { x: 40, y: 40 } };
    renderer._previewMirrorDragWithTemp(renderer.tempTransform);
    raf.flush();

    expect(JSON.stringify(container.morphedPaths)).not.toBe(before);
  });

  // Contract guard — a plain (non-morph) group container transform is a NO-OP
  // (children unchanged): _expandTransformTargets must not fan out non-morph groups.
  test('moving a selected PLAIN group container does not move its children', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const grp = new Layer('grp', 'group', 'Group');
    grp.isGroup = true;
    grp.groupType = 'group';
    const child = new Layer('gc', 'shape', 'GC');
    child.parentId = grp.id;
    child.sourcePaths = [square(0)];
    engine.layers.push(grp, child);
    engine.generate(child.id);
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.setTool('select');
    renderer.setSelection([grp.id], grp.id);
    const startX = child.params.posX ?? 0;

    renderer.isLayerDrag = true;
    renderer.dragMode = 'move';
    renderer.snap = null;
    renderer.snapAllowed = false;
    renderer.tempTransform = { dx: 50, dy: 50, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
    renderer.up({});

    expect(child.params.posX ?? 0).toBeCloseTo(startX, 6);
  });

  // Container move fans out to a leaf nested under a subgroup (descendant walk).
  test('moving the container fans out to a leaf nested under a subgroup', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const modifierId = engine.addModifierLayer('morph');
    const sub = new Layer('sub', 'group', 'Sub');
    sub.isGroup = true;
    sub.groupType = 'group';
    sub.parentId = modifierId;
    const nested = new Layer('nested-leaf', 'shape', 'Nested');
    nested.parentId = sub.id;
    nested.sourcePaths = [square(0)];
    const plain = new Layer('plain-leaf', 'shape', 'Plain');
    plain.parentId = modifierId;
    plain.sourcePaths = [square(40)];
    engine.layers.push(sub, nested, plain);
    engine.generate(nested.id);
    engine.generate(plain.id);
    engine.computeAllDisplayGeometry();
    const container = engine.layers.find((l) => l.id === modifierId);
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.setTool('select');
    renderer.setSelection([container.id], container.id);
    const startNestedX = nested.params.posX ?? 0;

    renderer.isLayerDrag = true;
    renderer.dragMode = 'move';
    renderer.snap = null;
    renderer.snapAllowed = false;
    renderer.tempTransform = { dx: 22, dy: 0, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
    renderer.up({});

    expect(nested.params.posX).toBeCloseTo(startNestedX + 22, 4);
  });

  // RG1 — a plain (non-morph) leaf still commits exactly as before
  test('a directly-selected non-group leaf still moves (no fan-out regression)', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('plain', 'shape', 'Plain');
    layer.sourcePaths = [square(0)];
    engine.layers.push(layer);
    engine.generate(layer.id);
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.setTool('select');
    renderer.setSelection([layer.id], layer.id);
    const startX = layer.params.posX ?? 0;

    renderer.isLayerDrag = true;
    renderer.dragMode = 'move';
    renderer.snap = null;
    renderer.snapAllowed = false;
    renderer.tempTransform = { dx: 25, dy: -7, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
    renderer.up({});

    expect(layer.params.posX).toBeCloseTo(startX + 25, 4);
    expect(layer.params.posY).toBeCloseTo(-7, 4);
  });
});
