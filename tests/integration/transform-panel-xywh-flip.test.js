/**
 * SEL-5 / SEL-6 / SG-6 (integration, Phase 3 Lane K): the transform panel's
 * injected X/Y/W/H fields, link-W/H proportional toggle, Flip H/V icon buttons,
 * and Direct-Selection anchor readout — driven through the real DOM the module
 * mounts into #algorithm-transform-body.
 *
 * RGR: #transform-bbox-controls and Vectura.UI.TransformPanel.refreshBboxControls
 * do not exist on the base branch — this file fails before Lane K, passes after.
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

describe('Transform panel X/Y/W/H + Flip (Lane K — SEL-5/6, SG-6)', () => {
  let runtime, window, document, app, TP;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    TP = window.Vectura.UI.TransformPanel;
    await nextFrames();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const Layer = () => window.Vectura.Layer;
  let _n = 0;
  const addShape = (rect = [40, 40, 80, 80]) => {
    const [x0, y0, x1, y1] = rect;
    const id = `shp-${++_n}`;
    const l = new (Layer())(id, 'shape', `Shape ${_n}`);
    l.sourcePaths = [[
      { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 },
    ]];
    app.engine.layers.push(l);
    app.engine.generate(l.id);
    return l;
  };
  const select = (ids) => { app.renderer.setSelection(ids, ids[ids.length - 1] || null); TP.refreshBboxControls(); };
  const $ = (sel) => document.querySelector(sel);
  const setAndCommit = (el, v) => { el.value = String(v); el.dispatchEvent(new window.Event('change')); };

  beforeEach(() => {
    app.renderer.setTool('select');
    app.renderer.clearDirectSelection?.();
    TP.setLinked(false);
    app.renderer.setSelection([], null);
    TP.refreshBboxControls();
  });

  test('block is injected into the Transform section', () => {
    expect($('#transform-bbox-controls')).toBeTruthy();
    expect($('#tk-x') && $('#tk-y') && $('#tk-w') && $('#tk-h')).toBeTruthy();
    expect($('#tk-flip-h') && $('#tk-flip-v')).toBeTruthy();
  });

  test('SEL-5: manual shape → X/Y/W/H populated; native Pos/Scale rows hidden', () => {
    const s = addShape([40, 40, 80, 80]);
    select([s.id]);
    expect(parseFloat($('#tk-x').value)).toBeCloseTo(40, 1);
    expect(parseFloat($('#tk-y').value)).toBeCloseTo(40, 1);
    expect(parseFloat($('#tk-w').value)).toBeCloseTo(40, 1);
    expect(parseFloat($('#tk-h').value)).toBeCloseTo(40, 1);
    const posRow = $('#inp-pos-x').closest('.grid');
    expect(posRow.style.display).toBe('none');
    // X/Y/W/H row is visible.
    expect($('[data-tk-row="xy"]').style.display).not.toBe('none');
  });

  test('SEL-5: committing W resizes geometry to that exact width', () => {
    const s = addShape([40, 40, 80, 80]);
    select([s.id]);
    setAndCommit($('#tk-w'), 60);
    expect(app.renderer.getTransformPanelModel().width).toBeCloseTo(60, 2);
    // height unchanged (link off)
    expect(app.renderer.getTransformPanelModel().height).toBeCloseTo(40, 2);
  });

  test('SEL-5: link toggle preserves ratio on a W edit', () => {
    const s = addShape([40, 40, 80, 80]);
    select([s.id]);
    TP.setLinked(true);
    setAndCommit($('#tk-w'), 80);
    const m = app.renderer.getTransformPanelModel();
    expect(m.width).toBeCloseTo(80, 2);
    expect(m.height).toBeCloseTo(80, 2); // ratio preserved (was 40×40)
  });

  test('SEL-6: flip buttons invoke renderer.flipSelection with the axis', () => {
    const s = addShape();
    select([s.id]);
    const calls = [];
    const orig = app.renderer.flipSelection.bind(app.renderer);
    app.renderer.flipSelection = (axis) => { calls.push(axis); return true; };
    $('#tk-flip-h').click();
    $('#tk-flip-v').click();
    app.renderer.flipSelection = orig;
    expect(calls).toEqual(['horizontal', 'vertical']);
  });

  test('SEL-6: flip buttons disabled with no selection, enabled with one', () => {
    select([]);
    expect($('#tk-flip-h').disabled).toBe(true);
    expect($('#tk-flip-v').disabled).toBe(true);
    const s = addShape();
    select([s.id]);
    expect($('#tk-flip-h').disabled).toBe(false);
    expect($('#tk-flip-v').disabled).toBe(false);
  });

  test('algorithm layer → X/Y/W/H hidden, native Pos row shown, flip still enabled', () => {
    const id = app.engine.addLayer('wavetable');
    app.renderer.setSelection([id], id);
    TP.refreshBboxControls();
    expect($('[data-tk-row="xy"]').style.display).toBe('none');
    expect($('[data-tk-row="wh"]').style.display).toBe('none');
    expect($('#inp-pos-x').closest('.grid').style.display).not.toBe('none');
    expect($('#tk-flip-h').disabled).toBe(false);
  });

  test('dirty-check: an idle refresh (unchanged selection) does not rewrite the DOM, but a selection/mode change does', () => {
    const s = addShape([40, 40, 80, 80]);
    select([s.id]);
    expect(parseFloat($('#tk-w').value)).toBeCloseTo(40, 1);
    // Simulate a stale value with NO underlying model change: an idle ticker
    // frame must early-return and leave it untouched (no per-frame churn).
    $('#tk-w').value = '999';
    TP.refreshBboxControls();
    expect($('#tk-w').value).toBe('999');
    // A real change (new selection) must still refresh the block.
    const s2 = addShape([0, 0, 20, 20]);
    select([s2.id]);
    expect(parseFloat($('#tk-w').value)).toBeCloseTo(20, 1);
    // And an object↔anchor mode switch must refresh too.
    app.renderer.setTool('direct');
    const sel = app.renderer.setDirectSelection(s2, 0);
    sel.selectedIndices = new Set([2]); // (20,20)
    TP.refreshBboxControls();
    expect($('[data-tk-label="x"]').textContent).toMatch(/Anchor X/);
    expect(parseFloat($('#tk-x').value)).toBeCloseTo(20, 1);
  });

  test('SG-6: anchor mode repurposes X/Y, disables W/H + rotation', () => {
    const s = addShape([40, 40, 80, 80]);
    app.renderer.setSelection([s.id], s.id);
    app.renderer.setTool('direct');
    const sel = app.renderer.setDirectSelection(s, 0);
    sel.selectedIndices = new Set([1]); // (80,40)
    TP.refreshBboxControls();
    expect(parseFloat($('#tk-x').value)).toBeCloseTo(80, 1);
    expect(parseFloat($('#tk-y').value)).toBeCloseTo(40, 1);
    expect($('#tk-w').disabled).toBe(true);
    expect($('#tk-h').disabled).toBe(true);
    expect($('#inp-rotation').disabled).toBe(true);
    expect($('[data-tk-label="x"]').textContent).toMatch(/Anchor X/);
    // Editing anchor X moves the anchor.
    setAndCommit($('#tk-x'), 100);
    expect(app.renderer.getSelectedAnchorState().x).toBeCloseTo(100, 1);
  });
});
