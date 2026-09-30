# T2-8b — implementation report (mechanism A only: SEC span-end continuation)

Branch `3d-scene/fill-audit-a6`, base `8b8f275e` (src/tests identical to `b8dc93fe`). Commits: `00de9b00` (src), `ff13771f` (tests), `9d217ed0` (dir-cut, contour gate, re-pins). Not pushed. Sphere G5 is OUT of scope and unchanged.

## Result
- Cone base wedges (create cone/hatch/mkTick/med, angle a): bare area at >= 0.75 mm clearance W_L 8.30 -> 0.12 mm^2, W_R 7.51 -> 0.10 mm^2. Bar 0.50.
- `tickSites` and the `[I,R,P,L,drawn]` records: byte-identical to base on 20 of 20 runs (12 at d=50, 8 at d=220). No STOP condition tripped.
- Admission radius used: 1.0 w (`MK_TICK_SEC_ADMIT_PEN`). Not raised.
- Pictures: `docs/3d-audit/fill-audit/after/T2-8b/` (`JAY_T28b_cone.png`, `JAY_T28b_sphere.png`, `crop_{G2a,G2b,G5,WL}_side.png` 3x, `report.json`). Looked at. The wedges are filled; narrow black channels of about 1 to 1.5 mm remain beside some new ticks (visible in G2a). A few new ticks near the rim touch the silhouette edge line (G2b right); the contact metric counts fill-to-fill tips only. Sphere pair is byte-identical, labelled "unchanged - G5 not addressed".

## Deviations from the plan (read these)
1. **Contour mapper is excluded** (`mapper !== 'contour'`). With SEC on contour, `scene3d-mktick-banding` `bandC` failed its pinned ceiling on `create|sphere/contour` (0.0515 vs 0.04676) and `create|cone/contour` (0.0408 vs 0.02508). Base passes 22/22. I kept the bar and gated the mechanism instead. The plan claimed contour tip contact improves; that gain is given up. Jay may prefer to re-pin `bandC` instead; that is a policy call.
2. **10-degree direction cut** (`MK_TICK_SEC_DIR_CUT`). Without it `mark-laws-draw` O2 (`dirOver10/marks <= 0.20`, sphere/hatch d=1) read 0.2105 (base passes 43/43), because SEC marks went through `place()`. A tick whose walked chord departs > 10 degrees from the asked direction is now refused. Effect on the cone numbers: none on create, 1 tick on test.
3. **Duty is inert here.** `duty === 1` on every SEC tick measured (1,117 ticks over the 12 d=50 cells before the contour gate; 93 on the hatch cells that remain). The end solve always has one long seg on these fixtures. Tone continuity comes from the trims and the admission, not from the duty rule. The plan's A4 mutation (duty forced 1 and trims removed) does NOT trip: the create W_R coverage ratio reads 1.098 vs shipped 1.133. See A4 below.
4. **Plan number checks.** Bare areas: base 8.30/7.51 (plan 8.45/7.73), shipped 0.115/0.100 (plan 0.03/0.00), 16 ticks added (plan 19), test-rig W_R 0.888 (plan 0.98). Different instrument port; same order, all inside the bars.
5. **"over2RP = 0 at d=220" is false at base.** Base already has over2RP 4/1/2/2/1 on the d=220 B7 set (torus and cone/hatch). SEC adds none; A5 at d=220 asserts "no worse than SEC-off".

## Bars changed
Rule 6 format: `file — old -> new — why`. All new bars carry a tripping mutant (needle-patched copy of disk source, count asserted 1).

