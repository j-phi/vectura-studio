/**
 * STL mesh parser for the 3D algorithm suite (topoform, polyhedron).
 *
 * Parses both binary and ASCII .stl files into a compact, JSON-serialisable
 * { vertices:[{x,y,z}], faces:[[i,j,k]], name, triangles } mesh. Vertices are
 * welded (deduplicated) so the shared edge/contour machinery in geometry3d.js
 * (collectEdges, plane slicing, silhouette) sees a real connected mesh rather
 * than 3 unshared verts per triangle. The mesh is normalised into a centred
 * unit-ish box ([-1,1] on its longest axis) so a layer's existing Scale X/Y/Z
 * sliders size it exactly like a built-in primitive.
 *
 * Large meshes are uniformly down-sampled to MAX_FACES so they stay light
 * enough to live in layer.params (and therefore undo history / .vectura files)
 * and render at interactive speed.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const MAX_FACES = 12000;

  // Lower bound on how much of the face budget the reducer must actually use.
  // A reducer that emits a small fraction of what it is allowed still passes
  // every "≤ budget / still connected" assertion while quietly destroying the
  // mesh (a mutant emitting 3.2% of budget passed all nine of the original
  // tests). `downsample` warns below this, and the unit suite asserts it.
  const MIN_BUDGET_FILL = 0.5;

  const isBinary = (buffer) => {
    if (buffer.byteLength < 84) return false;
    const view = new DataView(buffer);
    const triCount = view.getUint32(80, true);
    // Exact size match is the definitive binary signature (an ASCII file whose
    // header happens to start with "solid" can't also satisfy this).
    return buffer.byteLength === 84 + triCount * 50;
  };

  const makeWelder = () => {
    const vertices = [];
    const map = new Map();
    const add = (x, y, z) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return -1;
      const key = `${x.toFixed(4)}|${y.toFixed(4)}|${z.toFixed(4)}`;
      let idx = map.get(key);
      if (idx === undefined) {
        idx = vertices.length;
        vertices.push({ x, y, z });
        map.set(key, idx);
      }
      return idx;
    };
    return { vertices, add };
  };

  const parseBinary = (buffer) => {
    const view = new DataView(buffer);
    const triCount = view.getUint32(80, true);
    const { vertices, add } = makeWelder();
    const faces = [];
    let offset = 84;
    for (let i = 0; i < triCount; i++) {
      offset += 12; // skip facet normal
      const a = add(view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true));
      const b = add(view.getFloat32(offset + 12, true), view.getFloat32(offset + 16, true), view.getFloat32(offset + 20, true));
      const c = add(view.getFloat32(offset + 24, true), view.getFloat32(offset + 28, true), view.getFloat32(offset + 32, true));
      offset += 38; // 3 verts (36) + attribute byte count (2)
      if (a >= 0 && b >= 0 && c >= 0 && a !== b && b !== c && a !== c) faces.push([a, b, c]);
    }
    return { vertices, faces };
  };

  const parseAscii = (text) => {
    const { vertices, add } = makeWelder();
    const faces = [];
    const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
    const verts = [];
    let m;
    while ((m = re.exec(text))) verts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
    for (let i = 0; i + 2 < verts.length; i += 3) {
      const a = add(verts[i][0], verts[i][1], verts[i][2]);
      const b = add(verts[i + 1][0], verts[i + 1][1], verts[i + 1][2]);
      const c = add(verts[i + 2][0], verts[i + 2][1], verts[i + 2][2]);
      if (a >= 0 && b >= 0 && c >= 0 && a !== b && b !== c && a !== c) faces.push([a, b, c]);
    }
    const nameMatch = /^\s*solid\s+([^\r\n]*)/.exec(text);
    return { vertices, faces, name: (nameMatch && nameMatch[1].trim()) || '' };
  };

  // Centre on the bounding-box midpoint and scale so the longest axis spans
  // [-1, 1]. Returns a NEW vertex array; faces are unchanged.
  const normalize = (vertices) => {
    if (!vertices.length) return vertices;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    vertices.forEach((p) => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    });
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const k = 2 / extent;
    return vertices.map((p) => ({
      x: Math.round((p.x - cx) * k * 10000) / 10000,
      y: Math.round((p.y - cy) * k * 10000) / 10000,
      z: Math.round((p.z - cz) * k * 10000) / 10000,
    }));
  };

  // Last-resort reducer: uniformly drop faces until at most maxFaces remain,
  // then prune orphan vertices and re-index. This SHREDS connectivity — the
  // survivors no longer share edges — so it is only the fallback for a budget
  // that vertex clustering cannot reach (see `downsample` below).
  //
  // REACHABILITY: `downsample` falls through to this only when even a 2×2×2
  // cluster overshoots. Eight clusters span at most C(8,3) = 56 distinct
  // triangles, so this fires for budgets under ~56 faces — a caller-supplied
  // maxFaces, never the MAX_FACES default. The unit suite drives it explicitly
  // so it is covered, not dead.
  const strideDrop = (mesh, maxFaces) => {
    const stride = mesh.faces.length / maxFaces;
    const kept = [];
    for (let i = 0; i < mesh.faces.length; i += stride) kept.push(mesh.faces[Math.floor(i)]);
    if (kept.length > maxFaces) kept.length = maxFaces; // hold the documented ≤ maxFaces bound
    const remap = new Map();
    const vertices = [];
    const faces = kept.map((face) => face.map((idx) => {
      let next = remap.get(idx);
      if (next === undefined) {
        next = vertices.length;
        vertices.push(mesh.vertices[idx]);
        remap.set(idx, next);
      }
      return next;
    }));
    return { vertices, faces };
  };

  // Geometric normal of a triangle, from its vertex order (right-hand rule).
  // The parsers throw the file's facet normal away and trust winding, so this is
  // the only orientation signal a triangle carries.
  const triNormal = (p, q, r) => {
    const ux = q.x - p.x, uy = q.y - p.y, uz = q.z - p.z;
    const vx = r.x - p.x, vy = r.y - p.y, vz = r.z - p.z;
    return { x: uy * vz - uz * vy, y: uz * vx - ux * vz, z: ux * vy - uy * vx };
  };

  // Vertex clustering (Rossignac–Borrel): quantise every vertex onto a grid of
  // `grid` divisions PER AXIS over the mesh bounds, collapse each occupied cell
  // to a single vertex, and rebuild the faces against those cluster vertices —
  // dropping the triangles that collapse and the duplicates that result.
  //
  // This is CONNECTIVITY-PRESERVING, which is the whole point: neighbouring
  // triangles still share cluster vertices, so the surface stays closed and the
  // edge/silhouette machinery in geometry3d.js keeps seeing a connected mesh.
  // Dropping every Nth face instead leaves the budget's worth of DISCONNECTED
  // triangles, where every edge is a boundary edge — measured on a 25,280-face
  // sphere reduced to 12,000: 131,033 ms shredded vs 1,101 ms for a connected
  // mesh of the same size. The cell's FIRST vertex represents it, so the kept
  // positions stay exactly on the original surface.
  //
  // ANISOTROPIC CELLS (fix, 2026-08-07). `extent` is the PER-AXIS bounding-box
  // span, so each axis is divided `grid` ways across its OWN span and the cells
  // are non-cubic. Sizing every cell from the LONGEST axis instead (one cubic
  // cell size) destroys a slender mesh's short-axis detail: a 20:1 rod
  // (39,600 tris) collapsed from 180 distinct angles around its mid
  // cross-section to 42 — down its own axis it read as a lumpy polygon rather
  // than a circle. Per-axis cells keep the same 180.
  const clusterAtGrid = (mesh, grid, min, extent) => {
    // Scale factor per axis; 0 for a degenerate (zero-span) axis, which then
    // always indexes cell 0 instead of dividing by zero.
    const kx = extent.x > 0 ? grid / extent.x : 0;
    const ky = extent.y > 0 ? grid / extent.y : 0;
    const kz = extent.z > 0 ? grid / extent.z : 0;
    const axis = (value, base, k) => (k
      ? Math.min(grid - 1, Math.max(0, Math.floor((value - base) * k)))
      : 0);
    const cellOf = (p) => (
      (axis(p.x, min.x, kx) * grid + axis(p.y, min.y, ky)) * grid + axis(p.z, min.z, kz)
    );
    const cellToIdx = new Map();
    const vertices = [];
    const vertexToCluster = new Array(mesh.vertices.length);
    for (let i = 0; i < mesh.vertices.length; i += 1) {
      const key = cellOf(mesh.vertices[i]);
      let idx = cellToIdx.get(key);
      if (idx === undefined) {
        idx = vertices.length;
        vertices.push(mesh.vertices[i]); // first vertex in the cell represents it
        cellToIdx.set(key, idx);
      }
      vertexToCluster[i] = idx;
    }
    const seen = new Set();
    const faces = [];
    for (let f = 0; f < mesh.faces.length; f += 1) {
      const src = mesh.faces[f];
      const a = vertexToCluster[src[0]];
      const b = vertexToCluster[src[1]];
      const c = vertexToCluster[src[2]];
      if (a === undefined || b === undefined || c === undefined) continue;
      if (a === b || b === c || a === c) continue; // collapsed by the grid
      const key = a < b ? (a < c ? `${a}|${Math.min(b, c)}|${Math.max(b, c)}` : `${c}|${a}|${b}`)
        : (b < c ? `${b}|${Math.min(a, c)}|${Math.max(a, c)}` : `${c}|${Math.min(a, b)}|${Math.max(a, b)}`);
      if (seen.has(key)) continue; // duplicate triangle after clustering
      seen.add(key);
      // RE-WIND (fix, 2026-08-07). Snapping three vertices to their cluster
      // representatives can move them past each other and INVERT the triangle:
      // measured 876 inverted triangles on the reduced 20:1 rod. An inverted
      // face flips its normal, so the Lambert shade, the back-face cull and the
      // hidden-line pass all read it as facing the wrong way. Compare the
      // clustered normal with the SOURCE triangle's and swap b/c when they
      // oppose. A degenerate source or clustered triangle gives a zero normal
      // (dot 0) and is left exactly as-is.
      const sn = triNormal(mesh.vertices[src[0]], mesh.vertices[src[1]], mesh.vertices[src[2]]);
      const cn = triNormal(vertices[a], vertices[b], vertices[c]);
      const flipped = (sn.x * cn.x + sn.y * cn.y + sn.z * cn.z) < 0;
      faces.push(flipped ? [a, c, b] : [a, b, c]);
    }
    return { vertices, faces };
  };

  // Reduce `mesh` to at most MAX_FACES faces, keeping it connected. Returns the
  // mesh UNTOUCHED when it is already within budget (so this is a no-op for the
  // meshes the parsers already produce under the cap).
  const downsample = (mesh, maxFaces = MAX_FACES) => {
    if (mesh.faces.length <= maxFaces) return mesh;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    mesh.vertices.forEach((p) => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    });
    const min = { x: minX, y: minY, z: minZ };
    const extent = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
    // BINARY SEARCH the grid (fix, 2026-08-07). A closed surface's face count
    // grows ~grid², so the count is monotone in `grid` and bracketable. The old
    // loop stepped ×0.8 down from a fixed start and stopped at the FIRST result
    // under budget, which undershot badly — it threw away up to two thirds of
    // the budget (measured: 4,129 of 12,000 faces on a 20:1 rod). Bracket
    // [lo, hi] — lo fits, hi does not — then halve until they are adjacent, so
    // the answer is the finest grid that still fits. Same worst-case pass count
    // as the old walk, ~14 in practice, each pass O(V+F).
    const GRID_CAP = 1024; // 1024³ cell keys stay exact as Numbers
    let lo = 2;            // ≤ 8 clusters ⇒ a handful of faces; assumed to fit
    let hi = 0;            // 0 = no over-budget grid found yet
    let best = null;
    let grid = Math.max(4, Math.ceil(Math.sqrt(maxFaces)));
    for (let pass = 0; pass < 24; pass += 1) {
      const built = clusterAtGrid(mesh, grid, min, extent);
      if (built.faces.length <= maxFaces) { best = built; lo = grid; } else { hi = grid; }
      if (!hi) {
        // Never overshot: the start grid was already under budget, so climb.
        if (grid >= GRID_CAP) break;
        grid = Math.min(GRID_CAP, grid * 2);
        continue;
      }
      if (hi - lo <= 1) break; // bracketed to adjacent grids — `best` is the finest fit
      grid = lo + Math.floor((hi - lo) / 2);
    }
    // The search never probed the assumed-fitting floor; probe it now so a mesh
    // whose every tried grid overshot still gets a clustered (connected) result.
    if (!best) {
      const floorBuilt = clusterAtGrid(mesh, 2, min, extent);
      if (floorBuilt.faces.length <= maxFaces) best = floorBuilt;
    }
    // Even the coarsest cluster overshot — only possible for a budget smaller
    // than the ≤ 56 triangles 8 clusters can span. Fall back to the shredding
    // reducer, which always hits the bound.
    if (!best) return strideDrop(mesh, maxFaces);
    // Lower-bound sanity: the search should land NEAR the budget. Landing far
    // under it means the reducer is throwing away resolution it was allowed to
    // keep — the exact regression this replaced. Warn rather than throw: a real
    // mesh with a pathological bracket must still import.
    if (best.faces.length < maxFaces * MIN_BUDGET_FILL && typeof console !== 'undefined') {
      console.warn(`StlParser.downsample: kept ${best.faces.length} of a ${maxFaces}-face budget`
        + ` (grid ${lo}); expected at least ${Math.round(maxFaces * MIN_BUDGET_FILL)}.`);
    }
    // Prune cluster vertices no surviving face references, and re-index.
    const remap = new Map();
    const vertices = [];
    const faces = best.faces.map((face) => face.map((idx) => {
      let next = remap.get(idx);
      if (next === undefined) {
        next = vertices.length;
        vertices.push(best.vertices[idx]);
        remap.set(idx, next);
      }
      return next;
    }));
    return { vertices, faces };
  };

  // Copy any ArrayBuffer / typed-array input (which may originate in another
  // realm — FileReader in the browser, the test sandbox under jsdom) into a
  // fresh local ArrayBuffer, so DataView/instanceof are realm-safe.
  const toLocalBuffer = (data) => {
    const src = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : (data && typeof data.byteLength === 'number' ? new Uint8Array(data) : null);
    if (!src) return null;
    const local = new ArrayBuffer(src.byteLength);
    new Uint8Array(local).set(src);
    return local;
  };

  const parse = (data, fileName = '') => {
    let mesh;
    if (typeof data === 'string') {
      mesh = parseAscii(data);
    } else {
      const buffer = toLocalBuffer(data);
      if (!buffer) throw new Error('STL parse: unsupported input');
      if (isBinary(buffer)) {
        mesh = parseBinary(buffer);
      } else {
        // Fall back to ASCII via a UTF-8 decode of the same bytes.
        const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
        mesh = parseAscii(text);
      }
    }
    if (!mesh.vertices.length || !mesh.faces.length) {
      throw new Error('STL parse: no triangles found');
    }
    const sourceTriangles = mesh.faces.length;
    const name = mesh.name || fileName.replace(/\.stl$/i, '') || 'mesh';
    mesh = downsample(mesh);
    return {
      vertices: normalize(mesh.vertices),
      faces: mesh.faces,
      triangles: mesh.faces.length,
      // What the FILE offered, before the face budget. `triangles` is what is
      // actually stored — every STL import surface reports both, so a reduced
      // mesh is never presented as if it were the whole file (the OBJ path
      // already did this through importMeshAsScene's sourceFaces).
      sourceTriangles,
      name,
    };
  };

  // `makeWelder` and `downsample` are exported so the OBJ parser
  // (src/core/scene3d/obj-import.js) and the engine's shared import wrapper
  // (VectorEngine.buildImportedMeshParams) reuse THIS implementation rather than
  // forking a second one — the branch keeps one impl per concern (the same rule
  // that moved the deformer math into scene3d/mesh.js).
  Vectura.StlParser = { parse, MAX_FACES, MIN_BUDGET_FILL, makeWelder, downsample };
})();
