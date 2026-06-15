/**
 * topoform algorithm definition.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const G3 = Vectura.Geometry3D;
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const {
    TAU,
    clamp,
    finite,
    v,
    add,
    mul,
    cross,
    normalize,
    rotatePoint,
    projectPoint,
    faceNormal,
    collectEdges,
    linkSegments,
    markHidden,
    cleanPaths,
    extractCreases,
    occludeSegments,
    lambertHatch,
    resolveLight,
    applyDepthCue,
  } = G3;

  // A 3D enhancement is active only when at least one opt-in toggle is set; this
  // gate keeps the legacy path byte-identical when every control sits at its
  // default (all off). Hidden-line is "on" only for the non-backface modes.
  const hiddenLineActive = (p) => (p.hiddenLineMode || 'backface') !== 'backface';

  // Front-facing screen polygons (with mean rotated z as painter depth) used as
  // occluders for hidden-line removal/dashing. Built from the projected mesh.
  const buildOccluders = (mesh, projected, bounds, cap) => {
    const occluders = [];
    for (let i = 0; i < mesh.faces.length; i++) {
      const face = mesh.faces[i];
      const rotated = face.map((idx) => projected[idx].rotated);
      if (faceNormal(rotated).z < -0.001) continue; // back face — not an occluder
      const polygon = face.map((idx) => {
        const pr = projected[idx].projected;
        return { x: pr.x, y: pr.y };
      });
      if (polygon.some((pt) => !Number.isFinite(pt.x) || !Number.isFinite(pt.y))) continue;
      const depth = rotated.reduce((sum, pt) => sum + pt.z, 0) / (rotated.length || 1);
      occluders.push({ polygon, depth });
      if (cap && occluders.length >= cap) break;
    }
    return occluders;
  };

  // Run hidden-line occlusion over already-built paths whose meta carries a
  // straight 2-point screen edge plus per-endpoint camera z (depthA/depthB).
  // Paths that are not simple straight segments are passed through untouched.
  const occludePaths = (paths, occluders, mode, depthBias) => {
    const out = [];
    paths.forEach((path) => {
      if (!path || !path.meta || path.meta.straight !== true || path.length !== 2 ||
          !Number.isFinite(path.meta.depthA) || !Number.isFinite(path.meta.depthB)) {
        out.push(path);
        return;
      }
      const meta = { ...path.meta };
      delete meta.depthA;
      delete meta.depthB;
      const seg = {
        a: { x: path[0].x, y: path[0].y, z: path.meta.depthA },
        b: { x: path[1].x, y: path[1].y, z: path.meta.depthB },
        meta,
      };
      occludeSegments([seg], occluders, { mode, depthBias }).forEach((p) => out.push(p));
    });
    return out;
  };

  // Point on the perimeter of the unit square [-1,1]^2, parameterised t in [0,1).
  const squarePerimeter = (t) => {
    const s = (((t % 1) + 1) % 1) * 4;
    const side = Math.floor(s);
    const f = s - side;
    if (side === 0) return { x: -1 + 2 * f, z: -1 };
    if (side === 1) return { x: 1, z: -1 + 2 * f };
    if (side === 2) return { x: 1 - 2 * f, z: 1 };
    return { x: -1, z: 1 - 2 * f };
  };

  const sgnPow = (value, exp) => Math.sign(value) * Math.pow(Math.abs(value), exp);

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

  const buildPrimitiveRaw = (p, detail) => {
    const mode = p.sourceMode || 'sphere';
    // Mesh size is driven solely by primitiveScaleX/Y/Z (defaulted in
    // ALGO_DEFAULTS). The legacy `artworkSize` fallback was removed (audit D2):
    // it was inert and duplicated primitiveScale. The numeric fallback (63 =
    // 150 * 0.42) preserves identical behaviour if a scale is ever absent.
    const sx = Math.max(1, finite(p.scaleX3d ?? p.primitiveScaleX, 63));
    const sy = Math.max(1, finite(p.scaleY3d ?? p.primitiveScaleY, 63));
    const sz = Math.max(1, finite(p.scaleZ3d ?? p.primitiveScaleZ, 63));
    if (mode === 'stlMesh') {
      const mesh = p.importedMesh;
      if (!mesh || !Array.isArray(mesh.vertices) || !mesh.vertices.length || !Array.isArray(mesh.faces)) {
        return { vertices: [], faces: [] };
      }
      return {
        vertices: mesh.vertices.map((vt) => v(finite(vt.x) * sx, finite(vt.y) * sy, finite(vt.z) * sz)),
        faces: mesh.faces,
      };
    }
    if (mode === 'torus') {
      const major = Math.max(2, sx * 0.75);
      const minor = Math.max(1, Math.min(sy, sz) * 0.28);
      return makeGridMesh(detail, detail * 2, (u, vv) => {
        const a = u * TAU;
        const b = vv * TAU;
        return v(Math.cos(a) * (major + Math.cos(b) * minor), Math.sin(b) * minor, Math.sin(a) * (major + Math.cos(b) * minor));
      }, true);
    }
    if (mode === 'cone') {
      return makeGridMesh(detail, detail * 2, (u, vv) => {
        const a = vv * TAU;
        const r = sx * (1 - u);
        return v(Math.cos(a) * r, (u - 0.5) * sy * 2, Math.sin(a) * r);
      });
    }
    if (mode === 'cube') {
      // Parametric subdivided box honouring `detail` with uniformly outward
      // winding (replaced the legacy 8-vert/12-tri cube whose top/left/front
      // faces wound inward and which ignored detail entirely).
      return makeBoxMesh(sx, sy, sz, detail);
    }
    if (mode === 'cylinder') {
      // Open tube: u sweeps around, vv runs along the height axis.
      return makeGridMesh(detail, detail * 2, (u, vv) => {
        const a = u * TAU;
        return v(Math.cos(a) * sx, (vv - 0.5) * sy * 2, Math.sin(a) * sz);
      }, true);
    }
    if (mode === 'capsule') {
      // Cylindrical body with hemispherical caps; vv runs bottom→top along the axis.
      const r = Math.max(1, Math.min(sx, sz));
      const half = Math.max(r, sy);
      const cylHalf = Math.max(0, half - r);
      const cylFrac = cylHalf / half;
      return makeGridMesh(detail, detail * 2, (u, vv) => {
        const a = u * TAU;
        const tt = vv * 2 - 1; // -1..1
        let yy;
        let rad;
        if (Math.abs(tt) <= cylFrac || cylFrac >= 1) {
          yy = tt * half;
          rad = r;
        } else {
          const sign = Math.sign(tt) || 1;
          const e = (Math.abs(tt) - cylFrac) / Math.max(1e-6, 1 - cylFrac);
          const ang = e * (Math.PI / 2);
          yy = sign * (cylHalf + Math.sin(ang) * r);
          rad = Math.cos(ang) * r;
        }
        return v(Math.cos(a) * rad * (sx / r), yy, Math.sin(a) * rad * (sz / r));
      }, true);
    }
    if (mode === 'pyramid') {
      // Square cross-section tapering to an apex; subdivides with detail.
      return makeGridMesh(detail, detail * 4, (u, vv) => {
        const edge = squarePerimeter(u);
        const taper = 1 - vv; // 1 at base, 0 at apex
        return v(edge.x * sx * taper, (vv - 0.5) * sy * 2, edge.z * sz * taper);
      }, true);
    }
    if (mode === 'superellipsoid') {
      const e1 = 0.4;
      const e2 = 0.4;
      return makeGridMesh(detail, detail * 2, (u, vv) => {
        const lon = (u - 0.5) * TAU;
        const lat = (vv - 0.5) * Math.PI;
        const cv = sgnPow(Math.cos(lat), e1);
        const sv = sgnPow(Math.sin(lat), e1);
        const cu = sgnPow(Math.cos(lon), e2);
        const su = sgnPow(Math.sin(lon), e2);
        return v(cv * cu * sx, sv * sy, cv * su * sz);
      }, true);
    }
    if (mode === 'torusKnot') {
      // (p,q) torus knot rendered as a swept tube; u runs along the knot, vv around the tube.
      const pK = 2;
      const qK = 3;
      const R = Math.max(2, sx * 0.62);
      const tubeR = Math.max(1, Math.min(sy, sz) * 0.24);
      const knotCenter = (t) => {
        const r = R * (2 + Math.cos(qK * t)) * 0.5;
        return v(r * Math.cos(pK * t), R * Math.sin(qK * t) * 0.5, r * Math.sin(pK * t));
      };
      return makeGridMesh(detail, detail * 4, (u, vv) => {
        const t = u * TAU;
        const phi = vv * TAU;
        const center = knotCenter(t);
        const ahead = knotCenter(t + 0.01);
        const tangent = normalize(v(ahead.x - center.x, ahead.y - center.y, ahead.z - center.z));
        const refUp = Math.abs(tangent.y) > 0.9 ? v(1, 0, 0) : v(0, 1, 0);
        const binormal = normalize(cross(tangent, refUp));
        const normal = normalize(cross(binormal, tangent));
        return add(center, add(mul(normal, Math.cos(phi) * tubeR), mul(binormal, Math.sin(phi) * tubeR)));
      }, true);
    }
    return makeGridMesh(detail, detail * 2, (u, vv) => {
      const lat = (u - 0.5) * Math.PI;
      const lon = vv * TAU;
      const rx = mode === 'ellipsoid' ? sx * 1.18 : sx;
      const ry = mode === 'ellipsoid' ? sy * 0.72 : sy;
      const rz = sz;
      return v(Math.cos(lon) * Math.cos(lat) * rx, Math.sin(lat) * ry, Math.sin(lon) * Math.cos(lat) * rz);
    });
  };

  // Weld de-fans the UV poles (collapsing the coincident pole row + dropping the
  // zero-area cap slivers) and shares the box's edge vertices. Applied as a wrapper
  // around the raw builder. An imported STL mesh is left as-is.
  const createPrimitiveMesh = (p, detail) => {
    const mesh = buildPrimitiveRaw(p, detail);
    if ((p.sourceMode || 'sphere') === 'stlMesh') return mesh;
    return weldMesh(mesh);
  };

  const project3 = (pt, p, bounds) => {
    const rotated = rotatePoint(pt, { yaw: finite(p.yaw, -28), pitch: finite(p.pitch, 34), roll: finite(p.roll, 0) });
    return {
      rotated,
      projected: projectPoint(rotated, { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) }),
    };
  };

  const trianglePlaneSegment = (tri, z) => {
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const a = tri[i];
      const b = tri[(i + 1) % 3];
      const da = a.z - z;
      const db = b.z - z;
      if (Math.abs(da) < 1e-6) pts.push(a);
      if (da * db < 0) {
        const t = Math.abs(da) / (Math.abs(da) + Math.abs(db));
        pts.push(v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, z));
      }
    }
    if (pts.length < 2) return null;
    return [pts[0], pts[1]];
  };

  // A UV pole (welded grid-row collapse) becomes one high-valence vertex shared
  // by a whole ring of cap triangles. Every meridian edge of that ring runs to
  // the pole, so the wireframe paints a radial fan of tiny spokes — the camera-
  // facing pole reads as an "asterisk/star" instead of clean nested rings. Flag
  // vertices whose incident-face count far exceeds the regular grid valence (~6)
  // as poles; the wireframe then suppresses only the SHORT screen spokes incident
  // on them (preserving the circumferential ring edges and all non-pole geometry).
  const POLE_VALENCE = 8;
  // Only SMOOTH UV poles (the sphere family + capsule hemispheres) get de-fanned:
  // there the converging spokes are a tessellation artifact, not a feature. A
  // SHARP apex (cone tip, pyramid point) is also a high-valence vertex, but its
  // spokes are genuine silhouette-defining edges, so those primitives are excluded
  // and their tips are never thinned.
  const SMOOTH_POLE_SOURCES = new Set(['sphere', 'ellipsoid', 'superellipsoid', 'capsule']);
  const findPoleVertices = (mesh) => {
    const valence = new Array(mesh.vertices.length).fill(0);
    mesh.faces.forEach((face) => face.forEach((idx) => { valence[idx]++; }));
    const poles = new Set();
    for (let i = 0; i < valence.length; i++) if (valence[i] >= POLE_VALENCE) poles.add(i);
    return poles;
  };

  const buildWireframe = (mesh, p, bounds, flags = {}) => {
    const projected = mesh.vertices.map((pt) => project3(pt, p, bounds));
    const faceFront = mesh.faces.map((face) => {
      const pts = face.map((idx) => projected[idx].rotated);
      return faceNormal(pts).z >= -0.001;
    });
    const full = (p.contourVisibility || 'visibleOnly') === 'fullContour';
    const poles = SMOOTH_POLE_SOURCES.has(p.sourceMode) ? findPoleVertices(mesh) : new Set();
    // Screen-space spoke threshold scales with the projected mesh extent so it is
    // resolution/scale-independent. At 4% of the projected diagonal it drops the
    // short foreshortened spokes that form the dense camera-facing "asterisk" at
    // higher detail, while a coarse mesh's pole (e.g. an 8-spoke sphere at detail
    // 8, whose spokes read at full length) stays intact — so the pole never
    // becomes a hole. Sharp apexes are already excluded by SMOOTH_POLE_SOURCES.
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    if (poles.size) {
      projected.forEach((pr) => {
        const q = pr.projected;
        if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return;
        if (q.x < minX) minX = q.x;
        if (q.x > maxX) maxX = q.x;
        if (q.y < minY) minY = q.y;
        if (q.y > maxY) maxY = q.y;
      });
    }
    const spokeThreshold = poles.size ? Math.hypot(maxX - minX, maxY - minY) * 0.04 : 0;
    const paths = [];
    collectEdges(mesh.faces).forEach((edge) => {
      const front = edge.faces.some((idx) => faceFront[idx]);
      if (!front && !full) return;
      const pa = projected[edge.a].projected;
      const pb = projected[edge.b].projected;
      // De-fan: drop a short spoke incident on a pole vertex.
      if (spokeThreshold > 0 && (poles.has(edge.a) || poles.has(edge.b))) {
        if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < spokeThreshold) return;
      }
      const path = [pa, pb].map((pt) => ({ x: pt.x, y: pt.y }));
      path.meta = { algorithm: 'topoform', straight: true, meshEdge: true };
      const za = projected[edge.a].rotated.z;
      const zb = projected[edge.b].rotated.z;
      if (flags.depthCue) path.meta.depth = (za + zb) / 2;
      if (flags.occlude) { path.meta.depthA = za; path.meta.depthB = zb; }
      if (!front) markHidden(path);
      paths.push(path);
    });
    return paths;
  };

  // A depth-slice plane that grazes a single triangle almost exactly at a vertex
  // yields a 2-point segment whose endpoints fall inside the linkSegments rounding
  // cell (3-decimal / 1e-3 grid), so it never joins a contour ring and survives
  // cleanPath's 1e-6 dedupe — the canvas then paints it as a stray dot (stroke
  // width + round caps) despite ~0.0004-unit extent. Drop any path whose extent
  // is a negligible fraction of the whole drawing (resolution/scale-independent;
  // real fragments sit ~100x above this floor).
  const dropDegeneratePaths = (paths) => {
    if (!Array.isArray(paths) || paths.length === 0) return paths;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    const extents = paths.map((path) => {
      let aX = Infinity; let aY = Infinity; let bX = -Infinity; let bY = -Infinity;
      for (let i = 0; i < path.length; i++) {
        const pt = path[i];
        if (pt.x < aX) aX = pt.x;
        if (pt.x > bX) bX = pt.x;
        if (pt.y < aY) aY = pt.y;
        if (pt.y > bY) bY = pt.y;
      }
      if (aX < minX) minX = aX;
      if (bX > maxX) maxX = bX;
      if (aY < minY) minY = aY;
      if (bY > maxY) maxY = bY;
      return Math.hypot(bX - aX, bY - aY);
    });
    const overall = Math.hypot(maxX - minX, maxY - minY);
    if (!(overall > 0)) return paths;
    const minExtent = overall * 1e-4;
    return paths.filter((_, i) => extents[i] >= minExtent);
  };

  const buildContours = (mesh, p, bounds, flags = {}) => {
    const planeVertices = mesh.vertices.map((pt) => rotatePoint(pt, {
      yaw: finite(p.planeRotate, 0),
      pitch: finite(p.planeTilt, 0),
    }));
    let minZ = Infinity;
    let maxZ = -Infinity;
    planeVertices.forEach((pt) => {
      minZ = Math.min(minZ, pt.z);
      maxZ = Math.max(maxZ, pt.z);
    });
    const count = Math.max(2, Math.round(clamp(finite(p.lineCount, 26), 2, 120)));
    const full = (p.contourVisibility || 'visibleOnly') === 'fullContour';
    const stampDepth = flags.depthCue || flags.occlude;
    const paths = [];
    for (let level = 1; level <= count; level++) {
      const z = minZ + (level / (count + 1)) * (maxZ - minZ || 1);
      const visibleSegments = [];
      const hiddenSegments = [];
      // Parallel array of mean rotated camera-z per slice segment, only when a
      // depth-aware enhancement needs it (keeps the legacy path allocation-free).
      const visibleDepths = stampDepth ? [] : null;
      const hiddenDepths = stampDepth ? [] : null;
      mesh.faces.forEach((face) => {
        const tri = face.map((idx) => planeVertices[idx]);
        const seg = trianglePlaneSegment(tri, z);
        if (!seg) return;
        const rotatedTri = tri.map((pt) => rotatePoint(pt, { yaw: finite(p.yaw, -28), pitch: finite(p.pitch, 34), roll: finite(p.roll, 0) }));
        const front = faceNormal(rotatedTri).z >= -0.001;
        if (!front && !full) return;
        const projectedSeg = seg.map((pt) => project3(pt, p, bounds));
        const projected = projectedSeg.map((pr) => pr.projected);
        if (flags.occlude) {
          // Carry per-endpoint camera z on the slice segment for occlusion.
          projected.za = projectedSeg[0].rotated.z;
          projected.zb = projectedSeg[1].rotated.z;
        }
        (front ? visibleSegments : hiddenSegments).push(projected);
        if (stampDepth) {
          const meanZ = (projectedSeg[0].rotated.z + projectedSeg[1].rotated.z) / 2;
          (front ? visibleDepths : hiddenDepths).push(meanZ);
        }
      });
      if (flags.occlude) {
        // Hidden-line mode: emit raw, occludable 2-point slice segments (with
        // per-endpoint camera z) instead of linked+smoothed polylines, so the
        // painter occluder can split them where front faces hide them.
        const emitRaw = (segments, depths, hidden) => {
          segments.forEach((seg, i) => {
            const path = [{ x: seg[0].x, y: seg[0].y }, { x: seg[1].x, y: seg[1].y }];
            path.meta = { algorithm: 'topoform', contour: true, straight: true };
            path.meta.depthA = seg.za;
            path.meta.depthB = seg.zb;
            if (flags.depthCue && depths && depths[i] != null) path.meta.depth = depths[i];
            if (hidden) markHidden(path);
            paths.push(path);
          });
        };
        emitRaw(visibleSegments, visibleDepths, false);
        emitRaw(hiddenSegments, hiddenDepths, true);
      } else {
        // A contour curves when the layer's Curves toggle is on OR the Contour
        // Smoothing slider is raised (smoothing implies curves for back-compat).
        // Curves-on is the master enable; Contour Smoothing controls how hard the
        // oversampled slice polyline is simplified before bezier handles are fit,
        // so the result is smooth AND lean ("optimized, elegant lines" on export).
        const smoothAmt = clamp(finite(p.contourSmoothing, 0), 0, 100);
        const curvesOn = p.curves === true;
        const wantBezier = curvesOn || smoothAmt > 0;
        const emit = (segments, depths, hidden) => {
          linkSegments(segments).forEach((path) => {
            path.meta = { algorithm: 'topoform', contour: true, straight: true };
            if (stampDepth && depths && depths.length) {
              // Representative depth = mean of all contributing slice midpoints.
              path.meta.depth = depths.reduce((s, d) => s + d, 0) / depths.length;
            }
            if (wantBezier) {
              // Tolerance scales with each contour's own bounding-box diagonal so it
              // adapts to artwork size: Curves-on alone trims the densest oversampling
              // (~0.4% of the diagonal); the slider drives it up to ~2.4%.
              let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
              for (let i = 0; i < path.length; i++) {
                const pt = path[i];
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
              }
              const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
              const tol = Math.max(curvesOn ? diag * 0.004 : 0, (smoothAmt / 100) * diag * 0.024);
              // Tension floor keeps Curves-on smooth even at smoothing 0 (else the
              // simplified anchors would join as flat, faceted chords).
              const tension = Math.min(100, 55 + smoothAmt * 0.45);
              path = G3.smoothToBezier(path, tension, { simplifyTolerance: tol });
            }
            if (hidden) markHidden(path);
            paths.push(path);
          });
        };
        emit(visibleSegments, visibleDepths, false);
        emit(hiddenSegments, hiddenDepths, true);
      }
    }
    return paths;
  };

  const buildSilhouette = (mesh, p, bounds, flags = {}) => {
    // Gate on the legacy outline toggle OR the new emphasizeOutline enhancement.
    const emphasize = p.emphasizeOutline === true;
    if (p.showOutline === false && !emphasize) return [];
    const projected = mesh.vertices.map((pt) => project3(pt, p, bounds));
    const faceFront = mesh.faces.map((face) => faceNormal(face.map((idx) => projected[idx].rotated)).z >= -0.001);
    const weightScale = emphasize ? Math.max(0.1, finite(p.outlineWeight, 2)) : null;
    const paths = [];
    collectEdges(mesh.faces).forEach((edge) => {
      const sides = edge.faces.map((idx) => faceFront[idx]);
      if (sides.length < 2 || sides[0] === sides[1]) return;
      const path = [projected[edge.a].projected, projected[edge.b].projected].map((pt) => ({ x: pt.x, y: pt.y }));
      path.meta = { algorithm: 'topoform', silhouette: true, straight: true };
      // #3 emphasize: stamp the outline weight so the renderer/SVG draws it heavier.
      if (weightScale != null) { path.meta.outline = true; path.meta.weightScale = weightScale; }
      if (flags.depthCue) {
        path.meta.depth = (projected[edge.a].rotated.z + projected[edge.b].rotated.z) / 2;
      }
      paths.push(path);
    });
    return paths;
  };

  // #3 — crease (feature-edge) extraction. Per-face normals are computed from the
  // rotated (camera-space) face vertices so the threshold is view-consistent.
  const buildCreases = (mesh, p, bounds, flags = {}) => {
    const projectedVerts = mesh.vertices.map((pt) => project3(pt, p, bounds));
    const projected = projectedVerts.map((pr) => ({ x: pr.projected.x, y: pr.projected.y }));
    const faceNormals = mesh.faces.map((face) => faceNormal(face.map((idx) => projectedVerts[idx].rotated)));
    const edges = collectEdges(mesh.faces);
    const paths = extractCreases(edges, faceNormals, finite(p.creaseAngle, 35), projected, {
      weightScale: Math.max(0.1, finite(p.outlineWeight, 2)),
    });
    // Map a screen point back to a vertex camera z for optional depth cueing.
    const zByKey = flags.depthCue ? new Map() : null;
    if (zByKey) {
      projectedVerts.forEach((pr) => {
        zByKey.set(`${pr.projected.x.toFixed(3)},${pr.projected.y.toFixed(3)}`, pr.rotated.z);
      });
    }
    paths.forEach((path) => {
      path.meta = { ...(path.meta || {}), algorithm: 'topoform' };
      if (zByKey && path.length === 2) {
        const za = zByKey.get(`${path[0].x.toFixed(3)},${path[0].y.toFixed(3)}`);
        const zb = zByKey.get(`${path[1].x.toFixed(3)},${path[1].y.toFixed(3)}`);
        if (Number.isFinite(za) && Number.isFinite(zb)) path.meta.depth = (za + zb) / 2;
      }
    });
    return paths;
  };

  // #5 — Lambert-shaded hatching, one pass per FRONT face. Spacing is raised and
  // the face count capped during a fast preview to keep live drags responsive.
  const buildHatching = (mesh, p, bounds, preview) => {
    const projectedVerts = mesh.vertices.map((pt) => project3(pt, p, bounds));
    const light = resolveLight(p);
    const baseSpacing = Math.max(1, finite(p.hatchSpacing, 6) * (preview ? 2 : 1));
    const angleDeg = finite(p.hatchAngle, 45);
    const crossHatch = p.crossHatch === true;
    const maxFaces = preview ? G3.previewCap(bounds, 600) : 4000;
    const paths = [];
    let faceCount = 0;
    for (let i = 0; i < mesh.faces.length; i++) {
      if (faceCount >= maxFaces) break;
      const face = mesh.faces[i];
      const rotated = face.map((idx) => projectedVerts[idx].rotated);
      const normal = faceNormal(rotated);
      if (normal.z < -0.001) continue; // hatch only front faces
      const polygon = face.map((idx) => {
        const pr = projectedVerts[idx].projected;
        return { x: pr.x, y: pr.y };
      });
      if (polygon.some((pt) => !Number.isFinite(pt.x) || !Number.isFinite(pt.y))) continue;
      const segments = lambertHatch(normal, light, polygon, { baseSpacing, angleDeg, crossHatch });
      segments.forEach((seg) => {
        seg.meta = { ...(seg.meta || {}), algorithm: 'topoform' };
        paths.push(seg);
      });
      faceCount++;
    }
    return paths;
  };

  // Specular highlight — a small filled dot at the point where the LIGHT reflects
  // toward the camera (a true specular spot), NOT at the geometric pole. Position
  // is driven by the light direction (`lightAzimuth`/`lightElevation`): the
  // half-vector H = normalize(L + V) (V = camera, +z) defines the ideal mirror
  // normal, and the highlight sits on the surface vertex whose camera-space normal
  // is most aligned with H — so it moves over the shape as the light or the view
  // changes. `specularSize` (0–100) scales the dot. Drawn only when the spot faces
  // the camera; returns [] when off-screen, behind, or size 0.
  const buildSpecularHighlight = (mesh, p, bounds) => {
    const size = clamp(finite(p.specularSize, 35), 0, 100);
    if (size <= 0 || !mesh.vertices.length) return [];
    const light = resolveLight(p);
    // Half-vector between the light and the view direction (camera looks down +z
    // here — front faces have normal.z >= ~0). Its surface point is the mirror spot.
    const half = normalize(v(light.x, light.y, light.z + 1));
    const projected = mesh.vertices.map((pt) => project3(pt, p, bounds));
    let bestDot = -Infinity;
    let bestIdx = -1;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (let i = 0; i < projected.length; i++) {
      const r = projected[i].rotated;
      // Outward normal ≈ the (centred) vertex direction in camera space.
      const n = normalize(r);
      const d = n.x * half.x + n.y * half.y + n.z * half.z;
      if (d > bestDot) { bestDot = d; bestIdx = i; }
      const q = projected[i].projected;
      if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.y > maxY) maxY = q.y;
    }
    if (bestIdx < 0) return [];
    // The mirror spot must face the camera to be visible.
    if (normalize(projected[bestIdx].rotated).z < -0.05) return [];
    const c = projected[bestIdx].projected;
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return [];
    const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
    const radius = Math.max(0.8, diag * (size / 100) * 0.06); // scalable dot
    const dot = G3.circlePath(c.x, c.y, radius, 28, { algorithm: 'topoform', specular: true, fill: true });
    return [dot];
  };

  window.Vectura.AlgorithmRegistry.topoform = {
    generate: (params = {}, rng, noise, bounds = {}) => {
      const p = params || {};
      const preview = Boolean(p.fastPreview || bounds.fastPreview);
      const simplify = clamp(finite(p.simplifyMesh, 0), 0, 1);
      const rawDetail = clamp(finite(p.primitiveDetail, 18), 4, preview ? G3.previewCap(bounds, 100) : 100);
      const detail = Math.max(4, Math.round(rawDetail * (1 - simplify * 0.65)));
      const mesh = createPrimitiveMesh(p, detail);

      // Test-only mesh probe: when Vectura.__captureMesh is set, expose the
      // built primitive mesh so unit tests can assert vertex/face winding
      // without reaching into this IIFE. Inert in production (flag never set).
      if (Vectura.__captureMesh) Vectura.__lastMesh = mesh;

      // Scene lighting master gate (default OFF). When NOT explicitly true, all
      // LIGHT-derived output is suppressed: hatching (Lambert tonal fill) and
      // depth cueing (its dash modulation is a lighting/shading effect, not
      // visibility). Pure-geometry output — contours, wireframe, silhouette,
      // creases, outline emphasis — is unaffected, and hidden-line occlusion
      // (hiddenLineMode) is VISIBILITY, not lighting, so it stays gated only by
      // its own control. Since hatch + depthCue already default off, the default
      // render stays byte-identical with this gate present.
      const lightingOn = p.sceneLighting === true;

      // Resolve the opt-in 3D enhancement toggles (all default OFF → legacy path).
      const depthCueOn = lightingOn && (p.depthCue || 'off') !== 'off';
      const occludeOn = hiddenLineActive(p);
      const flags = { depthCue: depthCueOn, occlude: occludeOn };

      let paths = [];
      const mode = p.renderMode || 'contours';
      if (mode === 'wireframe' || mode === 'triangleMesh') paths = buildWireframe(mesh, p, bounds, flags);
      else paths = buildContours(mesh, p, bounds, flags);

      // #4 hidden-line: occlude the (straight, depth-carrying) wireframe/contour
      // segments against the front-facing screen polygons. 'dash' marks hidden
      // runs; anything else ('remove') drops them.
      if (occludeOn) {
        const occCap = preview ? G3.previewCap(bounds, 1200) : 0;
        const occluders = buildOccluders(mesh, mesh.vertices.map((pt) => project3(pt, p, bounds)), bounds, occCap);
        const occMode = (p.hiddenLineMode === 'dash') ? 'dash' : 'remove';
        paths = occludePaths(paths, occluders, occMode, finite(p.depthBias, 0.5));
      }

      paths.push(...buildSilhouette(mesh, p, bounds, flags));

      // #3 creases — feature edges sharper than creaseAngle.
      if (p.showCreases === true) paths.push(...buildCreases(mesh, p, bounds, flags));

      // #5 hatching — Lambert tonal fill on front faces. Lighting-derived, so
      // gated behind the scene-lighting master switch.
      if (lightingOn && p.hatchEnable === true) paths.push(...buildHatching(mesh, p, bounds, preview));

      // #2 depth cue — stamp dash density by per-path camera depth (no-op when off,
      // skips hidden-line paths). Runs once, just before the final cleanup.
      // Lighting-derived shading effect → only when scene lighting is on.
      if (lightingOn) applyDepthCue(paths, p);

      // Specular Highlight (opt-in): a light-positioned mirror dot. Drawn before
      // the cleanup; its bbox is well above the degenerate floor, so it survives.
      if (p.specularHighlight === true) paths.push(...buildSpecularHighlight(mesh, p, bounds));
      return dropDegeneratePaths(cleanPaths(paths));
    },
    formula: () => 'Primitive mesh sliced by depth planes or drawn as a projected wireframe.',
  };
})();
