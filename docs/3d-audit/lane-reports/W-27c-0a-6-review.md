STATUS: ACCEPT-WITH-FOLLOWUPS

# W-27c-0a-6 — reviewer report

Lane under review: fill-audit-d2, worktree `.claude/worktrees/fill-audit-d2`
(read-only), pinned range `49cf0e3e..392696ac`. Reviewed against
`docs/3d-audit/lane-reports/AGENT-PROTOCOL.md` §Reviewers,
`W-27c-0a-6-impl.md`, `W-27c-0a-5-impl.md` + `W-27c-0a-5-review.md`,
`W-27c-impl.md`/`W-27c-impl-2.md` (the Newton projector, `DUP_EPS`),
`W-34-impl.md` (the device-space stop condition).

All measurement done read-only: two `git archive` scratch exports
(`/private/tmp/claude-501/scratch-w27c0a6-review/{pre,post}` at
`49cf0e3e`/`392696ac`, node_modules symlinked), one disposable
`git worktree add --detach` at `49cf0e3e` (for the one guard file that
needs `.git` present, removed via `git worktree remove --force`
immediately after use), and direct `vitest run` invocations inside the
worktree under review itself (read-only — no file was written; `git
status --short -- . ':!graphify-out'` confirmed clean before and after
every such run). All scratch directories and the disposable worktree were
deleted at the end of this review; no edit, stash, or probe file was made
in the worktree or main.

## 1. RED / GREEN / mutation — reproduced independently

**Diff scope confirmed**: `git diff 49cf0e3e..392696ac -- . ':!graphify-out'`
touches exactly two files, `src/core/algorithms/scene3d.js` (+28) and
`tests/unit/scene3d-contour-slice.test.js` (+376/-31) — matches the impl
report.

**The fix itself** (`src/core/algorithms/scene3d.js`, inside
`refineSliceRing`, immediately after the existing `base.length < 3` bail
and the `DUP_EPS` dedup): for a ring with `base.length <= 4`, sums the raw
open-polyline perimeter; if `< 0.05`, returns the original `worldPts`
unrefined (same no-op shape as the pre-existing `< 3` bail, applied
BEFORE the Newton analytic-surface snap, so both the snap and the
subdivision loop are skipped together). Read in full — matches the impl
report's description exactly.

**RED at `49cf0e3e`** (post-fix test file copied into the pre-fix scratch
export): **exactly 4/67 fail** —
`W-27c-0a-5 ... exact discrete signature`,
`W-27c-0a-5 ... level-6 near-degenerate ring ... stays a harmless
micro-stub`,
`W-27c-0a-6 ... every torus contourSlice front ring converges`,
`W-27c-0a-6 ... the fixed level-6 ring: subdivision skipped`. Exact match
to the impl report's named 4. **CONFIRMED.**

**GREEN at `392696ac`**: **67/67**, both in a scratch export and directly
in the worktree. **CONFIRMED.**

