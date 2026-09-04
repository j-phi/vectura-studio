/**
 * Independent oracle for F7 — self-occlusion on a non-convex object.
 *
 * The claim under test (Jay's own words): at the torus's default 3/4 view,
 * tracing the top edge of the FRONT of the loop where it crosses the inner
 * hole gives a curve. Contour lines belonging to the FAR side of the tube
 * (visible only because it happens to project into the same screen area as
 * the near side, through the donut hole) must never draw above that curve.
 *
 * This oracle does NOT call into `surface-fill.js`'s chart/`sampleAt`,
 * `buildRegionRings`/`resolveFoldRings`, `hlr.js`'s `hiddenAt`/`clipPath`, or
 * `RibbonGeometry` — none of the code this fix touches. It rebuilds the
 * torus's own analytic parametric surface FRESH, from the torus's own
 * documented geometric definition (major/minor radius from the object's
 * `sx`/`sy`/`sz`, exactly as `src/core/scene3d/charts.js`'s `topoTorus`
 * defines a torus — a torus is a torus regardless of which code draws it),
 * and projects it to screen through the SAME shared, generic linear-algebra
 * utilities (`Geometry3D.rotatePoint` / `projectPoint`) the real pipeline
 * uses, fed with the REAL camera/projection/object-transform the test's own
 * scene actually used (captured by hooking `Scene.assembleScene` /
 * `Charts.topoTorus` once, purely to read off their INPUT parameters — never
 * their output).
 *
 * From a dense (u, v) sampling of that independent analytic surface it
 * builds an "overlap field": for every small screen cell that TWO
 * sufficiently-separated front-facing surface points project into, the
 * NEARER (near-sheet) and FARTHER (far-sheet) analytic depth. A cell only
 * counts as genuine near/far overlap when the two candidate depths differ by
 * more than OVERLAP_GAP_MM (comfortably above ordinary local-curvature depth
 * variation within one small screen cell, comfortably below a single
 * degenerate reading) — see `deriveOverlapField`.
 *
 * The actual assertion lives in the test file: for every vertex of every
 * emitted `sceneFill` FRONT path, if that vertex's screen position falls in
 * a genuine overlap cell, its OWN z must read closer to the cell's NEAR
 * depth than its FAR depth — i.e. it is not far-sheet ink surviving in a
 * spot only the near sheet should ever ink.
 */

const TAU = Math.PI * 2;

/**
 * Hooks `Scene.assembleScene` and `Charts.topoTorus` for exactly the FIRST
 * call each makes, purely to read the real scene's camera/projection/object-
 * transform and the torus's own resolved (sx, sy, sz) — inputs, not the
 * self-occlusion logic under test. Call `restore()` once the real build has
 * run and `getCapture()` has been read.
 */
const captureTorusSetup = (Vectura) => {
  const Charts = Vectura.Scene3D && Vectura.Scene3D.Charts;
  const Scene = Vectura.Scene3D && Vectura.Scene3D.Scene;
  const origChart = Charts && Charts.topoTorus;
  const origAssemble = Scene && Scene.assembleScene;
  let sizes = null;
  let setup = null;
  if (Charts && typeof origChart === 'function') {
    Charts.topoTorus = function patchedTopoTorus(sz) {
      if (!sizes && sz) sizes = { sx: sz.sx, sy: sz.sy, sz: sz.sz };
      return origChart.apply(this, arguments);
    };
  }
  if (Scene && typeof origAssemble === 'function') {
    Scene.assembleScene = function patchedAssembleScene(p) {
      const result = origAssemble.apply(this, arguments);
      if (!setup && p) {
        const torusObj = (Array.isArray(p.objects) ? p.objects : [])
          .find((o) => o && o.primitive === 'torus');
        setup = {
          camera: result.camera,
          projOpts: result.projOpts,
          transform: torusObj ? torusObj.transform : null,
        };
      }
      return result;
    };
  }
  return {
    getCapture: () => ({ sizes, setup }),
    restore: () => {
      if (Charts && origChart) Charts.topoTorus = origChart;
      if (Scene && origAssemble) Scene.assembleScene = origAssemble;
    },
  };
};

