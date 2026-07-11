/**
 * Paint bucket panel — Sensitivity slider migration to the shared UI.Slider
 * component (ui-consistency sweep).
 *
 * The static index.html slider + hand-rolled chip/fill plumbing was replaced
 * at init by Vectura.UI.Slider; these tests pin the swap:
 *   - component markup with the static ids re-applied (external automation,
 *     <label for>, and the skin's #paint-bucket-sensitivity selectors survive)
 *   - 'input' semantics preserved: every drag frame writes fillParams and
 *     persists to SETTINGS.paintBucket (the bucket has no per-drag history)
 *   - editable chip clamps to 0.1–20, dblclick resets to the DEFAULTS value
 *   - loadParamsFromFill() silently syncs the slider via the component API
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Paint bucket panel: sensitivity slider (shared UI.Slider migration)', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = window.app = new window.Vectura.App();
    // main.js is excluded in FULL_STACK; init the panel manually (mirrors
    // multi-selection-panel.test.js).
    window.Vectura.UI.PaintBucketPanel.init(app);
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('sensitivity renders through UI.Slider with the static ids preserved (no duplicates)', () => {
    const slider = document.getElementById('paint-bucket-sensitivity');
    expect(slider).toBeTruthy();
    // UI.Slider markup: .slider-row > .sld-fx-wrap > input.ctrl-slider + chip.
    const sliderRow = slider.closest('.slider-row');
    expect(sliderRow).toBeTruthy();
    const wrap = slider.closest('.sld-fx-wrap');
    expect(wrap.classList.contains('paint-bucket-slider-wrap')).toBe(true);
    // Gradient fill var initialised at construction (hidden-panel safe).
    expect(wrap.style.getPropertyValue('--fill')).not.toBe('');
    const chip = document.getElementById('paint-bucket-sensitivity-chip');
    expect(chip).toBeTruthy();
    expect(chip.classList.contains('slider-val')).toBe(true);
    expect(chip.closest('.slider-row')).toBe(sliderRow);
    // The static markup was replaced, not duplicated.
    const row = slider.closest('.paint-bucket-row');
    expect(row.querySelectorAll('input[type="range"]').length).toBe(1);
    expect(row.querySelectorAll('.slider-val').length).toBe(1);
    expect(row.querySelectorAll('.sld-fx-wrap').length).toBe(1);
  });

  test("every 'input' frame writes fillParams.fillSensitivity and persists to SETTINGS", () => {
    const slider = document.getElementById('paint-bucket-sensitivity');
    const chip = document.getElementById('paint-bucket-sensitivity-chip');
    slider.value = '7.5';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(app.paintBucketPanel.getFillParams().fillSensitivity).toBe(7.5);
    expect(window.Vectura.SETTINGS.paintBucket.fillSensitivity).toBe(7.5);
    expect(chip.value).toBe('7.5');
    expect(slider.closest('.sld-fx-wrap').style.getPropertyValue('--fill')).not.toBe('');
  });

  test('chip edit clamps to the 0.1–20 range and persists the committed value', () => {
    const slider = document.getElementById('paint-bucket-sensitivity');
    const chip = document.getElementById('paint-bucket-sensitivity-chip');
    chip.value = '999';
    chip.dispatchEvent(new window.Event('blur', { bubbles: true }));
    expect(slider.value).toBe('20');
    expect(app.paintBucketPanel.getFillParams().fillSensitivity).toBe(20);
    expect(window.Vectura.SETTINGS.paintBucket.fillSensitivity).toBe(20);
  });

  test('double-click resets sensitivity to its default (5) and persists', () => {
    const slider = document.getElementById('paint-bucket-sensitivity');
    slider.value = '18';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    slider.dispatchEvent(new window.Event('dblclick', { bubbles: true, cancelable: true }));
    expect(slider.value).toBe('5');
    expect(app.paintBucketPanel.getFillParams().fillSensitivity).toBe(5);
    expect(window.Vectura.SETTINGS.paintBucket.fillSensitivity).toBe(5);
  });

  test('loadParamsFromFill() syncs the slider silently through the component API', () => {
    app.paintBucketPanel.loadParamsFromFill({
      fillType: 'hatch',
      density: 4,
      angle: 0,
      amplitude: 1,
      padding: 0,
      shiftX: 0,
      shiftY: 0,
      sensitivity: 12,
      penId: null,
    });
    const slider = document.getElementById('paint-bucket-sensitivity');
    const chip = document.getElementById('paint-bucket-sensitivity-chip');
    expect(slider.value).toBe('12');
    expect(chip.value).toBe('12');
    expect(app.paintBucketPanel.getFillParams().fillSensitivity).toBe(12);
  });
});