**Mutation (my own, not the implementer's)**: copied the post-fix tree,
surgically removed the `if (base.length <= 4) { ... }` gate block from
`scene3d.js` (verified by grep that only the gate's 8 statement lines were
removed, comments left in place), re-ran with node_modules re-symlinked
(a first attempt hard-copied `node_modules` through the symlink and broke
vitest's own bin resolution — caught and fixed before drawing any
conclusion from it). Result: **the identical 4/67 fail**, byte-identical
failure set to RED-at-`49cf0e3e`. This proves the gate is the sole cause
of the GREEN state — not, e.g., an incidental side effect of some other
line in the 28-line diff. **CONFIRMED.**

## 2. Blast radius — the report's "only ever fires on the torus's
level-6 ring" claim is incomplete

The impl report and `after/W-27c-0a-6/report.json` both measure the
gate's footprint using only `V.Scene3D.Params.DEFAULT_CAMERA` (this is
what the shipped "safety margin" regression test itself hardcodes, and
what every measurement in the impl report's §2/§3 implicitly uses). The
report's own conclusion is stated as a fact about the fix in general:
*"The fix only ever fires on the torus's level-6 ring."*

Camera is not innocuous here: `buildSliceSegments`/`linkSegments`
consumes `obj.faces.map(f => f.front)`, and face front/back classification
is view-dependent — so the RAW ring set (and therefore which rings are
`<=4` points) can legitimately differ between the app's two established
camera angles, `a` (`DEFAULT_CAMERA`) and `b` (`{yaw:40, pitch:-15}`, the
exact `SECOND_ANGLE` `scripts/audit/scene3d-capture.js` uses for every
other cell in this audit's own evidence grid). This is not hypothetical:
`fillDensity`-invariance for contourSlice plane count is an established,
tested fact in this file, but camera-invariance for the RAW ring set was
never measured by any prior W-27c-0a report, including this one.

I wrote an independent scan (reproducing the safety-margin test's own
method, generalized over both cameras) across all six primitives. At
camera `a` it reproduces the report's own numbers exactly (torus: 47
total rings, tiny set = level 2/3pt 0.953mm, level 2/4pt 9.003mm, level
6/3pt 0.0041mm [the fixed ring], level 25/4pt 5.712mm — matching
`W-27c-0a-6-impl.md` and the shipped "safety margin" test's own console
output field-for-field).

**At camera `b`, two more `<=4`-point rings fall under the 0.05mm gate
that camera `a` never surfaces:**

| primitive | level | rawCount | raw length (mm) |
|---|---|---|---|
| ellipsoid | 15 | 3 | 0.0019632745812875915 |
| capsule | 4 | 3 | 0.010438758024589628 |

Neither appears in the shipped "safety margin" test (camera `a` only), so
neither is guarded against regression, and neither is mentioned in the
impl report or `report.json`'s "only ever fires on..." claim.

**Were these two rings actually broken before the fix, like the torus
ring?** No. I measured both through the public `Scene3D.Slices.refineRing`
API (the same Method-B reconstruction W-27c-0a-5 and this unit both use),
pre-fix vs post-fix:

| ring | pre-fix roundsUsed / deviceMaxTurn / finalLengthMm | post-fix (gated) |
|---|---|---|
| ellipsoid L15 (cam b) | 0 / 0.002086628380899562° / 0.001963046325997759mm | 0 / 0° / 0.0019632745812875915mm |
| capsule L4 (cam b) | 0 / 0.024219132521172113° / 0.01038347271001377mm | 0 / 0° / 0.010438758024589628mm |

Both already converged in round 0 pre-fix (no non-convergence pathology —
unlike the torus ring this unit targets). The gate's only effect on them
is to skip the Newton analytic-surface-snap that was already correctly
pulling these 3 raw points onto the true surface, in exchange for the raw
mesh-chord points verbatim. The resulting deltas (~2.3e-7mm and
~5.5e-5mm) are two to four orders of magnitude smaller than even the
torus ring's own before/after delta, and far below anything that could
register at the resolution this audit renders at.

**Does this reach the drawn/exported output?** No — I independently
reproduced the impl report's headline claim with my own script (not
theirs): an in-process md5 sweep of `Vectura.AlgorithmRegistry.
scene3d.generate()` JSON output across all 6 primitives x both cameras x
both densities (24 cells, contourSlice), comparing the pre-fix tree
(loaded via `scriptOverrides`, no worktree touched) against the post-fix
tree: **0/24 cells differ, byte-for-byte, confirmed independently.** This
subsumes the two newly-found camera-b rings — their sub-0.0001mm deltas
do not survive whatever rounding/simplification happens between raw ring
geometry and the exported path.

