/*
 * FLIP-1/2 integration reconciliation (Illustrator Tools Parity Phase 1) —
 * the composed test neither Lane A nor Lane C could write alone.
 *
 * Lane A owns renderer.flipSelection(axis) (the SEL-3 command wrapper); Lane C
 * owns window.Vectura.PathEditOps.flipLayers (the geometry op + history). In
 * isolation each pushed its own history snapshot, so a flip driven through the
 * renderer took TWO undo steps — violating SEL-3's "one undo step" acceptance.
 * The integration fix makes flipLayers the SOLE owner of the checkpoint (given
 * the app the wrapper threads through) and has the wrapper read the returned
 * {changed} object rather than `!== false`.
 *
 * This drives the REAL renderer wrapper against the REAL PathEditOps op inside
 * the full-stack app, asserting exactly one undo step and a clean restore.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

const clonePaths = (paths) =>
  (paths || []).map((p) => p.map((pt) => ({ x: pt.x, y: pt.y })));

describe('FLIP-1/2: renderer.flipSelection + real PathEditOps = one undo step', () => {
  let runtime;
  let window;
  let app;
  let renderer;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    renderer = app.renderer;
    await waitForUi();
    // Deterministic document: clear the default seeded layers.
    app.engine.layers.slice().forEach((l) => app.engine.removeLayer(l.id));
  });

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function addShape(id) {
    const { Layer } = window.Vectura;
    const layer = new Layer(id, 'shape', id.toUpperCase());
    layer.sourcePaths = [[
      { x: 40, y: 40 }, { x: 90, y: 40 }, { x: 90, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 },
    ]];
    app.engine.layers.push(layer);
    app.engine.generate(layer.id);
    return layer;
  }

  test('the real op is loaded (script tag wired) and the app is threaded to the renderer', () => {
    expect(typeof window.Vectura.PathEditOps?.flipLayers).toBe('function');
    expect(renderer.app).toBe(app);
  });

  test('a flip of a selection is exactly ONE undo step; undo restores geometry', () => {
    const layer = addShape('flip-x');
    renderer.setSelection([layer.id], layer.id);
    const before = clonePaths(layer.paths);
    const historyBefore = app.history.length;

    const changed = renderer.flipSelection('horizontal');
    expect(changed).toBe(true);

    // The crux: exactly one snapshot, not two (the double-push regression).
    expect(app.history.length).toBe(historyBefore + 1);

    const after = layer.paths;
    // Geometry actually mirrored (x reflected about the selection center).
    const movedX = after.some((p, i) => p.some((pt, j) => Math.abs(pt.x - before[i][j].x) > 1e-6));
    expect(movedX).toBe(true);

    // A single undo restores the original geometry.
    app.undo();
    const restored = app.engine.layers.find((l) => l.id === layer.id).paths;
    restored.forEach((p, i) => p.forEach((pt, j) => {
      expect(pt.x).toBeCloseTo(before[i][j].x, 4);
      expect(pt.y).toBeCloseTo(before[i][j].y, 4);
    }));
  });

  test('a multi-selection flip is also exactly ONE undo step', () => {
    const a = addShape('flip-a');
    const b = addShape('flip-b');
    b.sourcePaths = [[
      { x: 140, y: 40 }, { x: 190, y: 40 }, { x: 190, y: 80 }, { x: 140, y: 80 }, { x: 140, y: 40 },
    ]];
    app.engine.generate(b.id);
    renderer.setSelection([a.id, b.id], a.id);
    const historyBefore = app.history.length;

    renderer.flipSelection('vertical');
    expect(app.history.length).toBe(historyBefore + 1);
  });
});
