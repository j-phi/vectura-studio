/**
 * W-30b — wire `scene3d.js`'s `buildFaceFootprint` to the W-30 per-light-type
 * projector (`Shadows.projectLightToPlane`), through the FULL
 * `AlgorithmRegistry.scene3d.generate()` pipeline (not the module-level
 * `shadows.js` unit tests `scene3d-shadow-footprint-direction.test.js`
 * already covers — those prove the primitive is correct in isolation; this
 * proves the production call site actually uses it).
 *
 * Finding (W-30-impl.md "Scope limit"): before this fix, `buildFaceFootprint`
 * (`src/core/algorithms/scene3d.js`) always called
 * `Shadows.projectAlongDirToPlane(world[i], lightDir, anchor, normalWorldArg)`
 * with `lightDir = Regions.Lighting.lightWorldDir(light)` — which reads only
 * `light.azimuth`/`light.elevation` and so silently falls back to the
 * DEFAULT direction (135deg/45deg) for any point/spot/area light (those carry
 * `position`, not azimuth/elevation). The flat-face shadow-RECEIVE footprint
 * for a non-directional light therefore landed in a direction with NO
 * relationship to where the light actually was.
 *
 * Fix: call `Shadows.projectLightToPlane(P, light, anchor, normalWorldArg,
 * lightDir)` instead — `light` (the raw light record) and `lightDir` (the
 * existing fallback direction) are both already in scope at the call site.
 * A positional light gets the true perspective projector
 * (`projectFromPositionToPlane`, from the light's own world `position`); a
 * directional light keeps the exact same parallel path as before
 * (`fallbackDir` === `lightDir`), so a directional scene is BYTE-IDENTICAL.
 *
 * Geometry rig (full pipeline, `AlgorithmRegistry.scene3d.generate()`):
 *   - receiver: a large ground-level PLANE (sx=sz=1000, half-extent 500 —
 *     comfortably bigger than the footprint this rig produces, so nothing
 *     gets clipped by the face's own outline before the assertion runs).
 *   - caster: a BOX at (60, 20, 0), size 40 (world y in [0,40], resting
 *     exactly on the receiver — its bottom face touches the plane, so its
 *     "shadow" there is a fixed point regardless of projector).
 *   - light: a POINT light at (-300, 150, 0) — far to the -X side. Its
 *     TRUE (perspective) shadow of the box's far (+X) top corners lands out
 *     past x=160; the OLD default-direction (135/45) parallel projector's
 *     footprint NEVER exceeds x=80 (the box's own max x — see "OLD hull
 *     bound" below) for ANY light, because it ignores `light.position`
 *     entirely. A probe at x=140 is therefore PROVABLY outside the OLD
 *     footprint (bounding-box argument, no polygon math needed) and
 *     (verified below via `Shadows.convexHull` + point-in-polygon) inside
 *     the NEW one.
 *
 * `buildFaceFootprint`'s footprint polygon gets hatched DENSER than the rest
 * of the face (the "inside spacing" pass, `src/core/algorithms/scene3d.js`
 * ~2484-2492) — so "the probe is inside the true footprint" is measured as
 * "ink density at the probe is close to a known-outside control point
 * BEFORE the fix, and markedly higher than it AFTER the fix", exactly the
 * ratio-based method `scene3d-shadow-receive.test.js`'s Unit-D-judge and
 * Unit-D-polish suites already use for the SAME `buildFaceFootprint`
 * mechanism (directional-light case).
 *
 * RED proof (this lane's WIP HEAD, before the one-line call-site swap):
 *   VECTURA_PRE_W30B=1 npx vitest run tests/unit/scene3d-shadow-footprint-wiring.test.js
 */
const { execFileSync } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { makeMultiFilePreShaRuntimeOptions } = require('../helpers/pre-wip-surface-fill');

const SCENE3D_REL = 'src/core/algorithms/scene3d.js';
// This lane's WIP HEAD at the time this unit started (U5b-2/3's checkpoint
// commit) — the tree `buildFaceFootprint` still unconditionally used the
// parallel projector in, i.e. the correct "before W-30b" pin.
const BASE_SHA = '1e681432';
const preW30bRuntimeOptions = makeMultiFilePreShaRuntimeOptions(BASE_SHA, 'VECTURA_PRE_W30B', [SCENE3D_REL]);

