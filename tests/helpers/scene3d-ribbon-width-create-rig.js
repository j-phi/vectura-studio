'use strict';

/*
 * F1-width-bar-b — the CREATE-rig sibling of `scene3d-ribbon-width.js`.
 *
 * WHY THIS FILE EXISTS. `ROUND3-RESUME-BRIEFS.md` §4 / F1-width-bar-review.md
 * follow-up 3: F1-width-bar's own floor is proven on the `addLayer` rig only
 * (`engine.addLayer('scene3d')`'s own descendant tree, mutated in place) --
 * the rig every RGR test file in this lane already uses. But
 * `scripts/audit/scene3d-capture.js`'s DEFAULT rig -- the one that produced
 * every gallery screenshot Jay actually judges, and the one decision 10's
 * evidence packet's pictures were shot with -- is the DIFFERENT `create` rig
 * (`PRIMITIVE_CREATE_DEFAULTS` merged over `PRIMITIVE_PARAM_DEFAULTS`, an
 * inline `g.params.objects`/`lights`/`styleTable` envelope, NOT a descendant
 * layer tree). The reviewer found a tests-only script CAN rebuild that rig
 * inside the existing jsdom harness without editing `scene3d-capture.js` at
 * all (`SF.lastRibbonStats`/`RibbonGeometry.buildRibbonMultiPolygon` are
 * both in-process, not canvas/DOM-dependent), and that closing this gap was
 * left on the table rather than named as a followup. This file does it.
 *
 * THE CONSTRUCTION -- reproduced VERBATIM (not reinvented) from MAIN's
 * `scripts/audit/scene3d-capture.js` `buildAndMeasure()`'s `else` branch
 * (the `--rig create` / default path, GH-2 `6ffaf9c6`, that file's own
 * lines ~284-315 at that sha -- READ, never edited; this unit's tests-only
 * grant does not extend to touching that MAIN-owned script):
 *
 *   1. `engine.addLayer('scene3d')` for the id only, then STRIP every child
 *      the group ships with (`engine.layers = engine.layers.filter(l =>
 *      l.parentId !== gid)`) -- the create rig does NOT use the seeded
 *      object3d/sceneLight3d/sceneGround3d descendant leaves the addLayer
 *      rig mutates in place.
 *   2. `g.isGroup = true; g.containerRole = 'scene';`
 *   3. `g.params.camera = camera` (a full REPLACE, not a merge -- unlike
 *      the addLayer-rig helper, which only overlays camera fields when the
 *      caller asks for angle 'b' or a delta).
 *   4. `g.params.ground = { enabled: false }; g.params.backdrop = { enabled:
 *      false };` -- both EXPLICIT and false. This is the one structural
 *      difference from the addLayer-rig helper that matters most: that
 *      helper leaves `ALGO_DEFAULTS.scene3d`'s ground ENABLED (true) and
 *      never touches it, which is what produced the ~2269mm ground-plane
 *      ink confound `F1-width-bar-reshoot.md` found between the addLayer
 *      helper's own ink numbers and the gallery's addLayer-rig `inkMm`
 *      figures. The create rig has NO such confound: ground is explicitly
 *      OFF for every measurement this file produces, so every `totalInkMm`
 *      below is OBJECT ink only, never scene ink. Stated once here rather
 *      than re-derived per call.
 *   5. Object params bag: `{ ...PRIMITIVE_PARAM_DEFAULTS[primitive],
 *      ...PRIMITIVE_CREATE_DEFAULTS[primitive] }` (creation defaults win) --
 *      `Vectura.Scene3D.Params`'s own two tables, read live, never
 *      hand-copied here, so a future change to either table is picked up
 *      automatically rather than silently drifting from a stale copy.
 *   6. `q.objects = [OBJ]; q.lights = [SUN];` -- an INLINE bag, not a
 *      descendant-layer object3d/sceneLight3d leaf. `q.styleTable = {
 *      scene, byObject: { obj: <same style> }, byFace: {} }` with
 *      `fillAngle: 45` (an explicit LITERAL the create rig always sets --
 *      NOT the addLayer-rig helper's absent-fillAngle convention; disclosed,
 *      not silently diverged from that file's own convention, because THIS
 *      rig's whole point is matching the gallery's own construction byte
 *      for byte), `fillDensity: <opts.density, default 50 = 'med'>`,
 *      `toneLaw: <law>`.
 *
 * MEASUREMENT METHOD -- IDENTICAL to `scene3d-ribbon-width.js`'s own
 * `measureRibbonWidth()` tail (wrap `RibbonGeometry.buildRibbonMultiPolygon`
 * for one `computeAllDisplayGeometry()` call, classify CLS_RIBBON vs
 * CLS_WALLS by `minHalfWidth === penWidth/2`, arc-length-weighted mean
 * width over CLS_RIBBON calls only). Reproduced as this file's OWN copy
 * (not a cross-file call into that file's internals) so the two rigs stay
 * independently auditable, per this lane's own established convention
 * (`scene3d-ribbon-width-bar.test.js`'s own header: "own copy, not a
 * cross-file require, so this file has no hidden dependency on that file's
 * internals staying stable"). Any future drift between the two measurement
 * methods would show up as an unexplained gap between the two rigs' ink/
 * width numbers on the SAME law -- worth diffing the two files' tails
 * periodically, not enforced here.
 *
 * IDENTITY PROOF (this unit's own JOB) -- see
 * `docs/3d-audit/lane-reports/F1-width-bar-b-impl.md` for the md5 comparison
 * against a REAL browser capture of this exact construction (a bespoke
 * script reusing `scene3d-capture.js`'s own exported `ensureServer`/
 * `openPage`/`getConstants`, run against THIS worktree's tree via `--root`,
 * per this lane's standing evidence convention) -- not repeated in this
 * file's own header to avoid the report and the code silently drifting
 * apart on a number neither is the source of truth for.
 */

