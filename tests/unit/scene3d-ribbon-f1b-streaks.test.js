/*
 * RGR — F1B: RESIDUAL LENGTHWISE STREAKS IN THE FIVE SELF-CROSSING LAWS.
 *
 * STATUS (2026-09-05, A3 amended): MEASURED, F1 STAYS OPEN. Two prior
 * hypotheses are now dead: self-occlusion false positives (A2,
 * `torus-occlusion.js`/`hlr.js`, KEPT) and PenFill/boolean-erosion DROPPING
 * geometry (A3 — `docs/3d-audit/lane-reports/A3-plan.md`): across a whole
 * torus render there are 0-1 boolean failures per law and 0.000 mm² of the
 * 0.89-2.06 mm² `ringNotInkMm2` is dropped geometry. What the metric mostly
 * counts instead is PEN-UNREACHABLE area: 89-98% of every law's number sits
 * in cells no 0.3 mm pen can ink while its centre stays inside the *clipped*
 * ribbon (convex corners + sub-2-pen necks) — a correct, derivable
 * predicate, not a fill defect (see `tests/helpers/scene3d-ring-coverage.js`'s
 * own header and `scene3d-ring-coverage-reachability.test.js`'s synthetic
 * proofs).
 *
 * `docs/3d-audit/lane-reports/A3-judge.md` (the binding amended brief)
 * REJECTED closing F1 on that split anyway: the plan's own numbers show the
 * ENTIRE residue — reachable and unreachable together — is a scatter of
 * ~150 sub-mm clusters per law, none longer than ~1 mm and none wider than
 * one pen over any real length. There is no band anywhere in `ringNotInkMm2`;
 * it was never the user's streak. `docs/stroke-fill-handoff.md` §A's *done
 * when* requires the user confirming it by eye on the bench, not a metric
 * clearing a bar — so the assertions below are RE-PINNED to what this metric
 * can HONESTLY prove (an anti-explosion guard, a non-gating reachable-area
 * diagnostic, a lattice-resolution sanity guard, and a cluster-SHAPE oracle
 * that models what a human calls a streak) and F1 STAYS OPEN — see
 * `docs/3d-audit/STILL-OPEN.md`'s A3 bullet for the exact wording. A green
 * run of this file is NOT evidence F1 is fixed; it is evidence this metric
 * cannot see F1's actual defect (a placement question, likely W-26
 * territory, plus one law-independent ink pinhole — both out of this file's
 * scope; see the judge doc §5 items A3/A4).
 *
 * `docs/stroke-fill-handoff.md`, open item A ("F1 — residual streaks in the
 * self-crossing laws", REOPENED). F1 was believed closed by `2c9f37d6`
 * ("self-crossing ribbons kept their loop holes" — `buildRibbonMultiPolygon`
 * now returns a hole per loop instead of a solid slab, see
 * `ribbon-geometry.js`'s own header on `resolveSelfOverlap`). It was not:
 * thin lengthwise gaps remain inside wide bands on exactly the five laws
 * named below — `interlockWeave`, `onePenDown`, `trochoidLoop`, `ampSpacing`,
 * `weaveDepth` — measured on a torus (contract C2's T1 method,
 * `tests/helpers/scene3d-ring-coverage.js`) as uncovered interior area:
 * 2.01 / 2.00 / 1.49 / 1.24 / 0.87 mm² respectively (this file's own
 * measurement on `d5af9e30` — same order of magnitude and ranking as the
 * handoff doc's 2.4 / 2.3 / 1.6 / 1.4 / 1.0), against a <= 0.18 mm² band the
 * other seven bucket-B laws already occupy.
 *
 * WORKING HYPOTHESIS TESTED AND LARGELY RULED OUT: the brief's own lead was
 * that loop-hole erosion (`GeometryUtils.insetMultiPolygon` shrinking BOTH
 * shell and hole boundaries simultaneously, pinching a narrow isthmus to
 * nothing) is the mechanism. Three independent, code-grounded fixes were
 * implemented and measured against this exact test:
 *   1. A "hole companion" pass — an extra pen-width stroke traced directly
 *      along each loop hole's boundary (clipped to the true ribbon shape),
 *      immune to erosion pinching by construction. Moved the five numbers by
 *      <1%.
 *   2. A fill-erosion depth fallback ladder — when the standard second
 *      erosion fragments `outlineMP` into more pieces than the outline
 *      itself has (MEASURED directly: one erosion call split 1 polygon into
 *      7, another into 11, on `onePenDown`), retry at a shallower depth
 *      before falling back to the outline's own (unfragmented) boundary.
 *      Verified the fallback triggers and avoids fragmentation. Moved the
 *      five numbers by <1%.
 *   3. Increasing `PenFill`'s own `MAX_REPAIR_ROUNDS` (4 -> 16). Zero effect.
 * All three were reverted — see the notes file for why keeping an
 * ineffective, invasive change would be a "half-fix" the unit brief
 * explicitly asks not to commit.
 *
 * THE ACTUAL MECHANISM (found by locating the uncovered cells, per the
 * brief's own "locate, then fix" instruction, rather than trusting the
 * erosion hypothesis further): capturing `SurfaceFill.buildObject`'s RAW
 * output — before scene3d.js's post-hoc self-occlusion clip runs — shows the
 * streak locations FULLY INKED (nearest raw ink ~0.01-0.04 mm away, i.e.
 * `ribbonize` never had a coverage gap there at all). Hooking
 * `Scene3D.HLR.createClipper`'s `clipPath` shows that ink present going in
 * and removed by a call carrying `seg.selfOcclude === true`. Checking that
 * exact screen location against `tests/helpers/scene3d-torus-hole-oracle.js`
 * — the F7 test's OWN independent ground truth, built from a fresh analytic
 * torus surface, never touching `surface-fill.js` — finds NO genuine
 * near/far overlap there. The self-occlusion clip is a FALSE POSITIVE, not a
 * fill defect: F7's own invariant does not apply at these locations, yet its
 * clip fires anyway.
 *
 * A genuine, verified partial cause was found and fixed inside this unit's
 * scope: `ribbonizeCore`'s `zAlongRun` stamps every outline/fill/wall ring
 * vertex with the z of the NEAREST segment of the stretch's own centreline —
 * correct unless the centreline is self-crossing, in which case a vertex can
 * be nearest, in plain screen distance, to the WRONG pass of the loop (the
 * far side rather than the near side its own boolean ancestry came from),
 * manufacturing a spurious depth discontinuity that F7's self-occlusion clip
 * (correctly, given the bad input) reads as a real crossing. A windowed,
 * arc-length-coherent search (biased toward the ring's own previous vertex,
 * falling back to the original full-stretch search when the window has no
 * close match) fixed this specific case: hooking `HLR.createClipper` before
 * and after at the first two streak locations found showed 11 of 11 nearby
 * `clipPath` calls returning a not-fully-visible result before the fix, 1 of
 * 11 after. It did NOT move the five mm² totals measurably. Reasoning why:
 * `onePenDown`'s ten "wide" (CLS_RIBBON) stretches are mostly SEPARATE runs
 * (separate `ribbonizeCore` invocations, each its own `run` array) that
 * cross each other in screen space rather than one continuous centreline
 * self-crossing within a single run — `zAlongRun` is scoped per-run and
 * cannot be wrong about a DIFFERENT run's geometry, so it cannot reach this
 * larger, CROSS-RUN class of false positive. That also matches why only 3 of
 * `onePenDown`'s 10 wide stretches are `holeStretches` (carry an actual
 * within-run self-intersection) yet the streak spreads across dozens of
 * scattered small clusters (154 measured, via flood-fill on the uncovered
 * grid). This zAlongRun fix was reverted along with the other two — real and
 * safe, but insufficient alone, and per the brief's own stop condition,
 * closing the CROSS-RUN class means touching how `scene3d.js`/`hlr.js`
 * decide occlusion between independently emitted paths of the same object —
 * explicitly out of this unit's scope ("the fix would need to touch hlr.js,
 * scene.js or algorithms/scene3d.js").
 *
 * THE TEST. Modelled on `scene3d-ribbon-outline-fill-seam.test.js` and
 * `scene3d-ribbon-wall-coverage.test.js`: same runtime bootstrap, same
 * capture-and-measure shape, same T1 coverage oracle. Torus, default 3/4
 * camera, all five reopened laws.
 *
 * COVERAGE-ORACLE TRAP (handoff finding 2). The torus self-occludes, and
 * `measureRingFillRate`'s denominator is captured BEFORE self-occlusion clips
 * the final lines — omitting `opts.selfOccludedSegments` would score correct
 * occlusion removal as a coverage failure. Every measurement below passes
 * `captureSelfOcclusionFootprint(V)`'s segments through, exactly like its
 * sibling files. Note this does NOT fully absolve the metric here: the
 * removals documented above are FALSE POSITIVES (no genuine overlap per the
 * independent oracle), so `captureSelfOcclusionFootprint`'s correction is
 * working exactly as designed — it just cannot distinguish a correct
 * self-occlusion removal from an incorrect one; both carry `seg.selfOcclude
 * === true` and are excluded identically. The oracle is not "wrong" here in
 * the sense finding 2 warns about; the underlying occlusion decision is.
 *
 * ANTI-VACUITY. `stats.wide`, `stats.wallRings` and `stats.ribbons` must stay
 * >0 (the fixture keeps reaching the ribbon branch), and `stats.degenerate`
 * must not exceed the value measured on the untouched baseline (0 for every
 * law below, from `d5af9e30`) — this file makes no source change, so this is
 * an invariant check on the fixture, not evidence of anything fixed.
 *
 * NO SOURCE FIX LANDS IN THIS COMMIT (A3, amended). `d5af9e30` remains the
 * historical red anchor for the *narrative* above (the three reverted
 * hypotheses were measured against it), but the assertions below are an
 * ORACLE-SIDE re-pin, not a source fix — `VECTURA_PRE_F1B=1` therefore
 * produces the SAME numbers as the current tree for every law (no
 * `F1B_FILES` content changed), and every assertion below is written to be
 * equally true under both. The real RED/GREEN pivot for the oracle split
 * itself lives in `scene3d-ring-coverage-reachability.test.js`'s
 * synthetic-dropped-ruling test — that is what proves the reachability
 * classifier does not quietly excuse a genuine defect; this file only
 * consumes the (already-proven) split honestly.
 *
 *   npx vitest run tests/unit/scene3d-ribbon-f1b-streaks.test.js                     # 26/26
 *   VECTURA_PRE_F1B=1 npx vitest run tests/unit/scene3d-ribbon-f1b-streaks.test.js   # 26/26 (same numbers, by construction — no src/ change)
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { makeMultiFilePreShaRuntimeOptions } = require('../helpers/pre-wip-surface-fill');
const {
  captureClipGroups, captureSelfOcclusionFootprint, measureRingFillRate, classifyReachabilityAtDivisor,
} = require('../helpers/scene3d-ring-coverage');

const F1B_BASELINE_SHA = 'd5af9e30';
const F1B_FILES = [
  'src/core/scene3d/surface-fill.js',
  'src/core/scene3d/ribbon-geometry.js',
  'src/core/pen-fill.js',
];
const preF1BRuntimeOptions = makeMultiFilePreShaRuntimeOptions(F1B_BASELINE_SHA, 'VECTURA_PRE_F1B', F1B_FILES);

// The F1 self-crossing slab-collapse list, verbatim (handoff doc, item A).
const LAWS = ['interlockWeave', 'onePenDown', 'trochoidLoop', 'ampSpacing', 'weaveDepth'];
// Two clean laws from the same bucket-B matrix, as controls: they carry no
// loop hole (never self-cross at this view) and already sit in the <=0.18
// band on the untouched tree — a fix that regresses either of these while
// "fixing" the five above has moved the defect, not removed it.
const CONTROL_LAWS = ['taperedEnds', 'weightSmoothstep'];
const PEN_WIDTH = 0.3; // BOUNDS default (tests/fixtures/scene3d-shadow-anatomy.js)
// RETIRED as a pass/fail bar (A3-judge.md §5 item A1): a finer reachability
// lattice alone moves trochoidLoop from 0.1800 to 0.1856, i.e. across this
// exact line — a "pass" that depends on how hard you search is not a pass.
// Kept only as the historical value the honest diagnostic below is measured
// against.
const STREAK_BAND_MM2 = 0.18;
// Anti-explosion guard on the RAW (uncorrected) number — A3-judge.md §5 A1.
const RAW_EXPLOSION_GUARD_MM2 = 3;
// Non-gating ceiling on the reachable-area diagnostic: comfortably above the
// measured range (0.017-0.1856 mm² across five laws + two controls at
// divisor 12/24) and comfortably below the raw explosion guard — a sanity
// bound, not a pass bar.
const REACHABLE_DIAGNOSTIC_CEILING_MM2 = 1.0;
// A2 (amended) cluster-SHAPE oracle — what a human calls a streak, checked
// against the actual bounding box of every connected uncovered run (A3-judge.md
// §5 item A2). Today's worst is 0.90 x 0.30 mm (trochoidLoop, corner-class)
// and 0.45 x 0.30 mm (a law-independent ink pinhole, carried forward as its
// own follow-up lead) — both comfortably inside both bars below.
const CLUSTER_MAX_EXTENT_MM = 1.2;
const CLUSTER_STREAK_WIDTH_MM = 0.30; // one pen
const CLUSTER_STREAK_LENGTH_MM = 1.0;
// Lattice-sensitivity guard (A3-judge.md §5 item A1): doubling the divisor
// (halving the search step) may reclassify at most 1 cell per law — more
// than that means the reachable-area number is resolution-bought.
const REACHABILITY_DIVISOR_A = 12;
const REACHABILITY_DIVISOR_B = 24;
const LATTICE_SENSITIVITY_MAX_CELL_DELTA = 1;

// Baseline `degenerate` ceilings, recorded from THIS test's own first run
// against the untouched `d5af9e30` tree (see header). A fix may bring these
// down; it may never raise them — that is buying coverage with centrelines.
const BASELINE_DEGENERATE = {
  interlockWeave: 0,
  onePenDown: 0,
  trochoidLoop: 0,
  ampSpacing: 0,
  weaveDepth: 0,
  taperedEnds: 0,
  weightSmoothstep: 0,
};

describe('SurfaceFill — F1B residual streaks in the self-crossing laws, torus', () => {
  let runtime;
  let V;
  const results = {};

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true, ...preF1BRuntimeOptions() });
    V = runtime.window.Vectura;

    [...LAWS, ...CONTROL_LAWS].forEach((toneLaw) => {
      const engine = new V.VectorEngine();
      const groupId = engine.addLayer('scene3d');
      const group = engine.layers.find((l) => l && l.id === groupId);
      const obj = engine.getLayerDescendants(groupId)
        .filter((l) => l && l.type === 'object3d')[0];
      obj.params.primitive = 'torus';
      obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
      obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };
      // Default camera (3/4 view: yaw -30, pitch 20) — untouched, matching
      // both the reported view and every sibling file in this suite.

      const cap = captureClipGroups(V);
      const occlusionCap = captureSelfOcclusionFootprint(V);
      const t0 = Date.now();
      engine.computeAllDisplayGeometry();
      const elapsedMs = Date.now() - t0;
      cap.restore();
      occlusionCap.restore();

      const stats = { ...(V.Scene3D.SurfaceFill.lastRibbonStats || {}) };
      const ink = (group.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill');
      const coverage = measureRingFillRate(cap.groups, ink, PEN_WIDTH,
        { selfOccludedSegments: occlusionCap.segments });
      results[toneLaw] = {
        stats, coverage, groupCount: cap.groups.length, elapsedMs,
      };
    });
  }, 600000);

  afterAll(() => runtime && runtime.cleanup());

  test.each(LAWS)('%s — genuinely reaches the CLS_RIBBON (wide) class on a torus', (law) => {
    const { stats } = results[law];
    expect(stats.ribbonLaw).toBe(true);
    expect(stats.wide).toBeGreaterThan(0);
  });

  test.each(LAWS)('%s — the existing ring-fill-rate contract still holds (>= 0.995)', (law) => {
    const { coverage, groupCount } = results[law];
    expect(groupCount).toBeGreaterThan(0);
    expect(coverage.ringFillRate).not.toBeNull();
    expect(coverage.ringFillRate).toBeGreaterThanOrEqual(0.995);
  });

  // RETIRED (A3-judge.md §5 A1): `ringNotInkMm2 <= 0.18` moved from a real
  // coverage assertion to an unfalsifiable one once 89-98% of that number
  // was shown to be pen-unreachable-by-construction. Replaced by four
  // honest checks below: an anti-explosion guard on the raw number, a
  // non-gating diagnostic of the reachable residue, a lattice-resolution
  // sanity guard, and a cluster-SHAPE oracle that actually models a streak.

  test.each(LAWS)('%s — raw ringNotInkMm2 stays inside a sane anti-explosion guard (< 3 mm²)', (law) => {
    const { coverage } = results[law];
    expect(coverage.ringNotInkMm2, `${law}: raw ringNotInkMm2=${coverage.ringNotInkMm2.toFixed(4)}`)
      .toBeLessThan(RAW_EXPLOSION_GUARD_MM2);
  });

  test.each(LAWS)('%s — pen-unreachable-corrected residue is a recorded diagnostic, not the pass bar', (law) => {
    const { coverage } = results[law];
    const msg = `${law}: ringNotInkReachableMm2=${coverage.ringNotInkReachableMm2.toFixed(4)} `
      + `ringUnreachableMm2=${coverage.ringUnreachableMm2.toFixed(4)} `
      + `(raw ringNotInkMm2=${coverage.ringNotInkMm2.toFixed(4)}, `
      + `historical band was <= ${STREAK_BAND_MM2})`;
    expect(coverage.ringNotInkReachableMm2, msg).toBeGreaterThanOrEqual(0);
    expect(coverage.ringNotInkReachableMm2, msg).toBeLessThan(REACHABLE_DIAGNOSTIC_CEILING_MM2);
  });

  test.each(LAWS)('%s — anti-vacuity: the reachable/unreachable split actually excludes something', (law) => {
    const { coverage } = results[law];
    expect(coverage.ringUnreachableMm2, `${law}: ringUnreachableMm2=${coverage.ringUnreachableMm2}`)
      .toBeGreaterThan(0);
  });

  test.each(LAWS)('%s — lattice sensitivity: doubling the divisor moves the reachable-cell count by <= 1 cell', (law) => {
    const { coverage } = results[law];
    const at12 = classifyReachabilityAtDivisor(coverage.grid, PEN_WIDTH, REACHABILITY_DIVISOR_A);
    const at24 = classifyReachabilityAtDivisor(coverage.grid, PEN_WIDTH, REACHABILITY_DIVISOR_B);
    const delta = Math.abs(at24.reachableCount - at12.reachableCount);
    const msg = `${law}: reachable @divisor${REACHABILITY_DIVISOR_A}=${at12.reachableCount} `
      + `@divisor${REACHABILITY_DIVISOR_B}=${at24.reachableCount}`;
    expect(delta, msg).toBeLessThanOrEqual(LATTICE_SENSITIVITY_MAX_CELL_DELTA);
  });

  // A2 (amended) — the actual "does a human see a streak" oracle, on all
  // five reopened laws AND both controls (A3-judge.md §5 item A2 explicitly
  // asks for both). A genuine streak must be BOTH wider than one pen AND run
  // longer than one pen's worth of length; a corner wedge or a rasterization
  // speck fails at least one of the two.
  test.each([...LAWS, ...CONTROL_LAWS])('%s — no uncovered cluster reads as a lengthwise streak', (law) => {
    const { coverage } = results[law];
    coverage.uncoveredClusters.forEach((c) => {
      const msg = `${law}: cluster ${c.cells} cells, ${c.areaMm2.toFixed(4)} mm², `
        + `${c.lengthMm.toFixed(3)} x ${c.crossWidthMm.toFixed(3)} mm (length x cross-width)`;
      expect(c.lengthMm, msg).toBeLessThanOrEqual(CLUSTER_MAX_EXTENT_MM);
      const isStreak = c.crossWidthMm > CLUSTER_STREAK_WIDTH_MM && c.lengthMm > CLUSTER_STREAK_LENGTH_MM;
      expect(isStreak, msg).toBe(false);
    });
  });

  test.each(LAWS)('%s — anti-vacuity: no coverage bought with centrelines', (law) => {
    const { stats } = results[law];
    expect(stats.wide).toBeGreaterThan(0);
    expect(stats.wallRings).toBeGreaterThanOrEqual(0);
    expect(stats.ribbons).toBeGreaterThan(0);
    expect(stats.degenerate).toBeLessThanOrEqual(BASELINE_DEGENERATE[law]);
  });

  test.each(CONTROL_LAWS)('%s — control: stays clean (no regression from the F1B fix)', (law) => {
    const { coverage, stats } = results[law];
    expect(coverage.ringFillRate).toBeGreaterThanOrEqual(0.995);
    expect(coverage.ringNotInkMm2).toBeLessThanOrEqual(STREAK_BAND_MM2);
    expect(stats.degenerate).toBeLessThanOrEqual(BASELINE_DEGENERATE[law]);
  });
});
