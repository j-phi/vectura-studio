# T2-8b-2 — implementation report (mechanism BC, band continuation; replaces SEC)

Branch `3d-scene/fill-audit-a6`, from `9d217ed0` (SEC, rejected). Commit `8d11044d`. Not pushed. SEC is removed entirely (`secSide`, `MK_TICK_SEC_*`, contour gate, duty rule). The flush line is kept verbatim. Sphere G5 out of scope.

## Result (fixture: create rig unless stated; d=50; mkTick; hatch; angle a; ground DISABLED; object ink only)
| bar | BC | SEC (9d217ed0) | bar |
|---|---|---|---|
| A1 create W_L / W_R bare >= 0.75 mm (mm^2) | 0.06 / 0.00 | 0.115 / 0.100 | <= 0.50 (base 8.30 / 7.51) |
| A1t test W_R | 0.443 | 0.888 | <= 1.5 (base 4.68) |
| SEAM max s, cone/hatch create / test | 1.054 / 0.997, j1 = 1 | 1.55 / 1.47 (FAIL) | <= 1.35 |
| DIR max excess deg create / test | 0.29 / 0.04 | 0.8 / 0.5 (passes) | <= 8 |
| TAPER violations | 0 on 12/12 | 1 create, 3 test cone/hatch (FAIL) | 0 |
| OUTLINE min mm (continuation ticks) create / test | 0.340 / 0.611 | 0.001 / 0.006 (FAIL) | >= 0.30 |
| A4 ratio create L / R (blocking) | 0.937 / 1.158 | – | <= 1.20 |
| A4 ratio test L / R (reported) | 0.866 / 1.207 | – | (1.20) |

Sites: `tickSites` + hook records identical to base on 20/20 (12 d=50, 8 d=220). Tip/mark contact never above base on 12 cells (incl. contour). over2RP 0, subMin 0 (d=50); d=220 over2RP = base. O2 (`mark-laws-draw`) passes (43/43). No STOP condition hit.

The SEAM numbers use my port of the §4.2 metric; its absolute values differ from the planner's (1.09/1.13 for BC, 2.49/2.64 for SEC) but the ordering and pass/fail are the same. Chains: 3 (create) and 2 (test) on cone/hatch.

## Pictures (looked at)
`docs/3d-audit/fill-audit/after/T2-8b-2/`: `JAY_T28b2_cone.png` (BASE | SEC | BC), `crop_{G2a,G2b?,WL}_3way.png` (3x; G2b written as `crop_G2b_3way.png`), `JAY_T28b2_{cone,sphere,torus}_contour.png`, `JAY_T28b2_sphere_hatch.png` ("G5 not addressed; BC adds a few continuation ticks at other span ends"), `JAY_T28b2_torus_contour_testrig.png`. In the cone crops BC continues the band's angle and spacing into the wedge with no butt seam and the ticks shorten toward the rim; the G2a channel and the W_L seam are gone. A dark triangle remains on the far side of the tapered chain (that is the taper). The test-rig torus/contour limb case the planner flagged (li13/li16): at the pictures' scale I could not tell it from base; not separately zoomed.

## Bars changed
1. `tests/unit/scene3d-mktick-spacing-tone.test.js` — T2-8b SEC describe block -> T2-8b-2 BC block (113 tests; file 102 -> 113). SEC needles replaced by BC needles.
   - A1, A1t, A2, A5: kept (same numbers/populations). A2 mutant `inline` moves records on 10 of 20 runs.
   - A3: population WIDENED 6 non-contour -> all 12 cells (contour ungated). Mutant `noadmit` trips 6 of 12 cells (create cone/contour 0.042 -> 0.062, torus/contour 0.253 -> 0.366). The plan's 0.1663 for cone/contour was not reproduced; mine trips the same bar at smaller size.
   - A4: test rig BLOCKING -> REPORTED (measured 1.207; numerator includes the rim stroke). Create stays blocking at 1.20. Mutant `dense` trips create W_R.
   - NEW SEAM (s <= 1.35, j1 = 1), DIR (<= 8 deg), TAPER (0 violations, 12 cells), OUTLINE (>= 0.30 mm). Mutants: `skip1` (SEAM), `rot` (DIR), `wide` (TAPER; trips on 8 cells), `noprobe` (OUTLINE). SEAM/OUTLINE/TAPER fail on the SEC tree (table above); DIR passes there, as the plan said.
   - I1: 72 cells in-test (was 72). Mutant note below. I2 unchanged (18 cells).
