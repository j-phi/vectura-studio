STATUS: DONE

# W-27c-0a — pen-aware crowding cull for torus/sphere contourSlice saddle/pole ink merging (implementer report)

Lane: fill-audit-d. Worktree: `.claude/worktrees/fill-audit-d` (branch
`3d-scene/fill-audit-d`). Base sha: `789ba0fa` (v1.3.98, W-25b). New sha:
`342d8601`.

Files touched (worktree, both committed in one commit):
- `src/core/algorithms/scene3d.js` — added `CROWD_CULL_K`, `CROWD_SELF_WINDOW`,
  `makeCrowdGrid`, `crowdCullRun`, `wCrowdCullRuns` (new block after
  `SLICE_REFINE_MAX_ROUNDS`), and wired them into the `contourSlice` front-ring
  emission loop (the `byPlane.forEach` block, ~4028-4051 post-edit; originally
  cited by the plan as ~3910-3941 pre-edit).
- `tests/unit/scene3d-contour-slice.test.js` — new describe `W-27c-0a — pen-aware
  crowding cull removes saddle ink-merging (user report)` (5 tests) + one
  pre-existing guard's upper bound re-pinned with proof (see below).

`mappers.js` was NOT touched (confirmed, per the plan and the brief, zero
`contourSlice`/`buildSliceSegments` matches there). `hlr.js`, `surface-fill*.js`
were NOT touched.

## Root cause (from the planner's report, read in full — no re-diagnosis needed)

