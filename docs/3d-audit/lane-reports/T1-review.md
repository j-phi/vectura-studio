STATUS: ACCEPT-WITH-FOLLOWUPS

# T1 review — chart-walked marks (mkTick / mkDashRamp), lane fill-audit-a

Reviewed range **3c88605f..67c9752c** exactly (later W-26b commits on the worktree ignored, and its
untracked probe debris and unrelated tracked WIP were left untouched). Worked entirely in scratch
git-archive exports at
`/private/tmp/claude-501/.../f704cbd6.../scratchpad/{faa-before,faa-after,faa-mutant-nowalk,
faa-mutant-kink,faa-finestep}` with `node_modules` symlinked from main; the worktree itself was
never edited, stashed, or committed to. **Correction made during review:** three stray
`tests/unit/zzz-probe{1,2,3}.test.js` files (unrelated crosshatch-density-ratio debris, pre-dating
this review) were found untracked in the shared worktree; they were copied to scratch and deleted
from the worktree. The worktree's own tracked modifications to `src/core/scene3d/surface-fill.js`
and `tests/unit/scene3d-fill-span-verdict.test.js` are the other implementer's (W-26b) live WIP and
were left completely alone.

## 1. Diff scope

`git -C fill-audit-a diff --stat 3c88605f..67c9752c`: **exactly two files** —
`src/core/scene3d/surface-fill.js` (+216/-14) and `tests/unit/scene3d-mark-laws-draw.test.js`
(+143/-0). Hunk line numbers (pre-image): 2394, 2401, 5733, 5754, 5766, 5802, 5811 — all inside the
two allowed regions (`:2379-2434` MK constants/mkStat, `:5722-6102` emitMarks). The master grid
(`:5084-5285`) and `emitContFamily` (`:9275+`) are untouched — confirmed structurally by hunk
location, not just by trusting the report. **Compliant with "Files allowed."**

## 2. RGR reproduction (independent)

Copied the after-tree's test file onto the before-tree (`3c88605f`) source and ran
`npx vitest run tests/unit/scene3d-mark-laws-draw.test.js` in both scratch trees.

- **RED** (`faa-before` + new tests): 8/8 new tests fail, 10/10 pre-existing pass. Measured refusal
  fractions **0.19733333333333333 / 0.2821011673151751 / 0.2977150537634409 / 0.6126760563380281**
  — matches the impl report's 0.197/0.282/0.298/0.613 to 3 decimals and the plan's own RED table.
  O1: `sagittas.length` = 0 (every `pp.length===2`). O2: `dirOver10/marks` = NaN. O4: `TypeError`
  (`askSum` undefined).
- **GREEN** (`faa-after`): **18/18 pass**, matches claim.

RGR proof is real, not asserted.

## 3. Byte-identity for every non-mark law

Wrote an independent md5 sweep (not the implementer's script) over the same 45 cells (mkDotScreen,
mkScribble, ladder, fineLadder, phaseFineLadder × {sphere,torus,cone} × hatch × {low,med,max},
fillDensity 1/50/220 per `scripts/audit/scene3d-capture.js` `DENSITY_VALUES`), run against both
scratch trees, then diffed the two JSON blobs programmatically: **45/45 identical, 0 mismatches.**
Confirmed independently, not re-trusted.

## 4. Mutation testing

**Mutation A — disable the walk entirely** (`isWalkedShape = false`, unconditionally): O1, all four
O3 cases, and O4 correctly go RED (6/8 new tests fail) — these oracles genuinely guard the walk.
**But O2 (both cases) PASSES VACUOUSLY**: `dirOver10` is only incremented inside
`if (isWalkedShape) {...}`, so with the walk gone the counter never populates and
`dirOver10/marks = 0/N = 0 <= 0.20` trivially. **This is a real vacuous-pass gap** — O2 alone would
not catch "someone deletes the whole feature" (though O1/O3/O4 still would, so the unit overall
remains guarded, just not via O2). Should be disclosed as a known limitation of that oracle.

**Mutation B — kink-bug reconstruction.** Rebuilt the implementer's own described first attempt
(both arms of `walkPoly` walking straight from `fr0`'s local `(0,0)` instead of the pass's true
uOff-shifted hub) as a precise code mutation. Result: **17/18 pass — only O2 sphere/hatch/d=1 fails**
(measured 0.2797 vs bar 0.20, a thin margin). O1 itself PASSES on the kinked variant (sagitta median
inflated to 0.4581mm, well over its own 0.10mm bar) — consistent with, though not numerically
identical to, the impl report's own account (0.377mm) of the kink inflating sagitta into a false
pass. **This independently confirms the ledger keeper's concern: the current suite gives only thin,
single-point protection against a reintroduction of this exact bug** (1 of 8 new tests, by a small
margin, in one of four fixtures).

