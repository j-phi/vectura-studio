/*
 * P3 feedback — text contextual task bar:
 *  - family/style controls have a dropdown caret and open their picker anchored
 *    to the CLICKED chip (an anchor rect is forwarded to the Text panel picker)
 *    instead of the docked left-pane trigger.
 *  - a Point Type ↔ Area Type toggle exists and flips layer.params.textMode.
 *  - the ⋯ "Show Properties panel" item, for a text layer, activates the layer,
 *    hides the ABOUT info block, and pulses the left pane.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };
const nextFrames = (ms = 90) => new Promise((r) => setTimeout(r, ms));

describe('P3: text task bar (carets, anchored pickers, point/area, show properties)', () => {
  let runtime, window, document, app, CB, SETTINGS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = window.app = new window.Vectura.App();
    SETTINGS = window.Vectura.SETTINGS;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => CB.getContentHost();
  const selectText = async () => {
    const id = app.engine.addLayer('text');
    const layer = app.engine.layers.find((l) => l.id === id);
    app.renderer.setTool('select');
    app.renderer.setSelection([layer.id], layer.id);
    await nextFrames();
    return layer;
  };

  test('family/style controls render a dropdown caret', async () => {
    await selectText();
    const family = host().querySelector('.ctxbar-text-family');
    const style = host().querySelector('.ctxbar-text-style');
    expect(family.querySelector('.ctxbar-text-caret')).toBeTruthy();
    expect(style.querySelector('.ctxbar-text-caret')).toBeTruthy();
  });

  test('clicking the family chip forwards an anchor rect to the Text panel picker', async () => {
    await selectText();
    const TP = window.Vectura.UI.TextPanel;
    const orig = TP.openFontPicker;
    let received; let calls = 0;
    TP.openFontPicker = (rect) => { calls += 1; received = rect; };
    try {
      host().querySelector('.ctxbar-text-family').click();
      expect(calls).toBe(1);
      // A rect object was forwarded (from the chip's getBoundingClientRect).
      expect(received && typeof received === 'object').toBe(true);
    } finally {
      TP.openFontPicker = orig;
    }
  });

  test('Point/Area toggle flips layer.params.textMode', async () => {
    const layer = await selectText();
    expect(layer.params.textMode === 'area' ? 'area' : 'point').toBe('point'); // default point
    // The toggle is the first button; identify it by its point/area tooltip.
    const C = window.Vectura.CONTEXT_BAR.buttons.pointArea;
    const toggle = Array.from(host().querySelectorAll('.ctxbar-btn'))
      .find((b) => b.title === C.tooltipToArea || b.title === C.tooltipToPoint);
    expect(toggle).toBeTruthy();
    expect(toggle.title).toBe(C.tooltipToArea); // point → offers "Convert to Area Type"
    toggle.click();
    await nextFrames();
    expect(layer.params.textMode).toBe('area');
  });

  test('Show Properties panel hides the ABOUT block and activates the text layer', async () => {
    const layer = await selectText();
    SETTINGS.aboutVisible = true;
    const about = document.querySelector('#algo-about');
    // The item only appears while the target panel needs restoring — collapse
    // the left pane (the text context's Show-panel target) first.
    const leftPane = document.getElementById('left-pane');
    leftPane.classList.add('pane-collapsed');
    // Open the overflow menu and click Show Properties panel.
    document.querySelector('.ctxbar-overflow').click();
    await nextFrames();
    Array.from(document.querySelectorAll('.ctxbar-menu-item'))
      .find((n) => n.textContent === 'Show Properties panel').click();
    await nextFrames();
    expect(app.engine.activeLayerId).toBe(layer.id);
    expect(SETTINGS.aboutVisible).toBe(false);
    if (about) expect(about.style.display).toBe('none');
    // The restore un-collapsed the pane it points at.
    expect(leftPane.classList.contains('pane-collapsed')).toBe(false);
  });

  test('Outline button is icon-only (no text label) and the Point/Area toggle sits to its right', async () => {
    await selectText();
    const B = window.Vectura.CONTEXT_BAR.buttons;
    const btns = Array.from(host().querySelectorAll('.ctxbar-btn'));
    const outline = btns.find((b) => b.title === B.outlineText.tooltip);
    const toggle = btns.find((b) => b.title === B.pointArea.tooltipToArea || b.title === B.pointArea.tooltipToPoint);
    expect(outline).toBeTruthy();
    expect(toggle).toBeTruthy();
    // Icon-only: a hollow-T glyph, no visible text label after it.
    expect(outline.querySelector('.ctxbar-label')).toBeFalsy();
    expect(outline.classList.contains('ctxbar-btn--labeled')).toBe(false);
    expect(outline.querySelector('.ctxbar-ico')).toBeTruthy();
    // Point/Area toggle comes AFTER (to the right of) the Outline button.
    expect(btns.indexOf(toggle)).toBeGreaterThan(btns.indexOf(outline));
  });

  test('weight chip opens an inline weight menu and commits fontWeight (not the font picker)', async () => {
    const layer = await selectText();
    const TP = window.Vectura.UI.TextPanel;
    const origFont = TP.openFontPicker;
    let fontPickerCalls = 0;
    TP.openFontPicker = () => { fontPickerCalls += 1; };
    try {
      const weightChip = host().querySelector('.ctxbar-text-style');
      weightChip.click();
      await nextFrames();
      // A self-contained weight flyout opened — NOT the font picker.
      const fly = host().querySelector('.ctxbar-weight-flyout.is-open');
      expect(fly).toBeTruthy();
      expect(fontPickerCalls).toBe(0);
      // Selecting a weight commits it to the layer param.
      const bold = Array.from(fly.querySelectorAll('.ctxbar-menu-item')).find((b) => b.textContent === 'Bold');
      expect(bold).toBeTruthy();
      bold.click();
      await nextFrames();
      expect(layer.params.fontWeight).toBe('Bold');
    } finally {
      TP.openFontPicker = origFont;
    }
  });

  test('family chip shows the resolved face NAME, not the raw font key/category id', async () => {
    const layer = await selectText();
    layer.params.font = 'google:open-sans';
    // Re-select so the bar rebuilds against the updated params.
    app.renderer.setSelection([], null);
    await nextFrames();
    app.renderer.setSelection([layer.id], layer.id);
    await nextFrames();
    const label = host().querySelector('.ctxbar-text-family .ctxbar-text-fieldlabel');
    expect(label).toBeTruthy();
    expect(label.textContent).toBe('Open Sans');
  });
});
