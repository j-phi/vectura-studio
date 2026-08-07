/**
 * Wavefront OBJ mesh parser for the 3D scene suite.
 *
 * Parses `.obj` text into the SAME compact, JSON-serialisable mesh shape the
 * STL parser (src/core/stl-parser.js) emits and that createSolidMesh's
 * `solidType:'importedMesh'` branch (src/core/scene3d/mesh.js) consumes:
 *
 *   { vertices: [ {x,y,z}, … ], faces: [ [i,j,k], … ], name }
 *
 * Only `v` (vertex position) and `f` (face) records are used — normals (`vn`),
 * texture coords (`vt`), materials (`mtllib`/`usemtl`), objects/groups
 * (`o`/`g`/`s`) and comments (`#`) are ignored for v1. Faces are fan-triangulated
 * (an n-gon `f a b c d` → triangles `a b c`, `a c d`) so the mesh is all
 * triangles like the STL path. OBJ's 1-based vertex indices become 0-based, and
 * negative (relative) indices resolve against the vertices seen so far.
 *
 * Vertices are left in the file's own coordinate space — the engine import
 * action (VectorEngine.importMeshAsScene) centres and unit-normalises them,
 * exactly as Convert-to-Scene normalises a baked mesh, so the OBJ parser stays a
 * pure text→mesh transform.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  // Resolve one OBJ face-vertex token ("12", "12/4", "12/4/7", "12//7",
  // "-1") to a 0-based vertex index against the current vertex count. Returns
  // -1 for an unparseable / out-of-range token so the caller can drop it.
  const resolveIndex = (token, vertexCount) => {
    if (!token) return -1;
    const slash = token.indexOf('/');
    const raw = slash === -1 ? token : token.slice(0, slash);
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n === 0) return -1;
    const idx = n < 0 ? vertexCount + n : n - 1; // negative = relative to end
    return (idx >= 0 && idx < vertexCount) ? idx : -1;
  };

  const parse = (text, fileName = '') => {
    if (typeof text !== 'string') throw new Error('OBJ parse: expected text input');
    const vertices = [];
    const faces = [];
    let name = '';
    const lines = text.split(/\r\n|\r|\n/);
    for (let li = 0; li < lines.length; li += 1) {
      const line = lines[li].trim();
      if (!line || line.charCodeAt(0) === 35 /* # */) continue;
      // Fast keyword dispatch on the leading token.
      const sp = line.indexOf(' ');
      const key = sp === -1 ? line : line.slice(0, sp);
      if (key === 'v') {
        const parts = line.slice(sp + 1).trim().split(/\s+/);
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          vertices.push({ x, y, z });
        } else {
          // Keep index alignment: OBJ `f` refs count every `v` line.
          vertices.push({ x: 0, y: 0, z: 0 });
        }
      } else if (key === 'f') {
        const tokens = line.slice(sp + 1).trim().split(/\s+/);
        const poly = [];
        for (let t = 0; t < tokens.length; t += 1) {
          const idx = resolveIndex(tokens[t], vertices.length);
          if (idx >= 0) poly.push(idx);
        }
        // Fan-triangulate: (0,1,2), (0,2,3), … Drop degenerate slivers.
        for (let t = 2; t < poly.length; t += 1) {
          const a = poly[0];
          const b = poly[t - 1];
          const c = poly[t];
          if (a !== b && b !== c && a !== c) faces.push([a, b, c]);
        }
      } else if (key === 'o' && !name) {
        name = line.slice(sp + 1).trim();
      }
    }
    if (!vertices.length || !faces.length) {
      throw new Error('OBJ parse: no faces found');
    }
    return {
      vertices,
      faces,
      name: name || fileName.replace(/\.obj$/i, '') || 'mesh',
    };
  };

  Vectura.ObjImport = { parse };
})();
