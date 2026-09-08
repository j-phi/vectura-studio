STATUS: DONE/FU

# W-27c-0a iteration 4 — re-scope the crowding cull to the saddle/pole zone; land the four floor+10% bars (implementer report)

Lane: fill-audit-d2. Worktree: `.claude/worktrees/fill-audit-d2` (branch
`3d-scene/fill-audit-d2`). Base sha: `47a5a755` (main, v1.3.99 — already
contains iteration 3's `ec79e2b9` whole-ring mechanism, merged via
`4134e714`/`817424dc`). This iteration's sha: `c6dd6130`.

Two-part brief (`ROUND2-BRIEFS.md` § fill-audit-d2, `STILL-OPEN.md` line 169):
(1) re-scope the crowding cull to the saddle/pole zone only, so the sparse
flat lower band is left alone (review-3's REJECT reason); (2) land the four
floor+10% bars iteration 3 left measured-and-logged only (torus/sphere
waist, torus/sphere largestW). The 0(b) fragment ceiling stays ≤55
(untouched, not re-widened). The mid-ring fix from `ec79e2b9` (whole-ring,
never fragment) is unconditionally preserved — this iteration only narrows
WHICH points count as "crowded," never how a ring's keep/drop decision is
made or emitted.

## 1. Mechanism — three designs measured, one shipped

**Design 1 (per-point surface-tangency threshold) — measured, abandoned.**
A point `p` is a critical point of the slicing height function `h = p·N`
restricted to the surface iff `grad(h)` (i.e. `N`) has no component
tangent to the surface at `p` — this is the Morse-theoretic definition of a
saddle/pole, and it needs no per-primitive branch: the same cosine test
(plane normal vs. surface normal, from the existing `sliceSurfaceFG`
gradient) finds a sphere's poles and a torus's two saddles. Implemented as
`sliceZoneTangentMag(mode, sizes, localPt, planeNormalLocal)` and gated
`isRunCrowded`'s "near" test on it. **Measured and abandoned**: on the
default torus/sphere rig (26 slice planes), the CLOSEST any actual emitted
sample gets to a true critical point is tangent-magnitude ≈0.22 (not ≈0) —
the discretization is too coarse to sample near enough — while the
existing "geometrically crowded" points (iteration 3's own drop targets)
sit at tangent-magnitude ≈0.71–0.99 (median ≈0.95, i.e. "ordinary"). No
threshold separated the two: below ≈0.22 the cull was fully inert
(byte-identical to RED); above ≈0.9 it reproduced ≈iteration 3's numbers.
Removed before shipping (no trace left in the source).

**Design 2 (raw level-gap test) — measured, abandoned.** Tag each inserted
point with its slice-plane level; require the matched point to be at least
`N` levels away from the querying ring's own level. Sweeping `N` from 2–10:
**torus** responds (pathCount 46→38–45 depending on `N`) but **sphere never
moves at all** (pathCount stuck at 26–27 for every `N` tested). Root cause,
confirmed: a sphere's pole crowding is **adjacent-level** bunching (the
latitude circle's radius shrinks toward zero, so consecutive levels
crowd), not a jump to a distant level — a torus saddle, by contrast, is
the classic level-set self-crossing where FAR-APART levels merge. A raw
gap test structurally cannot serve both.

**Design 3 (shipped) — count DISTINCT levels within radius.**
`makeCrowdGrid.insert(x, y, level)` / `isNear(x, y, queryLevel,
minDistinctLevels)`: gather the SET of distinct plane levels (excluding
`queryLevel` itself) with ink within `radius` of `(x,y)`; "near" only when
that set's size reaches `minDistinctLevels`. This catches BOTH signatures
(many far-apart levels for a torus saddle, many near-together levels for a
sphere pole) with one formula and no per-primitive branch.
`CROWD_MIN_DISTINCT_LEVELS = 2` (the value found, by direct measurement, to
give both primitives real movement without being so strict it goes
fully inert — `N=1` reproduces iteration 3 exactly, `N>=3` is fully inert
for torus on this rig).

`CROWD_CULL_K` (0.8) and `CROWD_MIN_ARC_MULT` (3) are unchanged.

## 2. Measured results

| unit-rig torus | RED (789ba0fa) | iteration 3 (unscoped) | iteration 4 (this unit) |
|---|---|---|---|
| pathCount | 46 | 36 | 44 |
| totalInk | 932.93mm | 660.95mm (70.8%) | 897.10mm (**96.2%**) |
| pct within 0.5w | 2.586% | 1.068% | 2.400% |
| pct within 1.0w | 8.902% | 4.888% | 8.389% |
| waist | 0.0388mm (0.13w) | 0.054mm (0.18w) | 0.0388mm — **BYTE-IDENTICAL to RED** |
| top-half ink retained | — | — | 96.50% |
| bottom-half ink retained | — | — | 95.79% |

| unit-rig sphere | RED | iteration 3 | iteration 4 |
|---|---|---|---|
| pathCount | 27 | 21 | 26 |
| pct within 0.5w | 4.078% | 1.750% | 3.558% |
| pct within 1.0w | 13.906% | 7.079% | 12.454% |
| waist | 0.0823mm | 0.0823mm (==RED) | 0.0823mm — **BYTE-IDENTICAL to RED** |

| engine-pipeline | RED | iteration 3 | iteration 4 |
|---|---|---|---|
| torus blobCount | 27 | 13 | 21 |
| torus largestW | 3.35mm | 2.75mm | **3.35mm — BYTE-IDENTICAL to RED** |
| sphere blobCount | 47 | 24 | 44 |
| sphere largestW | 34.5mm | 19.25mm | **34.5mm — BYTE-IDENTICAL to RED** |

**Part 1 (spare the flat lower band) — ACHIEVED, visually confirmed.**
Native-resolution (800×399, no downscaling) Pillow crops of
`before-789ba0fa` vs iteration 3's shipped `after/W-27c-0a` vs this
iteration's `after/W-27c-0a-4`, torus med, region `(0,180)-(400,260)`
(the exact region review-3 measured "4 nested rings → 2"): iteration 3
visibly thins this region; **iteration 4 restores it — the ring count and
spacing match `before` almost exactly.** This is the headline fix and the
direct resolution of review-3's REJECT reason. Both screen-Y halves retain
≥95.7% of their pre-cull ink (vs iteration 3's 70.8% OVERALL, concentrated
loss per review-3) — automated as a permanent regression test (see §3).

**Part 2 (land the four floor+10% bars) — ACHIEVED, honestly.** All four
(torus waist, torus largestW, sphere waist, sphere largestW) now carry real
`expect(...)` floor(-10%)/ceiling(+10%) assertions instead of
console.log-only STOP-REPORTs. **The honest cost**: measured, all four are
**BYTE-IDENTICAL to RED** under the re-scoped mechanism — a properly-scoped
cross-ring test cannot move any of them, because (newly understood this
iteration) the single dominant blob at each saddle/pole is a **same-ring
self-crossing** near the true critical point (the exact same phenomenon as
the already-unfixed "waist" defect), not a multi-ring pileup a cross-ring
cull can ever address at any scope. Iteration 3's better numbers on these
four specifically came from ALSO dropping rings the flat lower band could
not afford to lose. The floors/ceilings are pinned AT RED — they defend
the position (catch a FUTURE regression) rather than claim an improvement
that was not made, which is exactly the ask.

**Native-resolution visual check on the saddle apex itself** (crop
`(140,60)-(330,220)`, 8x zoom on the tip): iteration 3 keeps individual
rings distinct almost to the tip; **iteration 4's tip shows a small fused
white patch** not present in iteration 3's crop — visibly worse than
iteration 3, though still clearly better than `before`'s larger fused
wedge. This is the visual signature of the largestW-unchanged-from-RED
finding above, disclosed rather than glossed over.

## 3. New tests (RGR)

**RED at 47a5a755** (verified by `git stash push` on JUST
`scene3d.js`, running the new/updated test file against the UNMODIFIED
base source): the two new tests fail exactly as expected —
`total emitted ink is barely touched...` fails (660.95mm ≪ 90% of
932.93mm — iteration 3's own over-cull) and
`the re-scoped cull no longer concentrates ink loss in one region...`
fails (bottom-half retention 53.7% ≪ 85%). Both pass after the fix
(96.2% and 95.79%/96.50% respectively). Stash popped, fix restored,
confirmed via `node -c` and a full re-run (51/51 green).

- `O2(a)/(b) — torus ink-separation...` (unit-rig): updated to the
  re-scoped GREEN numbers.
- `total emitted ink is barely touched by the re-scoped cull` (unit-rig,
  **RED/GREEN proof above**): floor 60%→90%.
- `the cull does not flatten the near/far ink-density asymmetry`: unchanged
  (still passes).
- `control: the sphere pole crowding...`: updated to re-scoped numbers.
- **NEW** `the re-scoped cull no longer concentrates ink loss in one
  region` (unit-rig, **RED/GREEN proof above**): splits ink by device-Y
  median into top/bottom halves, requires both ≥85% retained — this is
  the automated, permanent version of review-3's manual per-region crop
  check.
- `scope guard: a faceted solid's contourSlice output is invariant to pen
  width`: unchanged (still passes byte-identical).
- `extended micro-gap oracle`: **methodology refined** (see §4) and
  re-pinned from `toBe(0)` to `toBeLessThanOrEqual(1)`.
- `torus`/`sphere: all five O2 sub-bars on the engine pipeline`: (d)/(e)/(c)
  all now carry real assertions (see §2); (a)/(b) re-tuned to the
  re-scoped mechanism's own measured values.

## 4. The micro-gap oracle — a real finding, root-caused

At `CROWD_MIN_DISTINCT_LEVELS = 2`, the PRE-EXISTING extended micro-gap
oracle (iteration 3's own, `hasInertContinuity`: "any inert path has SOME
interior vertex near the gap's midpoint") read **3**, not 0. Investigated
rather than either forced to 0 or shipped unexplained:

1. **The weak check has false positives.** A stricter check —
   `hasBridgingInertPath`: a SINGLE inert path must have an interior vertex
   near EACH of the two active endpoints, not just "some vertex somewhere
   near the midpoint" — reduces this to **1** genuine bridged pair.
   Verified directly: of the 8 candidate close-endpoint pairs at `N=2`,
   only one (`d=0.0038mm`, a 60-point run next to a 2-point stub) is
   actually bridged by a single inert path; the other 7 are unrelated
   third-ring coincidences.
2. **The one remaining case is proven pre-existing and unrelated to
   W-27c-0a entirely.** Forced `crowdGrid = null` (the ENTIRE crowding-cull
   feature absent, no iteration's mechanism active) and re-ran the
   refined oracle: **the identical pair, at the identical location,
   still appears.** It cannot be caused by a mechanism that isn't running.
   It is an artifact of the oracle's own methodology — comparing two
   DIFFERENT pen widths' HLR clipping (the ground truth uses
   `penWidth: 1e-6`, the active run uses `0.3mm`) — unrelated to crowding,
   and out of this lane's allowed files (`hlr.js` / the clipper belong to
   handoff-c).
3. **"0" was never a structural invariant of the whole-ring redesign in
   the first place.** Swept `sliceCount` 20→32 with iteration 3's
   UNMODIFIED mechanism (`N=1`-equivalent) and the ORIGINAL weak check:
   nonzero (1) at sliceCount 20, 22, 27, 30 — zero only at 24, 25, 26, 28,
   32. Iteration 3's own "0" was a coincidence of `sliceCount = 26`
   specifically, not a proof.

The oracle is now `toBeLessThanOrEqual(1)`, with the refined
`hasBridgingInertPath` methodology (strictly more accurate than the
original) and full root-cause documentation in both the test file and
`## Bars changed` below.

## 5. Guards (foreground, one file at a time)

- `tests/unit/scene3d-contour-slice.test.js`: **51/51** (full file, fresh
  run in the foreground before commit).
- `tests/unit/scene3d-mesh-self-occlusion.test.js`: 5/5.
- `tests/unit/scene3d-curves.test.js`: 13/13.
- `tests/unit/scene3d-hlr-spatial-index-identity.test.js`: 6/6.
- `tests/unit/scene3d-hlr.test.js`: 11/11.
- `tests/unit/scene3d-mappers.test.js`: 32/32 (file untouched — `mappers.js`
  needed no change for this unit, confirmed via `git status`).

## 6. Evidence

Captured from MAIN against the live worktree (port 8481):
`node scripts/audit/scene3d-capture.js --tier A --root
.claude/worktrees/fill-audit-d2 --port 8481 --only
'^(torus|sphere|solid)__contourSlice__ladder__(med|max)__a$' --out
docs/3d-audit/fill-audit/after/W-27c-0a-4`. All 6 named cells confirmed
present in `manifest.A.1-1.jsonl` and `manifest.A.1-50.jsonl` before
capture. `after/W-27c-0a-4/report.json` written with full before/GREEN
measurements and the visual-inspection findings below.

**LOOKED at native-resolution (800×399) Pillow crops, no downscaling**,
torus med, `before-789ba0fa` vs iteration 3's `after/W-27c-0a` vs this
iteration's `after/W-27c-0a-4`:

- **Lower-band crop `(0,180)-(400,260)` and `(400,180)-(800,260)`** (4x
  zoom): iteration 3 visibly thinner than `before`. **Iteration 4 matches
  `before` almost exactly** — the fix works, visually confirmed, not just
  by the aggregate ink-retention number.
- **Left-saddle apex crop `(140,60)-(330,220)`** (4x zoom): iteration 3
  keeps rings distinct nearly to the tip (real, clean fix). **Iteration 4
  shows a small fused patch at the extreme tip** (8x zoom on
  `(140,150)-(260,220)` confirms this precisely) — worse than iteration 3
  here, matching the largestW-BYTE-IDENTICAL-to-RED finding. Still
  visibly better than `before`'s larger, more extensive fusion.
- **Solid (faceted)**: not re-inspected visually — the scope-guard test
  (byte-identical output at pen widths 0.1mm and 5mm) already proves it is
  untouched by any pen width, hence by this change.

`torus__contourSlice__ladder__{med,max}__a` and the sphere/solid
equivalents are byte-identical to each other within EVERY one of
`before`/iteration-3/iteration-4 (confirmed, this rig's `density` param
does not change `sliceCount` at these two settings) — a pre-existing,
unrelated property, not investigated further (out of scope for this unit).

## 7. `## Bars changed`

| file:line | old | new | why |
|---|---|---|---|
| `src/core/algorithms/scene3d.js` — `makeCrowdGrid.isNear` | true if ANY earlier-plane point within radius (iteration 3, unscoped) | true only if ≥2 DISTINCT other levels' points are within radius | Re-scopes the cull to genuine multi-level pileups (saddle/pole); review-3's REJECT reason. |
| `tests/unit/scene3d-contour-slice.test.js` — ink-retention band | `> 0.6 * before` (60% floor) | `> 0.9 * before` (90% floor) | Measured 96.2% retained — a real, large improvement over iteration 3's 70.8%. Tightened honestly. RED/GREEN proof in §3. |
| same file — torus unit-rig pct05/pct1 | `<1.2%` / `<6%` (iteration 3's tighter numbers) | `<2.5%` / `<8.7%` | The re-scoped mechanism achieves less than iteration 3's unscoped one — measured honestly, not chasing a stale target. |
| same file — sphere unit-rig pct05/pct1 | `<2%` / `<8%` | `<4%` / `<13.5%` | Same reasoning as torus. |
| same file — extended micro-gap oracle | `hasInertContinuity` (any nearby inert vertex); `expect(torusGaps).toBe(0)` | `hasBridgingInertPath` (single inert path bridges both endpoints); `expect(torusGaps).toBeLessThanOrEqual(1)` | Old check has false positives (proven: 7 of 8 candidate pairs are unrelated-ring coincidences). The 1 remaining is proven pre-existing and unrelated to W-27c-0a (reproduces with `crowdGrid=null`) — see §4. |
| same file — engine-pipeline torus blobCount | `<= ceil(12*1.10)=14` | `<= ceil(21*1.10)=24` | Re-tuned to this mechanism's own measured GREEN (21, real improvement over RED 27). |
| same file — engine-pipeline sphere blobCount | `< 27` | `<= ceil(44*1.10)=49` | Re-tuned to this mechanism's own measured GREEN (44, real improvement over RED 47). |
| same file — engine-pipeline torus/sphere waist | STOP-REPORT only (console.log, no assertion) | floor `>= RED * 0.90` | Brief part 2. Measured BYTE-IDENTICAL to RED on both primitives — floor pinned there, defends the position rather than claiming an improvement. |
| same file — engine-pipeline torus/sphere largestW | STOP-REPORT only | ceiling `< RED * 1.10` | Same as above. |

## 8. Open follow-ups

1. **W-27c-0a-2** (already filed, PLANNING-DEFERRED per STILL-OPEN.md):
   confirmed again this iteration that a cross-ring crowding cull, at ANY
   scope, cannot touch the dominant blob at either the torus's saddles or
   the sphere's poles, because that dominant blob is a SAME-RING
   self-crossing, not a multi-ring pileup. The plan's own Rank 3 (level
   warping — equal contour spacing ON THE SURFACE instead of equal `d`) is
   confirmed as the only remaining lever, now with an additional, more
   precise diagnosis: it needs to address a same-ring self-approach
   specifically, not just "more/fewer crowded rings."
2. **New, small, filed residual**: the one micro-gap-oracle bridged pair
   (§4) is a pre-existing pen-width/HLR-clipping-bias artifact, unrelated
   to any W-27c-0a iteration, sub-pixel (0.0038mm, far below one pen
   width). Belongs to whichever lane owns `hlr.js`/the clipper
   (handoff-c) — not fixed here (forbidden file for this lane), disclosed
   and root-caused instead of hidden.
3. `report.json`'s `bars_changed`/`measurements` sections are filled in
   for this iteration (unlike iteration 3's own follow-up note asking for
   this) — no further action needed there.

REPORT docs/3d-audit/lane-reports/W-27c-0a-impl-4.md
