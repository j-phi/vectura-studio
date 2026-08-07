/**
 * BUG 2 regression — object3d primitive swap on a SCENE TREE.
 *
 * `renderer.setSceneObjectPrimitive` historically resolved its targets through
 * `_sceneObjects(layer)`, which returns ONLY the legacy inline `params.objects`
 * array — empty on a real scene tree (a scene GROUP whose objects live on CHILD
 * object3d layers). The swap therefore no-op'd and the object stayed a box.
 *
 * The fix resolves each target through `_sceneObjectById` (child-layer aware) so
 * the swap mutates the CHILD layer's `params.primitive` + resets its
 * `params.params` to the new primitive's canonical defaults. The ctxbar reads
 * the current primitive back through `getSceneObjectRecord`.
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

  test('box → sphere mutates the child layer + resets its params bag', () => {
    const { engine, renderer, gid, childId } = build();
    const child = engine.getLayerById(childId);
    expect(child.params.primitive).toBe('box');

    const ok = renderer.setSceneObjectPrimitive(gid, [childId], 'sphere');
    expect(ok).toBe(true);
    expect(engine.getLayerById(childId).params.primitive).toBe('sphere');
    expect(engine.getLayerById(childId).params.params)
      .toEqual(V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.sphere);
  });

  test('box → cylinder mutates the child layer + resets its params bag', () => {
    const { engine, renderer, gid, childId } = build();
    const ok = renderer.setSceneObjectPrimitive(gid, [childId], 'cylinder');
    expect(ok).toBe(true);
    expect(engine.getLayerById(childId).params.primitive).toBe('cylinder');
    expect(engine.getLayerById(childId).params.params)
      .toEqual(V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.cylinder);
  });

  test('getSceneObjectRecord reads the child layer\'s CURRENT primitive (ctxbar checkmark)', () => {
    const { engine, renderer, gid, childId } = build();
    renderer.setSceneObjectPrimitive(gid, [childId], 'cone');
    const rec = renderer.getSceneObjectRecord(gid, childId);
    expect(rec && rec.primitive).toBe('cone');
  });
});