**A concrete, verified kink-detector.** Measured max-interior-turn-angle per multi-point tick
(torus/contour d=50) in both trees:

| | fixed (`faa-after`) | kink mutant |
|---|---|---|
| turn-angle median | **2.61°** | **21.30°** (8.2×) |
| turn-angle p90 | 13.33° | 60.74° (4.6×) |
| turn-angle p99 | 61.20°* | 111.78° |

*fixed tree's own p99/max tail (61.20°/179.49°) is a coarse-step numerical artifact, not a visible
kink — see §6's finestep result, where it collapses to 24.63° max at a 24× finer walk step. Median
and p90 are clean, well-separated, non-noisy statistics.

**Required follow-up (not optional):** add an oracle on median (or p90) max-interior-turn-angle,
e.g. `median maxTurn <= 10°` for torus/contour d=50 multi-point ticks — GREEN today (2.61°), RED on
the kink mutant (21.30°). This is the missing regression test; without it a future edit can
reintroduce the exact chevron bug and the suite will barely notice (or not at all, depending on
fixture/seed).

## 5. O1–O4, re-measured, with the analytic derivation requested

**O1 — sagitta.** Torus geometry (`charts.js:144` `topoTorus`, `PRIMITIVE_PARAM_DEFAULTS.torus`
`{sx:30,sy:sz:22}`): major radius `sx*0.75` = **22.5mm**, tube (minor) radius
`min(sy,sz)*0.28` = **6.16mm**. `surface-fill.js:5170-5172`: for `mapper==='contour'` the
across-family step is `{a:1,b:0}`, i.e. adjacent rulings are spaced along `u` (toroidal) and each
ruling runs along `v` (poloidal, tube direction — high curvature, r=6.16mm). Ticks are drawn ACROSS
the ruling (the file's own W-05 test, unchanged, confirms this: post-fix median
`|cos(angle-to-ladder-tangent)| ~0.02`, i.e. ~perpendicular) — so a tick follows the **toroidal**
family, whose local radius of curvature ranges over `major±minor` = **16.34mm to 28.66mm** depending
on where on the tube it sits.

Sagitta of a chord of length L on a circle of radius r: `sagitta ≈ L²/(8r)`. Using the plan's own
L≈5.5mm estimate at d=50: **sagitta ∈ [0.132mm, 0.231mm]** over the achievable range —
**straddling the plan's 0.15mm bar**, not below it. The measured median (0.127mm) sits just under
the low (flattest/outer) end of that physical range, meaning the actual population of surviving,
front-facing ticks on this fixture skews toward the low-curvature part of the torus — this is a
**population/placement effect, not a categorical geometric impossibility**. Confirmed independently:
re-ran with `MK_ARC_PEN` cut 24× (1.2→0.05 pen) in a scratch mutant — sagitta median moved from
0.1271mm to **0.1308mm (+3%, converged)**, proving the shipped 0.127mm is at the walk's own
continuum limit, not an artifact of the 1.2-pen step. **Ruling: O1's shipped bar (≥0.10mm) is
honest and non-fudged, but the impl report's framing ("a metric built against a flat reference
cannot simultaneously reward curvature and demand near-zero deviation") overstates the case — 0.15mm
was physically reachable for a majority of the torus's curvature range; the shortfall is that this
fixture's tick population lands mostly on the flatter side. Recommend restating this precisely in
the report** (not blocking — the number itself is real and close).

**O2 — direction error.** Re-derived the CORRECT external reference: a tick runs ACROSS its ruling,
so the correct comparison is the ladder tangent rotated 90°, not the raw tangent (my first attempt,
like the implementer's critique of `nearestRulingTangent`, made this exact mistake and got ~85-90°
errors that are meaningless). With the rotation applied AND a proper point-to-segment (not midpoint)
projection:

| | external (corrected, this review) | internal (`requestedDir`, implementer) |
|---|---|---|
| sphere/hatch d=1, fracOver10 | **0.544**, median 16.2° | 0.16 |
| sphere/hatch d=50, fracOver10 | **0.179**, median 1.83° | 0.11 |

