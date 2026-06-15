const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Ghost-preview while modifying a morph child (v1.1.95).
 *
 *  1. A morph child selected via the LAYERS PANEL (not isolated via double-click)
 *     must drag with a LIVE blend refold — the press must NOT hijack selection
 *     back to the container.
 *  2. The per-frame drag refold uses engine.refoldMorphGroupsForLayers(), a
 *     targeted refold that produces the SAME morphedPaths as a full
 *     computeAllDisplayGeometry() (so the cheap hot path stays correct).
 *  3. _startMirrorDrag records the dragged children's ancestor morph group ids
 *     in _morphDragGroupIds so the renderer can ghost-dim the blend during the
 *     drag even outside morph edit mode.
 */
describe('Morph child-drag ghost preview', () => {
  let runtime;
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const square = (off) => [
    { x: 20 + off, y: 20 }, { x: 60 + off, y: 20 },
    { x: 60 + off, y: 60 }, { x: 20 + off, y: 60 }, { x: 20 + off, y: 20 },
  ];
  const evt = (x, y, over = {}) => ({
    clientX: x, clientY: y, button: 0, pointerType: 'mouse', pointerId: 1,
    shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
    preventDefault() {}, stopPropagation() {}, ...over,
  });
  function installSyncRaf(window) {
    const pending = new Map(); let nextId = 1;
    window.requestAnimationFrame = (cb) => { const id = nextId++; pending.set(id, cb); return id; };
    window.cancelAnimationFrame = (id) => { pending.delete(id); };
    globalThis.requestAnimationFrame = window.requestAnimationFrame;
    globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
    return { flush() { const cbs = [...pending.values()]; pending.clear(); cbs.forEach((cb) => cb(Date.now())); } };
  }
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
    renderer.ready = true; renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    renderer.onComputeDisplayGeometry = () => engine.computeAllDisplayGeometry();
    renderer.setTool('select');
    return { engine, renderer, container, children };
  }

  test('panel-selected child drags live without hijacking selection to the container', async () => {
    const { renderer, container, children } = await setup();
    const raf = installSyncRaf(runtime.window);
    // Layers-panel style selection of the child (no morph edit isolation).
    renderer.setSelection([children[0].id], children[0].id);
    const before = JSON.stringify(container.morphedPaths);

    renderer.down(evt(40, 40)); // press inside child 0's bbox
    expect(renderer.isLayerDrag).toBe(true);
    expect(renderer._morphDragActive).toBe(true);
    // Selection must NOT have been hijacked to the container.
    expect([...renderer.selectedLayerIds]).toEqual([children[0].id]);

    renderer.move(evt(70, 70));
    raf.flush();
    expect(JSON.stringify(container.morphedPaths)).not.toBe(before); // refolded mid-drag
    renderer.up(evt(70, 70));
    // Commit shifted the child.
    expect(children[0].params.posX).toBeCloseTo(30, 3);
  });

  test('refoldMorphGroupsForLayers matches a full computeAllDisplayGeometry refold', async () => {
    const { engine, container, children } = await setup();
    // Translate child 0 the way the move() drag branch does.
    const child = children[0];
    child.paths = child.paths.map((path) =>
      Array.isArray(path) ? path.map((pt) => ({ x: pt.x + 25, y: pt.y })) : path);
    engine.computeLayerEffectiveGeometry(child.id);
    engine.computeLayerDisplayGeometry(child.id);

    expect(typeof engine.refoldMorphGroupsForLayers).toBe('function');
    engine.refoldMorphGroupsForLayers([child.id]);
    const targeted = JSON.stringify(container.morphedPaths);

    engine.computeAllDisplayGeometry();
    const full = JSON.stringify(container.morphedPaths);
    expect(targeted).toBe(full);
  });

  test('_startMirrorDrag records the ancestor morph group id for ghost-dimming', async () => {
    const { renderer, container, children } = await setup();
    renderer.setTool('select');
    renderer._startMirrorDrag([children[0]]);
    // (instanceof Set is cross-realm-unsafe under jsdom; assert behaviorally.)
    expect(renderer._morphDragGroupIds.has(container.id)).toBe(true);
    renderer._clearMorphDrag();
    expect(renderer._morphDragGroupIds.size).toBe(0);
  });

  // Regression: pressing the FILLED INTERIOR of an isolated child (the natural
  // way to grab and drag it) must keep isolation and arm the morph drag. The
  // bug: findMorphChildAtPoint only hits a child's sparse OUTLINE and
  // findMorphContainerAtPoint only hits a blend ring, so an interior press
  // (e.g. a hexagon's empty centroid) matched neither and down() called
  // exitGroupEditMode() — dropping isolation so the blend never refolded.
  const circle = (cx, cy, r) => {
    const p = [];
    for (let i = 0; i < 48; i += 1) { const a = (i / 48) * Math.PI * 2; p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
    p.push({ x: cx + r, y: cy });
    p.meta = { kind: 'circle', cx, cy, r, closed: true };
    return p;
  };
  const hexagon = (cx, cy, r) => {
    const p = [];
    for (let i = 0; i < 6; i += 1) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
    p.push({ ...p[0] });
    p.meta = { kind: 'polygon', closed: true };
    return p;
  };

  test('pressing an isolated child’s interior keeps isolation, arms the morph drag, and refolds live', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const raf = installSyncRaf(runtime.window);
    const engine = new VectorEngine();
    engine.layers = [];
    const modifierId = engine.addModifierLayer('morph');
    const oval = new Layer('oval-child', 'shape', 'Oval');
    oval.parentId = modifierId; oval.sourcePaths = [circle(80, 90, 28)];
    const poly = new Layer('poly-child', 'shape', 'Polygon');
    poly.parentId = modifierId; poly.sourcePaths = [hexagon(200, 90, 32)];
    engine.layers.push(oval, poly);
    engine.generate(oval.id); engine.generate(poly.id);
    engine.computeAllDisplayGeometry();
    const container = engine.layers.find((l) => l.id === modifierId);
    const renderer = new Renderer('main-canvas', engine);
    renderer.ready = true; renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    renderer.onComputeDisplayGeometry = () => engine.computeAllDisplayGeometry();
    renderer.setTool('select');

    renderer.enterMorphEditMode(poly, container);
    const before = JSON.stringify(container.morphedPaths);

    // Press the hexagon's centroid (200,90) — interior, off every outline/ring.
    const evt = (x, y) => ({
      clientX: x, clientY: y, button: 0, pointerType: 'mouse', pointerId: 1,
      shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
      preventDefault() {}, stopPropagation() {},
    });
    renderer.down(evt(200, 90));
    // Isolation preserved (NOT exited), and the drag armed as a morph drag.
    expect(renderer.groupEditMode).toEqual({ groupId: container.id, activeLayerId: poly.id, kind: 'morph' });
    expect(renderer.isLayerDrag).toBe(true);
    expect(renderer._morphDragActive).toBe(true);

    renderer.move(evt(200, 200)); // drag the hexagon down
    raf.flush();
    expect(JSON.stringify(container.morphedPaths)).not.toBe(before); // refolded live
    renderer.up(evt(200, 200));
  });

  // The user's real gesture: DOUBLE-CLICK a child to isolate it, then drag. The
  // bug: the double-click isolate decision gates enterMorphEditMode on
  // findMorphChildAtPoint, which only hits a child's sparse OUTLINE — so
  // double-clicking the filled INTERIOR never isolates, and the drag operates on
  // the container with no live refold or ghost-dim.
  test('double-clicking a child’s body isolates it, then dragging the body refolds live', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const raf = installSyncRaf(runtime.window);
    const engine = new VectorEngine();
    engine.layers = [];
    const modifierId = engine.addModifierLayer('morph');
    const oval = new Layer('oval-child', 'shape', 'Oval');
    oval.parentId = modifierId; oval.sourcePaths = [circle(80, 90, 28)];
    const poly = new Layer('poly-child', 'shape', 'Polygon');
    poly.parentId = modifierId; poly.sourcePaths = [hexagon(200, 90, 32)];
    engine.layers.push(oval, poly);
    engine.generate(oval.id); engine.generate(poly.id);
    engine.computeAllDisplayGeometry();
    const container = engine.layers.find((l) => l.id === modifierId);
    const renderer = new Renderer('main-canvas', engine);
    renderer.ready = true; renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    renderer.onComputeDisplayGeometry = () => engine.computeAllDisplayGeometry();
    renderer.setTool('select');
    const before = JSON.stringify(container.morphedPaths);

    const evt = (x, y) => ({
      clientX: x, clientY: y, button: 0, pointerType: 'mouse', pointerId: 1,
      shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
      preventDefault() {}, stopPropagation() {},
    });
    // DOUBLE-CLICK on the hexagon's filled INTERIOR (centroid 200,90) — off the outline.
    renderer.down(evt(200, 90)); renderer.up(evt(200, 90));
    renderer.down(evt(200, 90)); renderer.up(evt(200, 90));
    // Must have isolated the polygon child (NOT re-selected the container).
    expect(renderer.groupEditMode).toEqual({ groupId: container.id, activeLayerId: poly.id, kind: 'morph' });
    expect([...renderer.selectedLayerIds]).toEqual([poly.id]);

    // Then a body-drag refolds the blend live.
    renderer.down(evt(200, 90));
    expect(renderer._morphDragActive).toBe(true);
    renderer.move(evt(200, 200));
    raf.flush();
    expect(JSON.stringify(container.morphedPaths)).not.toBe(before);
    renderer.up(evt(200, 200));
  });

  // The natural one-motion gesture: click, then the SECOND press is HELD and
  // dragged (no release before moving). The double-click must isolate AND arm the
  // drag in the same press — a return-after-enterMorphEditMode swallowed the held
  // drag (isLayerDrag never armed) so the blend froze.
  test('double-click-drag in one motion (held second press) isolates and refolds live', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const raf = installSyncRaf(runtime.window);
    const engine = new VectorEngine();
    engine.layers = [];
    const modifierId = engine.addModifierLayer('morph');
    const oval = new Layer('oval-child', 'shape', 'Oval');
    oval.parentId = modifierId; oval.sourcePaths = [circle(80, 90, 28)];
    const poly = new Layer('poly-child', 'shape', 'Polygon');
    poly.parentId = modifierId; poly.sourcePaths = [hexagon(200, 90, 32)];
    engine.layers.push(oval, poly);
    engine.generate(oval.id); engine.generate(poly.id);
    engine.computeAllDisplayGeometry();
    const container = engine.layers.find((l) => l.id === modifierId);
    const renderer = new Renderer('main-canvas', engine);
    renderer.ready = true; renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    renderer.onComputeDisplayGeometry = () => engine.computeAllDisplayGeometry();
    renderer.setTool('select');
    const before = JSON.stringify(container.morphedPaths);

    const evt = (x, y) => ({
      clientX: x, clientY: y, button: 0, pointerType: 'mouse', pointerId: 1,
      shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
      preventDefault() {}, stopPropagation() {},
    });
    // click, then HOLD the second press and drag (no up between down#2 and move).
    renderer.down(evt(200, 90)); renderer.up(evt(200, 90));
    renderer.down(evt(200, 90)); // 2nd click of the double-click, held
    expect(renderer.groupEditMode).toEqual({ groupId: container.id, activeLayerId: poly.id, kind: 'morph' });
    expect(renderer.isLayerDrag).toBe(true);   // drag armed in the same press
    expect(renderer._morphDragActive).toBe(true);
    renderer.move(evt(200, 220));              // drag while still held
    raf.flush();
    expect(JSON.stringify(container.morphedPaths)).not.toBe(before); // refolded live
    renderer.up(evt(200, 220));
  });
});
