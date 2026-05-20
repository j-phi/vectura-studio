/*
 * Audit Bugs-4 (v1.1.10) — modal hardening regression suite.
 *
 * Drives the legacy `openModal` API (composed by Color Picker, Help, error
 * toasts in ui-file-io, etc.) and verifies four guarantees the audit flagged
 * as broken:
 *
 *   1. XSS — string bodies must not execute inline event handlers
 *      (`<img src=x onerror=...>`). They must either be sanitized or refused.
 *   2. Esc — pressing Escape while the modal is open closes it.
 *   3. Focus trap — Tab from the last focusable wraps to the first;
 *      Shift+Tab from the first wraps to the last.
 *   4. Focus restore — closing the modal restores focus to the element that
 *      held focus before it opened.
 *
 * These tests were authored in red-green-refactor mode; before the modal.js
 * fix lands they fail (XSS marker set, Esc has no effect, Tab leaks out, no
 * restore). After the fix they pass without touching any caller's contract.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('openModal hardening (Bugs-4)', () => {
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
    if (app.ui?.modal?.overlay?.classList?.contains('open')) {
      app.ui.closeModal?.();
    }
  }

  beforeEach(() => {
    closeAnyOpenModal();
    delete window.__pwned;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. XSS
  // ───────────────────────────────────────────────────────────────────────────

  test('string body with inline event handler does not execute its handler', () => {
    // The classic XSS marker: <img onerror> fires synchronously on attach
    // when the browser tries to resolve src=x. Sanitization must strip the
    // event-handler attribute (or refuse the string body altogether).
    const malicious = '<img src="x" onerror="window.__pwned = true">';
    app.ui.openModal({ title: 'XSS Test', body: malicious });

    expect(window.__pwned).toBeUndefined();
    // The literal handler attribute must not survive in the live DOM.
    const bodyEl = app.ui.modal.bodyEl;
    const imgs = bodyEl.querySelectorAll('img');
    imgs.forEach((img) => {
      expect(img.getAttribute('onerror')).toBeNull();
    });
  });

  test('string body containing <script> tags does not execute script', () => {
    const malicious = '<p>safe</p><script>window.__pwned = true;</script>';
    app.ui.openModal({ title: 'XSS Test 2', body: malicious });
    expect(window.__pwned).toBeUndefined();
    expect(app.ui.modal.bodyEl.querySelector('script')).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Esc closes the modal
  // ───────────────────────────────────────────────────────────────────────────

  test('pressing Escape while the modal is open closes it', () => {
    app.ui.openModal({
      title: 'Esc Test',
      body: '<p class="modal-text">Hello.</p>',
    });
    const overlay = app.ui.modal.overlay;
    expect(overlay.classList.contains('open')).toBe(true);

    const esc = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(esc);

    expect(overlay.classList.contains('open')).toBe(false);
  });

  test('Escape listener is removed after close (no leak across opens)', () => {
    // Open and close once via Escape — then open again. After the second open
    // there must be exactly one active keydown handler (closing once should
    // not require two Escapes).
    app.ui.openModal({ title: 'Leak Test', body: '<p>1</p>' });
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(app.ui.modal.overlay.classList.contains('open')).toBe(false);

    app.ui.openModal({ title: 'Leak Test 2', body: '<p>2</p>' });
    expect(app.ui.modal.overlay.classList.contains('open')).toBe(true);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(app.ui.modal.overlay.classList.contains('open')).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Focus trap
  // ───────────────────────────────────────────────────────────────────────────

  test('Tab on the last focusable element wraps to the first; Shift+Tab on first wraps to last', () => {
    const body =
      '<button type="button" class="m-a">A</button>'
      + '<button type="button" class="m-b">B</button>'
      + '<button type="button" class="m-c">C</button>';
    app.ui.openModal({ title: 'Trap Test', body });

    const overlay = app.ui.modal.overlay;
    const card = overlay.querySelector('.modal-card');
    // The scaffold's `.modal-close` button is always the first focusable in
    // the card (it lives in the header), so the trap's cycle goes
    // close → A → B → C → close. Verify the wrap-around lands somewhere
    // inside the modal — focus must NOT escape the overlay.
    const closeBtn = card.querySelector('.modal-close');
    const a = card.querySelector('.m-a');
    const c = card.querySelector('.m-c');

    // Forward Tab from the last focusable should cycle to the first (close).
    c.focus();
    expect(document.activeElement).toBe(c);
    const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    card.dispatchEvent(tab);
    expect(document.activeElement).toBe(closeBtn);
    expect(overlay.contains(document.activeElement)).toBe(true);

    // Shift+Tab from the first focusable (close) wraps to the last (C).
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);
    const shiftTab = new window.KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    });
    card.dispatchEvent(shiftTab);
    expect(document.activeElement).toBe(c);

    // And a regular Tab in the middle of the cycle is a no-op for us
    // (native focus order handles A→B→C); but the trap must not blow up.
    a.focus();
    card.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(overlay.contains(document.activeElement)).toBe(true);
  });

  test('modal with no focusable descendants still receives focus (card itself becomes the trap target)', async () => {
    app.ui.openModal({
      title: 'Empty Trap',
      body: '<p class="modal-text">No focusables here.</p>',
    });
    // Initial focus is deferred to the next animation frame so the body has
    // been laid out before we try to focus into it. Wait one rAF tick.
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

    // Either the card or the close button (the close button is always
    // present in the legacy scaffold and is focusable). Either way, focus
    // must be inside the modal overlay.
    const overlay = app.ui.modal.overlay;
    expect(overlay.contains(document.activeElement)).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Focus restore on close
  // ───────────────────────────────────────────────────────────────────────────

  test('closing the modal restores focus to the element that had focus before open', () => {
    // Inject a focusable trigger outside the modal.
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'modal-trigger-fixture';
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    app.ui.openModal({
      title: 'Restore Test',
      body: '<button type="button" class="m-inside">Inside</button>',
    });
    // Modal stole focus; closing should hand it back.
    app.ui.closeModal();
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });
});
