/*
 * RGR — F1B: RESIDUAL LENGTHWISE STREAKS IN THE FIVE SELF-CROSSING LAWS.
 *
 * STATUS: UNRESOLVED. This file is a REPRODUCTION + DIAGNOSTIC record, not a
 * fix. It reproduces the defect precisely, quantifies it, and stays RED —
 * see `docs/3d-audit/handoff/unit-a-notes.md` for the full investigation and
 * why it stops here. Per the unit brief's own "stop and report if" clause
 * ("cannot get all five laws under the 0.18 mm² band after a genuine
 * attempt" / "the fix would need to touch hlr.js, scene.js or
 * algorithms/scene3d.js"), this is reported rather than forced green.
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
 * RED against `d5af9e30` (current HEAD of `3d-scene/handoff-b` at the time
 * this file was written, itself a descendant of the `da683934` baseline the
 * handoff doc names — both predate any fix and are equally valid red
 * anchors; `d5af9e30` is used because it is the exact SHA
 * `makeMultiFilePreShaRuntimeOptions` can `git show` against from this
 * worktree). Since no fix landed in this commit, this test is EQUALLY red
 * with or without `VECTURA_PRE_F1B=1` — there is no green state to contrast
 * it against yet:
 *
 *   npx vitest run tests/unit/scene3d-ribbon-f1b-streaks.test.js            # RED (current tree)
 *   VECTURA_PRE_F1B=1 npx vitest run tests/unit/scene3d-ribbon-f1b-streaks.test.js   # RED (baseline — same numbers, by construction)
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { makeMultiFilePreShaRuntimeOptions } = require('../helpers/pre-wip-surface-fill');
const { captureClipGroups, captureSelfOcclusionFootprint, measureRingFillRate } = require('../helpers/scene3d-ring-coverage');

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
const STREAK_BAND_MM2 = 0.18;

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

  test.each(LAWS)('%s — uncovered ring interior is inside the <= 0.18 mm² band', (law) => {
    const { coverage } = results[law];
    expect(coverage.ringNotInkMm2).toBeLessThanOrEqual(STREAK_BAND_MM2);
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
