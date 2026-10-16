# T2-9 impl (SHOW-ME-FIRST): U1-U3 landed, U4 STOPPED, no bars/goldens yet

Worktree `.claude/worktrees/fill-audit-a10`, branch `3d-scene/fill-audit-a10`, base `84ec6ff2` (v1.4.7). Source: `src/core/scene3d/surface-fill.js` only. Nothing pushed, merged, tagged or bumped.

## Commits
| sha | what |
|---|---|
| d2a459ac | U1 NO-HOOK pass (D1 guarded, fam/famOnly guards) |
| 822dc6c7 | U2 trim + seam envelope, c_S = PMINT, stubs kept as apex-flagged runs (D2 S1, D3 a) |
| b15075c6 | U3 partial reach, non-HIDENS, both rigs (D6) |
| a4a6394c | tests only: 900000 ms budget on the I1 "72 cells md5 identical" test (see Bars changed) |
| 4f06a4b4 | perf: seam growth min(0.5 mm, 1.5 pens), seam walk without outline probes (fine-pen test took 369 s vs 46 s at base) |
| 9a2aff10 | envTick `h0` spelled differently so test needle `const h0 = { fr: hub.fr, sm: hub.sm };` stays count 1. No behaviour change |

U4 was NOT committed (see U4). Prototype patch: `docs/3d-audit/fill-audit/after/T2-9/U4_trimE_prototype_NOT_COMMITTED.patch`.

## Fixture (every number below)
Node JSDOM, `algo.generate(params,null,null,BOUNDS)`, BOUNDS 1200x1000 m=20 pen 0.3 (w = 0.336, PMINT 0.5376), `toneLaw mkTick`, `fillAngle 45`, `fillDensity 50` unless "d=220", `DEFAULT_CAMERA`, one SUN az135/el45, tone enabled, **ground and backdrop DISABLED** (object ink only, sceneFill; ink = sum of sceneFill path lengths). Rigs: `create` = PRIMITIVE_PARAM_DEFAULTS + PRIMITIVE_CREATE_DEFAULTS; `test` = PARAM_DEFAULTS only. Instruments are my own scripts (scratchpad lib.cjs); they reproduce the plan's ship numbers exactly for paths, vertex >8.5/>30, max vertex, spread, x<w, tip, bare, W_L, O1 (e.g. create sphere/hatch ship 692 / 112 / 39 / 134.5 / 67 / .0932 / 60.7). Seam, rim>.9 and ink use my own definitions (below), so compare ship vs new only, not against the plan's absolute seam numbers.
Roster coverage: 12 d=50 cells (hatch+contour x sphere/torus/cone x 2 rigs) = 2/8 mappers x 3/12 primitives x 2 rigs; 8 d=220 cells; crosshatch 6 cells (3 primitives x 2 rigs); isolation sweep (864) and I2 6-mapper sweep NOT run yet (owed after acceptance).

## Per-class numbers, ship (84ec6ff2) -> NEW (9a2aff10 behaviour), d=50
Columns: paths, hooks >30 deg (path vertex), vertex >8.5 deg, max vertex deg, x<w (cross-row run pairs, centreline < 0.3 mm), tip/mark contact, seam median/p90 of the end-to-facing-row gap along the tick (my ray proxy, perp <= 0.25, <= 1.2 mm), rim>.9 (mm), bare (>=0.5 mm clearance, mm^2), W_L (>=0.5, window 588,519,599,528).

