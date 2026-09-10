STATUS: ACCEPT-WITH-FOLLOWUPS

# W-34 review — contourSlice ring corners: device-space refinement stop (Fix A) + capsule closed form (Fix B)

Reviewer, read-only. Worktree `.claude/worktrees/fill-audit-d2` (branch `3d-scene/fill-audit-d2`),
pinned range `be5cfcf8..fe491dfa` (single commit `fe491dfa`). Confirmed clean: `git status --short --
. ':!graphify-out'` empty, `git log --oneline be5cfcf8..fe491dfa` shows exactly one commit, `git diff
--stat` touches exactly `src/core/algorithms/scene3d.js` (+45/-9), `tests/unit/scene3d-contour-slice-
corners.test.js` (new, +448), `tests/unit/scene3d-contour-slice.test.js` (+13/-9). No worktree file
was edited, stashed, or deleted. All measurement below was done in scratch `git archive` exports
under `/private/tmp/claude-501/scratch-W34-review-*`, deleted at the end of this review.

## 1. RED at be5cfcf8 — reproduced, for the right reason

Copied the shipped `scene3d-contour-slice-corners.test.js` into a scratch export of `be5cfcf8` and ran
it in the foreground (`--pool=forks --poolOptions.forks.singleFork=true`): **8 of 25 fail**.

- T1 (M1, camera a): **cone 8.0882°, capsule 9.0750°** — matches the plan's and the impl's numbers to
  4 decimal places.
- T1 (M1, camera b) — the impl's own disclosed extra finding, reproduced: sphere 8.3913°, ellipsoid
  8.3551°, cone 9.3168°, torus 10.6330°, capsule 8.5539° all over 8°.
- T3 (capsule truth oracle): emitted worst **32.4195°/mm** vs. analytic worst **8.1659°/mm**, excess
  **297.0%** — matches the impl's 297.0%/297.6% (their number differs in the 4th sig-fig only because
  I ran T3 in isolation vs. their full-file run; not material).
- T2 (cone/torus/sphere/ellipsoid/cylinder): all pass at be5cfcf8, as documented.

**Open-polyline-awareness, proven on real data, not just the file's synthetic mutation guard.** I
independently rebuilt the cone's analytic cross-section **without** the shipped helper's trailing
closing-point append and reproduced the plan's own truth ladder almost exactly (76.18°/mm max vs. the
plan's 76.4°/mm, 5.21° at the outermost real plane vs. the plan's 5.2° — a full 26-plane match). Then,
by re-adding the append (making the curve register as closed), I reproduced the shipped test's own
141.56°/mm cone "ceiling" — i.e., I isolated exactly what wrapping does to a genuinely open cross-
section: it invents a phantom ~120–141°/mm corner across the wrap seam by treating the cone's flat-
base-rim edge (a real, but *different*, geometric feature — the dihedral edge, not the near-apex
vertex) as adjacent to the vertex-side. This is a live, numeric demonstration of the exact failure mode
the file's own mutation guard describes synthetically (the withdrawn 39.8° artefact) — see §3 for why
it also matters for T2.

## 2. GREEN + mutation — both fixes independently load-bearing

Full 25-test suite at `fe491dfa`: **25/25 pass**, matching the impl exactly — T1 camera a torus
7.5795°, capsule 7.9278° (all six under 8, both cameras); T2 cone emitted 76.41 vs. ceiling 141.56
(unaffected, expected); T3 capsule emitted **8.3745°/mm** vs. truth **8.1659°/mm**, excess **2.56%**.

**Mutation 1 — revert Fix A** (`proj2 = null` unconditionally in `refineSliceRing`, everything else at
`fe491dfa`): T1 goes RED again — **7 of 7 camera×primitive T1 cases newly fail** (sphere/b, ellipsoid/b,
cone/a, cone/b, torus/b, capsule/a 8.9607°, capsule/b). Fix A is load-bearing.

