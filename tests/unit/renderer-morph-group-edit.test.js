const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Illustrator-style sub-selection for the MORPH modifier.
 *
 * Contract (see design spec):
 *  - Single click on a morph's blended output selects the morph CONTAINER as one
 *    object (one bbox around `morphedPaths`).  -> findMorphContainerAtPoint
 *  - Double click on a source child enters morph-isolation on that child.
 *    -> findMorphChildAtPoint + enterMorphEditMode
 *  - Escape exits isolation back to the CONTAINER (not the consumed children).
 *  - Consumed children never steal a single click (getInteractionPaths untouched).
 *  - Mirror / compound containers are NOT morph-drillable.
 *
 * These exercise the testable building blocks directly (the codebase tests
 * selection via internal methods, e.g. renderer-group-drag-select.test.js).
 */
describe('Renderer — morph modifier group sub-selection', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // Two axis-aligned squares; child 0 spans x[20,60], child 1 spans x[60,100],
  // both y[20,60]. POLYLINE geometry on purpose (primitive children would pass
  // the bounds tests trivially and hide the consumed-child bounds bug).
  const square = (off) => [
    { x: 20 + off, y: 20 },
    { x: 60 + off, y: 20 },
    { x: 60 + off, y: 60 },
    { x: 20 + off, y: 60 },
    { x: 20 + off, y: 20 },
  ];

  function buildMorph(engine, Layer, { offsets = [0, 40] } = {}) {
    const modifierId = engine.addModifierLayer('morph');
    const children = offsets.map((off, i) => {
      const child = new Layer(`morph-child-${i}`, 'shape', `Child ${i}`);
      child.parentId = modifierId;
      child.sourcePaths = [square(off)];
      engine.layers.push(child);
      engine.generate(child.id);
      return child;
    });
    engine.computeAllDisplayGeometry();
    const container = engine.layers.find((l) => l.id === modifierId);
    return { container, children };
  }

  function makeRenderer(engine) {
    const { Renderer } = runtime.window.Vectura;
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.setTool('select');
    return renderer;
  }

  const aabbOf = (bounds) => {
    const xs = Object.values(bounds.corners).map((p) => p.x);
    const ys = Object.values(bounds.corners).map((p) => p.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };

  async function setup(opts) {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const built = buildMorph(engine, Layer, opts);
    const renderer = makeRenderer(engine);
    return { engine, renderer, Layer, ...built };
  }

  test('the morph children are consumed and the container carries morphedPaths', async () => {
    const { container, children } = await setup();
    expect(Array.isArray(container.morphedPaths) && container.morphedPaths.length).toBeTruthy();
    children.forEach((c) => expect(c._morphConsumed).toBe(true));
  });

  // T1 — container is hit-testable against morphedPaths
  test('findMorphContainerAtPoint hits the morph container on a point on the blend', async () => {
    const { renderer, container } = await setup();
    // (40,20) lies on the top edge shared by every ring of the blend.
    const hit = renderer.findMorphContainerAtPoint({ x: 40, y: 20 });
    expect(hit).toBe(container);
  });

  test('findMorphContainerAtPoint returns null far from the blend', async () => {
    const { renderer } = await setup();
    expect(renderer.findMorphContainerAtPoint({ x: 500, y: 500 })).toBeNull();
  });

  // RG7 — consumed children must NOT be hit-testable via findLayerAtPoint
  test('findLayerAtPoint does not return a consumed morph child (no single-click steal)', async () => {
    const { renderer } = await setup();
    const hit = renderer.findLayerAtPoint({ x: 40, y: 20 });
    expect(hit).toBeNull();
  });

  // T3 — container State-A bounds box the BLEND, not the source-child union
  test('container bounds box the blended output, not the union of source children', async () => {
    const { renderer, container, children } = await setup();
    const cb = aabbOf(renderer.getLayerBounds(container));
    // Source union of the two squares: x[20,100], y[20,60].
    let uMinX = Infinity, uMaxX = -Infinity;
    children.forEach((c) => c.effectivePaths.forEach((p) => p.forEach((pt) => {
      uMinX = Math.min(uMinX, pt.x); uMaxX = Math.max(uMaxX, pt.x);
    })));
    // morphedPaths bound must match the blend extent.
    let mMinX = Infinity, mMaxX = -Infinity, mMinY = Infinity, mMaxY = -Infinity;
    container.morphedPaths.forEach((p) => (Array.isArray(p) ? p : []).forEach((pt) => {
      mMinX = Math.min(mMinX, pt.x); mMaxX = Math.max(mMaxX, pt.x);
      mMinY = Math.min(mMinY, pt.y); mMaxY = Math.max(mMaxY, pt.y);
    }));
    expect(cb.minX).toBeCloseTo(mMinX, 1);
    expect(cb.maxX).toBeCloseTo(mMaxX, 1);
    expect(cb.minY).toBeCloseTo(mMinY, 1);
    expect(cb.maxY).toBeCloseTo(mMaxY, 1);
  });

  // T4 — double-click resolution: nearest source child
  test('findMorphChildAtPoint returns the source child under the cursor', async () => {
    const { renderer, container, children } = await setup();
    expect(renderer.findMorphChildAtPoint({ x: 40, y: 20 }, container.id)).toBe(children[0]);
    expect(renderer.findMorphChildAtPoint({ x: 80, y: 20 }, container.id)).toBe(children[1]);
  });

  // T5 — off all source geometry => null (caller stays at State A)
  test('findMorphChildAtPoint returns null when no source child is under the cursor', async () => {
    const { renderer, container } = await setup();
    // Interior of child 0, far from any of its edges (>tolerance).
    expect(renderer.findMorphChildAtPoint({ x: 40, y: 40 }, container.id)).toBeNull();
  });

  // T6 — consumed POLYLINE child has finite isolation bounds
  test('a consumed polyline child still produces finite bounds for its isolation box', async () => {
    const { renderer, children } = await setup();
    const b = renderer.getLayerBounds(children[0]);
    expect(b).not.toBeNull();
    const aabb = aabbOf(b);
    expect(aabb.minX).toBeCloseTo(20, 1);
    expect(aabb.maxX).toBeCloseTo(60, 1);
    expect(aabb.minY).toBeCloseTo(20, 1);
    expect(aabb.maxY).toBeCloseTo(60, 1);
  });

  // T8 — locked source child is skipped
  test('findMorphChildAtPoint skips a locked source child', async () => {
    const { renderer, container, children } = await setup();
    renderer.isLayerLocked = (id) => id === children[0].id;
    expect(renderer.findMorphChildAtPoint({ x: 40, y: 20 }, container.id)).toBeNull();
    // Unlocked sibling is still reachable.
    expect(renderer.findMorphChildAtPoint({ x: 80, y: 20 }, container.id)).toBe(children[1]);
  });

  // T9 — nested leaf (two levels under the morph) resolves via descendant walk
  test('findMorphChildAtPoint resolves a leaf nested under a subgroup inside the morph', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const modifierId = engine.addModifierLayer('morph');
    // A plain subgroup inside the morph, with the real leaf nested under it.
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
    const renderer = makeRenderer(engine);
    expect(renderer.findMorphChildAtPoint({ x: 40, y: 20 }, modifierId)).toBe(nested);
  });

  // enterMorphEditMode / exitGroupEditMode state machine
  test('enterMorphEditMode isolates the child with kind="morph" and groupId=container', async () => {
    const { renderer, container, children } = await setup();
    renderer.enterMorphEditMode(children[0], container);
    expect(renderer.groupEditMode).toEqual({
      groupId: container.id,
      activeLayerId: children[0].id,
      kind: 'morph',
    });
    expect([...renderer.selectedLayerIds]).toEqual([children[0].id]);
    expect(renderer.selectedLayerId).toBe(children[0].id);
  });

  // T12 — Escape exits morph isolation to the CONTAINER (not the consumed children)
  test('exitGroupEditMode from morph isolation re-selects the container', async () => {
    const { renderer, container, children } = await setup();
    renderer.enterMorphEditMode(children[0], container);
    renderer.exitGroupEditMode();
    expect(renderer.groupEditMode).toBeNull();
    expect([...renderer.selectedLayerIds]).toEqual([container.id]);
    expect(renderer.selectedLayerId).toBe(container.id);
  });

  // RG1 — plain group enterGroupEditMode still uses kind="group"
  test('enterGroupEditMode tags the isolation kind as "group"', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Layer } = runtime.window.Vectura;
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
    const renderer = makeRenderer(engine);
    renderer.enterGroupEditMode(child);
    expect(renderer.groupEditMode.kind).toBe('group');
    expect(renderer.groupEditMode.groupId).toBe(grp.id);
  });

  // Locked morph container is not selectable via the blend
  test('findMorphContainerAtPoint skips a locked container', async () => {
    const { renderer, container } = await setup();
    renderer.isLayerLocked = (id) => id === container.id;
    expect(renderer.findMorphContainerAtPoint({ x: 40, y: 20 })).toBeNull();
  });

  // RG7 — a real layer overlapping the morph output wins the single click
  test('findLayerAtPoint returns an overlapping normal layer over the blend, not a child', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const modifierId = engine.addModifierLayer('morph');
    [0, 40].forEach((off, i) => {
      const child = new Layer(`mc-${i}`, 'shape', `C${i}`);
      child.parentId = modifierId;
      child.sourcePaths = [square(off)];
      engine.layers.push(child);
      engine.generate(child.id);
    });
    // A normal top layer whose edge passes exactly through (40,20).
    const over = new Layer('over', 'shape', 'Over');
    over.sourcePaths = [[{ x: 0, y: 20 }, { x: 200, y: 20 }]];
    engine.layers.push(over);
    engine.generate(over.id);
    engine.computeAllDisplayGeometry();
    const renderer = makeRenderer(engine);
    expect(renderer.findLayerAtPoint({ x: 40, y: 20 })).toBe(over);
  });

  // RG4 — mirror containers are not morph-drillable
  test('findMorphContainerAtPoint ignores a mirror modifier container', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const modifierId = engine.addModifierLayer('mirror');
    const child = new Layer('mc', 'shape', 'MC');
    child.parentId = modifierId;
    child.sourcePaths = [[{ x: 20, y: 50 }, { x: 80, y: 50 }]];
    engine.layers.push(child);
    engine.generate(child.id);
    engine.computeAllDisplayGeometry();
    const renderer = makeRenderer(engine);
    expect(renderer.findMorphContainerAtPoint({ x: 50, y: 50 })).toBeNull();
  });
});
