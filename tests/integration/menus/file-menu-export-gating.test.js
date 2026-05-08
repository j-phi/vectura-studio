/*
 * Integration test for File menu Export gating.
 *
 * Verifies that #btn-export is disabled when the canvas has no exportable
 * content (no non-group layers) and re-enabled once a layer is added.
 * Also covers the keyboard-shortcut path: triggerTopMenuAction must short-
 * circuit when the button is disabled instead of opening the modal.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('File menu — Export gating', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = new window.Vectura.App();
    window.app = app;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('btn-export is disabled when the canvas has no non-group layers', () => {
    app.engine.layers = [];
    app.ui.refreshTopMenuItemStates();
    const btnExport = document.getElementById('btn-export');
    expect(btnExport).toBeTruthy();
    expect(btnExport.disabled).toBe(true);
    expect(btnExport.getAttribute('aria-disabled')).toBe('true');
  });

  test('btn-export is enabled once a non-group layer is present', () => {
    app.engine.addLayer('wavetable');
    app.ui.refreshTopMenuItemStates();
    const btnExport = document.getElementById('btn-export');
    expect(btnExport.disabled).toBe(false);
    expect(btnExport.hasAttribute('aria-disabled')).toBe(false);
  });

  test('opening the File menu refreshes export-button state from current layers', () => {
    // Drop layers, simulate menu open.
    app.engine.layers = [];
    const fileTrigger = document.querySelector('[data-top-menu-trigger="file"]')
      || document.querySelector('[data-top-menu-trigger]');
    expect(fileTrigger).toBeTruthy();
    app.ui.setTopMenuOpen(fileTrigger, true);
    const btnExport = document.getElementById('btn-export');
    expect(btnExport.disabled).toBe(true);
    app.ui.setTopMenuOpen(null, false);
  });

  test('triggerTopMenuAction short-circuits when btn-export is disabled', () => {
    app.engine.layers = [];
    app.ui.refreshTopMenuItemStates();

    let openCalls = 0;
    const origOpen = app.ui.openExportModal.bind(app.ui);
    app.ui.openExportModal = function spy(...args) {
      openCalls += 1;
      return origOpen(...args);
    };

    const result = app.ui.triggerTopMenuAction('btn-export');
    expect(result).toBe(false);
    expect(openCalls).toBe(0);

    app.ui.openExportModal = origOpen;
  });

  test('triggerTopMenuAction opens export when content is present', () => {
    app.engine.addLayer('wavetable');
    app.ui.refreshTopMenuItemStates();

    let openCalls = 0;
    const origOpen = app.ui.openExportModal.bind(app.ui);
    app.ui.openExportModal = function spy(...args) {
      openCalls += 1;
      return origOpen(...args);
    };

    const result = app.ui.triggerTopMenuAction('btn-export');
    expect(result).toBe(true);
    expect(openCalls).toBe(1);

    if (app.ui.modal?.overlay?.classList?.contains?.('open')) app.ui.closeModal?.();
    app.ui.openExportModal = origOpen;
  });
});
