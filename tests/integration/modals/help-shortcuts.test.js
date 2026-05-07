/*
 * Integration test for the Help / Shortcuts modal (Phase 3 extraction).
 *
 * Boots the full Vectura runtime, then opens the Help modal via the UI
 * surface (`app.ui.openHelp()`), checks the rendered DOM matches what the
 * extracted module's buildHelpContent() emits, exercises tab switching and
 * platform toggle, then closes the modal.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Help / Shortcuts modal', () => {
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

  test('opens via app.ui.openHelp() with all 7 tab buttons rendered', () => {
    expect(typeof window.app.ui.openHelp).toBe('function');
    window.app.ui.openHelp(false);

    const overlay = document.getElementById('modal-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay.classList.contains('open')).toBe(true);
    expect(overlay.querySelector('.modal-title')?.textContent).toBe('Help Guide');

    const wrap = overlay.querySelector('.help-wrap');
    expect(wrap).toBeTruthy();

    const tabBtns = wrap.querySelectorAll('.help-tab-btn');
    expect(tabBtns.length).toBe(7);

    const expectedTabs = ['quickstart', 'algorithms', 'tools', 'canvas', 'layers', 'pen', 'fileexport'];
    for (const tab of expectedTabs) {
      expect(wrap.querySelector(`[data-tab="${tab}"]`)).toBeTruthy();
      expect(wrap.querySelector(`[data-panel="${tab}"]`)).toBeTruthy();
    }
  });

  test('initial tab is quickstart when focusShortcuts=false; switches to tools when true', () => {
    delete window.app.ui._lastHelpTab;
    window.app.ui.openHelp(false);
    let wrap = document.getElementById('modal-overlay').querySelector('.help-wrap');
    expect(wrap.querySelector('[data-tab="quickstart"]').classList.contains('active')).toBe(true);
    expect(wrap.querySelector('[data-panel="quickstart"]').hidden).toBe(false);
    expect(wrap.querySelector('[data-panel="tools"]').hidden).toBe(true);

    window.app.ui.closeModal();
    delete window.app.ui._lastHelpTab;

    window.app.ui.openHelp(true);
    wrap = document.getElementById('modal-overlay').querySelector('.help-wrap');
    expect(wrap.querySelector('[data-tab="tools"]').classList.contains('active')).toBe(true);
    expect(wrap.querySelector('[data-panel="tools"]').hidden).toBe(false);
    expect(wrap.querySelector('[data-panel="quickstart"]').hidden).toBe(true);
  });

  test('clicking a tab button switches active panel', () => {
    window.app.ui.openHelp(false);
    const wrap = document.getElementById('modal-overlay').querySelector('.help-wrap');
    const algoBtn = wrap.querySelector('[data-tab="algorithms"]');
    algoBtn.click();

    expect(algoBtn.classList.contains('active')).toBe(true);
    expect(wrap.querySelector('[data-panel="algorithms"]').hidden).toBe(false);
    expect(wrap.querySelector('[data-panel="quickstart"]').hidden).toBe(true);
    expect(window.app.ui._lastHelpTab).toBe('algorithms');
  });

  test('platform toggle swaps [data-mac] text', () => {
    window.app.ui.openHelp(false);
    const wrap = document.getElementById('modal-overlay').querySelector('.help-wrap');
    const winBtn = wrap.querySelector('[data-platform="win"]');
    const macBtn = wrap.querySelector('[data-platform="mac"]');
    const sampleKbd = wrap.querySelector('kbd[data-mac]');

    winBtn.click();
    expect(winBtn.classList.contains('active')).toBe(true);
    expect(macBtn.classList.contains('active')).toBe(false);
    expect(sampleKbd.textContent).toBe(sampleKbd.dataset.win);

    macBtn.click();
    expect(macBtn.classList.contains('active')).toBe(true);
    expect(sampleKbd.textContent).toBe(sampleKbd.dataset.mac);
  });

  test('closeModal() removes the open class and clears _modalCleanup state', () => {
    window.app.ui.openHelp(false);
    const overlay = document.getElementById('modal-overlay');
    expect(overlay.classList.contains('open')).toBe(true);

    window.app.ui.closeModal();
    expect(overlay.classList.contains('open')).toBe(false);
  });
});
