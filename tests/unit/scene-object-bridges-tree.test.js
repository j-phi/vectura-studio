/**
 * Scene-tree object-bridge regressions — the ctxbar/renderer bridges that read
 * or write per-object state must work on BOTH a real scene TREE (a scene GROUP
 * whose objects live on CHILD object3d layers) AND a legacy inline monolith
 * (objects in `layer.params.objects[]`).
 *
 * Historically each of these resolved its targets through `_sceneObjects(layer)`
 * (inline-only, empty on a tree), so on a scene tree they no-op'd or corrupted
 * the tree by reassigning/pushing `params.objects`. The fix routes per-object
 * reads/writes through the child-aware `_sceneObjectById`, and ADD/REMOVE
 * operations through the engine's child-layer paths (removeLayer / duplicateLayer).
 *
 * Covers: visibility toggle, delete, duplicate, drop-to-ground, ground-drag
 * apply, and the flyout field writer (setSceneObjectField) — each on a tree and
 * with a monolith-parity assertion.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('scene-tree object bridges', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // A real scene TREE: a scene group + N child object3d layers.
  const buildTree = (count = 2) => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneGroup();
    const childIds = [];
    for (let i = 0; i < count; i++) childIds.push(engine.addObjectToScene(gid, 'box'));
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { pushHistory: () => {}, render: () => {}, history: [{}, {}] };
    engine.generate = () => {}; // isolate from the scene3d algorithm
    return { engine, renderer, gid, childIds };
  };

  // A legacy inline monolith: one scene3d LEAF with params.objects[].
  const buildMonolith = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const layer = new V.Layer('scene-mono', 'scene3d', 'Scene');
    layer.isGroup = false;
    layer.params = layer.params || {};
    layer.params.objects = [
      { id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 5, z: 0 }, visibility: 'solid' },
      { id: 'obj-2', name: 'Box 2', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 20, y: 5, z: 0 }, visibility: 'solid' },
    ];
    engine.layers.push(layer);
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { pushHistory: () => {}, render: () => {}, history: [{}, {}] };
    engine.generate = () => {};
    return { engine, renderer, layer };
  };

  // ── 1. visibility toggle ────────────────────────────────────────────────
  test('TREE: setSceneObjectVisibility flips child.params.visibility', () => {
    const { engine, renderer, gid, childIds } = buildTree(1);
    const child = engine.getLayerById(childIds[0]);
    expect(child.params.visibility === 'xray').toBe(false);
    const ok = renderer.setSceneObjectVisibility(gid, [childIds[0]]);
    expect(ok).toBe(true);
    expect(engine.getLayerById(childIds[0]).params.visibility).toBe('xray');
    renderer.setSceneObjectVisibility(gid, [childIds[0]]);
    expect(engine.getLayerById(childIds[0]).params.visibility).toBe('solid');
    // No phantom inline object leaks onto the group.
    expect(engine.getLayerById(gid).params.objects || []).toEqual([]);
  });

  test('MONOLITH: setSceneObjectVisibility flips the inline object (parity)', () => {
    const { renderer, layer } = buildMonolith();
    const ok = renderer.setSceneObjectVisibility(layer.id, ['obj-1']);
    expect(ok).toBe(true);
    expect(layer.params.objects[0].visibility).toBe('xray');
  });

  // ── 2. delete ───────────────────────────────────────────────────────────
  test('TREE: deleteSceneObjects removes the child object3d LAYER, group stays', () => {
    const { engine, renderer, gid, childIds } = buildTree(2);
    const ok = renderer.deleteSceneObjects(gid, [childIds[0]]);
    expect(ok).toBe(true);
    expect(engine.getLayerById(childIds[0])).toBeFalsy();
    expect(engine.getLayerById(childIds[1])).toBeTruthy();
    // Group survives (still had a second child) and never grew a phantom array.
    expect(engine.getLayerById(gid)).toBeTruthy();
    expect(engine.getLayerById(gid).params.objects || []).toEqual([]);
  });

  test('MONOLITH: deleteSceneObjects filters the inline array (parity)', () => {
    const { renderer, layer } = buildMonolith();
    const ok = renderer.deleteSceneObjects(layer.id, ['obj-1']);
    expect(ok).toBe(true);
    expect(layer.params.objects.map((o) => o.id)).toEqual(['obj-2']);
  });

  // ── 3. duplicate ────────────────────────────────────────────────────────
  test('TREE: duplicateSceneObjects clones a child object3d layer under the same group', () => {
    const { engine, renderer, gid, childIds } = buildTree(1);
    const before = engine.getLayerChildren(gid).filter((c) => c.type === 'object3d').length;
    const newIds = renderer.duplicateSceneObjects(gid, [childIds[0]]);
    expect(Array.isArray(newIds) && newIds.length).toBe(1);
    const clone = engine.getLayerById(newIds[0]);
    expect(clone).toBeTruthy();
    expect(clone.type).toBe('object3d');
    expect(clone.parentId).toBe(gid);
    expect(clone.id).not.toBe(childIds[0]);
    const after = engine.getLayerChildren(gid).filter((c) => c.type === 'object3d').length;
    expect(after).toBe(before + 1);
    // Copy is nudged so it is visible beside the original.
    expect(clone.params.transform.x).toBe(10);
    expect(clone.params.transform.z).toBe(10);
    // No phantom inline object leaks onto the group.
    expect(engine.getLayerById(gid).params.objects || []).toEqual([]);
  });

  test('MONOLITH: duplicateSceneObjects pushes an inline copy (parity)', () => {
    const { renderer, layer } = buildMonolith();
    const newIds = renderer.duplicateSceneObjects(layer.id, ['obj-1']);
    expect(newIds.length).toBe(1);
    expect(layer.params.objects.length).toBe(3);
    const copy = layer.params.objects.find((o) => o.id === newIds[0]);
    expect(copy.transform.x).toBe(10);
  });

  // ── 4. drop-to-ground ───────────────────────────────────────────────────
  test('TREE: dropSceneObjectsToGround writes child.params.transform.y = 0', () => {
    const { engine, renderer, gid, childIds } = buildTree(1);
    const child = engine.getLayerById(childIds[0]);
    child.params.transform = { x: 3, y: 42, z: 7 };
    const ok = renderer.dropSceneObjectsToGround(gid, [childIds[0]]);
    expect(ok).toBe(true);
    expect(engine.getLayerById(childIds[0]).params.transform.y).toBe(0);
  });

  test('MONOLITH: dropSceneObjectsToGround writes the inline transform (parity)', () => {
    const { renderer, layer } = buildMonolith();
    const ok = renderer.dropSceneObjectsToGround(layer.id, ['obj-1']);
    expect(ok).toBe(true);
    expect(layer.params.objects[0].transform.y).toBe(0);
  });

  // ── 5. ground-drag apply ────────────────────────────────────────────────
  test('TREE: ground-drag apply mutates child.params.transform', () => {
    const { engine, renderer, gid, childIds } = buildTree(1);
    const child = engine.getLayerById(childIds[0]);
    child.params.transform = { x: 0, y: 0, z: 0 };
    // Stub the canvas/screen plumbing the drag reads.
    renderer.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }), style: {} };
    renderer.scale = 1;
    renderer.setCanvasCursor = () => {};
    renderer.screenToWorld = (x, y) => ({ x, y });
    renderer.snapPointToGrid = (p) => p;
    renderer.getModifierState = () => ({ shift: false });
    renderer.showDragTooltip = () => {};
    renderer._scheduleSceneDragRegen = () => {};
    renderer._beginSceneGroundDrag(engine.getLayerById(gid), [childIds[0]], { x: 0, y: 0 });
    expect(renderer._sceneDrag).toBeTruthy();
    renderer._applySceneGroundDrag({ clientX: 50, clientY: 0 });
    const t = engine.getLayerById(childIds[0]).params.transform;
    expect(t.x).not.toBe(0); // moved along the ground plane
  });

  // ── 6. flyout field writer ──────────────────────────────────────────────
  test('TREE: setSceneObjectField writes a dotted path on the child object def', () => {
    const { engine, renderer, gid, childIds } = buildTree(1);
    const ok = renderer.setSceneObjectField(gid, [childIds[0]], 'shadow.enabled', false);
    expect(ok).toBe(true);
    expect(engine.getLayerById(childIds[0]).params.shadow.enabled).toBe(false);
  });

  test('MONOLITH: setSceneObjectField writes the inline object (parity)', () => {
    const { renderer, layer } = buildMonolith();
    const ok = renderer.setSceneObjectField(layer.id, ['obj-1'], 'border.strength', 3);
    expect(ok).toBe(true);
    expect(layer.params.objects[0].border.strength).toBe(3);
  });
});