**Verdict on this item**: the fix is safe (0/24 independently reproduced),
but "the fix only ever fires on the torus's level-6 ring" is factually
wrong, and the regression guard that is supposed to police the gate's
footprint (`safety margin: no 3-or-4-point ring ... has raw length under
0.05mm`) only checks camera `a`, so it would not catch a future change
that grows either camera-b ring past the point where skipping the
Newton snap became visible, nor would it notice a THIRD ring crossing
under the gate at some other view angle. **This is the same specific
blind spot the LEDGER already flagged once in this exact lane**: LEDGER.md
row 14 / `STILL-OPEN.md` record that W-34's own plan "tabulated M1 at
camera a only," and a camera-b sweep found ALL SIX primitives over the
bar, not just the two the camera-a table named. This unit repeats that
same "measured only at the default camera" shape of gap, on a smaller,
currently-harmless scale.

## 3. The four re-pinned bars — exactly the four named, count pins untouched

`W-27c-0a-5-review.md` §5 named exactly four bars as measuring "the wrong
quantity" (an artifact of `SLICE_REFINE_MAX_ROUNDS`/point-doubling, not
of drawn output): (1) `roundsUsed` exact-equality in the discrete-signature
test, (2) `finalCount` ±10% band in the same test, (3)
`expect(lvl6.roundsUsed).toBe(8)` in the harmlessness test, (4)
`expect(lvl6.finalCount).toBeLessThanOrEqual(700)` in the same test.

Confirmed via the raw diff (`git diff 49cf0e3e..392696ac -- tests/unit/
scene3d-contour-slice.test.js`, isolating `-` lines): the ONLY removed
non-comment lines are the `EXPECTED5` level-6 array-literal entry (which
bundles items 1+2 — `finalCount`, `finalLengthMm`, `deviceMaxTurn`, and
`roundsUsed` all live in one object literal, so updating any subset means
touching the whole entry), `expect(lvl6.roundsUsed).toBe(8)`, and
`expect(lvl6.finalCount).toBeLessThanOrEqual(700)`. No other `-` line
exists anywhere in the 407-line diff. **Exactly the four named bars, and
nothing else, moved.**

The harmlessness test's OTHER two continuous bars on this same ring
(`deviceMaxTurn > 160`, `finalLengthMm < 0.05`) — the ones
`W-27c-0a-5-review.md` explicitly said to keep as "the real signal" — are
confirmed **unchanged** (same literal `160`/`0.05` thresholds in the
diff), and both comfortably contain the post-fix values (180 > 160;
0.0041mm < 0.05mm).

**Count pins untouched**: `expect(rings.length).toBe(47)` and
`expect(small.length).toBe(5)` (lines ~2793/2796 post-sha) do not appear
in the diff at all. **CONFIRMED.**

## 4. Regression suites — re-run independently, both shas

Ran every suite the impl report names, myself, at both `49cf0e3e` (via a
disposable `git worktree add --detach`, since a bare `git archive` export
has no `.git` and one guard file shells out to `git show HEAD:...`) and
`392696ac` (directly in the worktree under review, read-only —
`git status` clean before and after):

| suite | pre (`49cf0e3e`) | post (`392696ac`) | matches impl report? |
|---|---|---|---|
| `scene3d-contour-slice.test.js` | 63/67 (4 fail, expected) | 67/67 | yes |
| `scene3d-contour-slice-corners.test.js` (W-34 corner oracle, W-34b ceiling) | 25/25 | 25/25 | yes |
| `scene3d-slice-end-overlap.test.js` (W-35, incl. k=0 byte-identity) | 30/30 | 30/30 | yes |
| `scene3d-mappers.test.js` | — | 32/32 | yes |
| `scene3d-hlr.test.js` | — | 11/11 | yes |
| `scene3d-curves.test.js` | — | 13/13 | yes |
| `scene3d-mesh-self-occlusion.test.js` | — | 5/5 | yes |
| `scene3d-hlr-draft-flag-wiring.test.js` | — | 2/2 | yes |
| `scene3d-hlr-spatial-index-identity.test.js` | — | 6/6 | yes |
| `scene3d-tone-law-params.test.js` | — | 13/13 | yes |

