const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * CONTRACT E — engine integration for scene3d (Phase 1 stream 1A), updated for
 * Scene-tree Increment D.
 *
 * - Add Layer "3D Scene" (addLayer('scene3d')) now builds a scene TREE: a scene
 *   GROUP (isGroup + containerRole 'scene') seeded with ONE default object3d
 *   child. The group composes + renders it (meta.sceneTarget.objectId === child
 *   layer id).
 * - The MONOLITH shape (inline params.objects[]) survives only as a load-time
 *   form for saved docs; it is built directly here (addMonolith) to keep the
 *   duplicate / export / sanitize coverage that exercises it.
 */

// Build a MONOLITH scene3d layer directly (the load-time / saved-doc shape,
// no longer produced by addLayer). Mirrors the pre-Increment-D add path.
const addMonolith = (V, engine) => {
  const layer = new V.Layer('mono-1', 'scene3d', 'Scene Monolith');
  engine.layers.push(layer);
  engine.activeLayerId = layer.id;
  engine.generate(layer.id);
  return layer.id;
};

describe('scene3d engine contract (CONTRACT E)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  test('Add Layer 3D Scene builds a scene TREE (group + one object3d child)', () => {
    const engine = new V.VectorEngine();
    const id = engine.addLayer('scene3d');
    const group = engine.getLayerById(id);
    expect(group).toBeTruthy();
    // The returned layer is the scene GROUP (the three compositor invariants).
    expect(group.type).toBe('scene3d');
    expect(group.isGroup).toBe(true);
    expect(group.containerRole).toBe('scene');
    // Seeded with exactly one default object3d child, carrying a real pen.
    const children = engine.getLayerChildren(id).filter((l) => l.type === 'object3d');
    expect(children.length).toBe(1);
    expect(children[0].penId).toBeTruthy();
    // Inline arrays are empty — child layers are the single source of truth.
    expect(group.params.objects).toEqual([]);
    // The group composes + renders the child as WIREFRAME edges; every emitted
    // path targets the CHILD LAYER id (identity contract, no lookup table).
    engine.computeAllDisplayGeometry();
    const paths = engine.getRenderablePaths(group);
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.meta && p.meta.kind === 'sceneEdge')).toBe(true);
    expect(paths.some((p) => p.meta && p.meta.sceneTarget
      && p.meta.sceneTarget.objectId === children[0].id)).toBe(true);
  });

  test('a monolith scene3d layer still generates paths (saved-doc load shape)', () => {
    const engine = new V.VectorEngine();
    const id = addMonolith(V, engine);
    const layer = engine.getLayerById(id);
    expect(layer.type).toBe('scene3d');
    expect(layer.isGroup).toBeFalsy();
    engine.generate(id);
    expect(Array.isArray(layer.paths)).toBe(true);
    expect(layer.paths.length).toBeGreaterThan(0);
    expect(layer.paths.some((p) => p.meta && p.meta.kind === 'sceneEdge')).toBe(true);
  });

  test('expandMonolithToTree converts a monolith into an equivalent scene tree', () => {
    // A monolith with two boxes renders; expanding it to a tree renders the
    // SAME object silhouettes (paths still target the same object ids).
    const engine = new V.VectorEngine();
    const id = addMonolith(V, engine);
    const layer = engine.getLayerById(id);
    layer.params.objects.push({
      id: 'obj-2', name: 'Box 2', primitive: 'box',
      params: { sx: 20, sy: 20, sz: 20 },
      transform: { x: 60, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid',
    });
    engine.generate(id);
    const beforeIds = new Set(engine.getRenderablePaths(layer)
      .map((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId)
      .filter(Boolean));

    const groupId = engine.expandMonolithToTree(id);
    expect(groupId).toBe(id);
    const group = engine.getLayerById(id);
    expect(group.isGroup).toBe(true);
    expect(group.containerRole).toBe('scene');
    expect(group.params.objects).toEqual([]);
    const children = engine.getLayerChildren(id).filter((l) => l.type === 'object3d');
    expect(children.map((c) => c.id).sort()).toEqual(['obj-1', 'obj-2']);
    engine.computeAllDisplayGeometry();
    const afterIds = new Set(engine.getRenderablePaths(group)
      .map((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId)
      .filter(Boolean));
    // The same object ids are still present in the composed render.
    beforeIds.forEach((oid) => expect(afterIds.has(oid)).toBe(true));
    // Idempotent — expanding an already-expanded tree is a no-op.
    expect(engine.expandMonolithToTree(id)).toBeNull();
  });

  test('duplicateLayer shares params.assets by ref and deep-copies objects[]', () => {
    const engine = new V.VectorEngine();
    const id = addMonolith(V, engine);
    const layer = engine.getLayerById(id);
    layer.params.assets.tex1 = { hash: 'abc', data: [1, 2, 3] };
    layer.params.objects.push({
      id: 'obj-2', name: 'Box 2', primitive: 'box',
      params: { sx: 10, sy: 10, sz: 10 },
      transform: { x: 50, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid',
    });
    const dup = engine.duplicateLayer(id);
    expect(dup).toBeTruthy();
    // Asset table: shared reference (content-hashed table lives outside clones).
    expect(dup.params.assets).toBe(layer.params.assets);
    // Scene graph: deep copy, not shared.
    expect(dup.params.objects).not.toBe(layer.params.objects);
    expect(dup.params.objects).toEqual(layer.params.objects);
    dup.params.objects[0].transform.x = 999;
    expect(layer.params.objects[0].transform.x).not.toBe(999);
  });

  test('exportState/importState round-trips the scene', () => {
    const engine = new V.VectorEngine();
    const id = addMonolith(V, engine);
    const layer = engine.getLayerById(id);
    layer.params.objects[0].transform.yaw = 33;
    layer.params.objects.push({
      id: 'obj-2', name: 'Sphere 1', primitive: 'sphere',
      params: { radius: 15, detail: 12 },
      transform: { x: -40, y: 10, z: 5, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'xray',
    });
    layer.params.camera.yaw = -55;
    layer.params.styleTable.byObject['obj-2'] = { penId: 'pen-3', mapper: 'hatch', params: { fillAngle: 30, fillDensity: 60 } };

    const state = engine.exportState();
    const engine2 = new V.VectorEngine();
    engine2.importState(state);
    const restored = engine2.getLayerById(id);
    expect(restored).toBeTruthy();
    expect(restored.params.sceneVersion).toBe(V.Scene3D.Params.SCENE_VERSION);
    // Round-trip == normalization: import canonicalizes the scene (e.g. Phase 5
    // back-fills each object's `shadow: { enabled: null }`), so compare against
    // the normalized source rather than the raw, pre-normalized layer params.
    expect(restored.params.objects).toEqual(V.Scene3D.Params.normalizeParams(layer.params).objects);
    expect(restored.params.camera.yaw).toBe(-55);
    expect(restored.params.styleTable.byObject['obj-2']).toEqual(
      layer.params.styleTable.byObject['obj-2']);
  });

  test('sanitizeImportedParams clamps garbage scene params on import', () => {
    const engine = new V.VectorEngine();
    const id = addMonolith(V, engine);
    const state = engine.exportState();
    const entry = state.layers.find((l) => l.id === id);
    entry.params.objects[0].transform.x = NaN;
    entry.params.objects[0].transform.scale = Infinity;
    entry.params.camera = 'garbage';
    entry.params.styleTable = null;
    entry.params.lights = 'nope';
    entry.params.objects.push(null);

    const engine2 = new V.VectorEngine();
    engine2.importState(state);
    const restored = engine2.getLayerById(id);
    const p = restored.params;
    expect(Number.isFinite(p.objects[0].transform.x)).toBe(true);
    expect(Number.isFinite(p.objects[0].transform.scale)).toBe(true);
    expect(p.objects[0].transform.scale).toBeGreaterThan(0);
    expect(p.camera && typeof p.camera).toBe('object');
    expect(Number.isFinite(p.camera.yaw)).toBe(true);
    expect(p.styleTable && typeof p.styleTable).toBe('object');
    expect(p.styleTable.scene).toBeTruthy();
    expect(p.styleTable.byObject && typeof p.styleTable.byObject).toBe('object');
    expect(Array.isArray(p.lights)).toBe(true);
    // The null object entry is dropped, not kept as a hole.
    expect(p.objects.every((obj) => obj && typeof obj === 'object')).toBe(true);
    // And the sanitized layer still generates.
    engine2.generate(id);
    expect(restored.paths.length).toBeGreaterThan(0);
  });

  test('object ids are kept unique after import (duplicate ids reassigned)', () => {
    const engine = new V.VectorEngine();
    const id = addMonolith(V, engine);
    const state = engine.exportState();
    const entry = state.layers.find((l) => l.id === id);
    entry.params.objects.push({ ...entry.params.objects[0] }); // duplicate 'obj-1'
    const engine2 = new V.VectorEngine();
    engine2.importState(state);
    const ids = engine2.getLayerById(id).params.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
