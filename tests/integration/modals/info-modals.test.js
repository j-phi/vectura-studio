/*
 * Integration test for info-modals (Phase 3 step 3 — second modal).
 *
 * Boots the full Vectura runtime, then verifies:
 *   - showDuplicateNameError opens a modal titled "Name Unavailable" with
 *     the offending name HTML-escaped in the body
 *   - showValueError opens a modal titled "Invalid Value"
 *   - clicking a `.info-btn[data-info]` element invokes showInfo via the
 *     document-level click listener installed by bindInfoButtons (this is
 *     the load-bearing hook for every "i" button across the UI)
 *   - attachInfoButton appends a `.info-btn` child with the right data-info
 *     attribute and is idempotent
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('info-modals (info-button micro-system)', () => {
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
    if (app.ui?.modal?.overlay) {
      app.ui.closeModal?.();
    }
  }

  test('showDuplicateNameError opens a "Name Unavailable" modal with the offending name escaped', () => {
    closeAnyOpenModal();
    app.ui.showDuplicateNameError('My <Layer>');
    expect(app.ui.modal).toBeTruthy();
    const card = document.querySelector('.modal-card, [class*="modal-card"]');
    expect(card).toBeTruthy();
    const cardText = card.innerHTML;
    expect(cardText).toContain('Name Unavailable');
    // < and > escaped, name preserved
    expect(cardText).toContain('&lt;Layer&gt;');
    expect(cardText).toContain('already in use');
    closeAnyOpenModal();
  });

  test('showValueError opens an "Invalid Value" modal', () => {
    closeAnyOpenModal();
    app.ui.showValueError('999');
    const card = document.querySelector('.modal-card, [class*="modal-card"]');
    expect(card).toBeTruthy();
    expect(card.innerHTML).toContain('Invalid Value');
    expect(card.innerHTML).toContain('outside the allowed range');
    closeAnyOpenModal();
  });

  test('attachInfoButton appends a single .info-btn with the expected data-info', () => {
    const label = document.createElement('label');
    label.textContent = 'Margin';
    app.ui.attachInfoButton(label, 'global.margin');

    const btn = label.querySelector('.info-btn');
    expect(btn).toBeTruthy();
    expect(btn.dataset.info).toBe('global.margin');
    expect(btn.getAttribute('aria-label')).toContain('Margin');

    // Idempotent: attaching twice does NOT add a second button.
    app.ui.attachInfoButton(label, 'global.margin');
    expect(label.querySelectorAll('.info-btn').length).toBe(1);
  });

  test('clicking a .info-btn dispatches through bindInfoButtons → showInfo', () => {
    closeAnyOpenModal();
    // Synthesize an info-btn so we don't depend on incidental DOM state.
    // Pick a stable INFO key that has a well-known title.
    const host = document.createElement('label');
    host.textContent = 'Margin';
    document.body.appendChild(host);
    app.ui.attachInfoButton(host, 'global.margin');
    const btn = host.querySelector('.info-btn');
    expect(btn).toBeTruthy();

    btn.click();
    const card = document.querySelector('.modal-card, [class*="modal-card"]');
    expect(card).toBeTruthy();
    // 'global.margin' uses the title 'Margin' (per INFO dictionary)
    expect(card.innerHTML).toMatch(/Margin/);
    closeAnyOpenModal();
    host.remove();
  });
});
