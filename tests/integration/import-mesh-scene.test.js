const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * 3D model import — engine.importMeshAsScene(mesh, name) wraps a parsed OBJ/STL
 * mesh ({ vertices:[{x,y,z}], faces:[[i,…]] }) as a scene object3d `solid` whose
 * solidType is `importedMesh`, rendered by the shared 3D compositor. Landing rule:
 *   - no active scene → a NEW scene tree (group + sun light + ground child)
 *   - active scene (or active layer inside one) → the mesh is ADDED as a child
 *
 * RGR — importMeshAsScene / Vectura.ObjImport do not exist before this feature.
 */

const CUBE_OBJ = `# cube
v -1 -1 -1
v  1 -1 -1
v  1  1 -1
v -1  1 -1
v -1 -1  1
v  1 -1  1
v  1  1  1
v -1  1  1
f 1 2 3 4
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;

// A tetrahedron as binary STL, to exercise the reused STL loader.
const TET_TRIS = [
  [[1, 1, 1], [-1, -1, 1], [-1, 1, -1]],
  [[1, 1, 1], [1, -1, -1], [-1, -1, 1]],
  [[1, 1, 1], [-1, 1, -1], [1, -1, -1]],
  [[-1, -1, 1], [1, -1, -1], [-1, 1, -1]],
];
const buildBinaryStl = (triangles) => {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);
  let o = 84;
  triangles.forEach((tri) => {
    o += 12;
    tri.forEach((vtx) => {
      view.setFloat32(o, vtx[0], true);
      view.setFloat32(o + 4, vtx[1], true);
      view.setFloat32(o + 8, vtx[2], true);
      o += 12;
    });
    o += 2;
  });
  return buffer;
};

describe('Import 3D model as scene object', () => {
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
  const sceneGroups = (engine) =>
    engine.layers.filter((l) => l && l.type === 'scene3d' && l.isGroup);

  // ── (a) OBJ parse → importMeshAsScene builds a NEW scene tree that renders. ──
  test('(a) importing an OBJ mesh creates a scene group + one importedMesh object that renders', () => {
    const engine = freshEngine();
    const mesh = V.ObjImport.parse(CUBE_OBJ, 'cube.obj');
    expect(mesh.vertices.length).toBe(8);
    expect(mesh.faces.length).toBe(12);

    const result = engine.importMeshAsScene(mesh, mesh.name);
    expect(result.ok).toBe(true);
    expect(result.addedToExisting).toBe(false);

    // Exactly one scene group, holding one object3d importedMesh child …
    const groups = sceneGroups(engine);
    expect(groups.length).toBe(1);
    const group = groups[0];
    expect(group.id).toBe(result.groupId);
    const kids = engine.getLayerDescendants(group.id);
    const objects = kids.filter((l) => l.type === 'object3d');
    expect(objects.length).toBe(1);
    const child = objects[0];
    expect(child.id).toBe(result.childId);
    expect(child.params.primitive).toBe('solid');
    expect(child.params.params.solidType).toBe('importedMesh');
    expect(child.params.params.importedMesh.vertices.length).toBe(8);
    expect(child.params.params.importedMesh.faces.length).toBe(12);
    expect(child.params.params.radius).toBeGreaterThan(0);
    // Unit-normalised: every vert sits within the unit sphere.
    child.params.params.importedMesh.vertices.forEach((v) => {
      expect(Math.hypot(v.x, v.y, v.z)).toBeLessThanOrEqual(1.0001);
    });

    // … plus a seeded sun light + ground child.
    expect(kids.some((l) => l.type === 'sceneLight3d')).toBe(true);
    expect(kids.some((l) => l.type === 'sceneGround3d')).toBe(true);

    // It renders through the compositor (non-empty composed paths).
    engine.computeAllDisplayGeometry();
    expect(Array.isArray(group.scenePaths)).toBe(true);
    expect(group.scenePaths.length).toBeGreaterThan(0);
    // The imported object is the active/selected layer.
    expect(engine.activeLayerId).toBe(result.childId);
  });

  // ── (b) Active scene → the mesh is ADDED as a child (no second scene). ───────
  test('(b) importing into an active scene adds a child object, not a new scene', () => {
    const engine = freshEngine();
    const groupId = engine.addSceneTree(); // scene group active
    const before = engine.getLayerDescendants(groupId).filter((l) => l.type === 'object3d').length;
    engine.activeLayerId = groupId;

    const mesh = V.ObjImport.parse(CUBE_OBJ, 'cube.obj');
    const result = engine.importMeshAsScene(mesh, mesh.name);
    expect(result.ok).toBe(true);
    expect(result.addedToExisting).toBe(true);
    expect(result.groupId).toBe(groupId);

    // Still exactly one scene group; the object count grew by one.
    expect(sceneGroups(engine).length).toBe(1);
    const objects = engine.getLayerDescendants(groupId).filter((l) => l.type === 'object3d');
    expect(objects.length).toBe(before + 1);
    const child = engine.getLayerById(result.childId);
    expect(child.parentId).toBe(groupId);
    expect(child.params.params.solidType).toBe('importedMesh');

    engine.computeAllDisplayGeometry();
    const group = engine.getLayerById(groupId);
    expect(group.scenePaths.length).toBeGreaterThan(0);
  });

  // ── (b2) Active layer INSIDE a scene also lands the import in that scene. ────
  test('(b2) importing while a scene child is active adds to the enclosing scene', () => {
    const engine = freshEngine();
    const groupId = engine.addSceneTree();
    const anObject = engine.getLayerDescendants(groupId).find((l) => l.type === 'object3d');
    engine.activeLayerId = anObject.id; // a child, not the group

    const mesh = V.ObjImport.parse(CUBE_OBJ, 'cube.obj');
    const result = engine.importMeshAsScene(mesh, mesh.name);
    expect(result.addedToExisting).toBe(true);
    expect(result.groupId).toBe(groupId);
    expect(sceneGroups(engine).length).toBe(1);
  });

  // ── (c) The reused STL loader feeds importMeshAsScene the same way. ──────────
  test('(c) an STL-parsed mesh imports as a scene object that renders', () => {
    const engine = freshEngine();
    const mesh = V.StlParser.parse(buildBinaryStl(TET_TRIS), 'tetra.stl');
    expect(mesh.vertices.length).toBe(4);
    const result = engine.importMeshAsScene(mesh, mesh.name);
    expect(result.ok).toBe(true);
    const child = engine.getLayerById(result.childId);
    expect(child.params.params.solidType).toBe('importedMesh');
    engine.computeAllDisplayGeometry();
    const group = engine.getLayerById(result.groupId);
    expect(group.scenePaths.length).toBeGreaterThan(0);
  });

  // ── (d) An empty/invalid mesh is rejected without building anything. ─────────
  test('(d) an empty mesh is rejected', () => {
    const engine = freshEngine();
    const result = engine.importMeshAsScene({ vertices: [], faces: [] }, 'empty');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty');
    expect(sceneGroups(engine).length).toBe(0);
  });

  /*
   * ── Regressions (2026-08-07 adversarial review of the import feature) ───────
   * Each of these FAILED on 1d7e951:
   *   D3  ground   — transform.y was 0, so an imported cube spanned world Y
   *                  [-23.1, +23.1] with half of it below the ground quad
   *   D2  budget   — no face cap on the OBJ path; a 25,600-tri mesh was stored
   *                  whole and took 116,439 ms of synchronous compose
   *   D4  history  — params.params.importedMesh was missed by the ref-skip, so
   *                  the whole mesh was JSON deep-cloned into every snapshot
   */

  // D3 — the mesh rests ON the ground, base at y = 0.
  test('D3: an imported mesh sits on the ground, not half-buried in it', () => {
    const engine = freshEngine();
    const mesh = V.ObjImport.parse(CUBE_OBJ, 'cube.obj');
    const result = engine.importMeshAsScene(mesh, mesh.name);
    const child = engine.getLayerById(result.childId);
    const { importedMesh, radius } = child.params.params;
    const ty = child.params.transform.y;

    let minY = Infinity;
    let maxY = -Infinity;
    importedMesh.vertices.forEach((v) => {
      const worldY = v.y * radius + ty;
      if (worldY < minY) minY = worldY;
      if (worldY > maxY) maxY = worldY;
    });
    // Base ON the ground plane (y = 0), whole body above it.
    expect(minY).toBeCloseTo(0, 2);
    expect(maxY).toBeGreaterThan(0);
    // The lift is exactly the mesh's post-scale half-height.
    expect(ty).toBeGreaterThan(0);
    expect(ty).toBeCloseTo(maxY / 2, 2);
  });

  test('D3: the lift tracks the mesh, so an asymmetric mesh also rests on y=0', () => {
    // A wedge whose centre is NOT its base: verts span y ∈ [-1, 3].
    const WEDGE = [
      'v -1 -1 -1', 'v 1 -1 -1', 'v 1 -1 1', 'v -1 -1 1', 'v 0 3 0',
      'f 1 2 3 4', 'f 1 2 5', 'f 2 3 5', 'f 3 4 5', 'f 4 1 5',
    ].join('\n') + '\n';
    const engine = freshEngine();
    const result = engine.importMeshAsScene(V.ObjImport.parse(WEDGE, 'wedge.obj'), 'wedge');
    const child = engine.getLayerById(result.childId);
    const { importedMesh, radius } = child.params.params;
    const ty = child.params.transform.y;
    const minY = Math.min(...importedMesh.vertices.map((v) => v.y * radius + ty));
    expect(minY).toBeCloseTo(0, 2);
  });

  // D2 — the OBJ path honours the same face budget as the STL path.
  // NOTE: this drives the reduction through buildImportedMeshParams (via
  // importMeshAsScene) with a SMALL explicit budget so the assertion is about
  // the cap, not about composing a 12k-face mesh — see the unit test in
  // tests/unit/stl-import.test.js for the decimator's own contract.
  test('D2: a huge OBJ mesh is capped to StlParser.MAX_FACES before it is stored', () => {
    const MAX = V.StlParser.MAX_FACES;
    // A UV sphere with comfortably more than MAX triangles.
    const segs = 180;
    const rings = 90; // 2 * 180 * 90 = 32,400 tris
    const P = (u, v) => {
      const th = u * Math.PI * 2;
      const ph = v * Math.PI;
      return [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
    };
    const lines = [];
    let n = 1;
    for (let i = 0; i < segs; i += 1) {
      for (let j = 0; j < rings; j += 1) {
        const quad = [P(i / segs, j / rings), P((i + 1) / segs, j / rings),
          P((i + 1) / segs, (j + 1) / rings), P(i / segs, (j + 1) / rings)];
        [[0, 1, 2], [0, 2, 3]].forEach((tri) => {
          tri.forEach((k) => lines.push(`v ${quad[k][0].toFixed(5)} ${quad[k][1].toFixed(5)} ${quad[k][2].toFixed(5)}`));
          lines.push(`f ${n} ${n + 1} ${n + 2}`);
          n += 3;
        });
      }
    }
    const mesh = V.ObjImport.parse(lines.join('\n') + '\n', 'huge.obj');
    expect(mesh.faces.length).toBeGreaterThan(MAX);

    const engine = freshEngine();
    const result = engine.importMeshAsScene(mesh, 'huge');
    const stored = engine.getLayerById(result.childId).params.params.importedMesh;
    expect(stored.faces.length).toBeLessThanOrEqual(MAX);
    // The caller learns both counts so the UI can say it was reduced.
    expect(result.faces).toBe(stored.faces.length);
    expect(result.sourceFaces).toBe(mesh.faces.length);
    expect(result.sourceFaces).toBeGreaterThan(result.faces);
    // Every surviving index still addresses a stored vertex (the reducer prunes
    // orphans and re-indexes).
    stored.faces.forEach((f) => f.forEach((i) => {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(stored.vertices.length);
    }));
    // Still unit-normalised after the cap.
    stored.vertices.forEach((v) => {
      expect(Math.hypot(v.x, v.y, v.z)).toBeLessThanOrEqual(1.0001);
    });
  }, 240_000);

  test('D2: a mesh under the budget is stored whole (the cap is a no-op)', () => {
    const engine = freshEngine();
    const mesh = V.ObjImport.parse(CUBE_OBJ, 'cube.obj');
    const result = engine.importMeshAsScene(mesh, 'cube');
    const stored = engine.getLayerById(result.childId).params.params.importedMesh;
    expect(stored.faces.length).toBe(12);
    expect(result.faces).toBe(12);
    expect(result.sourceFaces).toBe(12);
  });

  // D4 — the nested mesh is shared by reference, never deep-cloned.
  test('D4: exportState shares the nested importedMesh by reference', () => {
    const engine = freshEngine();
    const mesh = V.ObjImport.parse(CUBE_OBJ, 'cube.obj');
    const result = engine.importMeshAsScene(mesh, 'cube');
    const child = engine.getLayerById(result.childId);
    const live = child.params.params.importedMesh;

    const snapshot = engine.exportState();
    const snapChild = snapshot.layers.find((l) => l.id === result.childId);
    // The SAME object, not a JSON deep copy — this is what keeps a 40k-face
    // import from duplicating megabytes into all 20 history slots.
    expect(snapChild.params.params.importedMesh).toBe(live);
    // …while the rest of the nested bag is still a real copy.
    expect(snapChild.params.params).not.toBe(child.params.params);
    snapChild.params.params.radius = 999;
    expect(child.params.params.radius).not.toBe(999);
  });

  test('D4: the top-level importedMesh ref-skip still works (topoform/polyhedron)', () => {
    const engine = freshEngine();
    const layerId = engine.addLayer('topoform');
    const layer = engine.getLayerById(layerId) || layerId;
    const meshBlob = { vertices: [{ x: 0, y: 0, z: 0 }], faces: [[0, 0, 0]] };
    layer.params.importedMesh = meshBlob;
    const snapshot = engine.exportState();
    const snapLayer = snapshot.layers.find((l) => l.id === layer.id);
    expect(snapLayer.params.importedMesh).toBe(meshBlob);
    expect(snapLayer.params).not.toBe(layer.params);
  });

  /*
   * ── D3b (2026-08-07 review of the D3 ground lift) ───────────────────────────
   * The lift was BAKED ONCE at import time from the post-scale half-height, so
   * the very first Radius or Scale drag left the object half-buried or floating.
   * `transform.groundLift` now records the lift folded into `transform.y`, and
   * the compose pass re-derives it from the CURRENT radius + vertical scale.
   */

  // The lowest world Y of the stored mesh under the object's own transform.
  const worldMinY = (child) => {
    const { importedMesh, radius } = child.params.params;
    const t = child.params.transform;
    const sy = Number.isFinite(t.sy) ? t.sy : (Number.isFinite(t.scale) ? t.scale : 1);
    return Math.min(...importedMesh.vertices.map((v) => v.y * radius * sy + t.y));
  };

  test('D3b: the ground rest survives a Radius change', () => {
    const engine = freshEngine();
    const result = engine.importMeshAsScene(V.ObjImport.parse(CUBE_OBJ, 'cube.obj'), 'cube');
    const child = engine.getLayerById(result.childId);
    expect(worldMinY(child)).toBeCloseTo(0, 2);

    // What the scene3d panel's Radius slider writes.
    child.params.params.radius = 90;
    engine.computeAllDisplayGeometry();
    expect(worldMinY(child)).toBeCloseTo(0, 2);

    child.params.params.radius = 21;
    engine.computeAllDisplayGeometry();
    expect(worldMinY(child)).toBeCloseTo(0, 2);
  });

  test('D3b: the ground rest survives a Scale change, uniform and per-axis', () => {
    const engine = freshEngine();
    const result = engine.importMeshAsScene(V.ObjImport.parse(CUBE_OBJ, 'cube.obj'), 'cube');
    const child = engine.getLayerById(result.childId);

    child.params.transform.scale = 2.5;
    engine.computeAllDisplayGeometry();
    expect(worldMinY(child)).toBeCloseTo(0, 2);

    // I23 per-axis scale: only the VERTICAL factor moves the base.
    child.params.transform.sx = 2.5;
    child.params.transform.sy = 0.4;
    child.params.transform.sz = 2.5;
    engine.computeAllDisplayGeometry();
    expect(worldMinY(child)).toBeCloseTo(0, 2);
  });

  test('D3b: a deliberate vertical offset rides along instead of being reset', () => {
    const engine = freshEngine();
    const result = engine.importMeshAsScene(V.ObjImport.parse(CUBE_OBJ, 'cube.obj'), 'cube');
    const child = engine.getLayerById(result.childId);
    // Shift-drag the object 30mm up off the ground.
    child.params.transform.y += 30;
    engine.computeAllDisplayGeometry();
    expect(worldMinY(child)).toBeCloseTo(30, 2);
    // Resizing keeps it 30mm clear rather than snapping it back down.
    child.params.params.radius = 90;
    engine.computeAllDisplayGeometry();
    expect(worldMinY(child)).toBeCloseTo(30, 2);
  });

  test('D3b: the marker survives an exportState/importState round-trip', () => {
    const engine = freshEngine();
    const result = engine.importMeshAsScene(V.ObjImport.parse(CUBE_OBJ, 'cube.obj'), 'cube');
    const lift = engine.getLayerById(result.childId).params.transform.groundLift;
    expect(Number.isFinite(lift)).toBe(true);

    const engine2 = new V.VectorEngine();
    engine2.importState(JSON.parse(JSON.stringify(engine.exportState())));
    const restored = engine2.getLayerById(result.childId);
    expect(restored.params.transform.groundLift).toBeCloseTo(lift, 3);
    restored.params.params.radius = 90;
    engine2.computeAllDisplayGeometry();
    expect(worldMinY(restored)).toBeCloseTo(0, 2);
  });

  /*
   * ── D5 (2026-08-07) — the convert-to-scene path shares the face budget ──────
   * The reduction/cap was applied on IMPORT only. Convert-to-Scene freezes a
   * baked mesh into the same `importedMesh` slot, and a topoform `cube` at full
   * detail bakes ~120k triangles — stored whole in layer.params and composed
   * synchronously. `downsample` returns the mesh object untouched below budget,
   * so every convert that already fitted is unchanged.
   */
  test('D5: convert-to-scene caps a frozen bake to the same face budget', () => {
    const MAX = V.StlParser.MAX_FACES;
    const engine = freshEngine();
    const layerId = engine.addLayer('topoform');
    const layer = engine.getLayerById(layerId);
    // `cube` has no live chart analog, so it takes the frozen importedMesh bake.
    layer.params.sourceMode = 'cube';
    layer.params.renderMode = 'wireframe';
    layer.params.primitiveDetail = 100;
    layer.params.simplifyMesh = 0;
    const baked = V.Algorithms.topoform.bakeMesh(layer.params);
    expect(baked.faces.length).toBeGreaterThan(MAX);

    const result = engine.convertAlgoToScene(layerId);
    expect(result.ok).toBe(true);
    const stored = engine.getLayerById(result.childId).params.params.importedMesh;
    expect(stored.faces.length).toBeLessThanOrEqual(MAX);
    stored.faces.forEach((f) => f.forEach((i) => {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(stored.vertices.length);
    }));
    // Still unit-normalised (radius carries the real size).
    stored.vertices.forEach((v) => {
      expect(Math.hypot(v.x, v.y, v.z)).toBeLessThanOrEqual(1.0001);
    });
  }, 240_000);
});
