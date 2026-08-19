const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
// THE RIG IS IMPORTED, NOT COPIED (scene3d-fixture-single-source, rule A): the
// whole scene comes from the fixture's own builder, so this file carries no
// inline camera, ladder, bounds or primitive of its own.
const FX = require('../fixtures/scene3d-shadow-anatomy');

/*
 * THE COMMITTED TONE LAW, PINNED.
 *
 * `surface-fill.js` now carries TEN tone laws behind one selector, plus an
 * UNCAPPED mode that lifts the line budget (MASTER_MAX_LINES 420 -> 4000, the
 * masterPitch clamp bypassed so the master grid rules at the plot floor itself).
 * All of that exists for one comparison exercise. None of it is shipped.
 *
 * The failure this guards against is not subtle and it is not hypothetical: the
 * comparison harness patches these three constants in a COPY of the tree, and
 * the difference between a patched copy and the worktree is one `sed`. A
 * prototype left switched on would change every existing 3D drawing — uncapped
 * `sphere . hatch` emits 2341 mm of ink against the committed 775 mm, and the
 * master grid goes from 40 rulings to 145.
 *
 * So the shipped values are asserted directly, off the module's own published
 * getters rather than off a source-text grep:
 *
 *   TONE_ALGO      'ladder'   the control, byte-identical to the behaviour
 *                             before the selector existed
 *   TONE_UNCAPPED  false      budget on, exactly as it has always been
 *   FLOW_MODE      'iso'      inert while TONE_ALGO is not 'contourFlow'
 *
 * Red without the guard: flip any of the three in `surface-fill.js` and this
 * fails. Green with the committed source.
 */
describe('Scene3D.SurfaceFill — the committed tone law is the control', () => {
  let runtime;
  let SF;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    SF = V.Scene3D.SurfaceFill;
  });
  afterAll(() => runtime.cleanup());

  test('publishes which tone law it was built with', () => {
    expect(typeof SF.toneAlgo).toBe('string');
    expect(typeof SF.uncapped).toBe('boolean');
    expect(typeof SF.flowMode).toBe('string');
  });

  test("ships the control law, not one of the nine prototypes", () => {
    expect(SF.toneAlgo).toBe('ladder');
  });

  test('ships with the line budget ON — uncapped mode is a comparison mode', () => {
    expect(SF.uncapped).toBe(false);
  });

  test('never publishes a floor report in the committed build', () => {
    // `lastFloorStats` is written only in uncapped mode. A non-null value here
    // would mean the uncapped path ran, whatever the flag claims.
    expect(SF.lastFloorStats).toBeNull();
  });

  test("the flow mode is a valid one even though it is inert", () => {
    expect(['iso', 'grad']).toContain(SF.flowMode);
  });

  /*
   * THE WEIGHT LAWS, PINNED ON THE EMITTER RATHER THAN ON THE FLAG.
   *
   * Six more prototypes now vary the STROKE WIDTH instead of the placement, and
   * four of them additionally cut every ruling into abutting pieces so the width
   * can change along it. That is a much larger change to the emitted geometry
   * than a coverage law is — measured on the app-default sphere, `weightDeepDark`
   * turns 25 fill paths into 502 and 884 mm of ink into 1290 mm — and it is
   * invisible to a flag assertion if a later edit reaches the emitter without
   * touching TONE_ALGO. So the guard is on the OUTPUT: at the committed default
   * no fill run may carry a per-run pen weight at all.
   *
   * Red: set TONE_ALGO to any of 'weightModulated', 'weightAlongLine',
   * 'weightDeepDark', 'weightPlusSpacing', 'weightMultiPass', 'weightSmoothstep'
   * or 'weightCrossHandoff' and this fails (measured: 25 of 25 runs carry
   * weightScale under weightAlongLine). Green on the committed source.
   */
  test('emits no per-run pen weight at the committed default', () => {
    const p = FX.scene({ styleParams: { mapper: 'hatch' } })(V);
    const orig = SF.buildObject;
    const raw = [];
    SF.buildObject = function wrapped(opts) {
      const r = orig.call(this, opts);
      if (r) r.forEach((q) => raw.push(q));
      return r;
    };
    try {
      V.AlgorithmRegistry.scene3d.generate(
        p, new V.SeededRNG(FX.SEED), new V.SimpleNoise(FX.SEED), FX.BOUNDS,
      );
    } finally {
      SF.buildObject = orig;
    }

    expect(raw.length).toBeGreaterThan(0);
    expect(raw.filter((r) => r && r.weightScale !== undefined)).toEqual([]);
  });
});