// Analytic torus surface point + outward unit normal at (u, v) in [0, 1).
// Independently reproduces the geometric DEFINITION `charts.js`'s
// `topoTorus` builds its mesh from — never calls it.
const torusSurface = (sizes, u, vv) => {
  const major = Math.max(2, sizes.sx * 0.75);
  const minor = Math.max(1, Math.min(sizes.sy, sizes.sz) * 0.28);
  const a = u * TAU;
  const b = vv * TAU;
  const ringR = major + (Math.cos(b) * minor);
  return {
    pos: { x: Math.cos(a) * ringR, y: Math.sin(b) * minor, z: Math.sin(a) * ringR },
    normal: { x: Math.cos(a) * Math.cos(b), y: Math.sin(b), z: Math.sin(a) * Math.cos(b) },
  };
};

// Project one analytic torus surface point through the captured object
// transform + camera + projection. Returns {x, y, z, front} in the SAME
// (document mm, camera-space z, larger-z-is-nearer) space every emitted
// `sceneFill` path lives in.
const projectTorusPoint = (Vectura, setup, sizes, u, vv) => {
  const G3 = Vectura.Geometry3D;
  const { pos, normal } = torusSurface(sizes, u, vv);
  const t = setup.transform || { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
  const scale = Number.isFinite(t.scale) ? t.scale : 1;
  const localAngles = { yaw: t.yaw || 0, pitch: t.pitch || 0, roll: t.roll || 0 };
  const worldPos = G3.add(
    G3.rotatePoint(G3.v(pos.x * scale, pos.y * scale, pos.z * scale), localAngles),
    G3.v(t.x || 0, t.y || 0, t.z || 0),
  );
  const worldNormal = G3.rotatePoint(normal, localAngles);
  const cam = setup.camera || {};
  const camAngles = { yaw: cam.yaw || 0, pitch: cam.pitch || 0, roll: cam.roll || 0 };
  const camPos = G3.rotatePoint(worldPos, camAngles);
  const camNormal = G3.rotatePoint(worldNormal, camAngles);
  const projOpts = { ...(setup.projOpts || {}) };
  if (cam.projection === 'perspective') {
    projOpts.focal = Math.max(1, Number(cam.focalLength) || 520);
    projOpts.cameraDist = Math.max(0, Number(cam.cameraDistance) || 620);
  }
  const screen = G3.projectPoint(camPos, projOpts);
  return { x: screen.x, y: screen.y, z: camPos.z, front: camNormal.z > 0 };
};

// A screen cell where two sufficiently-separated front-facing torus patches
// project into the SAME small area must differ in depth by more than this
// (mm) to count as genuine near/far SHEET overlap — comfortably above the
// sub-mm-to-low-single-mm depth variation ordinary local curvature produces
// within one small screen cell, comfortably below a real self-occlusion
// crossing (measured on this fixture: 10 mm or more).
const OVERLAP_GAP_MM = 8;

/**
 * Dense-samples the independent analytic torus surface and buckets every
 * front-facing sample by screen cell (`cellMm` wide). Returns a Map keyed
 * `"${cx},${cy}"` -> { near: {x,y,z}, far: {x,y,z} } for every cell that saw
 * at least one front-facing sample; `near`/`far` coincide unless the cell
 * genuinely received two depths.
 */
const buildOverlapField = (Vectura, setup, sizes, opts = {}) => {
  const stepsU = opts.stepsU || 480;
  const stepsV = opts.stepsV || 240;
  const cellMm = opts.cellMm || 0.5;
  const cells = new Map();
  for (let iu = 0; iu < stepsU; iu++) {
    const u = iu / stepsU;
    for (let iv = 0; iv < stepsV; iv++) {
      const vv = iv / stepsV;
      const p = projectTorusPoint(Vectura, setup, sizes, u, vv);
      if (!p.front || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
      const cx = Math.round(p.x / cellMm);
      const cy = Math.round(p.y / cellMm);
      const key = `${cx},${cy}`;
      const cell = cells.get(key);
      if (!cell) { cells.set(key, { near: p, far: p }); continue; }
      if (p.z > cell.near.z) cell.near = p;
      if (p.z < cell.far.z) cell.far = p;
    }
  }
  return { cells, cellMm };
};

// Look up the overlap field cell nearest (x, y). Returns null if the cell
// (or its immediate neighbours, to absorb the field's own quantisation) was
// never hit by the dense sampling, or if it is not a genuine near/far
// overlap (gap <= OVERLAP_GAP_MM).
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
  captureTorusSetup,
  torusSurface,
  projectTorusPoint,
  buildOverlapField,
  overlapCellAt,
  OVERLAP_GAP_MM,
};