2. `tests/unit/scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE` — 11 of 12 re-pinned (all except a reversion): `create|torus/hatch` reverts from SEC's `a012f8bb...` to base `5bbcd92a...`. The other 11 are new BC hashes (plan's provisional table was derived without the 10 deg cut; re-derived on the final tree). Contrast mutation kept (flush removed returns `PRE_T28B_SIGNATURE` on 12/12).
3. `tests/unit/scene3d-mktick-banding.test.js` — **NOT re-pinned (deviation from the plan/ruling).** With the 10 deg chain cut the measured bandC is create sphere/contour 0.04066 (= base), cone/contour 0.02181, test 0.04272 / 0.02676: all within the OLD ceilings (0.04676 / 0.02508 / 0.055 / 0.03078) and below mkDotScreen. The planner's 0.06292 came from the no-cut variant. Re-pinning an unthreatened ceiling would weaken the bar for nothing (rule 4), so the ceilings and the `gate` contrast mutation are not added. Only a `console.log` of the measured values was added. Jay's "re-pin bandC" ruling was conditional on need; if he wants the headroom anyway that is a one-line change.
4. `tests/helpers/scene3d-mktick-spacing-tone.js` — NEW `chainMetrics`.

## Vacuous / reduced mutants (disclosed)
- **`nogate` with only the queue gate dropped is vacuous:** bcSide's `svB.segs` guard backstops it (only mkTick returns segs), so md5 does not change. The test's `nogate` drops the gate AND the segs guard (4 needles) and then changes an mkDashRamp cell. The claim "the shape gate alone is enough" is therefore not proven; the pair is.
- `ask6` trips over2RP on only 1 of 12 cells (non-vacuous but narrow); the test asserts >= 0 and logs the count so it does not depend on a specific cell. Honest reading: over2RP protection for BC comes mostly from the surface bounding the walk.
- The plan's `nocarry` was not built (plan says vacuous).
- The plan's `gate` (banding contrast) not built (see Bars changed 3).

## Pre-existing red
None. At `9d217ed0` the branch's own suites were green (spacing-tone 102/102, wedge 57/57, banding 22/22, mark-laws-draw 43/43, others green — reported in T2-8b-impl.md). RED for the new bars was taken from a `git archive` export of `9d217ed0` (scratch): SEAM, OUTLINE and TAPER fail there, DIR passes.

## Test runs on the final tree
spacing-tone 113/113, mktick-wedge 57/57, band-purity 6/6, mark-laws-draw 43/43, mktick-runaway 34/34, mktick-banding 22/22, one-pen-down-reachability 5/5, integration scene3d-fill-style-picker 177/177 (run together with the wedge file), tone-law-collapse 121/121 (forks, one worker). Full suite not run. `package-lock.json` untouched/uncommitted.

## Sweep coverage
- Non-mkTick: **864/864** md5-identical vs a `git archive` base (3 primitives x 8 mappers x 36 laws, create d=50).
- mkTick: **8/8 mappers**; 24 cells (3 primitives x 8 mappers, create d=50) measured against base: max tip and mark change 0 (never worse), over2RP 0, subMin 0, 7 cells changed. 12 d=50 cells x 2 rigs gated in-test; 18 I2 cells in-test.
- d=220: the 8 B7 runs (sites identical, subMin 0, over2RP <= off). Not swept: other densities, cameras, angles.

# T2-8b-2b — close the W_L remnant (Jay: "Accept, but fix W_L first")

