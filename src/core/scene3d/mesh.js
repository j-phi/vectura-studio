/**
 * Scene3D.Mesh — tessellators and solid-mesh generators shared by the 3D scene
 * algorithms.
 *
 * Extracted VERBATIM from topoform.js (makeGridMesh / makeBoxMesh / weldMesh /
 * the buildPrimitiveRaw builder core / createPrimitiveMesh) and polyhedron.js
 * (regularRing, mesh helpers, platonic/geodesic/dual builders, createSolidMesh):
 * every expression, iteration order, and sort comparator is preserved
 * byte-for-byte so the precision-3 SVG baselines stay byte-exact.
 *
 * Dependency chain: Geometry3D → Scene3D.Charts → Scene3D.Mesh → algorithms.
 * Projection, deformers, and all hidden-line / silhouette / hatch rendering
 * stay in the algorithms; this module only builds meshes.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};
  // Resolve the Charts namespace LAZILY at call time. Capturing it at IIFE load
  // (`const Charts = ... || {}`) stranded an empty {} forever if charts.js ever
  // registered after mesh.js in load order — chart lookups then silently
  // no-op'd. Reading window.Vectura.Scene3D.Charts on demand removes that
  // load-order fragility; the `|| {}` remains only as a last-resort guard.
  const getCharts = () => (Vectura.Scene3D && Vectura.Scene3D.Charts) || {};

  const {
    TAU,
    clamp,
    finite,
    v,
    add,
    sub,
    mul,
    dot,
    cross,
    normalize,
    faceNormal,
  } = G3;

  // ── Tessellators (from topoform.js) ────────────────────────────────────────

  // Weld coincident vertices to a single shared index and drop any triangle that
  // is left with fewer than 3 DISTINCT indices (zero-area degenerate). This
  // de-fans UV poles: a UV sphere/cone/cylinder collapses a whole grid row onto
  // one pole point, so without welding the wireframe paints `cols` tiny radial
  // spokes (an "asterisk") converging there, and the contour slabs the same
  // sliver triangles. Welding shares those coincident pole verts, the pole-row
  // slivers each lose to two-coincident-corner degeneracy and are dropped, and
  // the pole renders as clean nested rings. Welding is position-based with a
  // scale-relative epsilon, so only TRULY coincident vertices merge — non-pole
  // geometry is untouched and the result stays deterministic.
  const weldMesh = (mesh) => {
    const verts = mesh.vertices;
    if (!verts.length) return mesh;
    let maxAbs = 1;
    for (let i = 0; i < verts.length; i++) {
      const a = Math.max(Math.abs(verts[i].x), Math.abs(verts[i].y), Math.abs(verts[i].z));
      if (a > maxAbs) maxAbs = a;
    }
    // Quantise to ~1e-5 of the mesh extent: coincident-by-construction pole
    // vertices share a cell; genuinely distinct vertices never collide.
    const q = maxAbs * 1e-5;
    const cellKey = (pt) => `${Math.round(pt.x / q)},${Math.round(pt.y / q)},${Math.round(pt.z / q)}`;
    const cellOf = new Map();
    const remap = new Array(verts.length);
    const outVerts = [];
    for (let i = 0; i < verts.length; i++) {
      const key = cellKey(verts[i]);
      let target = cellOf.get(key);
      if (target == null) {
        target = outVerts.length;
        cellOf.set(key, target);
        outVerts.push(verts[i]);
      }
      remap[i] = target;
    }
    const outFaces = [];
    for (let i = 0; i < mesh.faces.length; i++) {
      const f = mesh.faces[i];
      const a = remap[f[0]];
      const b = remap[f[1]];
      const c = remap[f[2]];
      if (a === b || b === c || a === c) continue; // degenerate after weld → drop
      outFaces.push([a, b, c]);
    }
    return { vertices: outVerts, faces: outFaces };
  };

  // `flip` reverses each triangle's winding. The base template traverses +u then
  // +v, which yields OUTWARD-facing normals only for samplers whose (u,v) frame
  // is right-handed-outward (sphere, ellipsoid, cone). The other parametric
  // surfaces (torus, cylinder, capsule, pyramid, superellipsoid, torusKnot) wind
  // the opposite way and pass flip=true so every primitive ends up uniformly
  // outward — see the per-mode calls in createPrimitiveMesh (winding audit).
  const makeGridMesh = (rows, cols, sampler, flip = false) => {
    const vertices = [];
    for (let y = 0; y <= rows; y++) {
      for (let x = 0; x <= cols; x++) vertices.push(sampler(x / cols, y / rows));
    }
    const idx = (x, y) => y * (cols + 1) + x;
    const faces = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (flip) {
          faces.push([idx(x, y), idx(x + 1, y + 1), idx(x + 1, y)]);
          faces.push([idx(x, y), idx(x, y + 1), idx(x + 1, y + 1)]);
        } else {
          faces.push([idx(x, y), idx(x + 1, y), idx(x + 1, y + 1)]);
          faces.push([idx(x, y), idx(x + 1, y + 1), idx(x, y + 1)]);
        }
      }
    }
    // Welding (pole de-fan + edge sharing) is applied by createPrimitiveMesh so
    // it can be skipped when Specular Highlight wants the raw pole convergence.
    return { vertices, faces };
  };

  // Parametric subdivided box. Each of the 6 faces is split into detail×detail
  // quads (2 tris each), all wound UNIFORMLY OUTWARD: every face is described by
  // an outward normal plus an in-plane right-handed (tangent, bitangent) basis
  // chosen so cross(tangent, bitangent) === normal, then the quad triangles are
  // emitted CCW in that basis — so every triangle normal points away from the
  // box centre (the origin). Vertices are deduped per-face (a shared corner is a
  // distinct index across faces, which is correct for flat-shaded winding).
  const makeBoxMesh = (sx, sy, sz, detail) => {
    const d = Math.max(1, Math.round(detail));
    const vertices = [];
    const faces = [];
    // Each face: outward normal n, in-plane tangent t and bitangent b with
    // cross(t, b) === n. Half-extents scale the unit basis to the box.
    const FACES = [
      { n: v(1, 0, 0), t: v(0, 0, -1), b: v(0, 1, 0) },  // +X
      { n: v(-1, 0, 0), t: v(0, 0, 1), b: v(0, 1, 0) },  // -X
      { n: v(0, 1, 0), t: v(1, 0, 0), b: v(0, 0, -1) },  // +Y
      { n: v(0, -1, 0), t: v(1, 0, 0), b: v(0, 0, 1) },  // -Y
      { n: v(0, 0, 1), t: v(1, 0, 0), b: v(0, 1, 0) },   // +Z
      { n: v(0, 0, -1), t: v(-1, 0, 0), b: v(0, 1, 0) }, // -Z
    ];
    FACES.forEach((f) => {
      const base = vertices.length;
      for (let j = 0; j <= d; j++) {
        for (let i = 0; i <= d; i++) {
          const u = (i / d) * 2 - 1; // -1..1 along tangent
          const w = (j / d) * 2 - 1; // -1..1 along bitangent
          vertices.push(v(
            (f.n.x + f.t.x * u + f.b.x * w) * sx,
            (f.n.y + f.t.y * u + f.b.y * w) * sy,
            (f.n.z + f.t.z * u + f.b.z * w) * sz,
          ));
        }
      }
      const idx = (i, j) => base + j * (d + 1) + i;
      for (let j = 0; j < d; j++) {
        for (let i = 0; i < d; i++) {
          // CCW in (tangent, bitangent) → normal = cross(t, b) = outward n.
          faces.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1)]);
          faces.push([idx(i, j), idx(i + 1, j + 1), idx(i, j + 1)]);
        }
      }
    });
    // Weld the per-face vertex grids so faces from ADJACENT box sides share their
    // common edge vertices. Without this every box edge is a one-sided boundary
    // edge and buildSilhouette (which needs an edge shared by one front + one
    // back face) finds no outline. The box is always welded by createPrimitiveMesh
    // (its silhouette needs it) regardless of Specular Highlight.
    return { vertices, faces };
  };

  // ── Topoform primitive builder (from topoform.js buildPrimitiveRaw) ────────
  // The STL/importedMesh branch and param resolution stay in topoform, which
  // hands the resolved mode + sizes here. Dispatch order matches the original.
  const buildTopoformPrimitive = (mode, sizes, detail) => {
    const Charts = getCharts();
    if (mode === 'torus') {
      return makeGridMesh(detail, detail * 2, Charts.topoTorus(sizes), true);
    }
    if (mode === 'cone') {
      return makeGridMesh(detail, detail * 2, Charts.topoCone(sizes));
    }
    if (mode === 'cube') {
      // Parametric subdivided box honouring `detail` with uniformly outward
      // winding (replaced the legacy 8-vert/12-tri cube whose top/left/front
      // faces wound inward and which ignored detail entirely).
      return makeBoxMesh(sizes.sx, sizes.sy, sizes.sz, detail);
    }
    if (mode === 'cylinder') {
      // Open tube: u sweeps around, vv runs along the height axis.
      return makeGridMesh(detail, detail * 2, Charts.topoCylinder(sizes), true);
    }
    if (mode === 'capsule') {
      // Cylindrical body with hemispherical caps; vv runs bottom→top along the axis.
      return makeGridMesh(detail, detail * 2, Charts.topoCapsule(sizes), true);
    }
    if (mode === 'pyramid') {
      // Square cross-section tapering to an apex; subdivides with detail.
      return makeGridMesh(detail, detail * 4, Charts.topoPyramid(sizes), true);
    }
    if (mode === 'superellipsoid') {
      return makeGridMesh(detail, detail * 2, Charts.topoSuperellipsoid(sizes), true);
    }
    if (mode === 'torusKnot') {
      // (p,q) torus knot rendered as a swept tube; u runs along the knot, vv around the tube.
      return makeGridMesh(detail, detail * 4, Charts.topoTorusKnot(sizes), true);
    }
    return makeGridMesh(detail, detail * 2, Charts.topoSphereEllipsoid(sizes, mode));
  };

  // Weld de-fans the UV poles (collapsing the coincident pole row + dropping the
  // zero-area cap slivers) and shares the box's edge vertices. Applied as a
  // wrapper around the raw builder.
  const createTopoformMesh = (mode, sizes, detail) => weldMesh(buildTopoformPrimitive(mode, sizes, detail));

  // ── Solid-mesh helpers (from polyhedron.js) ────────────────────────────────

  const regularRing = (count, radius, z = 0, phase = -Math.PI / 2) => {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = phase + (i / count) * TAU;
      pts.push(v(Math.cos(a) * radius, Math.sin(a) * radius, z));
    }
    return pts;
  };

  const average3 = (points) => {
    const total = (points || []).reduce((acc, pt) => add(acc, pt), v(0, 0, 0));
    return mul(total, points?.length ? 1 / points.length : 0);
  };

  const lerp3 = (a, b, t) => v(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t
  );

  const meshBounds = (vertices) => {
    let maxRadius = 0;
    let maxDepth = 0;
    (vertices || []).forEach((pt) => {
      maxRadius = Math.max(maxRadius, Math.hypot(pt.x, pt.y, pt.z));
      maxDepth = Math.max(maxDepth, Math.abs(pt.z));
    });
    return {
      maxRadius: Math.max(1, maxRadius),
      maxDepth: Math.max(1, maxDepth || maxRadius),
    };
  };

  const withBounds = (mesh) => ({
    ...mesh,
    bounds: mesh.bounds || meshBounds(mesh.vertices),
  });

  const scaleMeshToRadius = (mesh, radius) => {
    const current = meshBounds(mesh.vertices).maxRadius;
    const scale = current > 0 ? radius / current : 1;
    return withBounds({
      vertices: mesh.vertices.map((pt) => mul(pt, scale)),
      faces: mesh.faces.map((face) => face.slice()),
    });
  };

  const orientFace = (face, vertices) => {
    const indices = face.slice();
    const points = indices.map((idx) => vertices[idx]);
    if (dot(faceNormal(points), average3(points)) < 0) indices.reverse();
    return indices;
  };

  const projectToTangent = (vector, normal) => sub(vector, mul(normal, dot(vector, normal)));

  const buildNeighborsByVertex = (faces, vertexCount) => {
    const neighbors = Array.from({ length: vertexCount }, () => []);
    faces.forEach((face) => {
      for (let i = 0; i < face.length; i++) {
        const current = face[i];
        const next = face[(i + 1) % face.length];
        const previous = face[(i + face.length - 1) % face.length];
        if (!neighbors[current].includes(next)) neighbors[current].push(next);
        if (!neighbors[current].includes(previous)) neighbors[current].push(previous);
      }
    });
    return neighbors;
  };

  const sortNeighborsAroundVertex = (vertexIndex, neighbors, vertices) => {
    const origin = vertices[vertexIndex];
    const normal = normalize(origin);
    const reference = Math.abs(normal.z) < 0.9 ? v(0, 0, 1) : v(0, 1, 0);
    const basisX = normalize(cross(reference, normal));
    const basisY = normalize(cross(normal, basisX));
    return (neighbors || []).slice().sort((left, right) => {
      const leftVector = normalize(projectToTangent(sub(vertices[left], origin), normal));
      const rightVector = normalize(projectToTangent(sub(vertices[right], origin), normal));
      const leftAngle = Math.atan2(dot(leftVector, basisY), dot(leftVector, basisX));
      const rightAngle = Math.atan2(dot(rightVector, basisY), dot(rightVector, basisX));
      return leftAngle - rightAngle;
    });
  };

  // ── Solid generators (from polyhedron.js) ──────────────────────────────────

  const createIcosahedronMesh = (radius) => {
    const phi = (1 + Math.sqrt(5)) / 2;
    const vertices = [
      v(-1, phi, 0), v(1, phi, 0), v(-1, -phi, 0), v(1, -phi, 0),
      v(0, -1, phi), v(0, 1, phi), v(0, -1, -phi), v(0, 1, -phi),
      v(phi, 0, -1), v(phi, 0, 1), v(-phi, 0, -1), v(-phi, 0, 1),
    ].map((pt) => mul(normalize(pt), radius));
    return withBounds({
      vertices,
      faces: [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
      ],
    });
  };

  const createTruncatedIcosahedronMesh = (radius) => {
    const base = createIcosahedronMesh(1);
    const orientedBaseFaces = base.faces.map((face) => orientFace(face, base.vertices));
    const directedVertexMap = new Map();
    const vertices = [];

    const getDirectedVertex = (start, end) => {
      const key = `${start}:${end}`;
      if (directedVertexMap.has(key)) return directedVertexMap.get(key);
      const index = vertices.length;
      vertices.push(lerp3(base.vertices[start], base.vertices[end], 1 / 3));
      directedVertexMap.set(key, index);
      return index;
    };

    const faces = [];
    orientedBaseFaces.forEach((face) => {
      const [a, b, c] = face;
      faces.push([
        getDirectedVertex(a, b),
        getDirectedVertex(b, a),
        getDirectedVertex(b, c),
        getDirectedVertex(c, b),
        getDirectedVertex(c, a),
        getDirectedVertex(a, c),
      ]);
    });

    const neighborsByVertex = buildNeighborsByVertex(orientedBaseFaces, base.vertices.length);
    for (let vertexIndex = 0; vertexIndex < base.vertices.length; vertexIndex++) {
      const neighbors = sortNeighborsAroundVertex(vertexIndex, neighborsByVertex[vertexIndex], base.vertices);
      if (neighbors.length >= 3) {
        faces.push(neighbors.map((neighbor) => getDirectedVertex(vertexIndex, neighbor)));
      }
    }

    return scaleMeshToRadius({
      vertices,
      faces: faces.map((face) => orientFace(face, vertices)),
    }, radius);
  };

  // Generic polyhedral dual: one dual vertex per source face (its centroid
  // projected onto the unit sphere), one dual face per source vertex (the ring
  // of surrounding face-centroids ordered around that vertex). Turns a
  // triangulated sphere into its hexagon/pentagon Goldberg companion, and the
  // icosahedron into the dodecahedron.
  const dualMesh = (mesh, radius) => {
    const orientedFaces = mesh.faces.map((face) => orientFace(face, mesh.vertices));
    const dualVertices = orientedFaces.map((face) => normalize(average3(face.map((idx) => mesh.vertices[idx]))));
    const facesByVertex = Array.from({ length: mesh.vertices.length }, () => []);
    orientedFaces.forEach((face, faceIndex) => face.forEach((vertexIndex) => facesByVertex[vertexIndex].push(faceIndex)));
    const faces = [];
    for (let vertexIndex = 0; vertexIndex < mesh.vertices.length; vertexIndex++) {
      const touching = facesByVertex[vertexIndex];
      if (touching.length < 3) continue;
      const origin = normalize(mesh.vertices[vertexIndex]);
      const reference = Math.abs(origin.z) < 0.9 ? v(0, 0, 1) : v(0, 1, 0);
      const basisX = normalize(cross(reference, origin));
      const basisY = normalize(cross(origin, basisX));
      const ordered = touching.slice().sort((left, right) => {
        const leftVector = normalize(projectToTangent(sub(dualVertices[left], origin), origin));
        const rightVector = normalize(projectToTangent(sub(dualVertices[right], origin), origin));
        const leftAngle = Math.atan2(dot(leftVector, basisY), dot(leftVector, basisX));
        const rightAngle = Math.atan2(dot(rightVector, basisY), dot(rightVector, basisX));
        return leftAngle - rightAngle;
      });
      faces.push(ordered);
    }
    return scaleMeshToRadius({ vertices: dualVertices, faces: faces.map((face) => orientFace(face, dualVertices)) }, radius);
  };

  const createDodecahedronMesh = (radius) => dualMesh(createIcosahedronMesh(1), radius);

  // Class-I geodesic sphere: subdivide every icosahedron face into a frequency×
  // frequency triangular grid and re-project each new vertex onto the sphere.
  // Vertices shared across faces are welded by quantized position so edges and
  // the dual stay watertight. frequency 1 reproduces the icosahedron.
  const createGeodesicMesh = (radius, frequency) => {
    const nu = Math.max(1, Math.round(finite(frequency, 1)));
    const base = createIcosahedronMesh(1);
    const orientedFaces = base.faces.map((face) => orientFace(face, base.vertices));
    const vertices = [];
    const indexByKey = new Map();
    const addVertex = (pt) => {
      const unit = normalize(pt);
      const key = `${Math.round(unit.x * 1e5)}:${Math.round(unit.y * 1e5)}:${Math.round(unit.z * 1e5)}`;
      if (indexByKey.has(key)) return indexByKey.get(key);
      const index = vertices.length;
      vertices.push(mul(unit, radius));
      indexByKey.set(key, index);
      return index;
    };
    const faces = [];
    orientedFaces.forEach(([ia, ib, ic]) => {
      const A = base.vertices[ia];
      const edgeB = sub(base.vertices[ib], A);
      const edgeC = sub(base.vertices[ic], A);
      const grid = [];
      for (let i = 0; i <= nu; i++) {
        grid[i] = [];
        for (let j = 0; j <= nu - i; j++) {
          grid[i][j] = addVertex(add(A, add(mul(edgeB, i / nu), mul(edgeC, j / nu))));
        }
      }
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nu - i; j++) {
          faces.push([grid[i][j], grid[i + 1][j], grid[i][j + 1]]);
          if (j < nu - i - 1) faces.push([grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]);
        }
      }
    });
    return withBounds({ vertices, faces: faces.map((face) => orientFace(face, vertices)) });
  };

  const createSolidMesh = (p) => {
    const type = p.solidType || 'buckyball';
    const radius = Math.max(1, finite(p.radius, 76));
    const sides = Math.max(3, Math.round(clamp(finite(p.sideCount, 5), 3, 180)));
    const depth = Math.max(0.1, finite(p.depth, 94));
    const frequency = Math.max(1, Math.round(clamp(finite(p.frequency, 2), 1, 6)));
    if (type === 'importedMesh') {
      const mesh = p.importedMesh;
      if (!mesh || !Array.isArray(mesh.vertices) || !mesh.vertices.length || !Array.isArray(mesh.faces)) {
        return { vertices: [], faces: [] };
      }
      return withBounds({
        vertices: mesh.vertices.map((vt) => v(finite(vt.x) * radius, finite(vt.y) * radius, finite(vt.z) * radius)),
        faces: mesh.faces.map((f) => f.slice()),
      });
    }
    if (type === 'flatPolygon') {
      return withBounds({ vertices: regularRing(sides, radius, 0), faces: [Array.from({ length: sides }, (_, i) => i)] });
    }
    if (type === 'prism' || type === 'antiprism') {
      const top = regularRing(sides, radius, depth / 2, type === 'antiprism' ? Math.PI / sides - Math.PI / 2 : -Math.PI / 2);
      const bottom = regularRing(sides, radius, -depth / 2, -Math.PI / 2);
      const vertices = top.concat(bottom);
      const faces = [Array.from({ length: sides }, (_, i) => i), Array.from({ length: sides }, (_, i) => sides + sides - 1 - i)];
      for (let i = 0; i < sides; i++) {
        const n = (i + 1) % sides;
        if (type === 'antiprism') {
          // Top ring is offset by +π/sides, so each top vertex sits between
          // bottom_i and bottom_{i+1}. Pair it with those two nearest bottom
          // vertices to get the uniform isosceles zig-zag band of a true
          // antiprism (the previous pairing spanned 1.5 steps and skewed it).
          faces.push([i, sides + i, sides + n]);
          faces.push([i, sides + n, n]);
        } else {
          faces.push([i, n, sides + n, sides + i]);
        }
      }
      // The prism's hand-built side quads wind INWARD ([i, n, bottom_n, bottom_i]
      // traverses clockwise as seen from outside), so their normals point at the
      // axis and 'Faces → Front' culls the faces you should see — leaving gaps.
      // orientFace re-winds every face outward (a no-op for the antiprism, whose
      // zig-zag band is already correct).
      return withBounds({ vertices, faces: faces.map((face) => orientFace(face, vertices)) });
    }
    if (type === 'bipyramid') {
      const ring = regularRing(sides, radius, 0);
      const top = ring.length;
      const bottom = top + 1;
      const vertices = ring.concat([v(0, 0, depth / 2), v(0, 0, -depth / 2)]);
      const faces = [];
      for (let i = 0; i < sides; i++) {
        const n = (i + 1) % sides;
        faces.push([top, i, n]);
        faces.push([bottom, n, i]);
      }
      return withBounds({ vertices, faces });
    }
    if (type === 'cone') {
      // Faceted pyramid: an n-gon base ring with a single apex. As `sides`
      // climbs it converges on a smooth cone. Sweep family — sideCount + depth.
      const ring = regularRing(sides, radius, -depth / 2);
      const vertices = ring.concat([v(0, 0, depth / 2)]);
      const apex = sides;
      const faces = [Array.from({ length: sides }, (_, i) => i)];
      for (let i = 0; i < sides; i++) faces.push([apex, i, (i + 1) % sides]);
      return withBounds({ vertices, faces: faces.map((face) => orientFace(face, vertices)) });
    }
    if (type === 'frustum') {
      // Truncated pyramid: bottom n-gon (radius) + aligned top n-gon scaled by
      // `taper`, joined by side quads. taper→1 approaches a prism, taper→0 a cone.
      const taper = clamp(finite(p.taper, 55) / 100, 0.01, 1);
      const bottom = regularRing(sides, radius, -depth / 2);
      const top = regularRing(sides, radius * taper, depth / 2);
      const vertices = bottom.concat(top);
      const faces = [
        Array.from({ length: sides }, (_, i) => i),
        Array.from({ length: sides }, (_, i) => sides + i),
      ];
      for (let i = 0; i < sides; i++) {
        const n = (i + 1) % sides;
        faces.push([i, n, sides + n, sides + i]);
      }
      return withBounds({ vertices, faces: faces.map((face) => orientFace(face, vertices)) });
    }
    if (type === 'cupola') {
      // Generalized cupola: a 2n-gon base lifted to an n-gon top (scaled by
      // `taper`) through an alternating band of triangles and squares. Each top
      // vertex sits over a base-edge midpoint, so every top edge gets a square to
      // the two base vertices beneath it and every top vertex gets a triangle to
      // the base vertex between squares. (Exact Johnson closure only at n=3,4,5;
      // for plotter art the generalized band reads cleanly at any n.)
      const taper = clamp(finite(p.taper, 55) / 100, 0.05, 0.98);
      const baseN = sides * 2;
      const bottom = regularRing(baseN, radius, -depth / 2, -Math.PI / 2);
      const top = regularRing(sides, radius * taper, depth / 2, -Math.PI / 2 + Math.PI / baseN);
      const vertices = bottom.concat(top);
      const faces = [
        Array.from({ length: baseN }, (_, i) => i),
        Array.from({ length: sides }, (_, i) => baseN + i),
      ];
      for (let i = 0; i < sides; i++) {
        const ti = baseN + i;
        const tNext = baseN + ((i + 1) % sides);
        const b0 = (2 * i) % baseN;
        const b1 = (2 * i + 1) % baseN;
        const b2 = (2 * i + 2) % baseN;
        faces.push([b0, b1, ti]);
        faces.push([b1, b2, tNext, ti]);
      }
      return withBounds({ vertices, faces: faces.map((face) => orientFace(face, vertices)) });
    }
    if (type === 'starPrism') {
      // Star-polygon profile (sides points alternating between `radius` and
      // `radius * starRatio`) extruded to `depth`. Lower starRatio = pointier star.
      const ratio = clamp(finite(p.starRatio, 45) / 100, 0.05, 0.95);
      const makeStar = (z) => {
        const out = [];
        for (let i = 0; i < sides * 2; i++) {
          const a = -Math.PI / 2 + (i / (sides * 2)) * TAU;
          const rr = i % 2 === 0 ? radius : radius * ratio;
          out.push(v(Math.cos(a) * rr, Math.sin(a) * rr, z));
        }
        return out;
      };
      const m = sides * 2;
      const top = makeStar(depth / 2);
      const bottom = makeStar(-depth / 2);
      const vertices = top.concat(bottom);
      const faces = [
        Array.from({ length: m }, (_, i) => i),
        Array.from({ length: m }, (_, i) => m + i),
      ];
      for (let i = 0; i < m; i++) {
        const n = (i + 1) % m;
        faces.push([i, n, m + n, m + i]);
      }
      // orientFace now resolves the concave star caps correctly because faceNormal
      // uses Newell's method (geometry3d.js) — the true area normal, not a
      // first-three-points sample that the caps' concavity would flip.
      return withBounds({ vertices, faces: faces.map((face) => orientFace(face, vertices)) });
    }
    if (type === 'tetrahedron') {
      const a = radius / Math.sqrt(3);
      return withBounds({
        vertices: [v(a, a, a), v(-a, -a, a), v(-a, a, -a), v(a, -a, -a)].map((pt) => mul(normalize(pt), radius)),
        faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
      });
    }
    if (type === 'cube') {
      const r = radius / Math.sqrt(3);
      return withBounds({
        vertices: [
          v(-r, -r, -r), v(r, -r, -r), v(r, r, -r), v(-r, r, -r),
          v(-r, -r, r), v(r, -r, r), v(r, r, r), v(-r, r, r),
        ],
        faces: [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]],
      });
    }
    if (type === 'octahedron') {
      return withBounds({
        vertices: [v(radius, 0, 0), v(-radius, 0, 0), v(0, radius, 0), v(0, -radius, 0), v(0, 0, radius), v(0, 0, -radius)],
        faces: [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]],
      });
    }
    if (type === 'dodecahedron') {
      return createDodecahedronMesh(radius);
    }
    if (type === 'icosahedron') {
      return createIcosahedronMesh(radius);
    }
    if (type === 'geodesic') {
      return createGeodesicMesh(radius, frequency);
    }
    if (type === 'goldberg') {
      return dualMesh(createGeodesicMesh(1, frequency), radius);
    }
    return createTruncatedIcosahedronMesh(radius);
  };

  const api = {
    // Tessellators
    weldMesh,
    makeGridMesh,
    makeBoxMesh,
    buildTopoformPrimitive,
    createTopoformMesh,
    // Mesh helpers
    regularRing,
    average3,
    lerp3,
    meshBounds,
    withBounds,
    scaleMeshToRadius,
    orientFace,
    projectToTangent,
    buildNeighborsByVertex,
    sortNeighborsAroundVertex,
    // Solid generators
    createIcosahedronMesh,
    createTruncatedIcosahedronMesh,
    dualMesh,
    createDodecahedronMesh,
    createGeodesicMesh,
    createSolidMesh,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Mesh: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
