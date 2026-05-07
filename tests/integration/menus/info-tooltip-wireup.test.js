/*
 * Integration test for Phase 3 closure tooltip wire-up on .info-btn.
 *
 * Boots the runtime, finds an existing info-btn, dispatches a pointerenter,
 * and asserts UI.overlays.Tooltip created a tooltip element with INFO text.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Phase 3 closure — info-btn tooltip wire-up', () => {
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

  test('UI.overlays.Tooltip is available', () => {
    expect(typeof window.Vectura?.UI?.overlays?.Tooltip).toBe('function');
  });

  test('hover on a .info-btn shows a tooltip with INFO content', () => {
    const btn = document.querySelector('.info-btn[data-info="global.seed"]');
    expect(btn).toBeTruthy();
    btn.dispatchEvent(new window.Event('pointerenter', { bubbles: true }));
    // The Tooltip primitive uses a delayShow timer; force it to fire.
    return new Promise((resolve) => {
      setTimeout(() => {
        const tip = document.querySelector('.vectura-tooltip');
        expect(tip).toBeTruthy();
        expect(tip.textContent).toMatch(/Seed/);
        resolve();
      }, 250);
    });
  });
});