The 4b cone/cylinder guards and the four RED-pinned floors live inside
`scene3d-contour-slice.test.js`, which is in the table above and passes
67/67 at post — none of those describe blocks are touched by this unit's
diff (confirmed no `-` line in them). **CONFIRMED, all numbers match.**

## 5. Interaction with W-35's `extendFrontChains` / the crowding cull

Measured the torus-saddle and sphere-pole O2/blob metrics directly
(`measureO2`/engine-pipeline blob test, both already-shipped tests),
independently in both pre and post scratch trees:

- **Torus**: `waist` 0.03878612131638042mm, `blobCount` 21, `largestW`
  3.35mm — **byte-identical**, pre vs post, to every printed digit.
- **Sphere** (the pole control): `waist` 0.08225346440129311mm,
  `blobCount` 43, `largestW` 34.5mm — **byte-identical**, pre vs post.

This is corroborated by the broader §2 finding: the full `generate()`
JSON output (which is downstream of the crowd cull AND `extendFrontChains`
for every primitive) is 0/24 byte-identical. A ring-merge-at-the-saddle
side effect would necessarily show up as a difference in either the
targeted O2/blob numbers above or the full-output md5 sweep; neither
moved. **No interaction — confirmed two independent ways.**

## 6. Evidence — looked at the images

Read `torus__contourSlice__ladder__med__a.webp` and
`torus__contourSlice__ladder__max__b.webp` at native resolution: both show
a healthy torus contourSlice ladder — dense, evenly-spaced concentric
rings following the tube, both saddle-adjacent "eye" pinch regions normal,
no visible blob, fusion, or gap anywhere in either frame. Consistent with
the byte-identity claim (there is, by construction, nothing to see).

`after/W-27c-0a-6/` only captured the four torus cells (the ring the unit
explicitly set out to fix). Given §2's finding, the ellipsoid/capsule
camera-b cells were never shot — not a blocking gap (the byte-identity
sweep is strictly stronger evidence than a screenshot could be for a
sub-pixel delta), but the evidence directory's own scope statement
("cells: torus only") is now understated relative to what the fix
actually touches.

## 7. Merge note

**Ship it.** The convergence fix itself is real, correctly scoped in
`src/`, RED/GREEN/mutation-proven three independent ways (implementer,
this review's reproduction, this review's own strip-the-gate mutation),
and has zero measured effect on any rendered output across the full
6-primitive x 2-camera x 2-density grid — reproduced with an
independently-written script, not just the implementer's. The four
re-pinned test bars are exactly, and only, the four `W-27c-0a-5-review.md`
named; the tiny-ring count pins are untouched; every named guard suite
reproduces the implementer's exact pass counts at both shas; the crowding
cull and `extendFrontChains` are unaffected at both the torus saddle and
sphere pole, confirmed byte-identical.

**Required follow-up (does not block merge):** the gate's disclosed
footprint is incomplete. It also fires on an ellipsoid ring (level 15) and
a capsule ring (level 4), both ONLY visible at camera `b` — neither was a
non-convergence defect before this fix (both converged fine in round 0),
so the gate incidentally also skips a harmless, already-correct
Newton-snap for them. The net effect is provably nil (0/24 byte-identical,
independently reproduced), but (a) the impl report's and
`report.json`'s "the fix only ever fires on the torus's level-6 ring"
claim should be corrected to name all three rings and both cameras, and
(b) the "safety margin" regression test should be generalized to camera
`b` (or both cameras) so it actually guards the fix's real footprint
instead of a camera-a-only subset of it. This is the same shape of gap
`STILL-OPEN.md`/`LEDGER.md` row 14 already flagged for W-34 in this same
lane ("the plan tabulated M1 at camera a only") — worth naming explicitly
so a future unit in this lane checks both cameras by default rather than
re-discovering the same blind spot a third time.
