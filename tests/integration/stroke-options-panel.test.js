/*
 * STR-2 — Stroke Options panel component (src/ui/panels/stroke-options.js).
 *
 * A reusable component that renders, top-to-bottom: Weight (stepper + field +
 * preset dropdown), Cap (3 toggles), Corner (3 toggles) + Limit (miter-only),
 * Align Stroke (3-way), and a Dashed Line checkbox gating a 6-field dash row.
 * Every control mutates the STR-1 layer fields and re-renders; conditional
 * enablement (Limit⇄Miter, dash fields⇄checkbox) is exercised explicitly.
 *
 * Harness: load the config vocabulary + stroke-model API + the panel into
 * JSDOM (mirrors fill-control-surface.test), mount against a fake layer set,
 * and drive the rendered DOM.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');

const buildHarness = () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const ctx = dom.getInternalVMContext();
  for (const rel of [
    'src/config/stroke-options.js',
    'src/core/stroke-model.js',
    'src/ui/panels/stroke-options.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: path.basename(rel) });
  }
  return dom;
};

const makeLayer = (over = {}) => ({
  id: 'l1',
  penId: 'pen-1',
  color: '#ffffff',
  strokeWidth: 0.3,
  lineCap: 'round',
  lineJoin: 'round',
  miterLimit: 10,
  dash: { enabled: false, pattern: [] },
  strokeAlign: 'center',
  ...over,
});

const mountPanel = (dom, layers, extra = {}) => {
  const host = dom.window.document.getElementById('host');
  const events = { pushes: 0, renders: 0, recompute: 0 };
  const app = {
    pushHistory: () => { events.pushes += 1; },
    render: () => { events.renders += 1; },
    engine: { computeAllDisplayGeometry: () => { events.recompute += 1; } },
  };
  const handle = dom.window.Vectura.UI.StrokeOptionsPanel.render(host, {
    app,
    layers,
    ...extra,
  });
  return { host, app, events, handle };
};

describe('STR-2 Stroke Options panel', () => {
  test('registers a reusable component with render + mount API', () => {
    const dom = buildHarness();
    const P = dom.window.Vectura.UI.StrokeOptionsPanel;
    expect(P).toBeTruthy();
    expect(typeof P.render).toBe('function');
    expect(typeof P.mount).toBe('function');
  });

  test('renders every section in top-to-bottom video order', () => {
    const dom = buildHarness();
    const { host } = mountPanel(dom, [makeLayer()]);
    const sections = Array.from(host.querySelectorAll('[data-stroke-section]'))
      .map((el) => el.getAttribute('data-stroke-section'));
    expect(sections).toEqual(['weight', 'cap', 'corner', 'align', 'dash']);
  });

  test('Weight: field, stepper buttons and preset dropdown bind strokeWidth', () => {
    const dom = buildHarness();
    const layer = makeLayer({ strokeWidth: 0.3 });
    const { host, events } = mountPanel(dom, [layer]);
    const field = host.querySelector('[data-stroke-weight-field]');
    const inc = host.querySelector('[data-stroke-weight-inc]');
    const dec = host.querySelector('[data-stroke-weight-dec]');
    const preset = host.querySelector('[data-stroke-weight-preset]');
    expect(field).toBeTruthy();
    expect(inc).toBeTruthy();
    expect(dec).toBeTruthy();
    expect(preset.tagName).toBe('SELECT');

    field.value = '1.5';
    field.dispatchEvent(new dom.window.Event('change'));
    expect(layer.strokeWidth).toBeCloseTo(1.5, 6);

    const before = layer.strokeWidth;
    inc.click();
    expect(layer.strokeWidth).toBeGreaterThan(before);
    dec.click();
    expect(layer.strokeWidth).toBeCloseTo(before, 6);

    // Preset dropdown writes a preset mm width.
    preset.value = '0.5';
    preset.dispatchEvent(new dom.window.Event('change'));
    expect(layer.strokeWidth).toBeCloseTo(0.5, 6);
    expect(events.renders).toBeGreaterThan(0);
  });

  test('Weight edits go through StrokeModel and never touch penId', () => {
    const dom = buildHarness();
    const layer = makeLayer({ penId: 'pen-7', strokeWidth: 0.3 });
    const { host } = mountPanel(dom, [layer]);
    const field = host.querySelector('[data-stroke-weight-field]');
    field.value = '2';
    field.dispatchEvent(new dom.window.Event('change'));
    expect(layer.strokeWidth).toBeCloseTo(2, 6);
    expect(layer.penId).toBe('pen-7');
  });

  test('Cap: three toggles set lineCap (incl. projecting) with tooltips', () => {
    const dom = buildHarness();
    const layer = makeLayer();
    const { host } = mountPanel(dom, [layer]);
    const caps = Array.from(host.querySelectorAll('[data-stroke-cap]'));
    expect(caps.map((b) => b.getAttribute('data-stroke-cap'))).toEqual(['butt', 'round', 'projecting']);
    expect(caps.every((b) => b.getAttribute('title'))).toBe(true);

    caps.find((b) => b.getAttribute('data-stroke-cap') === 'projecting').click();
    expect(layer.lineCap).toBe('projecting');
    const active = host.querySelector('[data-stroke-cap].is-active');
    expect(active.getAttribute('data-stroke-cap')).toBe('projecting');
  });

  test('Corner: toggles set lineJoin; Limit enabled only while Miter', () => {
    const dom = buildHarness();
    const layer = makeLayer({ lineJoin: 'round' });
    const { host } = mountPanel(dom, [layer]);
    const joins = Array.from(host.querySelectorAll('[data-stroke-join]'));
    expect(joins.map((b) => b.getAttribute('data-stroke-join'))).toEqual(['miter', 'round', 'bevel']);
    const limit = host.querySelector('[data-stroke-limit-field]');
    expect(limit).toBeTruthy();

    // Non-miter join → limit disabled.
    expect(limit.disabled).toBe(true);

    joins.find((b) => b.getAttribute('data-stroke-join') === 'miter').click();
    expect(layer.lineJoin).toBe('miter');
    expect(limit.disabled).toBe(false);

    limit.value = '4';
    limit.dispatchEvent(new dom.window.Event('change'));
    expect(layer.miterLimit).toBe(4);

    joins.find((b) => b.getAttribute('data-stroke-join') === 'bevel').click();
    expect(layer.lineJoin).toBe('bevel');
    expect(limit.disabled).toBe(true);
  });

  test('Align Stroke: 3-way sets strokeAlign and recomputes display geometry', () => {
    const dom = buildHarness();
    const layer = makeLayer();
    const { host, events } = mountPanel(dom, [layer]);
    const aligns = Array.from(host.querySelectorAll('[data-stroke-align]'));
    expect(aligns.map((b) => b.getAttribute('data-stroke-align'))).toEqual(['center', 'inside', 'outside']);

    const recomputeBefore = events.recompute;
    aligns.find((b) => b.getAttribute('data-stroke-align') === 'outside').click();
    expect(layer.strokeAlign).toBe('outside');
    expect(events.recompute).toBeGreaterThan(recomputeBefore);
  });

  test('Dashed Line: checkbox gates 6 fields; enabling pre-fills the first dash', () => {
    const dom = buildHarness();
    const layer = makeLayer();
    const { host } = mountPanel(dom, [layer]);
    const checkbox = host.querySelector('[data-stroke-dash-toggle]');
    const fields = Array.from(host.querySelectorAll('[data-stroke-dash-field]'));
    expect(fields.length).toBe(6);
    // Disabled while unchecked.
    expect(fields.every((f) => f.disabled)).toBe(true);

    checkbox.checked = true;
    checkbox.dispatchEvent(new dom.window.Event('change'));
    expect(layer.dash.enabled).toBe(true);
    expect(fields.every((f) => f.disabled)).toBe(false);
    // First dash pre-filled with a default.
    expect(layer.dash.pattern[0]).toBeGreaterThan(0);
  });

  test('Dash fields commit on Enter/blur in document units and re-render', () => {
    const dom = buildHarness();
    const layer = makeLayer();
    const { host, events } = mountPanel(dom, [layer]);
    host.querySelector('[data-stroke-dash-toggle]').checked = true;
    host.querySelector('[data-stroke-dash-toggle]').dispatchEvent(new dom.window.Event('change'));

    const fields = Array.from(host.querySelectorAll('[data-stroke-dash-field]'));
    const rendersBefore = events.renders;
    fields[0].value = '5';
    fields[0].dispatchEvent(new dom.window.Event('change'));
    fields[1].value = '2';
    fields[1].dispatchEvent(new dom.window.Event('change'));
    expect(layer.dash.pattern[0]).toBeCloseTo(5, 6);
    expect(layer.dash.pattern[1]).toBeCloseTo(2, 6);
    expect(events.renders).toBeGreaterThan(rendersBefore);
  });

  test('focused dash field highlights its label chip', () => {
    const dom = buildHarness();
    const layer = makeLayer();
    const { host } = mountPanel(dom, [layer]);
    host.querySelector('[data-stroke-dash-toggle]').checked = true;
    host.querySelector('[data-stroke-dash-toggle]').dispatchEvent(new dom.window.Event('change'));
    const field = host.querySelector('[data-stroke-dash-field]');
    field.dispatchEvent(new dom.window.Event('focus'));
    const chip = host.querySelector('[data-stroke-dash-label].is-focused');
    expect(chip).toBeTruthy();
    field.dispatchEvent(new dom.window.Event('blur'));
    expect(host.querySelector('[data-stroke-dash-label].is-focused')).toBeNull();
  });

  test('unchecking Dashed Line grays all six fields and reverts to solid', () => {
    const dom = buildHarness();
    const layer = makeLayer({ dash: { enabled: true, pattern: [4, 2] } });
    const { host } = mountPanel(dom, [layer]);
    const checkbox = host.querySelector('[data-stroke-dash-toggle]');
    expect(checkbox.checked).toBe(true);
    checkbox.checked = false;
    checkbox.dispatchEvent(new dom.window.Event('change'));
    expect(layer.dash.enabled).toBe(false);
    const S = dom.window.Vectura.STROKE_STYLE;
    expect(S.getLayerDashPattern(layer)).toBeNull(); // renders solid
    const fields = Array.from(host.querySelectorAll('[data-stroke-dash-field]'));
    expect(fields.every((f) => f.disabled)).toBe(true);
  });

  test('multi-select: a control writes to every targeted layer', () => {
    const dom = buildHarness();
    const a = makeLayer({ id: 'a' });
    const b = makeLayer({ id: 'b' });
    const { host } = mountPanel(dom, [a, b]);
    host.querySelector('[data-stroke-cap="projecting"]').click();
    expect(a.lineCap).toBe('projecting');
    expect(b.lineCap).toBe('projecting');
  });

  test('render(host,{app,layerIds}) resolves layers via the engine', () => {
    const dom = buildHarness();
    const layer = makeLayer({ id: 'z' });
    const app = {
      pushHistory() {}, render() {},
      engine: {
        computeAllDisplayGeometry() {},
        getLayerById: (id) => (id === 'z' ? layer : null),
      },
    };
    const host = dom.window.document.getElementById('host');
    dom.window.Vectura.UI.StrokeOptionsPanel.render(host, { app, layerIds: ['z'] });
    host.querySelector('[data-stroke-cap="butt"]').click();
    expect(layer.lineCap).toBe('butt');
  });
});
