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

describe('UI.Menus.DragDropRouter multi-file drops', () => {
  const setup = () => {
    const runtime = loadUIComponent(['utils', 'drag-drop', 'src/ui/menus/drag-drop-router']);
    const R = runtime.window.Vectura.UI.Menus.DragDropRouter;
    R.bind({});
    return { runtime, R };
  };
  const f = (name) => ({ name });

  test('3 .vectura files go to openVecturaFiles once, in order', () => {
    const { runtime, R } = setup();
    const ui = { openVecturaFile: vi.fn(), openVecturaFiles: vi.fn(), importSvgFile: vi.fn() };
    const files = [f('a.vectura'), f('b.vectura'), f('c.vectura')];
    R._routeMany(ui, files);
    expect(ui.openVecturaFiles).toHaveBeenCalledTimes(1);
    expect(ui.openVecturaFiles.mock.calls[0][0]).toEqual(files);
    expect(ui.openVecturaFile).not.toHaveBeenCalled();
    R._reset(); runtime.cleanup();
  });

  test('one .vectura keeps the single-file path; svg-only imports the first svg', () => {
    const { runtime, R } = setup();
    const ui = { openVecturaFile: vi.fn(), openVecturaFiles: vi.fn(), importSvgFile: vi.fn() };
    R._routeMany(ui, [f('a.vectura')]);
    expect(ui.openVecturaFile).toHaveBeenCalledTimes(1);
    expect(ui.openVecturaFiles).not.toHaveBeenCalled();
    R._routeMany(ui, [f('1.svg'), f('2.svg')]);
    expect(ui.importSvgFile).toHaveBeenCalledTimes(1);
    R._reset(); runtime.cleanup();
  });

  test('mixed drop opens the projects, then imports the svg', async () => {
    const { runtime, R } = setup();
    const order = [];
    const ui = {
      openVecturaFiles: vi.fn(async () => { order.push('open'); }),
      importSvgFile: vi.fn(() => order.push('svg')),
    };
    R._routeMany(ui, [f('a.vectura'), f('x.svg'), f('b.vectura')]);
    await new Promise((r) => setTimeout(r, 0));
    expect(ui.openVecturaFiles.mock.calls[0][0].map((x) => x.name)).toEqual(['a.vectura', 'b.vectura']);
    expect(order).toEqual(['open', 'svg']);
    R._reset(); runtime.cleanup();
  });
});