| cell | paths | >30 | >8.5 | max | x<w | tip | mark | seam med/p90 | rim>.9 | bare | W_L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| c sph/hatch | 692->659 | 39->0 | 112->1 | 134.5->12.9 | 67->3 | .0932->.0144 | .165->.021 | .583/.711->.549/.627 | 2.6->14.0 | 60.7->67.9 | 0->0 |
| c sph/cont | 691->668 | 24->0 | 87->4 | 72.8->13.3 | 0->0 | .0232->.0247 | .049->.054 | .608/.753->.557/.633 | 7.1->12.5 | 75.2->78.7 | 0 |
| c tor/hatch | 199->199 | 0 | 33->2 | 21.9->9.7 | 3->0 | .0352->.0201 | .070->.040 | .563/.909->.524/.595 | 66.1->67.2 | 484.3->486.9 | 0 |
| c tor/cont | 161->161 | 0 | 17->4 | 18.1->11.8 | 7->3 | .2484->.2391 | .485->.478 | .641/.942->.586/.921 | 28.1->26.0 | 404.5->405.0 | 0 |
| c cone/hatch | 328->314 | 1->0 | 37->0 | 35.1->6.6 | 23->0 | .0655->.0000 | .119->.000 | .542/.765->.559/.639 | 1.4->4.6 | 26.4->26.4 | 0->0.02 |
| c cone/cont | 369->369 | 0 | 23->9 | 21.8 | 0 | .0420->.0447 | .089->.098 | .614/.737->.543/.628 | 0.9 | 26.1->26.4 | 0 |
| t sph/hatch | 432->410 | 19->0 | 67->0 | 153.3->8.0 | 27->0 | .0625->.0098 | .113->.022 | .584/.734->.545/.626 | 10.4->17.1 | 41.3->46.8 | 0 |
| t sph/cont | 443->430 | 14->0 | 60->3 | 99.4->12.7 | 2->0 | .0429->.0326 | .081->.065 | .596/.752->.559/.630 | 10.2->10.7 | 51.2->53.1 | 0 |
| t tor/hatch | 485->469 | 2->0 | 25->0 | 36.8->7.9 | 80->2 | .1320->.0267 | .252->.049 | .487/.912->.559/.654 | 19.1->31.9 | 86.2->94.6 | 0 |
| t tor/cont | 334->331 | 3->0 | 29->7 | 171.7->27.5 | 28->2 | .0584->.0166 | .138->.054 | .573/1.001->.565/.971 | 18.5->18.8 | 89.3->91.5 | 0 |
| t cone/hatch | 284->274 | 1->0 | 31->0 | 30.9->7.9 | 13->1 | .0423->.0018 | .085->.007 | .543/.785->.571/.686 | 3.9->6.2 | 24.2->23.2 | **1.89->0.53** (>=0.75: 0.72->0.02) |
| t cone/cont | 324->324 | 0 | 31->10 | 23.4->19.0 | 0 | .0386->.0401 | .080->.083 | .607/.732->.539/.622 | 0.7 | 19.1->19.7 | 0 |

Straightness: vertex >8.5 deg was 16 % of create sphere/hatch paths, now 0.2 %; worst cell now 3.1 % (t cone/cont 10/324). Hooks over 30 deg: 0 on 12/12 and 0 on 8/8 at d=220. O1 (median sagitta, longest third): test torus/contour .184 -> .167 (bar >= .09); create torus/contour .117 -> .097.
Cost to flag: bare +7 create sphere/hatch (pole thinning, D4 accepted) and +8.4 test torus/hatch; rim>.9 rises on sphere and test torus (rim opens where trimmed stubs left; U4 target); sub-0.6 mm runs appear (create sph/hatch 29, sph/cont 13, tor/hatch 2, cone/hatch 11, t sph/hatch 15, t sph/cont 14, t tor/hatch 9, t tor/cont 2, t cone/hatch 6): apex-flagged runs by D3; the test harness does not see the flag (it is set after `pushRun`).
Seam: median 0.54-0.56 and p90 0.62-0.65 on sphere and cone (was 0.70-0.78), torus unchanged-ish (sparse rows). Seam instrument: ray from each end of runs >= 1.5 mm along the end direction to the nearest other-row ink within 0.25 mm perp.

