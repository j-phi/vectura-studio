/**
 * Independent oracle for UNIT F — self-occlusion on an IMPORTED, non-convex
 * mesh (a torus tessellation authored as raw OBJ text and carried through the
 * real `engine.importMeshAsScene` path, exactly the way a user's .obj file
 * import lands).
 *
 * Modeled on `tests/helpers/scene3d-torus-hole-oracle.js` (F7's oracle for the
 * BUILT-IN torus primitive), adapted from continuous (u,v) parametric
 * sampling to per-triangle rasterization — an arbitrary imported mesh has no
 * analytic (u,v) surface to sample, only flat triangles. Each triangle IS
 * exactly planar in camera+screen space (unlike a curved analytic surface,
 * which `hlr.js`'s `fitSupportPlane` — and the torus oracle's own OVERLAP_GAP
 * threshold — only approximate over a residual tolerance), so barycentric
 * depth interpolation across one projected triangle is EXACT, not an
 * approximation.
 *
 * Does NOT call `hlr.js`'s `fitSupportPlane`/`hiddenAt`, `surface-fill.js`'s
 * chart/`sampleAt`, `RibbonGeometry`, or `scene.js`'s `applyObjectTransform`/
 * `buildRecord`. It reads the mesh's own `{vertices, faces}` straight off the
 * imported layer's own params (the exact data `Mesh.createSolidMesh`'s
 * `importedMesh` branch consumes), independently re-derives the world-space
 * transform (unit vertex -> radius scale -> per-axis scale -> rotate ->
 * translate, the same formula `scene.js` states) and projects through the
 * REAL captured camera/projOpts (via hooking `Scene3D.Scene.assembleScene`
 * once, purely to read its INPUT camera state — never its output geometry),
 * using only the shared generic linear-algebra primitives
 * (`Geometry3D.rotatePoint`/`add`/`v`/`projectPoint`) the real pipeline also
 * uses — the same permitted-reuse boundary the torus oracle documents.
 */

/**
 * Hooks `Scene.assembleScene` for exactly the first call, purely to read the
 * real scene's camera + projOpts (inputs, not the self-occlusion logic under
 * test). Call `restore()` once the real build has run.
 */
const captureMeshCameraSetup = (Vectura) => {
  const Scene = Vectura.Scene3D && Vectura.Scene3D.Scene;
  const origAssemble = Scene && Scene.assembleScene;
  let setup = null;
  if (Scene && typeof origAssemble === 'function') {
    Scene.assembleScene = function patchedAssembleScene(p) {
      const result = origAssemble.apply(this, arguments);
      if (!setup && p) {
        setup = { camera: result.camera, projOpts: result.projOpts };
      }
      return result;
    };
  }
  return {
    getCapture: () => setup,
    restore: () => { if (Scene && origAssemble) Scene.assembleScene = origAssemble; },
  };
};

// unit vertex -> radius scale -> per-axis scale -> rotate -> translate.
// Independently re-derived from `scene.js`'s `buildSolidBaseMesh` (importedMesh
// branch: `vertices.map(vt => v(vt.x*radius, vt.y*radius, vt.z*radius))`) and
// `applyObjectTransform` (I23 per-axis scale then `rotatePoint` then `add`) —
// never calling either.
const worldVertex = (Vectura, unitVert, radius, transform) => {
  const G3 = Vectura.Geometry3D;
  const t = transform || {};
  const scale = Number.isFinite(t.scale) ? t.scale : 1;
  const sx = Number.isFinite(t.sx) ? t.sx : scale;
  const sy = Number.isFinite(t.sy) ? t.sy : scale;
  const sz = Number.isFinite(t.sz) ? t.sz : scale;
  const px = unitVert.x * radius;
  const py = unitVert.y * radius;
  const pz = unitVert.z * radius;
  const rotated = G3.rotatePoint(
    G3.v(px * sx, py * sy, pz * sz),
    { yaw: t.yaw || 0, pitch: t.pitch || 0, roll: t.roll || 0 },
  );
  return G3.add(rotated, G3.v(t.x || 0, t.y || 0, t.z || 0));
};

// Project one WORLD point through the captured camera into the SAME
// (document mm, camera-space z, larger-z-is-nearer) space every emitted
// sceneFill path lives in.
const projectWorld = (Vectura, setup, world) => {
  const G3 = Vectura.Geometry3D;
  const cam = setup.camera || {};
  const camAngles = { yaw: cam.yaw || 0, pitch: cam.pitch || 0, roll: cam.roll || 0 };
  const camPt = G3.rotatePoint(world, camAngles);
  const screen = G3.projectPoint(camPt, setup.projOpts || {});
  return { x: screen.x, y: screen.y, z: camPt.z };
};

// Screen cell where two sufficiently separated mesh patches project into the
// SAME small area must differ in depth by more than this (mm) to count as
// genuine near/far SHEET overlap. Same threshold and same rationale as the
// torus oracle's OVERLAP_GAP_MM (comfortably above ordinary sub-cell depth
// variation across one flat triangle facet, comfortably below a real
// self-occlusion crossing).
const OVERLAP_GAP_MM = 8;