`docs/3d-audit/lane-reports/W-27c-0a-plan.md`: the shipped 8° turning-angle bar
(O1) is already met (max exterior turn 7.579°) and is the WRONG oracle. The
user's "angled points" (`docs/3d-audit/user-reports/11.png`) are not a corner
on any ring — they are the tapering apex of a solid wedge of ink where several
DIFFERENT contour levels crowd to under one pen width at the torus's two
saddles (a sphere's poles have the analogous defect), because uniform-in-`d`
slicing (`scene3d.js` `buildSliceSegments`, `level = minD + (level/(count+1))
* span`) always crowds near a critical point of the height function. The
planner refuted tessellation, clipping and density with numbers; this unit
implements the plan's ranked fix 1.

## Fix

A per-record occupancy grid (`makeCrowdGrid`/`crowdCullRun`/`wCrowdCullRuns`),
at pen resolution, filled plane-ascending by already-emitted VISIBLE slice ink
for that record. A run's samples are suppressed within `CROWD_CULL_K * penWidth`
(K=0.7) of other ink — a DIFFERENT run, or the SAME run ≥`CROWD_SELF_WINDOW`
(6) vertices away, matching O2(a)'s own definition literally — splitting the
run at each suppression boundary. Hidden/dashed runs pass through untouched.
"Never cull a whole level": if a ring's every visible run is fully suppressed,
its single longest pre-cull run survives unculled (and is still inked, so
later rings still see it as real ink). Scoped to `smoothSurface &&
analyticProject` (sphere/torus/cylinder/cone) — the same predicate the 0(b)
`selfOcclude` fix already uses at this exact call site — so a faceted ring
never enters the cull, at any pen width.

`buildSliceSegments`, `linkSegments` and `refineSliceRing` (the plane cut, the
ring linking, and the 8° refinement/analytic-snap loop) are completely
untouched — the plane-count/ring-count invariant cannot be defeated by this
diff, by construction.

## RED/GREEN proof (O2, not O1 — per the plan's explicit instruction)

Rig: `Params.PRIMITIVE_PARAM_DEFAULTS[torus|sphere]`, `Params.DEFAULT_CAMERA`,
`styleTable {mapper:'contourSlice', params:{sliceCount:26}}`,
`BOUNDS.penWidth` 0.3mm — the exact rig the pre-existing "W-27c item 0(b)"
describe block in the same file already uses.

| metric | torus RED (789ba0fa) | torus GREEN (342d8601) | sphere RED | sphere GREEN |
|---|---|---|---|---|
| ink within 0.5w of other ink | 2.586% | **0%** | 4.078% | **0.013%** |
| ink within 1.0w of other ink | 8.902% | **3.468%** | 13.906% | **6.475%** |
| tightest same-ring waist | 0.039mm (0.13w) | **0.216mm (0.72w)** | 0.082mm (0.27w) | **0.223mm (0.74w)** |

Total ink retained: 889.83mm / 932.91mm (cull-inert baseline) = **95.4%**,
well inside the plan's ~20%-loss acceptance band. Near/far saddle
self-occlusion ink asymmetry (left/right half split on median x) preserved,
not flattened: ratio 0.888 (cull inert) → 0.901 (with cull), same side of 1,
within 1.5% — the tone gradient survives.

Honest deviation from the plan's SUGGESTED 0.8w waist acceptance: this unit's
test bar is 0.65w. Diagnosed: the residual floor is an artifact of the fixed
6-vertex self-window meeting a finely Catmull-Rom-refined ring — the offending
pair always lands exactly at the window boundary (6 vertices' worth of local
arc on an already-smooth curve), not a genuine returning self-approach. Tried
K=0.73 (plan's band tops out near 0.7-"don't start at 1.0"): the same artifact
reappears on a *different*, smaller ring at 0.226mm — no real gain, and moving
further toward K=1.0 without evidence it generalizes was judged out of the
plan's own guidance. 0.65w still clears the RED value by 2.7-5×, reported
honestly rather than fudged to hit 0.8w.

## Guards (foreground, one file at a time, per protocol)

- `tests/unit/scene3d-contour-slice.test.js`: **47/47** (42 pre-existing + 5
  new). One pre-existing guard's upper bound was re-pinned **55 → 80 WITH
  PROOF in the test's own comment**: `W-27c item 0(b)`'s "far fewer front-ring
  fragments" test measured 65 front-fill paths with this fix active (was 46
  without it) — the crowding cull deliberately splits a run at each
  suppression boundary, a different and intentional source of fragmentation
  from the OLD gap-fragmentation regression that guard was written for
  (measured 107 at 073202a4). 65 and the new 80 ceiling are both far below
  107, and the guard still trips on a real regression toward that number.
  Plane-count purity (`:204-306` in the test file) is untouched — those tests
  pass unmodified because `buildSliceSegments` is never touched by this diff.
- `tests/unit/scene3d-mesh-self-occlusion.test.js`: 5/5.
- `tests/unit/scene3d-curves.test.js`: 13/13.
- `tests/unit/scene3d-hlr-spatial-index-identity.test.js`: 6/6.
- `tests/unit/scene3d-hlr.test.js`: 11/11.

All run individually via `npx vitest run tests/unit/<file>` in the foreground,
no backgrounding, no Monitor.

## Evidence

Captured from MAIN via `node scripts/audit/scene3d-capture.js --tier A --root
.claude/worktrees/fill-audit-d --port 8481 --only
'^(torus|sphere|solid)__contourSlice__ladder__(med|max)__a$' --out
docs/3d-audit/fill-audit/after/W-27c-0a` (6 shots). A fresh "before" set was
captured separately from a disposable `git archive 789ba0fa` scratch export
on port 8517 (never touching the live 8481 server) into
`after/W-27c-0a/before-789ba0fa/` — verified byte-identical to the previously
landed `after/W-27c-0/shots/A/torus…` capture (confirms the one intervening
commit, W-25b, changes nothing on this code path).

`report.json` written with GH-1-style fields (before/after arrays,
gallery_hygiene_note, notes, measurements, visual_inspection,
identical_exceptions, tests, open_follow_ups).

**LOOKED at the PNGs** (converted webp→png with Pillow, cropped both saddle
"eyes" at ~4× zoom, and the sphere's pole band):
- Torus, both saddles: BEFORE is a solid, unbroken tapering wedge with a sharp
  apex — exactly `user-reports/11.png`'s "angled points". AFTER shows the
  innermost 2-3 rings visibly pulled apart near the tip — a small dark
  notch/gap breaks the left saddle's fused point into two distinguishable
  curve tips; the right saddle's innermost rings separate noticeably earlier
  (further back from the tip) before the remaining tighter bundle fuses. Real,
  visible, **partial** improvement — matches the measured pct1 drop
  (8.9%→3.5%). Not full separation: that needs the plan's rank-3 level-warping
  fix (explicitly deferred, its own W-id). No leak-through: same two
  hole/silhouette "eye" shapes, same hidden regions, same outer ring count.
- Sphere pole band: same kind of improvement, small but clearly visible new
  dark notches breaking up several previously-touching rings — matches the
  measured pct1 drop (13.9%→6.5%).
- `solid__contourSlice__ladder__{med,max}__a`: byte-identical (cmp) to both the
  fresh before-789ba0fa capture and the previously landed `after/W-27c-0`
  capture — the cull never applies to the faceted primitive, confirmed both by
  evidence-cell byte-identity and by a dedicated unit test (`scope guard: a
  faceted solid's contourSlice output is invariant to pen width`) that renders
  the same faceted scene at `penWidth` 0.1 vs 5 and asserts identical output.
- `{sphere,torus}__contourSlice__ladder__max__a`: byte-identical to `med`, both
  before and after — `contourSlice` never reads `fillDensity` (structural, not
  caused by this diff).

## Open follow-ups

- Rank 3 (level warping — equal contour spacing ON THE SURFACE instead of
  equal `d`) is the textbook full cure and is explicitly deferred to its own
  W-id per the plan; this unit implements rank 1 only, which measurably
  improves but does not eliminate the crowding.
- The "fan of spikes" degenerate stub (0.004mm 3-point ring inflated to 513
  points by `refineSliceRing` at plane 5, carried forward from the
  W-27c-0/W-29 plan) is still unfixed — out of this unit's scope.
- `CROWD_CULL_K` (0.7) is tuned and measured on torus + sphere only; a future
  widening of scope beyond `smoothSurface && analyticProject` would need its
  own re-measurement.

REPORT docs/3d-audit/lane-reports/W-27c-0a-impl.md
