const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * BUG 1 regression — dropping an object3d onto a scene GROUP must NEST it.
 *
 * Only the scene group HEADER's narrow middle "into" band nested an object.
 * Dropping the object3d onto (before/after) a scene CHILD card — the large,
 * obvious target inside an expanded scene group — left parentId untouched, so
 * the object "popped outside" the group to root and never rendered in the scene.
 *
 * The fix makes `_lvlDoMove` redirect an object3d dropped anywhere that resolves
 * to a scene container (the scene group or any of its child cards) INTO that
 * container via assignLayersToParent.
 */

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

const makeDragEventFactory = (window) => (type, clientY = 0) => {
  const e = new window.Event(type, { bubbles: true, cancelable: true });
  e.dataTransfer = {
    effectAllowed: 'move', dropEffect: 'move',
    setData() {}, getData() { return ''; }, clearData() {},
  };
  Object.defineProperty(e, 'clientY', { value: clientY });
  return e;
};

describe('BUG 1 — object3d drag nests into a scene group', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('dropping a standalone object3d onto a scene child card nests it into the group', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    const { window } = runtime;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    const engine = app.engine;
    engine.layers = [];

    // A scene tree (group + box child + light + ground) plus a STANDALONE object3d.
    const gid = engine.addSceneTree();
    const boxChild = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    const soId = engine.addObjectToScene(gid, 'box');
    const so = engine.getLayerById(soId);
    so.parentId = null; // detach — it is now a root-level object3d
    engine.computeAllDisplayGeometry();

    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const soCard = document.querySelector(`[data-lvl-id="${soId}"]`);
    const childCard = document.querySelector(`[data-lvl-id="${boxChild.id}"]`);
    expect(soCard).toBeTruthy();
    expect(childCard).toBeTruthy();

    // Force the child card's "after" drop zone (pct > 0.5).
    childCard.getBoundingClientRect = () => ({ top: 0, left: 0, height: 100, width: 200, right: 200, bottom: 100 });

    const createDragEvent = makeDragEventFactory(window);
    soCard.dispatchEvent(createDragEvent('dragstart'));
    childCard.dispatchEvent(createDragEvent('dragover', 90)); // pct 0.9 → after
    childCard.dispatchEvent(createDragEvent('drop', 90));
    soCard.dispatchEvent(createDragEvent('dragend'));

    // RED before fix: parentId stayed null (object popped outside the group).
    expect(engine.getLayerById(soId).parentId).toBe(gid);

    // And it now renders as a scene child (composed scenePaths carry its id).
    engine.generate(gid);
    const paths = engine.getLayerById(gid).scenePaths || [];
    const mine = paths.filter((p) => p && p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === soId);
    expect(mine.length).toBeGreaterThan(0);
  });

  test('an object3d leaving a boolean group reverts its role to solid when nested elsewhere', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    const { window } = runtime;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    const engine = app.engine;
    engine.layers = [];

    const gid = engine.addSceneTree();
    const defaultBox = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    // Two operands → a boolean group (first solid, second hole).
    const aId = engine.addObjectToScene(gid, 'box');
    const bId = engine.addObjectToScene(gid, 'box');
    const blId = engine.createBooleanGroupFromSelection([aId, bId]);
    expect(blId).toBeTruthy();
    const bHole = engine.getLayerById(bId);
    expect(bHole.params.role).toBe('hole');

    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const bCard = document.querySelector(`[data-lvl-id="${bId}"]`);
    // Drop b onto the scene's DEFAULT box child (a direct scene member OUTSIDE
    // the boolean group) → nests into the scene group, leaving the boolean group.
    const targetCard = document.querySelector(`[data-lvl-id="${defaultBox.id}"]`);
    expect(bCard).toBeTruthy();
    expect(targetCard).toBeTruthy();
    targetCard.getBoundingClientRect = () => ({ top: 0, left: 0, height: 100, width: 200, right: 200, bottom: 100 });

    const createDragEvent = makeDragEventFactory(window);
    bCard.dispatchEvent(createDragEvent('dragstart'));
    targetCard.dispatchEvent(createDragEvent('dragover', 90)); // after zone
    targetCard.dispatchEvent(createDragEvent('drop', 90));
    bCard.dispatchEvent(createDragEvent('dragend'));

    // It left the boolean group for the scene group → role reverts to solid.
    expect(engine.getLayerById(bId).parentId).toBe(gid);
    expect(engine.getLayerById(bId).params.role).toBe('solid');
  });
});
