/**
 * SEL-5 / SG-6 (integration, Phase 3 Lane K): the renderer transform read/write
 * model that backs the transform panel's true X/Y/W/H fields, the link-W/H
 * scale, and the Direct-Selection anchor readout.
 *
 * RGR: getTransformPanelModel / applySelectionBox / getSelectedAnchorState /
 * applySelectedAnchorPosition do not exist on the base branch — this whole file
 * fails before Lane K and passes after.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SEL-5/SG-6: renderer transform model', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const a = new Layer('sq-a', 'shape', 'A');
    a.sourcePaths = [[
      { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 },
    ]];
    const b = new Layer('sq-b', 'shape', 'B');
    b.sourcePaths = [[
      { x: 140, y: 40 }, { x: 180, y: 40 }, { x: 180, y: 80 }, { x: 140, y: 80 }, { x: 140, y: 40 },
    ]];
    engine.layers.push(a, b);
    engine.generate(a.id);
    engine.generate(b.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    const historyPushes = [];
    renderer.app = { pushHistory: () => historyPushes.push(true) };
    return { renderer, engine, a, b, historyPushes };
  }

  test('getTransformPanelModel: single manual shape → object mode, world bbox top-left + W/H', async () => {
    const { renderer, a } = await setup();
    renderer.setSelection([a.id], a.id);
    const m = renderer.getTransformPanelModel();
    expect(m.mode).toBe('object');
    expect(m.manual).toBe(true);
    expect(m.x).toBeCloseTo(40, 3);
    expect(m.y).toBeCloseTo(40, 3);
    expect(m.width).toBeCloseTo(40, 3);
    expect(m.height).toBeCloseTo(40, 3);
  });

  test('applySelectionBox: setting W resizes geometry to that exact width, top-left fixed', async () => {
    const { renderer, a } = await setup();
    renderer.setSelection([a.id], a.id);
    const ok = renderer.applySelectionBox({ width: 60 });
    expect(ok).toBe(true);
    const m = renderer.getTransformPanelModel();
    expect(m.width).toBeCloseTo(60, 3);
    expect(m.height).toBeCloseTo(40, 3); // unlinked → height unchanged
    expect(m.x).toBeCloseTo(40, 3);      // left edge stays put
    expect(m.y).toBeCloseTo(40, 3);
  });

  test('applySelectionBox: link ratio (panel passes both) preserves aspect', async () => {
    const { renderer, a } = await setup();
    renderer.setSelection([a.id], a.id);
    // Panel with link ON turns a W edit into a proportional W+H edit.
    renderer.applySelectionBox({ width: 80, height: 80 });
    const m = renderer.getTransformPanelModel();
    expect(m.width).toBeCloseTo(80, 3);
    expect(m.height).toBeCloseTo(80, 3);
  });

  test('applySelectionBox: X/Y translate moves the bbox top-left', async () => {
    const { renderer, a } = await setup();
    renderer.setSelection([a.id], a.id);
    renderer.applySelectionBox({ x: 100, y: 200 });
    const m = renderer.getTransformPanelModel();
    expect(m.x).toBeCloseTo(100, 3);
    expect(m.y).toBeCloseTo(200, 3);
    expect(m.width).toBeCloseTo(40, 3);
    expect(m.height).toBeCloseTo(40, 3);
  });

  test('applySelectionBox commits as exactly ONE undo step', async () => {
    const { renderer, a, historyPushes } = await setup();
    renderer.setSelection([a.id], a.id);
    renderer.applySelectionBox({ x: 10, y: 10, width: 60, height: 60 });
    expect(historyPushes).toHaveLength(1);
  });

  test('multi-selection shows COMBINED bounds and resizes about the shared top-left', async () => {
    const { renderer, a, b } = await setup();
    renderer.setSelection([a.id, b.id], a.id);
    const before = renderer.getTransformPanelModel();
    expect(before.x).toBeCloseTo(40, 3);
    expect(before.width).toBeCloseTo(140, 3); // 40 → 180
    renderer.applySelectionBox({ width: 280 });
    const after = renderer.getTransformPanelModel();
    expect(after.width).toBeCloseTo(280, 3);
    expect(after.x).toBeCloseTo(40, 3);
  });

  test('no selection → mode none; applySelectionBox no-ops (no history push)', async () => {
    const { renderer, historyPushes } = await setup();
    renderer.setSelection([], null);
    expect(renderer.getTransformPanelModel().mode).toBe('none');
    expect(renderer.applySelectionBox({ width: 60 })).toBe(false);
    expect(historyPushes).toHaveLength(0);
  });

  // ── SG-6 anchor mode ────────────────────────────────────────────────────
  test('getSelectedAnchorState: one anchor under Direct tool → world anchor pos', async () => {
    const { renderer, a } = await setup();
    renderer.setSelection([a.id], a.id);
    renderer.setTool('direct');
    const sel = renderer.setDirectSelection(a, 0);
    expect(sel).toBeTruthy();
    sel.selectedIndices = new Set([1]); // anchor at (80,40)
    const st = renderer.getSelectedAnchorState();
    expect(st).toBeTruthy();
    expect(st.index).toBe(1);
    expect(st.x).toBeCloseTo(80, 3);
    expect(st.y).toBeCloseTo(40, 3);
    // The panel model repurposes to anchor mode.
    expect(renderer.getTransformPanelModel().mode).toBe('anchor');
  });

  test('applySelectedAnchorPosition: editing anchor X moves that anchor', async () => {
    const { renderer, a, historyPushes } = await setup();
    renderer.setSelection([a.id], a.id);
    renderer.setTool('direct');
    const sel = renderer.setDirectSelection(a, 0);
    sel.selectedIndices = new Set([1]);
    const ok = renderer.applySelectedAnchorPosition({ x: 100 });
    expect(ok).toBe(true);
    const st = renderer.getSelectedAnchorState();
    expect(st.x).toBeCloseTo(100, 3);
    expect(st.y).toBeCloseTo(40, 3); // y untouched
    expect(historyPushes).toHaveLength(1); // one undo step
  });

  test('≠1 anchor selected → not anchor mode (object mode instead)', async () => {
    const { renderer, a } = await setup();
    renderer.setSelection([a.id], a.id);
    renderer.setTool('direct');
    const sel = renderer.setDirectSelection(a, 0);
    sel.selectedIndices = new Set([0, 1]);
    expect(renderer.getSelectedAnchorState()).toBeNull();
    expect(renderer.getTransformPanelModel().mode).toBe('object');
  });
});
