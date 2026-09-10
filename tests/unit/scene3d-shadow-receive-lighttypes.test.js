/**
 * W-30c (F3, R4, O3) — point/spot/area receive-shadow integration coverage,
 * and the "an ambient light at lights[0] deletes a positional light's
 * receive shadow" defect.
 *
 * Coverage gap (STILL-OPEN.md line 8): `scene3d-shadow-footprint-wiring.test.js`
 * (W-30b) only exercises a POINT light through the full `generate()`
 * pipeline; spot and area were never driven end-to-end. This file closes
 * that gap for all three positional types on the SAME rig.
 *
 * Defect (W-30c-plan.md §1d, §2 R4): `scene3d.js:1303` builds
 * `const light = (p.lights && p.lights[0]) || {}` and `buildFaceFootprint`
 * used THAT light (and its derived `lightDir`) unconditionally. An
 * `ambient` light carries no position/azimuth/elevation, so when it sits at
 * `lights[0]` — which it always does after the default `[{id:'sun',
 * type:'directional'}]` (`src/config/defaults.js`), since the UI always
 * APPENDS a newly added light after the existing ones — `lightWorldDir`
 * fell back to its 135°/45° default, and any point/spot/area light further
 * down the list cast no visible receive shadow at all: measured ratio
 * 1.00 (`[ambient, point]`) vs 3.02 (`[point]` alone).
 *
 * Fix (F3): `buildFaceFootprint` now picks its own light —
 * `(p.lights || []).find((l) => l.type !== 'ambient' && l.castShadows !==
 * false) || light` — scoped to the footprint construction only. `light`/
 * `lightDir` themselves are untouched (they also feed `toneOn`, the
 * specular term, `shadowReceiveOn`).
 *
 * Rig (W-30c-plan.md §1, §1d, reproduced): sphere caster r20 at (60,20,0),
 * plane receiver sx=sz=500 at the origin, ortho camera yaw20/pitch45,
 * fillAngle 20 / fillDensity 80 / toneLaw ladder, tone 2 bands threshold
 * [0.3] ladder [0.1,0.95]; `shadowReceiveOnObjects: true`. Probe world
 * (130, 0) — inside the true point-light perspective footprint — vs control
 * (-150, 0), 12x12-unit ink-density window (the `inkInWindow`/
 * `clippedLenInBox` helpers `scene3d-shadow-footprint-wiring.test.js` /
 * `scene3d-shadow-receive.test.js` already use for the same measurement).
 *
 * RED proof (this lane's HEAD at the W-30c briefing, 90f3411f, before F3):
 *
 *   VECTURA_PRE_W30C_C=1 npx vitest run tests/unit/scene3d-shadow-receive-lighttypes.test.js
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { makeMultiFilePreShaRuntimeOptions } = require('../helpers/pre-wip-surface-fill');
const { execFileSync } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const SCENE3D_REL = 'src/core/algorithms/scene3d.js';
const BASE_SHA = '90f3411f'; // fill-collapse-2's HEAD at the W-30c briefing (U7, before F3)
const preW30cRuntimeOptions = makeMultiFilePreShaRuntimeOptions(BASE_SHA, 'VECTURA_PRE_W30C_C', [SCENE3D_REL]);

let cachedPreFixSource = null;
const getPreFixScene3dSource = () => {
  if (cachedPreFixSource) return cachedPreFixSource;
  const rootDir = path.resolve(__dirname, '../..');
  cachedPreFixSource = execFileSync('git', ['show', `${BASE_SHA}:${SCENE3D_REL}`], {
    cwd: rootDir, maxBuffer: 1024 * 1024 * 64,
  }).toString('utf8');
  return cachedPreFixSource;
};

const CAMERA = { projection: 'orthographic', yaw: 20, pitch: 45, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const BOUNDS = { width: 420, height: 420, m: 10, dW: 400, dH: 400, penWidth: 0.3, truncate: 4 };

const receiver = {
  id: 'receiver', name: 'receiver', primitive: 'plane', params: { sx: 500, sz: 500 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const caster = {
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

const POINT = { id: 'p1', type: 'point', position: { x: -300, y: 150, z: 0 }, range: 2000, intensity: 4 };
const SPOT = {
  id: 's1', type: 'spot', position: { x: -300, y: 150, z: 0 }, target: { x: 60, y: 20, z: 0 },
  cone: 45, penumbra: 8, range: 2000, intensity: 4,
};
const AREA = { id: 'a1', type: 'area', position: { x: -300, y: 150, z: 0 }, size: 120, samples: 6, range: 2000, intensity: 4 };
const AMBIENT = { id: 'amb1', type: 'ambient', intensity: 0.15 };
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

const PROBE = { x: 130, z: 0 };
const CONTROL = { x: -150, z: 0 };
const HALF = 6; // 12x12-unit window

const runScene = (V, lights) => {
  const Params = V.Scene3D.Params;
  const p = JSON.parse(JSON.stringify(V.ALGO_DEFAULTS.scene3d));
  p.seed = 1;
  p.camera = CAMERA;
  p.ground = { enabled: false };
  p.backdrop = { enabled: false };
  p.objects = [caster, receiver];
  p.lights = lights;
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

const densityRatio = (V, lights) => {
  const receiverFills = runScene(V, lights);
  const toScreen = (pt) => V.Scene3D.Scene.projectWorldPoint({ x: pt.x, y: 0, z: pt.z }, CAMERA, BOUNDS);
  const probeD = inkInWindow(receiverFills, toScreen(PROBE), HALF) / ((HALF * 2) ** 2);
  const controlD = inkInWindow(receiverFills, toScreen(CONTROL), HALF) / ((HALF * 2) ** 2);
  return { probeD, controlD, ratio: probeD / (controlD || 1e-9) };
};

describe('W-30c F3/O3 — point/spot/area receive coverage through the full pipeline (current tree)', () => {
  let runtime;
  let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  test.each([
    ['point', [POINT]],
    ['spot', [SPOT]],
    ['area', [AREA]],
  ])('%s light alone — probe density is markedly higher than control (ratio >= 2.0)', (_name, lights) => {
    const { ratio } = densityRatio(V, lights);
    expect(ratio).toBeGreaterThanOrEqual(2.0);
  });

  test('[point, ambient] — ambient AFTER the point light does not erase the shadow', () => {
    const { ratio } = densityRatio(V, [POINT, AMBIENT]);
    expect(ratio).toBeGreaterThanOrEqual(2.0);
  });

  test('R4 FIX — [ambient, point] (ambient FIRST) — the shadow survives lights[0] being ambient', () => {
    const { ratio } = densityRatio(V, [AMBIENT, POINT]);
    expect(ratio).toBeGreaterThanOrEqual(2.0);
  });

  test('guard — [sun] output is md5-identical old vs new tree (F3 is a no-op for an all-directional list)', async () => {
    const runtimeOld = await loadVecturaRuntime({ scriptOverrides: { [SCENE3D_REL]: getPreFixScene3dSource() } });
    try {
      const Vold = runtimeOld.window.Vectura;
      const pathsOld = runScene(Vold, [SUN]);
      const pathsNew = runScene(V, [SUN]);
      const md5 = (val) => crypto.createHash('md5').update(JSON.stringify(val)).digest('hex');
      expect(pathsOld.length).toBeGreaterThan(0);
      expect(md5(pathsNew)).toBe(md5(pathsOld));
    } finally {
      runtimeOld.cleanup();
    }
  });
});

// ── RED-proof pin (BASE_SHA = 90f3411f, before F3) ─────────────────────────
// `buildFaceFootprint` still always used `light` (== lights[0]) there, so
// `[ambient, point]` must reproduce the "shadow is gone" defect (ratio ~1.0)
// — and the SAME assertion as the GREEN test's R4 case above must FAIL.
//
//   VECTURA_PRE_W30C_C=1 npx vitest run tests/unit/scene3d-shadow-receive-lighttypes.test.js
describe('W-30c F3 RED-proof pin (90f3411f) — lights[0]-only footprint must be absent', () => {
  let runtime;
  let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(preW30cRuntimeOptions()); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  test('same R4 assertion as GREEN — [ambient, point] ratio >= 2.0 — must FAIL on the pre-fix tree', () => {
    const { ratio } = densityRatio(V, [AMBIENT, POINT]);
    expect(ratio).toBeGreaterThanOrEqual(2.0);
  });

  test('control case — [point, ambient] (point FIRST) already worked pre-fix and must still pass here', () => {
    const { ratio } = densityRatio(V, [POINT, AMBIENT]);
    expect(ratio).toBeGreaterThanOrEqual(2.0);
  });
});
