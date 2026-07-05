/*
 * MSC-1 — mixed stroke-weight indicator + shared "mixed" pattern.
 *
 * WHILE a multi-selection holds differing stroke weights, the weight field in
 * both surfaces M reaches (the Stroke Options panel and the Task Bar stroke
 * sub-mode) SHALL show a blank field with the "mixed" placeholder + is-mixed
 * class instead of the primary layer's value. Applying a value unifies the
 * selection and clears the indicator.
 *
 * Harness mirrors context-bar-modes.test.js (vm-loaded IIFEs into JSDOM), plus
 * src/config/mixed-values.js so Vectura.MixedValue is present.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');

const buildHarness = () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const ctx = dom.getInternalVMContext();
  for (const rel of [
    'src/config/mixed-values.js',
    'src/config/stroke-options.js',
    'src/config/shape-props.js',
    'src/core/stroke-model.js',
    'src/ui/panels/stroke-options.js',
    'src/ui/shell/context-bar-modes.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: path.basename(rel) });
  }
  return dom;
};

const fire = (dom, node, type) => node.dispatchEvent(new dom.window.Event(type, { bubbles: true }));

const makeApp = (layers) => ({
  pushHistory() {},
  render() {},
  engine: { getLayerById: (id) => layers.find((l) => l.id === id) || null },
});

describe('MSC-1 — MixedValue helper', () => {
  let dom;
  beforeEach(() => { dom = buildHarness(); });

  test('exposes MIXED_VALUES vocabulary + MixedValue helper', () => {
    const V = dom.window.Vectura;
    expect(V.MIXED_VALUES.placeholder).toBe('mixed');
    expect(typeof V.MixedValue.strokeWeight).toBe('function');
  });

  test('flags differing weights mixed; equal weights not mixed', () => {
    const M = dom.window.Vectura.MixedValue;
    expect(M.strokeWeight([{ strokeWidth: 0.3 }, { strokeWidth: 1.2 }]).mixed).toBe(true);
    const same = M.strokeWeight([{ strokeWidth: 0.5 }, { strokeWidth: 0.5 }]);
    expect(same.mixed).toBe(false);
    expect(same.value).toBe(0.5);
    // Single layer is never "mixed".
    expect(M.strokeWeight([{ strokeWidth: 0.5 }]).mixed).toBe(false);
  });
});

describe('MSC-1 — Stroke Options panel weight field', () => {
  let dom;
  beforeEach(() => { dom = buildHarness(); });

  test('differing weights → blank field with "mixed" placeholder + is-mixed class', () => {
    const doc = dom.window.document;
    const l1 = { id: 'l1', strokeWidth: 0.3 };
    const l2 = { id: 'l2', strokeWidth: 1.2 };
    const host = doc.createElement('div');
    doc.body.appendChild(host);
    dom.window.Vectura.UI.StrokeOptionsPanel.render(host, { app: makeApp([l1, l2]), layers: [l1, l2] });

    const field = host.querySelector('[data-stroke-weight-field]');
    expect(field.value).toBe('');
    expect(field.placeholder).toBe('mixed');
    expect(field.classList.contains('is-mixed')).toBe(true);
    expect(field.title).toBe(dom.window.Vectura.MIXED_VALUES.strokeWeightTitle);
  });

  test('equal weights → shows the shared value, no mixed indicator', () => {
    const doc = dom.window.document;
    const l1 = { id: 'l1', strokeWidth: 0.5 };
    const l2 = { id: 'l2', strokeWidth: 0.5 };
    const host = doc.createElement('div');
    doc.body.appendChild(host);
    dom.window.Vectura.UI.StrokeOptionsPanel.render(host, { app: makeApp([l1, l2]), layers: [l1, l2] });

    const field = host.querySelector('[data-stroke-weight-field]');
    expect(field.classList.contains('is-mixed')).toBe(false);
    expect(field.placeholder).toBe('');
    expect(field.value).not.toBe('');
  });

  test('applying a value unifies the selection and clears the indicator', () => {
    const doc = dom.window.document;
    const l1 = { id: 'l1', strokeWidth: 0.3 };
    const l2 = { id: 'l2', strokeWidth: 1.2 };
    const host = doc.createElement('div');
    doc.body.appendChild(host);
    const handle = dom.window.Vectura.UI.StrokeOptionsPanel.render(host, { app: makeApp([l1, l2]), layers: [l1, l2] });

    const field = host.querySelector('[data-stroke-weight-field]');
    field.value = '0.8';
    fire(dom, field, 'change');

    expect(l1.strokeWidth).toBeCloseTo(0.8, 6);
    expect(l2.strokeWidth).toBeCloseTo(0.8, 6);
    handle.refresh();
    expect(field.classList.contains('is-mixed')).toBe(false);
    expect(field.placeholder).toBe('');
  });
});

describe('MSC-1 — Task Bar stroke sub-mode weight field', () => {
  let dom;
  beforeEach(() => { dom = buildHarness(); });

  const setupBar = (layers, app) => {
    const doc = dom.window.document;
    const contentHost = doc.createElement('div');
    doc.body.appendChild(contentHost);
    dom.window.Vectura.UI.ContextBar = {
      getContentHost: () => contentHost,
      restoreState: () => {},
      getContext: () => ({ kind: 'multi', layerIds: layers.map((l) => l.id), primaryLayer: layers[0], app }),
      anchorRectForBar: () => ({ left: 100, top: 80, right: 240, bottom: 100, width: 140, height: 20, centerX: 170 }),
      setBusy: () => {},
    };
    return contentHost;
  };

  test('differing weights → blank ctxbar field with "mixed" placeholder + is-mixed', () => {
    const l1 = { id: 'l1', strokeWidth: 0.3 };
    const l2 = { id: 'l2', strokeWidth: 1.2 };
    const app = makeApp([l1, l2]);
    const host = setupBar([l1, l2], app);
    dom.window.Vectura.UI.ContextBarModes.enterStrokeWeight({ app, layers: [l1, l2], layerIds: ['l1', 'l2'] });

    const field = host.querySelector('.ctxbar-weight-field');
    expect(field).toBeTruthy();
    expect(field.value).toBe('');
    expect(field.placeholder).toBe('mixed');
    expect(field.classList.contains('is-mixed')).toBe(true);
  });

  test('equal weights → no mixed indicator on the ctxbar field', () => {
    const l1 = { id: 'l1', strokeWidth: 0.5 };
    const l2 = { id: 'l2', strokeWidth: 0.5 };
    const app = makeApp([l1, l2]);
    const host = setupBar([l1, l2], app);
    dom.window.Vectura.UI.ContextBarModes.enterStrokeWeight({ app, layers: [l1, l2], layerIds: ['l1', 'l2'] });

    const field = host.querySelector('.ctxbar-weight-field');
    expect(field.classList.contains('is-mixed')).toBe(false);
    expect(field.placeholder).toBe('');
    expect(field.value).not.toBe('');
  });
});
