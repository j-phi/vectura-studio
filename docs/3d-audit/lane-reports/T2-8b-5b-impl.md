# T2-8b-5b — rim-strip: keep for cone, fix torus (Jay's ruling)

Worktree `.claude/worktrees/fill-audit-a9`, branch `3d-scene/fill-audit-a9`, base T2-8b-5 prototype `94d97597` on `e609338c` (v1.4.5). Commits: `e475dd5c` (source + 12 wedge goldens), `1562009a` (spacing-tone bars). Not pushed. `package-lock.json` libc-only diff not committed.

Fixture on every number: `algo.generate(params,null,null,BOUNDS)` 1200x1000 m=20 pen 0.3, mkTick, hatch, fillAngle 45, d=50, `DEFAULT_CAMERA`, one SUN az135/el45, **ground and backdrop DISABLED**, object ink only. Rig named per number: `create` = PRIMITIVE_CREATE_DEFAULTS over PRIMITIVE_PARAM_DEFAULTS (Jay's screenshots); `test` = PRIMITIVE_PARAM_DEFAULTS only (= `--rig addLayer` shots).

## 1. Torus mechanism (measured, create torus/hatch, d=50)
Three separate causes, each with numbers:
1. **JOGS = wrong start point.** `extendTick` started its end walk at a nominal one-jump hub `T.at(fr,uO,mid)`. The tick itself was drawn from the walk's TRUE hub (`walkPoly`: stepped walk `fr0 -> hub`). On a curved ruling these differ. Lateral distance from the tick's last point to the walk's path: torus 0.02-0.13 mm (up to 0.40 near the tube silhouette); cone about 0.005. The appended part therefore started off the tick's line: join bend 50-81 deg, deviation up to 0.43 mm on torus; cone bend <= 20 deg, deviation <= 0.13. Fix: `walkPoly` publishes its true hub (`mkLastHub`), `extendTick` walks from it. After the fix, torus join bend <= 8 deg, deviation <= 0.05.
2. **DENSE BLOCK = rim-to-rim ticks.** Torus ticks are tone-short (walked length = tone length, `half` = `len`): 2.2-3.4 mm of a 4.4 mm tube. T2-8b-5 grew them to the 4.4 mm length cap by extending BOTH ends (create torus/hatch: 20 ticks gain >= 0.1 mm at both ends, total growth up to +100 %). That removed the bare margin on both sides along 25+ ticks. Cone ticks extend at ONE end only (0 of 49 ticks on both ends, both rigs).
3. **Left-half density** is cause 2; no continuation chain is duplicated (path count 313 = 313 vs v1.4.5 on create torus/hatch).
Ruled out: seam crossing (none), another row's band (extension is stopped by `clear()` with reason I; counted as no extension), duplicated chains.

## 2. The rule (general, no primitive test)
In `extendTick`, `src/core/scene3d/surface-fill.js`:
- **TRUE HUB.** Start from the tick's own hub.
- **STRAIGHT** (`MK_TICK_RIM_DEV_PEN` = 0.5 pen = 0.15 mm). Appended points are cut at the first one that leaves the straight continuation of the tick's last 0.4 mm by more than that.
- **GROW** (`MK_TICK_RIM_GROW` = 0.6). Total growth <= 0.6 x the tick's own length; shared between the two ends in proportion to their wants; clamped, not dropped, so neighbours do not step. 0.6 is above the measured cone maximum 0.54 (test rig).
- **NEVER RIM TO RIM.** A tick that gains >= 0.1 mm at both ends keeps both ends.
- Unchanged from T2-8b-5: stop only when the outline stops the walk (reason E), never past an ink-stopped end (c_B = 0.48 mm), room <= 2.0 mm and <= 2.05 row pitch.
Four `_OFF` constants exist only for the mutation tests.

## 3. Results (vs e609338c and T2-8b-5)
Bare area >= 0.5 mm, whole image, d=50 (mm^2): v1.4.5 | T2-8b-5 | NEW
- create cone/hatch 27.67 | 27.26 | **27.26**; test cone/hatch 27.15 | 25.62 | **25.62**
- create torus/hatch 487.05 | 482.46 | **485.66** (fewer extended ticks: 17 vs 36 on create torus/hatch); create sphere/hatch 61.04 | 60.48 | 60.60
- **Test-rig cone/hatch W_L bare >= 0.5 mm: 2.658 | 1.89 | 1.89 mm^2** (window [588,519,599,528], d=50, ground disabled). Bar <= 1.90; fails on e609338c.
- create cone/hatch W_L 0, G2a unchanged, G1-base 0.018 -> 0 (as T2-8b-5). The cone result is **identical** to T2-8b-5 (same whole-image area, same crops).
- Extended-tick geometry vs e609338c (max over create/test x torus/cone hatch): deviation of appended points from straight 0.129 mm (bar 0.15; prototype state 0.431), growth 0.60 (prototype state 1.39), ticks extended at both ends 0 (prototype state 20).
Tests changed ticks: create torus/hatch 17, test torus/hatch 74, create cone/hatch 26, test cone/hatch 23.

## Bars changed
- `tests/unit/scene3d-mktick-wedge.test.js` EXPECTED_SIGNATURE — 12 goldens re-pinned (new shas from `pathSignature(paths,4)`), all 12 cells: mechanism = rim-strip extension. Old values equal the e609338c shas (checked).
- same file, `CHANGED_BY_BCE` — 7 cells -> all 12; the "unchanged cells equal PRE_T28B" assertion therefore no longer applies to any cell (population change, disclosed).
- same file, CONTRAST MUTATION — now removes BOTH flushes (`mkExtQ` and `mkEndQ`); it returns the pre-T2-8b hash on all 12. (With only `mkEndQ` removed it fails: that is the non-vacuity proof.)
- `tests/unit/scene3d-mktick-spacing-tone.test.js` REC needle — `pts` now keeps the live run and is copied after `generate()` (final geometry). Population change: the TAPER bar's boundary tick length was the pre-extension length; it is now the final drawn length. Without this, `test torus/contour li19` read 1 violation (chain tick 0.818 vs recorded 0.714 boundary, but the boundary was extended to 0.818). TAPER stays 0 violations on 12/12 and its `wide` mutation still trips.
- same file, APEX (c) — "apex ticks >= 3" -> ">= 2 over 12 cells and >= 1 on cone/hatch of each rig" (now 2: 0.525 test, 0.326 create).
- same file, APEX `noapex` mutation of W_L — **retired as vacuous**: W_L is 0 without any apex tick (rim-strip closes it). Replaced by NEW (a2): create cone/hatch whole-object bare >= 0.5 mm <= 27.30 (ship 27.26, noapex 27.44) with mutation noapex > 27.30 and 0 apex ticks on 12 cells. APEX (a) W_L <= 0.05 stays as a regression bar (no longer mutation-backed).
- NEW describe RIMSTRIP (BLOCKING), 4 cells (torus/hatch, cone/hatch x both rigs), ticks matched to the `noext` render:
  - non-vacuity: >= 20 changed ticks;
  - (i) STRAIGHT: max deviation <= 0.15 mm. Gates the appended-part straightness only. Mutations: `nostraight` (cut removed alone) -> 0.262 on test torus/hatch; `nohubstr` (prototype state) -> 0.431 on create torus/hatch. Note: with the true hub in place the cut alone still binds on test torus.
  - (ii) GROW: <= 0.62; mutation `nogrow` -> 1.39. Gates the growth clause only.
  - (iii) BOTH: 0 ticks extended at both ends; mutation `noboth` -> 20 on create torus/hatch.
  - (iv) RIM-STRIP: test cone/hatch W_L bare >= 0.5 mm <= 1.90 (measured 1.89); mutation `noext` (== e609338c output) -> 2.66, fails.
  Not gated: tone beyond growth, W_R, the 8 other cells' extension amount.
- `beforeAll` timeout 550000 -> 1800000 ms (5 more small mutant kinds; 550000 timed out under machine load 50).
- `BC_MUT` key count 20 -> 25 (assertion updated).
- No bar loosened: OUTLINE >= 0.30, bandC ceilings, O2, contact (tip/mark <= off + 0.005/0.01), A2, SP5, B5, T2, T3, T4 unchanged and passing.

## Pre-existing red
None at e609338c (green, v1.4.5). The reds T2-8b-5 left (12 goldens, contrast mutation, 2 APEX tests) are resolved above. One red appeared and was resolved in this unit: TAPER 1 violation (REC instrument, above). Not reproduced at base: base passes TAPER.

## Runs (foreground, final tree)
spacing-tone 149/149; mktick-wedge 57/57; band-purity 6/6; mark-laws-draw 43/43; mktick-runaway 34/34; mktick-banding 22/22; one-pen-down-reachability 5/5; integration fill-style-picker 177/177; tone-law-collapse 121/121 (vitest 4 has no `singleFork`; used `--pool=forks --maxWorkers=1 --no-file-parallelism`).

## Sweep fractions (rule 2)
- Mappers: the 12 pinned cells cover hatch + contour = 2 of 8 mappers x 3 of N primitives; the extension runs only for `tick` shape (mkTick), so the other 6 mappers x 3 primitives are covered by I2 (create d=50, REPORTED, passes) and by the isolation sweep below.
- Isolation sweep (create rig, d=50, ground disabled): 3 primitives (sphere, torus, cone) x 8 mappers x every non-mkTick production tone law, md5 of paths, e609338c vs NEW: **864/864 identical** (36 non-mkTick laws x 8 mappers x 3 primitives = 864 of the roster's 37 laws x 8 mappers x 3 primitives = 888; the 24 excluded cells are mkTick, which is the changed law). Primitives covered: 3 of 12 (sphere, torus, cone).
- Tone laws: `SCENE3D_TONE_LAWS.PRODUCTION`, mkTick is the only law with `shape === 'tick'`.

## Pictures (looked at) — `docs/3d-audit/fill-audit/after/T2-8b-5b/`, panels v1.4.5 e609338c | T2-8b-5 94d97597 | NEW
- `crop_create_torus_bottom.png`: v1.4.5 hangs half-length ticks with a bare margin; T2-8b-5 turns the run into a dense rim-to-rim block with jogged lower tips; NEW keeps the margin, extends only a few one-sided rim ticks, all straight, no steps.
- `JAY_T28b5b_create_torus_hatch.png`: the whole bottom band is back to v1.4.5 density; the T2-8b-5 block and the jagged left silhouette ticks are gone.
- `crop_create_WL.png`: NEW equals T2-8b-5: the short chain ticks at the wedge become band ticks that reach the rim.
- `crop_create_G2a.png`: NEW equals T2-8b-5: lower ends reach the rim, wedge gap smaller.
- `crop_create_G1base.png`: NEW equals T2-8b-5: the four small chain ticks are replaced by longer ticks to the outline.
- `JAY_T28b5b_create_cone.png`: NEW equals T2-8b-5: bottom and right-flank ticks reach the rim evenly.
- `crop_testrig_WL.png`: NEW equals T2-8b-5: strip closed on the right, a narrower dark wedge remains between two bands at left (1.89 mm^2).
- `JAY_T28b5b_testrig_cone.png`: NEW equals T2-8b-5: outer-flank ticks longer, otherwise the same as v1.4.5.
- `JAY_T28b5b_create_sphere_hatch.png`: limb ticks extended slightly (60.60 vs 60.48 bare), lit upper right untouched, no visible jogs.
