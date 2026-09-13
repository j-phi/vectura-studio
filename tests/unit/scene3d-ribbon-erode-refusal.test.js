/*
 * RGR — F1-erode: `insetMultiPolygon`'s escalating retry ladder treats a
 * SWALLOWED `FillBoolean` failure as an empty answer and gives up on rung 0,
 * instead of trying its own next four rungs.
 *
 * `docs/3d-audit/lane-reports/F1-erode-plan.md` §1/§3. Root cause: on the
 * default torus/hatch/interlockWeave/density-50/pen-0.30 render, one
 * `strokeRingsToBand` per-contour `FB.union` call throws inside
 * `polygon-clipping`'s sweep line. `FillBoolean.safeOp` (`fill-boolean.js`)
 * catches the throw, warns, and returns `null` — so `FB.union` hands back
 * `[]` and NO exception ever reaches `insetMultiPolygon`'s own `catch`. Its
 * five-rung escalating retry (`geometry-utils.js:1298-1305`) therefore
 * `break`s on attempt 0 with `region = []`: a swallowed boolean failure is
 * indistinguishable, from the ladder's point of view, from a genuinely empty
 * erosion. `ribbonize` (`surface-fill.js:7259`) then fires `ribbonRefuse
 * ('erodeEmpty')` and substitutes a bare centreline for a real
 * **51.77 mm², 1.11 mm-wide** ribbon (3.7 pen widths — nowhere near the
 * 0.30 mm collapse depth a genuine erosion refusal would imply).
 *
 * `FillBoolean.consumeLastOpError()` is the only reliable signal a swallowed
 * failure ever occurred (the exact idiom `ribbon-geometry.js:296-310`'s
 * `runBooleanOp` already uses, with its own header comment saying so). This
 * file instruments `GeometryUtils.insetMultiPolygon` from the OUTSIDE — no
 * source change of its own — clearing `consumeLastOpError()` immediately
 * before each call and reading it immediately after, so it can tell a
 * swallowed-and-empty result apart from a real one.
 *
 * THREE GATES (plan §3b), all measured on `interlockWeave`; the four other
 * bucket-B laws (`onePenDown`, `trochoidLoop`, `ampSpacing`, `weaveDepth`)
 * ride along as controls that must stay at 0/0 on both trees:
 *
 *   1. `stats.erodeEmpty === 0` — RED on the unpatched tree: interlockWeave
 *      = 1. Controls measure 0 on both trees.
 *   2. No swallowed-and-empty `insetMultiPolygon` call survives a whole
 *      render — RED: interlockWeave = 1 call. This is the assertion that
 *      isolates the mechanism itself, not a downstream area number: it
 *      cannot be satisfied by re-tuning anything else.
 *   3. Anti-vacuity: `stats.wide` does not fall below its own measured floor
 *      and `stats.ribbons === stats.wide` once the ladder recovers — so
 *      "erodeEmpty = 0" cannot be bought by reclassifying the stretch out of
 *      `CLS_RIBBON` instead of fixing the erosion.
 *
 * This file does NOT gate `ringFillRate` or `ringNotInkMm2` — those bars
 * already exist in `scene3d-ribbon-f1b-streaks.test.js` and
 * `scene3d-ribbon-wall-coverage.test.js` (the integration-level oracle);
 * duplicating them here buys nothing and creates a third place to creep.
 *
 * The two `trochoidLoop` reds in the sibling files (lattice sensitivity,
 * lengthwise streak) are a DIFFERENT, sub-millimetre placement defect (plan
 * §3c: a 0.19 mm² corner pocket, byte-identical geometry with and without
 * this fix) — out of scope here, and this file asserts nothing about them.
 *
 *   npx vitest run tests/unit/scene3d-ribbon-erode-refusal.test.js
 *   # pre-fix (RED):  erodeEmpty=1, swallowedAndEmpty=1, ribbons(39) !== wide(40) for interlockWeave
 *   # post-fix (GREEN): erodeEmpty=0, swallowedAndEmpty=0, ribbons===wide for all five
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// The F1 self-crossing slab-collapse list, verbatim (handoff doc, item A) —
// same roster as `scene3d-ribbon-f1b-streaks.test.js`.
const LAWS = ['interlockWeave', 'onePenDown', 'trochoidLoop', 'ampSpacing', 'weaveDepth'];
const SUBJECT_LAW = 'interlockWeave';
// Measured floor for `stats.wide` on the CURRENT tree (`cd541f87`, i.e. after
// F1-placement/Prototype B, before this unit's fix) — see plan §1's table
// (`stats.wide` is 40 for interlockWeave both before and after the erosion
// fix; only the wide/ribbons SPLIT moves, 39 -> 40). A fix that reduces `wide`
// below this floor is buying "erodeEmpty=0" by reclassifying stretches out of
// `CLS_RIBBON`, not by fixing the ladder.
const MIN_WIDE = { interlockWeave: 40 };

describe('SurfaceFill — F1-erode: insetMultiPolygon ladder refusal on a swallowed boolean failure (torus/hatch)', () => {
  let runtime;
  let V;
  const results = {};

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    V = runtime.window.Vectura;
    const GU = V.GeometryUtils;
    const FB = V.FillBoolean;
    const origInset = GU.insetMultiPolygon;
    const consumeErr = (typeof FB.consumeLastOpError === 'function')
      ? () => FB.consumeLastOpError()
      : () => null;

    LAWS.forEach((toneLaw) => {
      let calls = 0;
      let swallowedAndEmpty = 0;

      GU.insetMultiPolygon = function patchedInsetMultiPolygon(...args) {
        calls += 1;
        consumeErr(); // clear anything a prior, unrelated caller left pending
        const res = origInset.apply(this, args);
        const err = consumeErr();
        if (err && (!res || res.length === 0)) swallowedAndEmpty += 1;
        return res;
      };

      const engine = new V.VectorEngine();
      const groupId = engine.addLayer('scene3d');
      const group = engine.layers.find((l) => l && l.id === groupId);
      const obj = engine.getLayerDescendants(groupId)
        .filter((l) => l && l.type === 'object3d')[0];
      obj.params.primitive = 'torus';
      obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
      obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };
      // Default camera (3/4 view), default density (50) and pen (0.30) —
      // identical fixture shape to `scene3d-ribbon-f1b-streaks.test.js`.

      engine.computeAllDisplayGeometry();

      GU.insetMultiPolygon = origInset;

      const stats = { ...(V.Scene3D.SurfaceFill.lastRibbonStats || {}) };
      results[toneLaw] = { stats, calls, swallowedAndEmpty, group };
    });

    GU.insetMultiPolygon = origInset;
  }, 600000);

  afterAll(() => runtime && runtime.cleanup());

  test.each(LAWS)('%s — erodeEmpty is 0 (the ladder recovers instead of surrendering)', (law) => {
    const { stats } = results[law];
    expect(stats.erodeEmpty, `${law}: erodeEmpty=${stats.erodeEmpty}`).toBe(0);
  });

  test.each(LAWS)('%s — no swallowed FillBoolean failure survives the insetMultiPolygon ladder', (law) => {
    const { calls, swallowedAndEmpty } = results[law];
    expect(calls, `${law}: insetMultiPolygon was never called`).toBeGreaterThan(0);
    expect(swallowedAndEmpty, `${law}: swallowedAndEmpty=${swallowedAndEmpty} of ${calls} insetMultiPolygon calls`)
      .toBe(0);
  });

  test.each(LAWS)('%s — anti-vacuity: coverage is not bought by reclassifying stretches out of CLS_RIBBON', (law) => {
    const { stats } = results[law];
    if (Object.prototype.hasOwnProperty.call(MIN_WIDE, law)) {
      expect(stats.wide, `${law}: wide=${stats.wide}, floor=${MIN_WIDE[law]}`)
        .toBeGreaterThanOrEqual(MIN_WIDE[law]);
    } else {
      expect(stats.wide, `${law}: wide=${stats.wide}`).toBeGreaterThan(0);
    }
    expect(stats.ribbons, `${law}: ribbons=${stats.ribbons} wide=${stats.wide}`).toBe(stats.wide);
  });

  test(`${SUBJECT_LAW} — degenerate is 0 (no boolean-degeneracy count left over from the swallowed failure)`, () => {
    const { stats } = results[SUBJECT_LAW];
    expect(stats.degenerate, `degenerate=${stats.degenerate}`).toBe(0);
  });
});
