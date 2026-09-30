# T2-8b-3 — implementation report (BC-E, endpoint-envelope band continuation; replaces `bcSide`)

Branch `3d-scene/fill-audit-a6` from `b274d395`. Commits `1b08298d` (src), `2e59a16a` (tests, helper, goldens). Not pushed. No STOP condition hit. `PRE_RANK1_BANDC` untouched.

Fixture for every number: `algo.generate(params,null,null,BOUNDS)` (1200x1000, m=20, pen 0.3), mkTick, fillAngle 45, d=50 (d=220 only for the 8 B7 runs), camera `DEFAULT_CAMERA`, one SUN az135/el45, **ground and backdrop DISABLED**, object ink only. Rig: `create` = PRIMITIVE_PARAM_DEFAULTS + PRIMITIVE_CREATE_DEFAULTS; `test` = PRIMITIVE_PARAM_DEFAULTS. Machine copy: `docs/3d-audit/fill-audit/after/T2-8b-3/report.json`.

## Result (cone/hatch, final tree)
| bar | create | test | bar |
|---|---|---|---|
| A1 W_L / W_R bare >= 0.75 (mm^2) | 0 / 0 | W_R 0.443 (A1t) | <= 0.50 / <= 1.5 |
| WL bare >= 0.5 | 0.098 | (2.66 pre-existing test-rig remnant, not gated) | <= 0.30 |
| ENVELOPE-E: outline-class ends, n / min / range (mm) | 22 / 0.606 / 0.041 | 16 / 0.609 / 0.035 | range <= 0.10, min >= 0.30 |
| ENVELOPE-B: band-stopped ends, n / min / range | 9 / 0.536 / 0.014 | 3 / 0.539 / 0.001 | range <= 0.10, min >= 0.48 |
| NO-ORPHAN (12 cells) | 0 | 0 | 0 |
| FILL (create BLOCKING; test reported) | 0.27 | 3.56 | <= 0.50 |
| A4 L / R | 0.962 / 1.172 | 0.869 / 1.220 (reported) | create <= 1.20 |
| SEAM / DIR / OUTLINE | 1.056 / 0.18 deg / 0.606 | 1.003 / 0.03 / 0.609 | <= 1.35 / <= 8 / >= 0.30 |
`tickSites` + hook records identical to base on 20/20 (12 d=50, 8 d=220). Tip/mark contact never above base on 12 cells. over2RP 0, subMin 0; d=220 over2RP = base. bandC (unchanged ceilings): create sphere/contour 0.04066 (0.04676), create cone/contour 0.02181 (0.02508), test sphere/contour 0.04248 (0.055), test cone/contour 0.02676 (0.03078). O2 (`mark-laws-draw`) passes. Plan numbers reproduced (E range 0.041/0.035, B 0.014/0.001, FILL 0.27, WL 0.098); one divergence: the plan said create torus/hatch gains a chain; here it does not (7 of 12 cells change vs base, plan said 8).

## RED on `b274d395` (git archive export, same instruments)
create: ENVELOPE-E range **0.550** (min 0.340), 1 orphan (li19 j10), FILL **1.57**, 1 of 3 chains at I >= 2/3 (li7). test: ENVELOPE-E range **0.363**, FILL 3.54. ENVELOPE-B: no stop reasons on that tree, so the needle count fails (structural RED, no number faked).

