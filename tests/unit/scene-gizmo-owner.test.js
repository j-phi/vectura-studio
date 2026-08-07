/**
 * BUG 3 regression — the scene rotation (orbit) gizmo must survive selecting a
 * scene OBJECT.
 *
 * The gizmo is drawn/hit for the ACTIVE layer. On a scene TREE, canvas-picking a
 * scene object makes the child object3d the active layer, and:
 *   - `get3DRotationSpec` returned null for the scene GROUP itself, because a
 *     scene-tree group is `isGroup:true` (the guard rejected every group).
 *   - the child object3d has no rotation spec at all.
 * Either way the gizmo vanished.
 *
 * The fix: `get3DRotationSpec` allows a scene3d group, and `_sceneRotationOwner`
 * resolves any scene descendant (object3d / booleanGroup3d / light / ground) up
 * to its owning scene3d group so the gizmo anchors there.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('BUG 3 — scene gizmo owner resolution', () => {
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
    engine.generate = () => {};
    const gid = engine.addSceneTree(); // group + box child + light + ground
    const child = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    const light = engine.getLayerDescendants(gid).find((l) => l.type === 'sceneLight3d');
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { pushHistory: () => {}, render: () => {}, history: [{}, {}] };
    return { engine, renderer, gid, child, light };
  };

  test('get3DRotationSpec returns the scene3d spec for a scene-tree GROUP (isGroup)', () => {
    const { engine, renderer, gid } = build();
    const group = engine.getLayerById(gid);
    expect(group.isGroup).toBe(true);
    expect(renderer.get3DRotationSpec(group)).toBeTruthy();
  });

  test('a non-scene group still has NO 3D rotation spec', () => {
    const { engine, renderer } = build();
    const bl = new V.Layer('bl-1', 'booleanGroup3d', 'Boolean');
    bl.isGroup = true;
    engine.layers.push(bl);
    expect(renderer.get3DRotationSpec(bl)).toBeFalsy();
  });

  test('_sceneRotationOwner resolves a child object3d up to its scene group', () => {
    const { engine, renderer, gid, child } = build();
    expect(child).toBeTruthy();
    expect(renderer._sceneRotationOwner(child)).toBe(engine.getLayerById(gid));
  });

  test('_sceneRotationOwner resolves a light child up to its scene group', () => {
    const { engine, renderer, gid, light } = build();
    expect(light).toBeTruthy();
    expect(renderer._sceneRotationOwner(light)).toBe(engine.getLayerById(gid));
  });

  test('_sceneRotationOwner returns the scene group itself', () => {
    const { engine, renderer, gid } = build();
    const group = engine.getLayerById(gid);
    expect(renderer._sceneRotationOwner(group)).toBe(group);
  });

  test('_sceneRotationOwner returns null for a plain non-scene layer', () => {
    const { engine, renderer } = build();
    const shape = new V.Layer('shape-1', 'shape', 'Shape');
    engine.layers.push(shape);
    expect(renderer._sceneRotationOwner(shape)).toBeNull();
  });
});
