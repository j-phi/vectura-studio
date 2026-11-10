const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// Level S frame budget (docs/surface-lock-contract.md §11, §13): the default sphere with ground and cast shadow, warm.
// Asserts exact counters (deterministic work) and generous clocks; the medians are reported (this machine is shared,
// see tests/perf/scene3d-drag.test.js). W2-B extends this file with the end-to-end preview breakdown.

const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

describe('surface lock Level S frame budget', () => {
  let rt; let V; let SL;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock; });
  afterAll(() => rt && rt.cleanup());

  [{ name: 'ladder', toneLaw: 'ladder', gen: 150 }, { name: 'mezzo', toneLaw: 'mezzoRegion', gen: 150 }].forEach(({ name, toneLaw, gen }) => {
    it(`${name}: sceneFrame median and warm generate, default sphere, ground and shadow on`, () => {
      const s = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw, mapper: 'hatch', markSpace: 'surface' });
      s.setPose({ camYaw: -30, camPitch: 20 }); s.composeFull(); s.composeFull(); // bake + JIT
      const frames = []; const gens = [];
      for (let i = 0; i < 15; i++) {
        s.setPose({ camYaw: -30 + (i % 7) * 3, camPitch: 20 });
        s.eng.invalidateSceneCompose(s.group); s.eng.computeAllDisplayGeometry();
        const p = JSON.parse(JSON.stringify(s.group._sceneAssembled));
        SL.resetStats();
        const t0 = performance.now();
        V.AlgorithmRegistry.scene3d.generate(p, null, null, { width: 320, height: 220, penWidth: 0.3 });
        gens.push(performance.now() - t0);
        expect(SL.stats.sceneFrames).toBe(1); expect(SL.stats.sceneFallbacks).toBe(0); expect(SL.stats.bakeMisses).toBe(0);
        frames.push(SL.stats.msFrameLast);
      }
      const mf = median(frames); const mg = median(gens);
      // eslint-disable-next-line no-console
      console.log(`level S ${name}: sceneFrame median ${mf.toFixed(2)} ms (budget 8), generate median ${mg.toFixed(2)} ms (budget ${gen})`);
      expect(mf).toBeLessThanOrEqual(40);
      expect(mg).toBeLessThanOrEqual(gen);
    });
  });
});
