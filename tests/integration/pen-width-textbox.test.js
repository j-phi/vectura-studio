/*
 * Each pen row must have a stroke-weight slider AND an editable
 * numeric textbox, kept in sync. Before the fix the readout was a read-only
 * <span> (.pen-width-value) — you could not type an exact weight.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };
const waitForUi = () => new Promise((r) => setTimeout(r, 80));
const fire = (window, el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

describe('Per-pen stroke-weight textbox', () => {
  let runtime, window;
  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    await waitForUi();
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('pen row renders an editable numeric width textbox alongside the slider', () => {
    const SETTINGS = window.Vectura.SETTINGS;
    SETTINGS.pens = [{ id: 'pen-t', name: 'Pen T', color: '#000000', width: 0.5 }];
    window.app.ui.renderPens();
    const field = window.document.querySelector('#pen-list .pen-width-value');
    expect(field).toBeTruthy();
    expect(field.tagName).toBe('INPUT');
    expect(field.type).toBe('number');
    expect(parseFloat(field.value)).toBeCloseTo(0.5, 5);
  });

  test('typing a weight commits pen.width, syncs the slider, and pushes one history entry', () => {
    const app = window.app;
    const SETTINGS = window.Vectura.SETTINGS;
    SETTINGS.pens = [{ id: 'pen-t', name: 'Pen T', color: '#000000', width: 0.5 }];
    app.ui.renderPens();
    const field = window.document.querySelector('#pen-list .pen-width-value');
    const slider = window.document.querySelector('#pen-list .pen-width');

    const before = app.history.length;
    field.dispatchEvent(new window.Event('focus', { bubbles: true }));
    field.value = '1.25';
    fire(window, field, 'change');

    expect(SETTINGS.pens[0].width).toBeCloseTo(1.25, 5);
    expect(parseFloat(slider.value)).toBeCloseTo(1.25, 5);
    expect(app.history.length).toBe(before + 1);
  });

  test('dragging the slider updates the textbox display', () => {
    const app = window.app;
    const SETTINGS = window.Vectura.SETTINGS;
    SETTINGS.pens = [{ id: 'pen-t', name: 'Pen T', color: '#000000', width: 0.5 }];
    app.ui.renderPens();
    const field = window.document.querySelector('#pen-list .pen-width-value');
    const slider = window.document.querySelector('#pen-list .pen-width');

    slider.value = '0.90';
    fire(window, slider, 'input');
    expect(parseFloat(field.value)).toBeCloseTo(0.9, 5);
  });

  test('out-of-range typed value is clamped to [0.05, 2]', () => {
    const app = window.app;
    const SETTINGS = window.Vectura.SETTINGS;
    SETTINGS.pens = [{ id: 'pen-t', name: 'Pen T', color: '#000000', width: 0.5 }];
    app.ui.renderPens();
    const field = window.document.querySelector('#pen-list .pen-width-value');
    field.dispatchEvent(new window.Event('focus', { bubbles: true }));
    field.value = '9';
    fire(window, field, 'change');
    expect(SETTINGS.pens[0].width).toBeCloseTo(2, 5);
    // The field display must also snap to the clamped/normalized value (a
    // number input does not auto-clamp its text on blur).
    expect(parseFloat(field.value)).toBeCloseTo(2, 5);
  });

  // Pen models: the row's size select writes the size's laid width (one undo
  // step); a typed width off the laid width marks the size 'custom'.
  test('pen model row: size select sets the laid width; a typed width marks the size custom', () => {
    const app = window.app;
    const SETTINGS = window.Vectura.SETTINGS;
    const pen = { id: 'pen-t', name: 'Pen T', color: '#000000', width: 0.5 };
    window.Vectura.PenModel.applyModel(pen, 'sakura-pigma-micron');
    SETTINGS.pens = [pen];
    app.ui.renderPens();
    const row = window.document.querySelector('#pen-list .pen-item');
    const size = row.querySelector('.pen-size');
    expect(size.hidden).toBe(false);
    expect(size.value).toBe('05');
    expect(row.querySelector('.pen-model-chip').textContent).toBe('Micron');
    const before = app.history.length;
    size.value = '1';
    fire(window, size, 'change');
    expect(SETTINGS.pens[0]).toMatchObject({ size: '1', width: 0.65 });
    expect(app.history.length).toBe(before + 1);
    const field = window.document.querySelector('#pen-list .pen-width-value');
    field.dispatchEvent(new window.Event('focus', { bubbles: true }));
    field.value = '0.9';
    fire(window, field, 'change');
    expect(SETTINGS.pens[0].width).toBeCloseTo(0.9, 5);
    expect(SETTINGS.pens[0].size).toBe('custom');
    expect(window.document.querySelector('#pen-list .pen-size').value).toBe('custom');
    // A plain pen has no size select.
    SETTINGS.pens = [{ id: 'pen-p', name: 'P', color: '#000000', width: 0.3 }];
    app.ui.renderPens();
    expect(window.document.querySelector('#pen-list .pen-size').hidden).toBe(true);
    expect(window.document.querySelector('#pen-list .pen-model-chip').textContent).toBe('Plain');
  });
});
