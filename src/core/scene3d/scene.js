/**
 * Scene3D.Scene — S1 assembly + S2 projection for the scene3d layer.
 *
 * Builds each object's mesh (dispatching to the Scene3D.Mesh builders),
 * applies the object transform (scale → yaw/pitch/roll → translate), rotates
 * the world by the camera angles, and projects through the shared
 * Geometry3D resolveProjection/projectPoint pipeline about
 * (bounds.width/2, bounds.height/2). World units ARE document mm.
 *
 * Face identity (A-07): box faces carry semantic ids 'face:+X' … 'face:-Z';
 * every other primitive uses 'face:<index>', stable for fixed params. The
 * ground plane is a first-class styleable record (objectId 'ground') that
 * NEVER occludes (F-03) and renders double-sided.
 *
 * Camera-space depth convention: larger z = nearer (matches Geometry3D).
 * CONTRACT B's sceneTarget.depth (bigger = farther) is stamped as -z by the
 * orchestrator.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};
  // Lazy resolve — see mesh.js getCharts: capturing the Mesh namespace at IIFE
  // load stranded an empty {} if load order ever placed mesh.js after this
  // module. Read it on demand instead.
  const getMesh = () => (Vectura.Scene3D && Vectura.Scene3D.Mesh) || {};

  const {
    finite,
    v,
    add,
    sub,
    mul,
    dot,
    normalize,
    rotatePoint,
    projectPoint,
    resolveProjection,
    faceNormal,
    collectEdges,
    previewDetailScale,
  } = G3;

  // ── Primitive meshes with deterministic face ids ───────────────────────────

  // Semantic box: 8 shared-corner vertices, 6 outward-wound quads in the fixed
  // order +X, -X, +Y, -Y, +Z, -Z. Each face's (tangent, bitangent) basis is
  // right-handed with cross(t, b) === n, and the quad is traversed CCW in that
  // basis, so the Newell normal (Geometry3D.faceNormal) points outward.
  const BOX_FACES = [
    { id: 'face:+X', n: v(1, 0, 0), t: v(0, 0, -1), b: v(0, 1, 0) },
    { id: 'face:-X', n: v(-1, 0, 0), t: v(0, 0, 1), b: v(0, 1, 0) },
    { id: 'face:+Y', n: v(0, 1, 0), t: v(1, 0, 0), b: v(0, 0, -1) },
    { id: 'face:-Y', n: v(0, -1, 0), t: v(1, 0, 0), b: v(0, 0, 1) },
    { id: 'face:+Z', n: v(0, 0, 1), t: v(1, 0, 0), b: v(0, 1, 0) },
    { id: 'face:-Z', n: v(0, 0, -1), t: v(-1, 0, 0), b: v(0, 1, 0) },
  ];
  const QUAD_UV = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; // CCW in (t, b)

  const buildBoxMesh = (params) => {
    const hx = Math.max(0.01, finite(params.sx, 40)) / 2;
    const hy = Math.max(0.01, finite(params.sy, 40)) / 2;
    const hz = Math.max(0.01, finite(params.sz, 40)) / 2;
    const vertices = [];
    const indexByKey = new Map();
    const addVertex = (pt) => {
      const key = `${pt.x.toFixed(6)},${pt.y.toFixed(6)},${pt.z.toFixed(6)}`;
      if (indexByKey.has(key)) return indexByKey.get(key);
      const index = vertices.length;
      vertices.push(pt);
      indexByKey.set(key, index);
      return index;
    };
    const faces = [];
    const faceIds = [];
    BOX_FACES.forEach((f) => {
      faces.push(QUAD_UV.map(([u, w]) => addVertex(v(
        (f.n.x + f.t.x * u + f.b.x * w) * hx,
        (f.n.y + f.t.y * u + f.b.y * w) * hy,
        (f.n.z + f.t.z * u + f.b.z * w) * hz,
      ))));
      faceIds.push(f.id);
    });
    return { vertices, faces, faceIds };
  };

  // Trivial plane: one quad at y = 0 with outward (up) normal +Y.
  const buildPlaneMesh = (params) => {
    const hx = Math.max(0.01, finite(params.sx, 120)) / 2;
    const hz = Math.max(0.01, finite(params.sz, 120)) / 2;
    // t = +X, b = -Z → cross(t, b) = +Y (Newell normal up).
    const vertices = [
      v(-hx, 0, hz), v(hx, 0, hz), v(hx, 0, -hz), v(-hx, 0, -hz),
    ];
    return { vertices, faces: [[0, 1, 2, 3]], faceIds: ['face:+Y'] };
  };

  const TOPOFORM_MODES = {
    sphere: 'sphere',
    ellipsoid: 'sphere', // sizes act as true semi-axes through the sphere chart
    cylinder: 'cylinder',
    cone: 'cone',
    torus: 'torus',
    torusKnot: 'torusKnot',
    capsule: 'capsule',
    superellipsoid: 'superellipsoid',
    pyramid: 'pyramid',
  };

  const withIndexFaceIds = (mesh) => ({
    vertices: mesh.vertices,
    faces: mesh.faces,
    faceIds: mesh.faces.map((_, index) => `face:${index}`),
  });

  // Builds the untransformed primitive mesh + deterministic face ids.
  // `detailScale` is the preview throttle (previewDetailScale(bounds)).
  const buildPrimitiveMesh = (obj, detailScale = 1) => {
    const Mesh = getMesh();
    const p = obj.params || {};
    if (obj.primitive === 'box') return buildBoxMesh(p);
    if (obj.primitive === 'plane') return buildPlaneMesh(p);
    if (obj.primitive === 'solid') {
      return withIndexFaceIds(Mesh.createSolidMesh({
        solidType: p.solidType,
        radius: finite(p.radius, 20),
        sideCount: p.sideCount,
        depth: p.depth,
        frequency: p.frequency,
        taper: p.taper,
        starRatio: p.starRatio,
        // Convert-to-Scene (I1) — a baked object3d carries its geometry as a
        // solidType:'importedMesh' index mesh; forward it so createSolidMesh's
        // importedMesh branch can scale unit verts by `radius`. Undefined for
        // every parametric solid ⇒ byte-identical for all other solidTypes.
        importedMesh: p.importedMesh,
        // Convert-to-Scene (I2) — carry the deformer params so a converted LIVE
        // solid re-evaluates them here. `applyDeformers` flags the scene path so
        // createSolidMesh runs the deformer bake (the standalone polyhedron algo
        // never sets it and applies deformers itself). With the inert defaults
        // (expand 100 / rest 0) the deformed pass is an identity ⇒ every existing
        // scene solid stays byte-identical.
        expand: p.expand,
        twist: p.twist,
        explode: p.explode,
        extrude: p.extrude,
        shard: p.shard,
        applyDeformers: true,
      }));
    }
    const mode = TOPOFORM_MODES[obj.primitive] || 'sphere';
    // Default fidelity reads as a smooth surface; the panel's Fidelity slider
    // and per-primitive defaults override it. detailScale is the live-drag
    // preview throttle (never below 4 rows).
    const detail = Math.max(4, Math.round(finite(p.detail, 24) * detailScale));
    const r = finite(p.radius, 20);
    const sizes = obj.primitive === 'sphere'
      ? { sx: r, sy: r, sz: r }
      : { sx: finite(p.sx, 20), sy: finite(p.sy, 20), sz: finite(p.sz, 20) };
    return withIndexFaceIds(Mesh.createTopoformMesh(mode, sizes, detail));
  };

  // ── Self-occlusion gate (F7) ─────────────────────────────────────────────
  //
  // A convex object can never occlude itself (every camera ray touches its
  // surface at most once on the visible side), so letting HLR test a convex
  // object's own faces against itself only costs time. A non-convex object —
  // the torus's own far tube wall behind its near one, a concave imported
  // mesh — genuinely can, and skipping that test is the F6/F7 bug itself.
  //
  // ALWAYS_CONVEX_PRIMITIVES is a plain primitive-kind allowlist (no mesh
  // scan at all — zero added cost) for shapes that are convex BY
  // CONSTRUCTION for every valid parameter value: box, plane, sphere,
  // ellipsoid (a stretched sphere), cylinder, cone, capsule and pyramid.
  // ALWAYS_NONCONVEX_PRIMITIVES is the mirror case for a genus-1 tube
  // surface — a torus or torus knot cannot be convex for any positive
  // ring/tube radii, so this is a mathematical fact, not a guess, and also
  // costs nothing.
  //
  // Everything else (superellipsoid — concave for a sub-1 rounding exponent;
  // solid — 16 polyhedra families plus an arbitrary imported OBJ/STL mesh;
  // csg — a boolean carve, non-convex as soon as a hole is cut) is genuinely
  // data-dependent, so it gets the real test: `isConvexMesh` below, the
  // classic "convex iff every vertex sits on the non-outward side of every
  // face's own support plane" check, evaluated once on the UNTRANSFORMED
  // mesh (an affine object transform can't change convexity, so this never
  // needs the camera pose or the live per-frame transform).
  const ALWAYS_CONVEX_PRIMITIVES = new Set([
    'box', 'plane', 'sphere', 'ellipsoid', 'cylinder', 'cone', 'capsule', 'pyramid',
  ]);
  const ALWAYS_NONCONVEX_PRIMITIVES = new Set(['torus', 'torusKnot']);
  // Bounds the O(faces × vertices) cost of the real test. Past this, assume
  // NON-convex: the wrong guess there only turns self-occlusion on for a body
  // that didn't strictly need it (a time cost, never a correctness one), and
  // it is the same direction a big imported/carved mesh needs anyway.
  const CONVEXITY_CHECK_BUDGET = 3000000;
  const CONVEXITY_EPS = 1e-6;
  const isConvexMesh = (vertices, faces) => {
    const V = Array.isArray(vertices) ? vertices.length : 0;
    const F = Array.isArray(faces) ? faces.length : 0;
    if (V < 4 || F < 2) return true; // degenerate/flat mesh (e.g. a lone quad)
    if (V * F > CONVEXITY_CHECK_BUDGET) return false;
    for (let fi = 0; fi < F; fi++) {
      const face = faces[fi];
      if (!Array.isArray(face) || face.length < 3) continue;
      const poly = face.map((i) => vertices[i]).filter(Boolean);
      if (poly.length < 3) continue;
      const n = faceNormal(poly);
      if (!n || (!n.x && !n.y && !n.z)) continue;
      const base = poly[0];
      for (let vi = 0; vi < V; vi++) {
        const pt = vertices[vi];
        if (!pt) continue;
        const d = (n.x * (pt.x - base.x)) + (n.y * (pt.y - base.y)) + (n.z * (pt.z - base.z));
        if (d > CONVEXITY_EPS) return false;
      }
    }
    return true;
  };
  // obj.primitive is undefined for the synthetic ground record's stand-in
  // object literal (buildGroundRecord) — falls through to the real mesh test,
  // which correctly reads its single flat quad as convex via the V<4 guard.
  const isConvexObject = (primitive, meshData) => {
    if (ALWAYS_CONVEX_PRIMITIVES.has(primitive)) return true;
    if (ALWAYS_NONCONVEX_PRIMITIVES.has(primitive)) return false;
    return isConvexMesh(meshData.vertices, meshData.faces);
  };

  // ── Assembly ───────────────────────────────────────────────────────────────

  // I23 — non-uniform scale. Each local axis stretches by its own factor; an
  // absent per-axis key inherits the uniform `t.scale`, so a legacy scale-only
  // transform reproduces the old `mul(pt, scale)` exactly (byte-identical).
  const applyObjectTransform = (pt, t) => {
    const s = finite(t.scale, 1);
    const sx = finite(t.sx, s);
    const sy = finite(t.sy, s);
    const sz = finite(t.sz, s);
    return add(
      rotatePoint(v(pt.x * sx, pt.y * sy, pt.z * sz), { yaw: t.yaw, pitch: t.pitch, roll: t.roll }),
      v(t.x, t.y, t.z),
    );
  };

  const faceRecord = (indices, faceId, objectId, world, camPts, projected, camPos) => {
    const worldVerts = indices.map((i) => world[i]);
    const camVerts = indices.map((i) => camPts[i]);
    const normalWorld = faceNormal(worldVerts);
    const normalCam = faceNormal(camVerts);
    let cx = 0; let cy = 0; let cz = 0;
    camVerts.forEach((pt) => { cx += pt.x; cy += pt.y; cz += pt.z; });
    const count = Math.max(1, camVerts.length);
    const centroidCam = v(cx / count, cy / count, cz / count);
    // Front test: ortho looks along +z (toward the viewer); perspective tests
    // against the pinhole position derived from projectPoint's denominator.
    const front = camPos
      ? dot(normalCam, sub(camPos, centroidCam)) > 0
      : normalCam.z > 0;
    return {
      faceId,
      key: `${objectId}/${faceId}`,
      indices,
      polygon: indices.map((i) => projected[i]), // {x, y, z} per vertex
      worldVerts, // {x,y,z} per vertex, world space — for in-plane surface hatch
      normalWorld,
      normalCam,
      centroidZ: centroidCam.z,
      front,
    };
  };

  const buildRecord = (obj, meshData, camAngles, projOpts, camPos) => {
    const world = meshData.vertices.map((pt) => (meshData.pretransformed
      ? pt
      : applyObjectTransform(pt, obj.transform)));
    const camPts = world.map((pt) => rotatePoint(pt, camAngles));
    const projected = camPts.map((pt) => projectPoint(pt, projOpts));
    const faces = meshData.faces.map((indices, index) => faceRecord(
      indices, meshData.faceIds[index], obj.id, world, camPts, projected, camPos));
    return {
      id: obj.id,
      name: obj.name,
      primitive: obj.primitive,
      // F7 — real self-occlusion gate (see isConvexObject above). Consumed by
      // scene3d.js when it builds a fill/ribbon/wall segCtx: true keeps the
      // existing "never self-occlude" fast path byte-identical; false lets a
      // non-convex object's own far side hide behind its own near side.
      convex: isConvexObject(obj.primitive, meshData),
      // A combined CSG unit whose children are ALL faceted hatches per-face like
      // a box (Scene3D.Boolean sets this); curved-involving carves fall back to
      // the continuous-region path. Plain objects leave it false.
      csgFaceted: !!meshData.csgFaceted,
      // Per-fragment source-attributed styles for a CSG carve (Scene3D.Boolean),
      // keyed by faceId. The generator folds these into a non-persistent byFace
      // clone so each fragment resolves to its ORIGINATING object's style. Null
      // for plain objects and uniform-style carves (byte-identical path).
      faceStyleOverrides: meshData.faceStyleOverrides || null,
      visibility: obj.visibility || 'solid',
      border: (obj.border && obj.border.enabled) ? obj.border : null,
      faceIndexArrays: meshData.faces,
      faces,
      world, // world-space verts (Phase 2: cast-shadow ground projection)
      projected,
      camPts,
      edges: collectEdges(meshData.faces),
    };
  };

  // The ground plane: a large world quad at y = 0 (styleable target 'ground',
  // never occludes, double-sided so it stays visible from below the horizon).
  const buildGroundRecord = (bounds, camAngles, projOpts, camPos) => {
    const span = Math.max(finite(bounds.width, 200), finite(bounds.height, 200)) * 0.75;
    const meshData = {
      vertices: [v(-span, 0, span), v(span, 0, span), v(span, 0, -span), v(-span, 0, -span)],
      faces: [[0, 1, 2, 3]],
      faceIds: ['face:ground'],
      pretransformed: true,
    };
    const record = buildRecord(
      { id: 'ground', name: 'Ground', primitive: 'plane', transform: null, visibility: 'solid' },
      meshData, camAngles, projOpts, camPos);
    // Double-sided receiver: force front so the plate renders whichever side
    // the camera pitch shows; it still never joins the occluder set.
    record.faces.forEach((face) => {
      face.front = true;
      if (face.normalCam.z < 0) {
        face.normalCam = mul(face.normalCam, -1);
        face.normalWorld = mul(face.normalWorld, -1);
      }
    });
    record.isGround = true;
    return record;
  };

  // Shared world→screen projection (CONTRACT: ONE source of truth). Both the
  // scene assembly below and the renderer's light gizmo (_sceneProjectWorld)
  // route through these so the overlay and the mesh can never drift apart.
  //
  // buildProjOpts: camera + bounds → the projectPoint options (centre, zoom
  // scale, resolved perspective/ortho terms). Defaults MUST match assembleScene
  // (bounds width/height default 200) so a missing-bounds call still lands where
  // the mesh would.
  const buildProjOpts = (cam, bounds = {}) => {
    const c = cam || {};
    const width = finite(bounds.width, 200);
    const height = finite(bounds.height, 200);
    return {
      centerX: width / 2,
      centerY: height / 2,
      scale: Math.max(0.05, finite(c.zoom, 1)),
      ...resolveProjection({
        projection: c.projection,
        focalLength: c.focalLength,
        cameraDistance: c.cameraDistance,
      }),
    };
  };

  // Project ONE world point to screen through `cam` + `bounds`. Returns
  // {x,y,z} or null (non-finite input/output). Used by the renderer gizmo; the
  // assembly hot path closes over a pre-built projOpts instead (below).
  const projectWorldPoint = (world, cam, bounds = {}) => {
    if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y) || !Number.isFinite(world.z)) return null;
    if (typeof projectPoint !== 'function' || typeof rotatePoint !== 'function') return null;
    const c = cam || {};
    const camAngles = { yaw: finite(c.yaw, 0), pitch: finite(c.pitch, 0), roll: finite(c.roll, 0) };
    const p = projectPoint(rotatePoint(world, camAngles), buildProjOpts(c, bounds));
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return { x: p.x, y: p.y, z: p.z };
  };

  // p must already be normalized (Scene3D.Params.normalizeParams).
  const assembleScene = (p, bounds = {}) => {
    const width = finite(bounds.width, 200);
    const height = finite(bounds.height, 200);
    const cam = p.camera;
    const projOpts = buildProjOpts(cam, { width, height });
    const camAngles = { yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll };
    // Pinhole position along +z for the perspective front-face test (matches
    // projectPoint's denominator focal + cameraDist - z hitting zero).
    const camPos = cam.projection === 'perspective'
      ? v(0, 0, Math.max(0, finite(cam.cameraDistance, 620)) + Math.max(1, finite(cam.focalLength, 520)))
      : null;
    const detailScale = previewDetailScale(bounds);
    // Boolean.resolveAssembly plans the assembly: ungrouped objects stay 1:1
    // with buildPrimitiveMesh (byte-identical to the legacy path), while a
    // boolean group collapses to ONE combined csg unit (pretransformed world
    // mesh). Absent module → legacy per-object mapping (defensive).
    const Boolean3D = Vectura.Scene3D && Vectura.Scene3D.Boolean;
    const units = (Boolean3D && typeof Boolean3D.resolveAssembly === 'function')
      ? Boolean3D.resolveAssembly(p, detailScale, { draft: !!(bounds && bounds.fastPreview) })
      : p.objects.map((obj) => ({ obj, meshData: buildPrimitiveMesh(obj, detailScale) }));
    const objects = units.map((u) => buildRecord(
      u.obj, u.meshData, camAngles, projOpts, camPos));
    const ground = p.ground && p.ground.enabled
      ? buildGroundRecord(bounds, camAngles, projOpts, camPos)
      : null;
    return {
      params: p, camera: cam, projOpts, objects, ground, width, height,
      // Project an arbitrary WORLD point to screen through the same camera —
      // lets downstream stages (e.g. in-plane surface hatch) place new geometry
      // on a face and foreshorten it correctly.
      projectWorld: (pt) => projectPoint(rotatePoint(pt, camAngles), projOpts),
    };
  };

  const api = {
    BOX_FACES,
    buildBoxMesh,
    buildPlaneMesh,
    buildPrimitiveMesh,
    applyObjectTransform,
    assembleScene,
    buildProjOpts,
    projectWorldPoint,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Scene: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
