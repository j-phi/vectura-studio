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

  /*
   * ── Regressions (2026-08-07 adversarial review of the import feature) ───────
   * Each of these FAILED on 1d7e951:
   *   D1  welding      — 4800 unshared verts for a 1600-tri sphere, 2894 scene
   *                      paths instead of 566 (every internal edge drawn)
   *   D5  tabs         — `v\t0\t0\t0` threw "OBJ parse: no faces found"
   *   D6a fabrication  — `f 1 99 3 4` produced [[0,2,3]], a triangle the file
   *                      never described
   *   D7  phantom vert — a malformed `v` pushed {0,0,0}, dragging the bbox
   *   D8d diagnostics  — "valid verts, all faces bad" was indistinguishable
   *                      from "unreadable file"
   */

  // D1 — vertices are welded through the SHARED StlParser welder.
  test('D1: welds co-located vertices so the mesh is connected, not triangle soup', () => {
    // Two triangles sharing an edge, written as UNWELDED soup (6 `v` records) —
    // exactly what an STL→OBJ conversion emits.
    const soup = [
      'v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3',
      'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'f 4 5 6',
    ].join('\n') + '\n';
    const mesh = V.ObjImport.parse(soup, 'soup.obj');
    // 6 `v` records → 4 unique positions.
    expect(mesh.vertices.length).toBe(4);
    expect(mesh.faces.length).toBe(2);
    // The shared edge is one pair of indices used by BOTH faces.
    const shared = mesh.faces[0].filter((i) => mesh.faces[1].includes(i));
    expect(shared.length).toBe(2);
    // Every index still addresses a real vertex.
    mesh.faces.forEach((f) => f.forEach((i) => {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(mesh.vertices.length);
    }));
  });

  test('D1: welding drops the triangles it collapses instead of emitting degenerates', () => {
    // The 2nd triangle has two co-located corners → degenerate once welded.
    const obj = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 1 0 0\nf 1 2 3\nf 2 4 3\n';
    const mesh = V.ObjImport.parse(obj, 'degen.obj');
    expect(mesh.vertices.length).toBe(3);
    expect(mesh.faces.length).toBe(1);
  });

  // D5 — any whitespace is a legal OBJ separator.
  test('D5: parses a tab-delimited OBJ', () => {
    const mesh = V.ObjImport.parse('v\t0\t0\t0\nv\t1\t0\t0\nv\t0\t1\t0\nf\t1\t2\t3\n', 'tab.obj');
    expect(mesh.vertices.length).toBe(3);
    expect(mesh.faces).toEqual([[0, 1, 2]]);
  });

  // D6a — a face with an unresolvable corner is dropped WHOLE, never fanned.
  test('D6a: drops a face with an out-of-range index instead of fabricating a triangle', () => {
    // `f 1 99 3 4` used to yield [[0,2,3]] — a triangle the file never described.
    const obj = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 1 1 0\nv 2 0 0\nv 2 1 0\nf 1 99 3 4\nf 1 2 3\n';
    const mesh = V.ObjImport.parse(obj, 'badidx.obj');
    expect(mesh.faces).toEqual([[0, 1, 2]]); // ONLY the good face survives
    expect(mesh.warnings.join(' ')).toMatch(/1 face dropped/);
  });

  // D7 — a malformed `v` must not become a phantom vertex at the origin.
  test('D7: a malformed vertex record is skipped, not stored as {0,0,0}', () => {
    // Geometry authored far from the origin: a phantom {0,0,0} used to drag the
    // bbox centre and collapse the real mesh to a speck after normalisation.
    const obj = 'v 100 100 100\nv 101 100 100\nv 100 101 100\nv 0 0\nf 1 2 3\n';
    const mesh = V.ObjImport.parse(obj, 'phantom.obj');
    expect(mesh.vertices.length).toBe(3);
    expect(mesh.vertices.some((v) => v.x === 0 && v.y === 0 && v.z === 0)).toBe(false);
    expect(mesh.warnings.join(' ')).toMatch(/1 malformed vertex record/);
    // Ordinal alignment survives: `f 1 2 3` still names the three real verts.
    expect(mesh.faces).toEqual([[0, 1, 2]]);
  });

  test('D7: face ordinals after a malformed `v` still line up', () => {
    const obj = 'v 0 0\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 2 3 4\n';
    const mesh = V.ObjImport.parse(obj, 'align.obj');
    expect(mesh.vertices.length).toBe(3);
    expect(mesh.faces).toEqual([[0, 1, 2]]);
  });

  test('D7: a face referencing a malformed `v` is dropped, not welded to a phantom', () => {
    const obj = 'v 0 0 0\nv 1 0 0\nv nope nope nope\nv 0 1 0\nf 1 2 3\nf 1 2 4\n';
    const mesh = V.ObjImport.parse(obj, 'refbad.obj');
    expect(mesh.faces).toEqual([[0, 1, 2]]);
    expect(mesh.warnings.join(' ')).toMatch(/1 face dropped/);
  });

  // D8d — "verts parsed but every face unusable" is its own diagnosis.
  test('D8d: distinguishes "all faces bad" from "unreadable file"', () => {
    expect(() => V.ObjImport.parse('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 50 60 70\n', 'badf.obj'))
      .toThrow(/every face referenced an unknown vertex/);
    // A file with nothing usable at all keeps the plain message.
    expect(() => V.ObjImport.parse('# nothing here\n', 'empty.obj'))
      .toThrow(/no faces found$/);
  });

  // A clean file reports no warnings — the diagnostics must not cry wolf.
  test('a well-formed OBJ carries an empty warnings list', () => {
    const mesh = V.ObjImport.parse(TETRA_OBJ, 'tetra.obj');
    expect(mesh.warnings).toEqual([]);
  });

  // Pre-existing whitespace forms the review verified were already OK — guard
  // them so the /\s+/ dispatch rewrite cannot regress any of them.
  test('still handles CRLF, CR-only, indented, multi-space and 6-component `v`', () => {
    const expectTri = (text, label) => {
      const mesh = V.ObjImport.parse(text, `${label}.obj`);
      expect(mesh.vertices.length).toBe(3);
      expect(mesh.faces).toEqual([[0, 1, 2]]);
    };
    expectTri('v 0 0 0\r\nv 1 0 0\r\nv 0 1 0\r\nf 1 2 3\r\n', 'crlf');
    expectTri('v 0 0 0\rv 1 0 0\rv 0 1 0\rf 1 2 3\r', 'cr');
    expectTri('  v 0 0 0\n  v 1 0 0\n  v 0 1 0\n  f 1 2 3\n', 'indent');
    expectTri('v   0  0  0\nv   1  0  0\nv   0  1  0\nf   1  2  3\n', 'multispace');
    // 6-component `v x y z r g b` — the colour components are ignored.
    expectTri('v 0 0 0 1 0 0\nv 1 0 0 0 1 0\nv 0 1 0 0 0 1\nf 1 2 3\n', 'vcolor');
  });
});
