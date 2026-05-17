const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('expandLayer clears stale display geometry on parent', () => {
  let runtime, window, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('parent becomes an empty group after expand and stays empty when children are deleted', () => {
    const engine = app.engine;
    const parentId = engine.addLayer('wavetable');
    const parent = engine.getLayerById(parentId);
    expect(parent).toBeTruthy();

    engine.generate(parentId);
    engine.computeAllDisplayGeometry();

    const originalPathCount = (parent.paths || []).length;
    expect(originalPathCount).toBeGreaterThan(1);
    expect(engine.getRenderablePaths(parent).length).toBe(originalPathCount);

    const children = app.ui.expandLayer(parent, { returnChildren: true, suppressRender: true });
    expect(Array.isArray(children) && children.length).toBe(originalPathCount);

    expect(parent.isGroup).toBe(true);
    expect(parent.type).toBe('group');
    expect(parent.paths).toEqual([]);
    expect(parent.sourcePaths).toBeNull();

    expect(engine.getRenderablePaths(parent)).toEqual([]);
    expect(Array.isArray(parent.effectivePaths) ? parent.effectivePaths.length : 0).toBe(0);
    expect(Array.isArray(parent.displayPaths) ? parent.displayPaths.length : 0).toBe(0);
    expect(parent.optimizedPaths == null || parent.optimizedPaths.length === 0).toBe(true);

    const childToRemove = children[0];
    engine.removeLayer(childToRemove.id);

    expect(engine.getRenderablePaths(parent)).toEqual([]);
  });
});
