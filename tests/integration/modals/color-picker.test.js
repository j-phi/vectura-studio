/*
 * Integration test for the Color Picker modal (Phase 3 step 4 — first modal).
 *
 * Boots the full Vectura runtime, then verifies:
 *   - app.ui.openColorModal opens a centered overlay with the picker scaffold
 *     (sv canvas, hue canvas, hex input, cancel + apply buttons)
 *   - the modal title is wired to the supplied `title` argument
 *   - clicking Cancel closes the modal without invoking onApply
 *   - clicking Apply invokes onApply(hex) with the seed hex (no edits made)
 *     then closes the modal — this is the contract `openColorPickerAnchoredTo`
 *     and every Layer Settings color button rely on
 *   - typing 6 hex characters into the hex input updates the picker state and
 *     the subsequent Apply emits the typed hex (lower-cased)
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Color Picker modal', () => {
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

  test('openColorModal renders the picker scaffold with the supplied title', () => {
    closeAnyOpenModal();
    app.ui.openColorModal({ title: 'Margin Color', value: '#aabbcc', onApply: () => {} });
    const card = document.querySelector('.modal-card');
    expect(card).toBeTruthy();
    expect(card.innerHTML).toContain('Margin Color');
    expect(card.querySelector('.color-sv-canvas')).toBeTruthy();
    expect(card.querySelector('.color-hue-canvas')).toBeTruthy();
    expect(card.querySelector('.color-modal-hex')).toBeTruthy();
    expect(card.querySelector('.color-modal-cancel')).toBeTruthy();
    expect(card.querySelector('.color-modal-apply')).toBeTruthy();
    closeAnyOpenModal();
  });

  test('Cancel closes without invoking onApply', () => {
    closeAnyOpenModal();
    let applied = null;
    app.ui.openColorModal({
      title: 'X',
      value: '#112233',
      onApply: (hex) => { applied = hex; },
    });
    const overlay = app.ui.modal.overlay;
    expect(overlay.classList.contains('open')).toBe(true);
    const cancelBtn = document.querySelector('.color-modal-cancel');
    cancelBtn.click();
    expect(overlay.classList.contains('open')).toBe(false);
    expect(applied).toBe(null);
  });

  test('Apply with seed value (no edits) invokes onApply(seed) then closes', () => {
    closeAnyOpenModal();
    let applied = null;
    app.ui.openColorModal({
      title: 'X',
      value: '#abcdef',
      onApply: (hex) => { applied = hex; },
    });
    const overlay = app.ui.modal.overlay;
    expect(overlay.classList.contains('open')).toBe(true);
    const applyBtn = document.querySelector('.color-modal-apply');
    applyBtn.click();
    expect(overlay.classList.contains('open')).toBe(false);
    expect(applied).toBe('#abcdef');
  });

  test('Editing the hex input then clicking Apply emits the edited hex', () => {
    closeAnyOpenModal();
    let applied = null;
    app.ui.openColorModal({
      title: 'X',
      value: '#000000',
      onApply: (hex) => { applied = hex; },
    });
    const hexInput = document.querySelector('.color-modal-hex');
    expect(hexInput).toBeTruthy();
    hexInput.value = 'ff8800';
    hexInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.querySelector('.color-modal-apply').click();
    // Apply normalizes to lower-case '#rrggbb'.
    expect(applied).toBe('#ff8800');
    closeAnyOpenModal();
  });
});
