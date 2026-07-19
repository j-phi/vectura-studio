/**
 * RGR regression coverage for two things fixed together:
 *
 * 1. `_buildPatternFillPanel` (src/ui/ui-fill-panel.js) renders into
 *    `#dynamic-controls`, which lives *inside* `#left-section-algorithm-
 *    configuration` — but the fill-pattern/fill-pattern-erase branch in
 *    buildControls() (src/ui/panels/algo-config-panel.js) unconditionally
 *    hid that very ancestor (copied from the sibling solid-fill branch,
 *    where the paint-bucket panel lives in a separate, sibling section).
 *    The Pattern Fill Settings content was therefore never visible — this
 *    pins the fix (`algoConfSec.style.display = ''`) so it can't regress.
 * 2. `_buildPatternFillPanel` now branches on the active layer's type: a
 *    Pattern-algorithm layer still writes the picked pattern into its own
 *    layer.params (unchanged, feeds the existing tile-topology fill flow);
 *    any other layer type writes into app.ui._patternTileFillSettings
 *    instead, leaving that layer's params untouched.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Pattern Fill Settings panel (buildControls + _buildPatternFillPanel)', () => {
  let runtime;
  let window;
  let document;
  let app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      includeMain: false,
      useIndexHtml: true,
    });
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const algoConfSection = () => document.getElementById('left-section-algorithm-configuration');
  const dynamicControls = () => document.getElementById('dynamic-controls');

  test('the algorithm-configuration ancestor stays visible while Pattern Fill is active on a non-pattern layer', () => {
    app.engine.addLayer('flowfield');
    app.ui.renderLayers();
    app.ui.activeTool = 'fill-pattern';
    app.ui.buildControls();

    expect(algoConfSection().style.display).not.toBe('none');
    const text = dynamicControls().textContent;
    expect(text).toContain('Pattern Fill');
    expect(text).toContain('Pattern Fill Settings');
  });

  test('Erase Pattern Fill on a non-pattern layer shows the picker but not the settings section', () => {
    app.engine.addLayer('flowfield');
    app.ui.renderLayers();
    app.ui.activeTool = 'fill-pattern-erase';
    app.ui.buildControls();

    expect(algoConfSection().style.display).not.toBe('none');
    const text = dynamicControls().textContent;
    expect(text).toContain('Erase Pattern Fill');
    expect(text).not.toContain('Pattern Fill Settings');
  });

  test('selecting a pattern on a non-pattern layer writes _patternTileFillSettings, not layer.params', () => {
    const id = app.engine.addLayer('flowfield');
    const layer = app.engine.layers.find((l) => l.id === id);
    app.ui.renderLayers();
    app.ui.activeTool = 'fill-pattern';
    app.ui.buildControls();

    const before = { ...layer.params };
    const firstPatternBtn = dynamicControls().querySelector('button');
    expect(firstPatternBtn).toBeTruthy();
    firstPatternBtn.onclick();

    expect(layer.params).toEqual(before);
    expect(app.ui._patternTileFillSettings.tilePatternId).toBeTruthy();
  });

  test('selecting a pattern on a real Pattern-algorithm layer still writes layer.params.patternId (unchanged behavior)', () => {
    const id = app.engine.addLayer('pattern');
    const layer = app.engine.layers.find((l) => l.id === id);
    app.ui.renderLayers();
    app.ui.activeTool = 'fill-pattern';
    app.ui.buildControls();

    const firstPatternBtn = dynamicControls().querySelector('button');
    expect(firstPatternBtn).toBeTruthy();
    firstPatternBtn.onclick();

    expect(layer.params.patternId).toBeTruthy();
  });

  test('pattern picker renders each entry as a visual SVG swatch, not a bare text-name button', () => {
    app.engine.addLayer('flowfield');
    app.ui.renderLayers();
    app.ui.activeTool = 'fill-pattern';
    app.ui.buildControls();

    const patternButtons = Array.from(dynamicControls().querySelectorAll('button'))
      .filter((btn) => btn.querySelector('svg'));
    expect(patternButtons.length).toBeGreaterThan(0);
    const firstBtn = patternButtons[0];
    expect(firstBtn.querySelector('svg')).toBeTruthy();
    // The label must still be present (accessible name / hover title), but as
    // a small caption alongside the icon — not as the button's only content.
    expect(firstBtn.title.length).toBeGreaterThan(0);
  });

  test('re-picking a pattern rebuilds the panel in place instead of appending a duplicate copy', () => {
    app.engine.addLayer('flowfield');
    app.ui.renderLayers();
    app.ui.activeTool = 'fill-pattern';
    app.ui.buildControls();

    const countHeaders = () =>
      Array.from(dynamicControls().querySelectorAll('p'))
        .filter((p) => p.textContent.trim() === 'Pattern Fill').length;
    const swatches = () =>
      Array.from(dynamicControls().querySelectorAll('button')).filter((b) => b.querySelector('svg'));

    expect(countHeaders()).toBe(1);
    const before = swatches().length;
    expect(before).toBeGreaterThan(0);

    // Click a swatch — the onclick re-invokes _buildPatternFillPanel directly.
    swatches()[0].onclick();

    // Panel must be rebuilt in place: exactly one header, same swatch count —
    // not two stacked copies (the doubling regression).
    expect(countHeaders()).toBe(1);
    expect(swatches().length).toBe(before);
  });

  test('getPatternTileFillParams reflects the picked pattern and settings-panel edits', () => {
    app.engine.addLayer('flowfield');
    app.ui.renderLayers();
    app.ui.activeTool = 'fill-pattern';
    app.ui.buildControls();

    const scaleInputs = Array.from(dynamicControls().querySelectorAll('input[type="number"]'));
    const scaleInput = scaleInputs[0];
    scaleInput.value = '2.5';
    scaleInput.oninput();

    const params = app.ui.getPatternTileFillParams();
    expect(params.fillType).toBe('patternTile');
    expect(params.tileScale).toBe(2.5);
  });
});
