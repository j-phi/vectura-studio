/*
 * TUX-008: the workspace shell drives the pane classes, the backdrop and persistence from one
 * controller (Vectura.UI.Workspace.paneState). jsdom has no layout, so this checks classes and settings.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

const setViewport = (window, w, h = 800) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
  window.dispatchEvent(new window.Event('resize'));
};

describe('workspace pane-state wiring (TUX-008)', () => {
  let runtime, window, document;
  const coarse = (on) => {
    window.matchMedia = (q) => ({ matches: on && /pointer:\s*coarse/.test(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  };
  const left = () => document.getElementById('left-pane');
  const right = () => document.getElementById('right-pane');
  const backdrop = () => document.getElementById('mobile-pane-backdrop');
  const ps = () => window.Vectura.UI.Workspace.paneState;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    await Promise.resolve();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  test('touch tablet: closed on entry, drawer opens above a backdrop, sibling closes, nothing persists', () => {
    coarse(true);
    setViewport(window, 834, 1180);
    expect(document.body.classList.contains('tablet-layout')).toBe(true);
    expect(ps().layout()).toBe('tablet');
    expect(ps().isOpen('left')).toBe(false);
    expect(ps().isOpen('right')).toBe(false);
    expect(left().classList.contains('pane-collapsed')).toBe(true);
    expect(backdrop().classList.contains('visible')).toBe(false);
    expect(document.body.classList.contains('auto-collapsed')).toBe(false);
    const S = window.Vectura.SETTINGS;
    const before = [S.leftPaneCollapsed, S.rightPaneCollapsed, S.touchWideLeftPaneCollapsed, S.touchWideRightPaneCollapsed];
    ps().open('left');
    expect(left().classList.contains('pane-drawer-open')).toBe(true);
    expect(left().classList.contains('pane-collapsed')).toBe(false);
    expect(backdrop().classList.contains('visible')).toBe(true);
    ps().open('right');
    expect(left().classList.contains('pane-drawer-open')).toBe(false);
    expect(right().classList.contains('pane-drawer-open')).toBe(true);
    backdrop().click();
    expect(ps().isOpen('right')).toBe(false);
    expect(backdrop().classList.contains('visible')).toBe(false);
    expect([S.leftPaneCollapsed, S.rightPaneCollapsed, S.touchWideLeftPaneCollapsed, S.touchWideRightPaneCollapsed]).toEqual(before);
  });

  test('same-class resize keeps the drawer; touch-wide and back closes it once', () => {
    coarse(true);
    setViewport(window, 834, 1180);
    ps().open('left');
    for (let i = 0; i < 10; i += 1) setViewport(window, 820 + (i % 3), 1180);
    expect(ps().isOpen('left')).toBe(true);
    setViewport(window, 1210, 834);
    expect(ps().layout()).toBe('touch-wide');
    expect(document.body.classList.contains('touch-wide-layout')).toBe(true);
    expect(left().classList.contains('pane-collapsed')).toBe(false);
    expect(backdrop().classList.contains('visible')).toBe(false);
    setViewport(window, 834, 1180);
    expect(ps().isOpen('left')).toBe(false);
  });

  test('touch-wide persists to its own keys, not the desktop keys', () => {
    coarse(true);
    setViewport(window, 1210, 834);
    const S = window.Vectura.SETTINGS;
    const desktopBefore = [S.leftPaneCollapsed, S.rightPaneCollapsed];
    ps().close('right');
    expect(right().classList.contains('pane-collapsed')).toBe(true);
    expect(S.touchWideRightPaneCollapsed).toBe(true);
    expect([S.leftPaneCollapsed, S.rightPaneCollapsed]).toEqual(desktopBefore);
    ps().open('right');
    expect(S.touchWideRightPaneCollapsed).toBe(false);
  });

  test('fine pointer keeps the legacy behaviour: 800 px is open overlays with no backdrop', () => {
    coarse(false);
    setViewport(window, 800, 900);
    expect(ps().layout()).toBe('desktop');
    expect(ps().isOpen('left') && ps().isOpen('right')).toBe(true);
    expect(backdrop().classList.contains('visible')).toBe(false);
    setViewport(window, 375, 800);
    expect(ps().layout()).toBe('phone');
    expect(document.body.classList.contains('auto-collapsed')).toBe(true);
    expect(ps().isOpen('left')).toBe(false);
    ps().open('left');
    expect(left().classList.contains('pane-force-open')).toBe(true);
    expect(backdrop().classList.contains('visible')).toBe(true);
    ps().closeAll();
    setViewport(window, 1200, 800);
  });
});
