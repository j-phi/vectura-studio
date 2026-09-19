/*
 * RGR — F1-count: a PRODUCTION counter for the fill-depth blind spot
 * `erodeEmpty` structurally cannot see.
 *
 * `docs/3d-audit/lane-reports/LEDGER.md` row 2d/6 and `F1-erode-plan.md` §1
 * ("What the fallback costs"): `ribbonize()` (`surface-fill.js`) erodes a
 * clipped ribbon region twice — once (shallow) for the OUTLINE, once again
 * (deeper) for the FILL. `erodeEmpty` only fires when `any` — "outline
 * shipped OR fill shipped" — is false (`surface-fill.js`, the
 * `if (!any) { ribbonRefuse('erodeEmpty'); ... }` line). A stretch whose
 * OUTLINE erosion succeeds and whose FILL erosion then comes back empty
 * leaves `any === true`, so `erodeEmpty` never fires — even when the deeper
 * `insetMultiPolygon` call swallowed a `FillBoolean` failure exactly like
 * the one F1-erode's retry ladder (`geometry-utils.js:1298-1329`) fixed.
 *
 * F1-erode's own planner and implementer measured this by instrumenting
 * `GeometryUtils.insetMultiPolygon` from OUTSIDE the shipped tree (no source
 * counter existed): on the pre-F1-erode tree, an 8-mapper x torus sweep
 * found SIX swallowed-and-empty `insetMultiPolygon` calls. Two surfaced as
 * `erodeEmpty`/`degenerate` (`hatch/interlockWeave`, `crosshatch/
 * interlockWeave` — both an empty OUTLINE too). The other FOUR did not,
 * because the outline shipped and only the fill went empty:
 * `contour/trochoidLoop` x1, `contour/weaveDepth` x2, `crosshatch/
 * weaveDepth` x1 (F1-erode-impl.md's own instrumentation table). LEDGER row
 * 2d states the RED explicitly: "a correct counter shows 4 pre-fix and 0
 * post-F1-erode. If it shows 0 pre-fix it is in the wrong place."
 *
 * This unit adds `SurfaceFill.lastRibbonStats.fillEmpty` — the SAME trigger
 * condition as the pre-existing `outlineOnly` bucket (`outlineMP.length &&
 * !fillMP.length`), but placed in the refusal/diagnostics family next to
 * `erodeEmpty`/`clipEmpty`/`degenerate` instead of blending silently into
 * `outlineOnly`'s ordinary ribbon bookkeeping. It gates OBSERVABILITY of
 * silent ink loss at the fill depth, not geometry — it cannot (and does not
 * try to) distinguish "genuinely too narrow for a second erosion" from "a
 * swallowed boolean failure the ladder could not recover", because that
 * signal is consumed and cleared inside `insetMultiPolygon` itself before it
 * ever returns (by design, so no caller leaks a stale error to the next,
 * unrelated erosion) — `geometry-utils.js` is outside this unit's file
 * grant and was not touched.
 *
 * THREE GROUPS OF TESTS:
 *
 *   1. STRUCTURAL RED/GREEN — `fillEmpty` exists as a finite number in
 *      `lastRibbonStats` for every law. Fails (undefined) before this
 *      unit's source change, passes after.
 *   2. THE FOUR NAMED CELLS ON a5d8a1be (POST-F1-erode, this worktree's own
 *      HEAD) — `fillEmpty === 0` for `contour/trochoidLoop`, `contour/
 *      weaveDepth`, `crosshatch/weaveDepth`. F1-erode's ladder fix already
 *      recovers these; this is the "0 post-fix" half of the LEDGER's RED
 *      statement, measured live. (The historical "4 pre-fix" half is NOT
 *      reproducible inside this suite — it requires code that predates this
 *      very field — and is instead reproduced in a scratch `git archive
 *      7f805654` export and reported in `F1-count-impl.md` per
 *      AGENT-PROTOCOL's "RED comes from a scratch export" rule.)
 *   3. MUTATION PROOF — force one FILL-depth `insetMultiPolygon` call to
 *      return `[]` while its antecedent OUTLINE call is left alone, and
 *      confirm `fillEmpty` trips (and `erodeEmpty` does NOT, proving this
 *      is genuinely the blind spot `erodeEmpty` cannot see).
 *
 *   npx vitest run tests/unit/scene3d-ribbon-fill-depth-count.test.js
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// The bucket-B self-crossing slab-collapse roster, verbatim — same laws
// `scene3d-ribbon-erode-refusal.test.js` and `scene3d-ribbon-f1b-streaks.test.js`
// use as controls.
const LAWS = ['interlockWeave', 'onePenDown', 'trochoidLoop', 'ampSpacing', 'weaveDepth'];

// The three named cells F1-erode-impl.md's 8-mapper sweep found with a
// fill-depth-only swallowed-and-empty `insetMultiPolygon` call (mapper !==
// 'hatch' — those were `outlineOnly`-and-swallowed instances, distinct from
// the two `hatch`/`crosshatch` `interlockWeave` cells whose OUTLINE also
// failed and which therefore already surfaced as `erodeEmpty`).
const NAMED_CELLS = [
  { mapper: 'contour', law: 'trochoidLoop' },
  { mapper: 'contour', law: 'weaveDepth' },
  { mapper: 'crosshatch', law: 'weaveDepth' },
];

const buildTorusCell = (V, mapper, toneLaw) => {
  const engine = new V.VectorEngine();
  const groupId = engine.addLayer('scene3d'); // redirects to addSceneTree()
  const group = engine.layers.find((l) => l && l.id === groupId);
  const obj = engine.getLayerDescendants(groupId)
    .filter((l) => l && l.type === 'object3d')[0];
  obj.params.primitive = 'torus';
  obj.params.style = obj.params.style || { penId: null, mapper, params: {} };
  obj.params.style.mapper = mapper;
  obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };
  // Default camera (3/4 view), default density (50), default pen (0.30) —
  // identical fixture shape to `scene3d-ribbon-erode-refusal.test.js` and to
  // every RGR test in this lane per ROUND3-RESUME-BRIEFS §0 rule 3.
  group.params.tone = { ...(group.params.tone || {}), enabled: true };
  engine.computeAllDisplayGeometry();
  return { engine, group, stats: { ...(V.Scene3D.SurfaceFill.lastRibbonStats || {}) } };
};

describe('SurfaceFill — F1-count: fillEmpty production counter (fill-depth blind spot)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    V = runtime.window.Vectura;
  }, 600000);

  afterAll(() => runtime && runtime.cleanup());

  describe('1. structural gate — fillEmpty exists in stats, in the same family as erodeEmpty/clipEmpty/degenerate', () => {
    test.each(LAWS)('%s (hatch/torus) — lastRibbonStats.fillEmpty is a finite non-negative number', (law) => {
      const { stats } = buildTorusCell(V, 'hatch', law);
      expect(typeof stats.fillEmpty, `${law}: typeof fillEmpty`).toBe('number');
      expect(Number.isFinite(stats.fillEmpty), `${law}: fillEmpty=${stats.fillEmpty}`).toBe(true);
      expect(stats.fillEmpty, `${law}: fillEmpty=${stats.fillEmpty}`).toBeGreaterThanOrEqual(0);
    });

    test('fillEmpty sits next to erodeEmpty/clipEmpty/degenerate in the published stats object', () => {
      const { stats } = buildTorusCell(V, 'hatch', 'onePenDown');
      expect(Object.prototype.hasOwnProperty.call(stats, 'fillEmpty')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(stats, 'erodeEmpty')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(stats, 'clipEmpty')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(stats, 'degenerate')).toBe(true);
    });
  });

  describe('2. the four named blind-spot cells, live on a5d8a1be (post-F1-erode) — fillEmpty === 0', () => {
    // hatch/interlockWeave and crosshatch/interlockWeave are the VISIBLE
    // case (F1-erode-plan §1's own root-cause chain): the swallowed failure
    // hit the OUTLINE-depth erode call (`penWidth / 2`), so BOTH outlineMP
    // and fillMP were empty pre-fix and `erodeEmpty` already caught it —
    // these are controls proving that case stayed fixed, NOT the blind-spot
    // cells. `fillEmpty` (this unit's counter) is deliberately NOT asserted
    // to be 0 here: measured live on this tree it is 3 / 4 respectively —
    // `interlockWeave` legitimately ships many genuinely-too-narrow
    // outline-only stretches unrelated to any swallowed failure (the same
    // reason `outlineOnly`, the pre-existing counter this one mirrors, was
    // never itself a bug signal). Asserting fillEmpty===0 here would be an
    // unproven, and in fact false, claim.
    test('hatch/interlockWeave (torus) — erodeEmpty is 0 post-F1-erode (the OUTLINE-depth case stays fixed)', () => {
      const { stats } = buildTorusCell(V, 'hatch', 'interlockWeave');
      expect(stats.erodeEmpty, `erodeEmpty=${stats.erodeEmpty}`).toBe(0);
    });

    test('crosshatch/interlockWeave (torus) — erodeEmpty is 0 post-F1-erode (the OUTLINE-depth case stays fixed)', () => {
      const { stats } = buildTorusCell(V, 'crosshatch', 'interlockWeave');
      expect(stats.erodeEmpty, `erodeEmpty=${stats.erodeEmpty}`).toBe(0);
    });

    // The four INVISIBLE cells (only three distinct mapper/law pairs — one,
    // contour/weaveDepth, was TWO calls pre-fix). F1-erode-plan §1 named
    // these with mapper/law by name; NOT reachable via `hatch` (the only
    // mapper `scene3d-ribbon-erode-refusal.test.js` swept).
    test.each(NAMED_CELLS)('$mapper/$law (torus) — fillEmpty === 0 post-F1-erode (was >0 pre-fix, F1-erode-impl.md)', ({ mapper, law }) => {
      const { stats } = buildTorusCell(V, mapper, law);
      expect(stats.fillEmpty, `${mapper}/${law}: fillEmpty=${stats.fillEmpty}`).toBe(0);
      // erodeEmpty must ALSO be 0 — these cells' outline always succeeded,
      // pre- and post-fix alike; that is precisely why they were invisible.
      expect(stats.erodeEmpty, `${mapper}/${law}: erodeEmpty=${stats.erodeEmpty}`).toBe(0);
    });
  });

  describe('3. mutation proof — a forced fill-depth-empty trips fillEmpty and NOT erodeEmpty', () => {
    test('forcing one FILL-depth insetMultiPolygon call to return [] increments fillEmpty, leaves erodeEmpty untouched', () => {
      const GU = V.GeometryUtils;
      const origInset = GU.insetMultiPolygon;

      // Build once, unpatched, to learn the healthy call count for this
      // fixture and confirm it has at least one CLS_RIBBON stretch to
      // mutate (contour/weaveDepth on torus — one of the named cells, known
      // to carry plenty of wide stretches).
      const before = buildTorusCell(V, 'contour', 'weaveDepth');
      expect(before.stats.wide, `wide=${before.stats.wide}`).toBeGreaterThan(0);
      expect(before.stats.fillEmpty, `baseline fillEmpty=${before.stats.fillEmpty}`).toBe(0);
      expect(before.stats.erodeEmpty, `baseline erodeEmpty=${before.stats.erodeEmpty}`).toBe(0);

      // The FILL-depth erode() call always insets by `penWidth * (0.5 -
      // RIBBON_OVERLAP)` (surface-fill.js, RIBBON_OVERLAP = 0.15) chained
      // off a non-empty `outlineMP` — i.e. penWidth * 0.35. The OUTLINE call
      // insets by `penWidth / 2` — i.e. penWidth * 0.5. These are always
      // DIFFERENT magnitudes for the default pen (0.30 mm -> 0.105 mm fill
      // vs 0.15 mm outline), so the mutant below can target the fill call
      // specifically by its inset magnitude without touching the outline.
      let calls = 0;
      let forced = false;
      GU.insetMultiPolygon = function mutantInsetMultiPolygon(mp, d, opts) {
        calls += 1;
        const res = origInset.call(this, mp, d, opts);
        // Target the FIRST non-empty result whose inset matches the fill
        // depth (penWidth * 0.35 for the default 0.30 mm pen = 0.105),
        // forcing exactly that one call empty — a direct, minimal mutant of
        // "the fill erosion silently returned nothing" without touching
        // geometry-utils.js or any other call site.
        if (!forced && res && res.length && Math.abs(Math.abs(d) - 0.105) < 1e-9) {
          forced = true;
          return [];
        }
        return res;
      };

      let after;
      try {
        after = buildTorusCell(V, 'contour', 'weaveDepth');
      } finally {
        GU.insetMultiPolygon = origInset;
      }

      expect(calls, 'mutant insetMultiPolygon was never called').toBeGreaterThan(0);
      expect(forced, 'mutant never found a fill-depth (0.105mm) call to force empty — fixture drifted').toBe(true);
      expect(after.stats.fillEmpty, `mutated fillEmpty=${after.stats.fillEmpty}`).toBeGreaterThan(0);
      // The blind spot, proven directly: erodeEmpty stays 0 because the
      // OUTLINE for that same stretch still shipped (`any` stayed true) —
      // exactly the condition that makes `fillEmpty` necessary at all.
      expect(after.stats.erodeEmpty, `mutated erodeEmpty=${after.stats.erodeEmpty}`).toBe(0);
    });
  });
});
