const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * End-to-end pointer routing for morph sub-selection: drives renderer.down()
 * with synthetic mouse events (jsdom getBoundingClientRect is 0,0 and
 * screenToWorld is linear at scale=1/offset=0, so clientX/Y == world X/Y).
 *
 *  - single click on the blend  -> select the morph CONTAINER (one object)
 *  - double click on a source child -> enter morph isolation on that child
 *  - click outside while isolated   -> exit isolation
 */
describe('Morph sub-selection — down() pointer routing', () => {
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

  const evt = (x, y) => ({
    clientX: x, clientY: y, button: 0, pointerType: 'mouse', pointerId: 1,
    shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
    preventDefault() {}, stopPropagation() {},
  });

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
    renderer.ready = true;
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.setTool('select');
    return { renderer, container, children };
  }

  test('single click on the blend selects the morph container', async () => {
    const { renderer, container } = await setup();
    // (40,20): on the shared top edge of the blend.
    renderer.down(evt(40, 20));
    renderer.up(evt(40, 20));
    expect([...renderer.selectedLayerIds]).toEqual([container.id]);
    expect(renderer.groupEditMode).toBeNull();
  });

  test('double click on a source child enters morph isolation on that child', async () => {
    const { renderer, container, children } = await setup();
    renderer.down(evt(80, 20)); // child 1's top edge
    renderer.up(evt(80, 20));
    renderer.down(evt(80, 20)); // second click within the double-click window
    expect(renderer.groupEditMode).toEqual({
      groupId: container.id,
      activeLayerId: children[1].id,
      kind: 'morph',
    });
    expect([...renderer.selectedLayerIds]).toEqual([children[1].id]);
  });

  test('clicking far outside while isolated exits isolation', async () => {
    const { renderer, container, children } = await setup();
    renderer.enterMorphEditMode(children[0], container);
    renderer.down(evt(400, 400)); // empty canvas, far from any geometry
    expect(renderer.groupEditMode).toBeNull();
  });

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

  // Real interactive flow: dragging an isolated end must refold the blend LIVE
  // (mid-drag, before release) so the in-between rings track the moving end.
  test('dragging an isolated end previews the morph live (mid-drag, before release)', async () => {
    const { renderer, container, children } = await setup();
    renderer.onComputeDisplayGeometry = () => renderer.engine.computeAllDisplayGeometry();
    const raf = installSyncRaf(runtime.window);
    renderer.enterMorphEditMode(children[0], container); // isolate child 0
    const before = JSON.stringify(container.morphedPaths);

    // Press inside child 0's bbox (x[20,60] y[20,60]) and drag — the real
    // down()/move() handlers arm _startMirrorDrag and schedule the live refold.
    renderer.down(evt(40, 40));
    expect(renderer.isLayerDrag).toBe(true);
    expect(renderer._morphDragActive).toBe(true);
    renderer.move(evt(70, 70)); // drag the end by (+30,+30)
    raf.flush();

    expect(JSON.stringify(container.morphedPaths)).not.toBe(before); // refolded mid-drag
    renderer.up(evt(70, 70));
  });

  test('single click on the blend does NOT clear an existing selection (no marquee)', async () => {
    const { renderer, container } = await setup();
    renderer.down(evt(40, 20));
    renderer.up(evt(40, 20));
    // A second single click on the blend keeps the container selected.
    renderer.down(evt(58, 20));
    expect(renderer.isSelecting).toBe(false);
    expect([...renderer.selectedLayerIds]).toEqual([container.id]);
  });
});
