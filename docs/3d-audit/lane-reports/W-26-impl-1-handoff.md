STATUS: HANDOFF — mid-unit, stopped by coordinator for fresh implementer

Lane fill-audit-a, branch 3d-scene/fill-audit-a, base sha 9fa159f0 (W-01 M1, reviewed ACCEPT).
Checkpoint commit: f5e22359 ("wip(scene3d): W-26 continuous ladder placement — guards in progress
(unverified)"); coordinator also names 4ea8caed — verify with `git log --oneline -5` before continuing,
I did not create that commit myself.

Step 0 (cov dump, done): shipped ladder [0.2,0.5,0.85], Density 50. cone+contour cov IDENTICAL
(0.6212) across all 52 rulings (perfectly uniform field). cylinder+contour: long plateau 0.7043 (~37
rulings) then drop to 0.5. capsule+contour: 0.85 (6 rulings, polar cap) → descending → plateau 0.7043
(barrel) → 0.5 tail. Confirms addendum's uniform-field claim; drawn index-gap alternates 1/2 giving
real ~2x mm disparity on the OLD tree.

Step 1 (RED, done): tests/unit/scene3d-ladder-uniform-field-spacing.test.js (new, committed in
f5e22359). RED vs base 9fa159f0 (git show + scriptOverrides): cone+contour 2.05, cylinder+contour
2.00, capsule-barrel 2.00, cone+spiral turn-advance 77.2 (addendum guessed ~2.0 — actual much worse,
discrete drop collapses whole dark-band turn runs). GREEN on current tree: all ≤1.15 (spiral 1.05).
9/9 tests pass.

Step 2 (GREEN, done, in f5e22359): surface-fill.js — isEvenLadder(), ladderCov(), ladderWantedPitch(),
algoCoverage short-circuit, covAtSample simplified, contMapper routes hatch/crosshatch/contour through
emitContFamily, spiral gets continuous turn-placement (integrate turn-density → invert accumulated-turns
lookup). Two real bugs found+fixed pre-commit: (a) lit-band pitch clamp was blanket not scoped →
flattened Density 1/10/25 (F-01 regression) — fixed by scoping to ladderCov's lit-band coverage only;
(b) redundant floorPitch re-clamp overrode fs-m1's relaxed Density 100-500 taper — removed.

THIRD bug found AFTER f5e22359, fix status uncertain (verify git status/diff before trusting it's
committed): `toneLaw:'none'` (Stage 0, masterGrid+dither off) still resolves TONE_ALGO to 'ladder'
internally, so isEvenLadder()-gated routing (contMapper + spiral branch) fired for Stage 0 too, with
masterPitch=0 (never computed when STAGE.masterGrid is false) → degenerate always-densest walk. Measured
637 paths/23347mm ink for 'none' vs ladder's legit 67/3957mm (scene3d-tone-law-dispatch.test.js test 5).
Fix: added `&& STAGE.masterGrid` to contMapper's isEvenLadder() clause (~line 10400) and to the spiral
branch's guard (~line 10523). Confirmed test 5 passes after the edit; full file (7 tests, ~5min, SLOW)
was re-running when stopped.

Guards GREEN (verified this session): scene3d-hlr-spatial-index-identity, scene3d-tone-algo-default,
scene3d-curved-density-floor, scene3d-curved-density-sparse-end, scene3d-form-ladder,
scene3d-fill-even-spacing (REPLACED index-gap oracle w/ drawn-gap), scene3d-fill-span-verdict (3
assertions re-purposed), scene3d-fill-ruling-continuity, scene3d-fill-seam-continuity,
scene3d-plot-floor-obj, scene3d-plot-safety, scene3d-subwindow-density, scene3d-appdefault-lit-floor,
scene3d-ribbon-f7-self-occlusion, scene3d-mark-laws-draw, scene3d-box-density-bearing,
scene3d-hatch-density-500, scene3d-contour-slice/cross-frame/curved-crosshatch-controls/
curved-fill-angle-migration/faceted-*/fill-boundary-ends, scene3d-mono-*, scene3d-origin-spiral-*,
scene3d-ribbon-{c3-rule5,f6,outline-fill-seam,primitives,wall-coverage,wall-region-clip,
weightscale-invariant}. All re-pins carry before/after numbers in the test file's own comments.

NOT YET RE-RUN after the Stage-0 fix: scene3d-tone-law-dispatch.test.js (full file), and the remaining
9 files in that batch (scene3d-shadow-cross-wave-continuity, scene3d-shadow-tone-gradient,
scene3d-shadow-tone-law-uniqueness, scene3d-shadow-tone-law, scene3d-style-fill-lines,
scene3d-tone-law-params, scene3d-tone-law-plumbing, scene3d-tone-laws-config,
scene3d-tone-quant-flow-live) — none individually confirmed green or red yet; the Stage-0 bug likely
affects ANY of them that exercise `toneLaw:'none'` or draft/fastPreview paths, so re-check those first.

NOT STARTED: step 4 (evidence re-shoot: shots/A/capsule__{contour,hatch,crosshatch,spiral}__ladder__
{low,med}__a, shots/B/cone__contour__{ampSpacing,amplitudeOnly}__med__a, cone__contour__ladder__med__a,
cylinder__contour__ladder__med__a via scripts/audit/scene3d-capture.js --root <worktree> --port 8475),
report.json, and step 5 final commit.
