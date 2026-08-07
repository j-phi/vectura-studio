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
});
