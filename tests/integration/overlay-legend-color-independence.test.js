/*
 * Regression test for the line-sort / draw-order overlay legend colour controls.
 *
 * The Start Color and End Color must be editable INDEPENDENTLY: changing the
 * start colour must not rewrite the end colour swatch (and vice versa). A prior
 * bug had the start handler call the full `syncOverlayLegendControls()`, which
 * recomputed the end pill as the start colour's complement on every start edit —
 * so picking a new start colour visually changed the end colour too.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Overlay legend start/end colour independence', () => {
  let runtime, window, document, app, SETTINGS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = new window.Vectura.App();
    window.app = app;
    SETTINGS = window.Vectura.SETTINGS;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function openPanel() {
    // The colour dialogue now opens from the Draw-Order panel's palette button
    // (relocated from the retired on-canvas legend gear).
    const gear = document.getElementById('draw-order-color-settings');
    const panel = document.getElementById('optimization-overlay-legend-settings-panel');
    if (panel.classList.contains('hidden')) gear.click();
  }

  test('changing the start colour does not change the end colour swatch', () => {
    // Auto mode: no explicit end override → end is the start colour's complement.
    SETTINGS.optimizationOverlaySecondaryColor = '';
    SETTINGS.optimizationOverlayColor = '#38bdf8';
    openPanel();

    const startInput = document.getElementById('overlay-legend-start-color-input');
    const endBtn = document.getElementById('overlay-legend-end-color');
    const endBefore = { bg: endBtn.style.background, text: endBtn.textContent };

    const setStart = (hex) => {
      startInput.value = hex;
      startInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    };
    setStart('#ff0000');
    setStart('#00ff00');

    // Start updated; end swatch untouched.
    const startBtn = document.getElementById('overlay-legend-start-color');
    expect(startBtn.textContent).toBe('#00FF00');
    expect(endBtn.style.background).toBe(endBefore.bg);
    expect(endBtn.textContent).toBe(endBefore.text);
    // The end SETTINGS value remains in auto mode (no override written).
    expect(SETTINGS.optimizationOverlaySecondaryColor).toBe('');
  });

  test('changing the end colour does not change the start colour swatch', () => {
    SETTINGS.optimizationOverlaySecondaryColor = '';
    SETTINGS.optimizationOverlayColor = '#38bdf8';
    openPanel();

    const endInput = document.getElementById('overlay-legend-end-color-input');
    const startBtn = document.getElementById('overlay-legend-start-color');
    const startBefore = { bg: startBtn.style.background, text: startBtn.textContent };

    const setEnd = (hex) => {
      endInput.value = hex;
      endInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    };
    setEnd('#123456');
    setEnd('#abcdef');

    const endBtn = document.getElementById('overlay-legend-end-color');
    expect(endBtn.textContent).toBe('#ABCDEF');
    expect(SETTINGS.optimizationOverlaySecondaryColor).toBe('#abcdef');
    expect(startBtn.style.background).toBe(startBefore.bg);
    expect(startBtn.textContent).toBe(startBefore.text);
  });
});
