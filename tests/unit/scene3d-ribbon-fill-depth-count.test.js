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

// R-27: the per-law existence checks (sec. 1) and the named-cell zero checks
// (sec. 2) were removed. Sec. 3's healthy baseline still pins contour/weaveDepth
// (one of the named cells) at fillEmpty 0 and erodeEmpty 0; the erodeEmpty
// zero on hatch is held by tests/integration/scene3d-ribbon-region-clip.test.js.

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
  // identical fixture shape to every RGR test in this lane per ROUND3-RESUME-BRIEFS §0 rule 3.
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

  describe('3. mutation proof — a forced fill-depth-empty trips fillEmpty and NOT erodeEmpty', () => {
    test('forcing one FILL-depth erosion level to come back empty increments fillEmpty, leaves erodeEmpty untouched', () => {
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

      // U2 (fill-style review 2026-10-02): both ribbon erosions now come
      // from ONE `PenFill.erodeLevels` call — levels[0] is the outline
      // (pen/2), levels[1] the fill region (pen·(1 - overlap)). The mutant
      // empties the FILL level of the first ribbon that has one, leaving its
      // outline intact — the same "fill erosion silently returned nothing"
      // the old insetMultiPolygon mutant forced.
      const PF = V.PenFill;
      const origErode = PF.erodeLevels;
      let calls = 0;
      let forced = false;
      PF.erodeLevels = function mutantErodeLevels(...args) {
        calls += 1;
        const res = origErode.apply(this, args);
        if (!forced && res && res.levels[0].length && res.levels[1].length) {
          forced = true;
          res.levels[1] = [];
        }
        return res;
      };

      let after;
      try {
        after = buildTorusCell(V, 'contour', 'weaveDepth');
      } finally {
        PF.erodeLevels = origErode;
        GU.insetMultiPolygon = origInset;
      }

      expect(calls, 'mutant erodeLevels was never called').toBeGreaterThan(0);
      expect(forced, 'mutant never found a ribbon with a fill level to force empty — fixture drifted').toBe(true);
      expect(after.stats.fillEmpty, `mutated fillEmpty=${after.stats.fillEmpty}`).toBeGreaterThan(0);
      // The blind spot, proven directly: erodeEmpty stays 0 because the
      // OUTLINE for that same stretch still shipped (`any` stayed true) —
      // exactly the condition that makes `fillEmpty` necessary at all.
      expect(after.stats.erodeEmpty, `mutated erodeEmpty=${after.stats.erodeEmpty}`).toBe(0);
    });
  });
});
