const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Building an object's inspector mirrors that object onto the canvas scene selection (mirrorChildToCanvas). When two or
 * more objects are already selected and the focused object is one of them, the mirror must leave the multi-selection
 * alone — otherwise every panel rebuild (e.g. after a multi-object gizmo drag) collapses it to one object.
 */
describe('object inspector keeps an existing multi-object canvas selection', () => {
  let runtime; let window; let app;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true });
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const setup = () => {
    app.engine.layers = [];
    const gid = app.engine.addSceneTree();
    const a = app.engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    const bId = app.engine.addObjectToScene(gid, 'sphere');
    return { gid, a, bId };
  };

  test('focused object inside a 2-object selection: selection unchanged', () => {
    const { gid, a, bId } = setup();
    const sel = { layerId: gid, mode: 'object', objectIds: [a.id, bId], faceKeys: [], edgeKeys: [] };
    app.renderer.setSceneSelection(sel, { silent: true });
    app.engine.activeLayerId = bId;
    app.ui.buildControls();
    expect(app.renderer.getSceneSelection().objectIds).toEqual([a.id, bId]);
  });

  test('focused object outside the selection, or a single selection: mirrors to that object as before', () => {
    const { gid, a, bId } = setup();
    app.renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds: [a.id], faceKeys: [], edgeKeys: [] }, { silent: true });
    app.engine.activeLayerId = bId;
    app.ui.buildControls();
    expect(app.renderer.getSceneSelection().objectIds).toEqual([bId]);
  });
});
