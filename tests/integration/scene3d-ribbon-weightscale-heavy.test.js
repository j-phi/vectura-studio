const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const {
  BOUNDS, BUCKET_B_HEAVY, buildScene, effWeight,
} = require('../helpers/scene3d-ribbon-weightscale-shared');

/*
 * T4 — composed Scene3D weight contracts (heavy bucket-B laws).
 *
 * The slowest five bucket-B laws, split out of scene3d-ribbon-weightscale.test.js
 * so each file stays short. The remaining bucket-B laws, bucket C, the roster
 * check (which covers the FULL law list) and the C4 suites stay there.
 */

describe('T4 — ribbon laws emit only real single-pen strokes; three-pen laws keep their nibs', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const fills = (styleParams) => (algo.generate(buildScene(defaults, styleParams), null, null, BOUNDS) || [])
    .filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');

  test.each(BUCKET_B_HEAVY)('bucket B — "%s" emits nothing but weightScale-1 paths', (law) => {
    const paths = fills({ toneLaw: law });
    expect(paths.length).toBeGreaterThan(0);
    const offenders = paths.filter((pp) => effWeight(pp) !== 1).map(effWeight);
    // Report the actual widths on failure — "3 paths at 2.4, 1.8, 0.6" is a
    // diagnosis; "expected 3 to be 0" is not.
    expect({ law, offenders: offenders.slice(0, 8), count: offenders.length })
      .toEqual({ law, offenders: [], count: 0 });
  });
});
