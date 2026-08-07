/**
 * Regression — the 3D transform gizmo must not vanish when the user clicks it.
 *
 * On a scene TREE the objects live on CHILD object3d layers; the group's own
 * `params.objects` is EMPTY and (after addSceneTree) `params.ground` is disabled,
 * because a ground CHILD owns the fixture. `_scenePickFaces` nevertheless
 * re-assembled the scene from the GROUP's RAW params, so on a tree it produced
 * ZERO pick faces — the per-pixel real-depth pass that exists specifically to
 * stop the huge ground plane's coarse face-centroid depth from reading
 * "spuriously near" never ran.
 *
 * Consequence: the ground won EVERY object pick over the box. Any click that was
 * not an exact gizmo-handle hit re-selected `ground`, and `getSceneObjectGizmo`
 * refuses `objId === 'ground'` — so the gizmo disappeared the moment the user
 * clicked on/near it.
 *
 * The fix keeps `_sceneObjects` inline-only and instead routes the pick-face
 * builder through the SAME collected input the compositor used
 * (`_composeSceneGroup` stashes it on the group as `_sceneAssembled`).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('scene-tree object picking depth (gizmo survives a click)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const build = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree(); // group + box child + light + ground child
    engine.computeAllDisplayGeometry();
    const group = engine.getLayerById(gid);
    const child = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { pushHistory: () => {}, render: () => {}, history: [{}, {}] };
    renderer.activeTool = 'select';
    renderer.ready = true;
    return { engine, renderer, gid, group, child };
  };

  test('a scene GROUP yields pick faces for its object3d CHILD, not just the ground', () => {
    const { renderer, group, child } = build();
    // The group's own params carry no objects — the tree does.
    expect((group.params.objects || []).length).toBe(0);

    const faces = renderer._scenePickFaces(group);
    const objectIds = new Set(faces.map((f) => f.objectId));
    expect(faces.length).toBeGreaterThan(0);
    expect(objectIds.has(child.id)).toBe(true);
  });

  test('clicking the box picks the BOX, not the ground plane behind it', () => {
    const { renderer, group, child } = build();
    const center = renderer._sceneObjectPathCenter(group, child.id);
    expect(center).toBeTruthy();

    const stack = renderer._sceneCandidatesAtPoint(center, 'object');
    expect(stack.length).toBeGreaterThan(0);
    expect(stack[0].objectId).toBe(child.id);
  });

  test('a click over the object keeps the transform gizmo alive (does not select ground)', () => {
    const { renderer, gid, group, child } = build();
    // State a canvas pick leaves behind: child layer selected + object scene selection.
    renderer.selectLayer(child);
    renderer.setSceneSelection({
      layerId: gid, mode: 'object', objectIds: [child.id], faceKeys: [], edgeKeys: [],
    });
    expect(renderer.getSceneObjectGizmo()).toBeTruthy();

    // Click over the object (the gizmo's own footprint sits here) — this must not
    // re-select the ground and blow the gizmo away.
    const center = renderer._sceneObjectPathCenter(group, child.id);
    renderer._sceneDownSelect(center, { clientX: center.x, clientY: center.y }, {});

    const sel = renderer.getSceneSelection();
    expect(sel).toBeTruthy();
    expect(sel.objectIds).toEqual([child.id]);
    expect(renderer.getSceneObjectGizmo()).toBeTruthy();
  });
});
