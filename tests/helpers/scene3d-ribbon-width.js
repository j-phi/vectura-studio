'use strict';

/*
 * F1-width-bar's canonical width/ink measurement — the ONE place this repo
 * measures ribbon WIDTH. Shared by `scripts/audit/scene3d-ribbon-width.js`
 * (the canonical CLI script, JOB 1 of `ROUND3-RESUME-BRIEFS.md` §4) and
 * `tests/unit/scene3d-ribbon-width-bar.test.js` (the guard, JOB 3), so the
 * script and the test can never silently drift apart.
 *
 * RIG: `engine.addLayer('scene3d')` — the OBJECT-GEOMETRY-DEFAULTS
 * construction every RGR file in this lane uses (f1b-streaks, wall-coverage,
 * flat-field-placement, erode-refusal, f1-amp — all identical). This is the
 * "unit fixture" / `addLayer` rig, distinct from the `create`/gallery rig
 * (`PRIMITIVE_CREATE_DEFAULTS`, driven only through a real browser page by
 * `scripts/audit/scene3d-capture.js --rig create`). Ribbon-WIDTH
 * instrumentation (the `RibbonGeometry.buildRibbonMultiPolygon` wrap below)
 * only exists in THIS process — it is not wired into `scene3d-capture.js`,
 * so the `create` rig can only be cross-checked on INK (via that script's
 * own `report.json`), never on width, without a change to that script,
 * which is outside this unit's tests-only grant. Disclosed, not hidden.
 *
 * FIXTURE: torus / hatch / density 50 (the F1-amp/F1-erode-plan §7 fixture)
 * unless overridden. PEN: 0.30mm (surface-fill.js's own default, read back
 * from `lastRibbonStats.penWidth` rather than assumed).
 *
 * WIDTH METHOD (F1-erode-plan.md §7's own method, reproduced exactly):
 * `RibbonGeometry.buildRibbonMultiPolygon` is wrapped for the duration of
 * one `computeAllDisplayGeometry()` call, recording each call's centreline
 * arc length and its half-width array's mean. `buildRibbonMultiPolygon` is
 * called for BOTH the CLS_RIBBON class (surface-fill.js:7333, the ribbon
 * "wide" bucket F1's decision-10 debate is about) AND the CLS_WALLS class
 * (:7279, a narrower, unrelated 1-2 pen bucket) — the two are told apart by
 * `minHalfWidth`: CLS_RIBBON always passes `HALF_MIN = penWidth / 2`
 * (:7014,7333); CLS_WALLS passes `WALL_FLOOR = penWidth * 0.05` (:7172,7279)
 * — a >3x difference (0.15mm vs 0.015mm at the default pen), filtered here
 * once `penWidth` is known from `lastRibbonStats`. Only CLS_RIBBON calls
 * count toward `meanRibbonWidthMm`. The overall figure is the ARC-LENGTH-
 * WEIGHTED mean width across every CLS_RIBBON stretch, exactly
 * F1-erode-plan.md §7's own "ribbon width, length-weighted mean" column.
 */

const polylineLenMm = (pts) => {
  let L = 0;
  for (let i = 1; i < pts.length; i += 1) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
};

const totalInkMm = (paths) => (paths || []).reduce((s, p) => s + polylineLenMm(p), 0);

// Second named camera angle from `scripts/audit/scene3d-capture.js`
// (`ANGLE_KEYS = ['a','b']`, `SECOND_ANGLE = { yaw: 40, pitch: -15 }`) —
// reproduced here so the SAME two angles this repo's gallery shoots can be
// driven through the addLayer/jsdom rig.
const CAMERA_B = { yaw: 40, pitch: -15 };

