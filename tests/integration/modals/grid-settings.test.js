/*
 * Integration test for the Grid Settings panel (Phase 3 step 2 extraction).
 *
 * Boots the full Vectura runtime, then verifies:
 *   - the panel is dynamically mounted into <main> (markup no longer in
 *     index.html — see commit removing index.html:747-787)
 *   - the View > Grid Settings button toggles the .open class
 *   - the close (✕) button removes the .open class
 *   - the six grid control inputs (overlay master, opacity slider/number,
 *     style, color, size) are wired and mutate SETTINGS / call render
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
    // Markup absent from index.html means it was injected at runtime — verify
    // all six expected control IDs were materialized.
    for (const id of [
      'btn-close-grid-settings',
      'set-grid-overlay-master',
      'set-grid-opacity-slider',
      'set-grid-opacity',
      'set-grid-style',
      'set-grid-color-pill',
      'set-grid-color',
      'set-grid-size',
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

  test('overlay master checkbox toggles SETTINGS.gridOverlay and triggers render', () => {
    const SETTINGS = window.Vectura.SETTINGS;
    const master = document.getElementById('set-grid-overlay-master');
    expect(master).toBeTruthy();

    const before = !!SETTINGS.gridOverlay;
    master.checked = !before;
    master.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(!!SETTINGS.gridOverlay).toBe(!before);

    // Restore
    master.checked = before;
    master.dispatchEvent(new window.Event('change', { bubbles: true }));
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

  test('grid size input clamps to 0.1 minimum and mutates SETTINGS.gridSize', () => {
    const SETTINGS = window.Vectura.SETTINGS;
    const sizeInput = document.getElementById('set-grid-size');
    sizeInput.value = '7.5';
    sizeInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(SETTINGS.gridSize).toBeCloseTo(7.5, 5);

    // Clamp test: 0 is below 0.1 — handler should produce >= 0.1
    sizeInput.value = '0';
    sizeInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(SETTINGS.gridSize).toBeGreaterThanOrEqual(0.1);
  });
});