const polylineLenMm = (pts) => {
  let L = 0;
  for (let i = 1; i < pts.length; i += 1) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
};

const totalInkMm = (paths) => (paths || []).reduce((s, p) => s + polylineLenMm(p), 0);

// Same second named camera angle as `scene3d-ribbon-width.js` / MAIN's
// `scene3d-capture.js` (`ANGLE_KEYS = ['a','b']`, `SECOND_ANGLE = { yaw: 40,
// pitch: -15 }`).
const CAMERA_B_DELTA = { yaw: 40, pitch: -15 };

const DENSITY_VALUES = { low: 1, med: 50, max: 220 };

/**
 * Measure whole-object ink + CLS_RIBBON width for one law on the CREATE rig
 * -- `scripts/audit/scene3d-capture.js`'s default (`--rig create`)
 * construction, reproduced inline (see file header).
 *
 * @param {object} Vectura - `window.Vectura` from a loaded runtime.
 * @param {object} opts
 * @param {string} opts.law - `toneLaw` value (e.g. 'trochoidLoop').
 * @param {string} [opts.primitive='torus']
 * @param {string} [opts.mapper='hatch']
 * @param {number} [opts.density=50] - `fillDensity` ('med' bucket's numeric
 *   value; the create rig ALWAYS sets this explicitly, unlike the addLayer
 *   helper, so there is no "law's own default" case here).
 * @param {'a'|'b'} [opts.cameraAngle='a'] - 'a' = app default camera
 *   (`Params.DEFAULT_CAMERA`, matching the gallery's own angle 'a');
 *   'b' = the gallery's second named angle (yaw +40, pitch -15).
 */