/**
 * Measure whole-object ink + CLS_RIBBON width for one law on the addLayer
 * rig.
 *
 * @param {object} Vectura - `window.Vectura` from a loaded runtime.
 * @param {object} opts
 * @param {string} opts.law - `toneLaw` value (e.g. 'trochoidLoop').
 * @param {string} [opts.primitive='torus']
 * @param {string} [opts.mapper='hatch']
 * @param {number} [opts.density] - `fillDensity`, if the law/mapper reads it
 *   (left at its own default — 50 for hatch — when omitted, matching every
 *   sibling RGR file in this lane).
 * @param {'a'|'b'} [opts.cameraAngle='a'] - 'a' = untouched default camera
 *   (matches every sibling file); 'b' = the gallery's second named angle.
 * @param {{yaw?:number, pitch?:number}} [opts.cameraDelta] - added on top of
 *   whichever camera angle was selected — the T4b-style ±2° drift-envelope
 *   perturbation.
 * @param {{azimuth?:number, elevation?:number}} [opts.lightDelta] - same,
 *   for the sun.
 */
function measureRibbonWidth(Vectura, opts) {
  const {
    law,
    primitive = 'torus',
    mapper = 'hatch',
    density,
    cameraAngle = 'a',
    cameraDelta,
    lightDelta,
  } = opts;
  if (!law) throw new Error('measureRibbonWidth: opts.law is required');

  const engine = new Vectura.VectorEngine();
  const groupId = engine.addLayer('scene3d');
  const group = engine.layers.find((l) => l && l.id === groupId);
  const obj = engine.getLayerDescendants(groupId).filter((l) => l && l.type === 'object3d')[0];
  obj.params.primitive = primitive;
  obj.params.style = obj.params.style || { penId: null, mapper, params: {} };
  obj.params.style.mapper = mapper;
  obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw: law };
  if (density != null) obj.params.style.params.fillDensity = density;

  if (cameraAngle === 'b' || cameraDelta) {
    const base = { ...(group.params.camera || {}) };
    if (cameraAngle === 'b') Object.assign(base, CAMERA_B);
    if (cameraDelta) {
      if (cameraDelta.yaw != null) base.yaw = (base.yaw || 0) + cameraDelta.yaw;
      if (cameraDelta.pitch != null) base.pitch = (base.pitch || 0) + cameraDelta.pitch;
    }
    group.params.camera = base;
  }
  if (lightDelta && Array.isArray(group.params.lights) && group.params.lights[0]) {
    const sun = { ...group.params.lights[0] };
    if (lightDelta.azimuth != null) sun.azimuth = (sun.azimuth || 0) + lightDelta.azimuth;
    if (lightDelta.elevation != null) sun.elevation = (sun.elevation || 0) + lightDelta.elevation;
    group.params.lights = [sun, ...group.params.lights.slice(1)];
  }

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

  try {
    engine.computeAllDisplayGeometry();
  } finally {
    if (RGm && typeof original === 'function') RGm.buildRibbonMultiPolygon = original;
  }

  const stats = { ...((Vectura.Scene3D && Vectura.Scene3D.SurfaceFill && Vectura.Scene3D.SurfaceFill.lastRibbonStats) || {}) };
  const penWidth = stats.penWidth || 0.3;
  const ribbonCalls = calls.filter((c) => Math.abs((c.minHalfWidth || 0) - penWidth / 2) < 1e-9);

  const totalRibbonLen = ribbonCalls.reduce((s, c) => s + c.lengthMm, 0);
  const meanRibbonWidthMm = totalRibbonLen > 0
    ? ribbonCalls.reduce((s, c) => s + c.lengthMm * (2 * c.halfMean), 0) / totalRibbonLen
    : null; // null, not 0 -- "no CLS_RIBBON stretch fired" is a different fact than "fired at width 0"

  const paths = group.scenePaths || [];
  const totalInk = totalInkMm(paths);
  const fillInk = totalInkMm(paths.filter((p) => p && p.meta && p.meta.kind === 'sceneFill'));

  return {
    law,
    penWidth,
    ribbonStretchCount: ribbonCalls.length,
    wallStretchCount: calls.length - ribbonCalls.length,
    meanRibbonWidthMm,
    meanRibbonWidthPen: meanRibbonWidthMm != null ? meanRibbonWidthMm / penWidth : null,
    totalInkMm: totalInk,
    interiorFillInkMm: fillInk,
    stats,
  };
}

module.exports = { measureRibbonWidth, polylineLenMm, totalInkMm, CAMERA_B };
