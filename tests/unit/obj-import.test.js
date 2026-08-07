const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * OBJ import (v1) — Vectura.ObjImport.parse(text, fileName) turns Wavefront OBJ
 * text into the SAME { vertices:[{x,y,z}], faces:[[i,j,k]], name } mesh shape the
 * STL parser emits and createSolidMesh's importedMesh branch consumes:
 *   - 1-based OBJ vertex indices → 0-based face indices
 *   - n-gon faces fan-triangulated (a quad → two triangles)
 *   - `f a/b/c`, `a//c`, `a/b` slash forms use the vertex index only
 *   - comments (#) / blank lines / vt / vn / usemtl ignored
 *   - negative (relative) indices resolve against vertices seen so far
 *
 * RGR — Vectura.ObjImport does not exist before this feature, so this file fails
 * on the base branch.
 */

// A tetrahedron: 4 verts, 4 triangular faces (already triangles).
const TETRA_OBJ = `# tetra
v 1 1 1
v -1 -1 1
v -1 1 -1
v 1 -1 -1
f 1 2 3
f 1 4 2
f 1 3 4
f 2 4 3
`;

// A cube: 8 verts, 6 QUAD faces → fan-triangulated to 12 triangles.
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

describe('OBJ import — Vectura.ObjImport.parse', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  test('parses a tetrahedron: 4 verts, 4 triangle faces, 0-based indices', () => {
    const mesh = V.ObjImport.parse(TETRA_OBJ, 'tetra.obj');
    expect(mesh.vertices.length).toBe(4);
    expect(mesh.faces.length).toBe(4);
    expect(mesh.name).toBe('tetra');
    // Vertices are {x,y,z} objects in file space (not normalised here).
    expect(mesh.vertices[0]).toEqual({ x: 1, y: 1, z: 1 });
    // 1-based OBJ `f 1 2 3` → 0-based [0,1,2].
    expect(mesh.faces[0]).toEqual([0, 1, 2]);
    expect(mesh.faces[3]).toEqual([1, 3, 2]);
    // Every face index is valid.
    mesh.faces.forEach((f) => f.forEach((idx) => {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(mesh.vertices.length);
    }));
  });

  test('fan-triangulates n-gon (quad) cube faces: 8 verts, 12 triangles', () => {
    const mesh = V.ObjImport.parse(CUBE_OBJ, 'cube.obj');
    expect(mesh.vertices.length).toBe(8);
    expect(mesh.faces.length).toBe(12); // 6 quads → 12 tris
    mesh.faces.forEach((f) => expect(f.length).toBe(3));
    // `f 1 2 3 4` (0-based 0,1,2,3) → fan (0,1,2) + (0,2,3).
    expect(mesh.faces[0]).toEqual([0, 1, 2]);
    expect(mesh.faces[1]).toEqual([0, 2, 3]);
  });

  test('handles slash forms and ignores vt/vn/usemtl/comments/blank lines', () => {
    const obj = [
      '# a triangle with texcoords + normals',
      'mtllib foo.mtl',
      'o thing',
      'v 0 0 0',
      'vt 0 0',
      'v 1 0 0',
      'vt 1 0',
      'v 0 1 0',
      'vn 0 0 1',
      '',
      'usemtl red',
      's off',
      'f 1/1/1 2/2/1 3//1',
    ].join('\n');
    const mesh = V.ObjImport.parse(obj, 'x.obj');
    expect(mesh.vertices.length).toBe(3);
    expect(mesh.faces.length).toBe(1);
    expect(mesh.faces[0]).toEqual([0, 1, 2]);
    expect(mesh.name).toBe('thing'); // from `o`
  });

  test('resolves negative (relative) face indices against verts seen so far', () => {
    const obj = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n';
    const mesh = V.ObjImport.parse(obj, 'neg.obj');
    expect(mesh.faces[0]).toEqual([0, 1, 2]);
  });

  test('throws on OBJ with no faces', () => {
    expect(() => V.ObjImport.parse('v 0 0 0\nv 1 0 0\n', 'noface.obj')).toThrow();
  });
});