function measureRibbonWidthCreate(Vectura, opts) {
  const {
    law,
    primitive = 'torus',
    mapper = 'hatch',
    density = DENSITY_VALUES.med,
    cameraAngle = 'a',
  } = opts;
  if (!law) throw new Error('measureRibbonWidthCreate: opts.law is required');

  const P = Vectura.Scene3D && Vectura.Scene3D.Params;
  if (!P) throw new Error('measureRibbonWidthCreate: Vectura.Scene3D.Params not loaded');

  const engine = new Vectura.VectorEngine();
  const gid = engine.addLayer('scene3d');
  // Strip every child the addLayer scaffold ships with -- the create rig
  // does not use them (scene3d-capture.js buildAndMeasure() `else` branch).
  engine.layers = engine.layers.filter((l) => l.parentId !== gid);
  const g = engine.layers.find((l) => l && l.id === gid);
  g.isGroup = true;
  g.containerRole = 'scene';
  const q = g.params;

  const camera = { ...P.DEFAULT_CAMERA };
  if (cameraAngle === 'b') Object.assign(camera, CAMERA_B_DELTA);
  q.camera = camera;
  q.ground = { enabled: false };
  q.backdrop = { enabled: false };

  const bag = {
    ...(P.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}),
    ...(P.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}),
  };
  if (primitive === 'solid') {
    bag.solidType = (P.PRIMITIVE_PARAM_DEFAULTS.solid && P.PRIMITIVE_PARAM_DEFAULTS.solid.solidType) || 'buckyball';
  }
  const OBJ = {
    id: 'obj',
    name: 'Obj',
    primitive,
    params: bag,
    transform: {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
    },
    visibility: 'solid',
  };
  const SUN = {
    id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false,
  };
  q.objects = [OBJ];
  q.lights = [SUN];
  const style = {
    penId: null, mapper, params: { fillAngle: 45, fillDensity: density, toneLaw: law },
  };
  q.styleTable = {
    scene: JSON.parse(JSON.stringify(style)),
    byObject: { obj: JSON.parse(JSON.stringify(style)) },
    byFace: {},
  };

  const RGm = Vectura.RibbonGeometry;
  const calls = [];
  const original = RGm && RGm.buildRibbonMultiPolygon;
  if (RGm && typeof original === 'function') {
    RGm.buildRibbonMultiPolygon = function wrapped(centre, half, rgOpts) {
      calls.push({
        lengthMm: polylineLenMm(centre),
        halfMean: (half && half.length) ? half.reduce((s, h) => s + h, 0) / half.length : 0,
        minHalfWidth: rgOpts && rgOpts.minHalfWidth,
      });
      return original.apply(this, arguments);
    };
  }

  let genError = null;
  try {
    engine.computeAllDisplayGeometry();
  } catch (e) {
    genError = String((e && e.stack) || e);
  } finally {
    if (RGm && typeof original === 'function') RGm.buildRibbonMultiPolygon = original;
  }

  const stats = { ...((Vectura.Scene3D && Vectura.Scene3D.SurfaceFill && Vectura.Scene3D.SurfaceFill.lastRibbonStats) || {}) };
  const penWidth = stats.penWidth || 0.3;
  const ribbonCalls = calls.filter((c) => Math.abs((c.minHalfWidth || 0) - penWidth / 2) < 1e-9);

  const totalRibbonLen = ribbonCalls.reduce((s, c) => s + c.lengthMm, 0);
  const meanRibbonWidthMm = totalRibbonLen > 0
    ? ribbonCalls.reduce((s, c) => s + c.lengthMm * (2 * c.halfMean), 0) / totalRibbonLen
    : null;

  const paths = g.scenePaths || [];
  const totalInk = totalInkMm(paths);
  const fillInk = totalInkMm(paths.filter((p) => p && p.meta && p.meta.kind === 'sceneFill'));

  return {
    law,
    genError,
    penWidth,
    ribbonStretchCount: ribbonCalls.length,
    wallStretchCount: calls.length - ribbonCalls.length,
    meanRibbonWidthMm,
    meanRibbonWidthPen: meanRibbonWidthMm != null ? meanRibbonWidthMm / penWidth : null,
    totalInkMm: totalInk, // ground OFF -- object ink only, never scene ink (see header)
    interiorFillInkMm: fillInk,
    scenePaths: paths, // raw paths, for the identity/md5 check -- NOT consumed by the guard test
    stats,
  };
}

module.exports = {
  measureRibbonWidthCreate, polylineLenMm, totalInkMm, DENSITY_VALUES, CAMERA_B_DELTA,
};
