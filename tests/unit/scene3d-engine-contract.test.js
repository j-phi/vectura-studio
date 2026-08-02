const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * CONTRACT E — engine integration for scene3d (Phase 1 stream 1A).
 *
 * - addLayer('scene3d') + generate produces paths through the real engine.
 * - duplicateLayer routes params through cloneLayerParams: params.assets is
 *   shared BY REFERENCE, everything else (objects[]) is deep-copied.
 * - exportState/importState round-trips the scene.
 * - sanitizeImportedParams clamps garbage (NaN transforms → finite; missing
 *   camera/styleTable/lights shapes restored).
 */

describe('scene3d engine contract (CONTRACT E)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  test('addLayer(scene3d) generates paths through the engine', () => {
    const engine = new V.VectorEngine();
    const id = engine.addLayer('scene3d');
    const layer = engine.getLayerById(id);
    expect(layer).toBeTruthy();
    expect(layer.type).toBe('scene3d');
    engine.generate(id);
    expect(Array.isArray(layer.paths)).toBe(true);
    expect(layer.paths.length).toBeGreaterThan(0);
    // I11: new objects default to the WIREFRAME mapper, which emits structural
    // EDGES (silhouette/crease/…) and no per-face outline fills (sceneFace).
    expect(layer.paths.some((p) => p.meta && p.meta.kind === 'sceneEdge')).toBe(true);
  });

  test('duplicateLayer shares params.assets by ref and deep-copies objects[]', () => {
    const engine = new V.VectorEngine();
    const id = engine.addLayer('scene3d');
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
    const id = engine.addLayer('scene3d');
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
    expect(restored.params.sceneVersion).toBe(1);
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
    const id = engine.addLayer('scene3d');
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
    const id = engine.addLayer('scene3d');
    const state = engine.exportState();
    const entry = state.layers.find((l) => l.id === id);
    entry.params.objects.push({ ...entry.params.objects[0] }); // duplicate 'obj-1'
    const engine2 = new V.VectorEngine();
    engine2.importState(state);
    const ids = engine2.getLayerById(id).params.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
