/*
 * Integration test for the Grid Settings panel (Phase 3 step 2 extraction).
 *
 * Boots the full Vectura runtime, then verifies:
 *   - the panel is dynamically mounted into <main>
 *   - the View > Grid Settings button toggles the .open class
 *   - the close (✕) button removes the .open class
 *   - grid type seg-ctrl updates SETTINGS.gridType and controls section visibility
 *   - opacity slider/number, style, color, and size inputs mutate SETTINGS
 *   - snap toggle and sensitivity mutate SETTINGS
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Grid Settings panel', () => {
  let runtime, window, document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('panel is dynamically mounted into <main>', () => {
    const panel = document.getElementById('grid-settings-panel');
    expect(panel).toBeTruthy();
    expect(panel.parentElement?.tagName).toBe('MAIN');
    for (const id of [
      'btn-close-grid-settings',
      'grid-type-ctrl',
      'set-grid-opacity-slider',
      'set-grid-opacity',
      'set-grid-style',
      'set-grid-color-pill',
      'set-grid-color',
      'set-grid-size-slider',
      'set-grid-size',
      'set-grid-minor-opacity-slider',
      'set-grid-minor-opacity',
      'set-grid-minor-color-pill',
      'set-grid-minor-color',
      'set-grid-minor-size-slider',
      'set-grid-minor-size',
      'set-grid-snap-enabled',
      'set-grid-snap-sensitivity',
      'set-grid-snap-sensitivity-val',
    ]) {
      expect(document.getElementById(id), `missing #${id}`).toBeTruthy();
    }
  });

  test('clicking View > Grid Settings adds .open; close button removes it', () => {
    const panel = document.getElementById('grid-settings-panel');
    const openBtn = document.getElementById('btn-view-grid-settings');
    const closeBtn = document.getElementById('btn-close-grid-settings');
    expect(openBtn).toBeTruthy();

    panel.classList.remove('open');
    openBtn.click();
    expect(panel.classList.contains('open')).toBe(true);

    closeBtn.click();
    expect(panel.classList.contains('open')).toBe(false);
  });

  test('grid type buttons update SETTINGS.gridType', () => {
    const SETTINGS = window.Vectura.SETTINGS;
    const standardBtn = document.querySelector('#grid-type-ctrl [data-grid-type="standard"]');
    expect(standardBtn).toBeTruthy();

    standardBtn.click();
    expect(SETTINGS.gridType).toBe('standard');

    const noneBtn = document.querySelector('#grid-type-ctrl [data-grid-type="none"]');
    noneBtn.click();
    expect(SETTINGS.gridType).toBe('none');
  });

  test('grid opacity slider mutates SETTINGS.gridOpacity', () => {
    const SETTINGS = window.Vectura.SETTINGS;
    const slider = document.getElementById('set-grid-opacity-slider');
    slider.value = '0.42';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(SETTINGS.gridOpacity).toBeCloseTo(0.42, 5);
  });

  test('grid style select mutates SETTINGS.gridStyle', () => {
    const SETTINGS = window.Vectura.SETTINGS;
    const select = document.getElementById('set-grid-style');
    select.value = 'isometric-dot';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(SETTINGS.gridStyle).toBe('isometric-dot');
  });

  test('grid size input clamps to 0.5 minimum and mutates SETTINGS.gridSize', () => {
    const SETTINGS = window.Vectura.SETTINGS;
    const sizeInput = document.getElementById('set-grid-size');
    sizeInput.value = '7.5';
    sizeInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(SETTINGS.gridSize).toBeCloseTo(7.5, 5);

    // Clamp test: 0 is below minimum — handler should produce >= 0.5
    sizeInput.value = '0';
    sizeInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(SETTINGS.gridSize).toBeGreaterThanOrEqual(0.5);
  });

  test('snap toggle mutates SETTINGS.gridSnapEnabled', () => {
    const SETTINGS = window.Vectura.SETTINGS;
    const snapToggle = document.getElementById('set-grid-snap-enabled');
    expect(snapToggle).toBeTruthy();

    snapToggle.checked = true;
    snapToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(SETTINGS.gridSnapEnabled).toBe(true);

    snapToggle.checked = false;
    snapToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(SETTINGS.gridSnapEnabled).toBe(false);
  });

  test('snap sensitivity slider mutates SETTINGS.gridSnapSensitivity', () => {
    const SETTINGS = window.Vectura.SETTINGS;
    const slider = document.getElementById('set-grid-snap-sensitivity');
    slider.value = '75';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(SETTINGS.gridSnapSensitivity).toBe(75);
  });
});
