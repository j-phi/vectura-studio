const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');
const { buildSphere } = require('../helpers/surface-lock-synthetic-sphere');

// Surface-locked fills: the frame budget (docs/surface-lock-contract.md §11).
// Asserts exact counters (deterministic work) and one generous clock; the median is reported, not gated tightly
// (this machine is shared; see tests/perf/scene3d-drag.test.js).

const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };
const CAM = { yaw: -30, pitch: 20, roll: 0, zoom: 1, projection: 'orthographic' };
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

describe('surface lock frame budget', () => {
  let rt; let V; let SL; let set60k;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; SL = V.Scene3D.SurfaceLock;
    set60k = buildSphere(V, { step: 0.7 });
  });
  afterAll(() => rt && rt.cleanup());

  const run = (set, n, view) => {
    const pose = SL.poseOf({ x: 0, y: 0, z: 0, yaw: 20 }, CAM, BOUNDS);
    SL.frame([set.ms], pose, view); // warm: decoded normals, JIT
    SL.resetStats();
    const times = [];
    for (let i = 0; i < n; i++) { const t0 = performance.now(); SL.frame([set.ms], pose, view); times.push(performance.now() - t0); }
    return { times, stats: { ...SL.stats } };
  };

  it('60k-vertex synthetic set: exact counters, median of 7 within the clock', () => {
    const nv = set60k.ms.vertexCount;
    expect(nv).toBeGreaterThan(50000); expect(nv).toBeLessThan(75000);
    const lut = new Float32Array(257); for (let k = 0; k <= 256; k++) lut[k] = (0.5 + 3 * (k / 256)) / set60k.p0;
    const view = { toneFn: (n, p) => 0.5 + 0.5 * n.y, tone: { lut }, penWidth: 0.3, objectId: 'o' };
    const a = run(set60k, 7, view);
    const b = run(set60k, 7, view);
    expect(a.stats.frames).toBe(7);
    expect(a.stats.verticesIn).toBe(7 * nv);
    expect(a.stats.runsIn).toBe(7 * set60k.ms.runCount);
    ['verticesOut', 'runsOut', 'culledFacing', 'culledGrazing', 'culledTone'].forEach((k) => expect(b.stats[k], k).toBe(a.stats[k]));
    expect(a.stats.verticesOut).toBeGreaterThan(0);
    const med = median(a.times);
    // eslint-disable-next-line no-console
    console.log(`surface-lock frame: ${nv} vertices, median of 7 = ${med.toFixed(2)} ms (budget 8 ms), runsOut/frame ${a.stats.runsOut / 7}`);
    expect(med).toBeLessThanOrEqual(40);
  });
});
