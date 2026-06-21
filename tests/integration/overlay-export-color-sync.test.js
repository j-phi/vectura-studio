/*
 * Integration tests for line-sort overlay colour parity between the main-canvas
 * legend and the Export SVG modal, plus the Draw-Order gear deep-linking into
 * the Export modal's Line-Sort tab.
 *
 *   1. The Export modal seeds its start/end colours from the shared SETTINGS
 *      (optimizationOverlayColor / optimizationOverlaySecondaryColor) that the
 *      main-canvas legend also reads — so the two locations agree on open.
 *   2. Editing the start/end colour in the Export modal writes back to those
 *      same SETTINGS, so the change propagates to the main-canvas legend ("and
 *      back").
 *   3. openExportModal({ section: 'linesort' }) — and the Draw-Order panel gear
 *      (#draw-order-settings) which uses it — opens the modal with the Line
 *      Sort tab active by default.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Overlay ↔ Export colour sync + Draw-Order gear deep-link', () => {
  let runtime, window, document, app, SETTINGS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = new window.Vectura.App();
    window.app = app;
    SETTINGS = window.Vectura.SETTINGS;
    if (!app.engine.layers?.some((l) => l && !l.isGroup)) app.engine.addLayer('wavetable');
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function closeAnyOpenModal() {
    if (app.ui?.modal?.overlay?.classList?.contains?.('open')) app.ui.closeModal?.();
  }

  test('Export modal seeds start/end colours from the shared SETTINGS', () => {
    closeAnyOpenModal();
    SETTINGS.optimizationOverlayColor = '#112233';
    SETTINGS.optimizationOverlaySecondaryColor = '#445566';
    app.ui.openExportModal();
    expect(app.ui.exportModalState.overlayColor).toBe('#112233');
    expect(app.ui.exportModalState.lineSortSecondaryColor).toBe('#445566');
    closeAnyOpenModal();
  });

  test('empty end-colour SETTINGS seeds null (auto-complement), not a stale value', () => {
    closeAnyOpenModal();
    SETTINGS.optimizationOverlaySecondaryColor = '';
    app.ui.openExportModal();
    expect(app.ui.exportModalState.lineSortSecondaryColor).toBe(null);
    closeAnyOpenModal();
  });

  test('editing the Export start/end colours writes back to the shared SETTINGS', () => {
    closeAnyOpenModal();
    SETTINGS.optimizationOverlayColor = '#38bdf8';
    SETTINGS.optimizationOverlaySecondaryColor = '';
    app.ui.openExportModal();

    const startInput = document.getElementById('export-legend-start-color-input');
    const endInput = document.getElementById('export-legend-end-color-input');
    expect(startInput).toBeTruthy();
    expect(endInput).toBeTruthy();

    startInput.value = '#ff0000';
    startInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(SETTINGS.optimizationOverlayColor).toBe('#ff0000');

    endInput.value = '#00ff00';
    endInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(SETTINGS.optimizationOverlaySecondaryColor).toBe('#00ff00');

    // Independence preserved: editing the end did not disturb the start.
    expect(SETTINGS.optimizationOverlayColor).toBe('#ff0000');
    closeAnyOpenModal();
  });

  test('openExportModal({ section: "linesort" }) activates the Line Sort tab', () => {
    closeAnyOpenModal();
    app.ui.openExportModal({ section: 'linesort' });
    const navBtn = document.querySelector('.export-nav-item[data-section-id="linesort"]');
    expect(navBtn).toBeTruthy();
    expect(navBtn.classList.contains('is-active')).toBe(true);
    // The default Output tab must NOT be the active one.
    const outputBtn = document.querySelector('.export-nav-item[data-section-id="output"]');
    expect(outputBtn?.classList.contains('is-active')).toBe(false);
    closeAnyOpenModal();
  });

  test('Draw-Order panel gear opens the Export modal on the Line Sort tab', () => {
    closeAnyOpenModal();
    const gear = document.getElementById('draw-order-settings');
    expect(gear).toBeTruthy();
    gear.click();
    expect(app.ui.modal.overlay.classList.contains('open')).toBe(true);
    expect(app.ui.exportModalState?.isOpen).toBe(true);
    const navBtn = document.querySelector('.export-nav-item[data-section-id="linesort"]');
    expect(navBtn?.classList.contains('is-active')).toBe(true);
    closeAnyOpenModal();
  });
});
