const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// H4: the per-pose cost of Level S sceneFrame (bake excluded) at default settings, on a rotation step: the budgets of
// docs/surface-lock-contract.md section 11 for the three headline scenes. As in scene3d-surface-lock-scene.test.js the budget
// is reported and the assertion carries the repo's 5x noise allowance (this machine is shared). The frame is timed by wrapping
// SurfaceLock.sceneFrame with the test's own high-resolution clock (the VM clock is 1 ms coarse).

const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const NOISE = 5;
const POSES = 30;

const CASES = [
  { name: 'single sphere, default scene', budget: 8, opts: { kind: 'sphere' } },
  { name: 'two objects (sphere + box), shadows on objects', budget: 16, opts: { kind: 'two' }, receive: true },
  { name: 'Duty Cycle sphere', budget: 12, opts: { kind: 'sphere', style: { toneLaw: 'dutyConst' } } },
];

describe('surface lock Level S per-pose frame budget (H4)', () => {
  let rt; let V; let SL;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock; }, 120000);
  afterAll(() => rt && rt.cleanup());

  CASES.forEach(({ name, budget, opts, receive }) => {
    it(`${name}: sceneFrame median of ${POSES} rotation steps (budget ${budget} ms)`, () => {
      const s = buildSurfaceLockScene(V, { ...opts, markSpace: 'surface', mapper: 'hatch' });
      if (receive) s.group.params.shadow = Object.assign({}, s.group.params.shadow, { shadowReceiveOnObjects: true });
      s.composeFull();
      for (let i = 0; i < 73; i++) { s.setPose({ camYaw: -30 + i * 5, camPitch: 20 }); s.composePreview(); } // bake, JIT and every vertex's tone seen once
      const orig = SL.sceneFrame; const times = [];
      SL.sceneFrame = function timed(...args) { const t0 = performance.now(); const r = orig.apply(this, args); times.push(performance.now() - t0); return r; };
      try {
        SL.resetStats();
        for (let i = 0; i < POSES; i++) { s.setPose({ camYaw: -30 + i * 5, camPitch: 20 }); s.composePreview(); }
      } finally { SL.sceneFrame = orig; }
      expect(times).toHaveLength(POSES);
      expect(SL.stats.sceneFrames).toBe(POSES); expect(SL.stats.sceneFallbacks).toBe(0); expect(SL.stats.bakeMisses).toBe(0);
      expect(SL.stats.toneEvals).toBe(0); // the tone memo and the receive map are warm: a rotation step recomputes neither
      const m = median(times);
      // eslint-disable-next-line no-console
      console.log(`H4 ${name}: sceneFrame median ${m.toFixed(2)} ms (budget ${budget})`);
      expect(m).toBeLessThanOrEqual(budget * NOISE);
    }, 120000);
  });
});
