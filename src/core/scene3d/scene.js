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
  const Mesh = (Vectura.Scene3D && Vectura.Scene3D.Mesh) || {};

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

  // ── Assembly ───────────────────────────────────────────────────────────────

  const applyObjectTransform = (pt, t) => add(
    rotatePoint(mul(pt, t.scale), { yaw: t.yaw, pitch: t.pitch, roll: t.roll }),
    v(t.x, t.y, t.z),
  );

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
      // A combined CSG unit whose children are ALL faceted hatches per-face like
      // a box (Scene3D.Boolean sets this); curved-involving carves fall back to
      // the continuous-region path. Plain objects leave it false.
      csgFaceted: !!meshData.csgFaceted,
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

  // p must already be normalized (Scene3D.Params.normalizeParams).
  const assembleScene = (p, bounds = {}) => {
    const width = finite(bounds.width, 200);
    const height = finite(bounds.height, 200);
    const cam = p.camera;
    const projOpts = {
      centerX: width / 2,
      centerY: height / 2,
      scale: Math.max(0.05, finite(cam.zoom, 1)),
      ...resolveProjection({
        projection: cam.projection,
        focalLength: cam.focalLength,
        cameraDistance: cam.cameraDistance,
      }),
    };
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
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Scene: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