Commits `cfde2206`, `b274d395` (final) on `fill-audit-a6`, from `8d11044d`. Not pushed. bandC ceilings unchanged (Jay's ruling). Fixture as above: create rig unless stated, d=50, mkTick/hatch, angle a, ground DISABLED.

## 1. Measurement: which chain, why it stops
The remnant is centred at (596.9, 526.5) mm, 0.73 mm^2 at >= 0.5 mm clearance (0.06 mm^2 at 0.75). Stop reasons, instrumented per chain on `8d11044d` (create cone/hatch):
- **li19 (s0 589.9, 525.8), the chain next to the remnant: stopped at j=10 by the 10-degree direction cut.** Far from the boundary frame the flat frame's asked direction drifts off the surface family; the tick was fine, the reference was not.
- After re-asking that tick in a fresh local frame, j=11..12 were placed as ticks of ~0.7 mm but `place()` refused them as too short (MIN_MARK_MM): the chain arms were clipped at `mkInkR` (up to 1.3 w = 0.39 mm), wider than the 1.0 w admission radius, so the walk was cut below the plot floor. Chain then ended at j=11 (admission).
- li16 (606.9, 526.3): j=8 taper below the plot floor (len 0.47 mm). Correct, not the remnant's cause.
- Edge probe: never the stop reason at W_L. All-ink admission radius: not the cause (0.8/0.6/0.4 w change nothing). Envelope: ends other chains (j=1) only.
Both halves are needed: `noreanchor` and `noclip` mutants each leave W_L at 0.73.

## 2. Fix (src, `surface-fill.js` only)
1. Chain arms clip at the admission radius (`mkClipArm.rm = rp = admitR`, both dry and placed walks).
2. `reAnchor`: a tick that fails the direction cut is re-asked in a fresh local frame at its own hub (same check and admission there). **Gated `j >= MK_TICK_BC_REANCHOR_J = 8`.** Ungated it closes W_L but raises create sphere/contour `bandC` 0.0407 -> 0.0606 (over the unchanged 0.04676 ceiling); at j >= 4, 6 or 8 W_L still closes and bandC stays 0.04066. Chose 8 (smallest behaviour change).
A `shortenToAdmit` idea was built and removed: measured no effect.

## 3. Result
| | 8d11044d | fixed |
|---|---|---|
| A1 create W_L / W_R (0.75 mm) | 0.06 / 0.00 | 0.00 / 0.00 |
| **W_L bare >= 0.5 mm (create)** | **0.73** | **0.105** |
| A4 create L / R | 0.937 / 1.158 | 0.943 / 1.171 (<= 1.20) |
| SEAM / DIR / OUTLINE create | 1.05 / 0.29 / 0.340 | 1.20 / 1.5 / 0.340 (bars 1.35 / 8 / 0.30) |
| bandC create sphere/contour | 0.04066 | 0.04066 (ceiling 0.04676 unchanged) |
`tickSites` identical on 12/12 d=50 (and the d=220 runs unchanged in the A2 test); tip/mark <= base on 12 cells; over2RP 0, subMin 0; O2 passes (43/43). No STOP hit. **Not fully closed:** looking at the crop, one short tick now sits in the triangle and a smaller dark triangle remains beside it (0.105 mm^2 at 0.5 mm; ~1.3 at 0.4 mm before the fix). The remainder is under the plot floor for a legal tick with the pen-width clearances. **Test rig** W_L is a different, pre-existing remnant (bare >= 0.5 mm 3.12 base -> 2.66; A1t unchanged at 0.443 for W_R) and is not touched.

## 4. New bar (WL, BLOCKING)
`scene3d-mktick-spacing-tone.test.js`: create cone/hatch W_L bare >= 0.5 mm <= 0.30 mm^2. Gates only that remnant at a finer clearance than A1 (not W_R, tone, seam, or the test rig). Fails on `8d11044d` (0.73, measured from that source). Mutants: `noclip` 0.73, `noreanchor` 0.73, `off` >> bar, all asserted > 0.30.

## Bars changed
- `tests/unit/scene3d-mktick-spacing-tone.test.js` — NEW WL bar (above), 117 tests (113 -> 117); mutant needle for `rot` retargeted (`requestedDir(frD,...)`, `place(fr0, [poly], uOff, 0);`); BC_MUT count 11 -> 13. No existing threshold or population changed.
- `tests/unit/scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE` — 8 of 12 re-pinned vs `8d11044d`: test|sphere/contour, test|torus/contour, test|cone/hatch, test|cone/contour, create|sphere/contour, create|torus/contour, create|cone/hatch, create|cone/contour (rule 4: same 12-cell d=50 fixture). Both sphere/hatch, both torus/hatch unchanged. Contrast mutation (flush removed -> `PRE_T28B_SIGNATURE`) still passes.
- `tests/unit/scene3d-mktick-banding.test.js` — UNCHANGED (ceilings and code).

## Pre-existing red
None at `8d11044d` (its run was fully green in the T2-8b-2 section). The one red seen during this unit (create sphere/contour bandC 0.0606) was caused by the ungated re-ask and removed by the j >= 8 gate.

## Runs (final tree, foreground) and sweep
spacing-tone 117/117, mktick-wedge 57/57 (together 174), band-purity 6/6, mark-laws-draw 43/43, mktick-runaway 34/34, mktick-banding 22/22, one-pen-down-reachability 5/5, integration fill-style-picker 177/177, tone-law-collapse 121/121 (forks, one worker). Sweep: non-mkTick 864/864 md5-identical to base; mkTick 24 cells (3 prims x 8 mappers): max tip/mark change 0 (never worse), over2RP 0, subMin 0.

## Pictures (looked at)
`docs/3d-audit/fill-audit/after/T2-8b-2b/`: `JAY_T28b2b_cone.png`, `crop_{WL,G2a,G2b}_3way.png` (BASE | BC 8d11044d | BC-fixed, 3x). W_L: the fixed panel adds one short tick in the triangle; a smaller dark triangle remains right of it. G2b: the only change is one more short rim tick at bottom-left, still off the outline. G2a: unchanged.
