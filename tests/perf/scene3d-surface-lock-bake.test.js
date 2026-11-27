const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');

// Wall-clock budgets for the D5 surface-lock bakes (turingStripe, voronoiWeb). They lived in tests/unit, where the
// instrumented coverage shards run them 3-5x slower than the budget allows; timing belongs here, in the uninstrumented
// `perf` job (tests/perf is excluded from coverage runs). The vertex-count budgets stay in the unit tests.
// node vm is 3-8x slower than Chromium, so each budget is checked at 4x of the 150 ms / 400 ms target.

const specOf = (law, o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: law,
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1, markSpace: 'surface' }, penWidth: 0.3, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2', dragPreview: true, ...o,
});
const boxSpec = (law, o = {}) => specOf(law, { primitive: 'box', mode: 'faceted', sizes: { sx: 20, sy: 14, sz: 10 }, detail: undefined, ...o });

describe('surface lock D5 bake wall-clock budgets', () => {
  let rt; let W;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime(); W = rt.V.Scene3D.SurfaceLockWebs;
    // warm the bake path (JIT) as the unit files' earlier tests did, so the budgets time a steady-state bake
    W.bake(specOf('turingStripe', { objectId: 'warm1' })); W.bake(specOf('voronoiWeb', { objectId: 'warm2' }));
  }, 240000);
  afterAll(() => rt && rt.cleanup());

  it('turingStripe: the full bake of a default-size sphere / torus / box (scaleRef 1) fits 600 ms', () => {
    const L = 'turingStripe';
    [specOf(L, { sizes: { sx: 25, sy: 25, sz: 25 }, objectId: 'p1' }), boxSpec(L, { sizes: { sx: 40, sy: 40, sz: 40 }, objectId: 'p2' }), specOf(L, { primitive: 'torus', mode: 'torus', sizes: { sx: 34, sy: 9, sz: 9, detail: 24 }, objectId: 'p3' })].forEach((sp) => {
      const t0 = Date.now(); W.bake(sp); const dt = Date.now() - t0;
      expect(dt, sp.primitive).toBeLessThan(600);
    });
  });

  it('voronoiWeb: the bake fits 1600 ms', () => {
    const t0 = Date.now(); W.bake(specOf('voronoiWeb', { scaleRef: 3, objectId: 'o2' })); const dt = Date.now() - t0;
    expect(dt).toBeLessThan(1600);
  });
});
