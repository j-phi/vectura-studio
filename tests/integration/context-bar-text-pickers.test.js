/**
 * TB-7 → Lane J pickers (Phase-3 integrator wiring).
 *
 * Lane J exposed `Vectura.UI.TextPanel.openFontPicker()` and `openSizePresets()`
 * — the real inline family/size pickers in the docked Text panel. The integrator
 * wired the Task Bar's text controls to drive them: the family/style chips call
 * `openFontPicker()` and the size field's caret affordance calls
 * `openSizePresets()`, in ADDITION to the existing wayfinding (active layer +
 * panel pulse). Both are feature-detected — no-op if the Text panel is absent.
 *
 * RGR: without the wiring the chips only pulse the panel; these spy assertions
 * (openFontPicker / openSizePresets called on click) fail. With it they pass.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const nextFrames = (ms = 90) => new Promise((r) => setTimeout(r, ms));

describe('Task Bar text controls drive the real Text panel pickers (TB-7)', () => {
  let runtime, window, document, app, CB, SETTINGS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = window.app = new window.Vectura.App();
    SETTINGS = window.Vectura.SETTINGS;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const host = () => CB.getContentHost();
  const makeText = () => {
    const id = app.engine.addLayer('text');
    const layer = app.engine.layers.find((l) => l.id === id);
    layer.params = { ...(layer.params || {}), fontFamily: 'Inter', fontStyle: 'Regular', fontSize: 24 };
    return layer;
  };
  const selectText = async () => {
    SETTINGS.contextBarEnabled = true;
    app.renderer.setTool('select');
    const layer = makeText();
    app.renderer.setSelection([layer.id], layer.id);
    await nextFrames();
    return layer;
  };

  test('family chip calls TextPanel.openFontPicker (and still wayfinds)', async () => {
    const layer = await selectText();
    const TP = window.Vectura.UI.TextPanel;
    const origFont = TP.openFontPicker;
    let fontCalls = 0;
    TP.openFontPicker = () => { fontCalls += 1; };
    try {
      app.engine.activeLayerId = null;
      const family = host().querySelector('.ctxbar-text-family');
      expect(family).toBeTruthy();
      family.click();
      expect(fontCalls).toBe(1);
      // Wayfinding still fires (additive, not replaced).
      expect(app.engine.activeLayerId).toBe(layer.id);
    } finally {
      TP.openFontPicker = origFont;
    }
  });

  test('size caret calls TextPanel.openSizePresets', async () => {
    await selectText();
    const TP = window.Vectura.UI.TextPanel;
    const origSize = TP.openSizePresets;
    let sizeCalls = 0;
    TP.openSizePresets = () => { sizeCalls += 1; };
    try {
      const caret = host().querySelector('.ctxbar-text-size-caret');
      expect(caret).toBeTruthy();
      caret.click();
      expect(sizeCalls).toBe(1);
    } finally {
      TP.openSizePresets = origSize;
    }
  });
});