`tests/unit/scene3d-mktick-spacing-tone.test.js` (new describe "T2-8b SEC", 20 tests; file 83 -> 102):
- **A1 NEW, BLOCKING.** create cone/hatch d=50: bare >= 0.75 mm <= 0.50 mm^2 in W_L and in W_R. Gates ONLY "fill the cone wedges". Mutant `off` (flush removed = closures return immediately) -> 8.30 / 7.51 (asserted > 5). Shipped 0.115 / 0.100.
- **A1t NEW, reported.** test cone/hatch W_R <= 1.5 mm^2. Shipped 0.888; mutant `off` 4.68 (asserted > 1.5).
- **A2 NEW, BLOCKING.** `tickSites` + hook records md5 shipped == `off`, on 12 d=50 runs plus 8 d=220 runs (4 B7 cells x 2 rigs). Also B5 `nonMono` equal on 12. Gates ONLY the master grid. Mutant `inline` (closures run at queue time) moves the records on 3 of 12 d=50 runs (test torus/hatch, test cone/hatch, create cone/hatch) and 0 of 8 d=220 runs (asserted >= 1 over the 20).
- **A3 NEW, BLOCKING.** `tipContact <= off + 0.005` and `markContact <= off + 0.01` on the 12 d=50 combinations (measured: never above base; max drop 0.0034 tip on create cone/hatch). Gates ONLY the SEC-added contact. The existing T2/T3 aggregates and named sets are untouched. Mutant `noadmit`: tip rises past `off + 0.005` on create torus/hatch (0.035 -> 0.063), test torus/hatch (0.132 -> 0.161), test cone/hatch (0.045 -> 0.059). The plan's mutant cell (create cone/contour 0.042 -> 0.40) no longer applies (contour gated off); it measured 0.342 before the gate.
- **A4 NEW, BLOCKING. Bar deviates from plan: 1.20, not 1.10.** Raster ink coverage in W_L / W_R <= 1.20 x the equal-size strip directly toward the interior (`STRIP_L/R`, defined in the test). Shipped: create 0.910 / 1.133, test 0.865 / 1.127 (base create 0.786 / 0.980). Shipped R already exceeds 1.10 with my strip definition, so 1.10 would fail the fix itself. Gates ONLY over-inking of the wedge; under-inking is A1. Mutant `dense` (admission off, trims off, lattice x2.5) -> create W_R 1.369 (> 1.20). The plan's named mutant does not trip (deviation 3). T12 inversions <= 6 is the unchanged existing bar in the wedge file and passes.
- **A5 existing bar, extended.** over2RP = 0 and subMin = 0 on 12 d=50; d=220: subMin = 0 and over2RP <= SEC-off. Mutant `ask6` (ticks asked over 6 half-rows, contour gate lifted) -> over2RP 1 on create and test sphere/contour (asserted >= 1). The plan's "asked at 3 x hSt" mutant cannot trip on hatch cells: the surface bounds the walk.
- **I1 NEW, BLOCKING.** md5 of paths shipped == `off`: 3 PRODUCTION mark laws (mkScribble, mkDashRamp, mkDotScreen) + first 6 non-mark laws, x 8 mappers, cone create d=50 (72 cells); plus contour cells of all 3 primitives unchanged (A-block). Mutant `nogate` (drop `law.shape === 'tick'`) changes an mkDashRamp cell (asserted >= 1; measured mkDashRamp and mkDotScreen cones change).
- **I2 NEW, reported.** mkTick, other 6 mappers x 3 primitives (create d=50), 18 cells: tip/mark <= `off` + 0.005, over2RP <= off, subMin = 0.
- **Helper population change:** `buildSceneParams`/`renderCellHooked` gained an optional `law` argument (default `mkTick`, so no existing call changes) and `rowPitch` is null when no mark stat exists. Existing assertions unchanged.
- `tests/helpers/scene3d-mktick-spacing-tone.js`: NEW `buildBareRaster`, `bareArea`, `inkCoverage`, `inkMm` (port of the planner's instrument; no fs/git).

`tests/unit/scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE` (rule 4: fixtures grepped, pin and cell agree on primitive, mapper, density):
- **Re-pinned 4 of 12** (plan said 11 of 12; contour gating and the dir cut reduced it): `test|torus/hatch` 71328eb4... -> 079d70c3...; `test|cone/hatch` d71d85d7... -> e4bd158b...; `create|torus/hatch` 5bbcd92a... -> a012f8bb...; `create|cone/hatch` ff1945b8... -> 485b0f6a.... The other 8 are byte-identical (both sphere/hatch cells and all 6 contour cells).
- **Contrast mutation (NEW test in that block):** loads the shipped source with the flush removed and asserts the 12 OLD hashes (`PRE_T28B_SIGNATURE`) return.

No other bar, tolerance, population or named exception changed. T2/T3/T4 named sets did not grow.

## Pre-existing red
None. Reproduced at `8b8f275e` from a `git archive` export (scratch, node_modules symlinked): `spacing-tone` 83/83, `mktick-wedge` 56/56, `band-purity` 6/6, `mark-laws-draw` 43/43, `mktick-runaway` 34/34, `mktick-banding` 22/22, `one-pen-down-reachability` 5/5 all pass. The two reds that appeared in this lane (`mark-laws-draw` O2, `mktick-banding` bandC x2) were caused by SEC and fixed in `9d217ed0` (deviations 1 and 2). This unit turns no other unit's test green.

## Test runs on the final tree (foreground, one file each)
| file | result |
|---|---|
| scene3d-mktick-spacing-tone | 102/102 |
| scene3d-mktick-wedge | 57/57 |
| scene3d-mktick-band-purity | 6/6 |
| scene3d-mark-laws-draw | 43/43 |
| scene3d-mktick-runaway | 34/34 |
| scene3d-mktick-banding | 22/22 |
| scene3d-one-pen-down-reachability | 5/5 |
| scene3d-tone-law-collapse (forks, 1 worker) | 121/121 |
Full suite not run (per brief). `package-lock.json` was rewritten by `npm install` (libc fields only); not committed.

## Sweep coverage (rule 2)
Roster = 8 mappers x 37 PRODUCTION laws = 296 cells per primitive.
- Non-mkTick: 288 of 296 cells per primitive, x 3 primitives (sphere, cone, torus), create d=50: **864/864 md5-identical** vs a `git archive` base (out-of-tree run; in-test subset 72 cells cone + contour cells). The 8 excluded are the mkTick row. Non-mark laws never reach `emitMarks` (`MK[algo]` undefined), so they cannot see SEC by construction.
- mkTick row: **8/8 mappers = 100 %.** Measured on 3 primitives x 8 mappers = 24 cells (create d=50): 4 cells change (cone/hatch, cone/crosshatch, torus/hatch, torus/crosshatch); tip/mark contact never increases (max change 0; largest drop cone/crosshatch tip -0.0137); over2RP 0; subMin 0. Densities: d=50 for all; d=220 only for the 4 B7 cells x 2 rigs (sites identical, subMin 0, over2RP unchanged). Not swept: other densities, other cameras, fill angles other than 45, non-default mkTick params.

## Fixture (rule 3) and ground
Every number: `algo.generate(params, null, null, BOUNDS)`, BOUNDS 1200x1000 m=20 pen 0.3; mapper hatch unless stated; toneLaw mkTick; fillAngle 45; fillDensity 50 (med) unless d=220 stated; camera `Params.DEFAULT_CAMERA` (angle a); one SUN az135 el45; tone enabled. **Ground and backdrop are DISABLED; no ground-plane ink is in any ink number.** Ink = sceneFill + sceneEdge path length (create cone/hatch: 1495 -> 1538 mm, +2.9 %). Rigs named per number: `create` = PRIMITIVE_PARAM_DEFAULTS + PRIMITIVE_CREATE_DEFAULTS (gallery/Jay), `test` = PRIMITIVE_PARAM_DEFAULTS. Pictures: `scene3d-capture.js --tier B --rig create`, before from a `git archive` of `8b8f275e` (port 8476, killed), after from the lane. Machine-readable copy: `report.json`.

## What the mechanism is (as built)
`mkEndQ` (render scope beside `mkInk`) holds two closures per tick span (`secSide` at `s0`, dir -1, and at `s1`, dir +1), pushed after item 8's end tick, gated `law.shape === 'tick' && !mkWedgeActive && mapper !== 'contour'`. Flushed once after `runMapper` (front and x-ray), before `flushDeferredRibbons()`. `secSide`: positions `j*P - off` (j=1..8, skip <= 0.25P); param line extended by the end's own param-per-mm; sideways ladder {0.15,0.35,0.55,0.75,0.95} x half-row; fresh `frameFrom` at the first on-front sample; half-band tick trimmed 0.25 PMINT each end; dry `walkPoly` must reach the plot floor; length `max(LPF, duty*drawn)`; re-walk; refuse if a point is within 1.0 w of any `mkInk` point (no lineIndex filter) or the chord is > 10 degrees off; `place()` with full-radius clip. Never touches `mkStat.tickSites`. The planner's reference code was not on disk; this is built from the §3.1 text, so details the text leaves open (kIn = 2 samples inside the end; tick centred on the dry walk's extent) are my choices.

## Open for Jay
- Sphere G5 still open (plan §5): accept as inherent, or fund the LGI prototype.
- Contour exclusion vs re-pinning `bandC` (deviation 1).
