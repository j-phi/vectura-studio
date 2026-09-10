/**
 * W-30d (F2a, R2) — a non-convex caster's receive-shadow FOOTPRINT correctness:
 * the torus's own geometric HOLE must not render as shadowed.
 *
 * Finding (W-30c-plan.md §2 R2, parked at W-30c per its own stop condition;
 * confirmed unfixed by W-30c-review.md's condition (7): `buildFaceFootprint`
 * (`src/core/algorithms/scene3d.js`) reduced every OTHER object to
 * `Shadows.convexHull`'s outer wrap before hatching it as the caster's
 * "inside" shadow region. For a torus this FILLS the hole: measured
 * (W-30c-plan.md §1a) 35.5% (point) / 45.8% (directional) of the emitted
 * footprint's area is not actually occluded by the real mesh. F2b (W-30c)
 * fixed the SYMPTOM that made this invisible (R3 — no shadow rendered at
 * all), by finding an occluded sample elsewhere in the hull when the
 * (hole-landing) centroid read unshadowed — but that FIX still hatched the
 * hole itself at the SAME "inside" (shadowed) spacing as the real ring,
 * because the footprint was still one solid hull polygon with no hole.
 *
 * Fix (F2a, `src/core/scene3d/shadows.js` + `src/core/algorithms/scene3d.js`):
 * `casterSilhouetteLoops`'s bail check (`shadows.js` — "below ground casts
 * nothing onto y=0") hardcoded the GROUND's own y=0 plane. Generalized to an
 * arbitrary plane's signed distance (`planeSignedDist`, anchor + normal),
 * `casterSilhouetteLoops`/`casterHull` now work against ANY receiving face's
 * own plane, not just the ground — which is what `buildFaceFootprint` needed
 * to call the SAME true-silhouette primitive `build()`'s ground-shadow path
 * already used (outer + inner rim for a torus, holes preserved). New export
 * `Shadows.footprintRings` returns the caster's TRUE loops when it finds a
 * genuine hole (>1 loop), and falls back to the hull otherwise — so every
 * CONVEX caster's footprint is still bit-identical to before this fix
 * (guarded in `scene3d-shadow-footprint-wiring.test.js`'s directional md5
 * test), and only a caster with a real hole gets new (correct) geometry.
 * `buildFaceFootprint`'s footprint polygon set is now an array of GROUPS (one
 * per other object, 1+ rings each); both the "outside" pass (even-odd across
 * every group's rings) and the "inside" pass (even-odd PER GROUP, not per
 * ring) now correctly exclude a caster's own hole from its shadow.
 *
 * Direct, disclosed consequence: the footprint's own CENTROID (which for a
 * torus lands IN the hole — see `scene3d-shadow-footprint-torus-visibility
 * .test.js`'s W-30d update note) now correctly reads UNSHADOWED, where it
 * read shadowed (over-covered) under F2b alone. This file's RED proof pins
 * `2d931b1a` (fill-collapse-2's HEAD immediately before this unit, i.e.
 * F2b done / F2a not yet) — the SAME rig (`scene3d-shadow-footprint-torus-
 * visibility.test.js`'s torus caster, sx=40/sy=12/sz=40 at (60,30,0), 500mm
 * plane receiver, `shadowReceiveOnObjects: true`) and the SAME already-
 * measured probe coordinates from that file (directional -4.34,0; point
 * 150.07,0) — NOT re-derived here, so a geometry drift would show up as a
 * probe-density anomaly rather than silently passing.
 *
 * RED proof:
 *   VECTURA_PRE_W30D_HOLE=1 npx vitest run tests/unit/scene3d-shadow-footprint-torus-hole-accuracy.test.js
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { makeMultiFilePreShaRuntimeOptions } = require('../helpers/pre-wip-surface-fill');

const SHADOWS_REL = 'src/core/scene3d/shadows.js';
const SCENE3D_REL = 'src/core/algorithms/scene3d.js';
// fill-collapse-2's HEAD immediately before this unit (W-30d) started — F2b
// (torus-visible, hole still over-covered) done, F2a (hole preserved) not.
const BASE_SHA = '2d931b1a';
const preW30dRuntimeOptions = makeMultiFilePreShaRuntimeOptions(BASE_SHA, 'VECTURA_PRE_W30D_HOLE', [SHADOWS_REL, SCENE3D_REL]);

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

const CONTROL = { x: -200, z: 0 };
const HALF = 6;

const runScene = (V, light) => {
  const Params = V.Scene3D.Params;
  const p = JSON.parse(JSON.stringify(V.ALGO_DEFAULTS.scene3d));
  p.seed = 1;
  p.camera = CAMERA;
  p.ground = { enabled: false };
  p.backdrop = { enabled: false };
  p.objects = [torusCaster, receiver];
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

const densityAt = (receiverFills, V, probe) => {
  const toScreen = (pt) => V.Scene3D.Scene.projectWorldPoint({ x: pt.x, y: 0, z: pt.z }, CAMERA, BOUNDS);
  return inkInWindow(receiverFills, toScreen(probe), HALF) / ((HALF * 2) ** 2);
};

const holeRatio = (V, light, probe) => {
  const fills = runScene(V, light);
  const probeD = densityAt(fills, V, probe);
  const controlD = densityAt(fills, V, CONTROL);
  return probeD / (controlD || 1e-9);
};

// The solid annulus band genuinely IS shadowed — a max-density scan over a
// window around the torus, matching W-30c-plan.md §1e's own scanning method
// (not a single hardcoded point, so it stays valid regardless of exactly
// where along the ring `firstOccludedSample` happens to land first).
const maxBandRatio = (V, light) => {
  const fills = runScene(V, light);
  const controlD = densityAt(fills, V, CONTROL);
  let maxD = -Infinity;
  for (let x = -60; x <= 220; x += 4) {
    for (let z = -60; z <= 60; z += 4) {
      const d = densityAt(fills, V, { x, z });
      if (d > maxD) maxD = d;
    }
  }
  return maxD / (controlD || 1e-9);
};

describe('W-30d F2a/R2 — torus footprint HOLE is no longer over-covered (current tree)', () => {
  let runtime;
  let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  test('directional — hole centroid reads unshadowed (ratio < 1.3, close to the 0.9158 measured baseline)', () => {
    expect(holeRatio(V, SUN, { x: -4.34, z: 0 })).toBeLessThan(1.3);
  });

  test('point — hole centroid reads unshadowed (ratio < 1.3, close to the 1.0 measured baseline)', () => {
    expect(holeRatio(V, POINT, { x: 150.07, z: 0 })).toBeLessThan(1.3);
  });

  // Anti-vacuity: the fix must not have simply deleted the whole shadow — a
  // genuinely occluded point in the solid annulus band must still read
  // markedly denser than control, on both light types.
  test('directional — the solid annulus band itself is still genuinely shadowed (max scanned ratio >= 1.5)', () => {
    expect(maxBandRatio(V, SUN)).toBeGreaterThanOrEqual(1.5);
  });

  test('point — the solid annulus band itself is still genuinely shadowed (max scanned ratio >= 1.5)', () => {
    expect(maxBandRatio(V, POINT)).toBeGreaterThanOrEqual(1.5);
  });
});

// ── RED-proof pin (BASE_SHA = 2d931b1a, F2b done / F2a not yet). UNCONDITIONAL
// — the exact same assertion as the GREEN test above (`< 1.3`). Run without
// VECTURA_PRE_W30D_HOLE this loads the CURRENT tree and passes trivially; run
// with VECTURA_PRE_W30D_HOLE=1 it loads the pinned 2d931b1a `shadows.js` +
// `scene3d.js` (the hull still fills the hole there) and this assertion FAILS
// — proof R2's over-coverage was real and F2a closes it. Measured directly
// against this pin: directional ratio 2.869, point ratio 3.021 (matches
// W-30c-impl.md's own GREEN numbers for F2b, which is exactly R2's bug: the
// hole reads as shadowed as densely as the real ring).
//
//   VECTURA_PRE_W30D_HOLE=1 npx vitest run tests/unit/scene3d-shadow-footprint-torus-hole-accuracy.test.js
describe('W-30d F2a RED-proof pin (2d931b1a) — the hole must be over-covered there', () => {
  let runtime;
  let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(preW30dRuntimeOptions()); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  test('directional — same hole-centroid assertion as GREEN must FAIL on the pre-F2a tree', () => {
    expect(holeRatio(V, SUN, { x: -4.34, z: 0 })).toBeLessThan(1.3);
  });

  test('point — same hole-centroid assertion as GREEN must FAIL on the pre-F2a tree', () => {
    expect(holeRatio(V, POINT, { x: 150.07, z: 0 })).toBeLessThan(1.3);
  });
});
