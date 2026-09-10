/**
 * W-30d (thin-torus blank-void fix) — F2b's/F2a's `firstOccludedSample`
 * fallback can leave a shadow that SHOULD exist entirely BLANK for a torus
 * whose solid annulus band is thin relative to its own ring radius.
 *
 * Finding (W-30c-review.md, "secretary flag 1"): the reviewer instrumented
 * `firstOccludedSample`'s null-vs-hit outcome and found it reachable for a
 * thinner torus tube (`sy=3`/`sy=1.5` on the plan's own rig) — when it
 * returns null, the receiver's fill draws NEITHER the shadowed nor the
 * unshadowed pitch there: `Shadows.hatchRingsEvenOdd(outsideRings, ...)`
 * treats every footprint ring as a hole (zero ink from the outside pass by
 * construction), so a null "inside" sample leaves a hard-edged BLANK VOID —
 * arguably worse than the pre-F2b "reads as unshadowed" failure mode.
 *
 * Root cause (confirmed in this unit, `src/core/algorithms/scene3d.js`):
 * `firstOccludedSample` walked each candidate vertex at a FIXED FRACTION
 * (0.9) of the way toward the group's centroid. That fraction is relative to
 * the RADIUS, not an absolute distance — so for a torus whose ring radius is
 * large relative to its tube thickness, walking 90% of the way in from the
 * outer boundary can overshoot the whole solid band and land back in the
 * hole on the far side too, for every candidate vertex, at every ring.
 *
 * Reproduction, measured directly on this fixture (this unit's own commits —
 * F2a landed the true annular footprint (outer + inner rings) FIRST, at
 * `83d1e021`, still with the single 0.9 fraction; this file's own fix widens
 * that to a graded series): torus caster `sx=180/sy=3/sz=180` (tube radius
 * `min(sy,sz)*0.28` floor-clamped to 1mm — `src/core/scene3d/charts.js`
 * `topoTorus` — against a `major = sx*0.75 = 135mm` ring radius, a genuinely
 * razor-thin 1:135 band) at (60,30,0); the same 500mm plane receiver,
 * directional SUN, `shadowReceiveOnObjects: true` rig every W-30/W-30b/W-30c/
 * W-30d torus test in this suite already shares. A max-density scan across a
 * window around the torus (matching W-30c-plan.md §1e's own method):
 *
 *   single fraction (0.9), F2a alone (83d1e021):  ratio ~1.054 (BLANK — no
 *     visible shadow anywhere in the scanned window, beyond noise)
 *   graded fractions (this fix):                   ratio ~2.095 (a genuine,
 *     clearly visible shadow)
 *
 * The already-working, less-extreme rig (sx=40/sy=12/sz=40, W-30c's own) is
 * unaffected either way — both the single and graded search already land a
 * hit there (verified: ratio ~2.91-2.92 both ways) — so this fix only changes
 * behavior for a band thin enough that 0.9 alone misses it.
 *
 * RED proof (BASE_SHA = 83d1e021, this unit's own F2a commit — hole geometry
 * exists, single-fraction search does not yet):
 *
 *   VECTURA_PRE_W30D_THIN=1 npx vitest run tests/unit/scene3d-shadow-footprint-torus-thin-blank.test.js
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { makeMultiFilePreShaRuntimeOptions } = require('../helpers/pre-wip-surface-fill');

const SCENE3D_REL = 'src/core/algorithms/scene3d.js';
// This unit's own F2a commit (hole-preserving footprint landed; the thin-
// torus fallback search was still the single 0.9 fraction).
const BASE_SHA = '83d1e021';
const preW30dThinRuntimeOptions = makeMultiFilePreShaRuntimeOptions(BASE_SHA, 'VECTURA_PRE_W30D_THIN', [SCENE3D_REL]);

const CAMERA = { projection: 'orthographic', yaw: 20, pitch: 45, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const BOUNDS = { width: 420, height: 420, m: 10, dW: 400, dH: 400, penWidth: 0.3, truncate: 4 };

const receiver = {
  id: 'receiver', name: 'receiver', primitive: 'plane', params: { sx: 500, sz: 500 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
// Razor-thin: tube radius floor-clamped to 1mm (topoTorus: min(sy,sz)*0.28,
// floored at 1) against a 135mm ring radius (sx*0.75).
const thinTorusCaster = {
  id: 'caster', name: 'caster', primitive: 'torus', params: { sx: 180, sy: 3, sz: 180, detail: 24 },
  transform: { x: 60, y: 30, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
// W-30c's own (already-working) rig — a regression guard, not a repro.
const wideTorusCaster = {
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

const CONTROL = { x: -240, z: 0 };

// Max-density scan over a window around the torus (W-30c-plan.md §1e's own
// method) — not a single hardcoded probe, so it stays valid regardless of
// exactly which ring vertex the search happens to land on first.
const maxScanRatio = (V, caster, light, scan) => {
  const fills = runScene(V, caster, light);
  const toScreen = (pt) => V.Scene3D.Scene.projectWorldPoint({ x: pt.x, y: 0, z: pt.z }, CAMERA, BOUNDS);
  const controlD = inkInWindow(fills, toScreen(CONTROL), 6) / 144;
  let maxD = -Infinity;
  const step = Math.max(2, Math.round(scan / 30)) * 2;
  for (let x = -scan; x <= scan; x += step) {
    for (let z = -scan; z <= scan; z += step) {
      const d = inkInWindow(fills, toScreen({ x, z }), 4) / 64;
      if (d > maxD) maxD = d;
    }
  }
  return maxD / (controlD || 1e-9);
};

describe('W-30d thin-torus blank-void fix (current tree)', () => {
  let runtime;
  let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  test('razor-thin torus (sx=180/sy=3) — a genuine shadow is visible (max scanned ratio >= 1.8), not a blank void', () => {
    expect(maxScanRatio(V, thinTorusCaster, SUN, 160)).toBeGreaterThanOrEqual(1.8);
  });

  test('regression guard — the already-working wide-band torus (sx=40/sy=12) is unaffected (max scanned ratio >= 2.5)', () => {
    expect(maxScanRatio(V, wideTorusCaster, SUN, 40)).toBeGreaterThanOrEqual(2.5);
  });
});

// ── RED-proof pin (BASE_SHA = 83d1e021, F2a done / this fix not yet).
// UNCONDITIONAL — same assertions as GREEN. Run without VECTURA_PRE_W30D_THIN
// this loads the CURRENT tree and passes trivially; run with
// VECTURA_PRE_W30D_THIN=1 it loads the pinned 83d1e021 `scene3d.js` (single
// 0.9 fraction) and the thin-torus assertion FAILS (measured directly against
// this pin: ratio ~1.054) while the wide-band regression guard still holds
// (measured: ratio ~2.914) — proof the blank-void bug was real on the THIN
// rig specifically, not a general regression in the F2a hole fix.
//
//   VECTURA_PRE_W30D_THIN=1 npx vitest run tests/unit/scene3d-shadow-footprint-torus-thin-blank.test.js
describe('W-30d thin-torus RED-proof pin (83d1e021)', () => {
  let runtime;
  let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(preW30dThinRuntimeOptions()); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  test('razor-thin torus — same assertion as GREEN must FAIL on the single-fraction (pre-fix) tree', () => {
    expect(maxScanRatio(V, thinTorusCaster, SUN, 160)).toBeGreaterThanOrEqual(1.8);
  });

  test('regression guard — same assertion as GREEN, unaffected either way (wide-band torus)', () => {
    expect(maxScanRatio(V, wideTorusCaster, SUN, 40)).toBeGreaterThanOrEqual(2.5);
  });
});