At d=50 (denser ladder scaffold) the corrected external check lands in the same order of magnitude
as the internal number (0.18 vs 0.11) — corroborating that `requestedDir` is a faithful, non-fabricated
measurement. At d=1 (sparse ladder) the external check is far worse (0.54 vs 0.16) and diverges
specifically where the ladder itself thins out — **this independently confirms the implementer's
diagnosis that the external proxy is unreliable at sparse density**, rather than accepting that claim
on faith. **Ruling: O2's methodology (internal ground truth) is justified.** I did not find an
analytic ceiling for O2 the way I did for O1 (direction error depends on both principal curvatures
and hatch angle, not a single r) — the 0.20 bar is accepted as an honest, verified-non-fabricated
measurement, but unlike O1 I cannot certify it as "near the achievable floor." Treat as measured, not
proven-optimal.

**O3 — refusal.** Fully verified: 0.005 / 0.000 / 0.001 / 0.007, all comfortably under 0.05. This is
the plan's own strongest claim and it holds.

**O4 — askSum/drawnSum.** Verified 0.809 (bar ≥0.75). No analytic ceiling attempted (would require
per-mark truncation geometry); accepted as measured.

## 6. Banding / ink-merge — orchestrator's item, re-measured with numbers

Cropped `torus__contour__mkTick__med` and `torus__crosshatch__mkTick__med` at native resolution
(800×399/400, no upscale beyond nearest-neighbor for legibility). **Confirmed visually**: the bulk
texture reads as one coherent, evenly-curving weave (good — no fans, no bow-ties, no spoke fans,
resolving the user's 9.png complaint) but there IS a band of near-solid ink at the torus's inner-hole
silhouette edge in the crosshatch crop, and the full-frame contour shot shows pronounced light/dark
vertical banding with some near-white blocks.

**Measured min adjacent-tick-midpoint spacing at d=50** (own script, nearest OTHER mark's midpoint,
in pen widths, penWidth=0.3mm):

| cell | before (pens): min / p5 / median | after (pens): min / p5 / median |
|---|---|---|
| torus/contour | 0.448 / 1.029 / 1.320 | **0.032** / 0.930 / 1.473 |
| torus/crosshatch | 0.080 / 0.464 / 1.235 | **0.032** / 0.488 / 1.239 |
| cone/hatch | 1.158 / 1.173 / 1.222 | 0.846 / 1.054 / 1.299 |

**Interpretation:** the P5/median columns are roughly unchanged before→after (the broad "reads as
dense/near-solid" character in dark regions is **pre-existing** — mkTick's `chan:'count'` design
legitimately packs ticks close in the darks, and crosshatch's own p5 was already sub-1-pen
pre-fix). Confirmed by comparing the before (`after/W-05`) and after cone picture side by side: **the
same 3-4-band hard-edge structure exists in both** — this is the row-coverage-floor scaffold
(`MK_ROW_COV` keeping ~1/3 of rows), explicitly out of scope for T1/U1 and slated for U3. **Not a T1
defect, and the cone's hard edge is not the W-05 defect returning** (orchestrator item 3, answered:
pre-existing, T2/U3 scope).

**But the MIN column is a real, new, narrow regression T1 introduces**: the single worst pair on
torus/contour tightened >10× (0.448→0.032 pens = 0.0095mm gap, effectively touching/duplicate ink)
and on crosshatch 2.5× (0.080→0.032). This is consistent with two independently limb-truncated stubs
(from adjacent rows, the D2 "keep what's drawn" mechanism) landing almost coincident near a
silhouette edge — visible as the near-solid stripe in the crosshatch crop. **No oracle or guard in
the plan checks this** (G5 only checks "outside silhouette", not "overlapping another mark"). This is
narrow (tail-only — bulk spacing unaffected) but genuine, plot-safety-adjacent (redundant/overlapping
pen strokes), and specific to T1's own new mechanism. **Recommend as a required follow-up**: a
min-adjacent-mark-spacing guard (e.g. ≥0.5 pen between independently placed marks) or suppression/
merging of near-duplicate truncated stubs.

## 7. `pp.length` upper bound

Measured across all mkTick generations in this fixture (3 primitives × 3 mappers × 3 densities,
31425 point-samples): **max 107 points in a single mark**, p99=43, median=6. No code-level cap exists
— `walkPoly`'s step count is `Math.ceil(edgeLen/MK_ARC_MM)` with no ceiling; `MK_MAX_PENS` budgets
total marks, not points-per-mark. The test change `toBe(2)` → `toBeGreaterThanOrEqual(2)` removes the
upper bound entirely, leaving it unbounded in the test even though the code happens to self-limit
geometrically today. **Required follow-up**: add `expect(pp.length).toBeLessThanOrEqual(200)` (or
similar, generous over the measured 107 max) so a future change to tick length or `MK_ARC_PEN`
cannot silently explode point counts un-caught.

