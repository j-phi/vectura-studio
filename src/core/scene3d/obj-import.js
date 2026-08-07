/**
 * Wavefront OBJ mesh parser for the 3D scene suite.
 *
 * Parses `.obj` text into the SAME compact, JSON-serialisable mesh shape the
 * STL parser (src/core/stl-parser.js) emits and that createSolidMesh's
 * `solidType:'importedMesh'` branch (src/core/scene3d/mesh.js) consumes:
 *
 *   { vertices: [ {x,y,z}, … ], faces: [ [i,j,k], … ], name, warnings }
 *
 * Only `v` (vertex position) and `f` (face) records are used — normals (`vn`),
 * texture coords (`vt`), materials (`mtllib`/`usemtl`), objects/groups
 * (`o`/`g`/`s`) and comments (`#`) are ignored for v1. Faces are fan-triangulated
 * (an n-gon `f a b c d` → triangles `a b c`, `a c d`) so the mesh is all
 * triangles like the STL path. OBJ's 1-based vertex indices become 0-based, and
 * negative (relative) indices resolve against the vertices seen so far.
 *
 * WELDING (parity with the STL parser). Vertices are welded through the SHARED
 * StlParser.makeWelder, so co-located positions collapse to one index and the
 * edge/contour machinery in geometry3d.js (collectEdges, plane slicing,
 * silhouette) sees a real connected mesh. Without this an unwelded OBJ — exactly
 * what an STL→OBJ conversion emits — draws every internal triangle edge: a
 * 1600-tri UV sphere rendered 2894 scene paths unwelded vs 566 welded. The
 * file's own vertex ordinals still drive `f` resolution (fileVerts), so index
 * alignment and negative indices are unaffected; `fileToWelded` maps ordinal →
 * welded index at face-build time.
 *
 * DIAGNOSTICS. The parser never fabricates geometry it was not given:
 *   - a `v` record that does not parse becomes an INVALID ordinal (not a phantom
 *     vertex at the origin, which used to drag the bbox centre and collapse
 *     far-from-origin meshes after normalisation);
 *   - a face referencing any unresolvable/invalid ordinal is dropped WHOLE
 *     rather than fanned over the surviving indices (which used to invent a
 *     triangle the file never described).
 * Both are counted and reported on `mesh.warnings` so the UI can surface them.
 *
 * Vertices are left in the file's own coordinate space — the engine import
 * action (VectorEngine.importMeshAsScene) centres, unit-normalises and caps them,
 * exactly as Convert-to-Scene normalises a baked mesh, so the OBJ parser stays a
 * pure text→mesh transform.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const INVALID = -1;

  // Resolve one OBJ face-vertex token ("12", "12/4", "12/4/7", "12//7", "-1") to
  // a 0-based FILE vertex ordinal against the current file vertex count. Returns
  // -1 for an unparseable / out-of-range token so the caller can reject the face.
  const resolveIndex = (token, vertexCount) => {
    if (!token) return INVALID;
    const slash = token.indexOf('/');
    const raw = slash === -1 ? token : token.slice(0, slash);
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n === 0) return INVALID;
    const idx = n < 0 ? vertexCount + n : n - 1; // negative = relative to end
    return (idx >= 0 && idx < vertexCount) ? idx : INVALID;
  };

  const parse = (text, fileName = '') => {
    if (typeof text !== 'string') throw new Error('OBJ parse: expected text input');

    // Shared welder (one impl — see stl-parser.js). `fileToWelded[ordinal]` is
    // the welded vertex index for the n-th `v` record, or INVALID for a `v` we
    // could not parse.
    const welder = window.Vectura?.StlParser?.makeWelder;
    if (typeof welder !== 'function') {
      throw new Error('OBJ parse: StlParser.makeWelder unavailable (load order)');
    }
    const { vertices, add } = welder();
    const fileToWelded = [];

    const faces = [];
    let name = '';
    let badVertexRecords = 0;
    let droppedFaces = 0;

    const lines = text.split(/\r\n|\r|\n/);
    for (let li = 0; li < lines.length; li += 1) {
      const line = lines[li].trim();
      if (!line || line.charCodeAt(0) === 35 /* # */) continue;
      // Keyword dispatch on the leading token. ANY whitespace is a legal OBJ
      // separator, so split on /\s+/ rather than looking for a literal space —
      // tab-delimited files are valid and used to be rejected outright.
      const ws = line.search(/\s/);
      const key = ws === -1 ? line : line.slice(0, ws);
      const rest = ws === -1 ? '' : line.slice(ws + 1).trim();

      if (key === 'v') {
        const parts = rest.split(/\s+/);
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          fileToWelded.push(add(x, y, z));
        } else {
          // Keep ordinal alignment (OBJ `f` refs count every `v` line) WITHOUT
          // inventing a vertex: faces that reference this ordinal are dropped.
          fileToWelded.push(INVALID);
          badVertexRecords += 1;
        }
      } else if (key === 'f') {
        const tokens = rest.split(/\s+/);
        const poly = [];
        let bad = false;
        for (let t = 0; t < tokens.length; t += 1) {
          const ordinal = resolveIndex(tokens[t], fileToWelded.length);
          const welded = ordinal === INVALID ? INVALID : fileToWelded[ordinal];
          if (welded === INVALID || welded === undefined) { bad = true; break; }
          poly.push(welded);
        }
        // Reject the WHOLE face when any corner is unresolvable — fanning over
        // the survivors would emit a triangle the file never described.
        if (bad || poly.length < 3) {
          droppedFaces += 1;
          continue;
        }
        // Fan-triangulate: (0,1,2), (0,2,3), … Drop degenerate slivers (welding
        // can collapse a triangle's corners together, e.g. at a UV-sphere pole).
        for (let t = 2; t < poly.length; t += 1) {
          const a = poly[0];
          const b = poly[t - 1];
          const c = poly[t];
          if (a !== b && b !== c && a !== c) faces.push([a, b, c]);
        }
      } else if (key === 'o' && !name) {
        name = rest;
      }
    }

    if (!vertices.length || !faces.length) {
      // Distinguish "nothing usable at all" from "vertices parsed but every face
      // was unusable" so the UI can say something accurate.
      throw new Error(vertices.length
        ? 'OBJ parse: no faces found (every face referenced an unknown vertex)'
        : 'OBJ parse: no faces found');
    }

    const warnings = [];
    if (badVertexRecords) warnings.push(`${badVertexRecords} malformed vertex record${badVertexRecords === 1 ? '' : 's'} skipped`);
    if (droppedFaces) warnings.push(`${droppedFaces} face${droppedFaces === 1 ? '' : 's'} dropped (unknown vertex index)`);
    if (warnings.length) console.warn(`OBJ import "${fileName || 'mesh'}": ${warnings.join('; ')}`);

    return {
      vertices,
      faces,
      name: name || fileName.replace(/\.obj$/i, '') || 'mesh',
      warnings,
    };
  };

  Vectura.ObjImport = { parse };
})();
