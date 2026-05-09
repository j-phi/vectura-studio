/*
 * Integration test for the Export SVG modal (Phase 3 step 5 — final modal).
 *
 * Boots the full Vectura runtime, then verifies:
 *   - app.ui.openExportModal renders the export-modal scaffold
 *     (preview canvas wrap, mode select, settings scroll, footer Cancel +
 *     Submit) and flips renderer.exportModalOpen to true
 *   - changing the optimization preview mode (e.g. overlay → off) updates
 *     exportModalState.previewMode and triggers a re-render
 *   - the Submit button triggers exportSVG (which builds and "downloads" an
 *     SVG blob — the test stubs URL.createObjectURL + anchor.click() so no
 *     real download happens)
 *   - clicking Cancel closes the modal without invoking exportSVG and resets
 *     renderer.exportModalOpen
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Export SVG modal', () => {
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

  function closeAnyOpenModal() {
    if (app.ui?.modal?.overlay?.classList?.contains?.('open')) {
      app.ui.closeModal?.();
    }
  }

  test('openExportModal renders the export scaffold', () => {
    closeAnyOpenModal();
    app.ui.openExportModal();
    const card = document.querySelector('.modal-card');
    expect(card).toBeTruthy();
    expect(card.innerHTML).toContain('Export SVG');
    expect(document.getElementById('export-modal-root')).toBeTruthy();
    expect(document.getElementById('export-preview-canvas-wrap')).toBeTruthy();
    expect(document.getElementById('export-preview-canvas')).toBeTruthy();
    expect(document.getElementById('export-preview-mode')).toBeTruthy();
    expect(document.getElementById('export-modal-cancel')).toBeTruthy();
    expect(document.getElementById('export-modal-submit')).toBeTruthy();
    // Renderer flag flipped.
    expect(app.renderer.exportModalOpen).toBe(true);
    // Internal state captured.
    expect(app.ui.exportModalState).toBeTruthy();
    expect(app.ui.exportModalState.isOpen).toBe(true);
    closeAnyOpenModal();
    // Renderer flag reset on close.
    expect(app.renderer.exportModalOpen).toBe(false);
    expect(app.ui.exportModalState).toBe(null);
  });

  test('Impact Preview pane renders 4 cells and populates them on open', () => {
    closeAnyOpenModal();
    // Ensure at least one layer with paths so computeStats has something to work with.
    if (!app.engine.layers?.some((l) => l && !l.isGroup)) {
      app.engine.addLayer('wavetable');
    }
    app.ui.openExportModal();
    const pane = document.getElementById('export-impact-preview');
    expect(pane).toBeTruthy();
    const cells = pane.querySelectorAll('.export-impact-cell');
    expect(cells.length).toBe(4);
    const cellNames = Array.from(cells).map((c) => c.dataset.impactCell);
    expect(cellNames).toEqual(['paths', 'vertices', 'size', 'time']);
    // Each cell's value should be populated (not the placeholder em-dash).
    cells.forEach((cell) => {
      const val = cell.querySelector('[data-impact-val]');
      expect(val).toBeTruthy();
      expect(val.innerHTML).not.toBe('—');
    });
    closeAnyOpenModal();
  });

  test('Sidebar nav no longer includes a Stats item', () => {
    closeAnyOpenModal();
    app.ui.openExportModal();
    const nav = document.getElementById('export-modal-nav');
    expect(nav).toBeTruthy();
    expect(nav.querySelector('[data-section-id="stats"]')).toBeNull();
    closeAnyOpenModal();
  });

  test('changing the preview mode updates exportModalState.previewMode and redraws', () => {
    closeAnyOpenModal();
    app.ui.openExportModal();
    const select = document.getElementById('export-preview-mode');
    expect(select).toBeTruthy();
    // Default starts as 'overlay' (per SETTINGS.optimizationPreview).
    expect(['overlay', 'replace']).toContain(app.ui.exportModalState.previewMode);

    let renderCalls = 0;
    const orig = app.ui.renderExportPreview.bind(app.ui);
    app.ui.renderExportPreview = function spyRender(...args) {
      renderCalls += 1;
      return orig(...args);
    };

    select.value = 'off';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(app.ui.exportModalState.previewMode).toBe('off');
    expect(renderCalls).toBeGreaterThanOrEqual(1);

    app.ui.renderExportPreview = orig;
    closeAnyOpenModal();
  });

  test('Cancel closes without triggering exportSVG', () => {
    closeAnyOpenModal();
    let exportCalls = 0;
    const origExport = app.ui.exportSVG.bind(app.ui);
    app.ui.exportSVG = function spy(...args) { exportCalls += 1; return origExport(...args); };

    app.ui.openExportModal();
    const cancel = document.getElementById('export-modal-cancel');
    expect(cancel).toBeTruthy();
    cancel.click();

    expect(app.ui.modal.overlay.classList.contains('open')).toBe(false);
    expect(exportCalls).toBe(0);

    app.ui.exportSVG = origExport;
  });

  test('opens identically when a Mirror modifier (group) is the active layer', () => {
    closeAnyOpenModal();
    if (!app.engine.layers?.some((l) => l && !l.isGroup)) {
      app.engine.addLayer('wavetable');
    }
    const mirrorId = app.engine.addModifierLayer('mirror');
    expect(app.engine.activeLayerId).toBe(mirrorId);

    app.ui.openExportModal();

    const optPanel = document.getElementById('optimization-controls')?.querySelector('.optimization-panel');
    expect(optPanel).toBeTruthy();

    const sections = optPanel.querySelectorAll('section.export-settings-section');
    expect(sections.length).toBeGreaterThan(0);

    const nav = document.getElementById('export-modal-nav');
    expect(nav.querySelectorAll('.export-nav-item').length).toBeGreaterThan(0);

    const cells = document.querySelectorAll('#export-impact-preview .export-impact-cell [data-impact-val]');
    expect(cells.length).toBe(4);
    cells.forEach((val) => expect(val.innerHTML).not.toBe('—'));

    closeAnyOpenModal();
    app.engine.removeLayer(mirrorId);
  });

  test('Submit invokes exportSVG (stub-anchored: builds the SVG blob without a real download)', () => {
    closeAnyOpenModal();

    // Stub URL.createObjectURL and anchor.click() so no actual download fires
    // and the test can assert the SVG built correctly.
    const originalCreate = window.URL.createObjectURL;
    const originalRevoke = window.URL.revokeObjectURL;
    let lastBlob = null;
    let createCalls = 0;
    let clickCalls = 0;
    window.URL.createObjectURL = (blob) => {
      createCalls += 1;
      lastBlob = blob;
      return 'blob:fake-export-url';
    };
    window.URL.revokeObjectURL = () => {};

    // Patch HTMLAnchorElement.prototype.click so the synthetic anchor used by
    // exportSVG doesn't navigate. JSDOM's default click() is a noop on
    // detached anchors but be defensive in case future runtimes change that.
    const origClick = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function spyClick() {
      clickCalls += 1;
    };

    app.ui.openExportModal();
    const submit = document.getElementById('export-modal-submit');
    expect(submit).toBeTruthy();
    submit.click();

    // exportSVG fires URL.createObjectURL with a Blob whose text is SVG markup,
    // then triggers the anchor click. Submit also closes the modal (legacy
    // contract: openExportModal's submit handler calls exportSVG then closeModal).
    expect(createCalls).toBe(1);
    expect(clickCalls).toBe(1);
    expect(lastBlob).toBeTruthy();
    expect(lastBlob.type).toBe('image/svg+xml');
    expect(app.ui.modal.overlay.classList.contains('open')).toBe(false);

    window.URL.createObjectURL = originalCreate;
    window.URL.revokeObjectURL = originalRevoke;
    window.HTMLAnchorElement.prototype.click = origClick;
  });
});
