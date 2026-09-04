const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene-tree Increment C — layers-panel tree engine helpers.
 *
 * These drive the engine surface the layers-panel calls to build a 3D scene as
 * a TREE of layers (a scene GROUP owning object3d / booleanGroup3d children):
 *
 *   engine.addSceneGroup()                          — an empty scene group with
 *     the three container invariants (type 'scene3d', isGroup, containerRole
 *     'scene') Increment B's compositor gates on.
 *   engine.addObjectToScene(sceneGroupId, primitive?) — a new object3d child.
 *   engine.createBooleanGroupFromSelection(ids)     — a booleanGroup3d under the
 *     scene group, reparenting the selected object3d operands with roles set.
 *   engine.setObjectLayerParent(objectId, parentId) — the drag-drop reparent
 *     path: entering a boolean seeds a role; leaving one restores 'solid'.
 *
 * After every mutation the compositor must still produce valid paths (the scene
 * group renders), and every child must carry a real penId (the compositor
 * derives hatch spacing from the group's pen — a null penId is a silent bug).
 */

describe('Scene-tree Increment C — layers-panel tree engine helpers', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const freshEngine = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    return engine;
  };

  const compose = (engine) => {
    engine.layers.forEach((l) => { if (l && !l.isGroup) engine.generate(l.id); });
    engine.computeAllDisplayGeometry();
  };

  test('addSceneGroup creates a scene group with all three container invariants', () => {
    const engine = freshEngine();
    const gid = engine.addSceneGroup();
    const grp = engine.getLayerById(gid);
    expect(grp).toBeTruthy();
    expect(grp.type).toBe('scene3d');
    expect(grp.isGroup).toBe(true);
    expect(grp.containerRole).toBe('scene');
    // Starts empty: the tree children are the single source of truth.
    expect(grp.params.objects).toEqual([]);
    expect(grp.params.groups).toEqual([]);
    // A scene group carries a real pen (compositor derives spacing from it).
    expect(grp.penId).toBeTruthy();
  });

  test('(a) addObjectToScene parents an object3d under the scene group, invariants intact', () => {
    const engine = freshEngine();
    const gid = engine.addSceneGroup();
    const oid = engine.addObjectToScene(gid);
    const obj = engine.getLayerById(oid);
    expect(obj).toBeTruthy();
    expect(obj.type).toBe('object3d');
    expect(obj.parentId).toBe(gid);
    expect(obj.isGroup).toBeFalsy();
    // Risk #1: a real penId so the compositor gets correct hatch spacing.
    expect(obj.penId).toBeTruthy();
    // A named primitive routes through to a real params bag.
    const oid2 = engine.addObjectToScene(gid, 'sphere');
    const obj2 = engine.getLayerById(oid2);
    expect(obj2.params.primitive).toBe('sphere');
    expect(obj2.params.params.radius).toBeGreaterThan(0);
    // Container invariants survive the mutation.
    const grp = engine.getLayerById(gid);
    expect(grp.type).toBe('scene3d');
    expect(grp.isGroup).toBe(true);
    expect(grp.containerRole).toBe('scene');
    // (d) the compositor still produces valid paths.
    compose(engine);
    expect(Array.isArray(grp.scenePaths)).toBe(true);
    expect(grp.scenePaths.length).toBeGreaterThan(0);
  });

  test('(b) createBooleanGroupFromSelection makes a boolean under the scene group and reparents operands with roles', () => {
    const engine = freshEngine();
    const gid = engine.addSceneGroup();
    const o1 = engine.addObjectToScene(gid);
    const o2 = engine.addObjectToScene(gid);
    const bid = engine.createBooleanGroupFromSelection([o1, o2]);
    const bool = engine.getLayerById(bid);
    expect(bool).toBeTruthy();
    expect(bool.type).toBe('booleanGroup3d');
    expect(bool.isGroup).toBe(true);
    expect(bool.containerRole).toBe('boolean');
    // The boolean group sits under the SAME scene group.
    expect(bool.parentId).toBe(gid);
    // Operands were reparented under the boolean group.
    expect(engine.getLayerById(o1).parentId).toBe(bid);
    expect(engine.getLayerById(o2).parentId).toBe(bid);
    // Roles seeded: first solid, rest hole (a meaningful subtract).
    expect(engine.getLayerById(o1).params.role).toBe('solid');
    expect(engine.getLayerById(o2).params.role).toBe('hole');
    // (d) compositor still renders.
    compose(engine);
    const grp = engine.getLayerById(gid);
    expect(grp.scenePaths.length).toBeGreaterThan(0);
    // The boolean group is collected (its operand ids appear as group children).
    // Compose walks descendants → both operands consumed.
    expect(engine.getLayerById(o1)._sceneConsumed).toBe(true);
    expect(engine.getLayerById(o2)._sceneConsumed).toBe(true);
  });

  test('(c) dragging an object OUT of a boolean group restores role solid and reparents to the scene group', () => {
    const engine = freshEngine();
    const gid = engine.addSceneGroup();
    const o1 = engine.addObjectToScene(gid);
    const o2 = engine.addObjectToScene(gid);
    const bid = engine.createBooleanGroupFromSelection([o1, o2]);
    expect(engine.getLayerById(o2).params.role).toBe('hole');

    // Drag o2 back out to the scene group.
    const ok = engine.setObjectLayerParent(o2, gid);
    expect(ok).toBe(true);
    expect(engine.getLayerById(o2).parentId).toBe(gid);
    expect(engine.getLayerById(o2).params.role).toBe('solid');

    // Dragging an object INTO the boolean seeds a hole role (it already holds o1).
    const o3 = engine.addObjectToScene(gid);
    engine.setObjectLayerParent(o3, bid);
    expect(engine.getLayerById(o3).parentId).toBe(bid);
    expect(engine.getLayerById(o3).params.role).toBe('hole');

    // (d) compositor still renders.
    compose(engine);
    expect(engine.getLayerById(gid).scenePaths.length).toBeGreaterThan(0);
  });

  test('createBooleanGroupFromSelection with fewer than two object3d returns null', () => {
    const engine = freshEngine();
    const gid = engine.addSceneGroup();
    const o1 = engine.addObjectToScene(gid);
    expect(engine.createBooleanGroupFromSelection([o1])).toBeNull();
    expect(engine.createBooleanGroupFromSelection([])).toBeNull();
  });
});