## Bars changed
- `tests/unit/scene3d-mktick-spacing-tone.test.js` — "T2-8b-2 BC" block -> "T2-8b-3 BC-E" (117 -> 128 tests). NEW ENVELOPE-E/B, NO-ORPHAN (12 cells), FILL (create cone/hatch blocking, 11 reported), HIGHLIGHT (12 cells). WL mutants `noclip`/`noreanchor` -> `cfat` (that code is deleted; threshold 0.30 unchanged). A2/A3/A4/A5/SEAM/DIR/TAPER/OUTLINE/I1 needles re-targeted; no threshold changed; `BC_MUT` mutants 13 -> 18. "BC differs from off" population: 11 of 12 -> **7 of 12** (test sphere/hatch, test torus/hatch, test cone/contour, create cone/contour, create torus/hatch unchanged). Regular tag now carries k, I, P (fixture change).
- `tests/helpers/scene3d-mktick-spacing-tone.js` — `chainMetrics` boundary match `(li, a)` -> `(li, a, k)` (instrument correction: contour rulings have several spans at one arc position); adds orphans, per-end stop reason and clearances; NEW `envelopeRanges`, `holeComponents`.
- `tests/unit/scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE` — **7 of 12 re-pinned** (test sphere/contour, test torus/contour, test cone/hatch, create sphere/hatch, create sphere/contour, create torus/contour, create cone/hatch). The 5 others are byte-identical to `PRE_T28B_SIGNATURE` and now asserted `=== PRE_T28B_SIGNATURE[key]`. Contrast mutation kept (flush removed -> old hash on 12/12). Fixture is the same 12-cell d=50 set.
- `tests/unit/scene3d-mktick-banding.test.js` — UNCHANGED.