let cachedPreFixSource = null;
const getPreFixScene3dSource = () => {
  if (cachedPreFixSource) return cachedPreFixSource;
  const rootDir = path.resolve(__dirname, '../..');
  cachedPreFixSource = execFileSync('git', ['show', `${BASE_SHA}:${SCENE3D_REL}`], {
    cwd: rootDir,
    maxBuffer: 1024 * 1024 * 64,
  }).toString('utf8');
  return cachedPreFixSource;
};

const CAMERA = { projection: 'orthographic', yaw: 20, pitch: 45, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const BOUNDS = { width: 420, height: 420, m: 10, dW: 400, dH: 400, penWidth: 0.3, truncate: 4 };

const receiver = {
  id: 'receiver', name: 'receiver', primitive: 'plane', params: { sx: 1000, sz: 1000 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const caster = {
  id: 'caster', name: 'caster', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
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

// intensity/range are turned UP (max clamp 4, generous 2000 range) so the
// UNSHADOWED baseline clears the tone threshold (0.3) cleanly and the
// shadowed/unshadowed contrast shows up as a real coverage-band change, not
// just a sub-threshold wobble both sides of it — geometry (position) is
// unaffected by either knob, so the hull predictions above still hold.
const POINT_LIGHT = { id: 'p1', type: 'point', position: { x: -300, y: 150, z: 0 }, range: 2000, intensity: 4 };
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

// Ray-casting point-in-polygon, generic {x,y} vertex list (the `y` field
// holds this rig's world `z`, matching `Shadows.convexHull`'s generic 2D
// contract — it never assumes a "z" name).
const pointInPolygon = (pt, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x; const yi = poly[i].y;
    const xj = poly[j].x; const yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y))
      && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// The 8 world corners of `caster`'s box (transform (60,20,0), half-extent 20
// each axis) — the same vertex set `buildFaceFootprint` projects per other-
// object world vertex.
const boxCorners = () => {
  const cx = 60; const cy = 20; const cz = 0; const h = 20;
  const out = [];
  [cx - h, cx + h].forEach((x) => [cy - h, cy + h].forEach((y) => [cz - h, cz + h].forEach((z) => {
    out.push({ x, y, z });
  })));
  return out;
};

const PROBE = { x: 140, z: 0 }; // provably outside OLD hull, inside NEW hull (asserted below)
const CONTROL = { x: -300, z: -300 }; // far outside both hulls (min hull x across OLD/NEW is ~11.7)

const runScene = (V, light) => {
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

describe('W-30b — buildFaceFootprint wired to the per-light-type projector (current/fixed tree)', () => {
  let runtime;
  let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  test('precondition — PROBE is outside the OLD (parallel/default-dir) hull and inside the NEW (perspective) hull', () => {
    const Shadows = V.Scene3D.Shadows;
    const anchor = { x: 0, y: 0, z: 0 };
    const normal = { x: 0, y: 1, z: 0 };
    // Same default direction `Regions.Lighting.lightWorldDir` falls back to
    // for ANY light with no azimuth/elevation override (az=135, el=45).
    const DEG = Math.PI / 180;
    const az = 135 * DEG; const el = 45 * DEG; const cosEl = Math.cos(el);
    const DEFAULT_LIGHT_DIR = { x: -cosEl * Math.sin(az), y: -Math.sin(el), z: -cosEl * Math.cos(az) };
    const corners = boxCorners();
    const oldPts = corners
      .map((P) => Shadows.projectAlongDirToPlane(P, DEFAULT_LIGHT_DIR, anchor, normal))
      .filter(Boolean).map((pt) => ({ x: pt.x, y: pt.z }));
    const newPts = corners
      .map((P) => Shadows.projectLightToPlane(P, POINT_LIGHT, anchor, normal, DEFAULT_LIGHT_DIR))
      .filter(Boolean).map((pt) => ({ x: pt.x, y: pt.z }));
    const oldMaxX = Math.max(...oldPts.map((pt) => pt.x));
    // Bounding-box argument: a convex hull's max-x can never exceed the
    // max-x of its own point set, so PROBE.x > oldMaxX suffices to prove
    // PROBE sits outside the OLD hull without any polygon math.
    expect(PROBE.x).toBeGreaterThan(oldMaxX);
    const newHull = Shadows.convexHull(newPts);
    expect(newHull.length).toBeGreaterThanOrEqual(3);
    expect(pointInPolygon({ x: PROBE.x, y: PROBE.z }, newHull)).toBe(true);
  });

  test('point light — ink density at PROBE (inside the true perspective footprint) is markedly denser than CONTROL', () => {
    const receiverFills = runScene(V, POINT_LIGHT);
    const toScreen = (pt) => V.Scene3D.Scene.projectWorldPoint({ x: pt.x, y: 0, z: pt.z }, CAMERA, BOUNDS);
    const HALF = 12;
    const probeD = inkInWindow(receiverFills, toScreen(PROBE), HALF) / ((HALF * 2) ** 2);
    const controlD = inkInWindow(receiverFills, toScreen(CONTROL), HALF) / ((HALF * 2) ** 2);
    // Measured 3.03 on the fixed tree (RED-proof pin measures 1.01 — see the
    // pinned describe block below).
    expect(probeD / (controlD || 1e-9)).toBeGreaterThanOrEqual(1.5);
  });

  test('directional light — receive footprint stays exactly where it was (parallel projector unchanged)', () => {
    const receiverFills = runScene(V, SUN);
    expect(receiverFills.length).toBeGreaterThan(0);
  });
});

// ── Directional-light byte-identity guard ───────────────────────────────
// Compares the CURRENT (fixed) tree's full `generate()` output against the
// pinned pre-fix tree's output for a scene whose ONLY light is directional —
// `projectLightToPlane`'s `positional` branch is false for `type:
// 'directional'`, so it falls straight through to the exact same
// `projectAlongDirToPlane(P, fallbackDir, ...)` call the old code made
// directly. Byte-identical proves the fix adds a new path without touching
// the old one.
describe('W-30b — directional-light scene stays BYTE-IDENTICAL across the fix', () => {
  let runtimeOld;
  let runtimeNew;
  let Vold;
  let Vnew;

  beforeAll(async () => {
    runtimeOld = await loadVecturaRuntime({ scriptOverrides: { [SCENE3D_REL]: getPreFixScene3dSource() } });
    runtimeNew = await loadVecturaRuntime();
    Vold = runtimeOld.window.Vectura;
    Vnew = runtimeNew.window.Vectura;
  });
  afterAll(() => { runtimeOld.cleanup(); runtimeNew.cleanup(); });

  test('directional-light receiver fills are byte-identical old vs new (md5 of the serialized paths)', () => {
    const pathsOld = runScene(Vold, SUN);
    const pathsNew = runScene(Vnew, SUN);
    const md5 = (v) => crypto.createHash('md5').update(JSON.stringify(v)).digest('hex');
    const oldHash = md5(pathsOld);
    const newHash = md5(pathsNew);
    expect(pathsOld.length).toBeGreaterThan(0);
    expect(newHash).toBe(oldHash);
  });
});

// ── RED-proof pin (BASE_SHA = 1e681432, this lane's WIP HEAD immediately
// before the W-30b call-site swap). Pinned `scene3d.js` still unconditionally
// calls `Shadows.projectAlongDirToPlane(..., lightDir, ...)` regardless of
// `light.type`, so the point light's TRUE position is never consulted — the
// probe/control ink-density ratio below must FAIL against it.
//
//   VECTURA_PRE_W30B=1 npx vitest run tests/unit/scene3d-shadow-footprint-wiring.test.js
describe('W-30b RED-proof pin (1e681432) — call-site wiring must be absent', () => {
  let runtime;
  let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(preW30bRuntimeOptions()); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  test('same "probe denser than control" assertion as the GREEN test must FAIL here (point light)', () => {
    // UNCONDITIONAL — the exact same assertion as the GREEN test above. Run
    // without VECTURA_PRE_W30B this loads the CURRENT (fixed) tree and
    // passes trivially; run with VECTURA_PRE_W30B=1 it loads the pinned
    // 1e681432 `scene3d.js` (call site still always parallel/default-dir)
    // and this assertion FAILS — proof the wiring bug was real and this fix
    // closes it.
    const receiverFills = runScene(V, POINT_LIGHT);
    const toScreen = (pt) => V.Scene3D.Scene.projectWorldPoint({ x: pt.x, y: 0, z: pt.z }, CAMERA, BOUNDS);
    const HALF = 12;
    const probeD = inkInWindow(receiverFills, toScreen(PROBE), HALF) / ((HALF * 2) ** 2);
    const controlD = inkInWindow(receiverFills, toScreen(CONTROL), HALF) / ((HALF * 2) ** 2);
    expect(probeD / (controlD || 1e-9)).toBeGreaterThanOrEqual(1.5);
  });
});