**Mutation 2 — revert Fix B** (`capsule` branch in `sliceSurfaceFG` short-circuited to `false`,
Fix A left intact): T3 goes RED — **emitted 32.4685°/mm vs. threshold 9.3907°/mm**, essentially
reproducing the original 297% excess (32.47 vs. 32.42 originally — the ~0.15% difference is Fix A's
own small effect on point placement, not noise). Fix B is load-bearing and T3 is the correct gate for
it, exactly as the ruling requires.

## 3. Cone's 76.4° exclusion — a real rule, but its shipped implementation is measurably too loose

The T2 cone sub-test's exemption **is** a computed rule (real slice-plane z0s from
`Scene3D.Slices.buildSliceSegments`, the true `sliceSurfaceFG`-matching surface equation, the same M2
metric, same camera/bounds) rather than a bare tolerance — that part is sound and I reproduce its
headline claim independently: the emitted cone corner (76.41°/mm) matches the *correctly computed*
analytic truth (76.18°/mm, my own open-form reconstruction) to within numerical/resampling noise, i.e.
**genuinely 0.0° of invention**, exactly as the plan and impl report.

**But the shipped `coneCrossSectionWorld` helper has a construction bug that inflates its own ceiling
nearly 2x, from a correct ~76–77°/mm to the shipped 141.56°/mm.** It appends a trailing closing point
(`.concat([{...pts[0]}])`) to the assembled base→vertex→base hairpin curve. For a **capsule** this is
correct (I verified: with vs. without the append, the capsule ceiling is bit-identical, 8.166°/mm
either way, because a capsule's cross-section truly has no flat rim — both `pts[0]` and the mirror's
last point already coincide by the geometry itself). For a **cone**, it is wrong: the cone has a flat
base disk, so its lateral-surface cross-section is a genuinely **open** arc (base rim → vertex → base
rim), and forcing it closed makes the M2 metric evaluate a synthetic wrap-around window straddling the
~36 mm chord across the base — which happens to land on a **real but unrelated** geometric feature (the
dihedral edge where the cone's slanted surface meets its flat base), producing a spurious 120–141°/mm
"corner" that has nothing to do with the near-apex vertex the test's own comment says it is checking.

**Does this hide a real defect? Yes, potentially, for future regressions — not for what's shipped
today.** T2's cone sub-test currently exempts the cone up to `141.56 + 1 = 142.56°/mm` instead of the
geometrically-correct `~76.18 + 1 = 77.18°/mm`. A future change that invented an interior cone corner
anywhere up to ~140°/mm (nearly double the true worst-case) would pass this specific sub-test
undetected, even though it would clearly not be real geometry. This does **not** affect what shipped in
this unit (`scene3d.js` is untouched by this bug — it lives only in the new test file's analytic-truth
helper; T1, T3, T4, and all 57+56 guard tests are unaffected and correctly gate Fix A/Fix B). It is a
genuine, narrow test-quality gap: **recommend a fast follow-up removing the trailing closing-point
append from `coneCrossSectionWorld` (or excluding the wrap window) in
`tests/unit/scene3d-contour-slice-corners.test.js`**, tightening T2's cone bound from `analyticCeiling
+ 1` (currently ~142.6) to the correct ~77.2. This is why the verdict is ACCEPT-WITH-FOLLOWUPS rather
than a clean ACCEPT.

## 4. Numbers reproduced

- Capsule 32.4 → 8.4°/mm: reproduced (32.4195 → 8.3745, excess 297.0% → 2.56%).
- Per-primitive T1 max, before → after (camera a): sphere 7.223→(under 8, unaffected by mutation of
  interest), ellipsoid 7.489→(under 8), **cone 8.0882→7.xx (under 8)**, cylinder 0→0,
  **torus 7.5795→7.5795 (byte-identical, matches plan's "unchanged")**, **capsule 9.0750→7.9278**.
- Point-count deltas (T4, camera a, independently reproduced): sphere 2028→1882, ellipsoid 1888→1752,
  cone 4112→4050, torus 3295→3295 (unchanged), **capsule 6277→2096** — the capsule's large drop is
  consistent with Fix B replacing a longer Catmull-Rom wiggle with the true, shorter surface curve;
  none breach the T4 guard's 2x ceiling.
- Rings/ink: independently spot-checked via a self-generated visual before/after (§6) rather than
  re-running the full audit-capture ink pipeline (out of scope for a foreground review budget); the
  raw-`generate()` point-count deltas above corroborate the impl's `inkMm` deltas' direction and rough
  magnitude (capsule shrinks most, cylinder byte-identical, others move a few percent).

## 5. Fix C not present

Diffing `be5cfcf8..fe491dfa` on `scene3d.js`: exactly two hunks — the new `capsule` branch in
`sliceSurfaceFG` (Fix B) and the `opts.project`/`refineProjectFn` wiring in `refineSliceRing` +
`linkPlane` (Fix A). No change to `buildSliceSegments`'s level-placement formula (`scene3d.js:158`),
no apex-band/forbidden-band logic anywhere. Cone rings changed **only** via Fix A: point count
4112→4050, M2 unchanged at 76.41°/mm, worst-ring position unchanged. Visually, the cone apex crop
(both cameras) is unchanged in character before vs. after — same sharp inverted-V chevron, confirmed
independently (§6).

## 6. Look — independent capture, not just the impl's description

Converted all 12 `after/W-34/shots/A/*.webp` to PNG and viewed each at native resolution (sphere,
ellipsoid, cone, cylinder, torus, capsule × cameras a/b). All 12 match the impl's descriptions:
smooth nested rings on sphere/ellipsoid/torus/cylinder (torus retains its two real saddle cusps);
cone shows the sharp inverted-V chevron on the two near-apex rings at both cameras (worse/more visible
at camera b, consistent with 86.5° vs. 76.4°); capsule shows uniformly smooth rings at native zoom.

**Went further than the brief and self-generated a "before" capture** by pointing
`scripts/audit/scene3d-capture.js --root` at my own `be5cfcf8` scratch export (port 8491, one shot,
matching the technique `W-27c-0a-4b-impl.md` used) rather than relying solely on the impl's narrative.
Cropped the same capsule top-left rounded corner (0,0)-(220,220), 4× upsampled, before vs. after:
**before shows unambiguous polygonal faceting** — several straight facet segments meeting at visible
angular vertices through the middle-inner rings; **after is uniformly smooth**, no faceting anywhere in
the same region. This independently confirms the impl's "dramatic, unambiguous visual fix" claim rather
than taking it on faith.

Cone apex crop (190,0)-(390,180), 4× upsampled, camera a: clean, sharp inverted-V chevron on the second
ring from the tip, exactly as both the plan and impl describe — genuine geometry, correctly left alone.
Camera b apex crop: same chevron, more pronounced. Ellipsoid left-edge crop (0,60)-(220,340): minor
stair-step/rough-end artefacts visible at a couple of ring termini near the top-left silhouette — W-35
territory, not this unit's, consistent with the report.

## 7. Guards — reproduced independently in a fresh scratch export at `fe491dfa`

| suite | result |
|---|---|
| `tests/unit/scene3d-contour-slice.test.js` | **57/57** (matches impl) |
| `tests/unit/scene3d-mappers.test.js` | **32/32** |
| `tests/unit/scene3d-hlr.test.js` | **11/11** |
| `tests/unit/scene3d-curves.test.js` | **13/13** |

Line-checked (not just "suite passed"): item (b) placeholder at `:1020` reads
`toBeLessThanOrEqual(8)` (tightened from `<45`, a **tightening**, not a widening — matches the
disclosed `## Bars changed`); 0(b) ceiling `fills.length` `toBeLessThanOrEqual(55)` at `:1244`,
annotated "RESTORED from 80," present and unmoved; W-27c ellipsoid rotated-transform accuracy
(`newMethod.maxDev`, `:606-622`) still asserts `< 0.15mm` and drives `analyticProjectLocal` directly
with no `opts.project` argument — confirmed unreachable by Fix A. The W-27c-0a-4b cone/cylinder
console output in my own run shows `pathCount 22` (cone) / `pathCount 26` (cylinder), matching
`W-27c-0a-4b-impl.md`'s pinned values; the four fingerprint floors embedded in that block did not fail
(full file green). No other bar, ceiling, or fingerprint was touched or re-pinned — confirmed by the
`## Bars changed` table in the impl report having exactly one row, matching the diff I read.

## 8. Byte-identity — independently re-verified, not re-trusted from the report

Dumped `algo.generate()` output for 14 cases (box/plane/pyramid/solid(buckyball)/cylinder under
`contourSlice`; sphere/ellipsoid/cone/cylinder/torus/capsule/box/plane/pyramid under `hatch`) from
fresh scratch exports of `be5cfcf8` and `fe491dfa`, and md5'd both dumps: **identical hash
(`f41a659195619ac2842f39c889bcd3d1`), all 14 cases individually confirmed identical.** Matches the
impl's "14/14 byte-identical" claim exactly, independently reproduced rather than re-run from their
script.

## 9. Merge disjointness

Files touched by this unit: `src/core/algorithms/scene3d.js`, `tests/unit/scene3d-contour-slice.test.js`,
`tests/unit/scene3d-contour-slice-corners.test.js` (new). Checked against:

- **Main `e429cfc5`** (chunks `tests/unit/scene3d-tone-law-collapse.test.js`) and **`1193cbe1`**
  (rounds golden comparisons in `scene3d-charts-parity.test.js`, `scene3d-curved-density-sparse-
  end.test.js`, `scene3d-hlr-spatial-index-identity.test.js`, `scene3d-mesh-invariants.test.js`) —
  **zero file overlap**, both are test-infra-only fixes on unrelated suites. Merge-base of `main` and
  `fill-audit-d2` is `47a5a755`; main has advanced only by these two commits plus two more
  (`88041036` vitest timeout config, `a7d39601` docs) since, none touching `scene3d.js` or the
  contourSlice test files.
- **fill-audit-a2 (W-36/T1b)**: `git diff --stat main...HEAD` in that worktree touches
  `src/core/scene3d/surface-fill.js`, `tests/unit/scene3d-crosshatch-parity.test.js`,
  `tests/unit/scene3d-curved-density-floor.test.js`, `tests/unit/scene3d-mark-laws-draw.test.js` —
  **zero overlap** with W-34's file set.

Both disjointness claims hold.

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** Fix A and Fix B are both correctly targeted, independently mutation-proven
load-bearing, byte-identical outside their intended surface (14/14 verified), all named floors/ceilings/
fingerprints hold (57+56 tests reproduced green, 0(b)≤55 and the W-27c 0.15mm bar confirmed unmoved),
and the visual claims hold up under an independently self-generated before/after capture (not just the
impl's narrative). Fix C is confirmed absent. Merge disjointness against main and the two named
neighbor lanes is confirmed.

**Required follow-up (not blocking, ship as-is):** `tests/unit/scene3d-contour-slice-corners.test.js`'s
`coneCrossSectionWorld` helper (T2's cone sub-test) appends a closing point that is correct for the
capsule but wrong for the cone (which has a flat base rim, unlike the capsule), inflating T2's cone
ceiling from a geometrically-correct ~77°/mm to the shipped ~142.6°/mm. This weakens — but does not
currently violate — the regression protection T2 is meant to provide against a *future* invented
interior corner on the cone. Recommend: drop the trailing `.concat([{...pts[0]}])` for the cone helper
only (or explicitly exclude the wrap-window from `turnOverArc` for that curve), re-measure, and
tighten the `+ 1` slack bound accordingly. File as a new lightweight W-id or fold into this unit's own
lane report addendum — implementer's call.

REPORT docs/3d-audit/lane-reports/W-34-review.md