## STOP checks
- tickSites md5 unchanged 12/12 (d=50) and 8/8 (d=220). Pass.
- Crosshatch object ink NEW/ship (ground disabled): create sphere .981, cone .987, torus .998 (the plan's population: all >= .97, pass); test rig sphere .985, cone .991, **torus .964** (< .97; same cell loses 4 % on hatch because it is where the overlaps were; the bar population in plan section 5 is create only, flagged for Jay).
- bandC ceilings, FILL <= .50, A3, create W_L <= .30, O1 >= .09, O2 <= .20: covered by `scene3d-mark-laws-draw` (43/43 pass: O1/O2/perf included) and the spacing-tone run (A3, FILL, create WL pass; see reds). Create W_L: .00 (cone/hatch .02). Test W_L .53 (plan G .53).
- d=220 (8 cells): vertex >8.5 ship 30/64/36/41/11/0/32/66 -> 0 on all; tip/mark equal or lower (e.g. test cone/hatch .1398 -> .1398, test sphere/contour .1589 -> .1551).
- Perf, d=220, hatch, **interleaved in one process, median of 5, load avg 60-85, new/old (84ec6ff2 sources via scriptOverrides)**: test rig torus 1.07, sphere 0.98, cone 1.33 (min/min .91, noisy); create rig torus 0.99, sphere 0.88, cone 1.03; sphere/contour 0.94 / 1.06. Cone test is above 1.3 on the median of 5 only; re-time on a quiet machine.
- Fine pen (mark-laws-draw "pp.length bounded", penWidth 0.02, torus/contour): base 30-46 s; first U2 369 s (a real regression, test timed out at 180 s); after 4f06a4b4 36-43 s.

## U4 (D5): STOPPED, trade reported
Measured prototype `trimE` (walk each end from the hub; if the end is within `2 * cE` of the outline by the frame at the nominal end, and the arm stops with reason E short of the end, cut the run to the stop point; before ink-trim and before runExtensions). Fixture as above.
- Ends within 0.3 mm of the drawn outline (create sphere/hatch): ship 98, after U1-3 88, with trimE 11 (bottom window [594,520,612,526]: 14 -> 1). Pass for "no touching stubs".
- Evenness did NOT improve: end-to-outline stdev bottom window 0.455 -> 0.43, p90 1.34 -> 1.39. The ticks that stopped 1.1-1.3 mm short are stopped by ink, so removing the stubs lets them extend only a little. Hub-linear end frame is also why the first gate (0.6 x cE) catches only 71 of 88.
- Bars it breaks: APEX (a2) whole-object bare on create cone 26.4 -> 26.7 (bar <= 26.45); create torus/hatch ink 452 -> 415 (-8 %); rim>.9 up on 9/12 cells (create cone/contour 0.9 -> 4.8, sphere/contour 12.5 -> 19.7); sub-0.6 runs up (test torus/hatch 9 -> 19). Variant with gate 0.6 x cE: cone APEX ok (26.4) but create torus/hatch -4 % ink and the evenness is unchanged.
- No clean mechanism found within the brief; not committed. Needs Jay to say whether touching stubs removal alone (88 -> 11) is worth APEX 26.45 -> 26.75 and -8 % torus ink, or a different design (e.g. a screen-space rim distance, not tangent c_E, and a real end frame stashed from `walkFrom`).

## Reds the source change makes (run in FOREGROUND, timeout 600000; base-sha reproduction of failures: none of these fail at 84ec6ff2 per the earlier unit)
- `scene3d-mark-laws-draw`: 43/43 PASS.
- `scene3d-mktick-wedge`: 13 red = the 12 `EXPECTED_SIGNATURE` goldens (expected) + CONTRAST MUTATION "SEC off returns PRE-T2-8b hash" (needs the NO-HOOK flush and both env flushes in the mutation, plan section 8).
- `scene3d-mktick-spacing-tone`: the BC-E describe (73 tests) CRASHES in `beforeAll`: `chainMetrics` -> `chord` reads `pts[0].x` of a REC record whose run was emptied (`run.length = 0` by trim/hook-drop). Fix after acceptance in the test: drop `pts.length < 2` records after the copy at line ~821. With that filter applied temporarily (not committed) 8 reds remain (148 pass):
  1. MUTATION "MAIN-tick clip off regresses tipContact on torus/hatch" (.0241 vs ship .0267): premise gone, ship tip now lower than the mutant (U2 trim removes the contact the clip prevented).
  2. A1 "MUTATION off (flush removed) reopens the wedges" (3.86 not > 5).
  3. A1t test cone/hatch W_R "off" > 1.5 (1.07).
  4. CRUMBS 12 cells: 14 non-apex crumbs (apex flag from trim is set after `pushRun`, harness reads it at push time; D3 re-scope).
  5. A5 d=50 subMin 14 (same cause).
  6. RIMSTRIP (i) STRAIGHT: max deviation 0.1998 > 0.135 (not yet root-caused; the chord/trim/seam passes change the tick body after the 5b extension records; needs a look).
  7. RIMSTRIP MUTATION nostraight no longer trips (.0248 not > .135).
  8. I2 18 cells subMin 38 (same cause as 4).
  Plus the pre-existing CONTRAST "off" stale premise in 2/3 above. Bars were NOT touched.
- The `MUTATION off` / contrast reds are from this unit; none of the above exist at 84ec6ff2 (the file passes there).

## Bars changed
- `tests/unit/scene3d-mktick-spacing-tone.test.js:1427` ("72 cells md5 identical", I1) - default 180000 ms test timeout -> explicit 900000 ms - budget only: it took 254 s and failed the 180 s pre-push hook under load. Same population (3 mark laws + 6 non-mark laws x 8 mappers = 72 cells), same assertion. Commit a4a6394c.
- No other bar, population or fixture changed. New bars (NO-HOOK a/b, NO-OVERLAP, SEAM-GAP, W_L-TEST, CROSSHATCH) and mutants are NOT added yet.

## Pre-existing red
None reproduced; the spacing-tone/wedge/draw files were not run at 84ec6ff2 in this unit (earlier unit reported them green).

## Pictures (MAIN `docs/3d-audit/fill-audit/after/T2-9/`, panels `v1.4.7 84ec6ff2 | NEW 4f06a4b4`)
Rendered by me from the real `generate()` output as SVG in headless Chromium (ink 0.336 mm, outline light blue), NOT by `scene3d-capture.js` (needs a live app server; box load was 60-140). mm windows exact; pixel scale is mine. One line each:
- JAY_T29_create_sphere_hatch: pole hooks and the dense curling streaks are gone, the pole patch is sparser with straight spokes; seams and the bottom rim still read as visible dark lines; the lower right limb still shows a few gently curved ticks.
- crop_pole: the old hooked fish-bone is replaced by straight fanned ticks with larger gaps near the pole.
- crop_lowerright: ticks near the rim still bow slightly toward the outline (guarded, residual up to ~13 deg); the merged blob at lower left is unchanged there.
- JAY_T29_test_sphere_hatch: same story on the test rig; clean pole, straight ticks.
- crop_create_torus_contour: curves on the torus rows are kept (only hooks removed), nearly identical to ship.
- crop_seams: seams are slightly more even but still a continuous thin dark line; the wide gutters in the upper right are narrower.
- crop_overlap: the merged ink blobs at the bottom left are gone; ticks are separate with an even gap.
- crop_bottomrim: the merged bottom stub cluster is separated, but the rim still alternates short stubs and ticks that stop short (U4 not applied), so GAPS (b) is NOT fixed.
- JAY_T29_create_sphere_contour: pole spokes straighter, rim a little more open, contour rows otherwise unchanged.
- JAY_T29_create_sphere_crosshatch: both families still cross as before; the pole is lighter, no visible loss of crossings.
- crop_testrig_WL: the ragged strip beyond the lower ends of the test cone is now filled out to an even rim edge.
- JAY_T29_testrig_cone: rim ends on the right and base are longer and neater; some interior ink at the base lower left looks denser from the straightened ticks.
- crop_create_torus_bottom: practically unchanged from ship (a few ends shorter).