## Mutants and vacuity
Trip: `off` (A1, WL, FILL), `inline` (A2 moves records on 9 of 20 runs), `thin` (A3, 10 of 12 cells; the plan's `noadmit` also trips on 4 of 12, non-vacuous), `dense` (A4 create R 1.34), `skip1` (SEAM), `rot` (DIR 11.1 / 11.0; needs admission and continuity guard off, else the guards end the chain first), `wide` (TAPER, 4 cells), `noprobe` (OUTLINE), `nobisect` (E range 0.127 / 0.239, B 0.316 / 0.141), `gap` (NO-ORPHAN), `cfat` (WL, FILL 7.65), `nohi` (HIGHLIGHT), `nogate` (I1, gate plus segs backstop; the gate alone is backstopped, vacuous). **Vacuous / weak:** `ask6` trips over2RP on 0 of 12 cells (vacuous: the walk is bounded by the surface and the envelopes); `nocap` alone trips TAPER on only 1 cell (reported); `nocont` alone yields 1 orphan over 12 cells (reported; `gap` is the tripping mutant). NO-ORPHAN's bar equals `MK_TICK_BC_SEAM` (1.35), so the source guard enforces the bar; `gap` proves it load-bearing.

## Pre-existing red
None. `b274d395` was green per T2-8b-2b; the only reds seen this unit were the expected pin/needle failures after the swap.

## Runs (final tree, foreground)
spacing-tone 128/128, mktick-wedge 57/57, band-purity 6/6, mark-laws-draw 43/43, mktick-runaway 34/34, mktick-banding 22/22, one-pen-down-reachability 5/5, integration fill-style-picker 177/177, tone-law-collapse 121/121 (forks, one worker).
Sweep: non-mkTick **864/864** md5-identical to base (3 primitives x 8 mappers x 36 laws, create d=50); mkTick **8/8 mappers** (24 cells measured: max tip/mark change 0, over2RP 0, subMin 0, 5 cells changed; 12 d=50 cells gated in-test, 18 I2 cells reported); d=220 on the 8 B7 runs.
Render time, create cone/hatch (ms, sweep harness, second run): off 255, SHIP `b274d395` 337, NEW 352 (+4 % over SHIP, +38 % over off).

## Removed / kept
`mkClipArm.e`, `mkEdgeOK`, the `walkFrom` probe line, the `walkPoly` hub fields and `MK_TICK_BC_REANCHOR_J` are deleted (`walkPoly` is back to its pre-BC text). `mkMainDrawn` is removed (unread); `mkMainRun`/`mkLastRun` replace it. Flush line and queue gate verbatim.

## Pictures (all looked at) — `docs/3d-audit/fill-audit/after/T2-8b-3/`, panels BASE | BC 8d11044d | NEW
- `JAY_T28b3_cone.png`: NEW fills both base wedges with continuation ticks that shorten toward the rim; ends read as a line parallel to the rim; no isolated tick.
- `crop_WL_3way.png`: NEW li19 chain runs along the rim, ticks shortening smoothly to a closing sliver at the apex; the orphan is gone; a thin dark triangle still remains at the apex (0.098 mm^2 at 0.5 mm).
- `crop_G2a_3way.png`: NEW li16 chain fills the wedge; lower ends form an even offset line from the rim; a narrow dark channel remains beside the last long band ticks.
- `crop_G2b_3way.png`: the short rim ticks at bottom-left are still present in NEW (shorter, offset from the outline), i.e. the plan's expectation that they vanish as highlight did not occur: those belong to an I < 2/3 chain.
- `crop_G1base_3way.png` (mm window [580,518,588,528] estimated via the 15.5 px/mm capture scale): NEW adds three ticks (li1 chain) filling the hole BC left.
- `JAY_T28b3_cone_contour.png`: NEW equals BASE (BC's two lit-side chains removed as highlight); flank ticks as in base.
- `JAY_T28b3_sphere_contour.png`: differences from BC are minimal at this scale; limb chains shorter.
- `JAY_T28b3_torus_contour.png`: no visible orphans; limb chains look contiguous.
- `JAY_T28b3_sphere_hatch.png`: NEW adds a few continuation ticks at the lower-right rim (G5 region) that BC lacked; labelled "G5 reached by the envelope rule, not the target".
- `JAY_T28b3_torus_contour_testrig.png`: test-rig limb chains present but contiguous; at this scale I cannot tell them from BC beyond fewer stray ticks at upper left.

# T2-8b-3b — apex ticks (Jay: "W_L apex - allow smaller ticks to fill in the remaining few unintentional gaps")

Commit `ac5c98b6` on `fill-audit-a6`, from `2e59a16a`. Not pushed. bandC ceilings unchanged. Fixture as above (create/test rigs, d=50, mkTick/hatch unless a mapper is named, ground DISABLED, object ink only).

## 1. Measurement — where chains end at the apex
Instrumented every `a1 - a0 < LPF (0.69 mm)` stop on 2e59a16a, all 12 cells (5, 10, 2, 13, 4, 7 apex ends on create sphere/hatch, sphere/contour, torus/hatch, torus/contour, cone/hatch, cone/contour; 5, 5, 6, 10, 3, 4 on the test rig). The asked length at the stop ranges 0.10-0.69 mm; bare area at >= 0.5 mm in a +-2 mm window around each ranges 0 to 6.6 mm^2 (the large values are torus-hole or limb space that is not apex-related; most cone/contour and sphere ends read 0). **W_L apex (create cone/hatch): the chain ends at j=12 with a 0.50 mm tick, bare >= 0.5 mm 0.098 mm^2.**

## 2. Finding: the floor cannot go below 0.6 mm without editing another file
Reading the floor rationale in the source: `place()` drops a mark under `MIN_MARK_MM` (2 pens = 0.6 mm, "a pen-down dot"), and `scene3d.js` then drops any run under `MIN_RUN_MM = 0.6` (the emission floor). I lowered the apex floor to 1.0/1.25/1.5/1.75 pens with the `place()` gate overridden for apex ticks: the tick was placed and the render was **byte-identical** to the 2.0-pen floor, because the downstream 0.6 mm floor removed it (create cone/hatch: same signature, 330 fills). So the physical floor is 0.6 mm and **the W_L apex (0.50 mm) cannot be drawn** without lowering `MIN_RUN_MM` in `scene3d.js` (out of this unit's scope; a plotting-safety decision, sub-two-pen marks are dots). The override machinery was removed as dead.

## 3. Change (src, `surface-fill.js` only)
`MK_TICK_BC_APEX_MIN = 2.0` (pens, x penWidth = `MIN_MARK_MM` 0.6 mm): a chain tick shorter than the plot floor but at least this long is drawn ("apex tick"); if `place()` refuses it the chain ends (no silent hole). Guards unchanged: contiguity (NO-ORPHAN), taper cap, ends at c_E/c_B, admission. Measured effect: **9 apex ticks (0.62-0.69 mm) on 3 cells**: create torus/hatch +5 ticks, test torus/contour +3, create sphere/hatch +1. Bare >= 0.5 mm (whole-image interior): create torus/hatch 487.05 -> 483.08 (-3.97), test torus/contour 90.93 -> 90.22 (-0.72), create sphere/hatch 61.04 -> 60.98 (-0.06). **create cone/hatch, and therefore W_L, G2a and G1-base, are byte-identical to 2e59a16a.** Sites identical (A2), contact never above base, O2 passes.

## 4. New bar (APEX, BLOCKING)
Clause: apex ticks between `MIN_MARK_MM` and the plot floor exist (>= 4 over 12 cells, all in [0.6, 0.69)) and close bare space (create torus/hatch bare >= 0.5 mm falls >= 2.0 mm^2 vs the apex floor = plot floor; measured 3.97). NO-ORPHAN and TAPER (12 cells) keep gating contiguity and taper. Does NOT gate the W_L apex (unfillable, see 2). Mutation `apexlpf` (floor = plot floor, i.e. 2e59a16a): 0 apex ticks, reduction 0 -> fails both. **This bar therefore fails on 2e59a16a (measured 0 apex ticks), but it is about the torus and sphere cells, not W_L.**

## Bars changed
- `tests/unit/scene3d-mktick-spacing-tone.test.js` — NEW APEX bar (132 tests, was 128); mutant `apexlpf` added (mutants 18 -> 19); `rot` needle retargeted (`const placed = place(n.fr, [poly], 0, 0.2)`); "BC-E differs from off" population **7 -> 8 of 12** (create torus/hatch now changes; test sphere/hatch, test torus/hatch, test cone/contour, create cone/contour still equal off). **subMin: NO exemption was needed and none was added** (apex ticks are >= 0.6 mm by construction; A5 still reads 0 on 12/12).
- `tests/unit/scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE` — 3 re-pinned (test|torus/contour, create|sphere/hatch, create|torus/hatch; same 12-cell d=50 fixture); `CHANGED_BY_BCE` gains create|torus/hatch; the 4 unchanged cells remain asserted `=== PRE_T28B_SIGNATURE`; contrast mutation still passes.
- `tests/unit/scene3d-mktick-banding.test.js` — UNCHANGED (bandC 0.04248 / 0.02676 / 0.04066 / 0.02181 vs ceilings 0.055 / 0.03078 / 0.04676 / 0.02508).

## Pre-existing red
None at 2e59a16a.

## Runs (final tree, foreground)
spacing-tone 132/132, mktick-wedge 57/57, band-purity 6/6, mark-laws-draw 43/43, mktick-runaway 34/34, mktick-banding 22/22, one-pen-down-reachability 5/5, integration fill-style-picker 177/177, tone-law-collapse 121/121. Sweep: 864/864 non-mkTick md5-identical to base; mkTick 24 cells: max tip/mark change 0, over2RP 0, subMin 0.

## Pictures (looked at) — `docs/3d-audit/fill-audit/after/T2-8b-3b/`
- `JAY_T28b3b_cone.png` (BASE | 2e59a16a | NEW): the cone panels for 2e59a16a and NEW are pixel-identical (image diff bbox None).
- `crop_WL_3way.png`: unchanged from 2e59a16a — the chain still closes to a sliver and a thin dark triangle remains at the apex; that last gap is the 0.50 mm one.
- `crop_G2a_3way.png`, `crop_G1base_3way.png`: unchanged from 2e59a16a.
- `JAY_T28b3b_torus_hatch.png` and `crop_torus_hatch_apex_3way.png`: NEW adds a row of five short, evenly spaced ticks on the upper torus band that 2e59a16a left bare; they continue the band's spacing and stop clear of both outlines.
## Open for Jay
To fill the W_L apex, the emission floor `MIN_RUN_MM = 0.6` in `scene3d.js` (and `MIN_MARK_MM`) would have to drop to ~0.45 mm; that is a plotter-safety call, not made here.

# T2-8b-3c — apex ticks only in a CLOSING chain, exempt from the crumb filter by a run flag

Commit `9d2d3f54` on `fill-audit-a6`, from `ac5c98b6`. Not pushed. bandC ceilings unchanged. Fixture as above (create/test rigs, d=50, mkTick/hatch unless a mapper is named, ground DISABLED, object ink only).

Jay's rulings: (1) "exempt apex ticks only": apex ticks may be shorter than the 0.6 mm crumb filter down to about one pen (0.3 mm); every other stroke keeps 0.6 mm. (2) The 5 short torus/hatch ticks "read as stray dashes: drop them".

## 1. Measurement — what separates W_L (wanted) from torus/hatch (unwanted)
Logged every sub-plot-floor chain stop on all 12 cells (length, index j, boundary tick length LB, stop reason per end, I).
- **W_L (create cone/hatch li19):** j=12, len 0.50, LB 4.92, ratio 0.10, both ends stopped by a boundary (`IE`: other-row ink, outline). Also j=4 (0.57, r 0.26, `IE`) and j=9 (0.33, r 0.07, `IE`) on the same cell; test cone/hatch j=4 (0.53, r 0.11, `EE`) and j=14 (0.51, r 0.09, `IE`).
- **torus/hatch strays:** j=1..6, len 0.59-0.69, LB 0.69, **ratio 0.87-1.00**, ends unstopped (`CC` for j=1-4, `CE` for j=5-6).
Hypothesis confirmed: a tapering chain into a closing wedge vs near-constant short dashes. **Rule (all three required):** j >= 3, BOTH ends stopped by a boundary, and length <= 0.5 x the boundary tick's drawn length (and >= 1 pen). Applied to all 12 cells it admits exactly the 5 cone/hatch ticks (create 3, test 2) and refuses everything else, including the 3b ticks on create sphere/hatch (`CE`, j3) and test torus/contour (`IE` but ratio 0.82-0.95). Dropping any one clause admits strays: without `j >= 3`, sphere/contour j1/j2 ticks (`EI`, r 0.26-0.49) appear; without "both stopped" the torus ticks j5-6 appear; without the ratio, test torus/contour j3 (r 0.82) appears.

## 2. Change
- `surface-fill.js`: `MK_TICK_BC_APEX_MIN = 1.0` pen (0.3 mm), `MK_TICK_BC_APEX_J = 3`, `MK_TICK_BC_APEX_TAPER = 0.5`; an apex tick is placed with `place()`'s floor lowered to `APEX_MIN` and its run flagged `apex` (with `apexMin`, mm). `place()`'s `MIN_MARK_MM` gate is otherwise unchanged. A refused apex tick ends the chain.
- `scene3d.js`: `emitRuns` takes `opts.apexMin`; only the FRONT fill-line loop passes it, and only for a run flagged `apex === true`, so `MIN_RUN_MM` (0.6) is lowered to `min(0.6, apexMin)` for that run alone. Every other caller and stroke is unchanged.

## 3. Result
create cone/hatch W_L bare >= 0.5 mm **0.098 -> 0** (WL bar <= 0.30 still holds); create cone/hatch fills 330 -> 333, bare >= 0.5 mm (whole image) 28.09 -> 27.67; test cone/hatch fills 283 -> 285. **create/test torus/hatch: 0 apex ticks, byte-identical to the base render (create torus/hatch is back to the base hash).** create sphere/hatch and test torus/contour also revert to their 2e59a16a values (the 3b ticks there did not meet the rule). All other cells: unchanged from 2e59a16a. `tickSites` identical (20/20), contact never above base (tip 0.0646 create cone/hatch), over2RP 0. bandC 0.04248 / 0.02676 / 0.04066 / 0.02181 vs ceilings 0.055 / 0.03078 / 0.04676 / 0.02508 (unchanged).

## 4. Bars
- **APEX (BLOCKING, replaces the 3b APEX bar):** (a) create cone/hatch W_L bare >= 0.5 mm <= **0.05** (measured 0; **0.098 on both ac5c98b6 and 2e59a16a, so it fails on both**); (b) torus/hatch (create + test) has 0 apex ticks; (c) >= 3 apex ticks over the 12 cells, each 0.3 <= len < 0.69 mm (measured 5: 0.525, 0.506, 0.574, 0.326, 0.504). Mutants: `noapex` (W_L 0.098 > 0.05); `apexnorule` (closing-wedge rule removed: 10 apex ticks on torus/hatch).
- **CRUMBS (BLOCKING, NEW):** non-apex fills under 2 pens = 0 on the 12 cells; and on the 72-cell roster (3 mark laws + 6 non-mark laws x 8 mappers, cone create) the count equals base (0). Mutant `noflag` (scene3d.js: every run may go to 0.3 mm) yields **17** crumbs on that roster. The full 864-cell non-mkTick roster is md5-identical to base (out of tree).
- Gates: APEX = closing-wedge admission and torus exclusion, not the crumb filter; CRUMBS = exemption scope only, not apex length/placement.

## Bars changed
- `tests/unit/scene3d-mktick-spacing-tone.test.js` — 3b APEX bar (>= 4 apex ticks in [0.6, 0.69); create torus/hatch bare falls >= 2.0) **RETIRED** (its premise, torus apex ticks, is now unwanted) and replaced by the APEX bar above; NEW CRUMBS bar; mutants 19 -> 20 (`apexlpf` -> `noapex`, +`apexnorule`, +`noflag`); 135 tests (was 132). **A5 subMin population change:** `sub` now EXEMPTS apex runs (identified by the run flag via the record needle); `subRaw` counts all fills; the exemption is exercised (create cone/hatch subRaw 3, sub 0). The same exemption is applied to I2's subMin. This is the only widening; it is scoped to flagged apex runs and the CRUMBS mutant `noflag` proves other crumbs are still caught. "BC-E differs from off" population 8 -> 7 of 12.
- `tests/unit/scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE` — 5 re-pinned vs ac5c98b6: create|cone/hatch and test|cone/hatch (new apex ticks); create|sphere/hatch, create|torus/hatch and test|torus/contour revert. Same 12-cell d=50 fixture; the 5 cells unchanged from base are asserted `=== PRE_T28B_SIGNATURE`; contrast mutation passes.
- `scene3d-mktick-banding.test.js` — UNCHANGED.
- `src/core/algorithms/scene3d.js` — `emitRuns` floor is `min(MIN_RUN_MM, opts.apexMin)` only when an apex-flagged run passes `apexMin`.

## Pre-existing red
None at ac5c98b6. (`scene3d-fill-ruling-continuity` reports 1 skipped test on the b3/2e59a16a export as well: pre-existing.)

## Runs (final tree, foreground)
spacing-tone 135/135, mktick-wedge 57/57, band-purity 6/6, mark-laws-draw 43/43, mktick-runaway 34/34, mktick-banding 22/22, one-pen-down-reachability 5/5, integration fill-style-picker 177/177, tone-law-collapse 121/121; MIN_RUN_MM tests: scene3d-silhouette-contiguity 6/6, scene3d-fill-ruling-continuity 10 passed + 1 skipped (pre-existing), integration scene-xray-needs-fill 17/17. Sweep: 864/864 non-mkTick md5-identical to base; mkTick 24 cells: max tip/mark change 0, over2RP 0 (raw subMin 3 = the exempted apex runs).
Not verified: the engine/export stages downstream of `generate` (path optimisation, export) were not separately checked for their own short-path filters; the ticks do appear in the real-browser capture below.

## Pictures (looked at, real browser via `scene3d-capture.js`) — `docs/3d-audit/fill-audit/after/T2-8b-3c/`, BASE | 2e59a16a | NEW
- `crop_WL_3way.png`: NEW adds one small tick at the end of the li19 chain, closing the wedge to a thin sliver; no orphan.
- `crop_G2a_3way.png`: unchanged from 2e59a16a (the li16 chain there is already closed).
- `crop_G1base_3way.png`: NEW extends the left-edge chain by two smaller ticks (a shrinking taper) toward the outline.
- `JAY_T28b3c_cone.png`: NEW shows a tapering row of small ticks along the base rim at lower right (the li16 chain) that 2e59a16a stopped short of; everything else identical.
- `JAY_T28b3c_torus.png` and `crop_torus_apex_3way.png`: NEW is pixel-identical to 2e59a16a (image diff None): the strays are gone.
