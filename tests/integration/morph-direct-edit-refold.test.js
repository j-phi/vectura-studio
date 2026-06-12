const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Editing one END of a morph (reshaping a source child via the direct-select
 * tool — e.g. dragging a vertex or a bevel handle) must refold the blend so the
 * in-between rings track the edit. `_applySelectionPath` only ran
 * `engine.generate(child.id)` (which does NOT recompute the parent morph) and
 * the direct-edit commit hook only redraws — so a morph child's shape edits
 * never reached `morphedPaths`, live OR on commit.
 */
describe('Morph refolds when a source child is reshaped via direct-select', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // Anchored square (so the direct-select tool has anchors to edit).
  const anchoredSquare = (off) => {
    const anchors = [
      { x: 20 + off, y: 20, in: null, out: null },
      { x: 60 + off, y: 20, in: null, out: null },
      { x: 60 + off, y: 60, in: null, out: null },
      { x: 20 + off, y: 60, in: null, out: null },
    ];
    const pts = anchors.map((a) => ({ x: a.x, y: a.y }));
    pts.push({ x: pts[0].x, y: pts[0].y });
    pts.meta = { kind: 'shape', closed: true, anchors };
    return pts;
  };

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

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const modifierId = engine.addModifierLayer('morph');
    const children = [0, 60].map((off, i) => {
      const child = new Layer(`morph-child-${i}`, 'shape', `Child ${i}`);
      child.parentId = modifierId;
      child.sourcePaths = [anchoredSquare(off)];
      engine.layers.push(child);
      engine.generate(child.id);
      return child;
    });
    engine.computeAllDisplayGeometry();
    const container = engine.layers.find((l) => l.id === modifierId);
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.onComputeDisplayGeometry = () => engine.computeAllDisplayGeometry();
    return { engine, renderer, container, children };
  }

  test('dragging a source-child anchor refolds the parent morph (live, coalesced)', async () => {
    const { renderer, container, children } = await setup();
    const raf = installSyncRaf(runtime.window);
    const child = children[0];
    const sel = renderer.setDirectSelection(child, 0);
    expect(sel && sel.anchors && sel.anchors.length).toBeTruthy();
    const before = JSON.stringify(container.morphedPaths);

    // Reshape: move the first anchor outward, then apply (as updateDirectDrag does).
    sel.anchors[0].x -= 25;
    sel.anchors[0].y -= 25;
    renderer.applyDirectPath();
    raf.flush();

    expect(JSON.stringify(container.morphedPaths)).not.toBe(before);
  });

  test('non-morph layer edit does not schedule a morph refold (no needless recompute)', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('plain', 'shape', 'Plain');
    layer.sourcePaths = [anchoredSquare(0)];
    engine.layers.push(layer);
    engine.generate(layer.id);
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    let recomputes = 0;
    renderer.onComputeDisplayGeometry = () => { recomputes += 1; engine.computeAllDisplayGeometry(); };
    const raf = installSyncRaf(runtime.window);
    const sel = renderer.setDirectSelection(layer, 0);
    sel.anchors[0].x -= 10;
    renderer.applyDirectPath();
    raf.flush();
    expect(recomputes).toBe(0);
  });
});
