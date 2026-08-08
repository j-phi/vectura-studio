/**
 * BUG 2 regression — object3d primitive swap on a SCENE TREE.
 *
 * `renderer.setSceneObjectPrimitive` historically resolved its targets through
 * `_sceneObjects(layer)`, which returns ONLY the legacy inline `params.objects`
 * array — empty on a real scene tree (a scene GROUP whose objects live on CHILD
 * object3d layers). The swap therefore no-op'd and the object stayed a box.
 *
 * The fix resolves each target the child-layer-aware way so the swap mutates the
 * CHILD layer's `params.primitive` + rebuilds its `params.params`. The ctxbar
 * reads the current primitive back through `getSceneObjectRecord`.
 *
 * CONTRACT UPDATE (ctxbar/panel unification): the bag is no longer a copy of
 * `PRIMITIVE_PARAM_DEFAULTS` — that is the DESERIALIZATION table and carries no
 * `importedMesh`, so copying it destroyed an imported mesh and made a ctxbar
 * swap disagree with a panel swap. A tree child now delegates to
 * `engine.setObjectPrimitive`, i.e. `Scene3D.Params.buildPrimitiveParams`
 * (PRIMITIVE_CREATE_DEFAULTS + size-preserving rescale + mesh carry-over).
 * The assertions below therefore compare against that one shared contract.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('BUG 2 — scene-tree object3d primitive swap', () => {
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
    const gid = engine.addSceneGroup();
    const childId = engine.addObjectToScene(gid, 'box');
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { pushHistory: () => {}, render: () => {}, history: [{}, {}] };
    engine.generate = () => {}; // isolate from the scene3d algorithm
    renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds: [childId], faceKeys: [], edgeKeys: [] });
    return { engine, renderer, gid, childId };
  };

  test('swap writes through to the child layer WITHOUT leaking a phantom inline object', () => {
    const { engine, renderer, gid, childId } = build();
    renderer.setSceneObjectPrimitive(gid, [childId], 'sphere');
    // The scene group's inline objects array stays empty — the child layer is
    // the single source of truth (no double-rendered phantom).
    expect(engine.getLayerById(gid).params.objects).toEqual([]);
    expect(engine.getLayerById(childId).params.primitive).toBe('sphere');
  });

  test('box → sphere mutates the child layer + rebuilds its params bag', () => {
    const { engine, renderer, gid, childId } = build();
    const child = engine.getLayerById(childId);
    expect(child.params.primitive).toBe('box');
    const before = { ...child.params.params };

    const ok = renderer.setSceneObjectPrimitive(gid, [childId], 'sphere');
    expect(ok).toBe(true);
    expect(engine.getLayerById(childId).params.primitive).toBe('sphere');
    expect(engine.getLayerById(childId).params.params)
      .toEqual(V.Scene3D.Params.buildPrimitiveParams('sphere', 'box', before));
    // The box's shape keys are gone (a swap is a clean shape change).
    expect(engine.getLayerById(childId).params.params.sx).toBeUndefined();
  });

  test('box → cylinder mutates the child layer + rebuilds its params bag', () => {
    const { engine, renderer, gid, childId } = build();
    const before = { ...engine.getLayerById(childId).params.params };
    const ok = renderer.setSceneObjectPrimitive(gid, [childId], 'cylinder');
    expect(ok).toBe(true);
    expect(engine.getLayerById(childId).params.primitive).toBe('cylinder');
    expect(engine.getLayerById(childId).params.params)
      .toEqual(V.Scene3D.Params.buildPrimitiveParams('cylinder', 'box', before));
  });

  test('getSceneObjectRecord reads the child layer\'s CURRENT primitive (ctxbar checkmark)', () => {
    const { engine, renderer, gid, childId } = build();
    renderer.setSceneObjectPrimitive(gid, [childId], 'cone');
    const rec = renderer.getSceneObjectRecord(gid, childId);
    expect(rec && rec.primitive).toBe('cone');
  });
});
