/*
 * Compile gate for src/ui/menus/drag-drop-router.js (Phase 3 closure).
 */
const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.Menus.DragDropRouter (compile gate)', () => {
  let runtime;

  beforeEach(() => {
    runtime = loadUIComponent([
      'utils',
      'drag-drop',
      'src/ui/menus/drag-drop-router',
    ]);
  });
  afterEach(() => {
    const { window } = runtime;
    if (window?.Vectura?.UI?.Menus?.DragDropRouter?._reset) {
      window.Vectura.UI.Menus.DragDropRouter._reset();
    }
    runtime.cleanup();
  });

  test('registers UI.Menus.DragDropRouter with bind/attach surface', () => {
    const R = runtime.window.Vectura.UI.Menus.DragDropRouter;
    expect(typeof R).toBe('object');
    expect(typeof R.bind).toBe('function');
    expect(typeof R.attach).toBe('function');
    expect(typeof R._route).toBe('function');
  });

  test('attach() before bind() throws an actionable error', () => {
    const R = runtime.window.Vectura.UI.Menus.DragDropRouter;
    expect(() => R.attach({})).toThrow(/load order broken/);
  });

  test('_route() dispatches .vectura files to openVecturaFile', () => {
    const R = runtime.window.Vectura.UI.Menus.DragDropRouter;
    R.bind({});
    let opened = null;
    let imported = null;
    const ui = {
      openVecturaFile: (f) => { opened = f; },
      importSvgFile: (f) => { imported = f; },
    };
    const file = { name: 'project.vectura', type: 'application/json' };
    R._route(ui, file);
    expect(opened).toBe(file);
    expect(imported).toBeNull();
  });

  test('_route() dispatches .svg files to importSvgFile', () => {
    const R = runtime.window.Vectura.UI.Menus.DragDropRouter;
    R.bind({});
    let opened = null;
    let imported = null;
    const ui = {
      openVecturaFile: (f) => { opened = f; },
      importSvgFile: (f) => { imported = f; },
    };
    const file = { name: 'art.svg', type: 'image/svg+xml' };
    R._route(ui, file);
    expect(opened).toBeNull();
    expect(imported).toBe(file);
  });

  test('_route() ignores unsupported extensions', () => {
    const R = runtime.window.Vectura.UI.Menus.DragDropRouter;
    R.bind({});
    let opened = null;
    let imported = null;
    const ui = {
      openVecturaFile: (f) => { opened = f; },
      importSvgFile: (f) => { imported = f; },
    };
    R._route(ui, { name: 'photo.png', type: 'image/png' });
    expect(opened).toBeNull();
    expect(imported).toBeNull();
  });

  test('attach() activates the underlying overlay', () => {
    const R = runtime.window.Vectura.UI.Menus.DragDropRouter;
    R.bind({});
    R.attach({ openVecturaFile: () => {}, importSvgFile: () => {} });
    const el = runtime.document.querySelector('.vectura-drag-drop-overlay');
    expect(el).not.toBeNull();
  });
});
