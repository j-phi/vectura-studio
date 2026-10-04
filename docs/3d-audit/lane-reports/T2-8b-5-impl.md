# T2-8b-5 — rim-strip prototype (SHOW-ME-FIRST; nothing merges until Jay accepts)

Worktree `.claude/worktrees/fill-audit-a9`, branch `3d-scene/fill-audit-a9`, base `e609338c` (v1.4.5). Source only: `src/core/scene3d/surface-fill.js`. **Tests and goldens are NOT updated** (no re-pin without Jay's acceptance), so the suite below shows the red list the acceptance would have to settle. `package-lock.json` libc-only diff not committed.

Fixture: `algo.generate(params,null,null,BOUNDS)` 1200x1000 m=20 pen 0.3, mkTick, hatch (contour where named), fillAngle 45, d=50, `DEFAULT_CAMERA`, one SUN az135/el45, **ground and backdrop DISABLED**, object ink only. test = PRIMITIVE_PARAM_DEFAULTS only; create = + PRIMITIVE_CREATE_DEFAULTS (Jay's screenshot rig).

## What was built
A deferred, non-site pass (`mkExtQ`, flushed before `mkEndQ`) that lengthens the rim-facing end of each regular main tick (site I < 2/3) to exactly c_E = 0.6 mm from the drawn outline, by the same bisected walk BC-E uses (`bcTools`, factored out of `bcSide`; behaviour-neutral, 12-cell signatures identical to e609338c before the pass was added). Only when the OUTLINE is what stops the walk; never shortens; never past a band-stopped end; extension <= 2.0 mm and the tick stays <= 2.05 x row pitch. The walk is appended beyond the present tip (the first rebuild-from-hub version put jogs mid-tick). The site record is captured before the pass, so `tickSites`/hook records are byte-identical (A2 passes). A per-end 12-probe ring prefilter keeps the cost affordable at d=220; the walk has the same per-arm step ceiling `MK_MAX_WALK_STEPS` the main walk has (a fine pen otherwise grew a path past the 200-point test bound).

## 2. Measurements (12 cells, both rigs, vs e609338c)
| cell | ticks changed (of) | bare >= 0.5 mm whole image (before -> after) |
|---|---|---|
| test sphere/hatch | 21 (432) | 42.38 -> 41.80 |
| test sphere/contour | 31 (443) | 52.30 -> 51.57 |
| test torus/hatch | 63 (485) | 90.36 -> 87.47 |
| test torus/contour | 27 (334) | 90.93 -> 88.61 |
| **test cone/hatch** | 28 (284) | 27.15 -> 25.62; **W_L 2.66 -> 1.89** |
| test cone/contour | 3 (324) | 19.12 -> 19.12 |
| create sphere/hatch | 50 (692) | 61.04 -> 60.48 |
| create sphere/contour | 49 (692) | 75.58 -> 75.42 |
| create torus/hatch | 36 (199) | 487.05 -> 482.46 |
| create torus/contour | 23 (160) | 405.31 -> 403.70 |
| **create cone/hatch** | 33 (328) | 27.67 -> 27.26; W_L 0 -> 0 |
| create cone/contour | 40 (369) | 26.30 -> 25.98 |
**The create rig DOES change on every cell** (23-50 ticks), not only the test rig; pixel diffs against v1.4.5 span the whole cone, sphere and torus.

- **test W_L 2.66 -> 1.89 mm^2** (simulated 0.61 was optimistic: it ignored neighbour ink and the length cap). The remaining 1.89 is (a) four ticks already at the 2.05 x row-pitch length cap (room 0.6 mm, `C`), and (b) ticks whose rim end is stopped by neighbouring-band ink within c_B = 0.48 mm (reason `I`): the wedge between two bands, not the rim. Neither can be closed by extending ticks.
- **FILL** create cone/hatch 0.27 -> 0.0075; test cone/hatch 3.56 -> **1.93** (still > 0.50, so it is not promoted to blocking).
- **ENVELOPE-E (continuation chains, the existing bar):** create range 0.041 (min 0.606), test 0.063 (min 0.581), both <= 0.10 and >= 0.30. **Over ALL outline-stopped ends (regular + continuation), crude measure** (path ends within 1.2 mm of the drawn outline and nearer to it than to other ink; ends at >= 0.3 mm): the range stays wide (0.50-0.83 mm) on every cell because many ends are not extension candidates (lit side, clipped, length-capped, contact-limited); the count of ends within 0.6 +- 0.05 mm rises (create cone/hatch 14 -> 24 of 64, test cone/hatch 7 -> 15 of 43). So "evenly offset" is improved, not achieved, across the regular ticks.

## 3. Binding bars on the final tree
Pass: `tickSites`/hook records identical (A2, 20 runs), B5 nonMono = off on the 12 cells, contact: tip/mark <= off + 0.005/0.01 on the 12 cells (largest rise create torus/contour tip +0.003 vs off; raw I2 max +0.0031), over2RP 0, subMin (apex-exempt) 0, SEAM/DIR/TAPER/NO-ORPHAN/HIGHLIGHT, OUTLINE (continuation min 0.606 / 0.581), A1/A1t, WL, ENVELOPE, FILL (create), CRUMBS, A4 create 0.974 / 1.185 (<= 1.20; test reported 0.907 / 1.252), bandC 0.04248 / 0.02676 / 0.04066 / **0.02249** vs unchanged ceilings 0.055 / 0.03078 / 0.04676 / 0.02508 (create cone/contour rose from 0.02181 but stays under), O2 and the perf/fine-pen bounds (mark-laws-draw 43/43), 864/864 non-mkTick md5-identical to base, tone-law-collapse 121/121, SP5.
**Break (all mechanical consequences, listed not re-pinned):**
1. `scene3d-mktick-wedge`: all 12 goldens differ (every cell changes) and the CONTRAST MUTATION (flush removed -> old hash) no longer returns the old hash, because the new `mkExtQ` flush also has to be removed in that mutant. 13 failed / 44 passed.
2. `spacing-tone` APEX bar, two tests: (c) "apex ticks exist (>= 3)" reads 2 (0.525, 0.326) — the extended boundary ticks close part of what the apex ticks used to fill; and `noapex` mutation of the W_L gap is now vacuous (W_L is 0 without any apex tick). Everything else in that file passes (136/138).
No binding bar was weakened to get here.

## Bars changed
None applied. If Jay accepts: re-pin the 12 wedge goldens (+ add the ext flush to the contrast mutant), retire/rewrite the APEX (c) count and `noapex` W_L mutation (the apex rule still stands for the two remaining apex ticks), add a rim-strip bar (e.g. test cone/hatch W_L <= 2.0 mm^2, mutation: ext flush removed) and an "outline-stopped regular ends" envelope bar once a clean measure exists. Not promoted: test FILL 1.93 > 0.50.

## Pre-existing red
None at e609338c (v1.4.5 green on GitHub). The reds above are caused by this prototype.

## Runs (final tree, foreground)
spacing-tone 136/138 (2 APEX tests, above), mktick-wedge 44/57 (13 mechanical), band-purity 6/6, mark-laws-draw 43/43, mktick-runaway 34/34, mktick-banding 22/22, one-pen-down-reachability 5/5, silhouette-contiguity 6/6, fill-ruling-continuity 10 + 1 skipped (pre-existing), integration fill-style-picker 177/177, scene-xray-needs-fill 17/17, tone-law-collapse 121/121. Sweep: 864/864 non-mkTick md5-identical; mkTick 24 cells: max tip rise vs base 0.0031, mark 0, over2RP 0, 9 cells changed. Render time create cone/hatch about 2x (about 0.6 s vs 0.3 s in the sweep harness; d=220 within the 2.5 s ceiling).

## Pictures (looked at) — `docs/3d-audit/fill-audit/after/T2-8b-5/`, v1.4.5 | NEW
- `crop_testrig_WL.png`: the right-hand part of the strip is closed — ticks now run down to the rim; a narrower dark wedge remains at left between two bands.
- `JAY_T28b5_testrig_cone.png`: whole test cone — outer-flank and bottom ticks are visibly longer and reach near the outline; otherwise the same.
- `crop_create_WL.png`: the small continuation ticks at the wedge are replaced by regular ticks that reach the rim; reads cleaner, one fewer tick.
- `crop_create_G2a.png`: the lower tick ends now reach the rim; the wedge gap is smaller.
- `crop_create_G1base.png`: the four small chain ticks are replaced by longer band ticks reaching the outline.
- `JAY_T28b5_create_cone.png`: create cone — bottom and right-flank ticks lengthened to the outline everywhere; this is the visible change Jay will see on his rig.
- `JAY_T28b5_create_sphere_hatch.png`: sphere — limb ticks on left and bottom-right extended to the outline; the lit upper right is untouched.
- `JAY_T28b5_create_torus_hatch.png` and `crop_create_torus_bottom.png`: torus — the lower band's ticks now run across the whole band to both outlines (denser block); **defect:** the lower tips are stepped (small jogs of a few tenths of a mm between neighbours) and a few ticks bend near the join. This is the least acceptable picture.
