const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * TUX-038 / nightly B4: value editors on iOS.
 *   - enterkeyhint is an ATTRIBUTE. Assigning the `enterKeyHint` property creates nothing on an engine
 *     without the IDL attribute (WebKit on Linux, jsdom), so the keyboard never shows "done" / "next".
 *   - iOS does not blur a focused input when the finger lands on non-focusable text. An editor that commits
 *     only on blur keeps the typed value uncommitted. A pointerdown outside the editor commits it.
 * jsdom moves no focus on a pointerdown, so a dispatched pointerdown here is exactly the iOS tap on text.
 */
describe('touch value editors: enterkeyhint attribute + commit on an outside tap', () => {
  let runtime, window, document, app;

  const setup = async (params) => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true });
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    const id = app.engine.addLayer('rings');
    Object.assign(app.engine.getLayerById(id).params, params);
    app.engine.activeLayerId = id;
    app.ui.renderLayers();
    app.ui.buildControls();
    return id;
  };
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const labelEl = (text) => [...document.querySelectorAll('#dynamic-controls .control-label')]
    .find((l) => l.textContent.trim() === text);
  const rowOf = (lbl) => lbl.closest('.mb-4');
  const outsideTap = (el) => {
    el.dispatchEvent(new window.Event('pointerdown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new window.Event('pointerup', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  };

  test('the slider chip carries enterkeyhint="done" as an attribute', async () => {
    await setup({ rayCount: 12 });
    const chip = rowOf(labelEl('Center Offset X')).querySelector('input.slider-val');
    expect(chip.getAttribute('enterkeyhint')).toBe('done');
    expect(chip.getAttribute('inputmode')).toBe('text');
  });

  test('a slider chip commits on a pointerdown on non-focusable text (no blur)', async () => {
    const id = await setup({ rayCount: 12, offsetX: 10 });
    const lbl = labelEl('Center Offset X');
    const chip = rowOf(lbl).querySelector('input.slider-val');
    chip.focus();
    expect(document.activeElement).toBe(chip);
    chip.value = '-2';
    // A pointerdown on the chip itself keeps editing.
    chip.dispatchEvent(new window.Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(app.engine.getLayerById(id).params.offsetX).toBe(10);
    outsideTap(lbl);
    expect(app.engine.getLayerById(id).params.offsetX).toBe(-2);
    expect(document.activeElement).not.toBe(chip);
  });

  test('the dual (min/max) editor: enterkeyhint attributes, and an outside pointerdown commits both values', async () => {
    const id = await setup({ rayCount: 12, rayMinLength: 3, rayMaxLength: 7 });
    const lbl = labelEl('Ray Length');
    const chip = rowOf(lbl).querySelector('button.value-chip');
    chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    const inputs = [...document.querySelectorAll('.dual-value-editor input')];
    expect(inputs).toHaveLength(2);
    expect(inputs.map((i) => i.getAttribute('enterkeyhint'))).toEqual(['next', 'done']);
    expect(inputs.map((i) => i.getAttribute('inputmode'))).toEqual(['decimal', 'decimal']);
    inputs[0].value = '2';
    inputs[1].value = '6';
    // A pointerdown inside the editor (moving from min to max) keeps it open.
    inputs[1].dispatchEvent(new window.Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(document.querySelectorAll('.dual-value-editor')).toHaveLength(1);
    outsideTap(lbl);
    expect(document.querySelectorAll('.dual-value-editor')).toHaveLength(0);
    const p = app.engine.getLayerById(id).params;
    expect(p.rayMinLength).toBeCloseTo(2, 5);
    expect(p.rayMaxLength).toBeCloseTo(6, 5);
  });
});
