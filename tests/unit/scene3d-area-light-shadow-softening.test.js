/**
 * W-30c (F1, R1, O2) — an AREA light loses ALL softening the instant its
 * centre ray is occluded.
 *
 * Finding (W-30c-plan.md §1c, §2 R1): `Regions.combinedIntensity`
 * (`src/core/scene3d/regions.js`) evaluated the shadow gate ONCE, at
 * `light.position` (the emitter's own centre) — `regions.js:176`, one line
 * ABOVE the `type === 'area'` branch — before the N-sample Fibonacci spread
 * (`areaSampleOffset`) ever ran. `ShadowReceive.pointInShadow` casts a single
 * ray, so a partly-occluded area light collapsed straight to a hard 0
 * instead of softening: the penumbra an area light exists to produce was
 * entirely absent, not merely reduced.
 *
 * Fix (F1): move the gate INSIDE the area branch's per-sub-sample loop, keyed
 * to each sub-sample's own synthesized position (`{ ...light, type: 'point',
 * position: Ls }`). `ambient` (which `continue`s above the gate) and
 * `point`/`spot` (which fall through to the SAME gate line, now moved one
 * `if` block down but otherwise untouched) are structurally unaffected —
 * proven by guard D below.
 *
 * Rig (W-30c-plan.md §1c, reproduced verbatim): 40mm box caster at
 * `(0, 60, 0)` above a y=0 receiver plane; area light at `(-300, 300, 0)`,
 * size 120 (radius 60), samples 6, intensity 1; receiver normal `(0,1,0)`;
 * probe marches x from 30 to 140mm in 2mm steps at z=0.
 *
 * Reference ("perSampleGated"): the SAME golden-angle sub-sample offsets
 * `Regions`'s own `areaSampleOffset` uses (reproduced here from scratch —
 * this file never imports the private helper), each sub-sample gated by ITS
 * OWN `ShadowReceive.pointInShadow` ray. This is the physically correct
 * average and is independent of `combinedIntensity` (the code under test) —
 * it only reuses `pointInShadow`, an existing primitive F1 does not touch.
 *
 * RED proof (this lane's HEAD at the W-30c briefing, 90f3411f, before F1),
 * recorded in the fix commit (R-18 retired the env-gated pre-fix switch).
 *
 * Pre-fix numbers, measured in the planning export: the profile takes exactly 2 distinct
 * values (0 and ~0.5645) across the whole march (assertion A), max
 * |current - gated| = 0.3985 at x=136 (assertion B), and the strictly-between-
 * 2%-and-98% penumbra band has width 0mm (assertion C) — the reference gives
 * ~32mm.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { goldenValues } = require('../helpers/golden-values');

// R-18 (D-4): guard D used to load the pre-F1 tree (`git show
// 90f3411f:src/core/scene3d/regions.js`) as a second runtime. It now reads a
// committed golden of the point-light march, generated from the tree that
// matched 90f3411f bit for bit (tests/baselines/golden-values/).
const golden = goldenValues('scene3d-area-light-shadow-softening');

const v = (x, y, z) => ({ x, y, z });
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// Reproduced from `regions.js`'s own `areaSampleOffset` (golden-angle
// Fibonacci-sphere spread) — deliberately re-derived here, not imported, so
// this oracle is independent of the module under test.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const areaSampleOffsetOracle = (i, n, radius) => {
  const y = 1 - ((i + 0.5) / n) * 2;
  const rr = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * GOLDEN_ANGLE;
  return v(Math.cos(theta) * rr * radius, y * radius, Math.sin(theta) * rr * radius);
};

const LIGHT = { id: 'a1', type: 'area', position: v(-300, 300, 0), size: 120, samples: 6, intensity: 1 };
const N = 6;
const RADIUS = 60; // size/2
const NORMAL = v(0, 1, 0);

const buildBoxOccluders = (V) => {
  const SceneB = V.Scene3D.Scene;
  const ShadowReceive = V.Scene3D.ShadowReceive;
  const mesh = SceneB.buildPrimitiveMesh({ primitive: 'box', params: { sx: 40, sy: 40, sz: 40 } });
  const xf = { x: 0, y: 60, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
  const world = mesh.vertices.map((pt) => SceneB.applyObjectTransform(pt, xf));
  const record = {
    id: 'caster',
    faces: mesh.faces.map((idx, i) => ({ worldVerts: idx.map((vi) => world[vi]), faceId: mesh.faceIds[i] })),
  };
  return ShadowReceive.buildOccluderSet([record]);
};

const perSampleGated = (V, occ, P) => {
  const ShadowReceive = V.Scene3D.ShadowReceive;
  const pos = LIGHT.position;
  let sum = 0;
  let visible = 0;
  for (let s = 0; s < N; s++) {
    const off = areaSampleOffsetOracle(s, N, RADIUS);
    const Ls = v(pos.x + off.x, pos.y + off.y, pos.z + off.z);
    const blocked = ShadowReceive.pointInShadow(P, { type: 'point', position: Ls }, occ, { excludeObjectId: 'plane' });
    if (blocked) continue;
    visible++;
    const toL = sub(Ls, P);
    const dist = Math.hypot(toL.x, toL.y, toL.z);
    const dir = dist > 1e-9 ? v(toL.x / dist, toL.y / dist, toL.z / dist) : v(0, 1, 0);
    sum += Math.max(0, dot(NORMAL, dir));
  }
  return { I: sum / N, visible };
};

const unshadowedIntensity = (V, P) => V.Scene3D.Regions.combinedIntensity(NORMAL, P, [LIGHT], null);

const currentIntensity = (V, occ, P) => {
  const Regions = V.Scene3D.Regions;
  const ShadowReceive = V.Scene3D.ShadowReceive;
  const shadowFn = (wp, lt) => ShadowReceive.pointInShadow(wp, lt, occ, { excludeObjectId: 'plane' });
  return Regions.combinedIntensity(NORMAL, P, [LIGHT], shadowFn);
};

const marchProfile = (V) => {
  const occ = buildBoxOccluders(V);
  const rows = [];
  for (let x = 30; x <= 140; x += 2) {
    const P = v(x, 0, 0);
    rows.push({
      x,
      current: currentIntensity(V, occ, P),
      gated: perSampleGated(V, occ, P).I,
      unshadowed: unshadowedIntensity(V, P),
    });
  }
  return rows;
};

describe('W-30c F1/O2 — area-light penumbra survives partial occlusion (current tree)', () => {
  let runtime;
  let V;
  let rows;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    rows = marchProfile(V);
  });
  afterAll(() => runtime.cleanup());

  test('A — penumbra exists: the profile takes >= 4 distinct current-intensity values over the march', () => {
    const distinct = new Set(rows.map((r) => r.current.toFixed(6)));
    expect(distinct.size).toBeGreaterThanOrEqual(4);
  });

  test('B — accuracy: max |current - perSampleGated| <= 0.05', () => {
    const maxErr = Math.max(...rows.map((r) => Math.abs(r.current - r.gated)));
    expect(maxErr).toBeLessThanOrEqual(0.05);
  });

  test('C — penumbra width: x-range strictly between 2% and 98% of the local unshadowed value is >= 20mm', () => {
    const inBand = rows.filter((r) => {
      const lo = 0.02 * r.unshadowed;
      const hi = 0.98 * r.unshadowed;
      return r.current > lo && r.current < hi;
    });
    const width = inBand.length ? (Math.max(...inBand.map((r) => r.x)) - Math.min(...inBand.map((r) => r.x))) : 0;
    expect(width).toBeGreaterThanOrEqual(20);
  });

  test('sanity — the march actually spans occluded and partially-relit ground (anti-vacuity)', () => {
    expect(rows.some((r) => r.current < r.unshadowed * 0.02)).toBe(true); // fully shadowed exists (x in [38,104])
    // The march (30-140mm) does not reach full daylight (that happens past
    // x=180 on this rig — verified separately) but it does cross well into
    // the penumbra's graded region.
    expect(rows.some((r) => r.current > r.unshadowed * 0.6)).toBe(true);
  });
});

// ── Guard D — point/spot lights structurally untouched ─────────────────────
// F1's edit lives entirely inside the `type === 'area'` branch; the shared
// occlusion gate line simply moved one `if` block down, so a `point` light at
// the SAME position must keep its exact pre-fix `combinedIntensity` march.
// The golden holds that march (pre-fix 90f3411f values).
describe('W-30c F1 guard D — point-light march is bit-identical to the pre-fix golden', () => {
  let runtime;
  let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  test('point light at LIGHT.position — march matches the pre-fix golden', () => {
    const POINT_LIGHT = { id: 'p1', type: 'point', position: LIGHT.position, intensity: 1 };
    const occ = buildBoxOccluders(V);
    const shadowFn = (wp, lt) => V.Scene3D.ShadowReceive.pointInShadow(wp, lt, occ, { excludeObjectId: 'plane' });
    const march = [];
    for (let x = 20; x <= 150; x += 2) {
      march.push(V.Scene3D.Regions.combinedIntensity(NORMAL, v(x, 0, 0), [POINT_LIGHT], shadowFn));
    }
    expect(march.some((I) => I === 0)).toBe(true); // the march genuinely crosses the point light's own hard shadow
    expect(march.some((I) => I > 0)).toBe(true);
    golden.expect('guard D point-light march x=20..150 step 2', march);
  });
});
