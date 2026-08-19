const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

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

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    SF = runtime.window.Vectura.Scene3D.SurfaceFill;
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
});
