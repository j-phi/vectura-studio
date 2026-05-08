/*
 * Integration test for the Document Setup panel (Phase 3 step 3 extraction).
 *
 * Boots the full Vectura runtime, then verifies:
 *   - the panel is dynamically mounted into <main> (markup no longer in
 *     index.html — see commit removing index.html:540-745)
 *   - all the load-bearing input ids are present so existing JS keeps wiring
 *     (machine-profile, set-margin, set-document-units, paper inputs, etc.)
 *   - File > Document Setup (#btn-settings) toggles the .open class via
 *     toggleSettingsPanel()
 *   - the close (✕) button removes .open
 *   - the existing input handlers (still living in legacy bindGlobal) keep
 *     responding — sanity-check the margin input mutates SETTINGS.margin
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Document Setup panel', () => {
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

  test('panel is dynamically mounted into <main> and exposes all expected control IDs', () => {
    const panel = document.getElementById('settings-panel');
    expect(panel).toBeTruthy();
    expect(panel.parentElement?.tagName).toBe('MAIN');

    // A representative subset of the ~30 inputs the panel hosts. Every preserved
    // id must remain present so existing JS keeps wiring without modification.
    for (const id of [
      'btn-close-settings',
      'machine-profile',
      'set-document-units',
      'set-paper-width',
      'set-paper-height',
      'set-orientation',
      'set-margin',
      'set-truncate',
      'set-crop-exports',
      'set-outside-opacity',
      'set-margin-line',
      'set-margin-line-color-pill',
      'set-margin-line-color',
      'set-margin-line-weight',
      'set-margin-line-weight-slider',
      'set-margin-line-dotting',
      'set-show-guides',
      'set-snap-guides',
      'set-show-document-dimensions',
      'set-cookie-preferences',
      'btn-clear-preferences',
      'set-show-tour',
      'bg-color-pill',
      'inp-bg-color',
      'set-selection-outline',
      'set-selection-outline-color-pill',
      'set-selection-outline-color',
      'set-selection-outline-width',
      'set-selection-outline-width-slider',
      'set-speed-down',
      'set-speed-up',
      'layer-bar-palette-trigger',
      'layer-bar-palette-menu',
      'set-undo',
    ]) {
      expect(document.getElementById(id), `missing #${id}`).toBeTruthy();
    }
  });

  test('clicking File > Document Setup toggles .open; close button removes it', () => {
    const panel = document.getElementById('settings-panel');
    const openBtn = document.getElementById('btn-settings');
    const closeBtn = document.getElementById('btn-close-settings');
    expect(openBtn).toBeTruthy();
    expect(closeBtn).toBeTruthy();

    panel.classList.remove('open');
    openBtn.click();
    expect(panel.classList.contains('open')).toBe(true);

    closeBtn.click();
    expect(panel.classList.contains('open')).toBe(false);
  });

  test('margin input still wires through to SETTINGS.margin (input handler preserved)', () => {
    const SETTINGS = window.Vectura.SETTINGS;
    const setMargin = document.getElementById('set-margin');
    expect(setMargin).toBeTruthy();

    setMargin.value = '12';
    setMargin.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(SETTINGS.margin).toBeCloseTo(12, 5);
  });
});
