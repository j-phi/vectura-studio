/**
 * W-30c (F2b, R3) — a non-convex caster's receive shadow renders as NO
 * shadow at all, not merely an inaccurate one.
 *
 * Finding (W-30c-plan.md §1b, §2 R3): `buildFaceFootprint`'s caster
 * footprint is `Shadows.convexHull`'s outer wrap (R2 — the torus's own hole
 * gets filled in; NOT fixed by this unit, tracked as W-30d). The "inside"
 * tone pass (`scene3d.js` ~2496-2503, pre-fix) samples exactly ONE point —
 * the footprint polygon's own centroid — on the documented assumption that
 * "a directional hard shadow is BINARY". For a hull-with-a-hole the
 * centroid lands IN the hole: `ShadowReceive.pointInShadow(centroid)` is
 * `false` (it ray-casts the real torus mesh, which genuinely has no
 * geometry there), so the "inside" pass silently reads the UNSHADOWED
 * spacing and the whole footprint — hole AND the genuinely occluded ring —
 * renders at the outside pitch. Measured: density ratio 1.00 (torus) vs 3.02
 * (sphere, same rig) — the torus casts NO visible receive shadow at all, in
 * both the directional and (post-W-30b) positional paths.
 *
 * Fix (F2b, scoped — F2a's hole-preserving footprint geometry is explicitly
 * OUT of scope for this unit, per the plan's stop condition, and tracked as
 * W-30d): if the centroid isn't actually occluded, search inward from each
 * hull vertex (real projected caster-surface points) for one that IS, and
 * grade the "inside" pass from that instead. This does not fix R2 (the hole
 * itself still renders shadowed — over-coverage, a real but separate,
 * disclosed defect) but it does fix R3: the torus becomes VISIBLE.
 *
 * Rig (plan §1a torus row, reproduced): torus caster sx=40/sy=12/sz=40,
 * detail 24, at (60, 30, 0); plane receiver sx=sz=500 at the origin; ortho
 * camera yaw20/pitch45; fillAngle 20/fillDensity 80/toneLaw ladder, tone 2
 * bands threshold [0.3] ladder [0.1,0.95]; `shadowReceiveOnObjects: true`.
 * Probe at the footprint's own centroid world location (measured in the
 * planning export, reproduced here as the probe point — NOT re-derived from
 * this test, so a geometry drift elsewhere would show up as a probe-density
 * anomaly, not silently pass): directional (-4.34, 0), point (150.07, 0).
 * Control: far outside either footprint.
 *
 * RED proof (this lane's HEAD at the W-30c briefing, 90f3411f, before F2b):
 *
 *   VECTURA_PRE_W30C_B=1 npx vitest run tests/unit/scene3d-shadow-footprint-torus-visibility.test.js
 *
 * ── W-30d update (F2a lands; see scene3d-shadow-footprint-torus-hole-accuracy.test.js
 * for its own dedicated RED/GREEN pair) ──────────────────────────────────────
 * F2a fixes R2 (`Shadows.footprintRings` now returns the caster's TRUE outer +
 * inner silhouette rings instead of `Shadows.convexHull`'s hole-filling wrap),
 * so the footprint's own geometric HOLE genuinely re-opens in both the outside
 * AND inside hatch pass. The two "current tree" torus assertions below used
 * the footprint's CENTROID as their probe specifically BECAUSE that point sits
 * inside the torus's real hole (R3's own bug: the centroid landed in the hole,
 * which is exactly why F2b's fix had to search elsewhere for an occluded
 * sample) — so once R2 is fixed, that same probe point is CORRECTLY no longer
 * shadowed. This is the intentional, disclosed consequence of F2a (W-30c-plan.md
 * §4 F2: "Non-convex casters... will change, and must"), not a regression: the
 * assertions below are updated to the new, physically-correct contract per
 * CLAUDE.md's stale-assertion rule. `scene3d-shadow-footprint-torus-hole-
 * accuracy.test.js` carries the actual RGR proof for this direction change,
 * pinned to `2d931b1a` (F2b-only, this lane's HEAD immediately before W-30d).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { makeMultiFilePreShaRuntimeOptions } = require('../helpers/pre-wip-surface-fill');

const SCENE3D_REL = 'src/core/algorithms/scene3d.js';
const BASE_SHA = '90f3411f'; // fill-collapse-2's HEAD at the W-30c briefing (U7, before F2b)
const preW30cRuntimeOptions = makeMultiFilePreShaRuntimeOptions(BASE_SHA, 'VECTURA_PRE_W30C_B', [SCENE3D_REL]);

const CAMERA = { projection: 'orthographic', yaw: 20, pitch: 45, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const BOUNDS = { width: 420, height: 420, m: 10, dW: 400, dH: 400, penWidth: 0.3, truncate: 4 };

const receiver = {
  id: 'receiver', name: 'receiver', primitive: 'plane', params: { sx: 500, sz: 500 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const torusCaster = {
  id: 'caster', name: 'caster', primitive: 'torus', params: { sx: 40, sy: 12, sz: 40, detail: 24 },
  transform: { x: 60, y: 30, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const sphereCaster = {
  id: 'caster', name: 'caster', primitive: 'sphere', params: { radius: 20, detail: 20 },
  transform: { x: 60, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const styleTable = () => ({
  scene: { penId: null, mapper: 'hatch', params: { fillAngle: 20, fillDensity: 80, toneLaw: 'ladder' } },
  byObject: {
    receiver: { penId: null, mapper: 'hatch', params: { fillAngle: 20, fillDensity: 80, toneLaw: 'ladder' } },
    caster: { penId: null, mapper: 'hatch', params: { fillAngle: 20, fillDensity: 80, toneLaw: 'ladder' } },
  },
  byFace: {},
});

const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 25, intensity: 1 };
const POINT = { id: 'p1', type: 'point', position: { x: -300, y: 150, z: 0 }, range: 2000, intensity: 4 };

const clippedLenInBox = (a, b, cx, cy, half) => {
  const xmin = cx - half; const xmax = cx + half; const ymin = cy - half; const ymax = cy + half;
  const dx = b.x - a.x; const dy = b.y - a.y;
  let t0 = 0; let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - xmin, xmax - a.x, a.y - ymin, ymax - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return 0; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return 0; if (r > t0) t0 = r; } else { if (r < t0) return 0; if (r < t1) t1 = r; }
  }
  if (t0 > t1) return 0;
  return (t1 - t0) * Math.hypot(dx, dy);
};
const inkInWindow = (paths, center, half) => {
  let len = 0;
  paths.forEach((q) => { for (let i = 1; i < q.length; i++) len += clippedLenInBox(q[i - 1], q[i], center.x, center.y, half); });
  return len;
};

// Off the footprint but still ON the 500mm receiver plane (half-extent 250)
// — a control outside the plane's own bounds reads zero ink on BOTH the
// pre- and post-fix trees and produces a vacuous "ratio" (near-infinite,
// passes trivially either way). Verified: -200,0 sits well clear of the
// torus footprint for both the directional and point rig.
const CONTROL = { x: -200, z: 0 };
const HALF = 6;

const runScene = (V, caster, light) => {
  const Params = V.Scene3D.Params;
  const p = JSON.parse(JSON.stringify(V.ALGO_DEFAULTS.scene3d));
  p.seed = 1;
  p.camera = CAMERA;
  p.ground = { enabled: false };
  p.backdrop = { enabled: false };
  p.objects = [caster, receiver];
  p.lights = [light];
  p.tone = { enabled: true, bands: 2, thresholds: [0.3], ladder: [0.1, 0.95] };
  p.styleTable = styleTable();
  p.shadow = { ...p.shadow, shadowReceiveOnObjects: true };
  const np = Params.normalizeParams(p);
  const paths = V.AlgorithmRegistry.scene3d.generate(
    Params.collectSceneParams(np, []), new V.SeededRNG(1), new V.SimpleNoise(1), BOUNDS,
  ) || [];
  return paths.filter((q) => q.meta && q.meta.kind === 'sceneFill'
    && q.meta.sceneTarget && q.meta.sceneTarget.objectId === 'receiver');
};

const densityRatio = (V, caster, light, probe) => {
  const receiverFills = runScene(V, caster, light);
  const toScreen = (pt) => V.Scene3D.Scene.projectWorldPoint({ x: pt.x, y: 0, z: pt.z }, CAMERA, BOUNDS);
  const probeD = inkInWindow(receiverFills, toScreen(probe), HALF) / ((HALF * 2) ** 2);
  const controlD = inkInWindow(receiverFills, toScreen(CONTROL), HALF) / ((HALF * 2) ** 2);
  return { probeD, controlD, ratio: probeD / (controlD || 1e-9) };
};

describe('W-30c F2b/R3 — torus receive-shadow becomes visible (current tree)', () => {
  let runtime;
  let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  test('sanity — sphere caster on this rig already shows a strong shadow (ratio >= 1.5), unaffected by F2b', () => {
    const { ratio } = densityRatio(V, sphereCaster, POINT, { x: 130, z: 0 });
    expect(ratio).toBeGreaterThanOrEqual(1.5);
  });

  // W-30d (F2a, R2) — UPDATED contract: the footprint centroid sits IN the
  // torus's real geometric hole (that is why F2b had to search elsewhere for
  // an occluded sample in the first place). Now that F2a preserves the hole
  // in both hatch passes, this exact probe correctly reads as UNSHADOWED
  // (measured: directional 0.9158, point 0.99999...96 — both well under the
  // old 1.3 bar). See scene3d-shadow-footprint-torus-hole-accuracy.test.js for
  // the dedicated RGR proof (RED at 2d931b1a, where these same probes still
  // read >= 1.3 — R2's over-coverage bug).
  test('torus, directional light — probe at the footprint centroid (the real hole) is now UNSHADOWED (ratio < 1.3)', () => {
    const { ratio } = densityRatio(V, torusCaster, SUN, { x: -4.34, z: 0 });
    expect(ratio).toBeLessThan(1.3);
  });

  test('torus, point light — probe at the footprint centroid (the real hole) is now UNSHADOWED (ratio < 1.3)', () => {
    const { ratio } = densityRatio(V, torusCaster, POINT, { x: 150.07, z: 0 });
    expect(ratio).toBeLessThan(1.3);
  });
});

// ── W-30d note on this pin ───────────────────────────────────────────────
// This describe block runs UNPINNED (against the CURRENT tree) whenever the
// file is run normally — `makeMultiFilePreShaRuntimeOptions` only swaps in
// the 90f3411f source when `VECTURA_PRE_W30C_B=1` is set by hand — so its two
// torus assertions are, in normal CI, actually asserting something about the
// CURRENT tree, not the pinned one. Before F2a they coincided (both "must be
// shadowed", since F2b alone over-covered the whole hull including the hole);
// after F2a the two probes are UNSHADOWED for two DIFFERENT reasons at the
// two SHAs — pre-F2b, F2b's whole fix didn't exist yet (the original bug);
// current tree, R2's hole is now correctly excluded — so a single shared
// assertion can no longer discriminate them, and re-pointing it at the
// current-tree truth (`< 1.3`, matching the block above) would make it pass
// trivially under the manual pin too, ceasing to prove anything about F2b.
// Retired here rather than left silently broken; `scene3d-shadow-footprint-
// torus-hole-accuracy.test.js` carries the accurate, correctly-pinned (2d931b1a)
// RED/GREEN proof for what actually changed (F2a/R2) in this unit (W-30d).
// The sphere control below is untouched by any of this and still holds.
//
//   VECTURA_PRE_W30C_B=1 npx vitest run tests/unit/scene3d-shadow-footprint-torus-visibility.test.js
describe('W-30c F2b RED-proof pin (90f3411f) — the occlusion-valid tone sample must be absent', () => {
  let runtime;
  let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(preW30cRuntimeOptions()); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  test('sphere control (unaffected by F2b) still passes here — the sphere\'s centroid was always occluded', () => {
    const { ratio } = densityRatio(V, sphereCaster, POINT, { x: 130, z: 0 });
    expect(ratio).toBeGreaterThanOrEqual(1.5);
  });
});
