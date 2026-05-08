/*
 * Mobile layout: verifies the redesigned mobile shell — pinned top app bar,
 * canvas in middle, bottom-pane drawer, modifier bar pinned to viewport
 * bottom and always reachable. Modifier bar is no longer reparented into
 * #bottom-pane.
 *
 * Also covers the new Ctrl modifier and the phone-layout (<540px) class.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const setViewport = (window, w) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  window.dispatchEvent(new window.Event('resize'));
};

describe('mobile layout', () => {
  let runtime, window, document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    await Promise.resolve();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('modifier bar is NOT reparented into #bottom-pane on mobile-layout', () => {
    setViewport(window, 375);
    const modBar = document.getElementById('touch-modifier-bar');
    const bottomPane = document.getElementById('bottom-pane');
    expect(modBar).toBeTruthy();
    expect(bottomPane).toBeTruthy();
    expect(bottomPane.contains(modBar)).toBe(false);
    // Should live as a child of .workspace-shell, alongside #tool-bar / #viewport-container.
    const shell = document.querySelector('.workspace-shell');
    expect(shell.contains(modBar)).toBe(true);
  });

  test('mobile-layout class is added below 900px and removed at/above', () => {
    setViewport(window, 375);
    expect(document.body.classList.contains('mobile-layout')).toBe(true);
    setViewport(window, 1200);
    expect(document.body.classList.contains('mobile-layout')).toBe(false);
  });

  test('phone-layout class activates only below 540px', () => {
    setViewport(window, 600);
    expect(document.body.classList.contains('phone-layout')).toBe(false);
    setViewport(window, 539);
    expect(document.body.classList.contains('phone-layout')).toBe(true);
    setViewport(window, 375);
    expect(document.body.classList.contains('phone-layout')).toBe(true);
  });

  test('modifier bar is shown (not hidden) on mobile-layout', () => {
    setViewport(window, 375);
    const modBar = document.getElementById('touch-modifier-bar');
    expect(modBar.classList.contains('hidden')).toBe(false);
  });

  test('Ctrl modifier button exists and toggles state in SETTINGS.touchModifiers', () => {
    setViewport(window, 375);
    const ctrlBtn = document.querySelector('.touch-mod-btn[data-touch-mod="ctrl"]');
    expect(ctrlBtn).toBeTruthy();

    const SETTINGS = window.Vectura.SETTINGS;
    expect(SETTINGS.touchModifiers).toHaveProperty('ctrl');
    expect(Boolean(SETTINGS.touchModifiers.ctrl)).toBe(false);

    ctrlBtn.click();
    expect(SETTINGS.touchModifiers.ctrl).toBe(true);
    expect(ctrlBtn.classList.contains('active')).toBe(true);

    ctrlBtn.click();
    expect(SETTINGS.touchModifiers.ctrl).toBe(false);
    expect(ctrlBtn.classList.contains('active')).toBe(false);
  });

  test('Space modifier button does NOT exist (was dropped from the design)', () => {
    const spaceBtn = document.querySelector('.touch-mod-btn[data-touch-mod="space"]');
    expect(spaceBtn).toBeNull();
  });

  test('mobile-pane-backdrop element is created and tracks pane open state', () => {
    setViewport(window, 375);
    const backdrop = document.getElementById('mobile-pane-backdrop');
    expect(backdrop).toBeTruthy();
    // No pane open at start of mobile-layout
    expect(backdrop.classList.contains('visible')).toBe(false);

    // Open left pane
    const leftBtn = document.getElementById('btn-pane-toggle-left');
    leftBtn.click();
    expect(backdrop.classList.contains('visible')).toBe(true);

    // Tap backdrop closes panes
    backdrop.click();
    expect(backdrop.classList.contains('visible')).toBe(false);
  });

  test('viewport meta has viewport-fit=cover for safe-area inset support', () => {
    const meta = document.querySelector('meta[name="viewport"]');
    expect(meta).toBeTruthy();
    expect(meta.getAttribute('content')).toMatch(/viewport-fit=cover/);
  });
});
