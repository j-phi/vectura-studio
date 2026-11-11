const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');

// Locked ground shadow wall-clock budgets (docs/surface-lock-contract.md §10). Timing belongs in the perf lane, not
// unit tests: the unit suite asserts deterministic work counters. Best-of-N after a warm-up, so one scheduler
// hiccup on a shared machine cannot fail the budget while a real regression (every run slow) still does.

const SHADOW = { shadowAngle: 45, shadowDensity: 50, shadowToneDepth: 0.75, shadowFalloff: 0.5, shadowLayers: false, shadowToneLaw: 'ladder' };
const GROUND = { enabled: true, scaleX: 1, scaleZ: 1, width: 320, height: 220 };
const SUN = { type: 'directional', azimuth: 135, elevation: 45, castShadows: true };
const SPHERE = { primitive: 'sphere', shape: 'sphere', center: { x: 0, y: 25, z: 0 }, radius: 25 };
const pose = { cam: { yaw: -30, pitch: 20, roll: 0, scale: 1, cx: 160, cy: 110, persp: false } };

describe('surface lock ground shadow budget', () => {
  let rt; let SH; let dir;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    SH = rt.V.Scene3D.SurfaceLockShadow; dir = rt.V.Scene3D.Lighting.lightWorldDir(SUN);
  });
  afterAll(() => rt && rt.cleanup());

  it('bake <= 20 ms and frameShadow median < 1 ms', () => {
    const bakeOnce = (seed) => { SH.clearCache(); const t = performance.now(); const h = SH.bakeGround(GROUND, SHADOW, 0.3, seed); return { h, ms: performance.now() - t }; };
    bakeOnce(1); // warm: JIT
    const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => bakeOnce(s + 100));
    const bakeMs = Math.min(...runs.map((r) => r.ms));
    const h = runs[0].h;
    SH.frameShadow(h, [SPHERE], dir, pose);
    const medians = [];
    for (let r = 0; r < 3; r += 1) {
      const times = [];
      for (let i = 0; i < 60; i += 1) { const s = performance.now(); SH.frameShadow(h, [SPHERE], dir, pose); times.push(performance.now() - s); }
      times.sort((a, b) => a - b); medians.push(times[30]);
    }
    const frameMs = Math.min(...medians);
    // eslint-disable-next-line no-console
    console.log('shadow perf: best bake ms', bakeMs.toFixed(2), 'best frame median ms', frameMs.toFixed(3), 'lines', h.count);
    expect(bakeMs).toBeLessThan(20);
    expect(frameMs).toBeLessThan(1);
  });
});
