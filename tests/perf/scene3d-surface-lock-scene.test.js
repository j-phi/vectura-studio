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
  // W2-B1: the engine preview frame end to end (what a drag frame costs before the draw): gate + full-tier compose + curve finish.
  [{ name: 'ladder', toneLaw: 'ladder' }, { name: 'mezzo', toneLaw: 'mezzoRegion' }].forEach(({ name, toneLaw }) => {
    it(`${name}: engine preview frame through eng.generate, median of 15 yaw steps (no warp, no bake, Fill Curves skipped)`, () => {
      const s = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw, mapper: 'hatch', markSpace: 'surface', style: { fillCurves: true } });
      s.setPose({ camYaw: -30, camPitch: 20 }); s.composeFull(); s.composeFull(); // bake + JIT
      const st = s.eng.sceneComposeStats; const warps0 = st.warps; const frames0 = SL.stats.sceneFrames; const misses0 = SL.stats.bakeMisses;
      const ms = [];
      for (let i = 0; i < 15; i++) {
        s.setPose({ camYaw: -30 + (i + 1) * 3, camPitch: 20 });
        const t0 = performance.now();
        s.eng.generate(s.gid, { preview: true });
        ms.push(performance.now() - t0);
        expect(st.lastTier).toBe('full');
      }
      expect(st.warps).toBe(warps0);
      expect(SL.stats.sceneFrames - frames0).toBe(15);
      expect(SL.stats.bakeMisses).toBe(misses0);
      const mm = median(ms);
      // eslint-disable-next-line no-console
      console.log(`level S ${name}: engine preview frame median ${mm.toFixed(2)} ms (app budget 16 incl. draw)`);
      expect(mm).toBeLessThanOrEqual(60);
    });
  });
});