/**
 * Rasterizes every mesh triangle (world-space, front-facing only) into a
 * screen-cell grid (`cellMm` wide) and records the NEAREST and FARTHEST
 * camera-space depth any triangle contributed to each cell. Because each
 * triangle is exactly planar, the depth at any interior screen point is the
 * exact barycentric interpolation of its 3 projected-vertex depths.
 *
 * `mesh` is `{ vertices:[{x,y,z}] (UNIT space), faces:[[i,j,k],...], radius,
 * transform }` — read straight off the imported object3d layer's own
 * `params.params.importedMesh` / `params.radius` / `params.transform`.
 */
const buildMeshDepthField = (Vectura, mesh, setup, opts = {}) => {
  const cellMm = opts.cellMm || 0.5;
  const cells = new Map();
  const { vertices, faces, radius, transform } = mesh;
  const worldVerts = vertices.map((vt) => worldVertex(Vectura, vt, radius, transform));
  const projVerts = worldVerts.map((w) => projectWorld(Vectura, setup, w));

  const stampTriangle = (ia, ib, ic) => {
    const pa = projVerts[ia]; const pb = projVerts[ib]; const pc = projVerts[ic];
    const wa = worldVerts[ia]; const wb = worldVerts[ib]; const wc = worldVerts[ic];
    if (!pa || !pb || !pc || !wa || !wb || !wc) return;
    if (![pa, pb, pc].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) return;

    // Front test from the WORLD-space face normal (independent cross product,
    // never scene.js's faceNormal), matching scene.js's own ortho front test
    // (`normalCam.z > 0`); the default scene camera is orthographic.
    const e1 = { x: wb.x - wa.x, y: wb.y - wa.y, z: wb.z - wa.z };
    const e2 = { x: wc.x - wa.x, y: wc.y - wa.y, z: wc.z - wa.z };
    const nWorld = {
      x: (e1.y * e2.z) - (e1.z * e2.y),
      y: (e1.z * e2.x) - (e1.x * e2.z),
      z: (e1.x * e2.y) - (e1.y * e2.x),
    };
    const G3 = Vectura.Geometry3D;
    const cam = setup.camera || {};
    const camAngles = { yaw: cam.yaw || 0, pitch: cam.pitch || 0, roll: cam.roll || 0 };
    const nCam = G3.rotatePoint(nWorld, camAngles);
    if (!(nCam.z > 0)) return; // back-facing: never draws ink, never seeds a false depth.

    const minX = Math.min(pa.x, pb.x, pc.x); const maxX = Math.max(pa.x, pb.x, pc.x);
    const minY = Math.min(pa.y, pb.y, pc.y); const maxY = Math.max(pa.y, pb.y, pc.y);
    const denom = ((pb.y - pc.y) * (pa.x - pc.x)) + ((pc.x - pb.x) * (pa.y - pc.y));
    if (!denom) return; // degenerate (zero-area) triangle in screen space.

    const cx0 = Math.floor(minX / cellMm); const cx1 = Math.ceil(maxX / cellMm);
    const cy0 = Math.floor(minY / cellMm); const cy1 = Math.ceil(maxY / cellMm);
    const eps = -1e-6;
    for (let cxi = cx0; cxi <= cx1; cxi++) {
      const x = cxi * cellMm;
      for (let cyi = cy0; cyi <= cy1; cyi++) {
        const y = cyi * cellMm;
        const w1 = (((pb.y - pc.y) * (x - pc.x)) + ((pc.x - pb.x) * (y - pc.y))) / denom;
        const w2 = (((pc.y - pa.y) * (x - pc.x)) + ((pa.x - pc.x) * (y - pc.y))) / denom;
        const w3 = 1 - w1 - w2;
        if (w1 < eps || w2 < eps || w3 < eps) continue; // outside the triangle
        const z = (w1 * pa.z) + (w2 * pb.z) + (w3 * pc.z);
        const key = `${cxi},${cyi}`;
        const cell = cells.get(key);
        if (!cell) { cells.set(key, { near: { x, y, z }, far: { x, y, z } }); continue; }
        if (z > cell.near.z) cell.near = { x, y, z };
        if (z < cell.far.z) cell.far = { x, y, z };
      }
    }
  };

  faces.forEach((face) => {
    if (!Array.isArray(face) || face.length < 3) return;
    for (let k = 1; k + 1 < face.length; k++) stampTriangle(face[0], face[k], face[k + 1]);
  });

  return { cells, cellMm };
};

// Look up the overlap field cell nearest (x, y). Returns null if the cell (or
// its immediate neighbours, absorbing the field's own quantisation) was never
// stamped, or is not a genuine near/far overlap (gap <= OVERLAP_GAP_MM).
const overlapCellAt = (field, x, y) => {
  const cx = Math.round(x / field.cellMm);
  const cy = Math.round(y / field.cellMm);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cell = field.cells.get(`${cx + dx},${cy + dy}`);
      if (cell && (cell.near.z - cell.far.z) > OVERLAP_GAP_MM) return cell;
    }
  }
  return null;
};

module.exports = {
  captureMeshCameraSetup,
  worldVertex,
  projectWorld,
  buildMeshDepthField,
  overlapCellAt,
  OVERLAP_GAP_MM,
};