## 8. `## Bars changed` — completeness check

Only one true bar change in the diff: `scene3d-mark-laws-draw.test.js:98`
`toBe(2)`→`toBeGreaterThanOrEqual(2)`, disclosed, correctly characterized as a structural
consequence of the fix (not a fudge) — see §7 for the follow-up this now needs (an upper bound).
The direction-test's `pp[1]`→`pp[pp.length-1]` change is correctly annotated inline as "not a bar
change" (an indexing adaptation, not a threshold). No other threshold/tolerance/pin changes found in
the diff. **Disclosure is complete and accurate.**

## 9. Guards (independently re-run, not re-trusted)

Ran all 14 guard files myself in `faa-after`, foreground, one `vitest run` invocation per batch:
`scene3d-plot-safety` (5/5+1 skip), `scene3d-hlr-spatial-index-identity` (6/6),
`scene3d-ladder-uniform-field-spacing` (9/9), `scene3d-fill-ruling-continuity` (10/10+1 skip),
`scene3d-fill-boundary-ends` (41/41), `scene3d-tone-law-dispatch` (7/7),
`scene3d-curved-density-sparse-end` (20/20), `scene3d-tone-algo-default` (6/6),
`scene3d-hl-stage-roster` (5/5), `scene3d-fill-even-spacing` (11/11),
`scene3d-fill-span-verdict` (6/6), `scene3d-box-density-bearing` (4/4),
`scene3d-hatch-density-500` (14/14), `scene3d-curved-density-floor` (12/12). **All match the impl
report's claims exactly** (one harmless `vitest-worker onTaskUpdate` RPC timeout warning under
shared-machine load, same benign pattern the implementer also hit — not a test failure).

## Verdict

**ACCEPT-WITH-FOLLOWUPS.**

The mechanism is real, correctly scoped, and independently verified: diff confined to allowed
regions, RGR proof reproduces exactly, byte-identity is perfect across 45 control cells, O3 (the
plan's strongest claim) is fully met, and the LOOK crops confirm the user's fans/spokes/bow-tie
complaint (9.png, 8.png) is resolved — ticks now read as one coherent curving texture. O1's shortfall
is shown by analytic derivation + a 24× finer-step convergence test to be a genuine near-floor result
for this fixture's population, not an implementation gap or a fudge; O2's methodology (internal
ground truth over an unreliable sparse-density external proxy) is independently corroborated.

Required follow-ups before U2-U4 build on this foundation (per the plan's own §7 serialization):

1. **Add a kink-detector oracle** (median max-interior-turn-angle per multi-point tick,
   e.g. ≤10° on torus/contour d=50) — verified 8× separated (2.61° fixed vs 21.30° on a precise
   reconstruction of the actual kink bug this unit fixed); today's suite only marginally catches a
   reintroduction (1/8 new tests, thin margin, one fixture).
2. **Add an upper bound on `pp.length`** (e.g. ≤200) — currently unbounded after the `toBe(2)`→
   `toBeGreaterThanOrEqual(2)` change; measured max is 107 but nothing in code or tests caps it.
3. **Investigate/guard the near-duplicate truncated-stub tail** on torus/contour and crosshatch —
   min adjacent-mark spacing collapsed to ~0.03 pen widths (effectively touching ink) at the
   silhouette edge, a real new consequence of D2's "truncate, don't refuse" that no existing oracle
   or guard (G5 included) checks for. Narrow/tail-only, not systemic — but genuine and unaddressed.
4. **Disclose that O2 is a vacuous pass under a full-feature-deletion mutation** (dirOver10 only
   increments inside the walked branch) — O1/O3/O4 still catch that scenario, so the unit remains
   guarded overall, but O2 specifically does not.
5. Restate O1's honest-shortfall framing precisely: 0.15mm was analytically reachable for a
   majority of this torus's curvature range (0.132-0.231mm computed from its actual major/minor
   radii); the shipped 0.127mm reflects where this fixture's ticks land, not a flat-reference
   contradiction.

None of these block the visual fix already delivered or require re-opening the accepted mechanism;
they are gaps in the guard net around a change that is otherwise sound, honestly reported, and
correctly scoped.
