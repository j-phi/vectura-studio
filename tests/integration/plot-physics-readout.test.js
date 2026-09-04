/*
 * Phase 4A Increment 2 — plot-physics readout (UI wiring).
 *
 * App.updateStats() computes engine.computeStats({ physics: true }) and hands
 * it to UI.updateStats, which renders a per-pen lifts/travel/time table plus a
 * document total and a K-05 sub-resolution warning into #plot-physics-readout.
 * These IDs/classes do not exist on the base branch, so this file is red before
 * the increment.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const nextFrames = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const mkPath = (pts, meta) => {
  const p = pts.map((pt) => ({ x: pt[0], y: pt[1] }));
  if (meta) p.meta = meta;
  return p;
};

describe('plot-physics readout (Output pane UI)', () => {
  let runtime;
  let window;
  let document;
  let app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    await nextFrames();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const seedTwoPenDoc = () => {
    const engine = app.engine;
    engine.layers = [];
    const idA = engine.addShapeLayer('A', [[{ x: 0, y: 0 }, { x: 1, y: 0 }]]);
    const a = engine.getLayerById(idA);
    a.visible = true;
    a.penId = 'pen-1';
    a.paths = [mkPath([[0, 0], [10, 0]]), mkPath([[20, 0], [30, 0]])];
    a.effectivePaths = [];
    a.optimizedPaths = a.paths;

    const idB = engine.addShapeLayer('B', [[{ x: 0, y: 0 }, { x: 1, y: 0 }]]);
    const b = engine.getLayerById(idB);
    b.visible = true;
    b.penId = 'pen-2';
    b.paths = [mkPath([[0, 50], [40, 50]])];
    b.effectivePaths = [];
    b.optimizedPaths = b.paths;
  };

  test('renders a per-pen row for each pen plus a document total', () => {
    seedTwoPenDoc();
    app.updateStats();
    const root = document.getElementById('plot-physics-readout');
    expect(root).toBeTruthy();
    const rows = root.querySelectorAll('.plot-physics-rows:not(.plot-physics-total) .plot-physics-row');
    expect(rows.length).toBe(2); // pen-1 + pen-2
    const total = root.querySelector('.plot-physics-total .plot-physics-row');
    expect(total).toBeTruthy();
    expect(root.textContent).toMatch(/All pens/);
    expect(root.textContent).toMatch(/lifts/);
    expect(root.textContent).toMatch(/travel/);
  });

  test('a short-segment layer trips the min-seg warning', () => {
    const engine = app.engine;
    engine.layers = [];
    window.Vectura.SETTINGS.minSegmentMm = 0.1;
    const id = engine.addShapeLayer('tiny', [[{ x: 0, y: 0 }, { x: 1, y: 0 }]]);
    const layer = engine.getLayerById(id);
    layer.visible = true;
    layer.penId = 'pen-1';
    layer.paths = [
      mkPath([[0, 0], [10, 0]]),      // normal
      mkPath([[0, 5], [0.05, 5]]),    // sub-resolution
    ];
    layer.effectivePaths = [];
    layer.optimizedPaths = layer.paths;

    app.updateStats();
    const root = document.getElementById('plot-physics-readout');
    const warn = root.querySelector('.plot-physics-warn');
    expect(warn).toBeTruthy();
    expect(warn.textContent).toMatch(/1 short segment/);
  });

  test('empty document clears the readout (no stray rows)', () => {
    app.engine.layers = [];
    app.updateStats();
    const root = document.getElementById('plot-physics-readout');
    expect(root.querySelectorAll('.plot-physics-row').length).toBe(0);
  });
});
