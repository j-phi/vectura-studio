# T2-8b-5c — fix the rim-edge step; no angles/hooks (Jay: "Fix the step first"; "the lines in the spheres must not have angles/hooks")

Worktree `.claude/worktrees/fill-audit-a9`, branch `3d-scene/fill-audit-a9`, from `1562009a` (5b). Not pushed. `package-lock.json` libc-only diff not committed.
Fixture on every number: `algo.generate(params,null,null,BOUNDS)` 1200x1000 m=20 pen 0.3, mkTick, hatch (contour where named), fillAngle 45, d=50 (d=220 for the one timing), `DEFAULT_CAMERA`, one SUN az135/el45, **ground and backdrop DISABLED**, object ink only. Rig named per number: `create` = PRIMITIVE_CREATE_DEFAULTS over PRIMITIVE_PARAM_DEFAULTS (Jay's screenshots); `test` = PRIMITIVE_PARAM_DEFAULTS only (= `--rig addLayer` shots).

## 1. Why ~5 ticks reached the rim and their neighbours did not (create torus/hatch, per tick)
Row li 6, dn edge (bottom rim). `gain` = how far the end walk can still grow before c_E = 0.6 mm from the outline.
- x 593.8-595.9 (the 5 ticks of the picture): `gainDn` 1.21, 1.26, 1.30, 1.34 (1.37); `gainUp` -0.13 to -0.26 (up end already past c_E). One-sided, so the 5b "never rim to rim" test (both gains >= 0.1 -> skip) let them through. Extended by the full 1.2-1.3 mm.
- x 596.2-605.2 (neighbours on one side): `gainUp` 0.70-1.78 AND `gainDn` 0.53-1.24, both >= 0.1 -> the hard "both" rule skipped all 14 ticks.
- x <= 593.3 (neighbours on the other side): `nearDn` false, so never walked. The gap there is 1.37 -> 1.94 mm and grows 0.04 mm per tick; with the prefilter switched off the same ticks are ordinary candidates (`dn E`, 1.37, 1.43 ... 1.94). Cause: the 12-probe ring at radius 3.4 mm lands on another front-facing sheet of the tube (the linearised frame wraps `b`), so the "no outline within reach" prefilter fired at a gap of about 1.4 mm, not at the 2.0 mm cap.
Three rules disagreed along one edge: the hard both-ends skip, the prefilter, and the one-sided pass. It was not the 0.6 x length cap (growth 0.46-0.60 there) and not the 0.15 mm straightness tolerance (deviation <= 0.05).

## 2. Fix (general; no primitive test) — `src/core/scene3d/surface-fill.js`
- **Two-phase extension.** `planTick` computes each tick's candidate (nothing drawn); `runExtensions()` runs a neighbour-coherence pass over each row in site order; then each plan is applied. Geometry otherwise as 5b (true hub, straight cut, growth <= 0.6 x length).
- **Continuous both-ends factor** replaces the hard skip: extension x (1 - min/max of the two gains). Equal gains -> 0, one-sided -> 1.
- **Taper** between `MK_TICK_RIM_FULL_MM` 1.6 and `MK_TICK_RIM_MAX_MM` 2.0 mm, so the edge does not end at the reach cap with a jump (cone gains reach 1.6 and stay full).
- **Reach probe**: a 0.75 mm-step surface walk along the tick plus one 8-probe ring replace the 12-probe ring.
- **STRIP hold**: a run of >= 10 consecutive candidates whose rim gap changes < 0.12 mm per tick is held back whole (a tube's parallel margin is already an evenly offset edge; extending it made the block). Measured runs: torus n 15-42, slope 0.04-0.11; cone n <= 4, slope 0.27-0.41; sphere n <= 9.
- **ISO cap**: a run of n candidates extends by at most 0.45 mm x n (a lone tick gets 0.45; a cone wedge run of 4 gets 1.8).
- **Envelope**: inside a run the extension fraction may change by at most 0.15 per tick (lower envelope, both directions).
- **NO HOOK**: the bend at the join and between appended segments is <= 8 deg (`MK_TICK_RIM_JOIN_DEG`); a bending join refuses the extension, a later bend cuts the appended part.
Published instrument: `lastMarkStats.rimExt` rows `[li, a, rowIdx, gainUp, extUp, gainDn, extDn]` (no effect on output).

## 3. Results
- **Step (added offset difference between consecutive candidate ticks, d=50, 12 cells):** max per cell 0.00-0.24 mm (test torus/hatch 0.24, create torus/hatch 0.22, sphere/contour 0.16/0.15, others <= 0.16). Mutants: no coherence 1.14 (test cone/hatch), 0.70 (test torus/hatch), 0.52 (create sphere/hatch); no coherence + no strip 0.65 (create torus/hatch). 1562009a has no `rimExt`; its picture is the reference (create torus/hatch bottom: a 1.2-1.3 mm step at x 593-596).
  Not removed, disclosed: where a candidate run ends beside a NON-candidate tick (band-stopped, or beyond the reach cap) the edge still steps. Measured on geometry (distance to the drawn outline, consecutive ticks, added over v1.4.5): create cone/hatch 1.28, create torus/hatch 1.18, test torus/hatch 1.22, create sphere/hatch 1.08. Same wedge-onset pattern Jay accepted on the cone; not gated.
- **Bare >= 0.5 mm whole image (mm^2), v1.4.5 | 5b | now:** create cone/hatch 27.67 | 27.26 | 26.38; test cone/hatch 27.15 | 25.62 | 24.23; create torus/hatch 487.05 | 485.66 | 485.73; create sphere/hatch 61.04 | 60.6 | 60.70.
- **Test-rig cone/hatch W_L bare >= 0.5 mm: 2.658 | 1.89 | 1.89** (unchanged). Create W_L 0, G1-base 0. Per-tick lengths in the W_L window are identical between 1562009a and now (create cone/hatch).
- **Hooks (internal vertex bend, every mkTick fill path), 12 cells:**
  - Extension join / appended vertices: 5b 12 ticks with a join > 8 deg, worst **15.5** (test sphere/contour), all on spheres; now **0** > 8, worst **8.0** (create sphere/contour).
  - Continuation and apex ticks: worst 9.2 deg (test torus/contour), pre-existing, unchanged.
  - **REGULAR ticks - PRE-EXISTING in v1.4.5 (e609338c), not touched here (STOP clause).** Regular ticks with a vertex bend > 30 deg: create sphere/hatch **39** of 689 (worst 134.5 deg), test sphere/hatch 19 of 432 (153.3), create sphere/contour 24 of 690 (72.8), test sphere/contour 14 of 442 (99.4), test torus/hatch 4 (74.8), test torus/contour 4 (171.7), cone/hatch 1+1 (about 35), create torus 0. Identical at e609338c, 1562009a and now. Shape: 3-vertex ticks about 1 mm long with one 80-134 deg bend at the hub, near the sphere's top pole (y about 476). Cause is in the tick pipeline: the two arms are walked independently from the true hub, the bend cap (`MK_TICK_BEND_CUT` 30 deg) compares each arm only with its own first step, never with the other arm, and the frame is near-singular at the pole. A fix (cap the hub bend, shorten or drop the shorter arm) changes regular-tick geometry on spheres: **decision for Jay**, not done.
- **Performance** (torus mkTick d=220, test rig, same machine, load about 35): v1.4.5 0.4-0.5 s | 5b 1.9 s | now 1.7 s (ceiling 2.5 s). An earlier 4-radius ring was 2.4-4.7 s and failed the perf ceiling; replaced.

## Bars changed
- `tests/unit/scene3d-mktick-wedge.test.js` EXPECTED_SIGNATURE: 12 goldens re-pinned again (mechanism: coherence + reach probe + hook cut change the extension on every cell). Contrast mutation now removes `runExtensions();` and the BC-E flush; returns the pre-T2-8b hash on 12/12.
- `tests/unit/scene3d-mktick-spacing-tone.test.js`:
  - APEX (a2) whole-object bare, create cone/hatch: <= 27.30 -> **<= 26.45** (ship 26.38, noapex 26.555 re-measured); noapex mutation moved with it, non-vacuous.
  - RIMSTRIP (i) STRAIGHT: <= 0.15 -> **<= 0.135** mm (ship max 0.127; `nostraight` alone 0.145; prototype `nohubstr` 0.431). Tightened because the new join cut makes the straightness cut nearly redundant; the margin of the `nostraight` mutant is 0.01 mm (thin, disclosed).
  - RIMSTRIP (ii) GROW <= 0.62: kept as a backstop. Its mutation `nogrow` is **RETIRED as vacuous** (growth is 0.60 with and without the cap; the coherence rules bound it first).
  - RIMSTRIP (iii) BOTH: re-defined. Was "no tick gains >= 0.1 mm at both ends" (geometry). Now on `rimExt`: for a tick that is a candidate at both ends, extUp + extDn <= max gain + 0.02; non-vacuity >= 1 such tick; `noboth` trips (excess 0.05).
  - RIM_CELLS (mutant cells): torus/hatch + cone/hatch -> + sphere/hatch + sphere/contour + torus/contour (population widened).
  - NEW RIMEDGE: STEP <= 0.35 mm on all 12 cells (measured max 0.24); mutations `nocoh` (test cone/hatch 1.14) and `nocohstrip` (create torus/hatch 0.65) trip. NEW ISO: run of n candidates extends <= 0.45 n + 0.02; `noiso` trips. Gates neighbour coherence only; not tone, not offsets v1.4.5 already had, not steps beside non-candidates.
  - NEW NOHOOK: extended-tick join and appended-vertex bend <= 8.5 deg on 5 cells x 2 rigs (5b behaviour, via `nohook`: 15.5); continuation + apex ticks <= 10 deg on 12 cells (9.2). **Regular ticks are NOT gated** (pre-existing, above).
  - `beforeAll` timeout 550000 -> 1800000 ms; `BC_MUT` key count 20 -> 29.
- No other bar changed. bandC ceilings unchanged. OUTLINE >= 0.30, O2, contact (tip/mark <= off + 0.005/0.01), A2, SP5, B5, T2, T3, T4 pass.

## Pre-existing red
None at e609338c. One transient red in this unit: `scene3d-mark-laws-draw` "torus d=220 perf ceiling" failed with a 4-radius ring (2.4-4.7 s under load 35-50); fixed (1.7 s). Regular-tick hooks above are pre-existing quality defects with no test.

## Sweep fractions (rule 2)
- Isolation: 3 primitives (sphere, torus, cone) x 8 mappers x 36 non-mkTick production tone laws = 864 cells, create rig, d=50, ground disabled, md5 of paths e609338c vs now: **864/864 identical**. Primitives 3 of 12.
- Step/hook bars: hatch and contour (2 of 8 mappers) x sphere, torus, cone (3 of 12 primitives) x 2 rigs = 12 cells. The extension runs only for mkTick; the other 6 mappers are covered by I2 (create d=50, REPORTED).

## Pictures (looked at) — `docs/3d-audit/fill-audit/after/T2-8b-5c/`, panels v1.4.5 e609338c | 5b 1562009a | NEW
- `crop_create_torus_bottom.png`: 5b has 5 ticks at the rim beside shorter neighbours (the step); NEW has no such step; a short ramp of about 5 ticks lengthens gradually, ending in the longest tick of the ramp (no isolated step); the rest reads as v1.4.5.
- `JAY_T28b5c_create_torus_hatch.png`: the bottom band is v1.4.5 again apart from the ramp; no block, no jogs.
- `JAY_T28b5c_create_cone.png`: reads as 5b (rim ends even on bottom and right flank).
- `crop_create_WL.png`: W_L identical to 5b.
- `JAY_T28b5c_create_sphere_hatch.png`: limb as 5b; no kinks visible at 1x.
- `crop_testrig_WL.png`: identical to 5b (strip closed on the right, a narrower dark wedge at left).
- `crop_create_sphere_limb.png` (3x, lower-left limb): extended limb ticks meet the silhouette straight, no hooks on any panel. The pole hooks are at the top of the sphere, not in this crop.

## Runs (foreground, final tree)
spacing-tone 156/156; mktick-wedge 57/57; band-purity 6/6; mark-laws-draw 43/43 (torus d=220 1.7 s); runaway 34/34; banding 22/22; one-pen-down-reachability 5/5; integration fill-style-picker 177/177; tone-law-collapse 121/121 (`--pool=forks --maxWorkers=1 --no-file-parallelism`). The 864/864 isolation sweep ran one source edit earlier (reach-probe cost change inside `planTick`, mkTick-only); not re-run.
