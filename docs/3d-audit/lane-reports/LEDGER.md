# LEDGER — 3D fill audit lane units (secretary-maintained)

Maintained by the lane secretary. One row per unit in the handoff queue
(`docs/3d-audit/fill-audit-handoff.md` §Queue). Status vocabulary:
`QUEUED | IN-FLIGHT | DONE | DONE/FU | MEASURED | REVERTED | BLOCKED | NEEDS-ORCH-LOOK | REJECTED`.
Initial statuses seeded 2026-09-05 from the handoff doc; updated on each "reports in" message.
Evidence path = `docs/3d-audit/fill-audit/after/<W-id>/` unless noted. Report files live beside
this ledger as `<W-id>-<role>.md`.

## Phase 1 — WIP checkpoint triage (finish or revert; run lane's targeted tests FIRST)

| unit | lane / worktree | status | impl sha | reviewer verdict | judge verdict | open follow-ups | evidence path |
|---|---|---|---|---|---|---|---|
| W-15c triage (design C, F-14 plane 3 rulings @ d=50) | fill-audit / `.claude/worktrees/fill-audit` (:8476) | **REVERTED** (secretary-verified: HEAD 6d6b1b78 clean, diff vs 5ebccf7c empty on both files, numbers in commit body) | 6d6b1b78 (revert of 58f00fc3) | not required (nothing shipped) | — | F-14 still OPEN; design C blast radius wider than W-15b predicted (6 files / 7 tests); design-D brief in `W-15c-impl.md` | none (no re-shoot — render byte-identical to 5ebccf7c, correctly justified) |
| W-01 M1 triage (torus/hatch/ladder d=1 vs 25 tie) | fill-audit-a / `.claude/worktrees/fill-audit-a` (:8475) | **DONE/FU** — CLOSED | 9fa159f0 (on c861bf97; `CURVED_SPARSE_PITCH_BOOST` 6→4.1) | **ACCEPT** — all 6 secretary flags answered; RED re-derived in a clean archive of 912f8471 (10/20 fail there, 20/20 in worktree = live mutation check); both re-pins independently re-derived correct; 8/8 d=50 md5 MATCH vs main; PNGs looked at | — (not needed) | (1) commit-hygiene: the 2 `scene3d-curved-density-floor` re-pins are proven only in `W-01.json`, not in either commit body; (2) `expectStrictlyIncreasing` should be applied per-row to the 3 in-scope `ladder` rows (the shared non-decreasing bar is what lets the out-of-scope `fineLadder` tie through); (3) sphere max never app-shot (covered by an algorithm-level d=220 md5 pin); (4) M2 (d=8/d=10) still deferred | `after/W-01-M1/` (5 shots + report.json, `after/` paths clean; committed in main as 236e2581) |
| W-10c triage (originSpiral floor 0.8x→1.0x pen + retrace) | fill-audit-c / `.claude/worktrees/fill-audit-c` (:8477) | **CLOSED — KEEP AS LANDED** (orchestrator ruling: keep the cone/sphere improvement, do **NOT** revert; iteration 3 came back **BLOCKED**) | e6b85de4 (test-only, on 04ab79bd / 441af81f) | iter-1 ACCEPT-WITH-FOLLOWUPS | — | **Torus originSpiral at W-10c is WORSE than W-10b on the wedge metric (87.8% vs 73.9% blank-run) and is now HIDDEN by W-10d, not fixed.** Iteration 3 could not build the torus gate from this lane: (1) **no primitive identity reaches `surface-fill-mono.js`** — `MonoFill().emit({...})` (`surface-fill.js` ~10202) passes no `mode`/`primitive`/`shape`, since `chartFor` resolves the primitive to a bare function first; (2) the only in-file alternative, flood-fill hole detection, reads a stable ~40–41% enclosed area on the F-10 test camera at every grid size but **0% on the real default-camera gallery scene** at grids 24/32/48/64/128/160, with one spurious 2-cell hole at grid 96 only. A gate was built on it anyway and verified to change nothing (409 paths / 1551.7 mm, identical to no gate), then **reverted before commit** | `after/W-10c/` + `after/W-10c/before-78bbf3e8/` |
| W-27c triage (contourSlice items a–e) | fill-audit-d / `.claude/worktrees/fill-audit-d` (:8481) | **DONE/FU** — CLOSED on items (a) and (c); (b), (d), (e) still open | 073202a4 (iter-2; iter-1 29203162 on WIP 2dc7b3aa) | iter-1 REJECT → iter-2 **ACCEPT-WITH-FOLLOWUPS** — both blockers genuinely fixed; the cylinder exemption claim verified **TRUE** (`gy` is hard-coded 0 in `sliceSurfaceFG`'s cylinder branch); **the reviewer withdrew its own 39.8° — it was measuring the wrong ring — and independently confirms 7.085° vs the implementer's 7.09°** | — | orchestrator looked: ellipsoid and cone rings are smooth curves now, cylinder unchanged. **New follow-up (must-track): cylinder free-axis drift** — see STILL-OPEN; plus tighten item (b)'s placeholder bound, add a rotated/tilted (b) variant, and (d)/(e)/stale gallery shots still owed | `after/W-27c/` (4 cells, re-shot after the guard) |

## Phase 2 — priority queue

| unit | lane / worktree | status | impl sha | reviewer verdict | judge verdict | open follow-ups | evidence path |
|---|---|---|---|---|---|---|---|
| W-27c item 1 (name the unit/integration failure on an idle machine @ 55ddb720) | fill-audit-d (:8481) | QUEUED | — | — | — | W-25 agent's claimed "contourSlice x-ray test + timeout" never reproduced under load | — (test log only) |
| W-27c item 0 (USER `user-reports/11.png`: torus rings angled points + micro-gaps) | fill-audit-d (:8481), queued behind the W-27c review | **DONE/FU** — CLOSED for 0(b); **0(a) angled points honestly OPEN** → new unit W-27c-0a. Reviewer **ACCEPT-WITH-FOLLOWUPS**, every number reproduced digit-exact from an archive; orchestrator saw torus rings smooth at 400 px — plan `W-27c-0-W-29-plan.md` (MEASURED; both mechanisms located, both fixes prototyped in a scratch export of 18e5a097; **56 internal gaps → 0**) | — | — | — | root cause = analytic ring vs tessellated occluder mismatch clipped at `HLR_BIAS` 0.05 with no `selfOcclude` on the slice `segCtx`; ranked fix 1 = `selfOcclude: true` at `scene3d.js:3648`, scoped to `smoothSurface && analyticProject`; **plan says the 8° corner half of the bar is ALREADY MET** and that the true analytic plane∩torus curve itself turns 95–108° per mm near the equator — the angle bar may be ill-posed | `after/W-27c-0/` |
| W-29 (USER `user-reports/12.png`: `solid` (buckyball) contourSlice ring with OPEN END; pre-existing) | fill-audit-d (:8481), same plan | **DONE/FU** — CLOSED. Reviewer **ACCEPT-WITH-FOLLOWUPS**, numbers reproduced digit-exact; orchestrator saw the buckyball's open ring closed — plan `W-27c-0-W-29-plan.md` (**open rings 6 → 0** with the prototyped fix) | — | — | — | root cause = plane level landing exactly on mesh vertices (planes 9 and 18, world z = ∓6.530 → degree-9/7 nodes, one 27-pt ring with a 16.14 mm end gap); `edgeCross` on-plane branch double-counts the crossing; fix = nudge the plane level off any vertex in `buildSliceSegments`; correct cell ids are `solid__contourSlice__ladder__…` (contourSlice cells use the `ladder` placeholder style, never `none`) | `after/W-29/` |
| W-26 (P0 USER RULE: continuous ladder placement, gaps carry tone only; F-23) | fill-audit-a (:8475) | **P0 CLOSED - conditions met** (2026-09-06). Judge's C1/C2/C3 all landed in W-26b and were **verified independently**; the reviewer states P0 is closable | 3c88605f (+ W-26b 7bc2b1a0 / 4a858445 / 0930cb2d) | ACCEPT-WITH-FOLLOWUPS | **ACCEPT-WITH-CONDITIONS -> conditions MET** | Gap jump **2.00 -> 1.03-1.17**, spiral turn-advance **77x -> 1.05x**, +1.4% ink on a graded ellipsoid, R1c sphere 21.20 -> 19.91 (bar >=2). **4 hygiene items before telling Jay** (none block the close): land the judge's canonical CHANGELOG + for-Jay wording with the crosshatch caveat **lifted**; patch the still-false hatch-bar line in `W-26-impl-2.md`; disclose the `scene3d-plot-safety` `q(0.98)` bar move; record that `CROSS_SHARE_BASE`/`CROSS_DFMAX_BOOST_CAP` are empirically tuned | `after/W-26/` + `W-26-judge-evidence/` |
| A3 (F1 torus streaks) | handoff-c (:8470) — **now IDLE until U9** | **MEASURED** — CLOSED as a measurement; **F1 remains OPEN**, routed to W-26 (placement) | d86cbf8d | judge AMEND-PLAN → reviewer **ACCEPT-WITH-FOLLOWUPS** (split honest, no `src/` change; the classifier genuinely distinguishes a dropped ruling from a sub-pen gap) | A3-judge.md | 3 follow-ups, none blocking: (1) commit a synthetic-streak case that drives the **gating** assertion red, not just the diagnostic; (2) the cluster-shape oracle has **essentially zero margin** — `trochoidLoop`'s worst is 0.900 x **0.300** mm against a `> 0.30` bar, one 0.075 mm grid cell from flipping, and the reviewer's own synthetic Case B quantises to 0.300 too (a grid property, not a coincidence) → use 0.33 or pin `worstClusterDims` with a ±10% band alongside the gate; (3) `report.json` needs the `identical_exceptions` schema | `after/A3/` — byte-identity real but **the wrong cells**; the F1 laws are never captured there. Capture regex in STILL-OPEN |
| W-15c (F-14 plane 3 rulings @ d=50) | fill-audit (:8476) | **DONE/FU** — CLOSED | 8bd1581b (on 6d6b1b78) | **ACCEPT-WITH-FOLLOWUPS** — ground-plane inclusion judged **ACCEPT on the picture** (reviewer rendered both goldens' raw paths as SVG and looked: ground ink 12164.30 → 30215.55 mm, **2.48x**, additive; inverse 8365.28 → 26178.72 mm, 3.13x; the box is byte-identical in both and stays the legible focal shape). Two independent cross-checks reproduce the goldens' own `byObject.ground` fields to 3 dp; only ground-attributable fields move. **The app's actual default scene is unaffected** — its ground carries its own style override | — | orchestrator looked: plane 2→8 at low, 3→18 at med; max and box unchanged. 4 follow-ups: (1) pin the `isSoloOrientation` dot-threshold boundary — untested by name, and a slightly bowed multi-facet ground or faceted disc would miss the gate; (2) log the ground-density change in release notes / hardening; (3) the graded multi-orientation Density-blind floor stays open; (4) the `toneOn` foreshortening divergence stays open | `after/W-15c/` (needs `identical_exceptions` for its 6 identical pairs) |
| W-05b (USER 8.png + 9.png: variable-length ticks that FILL the form; ticks may CURVE) | fill-audit-a (:8475) — `surface-fill.js` `MK`/mark constants/`emitMarks` only | **PLAN-READY** — `W-05b-W-06b-plan.md` (4 serial units T1–T4, **10 reds all measured on the live tree**). Answered by **T1 + T2** | — | — | — | coverage ≥0.9 of lit non-highlight silhouette @ d=50; tick length ≥3x range; no un-ticked band > 2× row pitch; byte-identity for every other law | `after/W-05b/` |
| **T1** chart-walked mark | fill-audit-a (:8475) | **DONE/FU** - CLOSED | 67c9752c | **ACCEPT-WITH-FOLLOWUPS** - **O3 met** (refusal 0.20-0.61 -> 0.005-0.007); **O1/O2 honest near-floor and analytically verified as BOUNDED**, i.e. the shortfall is structural, not effort | - | **Follow-ups: (1) a kink-detector test - MUST-DO BEFORE T2 STARTS on the same sink, add it to T2's brief; (2) an upper bound on `pp.length` (T1 relaxed the `=== 2` pin to `>= 2`, leaving the point count unbounded above); (3) the near-duplicate-stub tail** | `after/T1/` |
| **W-30** shadow-receive direction ignores `light.type` | handoff-c — `shadows.js` only | **DONE/FU — but UNREACHED until W-30b** (the reviewer's explicit instruction: keep this **user-incomplete**, not "done" in any user-facing sense, until W-30b's wiring + full-`generate()` RGR lands on fill-collapse) | 0d405577 | **ACCEPT-WITH-FOLLOWUPS** — correct, tested, **purely additive with zero existing lines touched**; all numbers reproduce exactly; new `scene3d-shadow-footprint-direction.test.js` 17/17 plus Unit D receive 17/17, Unit C overlap 4/4, spatial-index identity 6/6 and the general Shadows contract 18/18; all four PNGs read directly; **no undisclosed bar changes** | — | **A point/spot/area light with the receive flag ON renders IDENTICALLY before and after this commit** — zero user-visible effect until W-30b. Minor follow-up: ~10 further shadow-family suites (139/139 per the impl report) were not independently re-run, judged low risk given the additive diff and the five adjacent suites passing | `after/W-30/` (4 PNGs) |
| **W-30b** wire `buildFaceFootprint` to the new projector | **fill-collapse** (RULED 2026-09-06) — **not** fill-audit: fill-collapse already sits on `fill-audit@142afe58` and edits `scene3d.js`, so landing it here **avoids a forced rebase**. handoff-c consulted as the `shadows.js` owner | **QUEUED — after U5b. NOT started (paused).** | — | — | — | **One-line call-site swap** at `scene3d.js` `buildFaceFootprint` (~754-778): call `Shadows.projectLightToPlane(P, light, anchor, normalWorldArg, lightDir)` instead of always `projectAlongDirToPlane(P, lightDir, anchor, normalWorldArg)` — `lightDir` is already computed at ~652-653. **RGR through the full `generate()` pipeline**: directional stays byte-identical (free), point/spot/area footprint geometry changes. **Without this, W-30 changes nothing a user can see.** Lane order on fill-collapse: U5b (blocking) → W-30b. Optional, explicitly not implemented: true multi-sample soft footprints for area lights (the ground-shadow path treats area as a single position too, so the current shape matches precedent) | `after/W-30b/` |
| **W-27c-0a-2** residual saddle/pole ink merging — needs a DIFFERENT mechanism | fill-audit-d — TBD by the plan | **PLANNING-DEFERRED** — behind the T-chain and the W-26b unit | — | — | — | The crowding cull has taken this as far as it goes: at K=0.8 it clears sub-bars (a), (b) and (c) on both primitives but leaves **(d) largest blob at 2.10 mm (torus) and 14.85 mm (sphere) against a ≤0.9 mm bar**, and **(e) blob count at 12 (torus) and 54 (sphere, regressed from 47) against ≤5**. K=1.0 is ruled out by the plan's own warning and K=0.8 is the verified ceiling with no over-culling cost, so more of the same lever cannot close it. Also unresolved: **`min inter-ring distance` stays 0.00000 mm** — rings still touch somewhere — which suggests the residual is inherent to the emit order rather than to the cull threshold. A plan must decide what the different mechanism is (the sphere's giant merged polar cap is the specific shape to attack) | `after/W-27c-0a-2/` |
| **W-26b** (C1 + C2 + C3 + 4a) | fill-audit-a | **DONE/FU** - CLOSED; **P0 unblocked** | **7bc2b1a0** / **4a858445** / **0930cb2d** | **ACCEPT-WITH-FOLLOWUPS** - all three conditions verified with independently reproduced numbers. **C1**: cylinder D220 4912.6 (pre-W-26) -> 9326.7 (broken) -> **5153.7 mm (+4.9%)**, ellipsoid -> **4115.6 (-15.6%)**, `crossDensityRatio` spread 2.2x -> 1.12x -> **2.3x**. **The mutation test - re-widening the crossing family - fails the new C2 guard at the exact pre-fix value**, which the reviewer calls about as strong a causal proof as this class of fix gets. **C3** floor+band shape adopted as prescribed. 4(a) a genuine bonus guard, 4(b) correctly record-only | - | 5 non-blocking follow-ups, folded into W-26's hygiene list | `after/W-26b/` |
| W-06b (USER 10.png: mkDashRamp @ d=1 draws ONE dash) | fill-audit-a (:8475) | **PLAN-READY** — same plan; answered by **T3** alone | — | — | — | ≥~40 dashes on a 40 mm sphere @ d=1, monotone to med, never a single stroke; extend `scene3d-mark-laws-draw.test.js` | `after/W-06b/` |
| W-07b (deepFillTSP with the worklist oracle) | fill-audit-a (:8475) | QUEUED | — | — | — | oracle: shadow-third coverage ≥ Ladder, no segment > 3×masterPitch; W-07 shipped only ~2% ink change | `after/W-07b/` |
| W-06 max-density sign-off (2995 → 529 mm ink) | fill-audit-a (:8475) — **Jay decision**, executed in **T4** | **NEEDS-JAY — plan recommends CONDITIONAL SIGN-OFF** (exact ask in the reply / STILL-OPEN) | 5641e2bd | DONE/FU | — | contradicts worklist "max stays byte-identical"; test dropped the pinned-md5 oracle | `after/W-06/` |
| W-25 floor scope (SPIRAL_MIN_TURNS=2 also engages on default buckyball) | fill-audit-d (:8481) | QUEUED | 44797f53 | DONE/FU | — | own the diff with a fingerprint test or retune to thin-cusp faces only; also fix stale header comment in `tests/unit/scene3d-mesh-self-occlusion.test.js`; residual sub-0.05 mm hlr.js seam needs its own W-id | `after/W-25/` |
| W-28 face-count threshold (imported meshes always cap-limited) | fill-audit-d (:8481) | QUEUED | 55ddb720 | DONE/FU (accept; threshold better) | — | engine.js stores `importedMesh.faces.length` at import → `totalFaces <= 12 → not cap-limited` fast path | `after/W-28/` |
| Unit D phase-align (inside-footprint hatch reads as broken dashes) | handoff-c (:8470) — **lane FREE again** (U9 still waits on the U1→U8 chain) | **DONE/FU** — CLOSED (orchestrator confirming on the crops; recorded unless the picture contradicts) | 8e9b0991 (on d86cbf8d) | **ACCEPT-WITH-FOLLOWUPS** — RGR, flag-OFF byte-identity, identity-mutation and the two-face case all independently verified. **All five secretary flags answered, and flag 1 was answered by construction**: the reviewer cloned `footprintPolys` before the outside `.concat` to break the identity link, and the SAME polish test **fails at the identical phase ratio as the pre-fix baseline** — because it drives the real `generate()` pipeline and measures emitted geometry, not the WeakMap's internal state. It is an outcome-based regression test, not a snapshot of the mechanism, so the fragility **is caught**. Flag 2 is theoretical only: `buildFaceFootprint` builds fresh arrays every call, so no stale anchor is reachable through any current call site. Flag 4: restoration is **double-guarded** (inner `finally` after the BEFORE render, outer `finally` re-writes and verifies on exit) and the on-disk file was confirmed to carry the fix | judge (earlier): 1.45x denser, real | 4 minor follow-ups, none requiring rework — see STILL-OPEN | `after/UnitD-phase/` (bespoke scene; no gallery cell reaches the flag) |
| W-22 / W-23 / W-24 + W-18 (slider collapses → roster **49 → 31**, not 24) | **new worktree `.claude/worktrees/fill-collapse`, branch `3d-scene/fill-collapse` off `3d-scene/fill-audit`, port 8490** (must rebase onto fill-audit first — W-02's mapper gate and W-03's `CURVED_SPIRAL_STIPPLE_INERT` are prerequisites for every picker-count guard). U9 = handoff-c; U10–U12 = fill-audit-a | **PLAN-READY** — `W-22-24-W-18-plan.md`, 12 units U0–U11(+U12) | — | — | — | Phase 1 (U0–U9) is NOT W-26-blocked and never touches `surface-fill.js`; only U10/U11/U12 wait for W-26. U1–U8 are data-only and **strictly serial** (same generator + generated config + same guard tests). A byte-identical before/after pair is the PASS here, not the failure. Decisions owed: **U6 `penStipple` mark-class** (`'dot'` → `'hatch'`, or keep the known lie) needs Jay; the plan also corrects the audit's C-05 "byte-identical" wording to near-duplicate (ink 1459–2202 mm, a 51% spread) | per-unit, mostly none (no-op units) |
| **W-31** crosshatch cells uneven (USER, `user-reports/13-w26-judge-montage.webp`) | fill-audit-a - `surface-fill.js` | **QUEUED - after T1b** | - | - | - | Verbatim: *"diamond/square gaps vs rectangular gaps... lines not evenly spaced? The only reason there should be greater space is highlights (less ink = more light)"* - seen on the W-26 judge montage (ellipsoid/cone contour ladders, cylinder crosshatch D220). **This generalises the P0 rule to crosshatch CELL SHAPE**: both families evenly spaced except where tone demands. Note W-26b-1 changed the crossing family's coverage share, so re-measure on `0930cb2d`, not on the judge's montage tree | `after/W-31/` |
| **W-32** rulings break out beyond the border (USER, `user-reports/14-w26-capsule-cone-cylinder-spiral.png`) | fill-audit-a (`surface-fill.js`) **or** `hlr.js` (handoff-c) - decide at planning | **QUEUED - after W-31** | - | - | - | Verbatim: *"Some of these lines are breaking out beyond the border."* - the W-26 after row (capsule / cone / cylinder / spiral) - **silhouette overshoot**. **RGR: no ruling endpoint outside the silhouette by > 0.5 pen.** Relates to the existing `scene3d-fill-boundary-ends` guard, which passed 41/41 through W-26 - so either it does not measure overshoot or the overshoot is new; establish which first | `after/W-32/` |
| **W-33** non-curved angles in contour FILL rulings (USER, `user-reports/14-...png`, same image as W-32) | fill-audit-a | **QUEUED - after W-32** | - | - | - | Verbatim: *"I'm observing some non-curved angles here"* - same image as W-32. **The user's contour-rounding rule 2(b) applies to contour FILL rulings, not just contourSlice** - a scope extension of the existing rule, not a new one. Check the `fillCurves` / fitter gate for fill rulings, plus the capsule cap and cone base polylines | `after/W-33/` |
| **W-34** angles in a curved shape (USER, `user-reports/15-w27c-contourslice.png`) | fill-audit-d | **QUEUED - after W-27c-0a iter-4** | - | - | - | Verbatim: *"There are some angles in this curved shape that should not be there."* - W-27c after row (ellipsoid / cone / cylinder contourSlice). **Extends W-27c item (b)** and lands directly on the unresolved cone-apex dispute (reviewer's withdrawn 39.8 deg vs the agreed 7.09 deg). **Bar: <= 8 deg.** Note the open-polyline-aware metric is mandatory here - a wrapped closed-ring metric invents phantom corners | `after/W-34/` |
| **W-35** stairstepping at the HLR clip + a user-facing param (USER, `user-reports/15-...png`, same image as W-34) | fill-audit-d + `scene3d/params.js` + `context-bar.js` (**cross-lane: coordinate with fill-audit / fill-collapse**) | **QUEUED - after W-34** | - | - | - | Verbatim: *"You can observe some minor imperfections where line segments end, creating stairstepping. If this is to minimize overlap to prevent bleedthrough, perhaps having a parameter we can control for this would make the most sense? Increasing allows for subtly more overlaps and preserves outer edge fidelit?"* **PRODUCT REQUEST, not just a defect fix** - note Jay names the trade-off himself: the stairstep may be deliberate bleed-through avoidance, so the param exposes an existing tension rather than fixing a bug. Needs a param in scene3d params + the context-bar control + a preset default, so it carries the full docs contract (README, CHANGELOG, help). Interacts with W-27c-0a's crowding cull and with `SLICE_CLIP_WORK` | `after/W-35/` |
| **T1b** near-duplicate stub merge + min-spacing guard (plot safety) | fill-audit-a - `surface-fill.js` mark sink + `scene3d-mark-laws-draw.test.js` | **QUEUED - MUST-DO BEFORE T2** | - | - | - | **Ruled a plot-safety regression, not a footnote.** T1 tightened the worst adjacent-mark pair from **0.448 -> 0.032 pens** on torus/contour (a 0.0095 mm gap - effectively overlapping pen strokes) and 0.080 -> 0.032 on crosshatch, from two independently limb-truncated stubs in adjacent rows landing near-coincident at a silhouette edge. **No existing oracle catches it** - G5 only tests outside-silhouette, never overlapping-another-mark. **Scope, all three, RED at `67c9752c`:** (1) merge or drop near-duplicate stubs **plus a >= 0.5-pen min-adjacent-mark guard**; (2) the **kink-detector test** (T1's chevron passed all four oracles, with O1's sagitta *higher* because the kink read as curvature - nothing today would catch its return); (3) an **upper bound on `pp.length`** (no code-level cap exists; `walkPoly` steps are `ceil(edgeLen / MK_ARC_MM)` and `MK_MAX_PENS` budgets marks not points - measured max **107 points** in one mark, p99 43, median 6). Bulk banding is **out of scope** - pre-existing `MK_ROW_COV` scaffold, T3/U3's | `after/T1b/` |
| **F1-placement** (the user's "not close to zero" complaint) | fill-audit-a — `surface-fill.js` | **PLAN-READY** — `F1-placement-plan.md` (MEASURED: mechanism found, located to file:line, **prototyped twice with before/after numbers**). **ORDER on fill-audit-a: W-26b → F1-placement → T2 → T3** — F1 goes ahead of T2 | — | — | — | **The plan overturns the A3 judge's routing: F1 is a RULING-PLACEMENT defect, not "between ribbon stretches", and it is NOT pen-unreachable — and it is the SAME mechanism as W-26's root cause.** `weightCovAt` (`:4273`) falls through to `weightBaseCov()` (`:4303`) → `wvFlatCov()` (`:3910`), which **takes no arguments** — one constant for the whole object, no radiance term — and drives the Sturmian accumulator `ladderStep` (`:1289`, seeded `LADDER_PHASE0 = 0.5`). At d=50 `c = 0.44803`, so kept-index gaps are **{2×7, 3×2}**: one gap in four is **50% wider with literally zero tone behind it**. The accumulator also advances **one grid index per ruling, never by screen distance**, though `covAtSample` already holds the projection-correct `localPitch` and hands it over. Result: a **41.7 × 6.6 mm, 62.63 mm² bare strip** across the lower front torus — 5% of the visible surface and **30x the entire `ringNotInkMm2` residue A3 measured** — containing **77 dropped-ruling samples and 0 kept-ruling samples**. **Use the A3 split as a GUARD, not the oracle.** **⚑ RULING 2026-09-06: ship Prototype B (LOCAL)** — see Standing rulings for the five conditions | `after/F1-placement/` |
| U0 foundation (resolver + `ALIASES` shim + generic sub-control, EMPTY collapse table) | fill-collapse (:8482) | **DONE/FU** — CLOSED | a8d84bef (report committed separately as eab7d0b0 inside the worktree — deviation logged) | **ACCEPT-WITH-FOLLOWUPS** — clean; reviewer independently re-ran and confirmed **335 of the 335** tests the per-file table actually sums to, and found the report's "342/342" headline is an **arithmetic slip, not 7 hidden failures** (8+7+5+13+7+19+6+20+3+5+131+36+6+39+30 = 335) | — | (1) correct the impl report's headline to **335/335**; (2) **live verification still owed** — folded into the end of the U1→U5 chain, which is the right place since U0's sub-control loop renders zero rows until `STYLE_PARAMS` is populated; (3) `persistentStyleKeys()`'s derived path and the monkey-patched synthetic-alias tests both come under real scrutiny only once U1 lands | `after/U0/` (48 cells md5-identical, `identical_exceptions` per cell) |
| W-25b `SPIRAL_MIN_TURNS` floor scope | fill-audit-d (:8481) | **DONE** — CLOSED | 789ba0fa (on 767bed54) | **ACCEPT** — the secretary's headline flag is answered: **Unit F's fixture faces measure aspect 0.177, outside the `[0.3, 3]` clamp, and 102 of 288 `trueSpiral` calls are still floored**, so W-25's fix is NOT inert — only the buckyball's spiral output changes. Byte-identity confirmed across all three commits (55ddb720 / 44797f53 / 789ba0fa) | — | none blocking. Residual from W-25 review, still owed its own W-id: the 2 sub-0.05 mm `hlr.js` occluder-precision survivors on the imported torus. Check that no W-25 artefact still claims a buckyball gain | `after/W-25b/` + `before-767bed54/` — byte-identity restore, no new picture needed |
| W-27c-0a saddle ink-merging cull | fill-audit-d (:8481) | **ITER-3 REJECTED / PARKED — no iteration 4 now.** `ec79e2b9` **stays on the branch** (ring integrity is the keeper). **FIRST item on the fill-audit-d resume list: "iter-4 — re-scope cull to saddle/pole + land the four floors"** | ec79e2b9 (kept) | iter-3 **REJECT** — the mid-ring-break fix is **real, clean and to be KEPT** (native-resolution crops confirm the saddle apex fused blob is gone, no notch, no fat merged blob), and the report's numbers reproduce **exactly** with nothing fabricated or misrepresented. **But the whole-ring cull is unscoped**: it drops any ring within K of another ring's ink, which on this rig also fires in the **flat lower band that has no saddle/pole crowding at all** — a per-region diff shows the 70.8% ink loss is **not** an even thinning but concentrated in the lower band and the left saddle's inner nested rings. **Four floor+10% bars remain unguarded** | — | Resume brief: (1) **re-scope the crowding cull to the saddle/pole zone** so the sparse lower band is not thinned; (2) **land the four floors** that iteration 3 left as measured-and-logged only. The 0(b) ceiling restored to ≤55 now guards the mid-ring regression from returning — keep it | `after/W-27c-0a/` |
| W-10d-2 saved-document / live-tree fallback for an unreachable `toneLaw` | **fill-collapse** (:8482) — `src/core/scene3d/params.js`; **must NOT run in fill-audit in parallel**, U0 is editing that file now | **QUEUED — after U0 lands** | — | — | — | Two call sites, both already holding primitive + style in one scope: **`collectSceneParams` (`params.js:1042`) is the primary** — `_composeSceneGroup` (`engine.js:2690`) feeds its output straight to `algo.generate()` **without ever calling `normalizeParams`/`sanitizeSceneParams`**, so a load-time-only fix would leave every live scene-tree edit uncorrected; gate `n.style.params.toneLaw` at `params.js:1094`. Secondary: `normalizeParams` (`params.js:1291`), a correlation pass after line 1325 remapping `styleTable.byObject`/`byFace`. Remap to the roster default `ladder`, mirroring `clampStyleParam`'s existing unknown-id fallback (`params.js:730`). `isReachableOn` is a safe lazy `Vectura` read, not a load-order dependency. **Needs a byte-identical guard for every currently-reachable combination**, and an explicit product call on the open design question below | `after/W-10d-2/` |
| **U5b** caveat visibility for folded laws | **fill-collapse** — `src/config/context-bar.js` / `src/ui/panels/scene3d-panel.js` (U0's own files) | **QUEUED — BLOCKING BEFORE MERGE** | — | — | — | Folding `bundleDither` (U4) and `contFieldTouch` (U5) hides their real measured caveats, because `fillStyleControls` renders the caveat line from the **resolved survivor id**, which has none. **Fix:** render the caveat from the **ORIGINAL law id**, or carry caveats **per parameter value** in the collapse table, so the warning shows for the folded parameter. Keep the (i) popover's blurb on the survivor — the two are conflated in the current code. **RGR: caveat text present for a folded id in the picker and the Style tab, RED at `8610fd66`.** **The same rule binds U6** (`penStipple`) | `after/U5b/` |
| U1 -> U5 chain (C-01 ladder, C-02 width, C-03 weight, C-04 bundle, C-05 contField) | fill-collapse (:8482) | **DONE/FU** - CLOSED | **8610fd66** (U1 `799eaa36`, U2 `cf12b0af`, U3 `6ed9002d`, U4 `4186412e`, U5 `8610fd66`) | **ACCEPT-WITH-FOLLOWUPS** - all five units; **18/18 md5-identical, 0 differences**, independently re-captured rather than read off the report; **C-05 CONFIRMED not lossily folded** (5/5 distinct md5s after, matching 5/5 distinct before - the fold is picker-tier only, the renders stay distinct); picker counts independently reproduced; the collapse tests run live | - | Two real gaps, both already owned: **U5b** (caveat visibility, ruled BLOCKING-BEFORE-MERGE - explicitly not a fail of U1-U5) and **W-10d-3**. Non-blocking record fix: the impl report's "21/21" byte-identity figure is an **arithmetic slip - the true count is 18/18** (same class as U0's 342 vs 335). The C-05 wording correction stays U8's under the docs contract - and is separately guaranteed by the wrap-up ruling | `after/U1`-`U5/` |
| FU-1 thread a primitive id into the mono fill (prerequisite for any future source-level torus gate) | **fill-audit-a** (owns `surface-fill.js`) + fill-audit-c (`surface-fill-mono.js`) — cross-lane, serialize | **FILED, NOT SCHEDULED** (orchestrator: follow-up, not now) | — | — | — | Add `primitiveMode: opts.mode` to the `MonoFill().emit({...})` object literal at `src/core/scene3d/surface-fill.js` ~10202 (inside `if (monoMapper)`), then thread `o.primitiveMode` through `surface-fill-mono.js`'s `emit(o)` (~2947) and `makeCtx(o)` (~102) onto the published `C` so laws can read `C.primitiveMode === 'torus'` with no geometric guessing. Only needed if a code-level gate is ever wanted in addition to or instead of W-10d's UI hide | — |
| W-10d hide originSpiral on torus via `isReachableOn` | fill-audit (:8476) | **DONE/FU** — CLOSED, verified live by both implementer and reviewer | 142afe58 (on 8bd1581b) | **ACCEPT-WITH-FOLLOWUPS** — the greyed+suffixed mechanism is confirmed the codebase's **only** live convention (read from source, matching W-03's `CURVED_SPIRAL_STIPPLE_INERT` gate in the same file), not a second one; RED/GREEN reproduced in a scratch export of 8bd1581b | — | (1) **Label accuracy:** `NO_EFFECT_SUFFIX = ' — no effect here'` is literally true for the faceted and spiral/stipple gates (byte-identical to Ladder, measured) but **false for torus/originSpiral**, where the defect is "effect, but unplottable ink wedges" — a user could infer the render is safe-but-unchanged. Low priority, for whoever revisits picker copy. (2) → **W-10d-2** | none (picker-presentation; live screenshots) |
| GH-1 gallery integrity (**runs on MAIN, not a lane**) | main checkout, `scripts/audit/` + `docs/3d-audit/fill-audit/` | **DONE** — uncommitted on main until wrap-up (secretary-verified: tracked changes on main are exactly `scripts/audit/scene3d-before-after.js`, `after/W-01/report.json`, `after/W-03/report.json`, `index.html` — **no `src/`, no `tests/`, no lane worktree**) | uncommitted (base 236e2581) | — | — | Shipped: (1) hard REFUSAL when any `after` entry does not start with `after/<dirName>/` — exit 1, names card+cell, `index.html` NOT written (verified on a scratch gallery: index byte-identical after the refusal); (2) non-fatal WARN + `byte-identical — UNEXPLAINED` badge unless `report.json` declares an `identical_exceptions` entry with a reason. Fixed 2 live pointer bugs the rule caught: **W-01**'s `after` array repeated the `before` `shots/` paths (repointed at the real `after/W-01/shots/`, 9 genuine identical pairs annotated), **W-03** pointed into W-02's directory (file copied local). `after/W-10/shots/B` re-shot from **e757db68** — clinched by the corrupted manifest holding **42 lines = three stacked 14-line generations**, with the fresh capture matching generation 1 exactly; all 5 basenames shared with W-10c now differ, so the Before/After tab shows a real W-10→W-10c delta for the first time. No `after/W-10b/` card exists (nothing to restore). **Open follow-ups:** 47 pre-existing unexplained byte-identical pairs are now surfaced across W-01-M1, W-15, W-15b, W-19, W-20, W-21, W-27 — each needs an `identical_exceptions` reason or a re-shoot; and `after/W-10/report.json`'s `commit` field still reads `78bbf3e8` while the pixels are now `e757db68`. **Note for the orchestrator: GH-1 already ran the full 3-script rebuild** (18 items, 0 malformed, 119 pairs), so `index.html` is current as of now and goes stale the moment another lane captures | `docs/3d-audit/fill-audit/after/W-10/` (restored, 14 cells) |

## Verified tree state (secretary, `git worktree list` + per-worktree status, 2026-09-05)

- main = `236e2581` (was 722ba84c; +W-01-M1 evidence commit. Handoff doc still says `d5af9e30`.)
- Lane HEADs now: `fill-audit` **6d6b1b78** (W-15c reverted), `fill-audit-a` **9fa159f0** (W-01 M1
  finalize), `fill-audit-c` 441af81f (WIP), `fill-audit-d` 2dc7b3aa (WIP), `handoff-b` 9b2a33bb,
  `handoff-c` 79c98ca8. All clean — no uncommitted tracked edits at last check.
- Every worktree shares the same three global `graphify-out` stashes (stash@{0..2}) — unrelated to
  these lanes; do NOT pop them.
- Each WIP commit message ends in "(unverified)" — triage must run the lane's targeted tests first.

### W-27c iteration 2 (073202a4, fill-audit-d) — forwarded 2026-09-05, review resumed
Secretary pre-checks that PASSED: lane HEAD clean, `mappers.js` untouched, plane-count purity tests
untouched, guard suites green, RED taken from a disposable `git archive` export, mutation B verified by
actually applying it to the committed source and reverting (`git diff` clean).
Flags to forward:
1. **The (b) number is now contested 7.09° vs 39.8°** on what both sides describe as the identical rig
   (identity, sx20/sy24/sz20, detail18, sliceCount22). The implementer reproduced 7.09° across three
   wiring variants and could not reproduce the review's 39.8°, including chasing the "0.08 mm
   near-duplicate cluster" hint (found everywhere in a 137–1193-point ring, so not a signature).
   **Ask the reviewer to run its own iteration-1 script against 073202a4 and settle it** — if 7.09° holds,
   item (b) is inside the ≤8° bar and closable; if 39.8° holds, it is not.
2. **The new (b) test asserts only `0 < worst < 45`** — deliberately loose, and honest about being so, but
   it is a test that cannot fail meaningfully. Do not count it as coverage for (b), and it should not
   survive to merge in that shape.
3. **On rejection the guard returns the input point unmoved** (measured dist 0 mm at the near-tangent
   case). That is safe, but it is the review's own second failure mode — near-tangent ring points are now
   knowingly left unrefined, silently. Ask whether "returns the raw point" is the intended end state or
   just the safe stop, and whether anything should mark or count those points.
4. **`4 x max(sizes.sx, sizes.sy, sizes.sz, 1)` is a magic bound.** Check it cannot reject a legitimate
   step on a large or strongly anisotropic object (imported meshes especially), which would silently
   under-refine exactly where refinement matters.
5. **Cylinder is exempted from blocking requirement #2 by a mathematical argument** — `F` has no `y`
   dependence, so the gradient's y-component is identically zero and mutation B provably cannot be
   detected there at any offset. The argument is checkable; verify it rather than accept it, since it is
   an exemption from a blocking requirement.
6. **Misquote in a claimed independent reproduction.** Iter-2 says it reproduced the review's divergence
   figures "exactly" and cites 61.6 / 617 / 6174 mm; the review's own §5 records **106 / 1060 / 10600 mm**
   at the same eps values. Same defect class, different magnitudes — the reproduction may have used a
   different rig than claimed. Worth one line of confirmation.

### W-15c (8bd1581b, fill-audit) — forwarded 2026-09-05, review in flight
Secretary pre-checks that PASSED: commit touches 6 files, none forbidden (`surface-fill*.js`, `mappers.js`,
`hlr.js`, `regions.js`, `context-bar.js` all untouched); no tolerance widened; no ordering assertion
touched; RED run against the pre-fix tree before the source change; every byte-identical evidence pair
explained; the implementer correctly did NOT run any gallery rebuild script.
Flags to forward:
1. **The 6 re-pins share one unadvertised mechanism: the GROUND PLANE is itself a single-orientation
   object,** so the new gate opens on any scene whose ground carries `mapper: 'hatch'` with no override.
   The plan promised "every graded object is byte-identical by construction" — true of graded objects, but
   the ground was never named, and it is what moves `scene3d-hlr-spatial-index-identity` (129→208, 341→404,
   560→651 paths across three scenarios) and both tone goldens. **Ask whether a denser ground fill is
   intended**; it is a user-visible change that F-14 (about the plane primitive) never asked for.
2. **Two visual goldens were regenerated** with `VECTURA_UPDATE_BASELINES=1` — `shadow-additive-default`
   219 → 284 paths and `shadow-inverse` 58 → **126, more than double**. Regeneration is a re-pin: confirm
   the new goldens are *right* by looking at them, not merely that the harness rewrote them.
3. **`dot >= 0.999` in `isSoloOrientation` is a magic threshold** with no sensitivity test. Near-coplanar
   faces — a bevelled plane, a low-poly cap, an imported mesh with numerical noise — can flip the gate and
   with it the whole density behaviour. Ask for a boundary case.
4. **Stage 0 is verified only numerically, in an uncommitted scratch file** (`[3,3,3,29]` unchanged). The
   plan warns that dropping the `zone &&` term collapses ladder and Stage 0 into the same render; confirm a
   *committed* test would fail if that term were removed (`scene3d-faceted-tone-law`'s Stage-0 trio is the
   candidate — the implementer ran it 19/19 but did not link the assertion).
5. **Evidence must declare `identical_exceptions`.** 6 of 8 cells are byte-identical with good reasons, but
   GH-1's new hardening WARNs on any identical pair lacking an `identical_exceptions` entry — `after/W-15c/
   report.json` needs those entries or it joins the 47 unexplained pairs at the next rebuild.
6. Minor, disclosed: the plan's `plane__*__none__*` Stage-0 cells do not exist in the Tier A roster (Tier A
   shoots only the default `ladder` toneLaw), so no image before/after exists for them; and a stray
   `scene3d-capture.js --help` ran the default capture once — verified to have written nothing.

### A3 amended unit (d86cbf8d, handoff-c) — forwarded 2026-09-05, review in flight
Secretary pre-checks that PASSED: worktree clean at HEAD, no orphan stash (only the 4 global
`graphify-out` entries), 3 test files only, no `src/` change, no other lane's serialized file touched,
sibling consumers re-run and unmoved, F1 explicitly NOT closed at every level of the report.
Flags to forward:
1. **The unit's real pass criterion moved, and the reviewer should check the new bars actually bind.**
   The 5 intentionally-RED `ringNotInkMm2 <= 0.18` assertions are RETIRED (judge-sanctioned). Their
   replacements are loose by design: `ringNotInkMm2 < 3` against a measured 2.06 (only 1.45x headroom, so
   it is an anti-explosion guard, not a bar) and `ringNotInkReachableMm2 < 1.0` against 0.17, explicitly a
   diagnostic. **So the cluster-shape oracle is now the only thing that can fail** — and its second bar is
   borderline: it triggers on `crossWidthMm > 0.30 AND lengthMm > 1.0`, while today's worst cluster is
   exactly **0.900 x 0.300 mm**, i.e. sitting *on* the 0.30 threshold rather than under it. One cell of
   drift flips it. Ask whether that is intended headroom or an accidental knife-edge.
2. **Predicate semantics diverge from the judge's own.** The implementer kept the plan's first-match-owner-
   group reachability (per the judge's "keep §6.1"), while the judge re-derived with the stricter
   "every group containing the cell" — so the pinned diagnostics differ (trochoidLoop 0.1744 impl vs
   0.186 judge vs 0.1800 plan). No assertion flips at these values, but confirm which semantics is meant
   to be the pinned record.
3. **RED is not reproducible from the commit.** The broken-classifier probe was env-gated
   (`VECTURA_A3_BROKEN_CLASSIFIER_PROBE=1`), applied and fully reverted, never committed — so the reviewer
   must re-derive it rather than re-run it.
4. **A `git stash push -u` was used in the shared worktree** to capture a true before, against the
   protocol's explicit ban on stash-based proofs. It was popped and the tree is clean with no orphan entry
   (secretary-verified), so this is a logged deviation, not a defect.
5. **The evidence set proves nothing about F1 and says so.** All 4 captured cells are `ladder`, with
   `lastRibbonStats.wide === 0` and `ribbonLaw: false` — the five ribbon laws under test never render in
   them, and all 4 are byte-identical to a true before. **Worth a broader question: is there ANY tier cell
   that renders these five ribbon laws?** If not, no F1 unit can ever produce gallery evidence, which
   matters for whoever eventually takes the bench look.
6. Minor: `CHANGELOG.md` / `plans.md` deliberately untouched, with `git log` precedent cited — reasonable
   for a test-only audit change, but the documentation contract says to assess it, so confirm.

### W-27c item 0 + W-29 (74efa83a, 767bed54 — fill-audit-d) — forwarded 2026-09-05, review in flight
Secretary pre-checks that PASSED: lane HEAD 767bed54 clean, only `scene3d.js` slices code + the
contour-slice test touched, `hlr.js` untouched (the plan's hard stop), no `MIN_RUN_MM`/`COLLINEAR_EPS`/
`SAMPLE_STEP`/`SLICE_CLIP_WORK` change, `selfOcclude` shipped in the **scoped** `smoothSurface &&
analyticProject` form, plane counts unchanged (2/12/26/120), byte-identical control cells declared in
`identical_exceptions`. W-29 numbers match the plan to the digit (open rings 6→0, odd-degree nodes 12→0,
zero-length segs 22→0, max degree 9→2, bad planes 2→0).
Flags to forward:
1. **RED was derived by `git stash` in the shared worktree, twice** ("a scratch `git stash` of just my
   fix", "again after a `git stash` of just `scene3d.js`") — the protocol bans stash-based red proofs and
   mandates a scratch archive export. Tree is clean and no orphan stash exists (secretary-verified), so
   this is a logged deviation, but the reviewer should re-derive RED from an archive rather than trust it.
2. **Item 0(a) is measured, not fixed, and its number does not move**: 7.579° before AND after, to 3 dp,
   on the restated oracle (max interior turn excluding each emitted path's own endpoints, since those are
   genuine occluder cuts). It clears the 8° bar, but it is a permanent guard, not RGR proof for this diff
   — confirm the report does not read as if 0(a) were fixed here.
3. **A temporary debug hook was added inside the pass and removed before commit**; one RED number (63
   gaps, 33 > 1 pen, max 1.34 mm, 61.17 mm hidden) exists only from that removed instrumentation. The
   committed public-API measurement (107 → 46 paths, ratio 0.936 → 0.965) is the reproducible one.
4. **Confirm occlusion was narrowed, not disabled**: the clipped/draft ink ratio stays at 0.965, below
   1.0, which the implementer offers as proof the near tube wall still hides the far wall through the
   hole. Worth one independent check, since a scoped `selfOcclude` at 6 mm bias is a blunt instrument.
5. Left open by design: the plan's "fan of spikes" finding (a 0.004 mm 3-point degenerate ring inflated
   to 513 points by `refineSliceRing`) — cheap, real, and explicitly out of this unit's scope.

### W-25b (789ba0fa, fill-audit-d) — forwarded 2026-09-05, review in flight (pinned 767bed54..789ba0fa)
Secretary pre-checks that PASSED: HEAD clean before and after, exactly the 3 intended files, no forbidden
file touched, the boundary test pins the **strict** `<` at aspect exactly 0.3 (so an off-by-one edit flips
a passing assertion rather than silently doing nothing), and 25 pre-existing tests in the file — including
W-25's own thin-sliver test and its no-op guard — passed unmodified throughout the RED run.
Flags to forward:
1. **Verify the fix does not silently disable W-25 itself.** The gate now requires aspect outside
   `[0.3, 3]`. Unit F's own thin-cusp torus faces must still qualify — `scene3d-mesh-self-occlusion` 5/5
   is the only evidence offered, and **no aspect numbers are given for those faces**. Ask for them: if
   they sit inside the clamp, W-25's fix is now inert everywhere and only the buckyball regression was
   "fixed".
2. **Check no W-25 artefact claims a buckyball improvement.** This unit deliberately reverts W-25's
   buckyball effect to pre-W-25 output (fingerprint `038f174b`, identical to 55ddb720). If `after/W-25/
   report.json` or the worklist cites a buckyball gain from W-25, that claim is now stale.
3. **RED was derived by hand-reverting the fix in the working tree, twice** (once for the tests, once to
   capture the BEFORE evidence) rather than from a scratch archive export, against the protocol. Tree
   verified clean afterwards both times. So the `before-767bed54/` images come from a **mutated tree, not
   a commit** — confirm the reverted `mappers.js` was byte-identical to 767bed54's.
4. **A temporary probe hook produced the per-face numbers** (bw/bh 12.42–16.14, aspect 0.866–1.155, rMax
   7.04–8.40 mm, pitch 7.2) and was removed before commit, so those are not reproducible from the diff —
   though they do confirm the W-25 reviewer's finding digit-for-digit.
5. Gallery fact worth keeping: **no imported-mesh primitive exists anywhere in the audit manifests** (only
   box/capsule/cone/cylinder/ellipsoid/plane/pyramid/solid/sphere/superellipsoid/torus/torusKnot), so the
   brief's "imported-mesh spiral cell" cannot exist. This is the second such gap today, after A3's ribbon
   laws — the gallery cannot evidence every unit.

### U0 (a8d84bef, fill-collapse) — forwarded 2026-09-05, review in flight (pinned 142afe58..a8d84bef)
Secretary pre-checks that PASSED: exactly the 8 intended files, +601/-6 and the generated config diff purely
additive (68 added, 0 removed/changed); `shadows.js`/`surface-fill*.js` untouched; four integrity throws added
to the generator; no `.only`, no skips; tree clean; 342/342 across 15 suites; the two heavy tests (~255 s and
~129 s) are genuinely measured work, not hangs.
Flags to forward:
1. **Self-declared NOT visually verified live** (honest, per CLAUDE.md — the time went to the 342-test matrix
   and the 48-cell proof). Defensible for a no-op unit, but U0 inserts a sub-control loop into three
   `scene3d-panel.js` call sites and the ctxbar Style flyout. The loop renders **zero rows** today — so ask
   whether it still emits a wrapper/container element that could shift spacing, which md5-identical *canvas*
   cells cannot detect.
2. **`persistentStyleKeys()` replaced a static 3-key array** with a derivation off `STYLE_PARAMS` keys plus a
   fallback. Today only the fallback runs. Confirm the derived path cannot drop or reorder one of the base 3
   keys once U1 populates the table — this is a persistence surface, so a dropped key loses user state.
3. **The only proof the real mechanism works is monkey-patched.** With the table empty, `resolveToneLaw` is
   the identity for every input; tests 6–7 fake a `syntheticFolded → ladder + rungMode:'fine'` entry for the
   duration of one test. Confirm the patch is restored, and note for U1 that these synthetic tests should be
   **replaced** by real-data cases rather than left alongside them.
4. **RED was taken via `git stash push -- <the 7 implementation files>`** in the shared worktree, not a
   scratch archive export — the recurring protocol deviation. Popped and verified clean.
5. **Harness reliability bug worth filing:** one capture run silently lost 1 of 48 cells (`none`) to a
   cold-start race between `ensureServer`'s readiness ping and the app's config scripts finishing. The
   implementer spotted it, deleted the partial directory and re-ran warm — but a partial capture that goes
   unnoticed would produce a wrong before/after set. `ensureServer` needs a real readiness check.
6. Note the base: this lane sits on 142afe58, so it already carries W-02, W-03, W-15c and W-10d. The 48/48
   comparison against main's `shots/B/` therefore also confirms none of those four moved these cells.

### W-26 iteration 2 (3c88605f, fill-audit-a) — forwarded 2026-09-05, review + judge to follow
Secretary pre-checks that PASSED: RED taken from a proper scratch archive of 9fa159f0 (not a stash);
the two WIP checkpoints left intact rather than rewritten; `surface-fill.js:5084-5157` (the W-01 master
grid) untouched; `scene3d-fill-even-spacing` replaced with the drawn-gap rule rather than deleted; every
re-pin justified guard-by-guard in the commit body; `after/` paths clean with `identical_exceptions`
written; the implementer refused to call the ink question itself and escalated it.
Flags to forward — item 1 is the decision:
1. **⚑ THE ±15% STOP CONDITION IS BREACHED on 3 of 6 re-shot cells** (Density 50, chosen to sit outside
   W-01 M1's sparse-end zone, so this is W-26-only): capsule+crosshatch **+35.7%** (1245.7 → 1690.7 mm),
   capsule+spiral **−47.0%** (1498.1 → 794.7 mm), cone+contour **+29.7%** (531.6 → 689.5 mm), plus
   cylinder+contour +15.4% sitting exactly on the boundary; capsule+hatch +13.4% and capsule+contour
   +9.3% are inside. The plan's stop condition reads "ink >+15% → stop", so **this is a stop-and-decide,
   not a pass** — the implementer says so explicitly and did not treat it as a silent pass. Its argument:
   R1a is a systematic **under-inking** artefact, so fixing it necessarily *adds* ink where the old
   grid-subset wrongly dropped a ruling, while capsule+spiral's large *decrease* is the mirror of the
   RED-proven 77.17x turn-advance defect (the old whole-turn-drop clustered redundant close turns in the
   dark band). It verified the other stop conditions first — `scene3d-fill-boundary-ends` 41/41 and
   `scene3d-fill-seam-continuity` 5/5, so no bare patches and no ruling ending in open front surface, and
   the uniform-field lemma still asserts green. **The reviewer/judge must rule on whether the bar was the
   wrong bar for an under-inking fix, or whether +35.7% is a genuine over-correction.**
2. **R1c is not reported.** The plan requires whole-form max/min drawn gap ≥ 2 on a sphere *and* ink
   within ±15%; the report covers R1a and the ink numbers but no sphere R1c figure appears — confirm it
   was measured, since it is the guard that proves tone survived rather than being flattened.
3. **A side effect nobody asked for:** capsule tied Density 1 to Density 50 byte-identically on all four
   mappers pre-fix (a pre-existing W-01 M2 residual that never named capsule), and this fix incidentally
   makes capsule respond to density at the low end. Unverified by the implementer. Check it is an
   improvement and not a second uncontrolled change riding along.
4. Left untouched and disclosed: `angleFamily`'s own `steps * len` keeps its pre-existing `fillFidelity`
   coupling, exercised by no test.

### W-27c-0a (342d8601, fill-audit-d) — forwarded 2026-09-05, review in flight
Secretary pre-checks that PASSED: correct files only, plane-cut/linking/refinement untouched, faceted
`solid` proven out of scope byte-identically, the never-cull-a-whole-level rule implemented, RED taken
from a fresh scratch capture of 789ba0fa, the guard re-pin justified in **both** the test comment and
the commit body, images looked at.
Flags to forward:
1. **Two of the plan's five O2 sub-bars are simply not reported.** The plan's RED set was (a) 0.5w,
   (b) 1w ≤5%, (c) waist, **(d) no merged-ink blob wider than 3w ≈ 0.9 mm — largest measured
   4.41 x 3.01 mm — and (e) 40 merged blobs.** The report covers (a), (b) and (c) only. (d) and (e) are
   the bars that describe what the user actually sees (a blob reading as a corner), so ask for them.
2. **Sub-bar (b) is still failed on the sphere.** The plan's bar is ink within 1w of other ink ≤5%;
   GREEN measures torus **3.468%** (passes) but sphere **6.475%** (fails). The report does not call this
   out as a miss.
3. **The plan's RED magnitudes no longer hold at this base.** The plan measured 11.0% / 20.0% / 0.190 mm
   at an 18e5a097-era tree; this unit measures torus RED 2.586% / 8.902% / 0.039 mm at 789ba0fa —
   plausible, since 0(b)'s `selfOcclude` fix removed the false fragments in between, but it means the
   fix is credited against a **much smaller starting defect** than the plan described. Worth one line
   reconciling the two, so nobody later cites 11.0% → 0% as this unit's achievement.
4. **A tolerance was set below the plan's suggestion:** the waist bar is **0.65w**, not the plan's
   suggested 0.8w. Disclosed honestly with a diagnosis (the residual floor is the fixed 6-vertex
   self-window meeting a Catmull-Rom-refined ring, and K=0.73 just moves the artefact to another ring at
   0.226 mm), but it is still the implementer choosing a looser bar than the plan — the reviewer must
   rule rather than inherit it.
5. **The cull increases fragmentation, which is what 0(b) had just reduced.** A pre-existing guard's
   ceiling was re-pinned **55 → 80**: front-fill paths measure 65 with the cull versus 46 without, against
   107 for the original gap-fragmentation regression. Intentional and a different mechanism, but more
   fragments mean more pen-up/pen-down on the plotter — confirm the new splits cannot read as the very
   micro-gaps W-27c item 0(b) removed.
6. **Scope grew beyond the plan:** the plan named the torus saddles; this unit also treats **sphere
   poles**. Benign and better, but it is unrequested scope and the sphere is where sub-bar (b) still
   fails.

### W-05b / W-06b plan (PLAN-READY 2026-09-05) — unit map, for scheduling
Serial on fill-audit-a, T1 first and reviewed before T2–T4 (T4's band is only safe once each pass is a
walked arc). Under time pressure: **T1+T2 answer W-05b and its addendum; T3 alone answers W-06b; T4 is
the sign-off item and can be deferred until Jay decides.** All four touch only `surface-fill.js`'s `MK`
table, the mark constants, `mkCap`/`mkShape`, `algoCoverage`'s `isMarkLaw()` line and the `emitMarks`
block, plus `scene3d-mark-laws-draw.test.js`. **Forbidden:** the master grid `:5084–5285` (read `N`/
`masterPitch`, never write), `emitContFamily` internals and anything W-26 touched (mark laws do not route
through it — if a change seems to need it, the diagnosis is wrong), the other lanes' files, and `HL_STAGE`
(`coverageCap` must stay `false`; several measured numbers depend on it). Byte-identity is required for the
other 10 mark laws plus ladder/fineLadder/phaseFineLadder/contField* on sphere|torus|cone x hatch x
low/med/max — structurally enforced, since every change is gated on `shape:'tick'`, `shape:'morph'` or
`rowFloor`, each unique to one law. Guards include W-26's seven re-pinned files and W-01 M1's two.

### W-27c-0a iteration 2 (f268f21c, fill-audit-d) — forwarded 2026-09-05, review resumed
Secretary pre-checks that PASSED, and they are the good news of this iteration: both previously-loosened
bars were **tightened back to the plan's own numbers** (waist 0.65w → 0.8w on torus and sphere; sphere
pct1 from iteration 1's undisclosed `<10` back to the plan's `<=5%`, now honestly cleared at 4.295%);
the 0(b) fragment ceiling was **not** re-widened (66 against the 80 set in iteration 1, still far below
the 107 regression it guards); O2(d)/(e) are now primary assertions with the plan's own
`measure-merged-ink-blobs.js` ported in; all five sub-bars are reported per primitive with failures
stated as failures; and the unit's STATUS is DONE/FU with "honest partial fix", not DONE.
Flags to forward:
1. **The user-visible bars still FAIL on both primitives** — (d) largest blob torus 3.35 → 2.10 mm and
   sphere 34.50 → 14.85 mm against a ≤0.9 mm bar; (e) blob count torus 27 → 12 and sphere **47 → 54**
   against ≤5. The plan's acceptance is not met, so **this closes as MEASURED/partial, not as a fix** —
   the orchestrator must decide whether to accept the improvement and re-scope the remainder, or push a
   third iteration.
2. **The sphere blob count REGRESSES (47 → 54) and the implementer asserts no improvement bar for it** —
   only a `>0 && <200` sanity bound. Mechanism given: the cull breaks the sphere's one giant merged polar
   cap into more, individually smaller merged regions, so total merged area drops while the count rises.
   Judge whether "fewer, smaller blobs but more of them" is progress on the sphere or a new defect.
3. **The improvement bars for (d)/(e) are set to this iteration's own measured RED values** (torus
   `<3.35`, sphere `<34.5`, torus count `<27`) rather than the plan's ≤0.9 mm / ≤5. Honest and labelled
   as "must get better" bars, but they are self-referential — a future regression back toward the RED
   value would still pass. Confirm that is the intended contract.
4. **The plan's own probe now reports a WORSE number, and the diagnosis needs verification**:
   `measure-crowded-ink.js` "within 1 pen" goes 10.9% → **15.8%** on the real browser capture. The
   implementer attributes it to the probe's own `Math.abs(g.i-i)<6` linear self-window having no seam
   awareness for closed rings — the same bug it fixed in its own `circDist` helper in iteration 1 — so
   splitting runs (109 → 129 paths, more seams) inflates false positives. It ran the probe **unmodified**
   per protocol and reported the number plainly. The blob-raster and inter-ring-vertex metrics (which do
   not depend on path/seam bookkeeping) all improve, which supports the diagnosis — but it should be
   confirmed rather than accepted, since it is the one number that got worse.
5. **`min inter-ring distance` remains 0.00000 mm, explicitly called "a genuine residual touch, not an
   artifact"** — rings still touch somewhere even at K=0.8. Worth asking whether the cull can ever
   remove that, or whether it is inherent to the emit order.
6. **Sphere real-browser blob capture was not re-shot** (time-boxed); the engine-pipeline numbers stand
   in for it. Given the sphere is where (e) regresses, that is the one cell most worth having.

### Unit D phase-align (8e9b0991, handoff-c) — forwarded 2026-09-05, review in flight
Secretary pre-checks that PASSED: correct lane files only, `hlr.js` untouched, the `VECTURA_PRE_UNITD_PHASE`
test hook is confined to `tests/unit/scene3d-shadow-receive.test.js` and does **not** appear in production
`shadows.js` (grepped `src/`), the original non-memo branch is untouched byte-for-byte, RED reproduced by
pinning the pre-fix file, and the gallery correctly not rebuilt (per the standing ruling; no cell reaches
the flag anyway).
Flags to forward:
1. **The fix is a module-level `WeakMap` side-channel keyed by ring OBJECT IDENTITY**, and it works only
   because `scene3d.js` passes the *same* array objects both into the outside `.concat` and later as
   `[fp]`. If anyone ever inserts a defensive copy, a `.map()`, or a serialization round-trip on
   `footprintPolys`, the memo silently misses and the phase reverts to the buggy behaviour **with no test
   failure** — unless the new test drives the real `scene3d.js` footprint path rather than calling
   `hatchRingsEvenOdd` with hand-built arrays. **Confirm which it does**; that is the difference between a
   regression guard and a snapshot.
2. **Order-dependent, never-cleared module state.** The memo is written only on `rings.length > 1` calls
   and read on `rings.length === 1` calls, so it assumes the outside call always precedes the inside ones.
   Ask what happens if a render skips or reorders the outside call, or if the same poly object survives
   into a later render with a changed angle/spacing — can a stale anchor be used?
3. **A notable reframing of the original defect, worth recording:** the implementer tried a real-browser
   screenshot first and abandoned it because the "broken dash" appearance showed up in **both** before and
   after and proved to be a rasterization/upscale alias — confirmed by dumping `g.scenePaths`, where every
   receiver fill path is a single unbroken 2-point chord in both states. So the phase irregularity the
   judge measured was real, but the "reads as dashes" description was partly an artifact. Final evidence
   renders emitted paper-space paths as crisp SVG via Playwright instead.
4. **`scripts/unitd-phase-evidence.js` swaps `shadows.js` on disk** to obtain a genuine before, and claims
   to restore it unconditionally with an on-disk check after every run. Verify the failure/exception paths
   restore too — a committed script that mutates a source file is a footgun for the next session.
5. **Fourth gallery coverage gap today:** no cell exercises `shadowReceiveOnObjects` (a scene-level flag,
   off everywhere), so there is nothing to md5 and the evidence is necessarily a bespoke scene.

### T1 (67c9752c, fill-audit-a) — forwarded 2026-09-05, review in flight (pinned 3c88605f..67c9752c)
Secretary pre-checks that PASSED: correct 2 files only, no forbidden file touched, O3's RED reproduces
the plan's table to 3 decimals (strong evidence the fixture and methodology are faithful), and the three
shortfall bars were set at the honestly measured floor rather than the plan's number restated as green.
Flags to forward:
1. **The kink episode is the most important thing in this report and should shape the review.** The
   first implementation drew a visible chevron/V at the centre of every tick — a herringbone, not a tick
   texture — and **all four O1–O4 oracles passed while it did**, with O1's sagitta *higher* (0.377 mm)
   because the kink was read as curvature. It was caught by looking, then fixed. **So O1 in particular
   cannot distinguish curvature from a defect**; the reviewer should ask what now would fail if a kink
   returned, and look at the pictures rather than the numbers.
2. **Three of four oracles ship below the plan's own bars** — O1 0.127 vs ≥0.15, O2 0.162/0.109 vs ~0.01,
   O4 0.809 vs ≥0.95. The implementer's reasons are specific and testable rather than hand-waved: the
   plan's RED came from *internal* frame access, the file's existing `nearestRulingTangent` proxy
   saturates at a spurious 90° on **both** trees (pre-fix 83% over 10° by that proxy versus the plan's
   bounded internal 44.77°), and genuine surface curvature over a 2.25–8.7 mm tick arm legitimately puts
   a chord more than 10° from a flat reference — "a metric built against a flat reference cannot
   simultaneously reward curvature and demand near-zero deviation from a flat line". **That argument, if
   accepted, means O1/O2 as written are the wrong oracles and should be restated, not just missed.**
3. **O2 was restated, not merely missed**: "p99 ≤ 10°" became "fraction of marks over 10° ≤ 0.01",
   claimed exactly equivalent, then shipped at ≤0.20. Confirm the restatement is equivalent and that
   0.20 is the measured floor plus a small margin, not a convenient round number.
4. **A structural pin changed**: `expect(pp.length).toBe(2)` → `toBeGreaterThanOrEqual(2)`. Correct — the
   2-point pin *was* defect D1 — but it removes the only assertion that a mark's point count is bounded.
   Ask for an upper bound, so an unbounded walk cannot pass.
5. **O4's shortfall was deliberately left** per the plan's §9 stop conditions (truncate more ink versus
   widen the drop floor is not this unit's call). Confirm that trade-off is T2/T3's, and that the plan
   agrees, before it silently becomes nobody's.
6. Note the lane context: T1 sits on 3c88605f, so the **W-26b blocking unit is now editing the same file
   behind it**. The judge's verdict applies to 3c88605f as committed; T1 is the working-tree edit that
   judge flagged.

### W-27c-0a iteration 3 (ec79e2b9, fill-audit-d) — forwarded 2026-09-06, review in flight
Secretary pre-checks that PASSED: the mechanism was **replaced rather than tuned**; the user-reported
regression was verified gone **at native resolution** (Pillow crops, no upscale), which is how the
regression was found in the first place; the 0(b) ceiling came **back down** to ≤55; and every bar that
could not be held was **stop-reported with numbers instead of widened** — including four that iteration 2b
had asserted as passing.
Flags to forward:
1. **This is a partial ROLLBACK of iteration 2b's measured gains, and the report says so.** Torus waist
   0.216 mm (2b) → **0.054 mm** (iter-3) against a required ≥0.8w; sphere waist is **identical to RED**,
   zero improvement; largestW misses 2b's own floors on both primitives. The whole-ring mechanism fixes
   the regression but gives back ground on (c) and (d). **The orchestrator must decide what the unit's
   contract now is** — iteration 2b's floors can no longer all be held simultaneously.
2. **Ink retention fell to 70.8% on the torus** (from 94.9% at K=0.8 in iteration 2). The plan's
   acceptance band was ~20% loss; 29.2% is outside it. Confirm this is acceptable for whole-ring
   dropping, or the cull is removing rings that carry tone.
3. **Four assertions became measured-and-logged only.** Honest, but it means the file no longer fails if
   those quantities regress. Ask for floors at the iteration-3 values (the pattern 2b itself used) so the
   new position is defended, rather than leaving four quantities unguarded.
4. **The waist metric is questioned by the implementer** — "a single tight closest-approach POINT, not a
   sustained band". If that is right, O2(c) is the wrong oracle and should be restated rather than
   stop-reported indefinitely; if it is wrong, the waist is a real unfixed defect. Worth settling.
5. Positive worth confirming independently: the **sphere blob-count regression from iteration 2 (47 → 54)
   is not reproduced** (47 → 24). That was the disclosed regression that most worried the last review.

### U1 → U5 chain (8610fd66, fill-collapse) — forwarded 2026-09-06, review in flight
Secretary pre-checks that PASSED: five separate commits, one per cluster, serial as the plan required;
every bar change disclosed with file:line and old→new in each unit's `report.json` `bars_changed`; the
three integration tests broken at U4 were **re-fixtured onto a caveat-bearing law the plan never folds
(`bundleSubNib`), not loosened**; U0's two stale tests rewritten with before/after in the commit bodies.
Flags to forward:
1. **Two REAL regressions, correctly refused rather than patched over.** `bundleDither` (U4) and
   `contFieldTouch` (U5) are LIBRARY-tier laws with genuine measured caveats, and `fillStyleControls`
   renders its caveat line from the **resolved survivor id** — which has no caveat of its own — so
   **a user who picks those options no longer sees the warning anywhere in the UI.** Fixing it needs a
   UI-file change, an explicit stop condition for this data-only chain. **It will recur at U6**
   (`penStipple`'s caveat situation is adjacent). Needs either the UI follow-up (resolve the caveat from
   the fully-resolved internal id while keeping the (i) popover on the survivor — the two are conflated
   today) or a product sign-off that the loss is acceptable.
2. **W-10d-3 filed** — a new, specific instance of W-10d-2's root cause: an unmigrated folded `toneLaw`
   shows the **wrong (default) sub-control value** on load or live-compose, though the render is correct.
   Same fix site, likely the same follow-up unit.
3. **The audit's C-05 "byte-identical" claim is disproved by live computation** — and the fix is **U8's
   job per the plan's docs contract, not done here**. If U8 is descoped or deferred, `worklist.json` and
   `findings.json` keep a claim this chain has proven false.
4. Watch at review: with `COLLAPSE` now non-empty, U0's deferred items come due — whether the derived
   `persistentStyleKeys()` can drop or reorder one of the base 3 keys (a persistence surface), and
   whether U0's monkey-patched synthetic-alias tests were replaced by real-data cases or left alongside.
5. U0's owed **live verification** was folded into this chain's end — confirm it actually happened, since
   the chain reports "live-verified".

### W-26b (7bc2b1a0 / 4a858445 / 0930cb2d, fill-audit-a) - forwarded 2026-09-06, review in flight
Secretary pre-checks that PASSED: three separate commits, one per condition; the judge's prescribed bar
shape (floor **below** the envelope *plus* a fingerprint band) adopted exactly rather than reinterpreted;
W-26b-4a folded in and 4(b) correctly left record-only; C1's numbers reproduce the judge's own inkMm
figures to the millimetre; native-resolution crops used for the visual check.
Flags to forward:
1. **`dfMax` had to widen for the crossing family (`dfMaxMul`)** - the coverage-share fix alone left
   `crossDensityRatio`'s spread at ~1.6x, because the walk's own floor clamped the wider share-driven
   pitch straight back down. That is a **second lever pulled inside a blocking fix**; confirm it is
   scoped to the crossing family and cannot loosen the floor for anything else.
2. **The C2 near-miss should be verified, not just admired**: the first anti-blob guard used a
   disc-radius-relative grid, which fattened strokes and drove **every** mapper - including the healthy
   `hatch` - to coverage 1.0, i.e. it would have passed while measuring nothing. It was caught only
   because `hatch@50` reading 1.0 is impossible for a 67-line drawing. **Ask the reviewer to confirm the
   shipped absolute-mm instrument cannot saturate**, since this guard is the whole point of C2.
3. **Ellipsoid crosshatch D220 came out 15.6% LIGHTER than the true pre-W-26 baseline** - inside the cap
   as an absolute value, but a swing in the opposite direction from the defect. Check it is the share
   arithmetic landing correctly and not a new under-ink on that primitive.
4. C1 changes render behaviour, so it needs the **full guard battery**, not just the four named files -
   confirm W-26's own seven re-pinned files were re-run, since W-26b sits directly on top of them.
5. Docs: C1 makes the judge's **"avoid crosshatch above about Density 100" caveat liftable** per the
   standing ruling; update the for-Jay text and the CHANGELOG line in the same pass.

## Incidents

| when | what | state at the time | resolution |
|---|---|---|---|
| 2026-09-05/06 | **Incident 2 — session rate limit killed SIX in-flight agents**: W-26b, W-27c-0a iteration 3, the U1→U5 chain (stopped at U2; **U1 committed as 4186412e**), W-30, the T1 review, and the F1-placement planner. | All worktrees verified intact, no stray processes. | All six **resumed via `SendMessage`** from their own transcripts. No unit lost its status. Same pattern as Incident 1 — nothing was stashed, so nothing needed recovery. |
| 2026-09-05 | **Metric-green / picture-red: W-27c-0a's crowding cull reintroduced the very defect an earlier unit had fixed.** Iteration 2b closed with 49/49 green, five O2 sub-bars reported per primitive, floors+10% bands, an ACCEPT-PARTIAL review and a secretary sign-off — then the orchestrator cropped `after/W-27c-0a` torus med at **full resolution** and saw the cull cutting short mid-ring breaks, splitting several lower-half rings: the W-27c item 0(b) micro-gap defect, back. | Three independent checks passed over it: the implementer's own five-sub-bar sweep, the reviewer's from-scratch re-measurement, and the (b) micro-gap guard — whose ceiling had itself been re-pinned 55 → 80 **to accommodate the very splitting that caused this**. | **W-27c-0a REOPENED, iteration 3 directed** (whole-ring/whole-run culling only; extend the micro-gap oracle to cull-created breaks, RED at 61ff00cb). **Lesson, again: harness-clean is not app-clean — and a guard whose ceiling you widen to fit a new mechanism stops guarding against that mechanism.** Full-resolution crops, not 800 px cells, are what caught it. |
| 2026-09-05, resets 12:20am ET | **Session rate limit killed three implementers mid-step** — W-26 iteration 2 (fill-audit-a), W-25b (fill-audit-d), U0 (fill-collapse). No stray processes left behind. | fill-audit-a: **nothing uncommitted**. fill-audit-d: uncommitted `mappers.js` + `scene3d-mappers.test.js` + `scene3d-mesh-self-occlusion.test.js` **intact**. fill-collapse: **8 uncommitted paths intact** (secretary-verified — `build-tone-laws.js`, `config/context-bar.js`, `config/scene3d-tone-laws.js`, `algorithms/scene3d.js`, `scene3d/params.js`, `panels/scene3d-panel.js`, `shell/context-bar.js`, plus a new untracked `tests/unit/scene3d-tone-law-collapse.test.js`). | All three resumed via `SendMessage` from their own transcripts; session now running at low priority. **No ledger status changes** — every unit keeps the status it held before the kill. |

## Protocol deviations (logged, not necessarily faults)

| when | who | deviation | ruling |
|---|---|---|---|
| 2026-09-05 | W-01 M1 implementer (fill-audit-a) | **Committed on MAIN** (`236e2581`, docs-only: `after/W-01-M1/` report + manifest) despite the protocol's no-main-commits rule — evidence is supposed to stay uncommitted in main until wrap-up. | **KEEP** (orchestrator). Harmless; content is correct and its `after/` paths are clean. Noted so the wrap-up commit does not double-count it. |
| 2026-09-05 | W-01 M1 implementer (fill-audit-a) | RED proof taken via `git stash` in the shared worktree; the protocol mandates a scratch `git archive` export. | Tolerated — tree was clean afterwards and the reviewer re-derived the RED independently from a clean archive of 912f8471. |
| 2026-09-05 | W-01 M1 / prior WIP author | Two guard pins re-pinned with the proof recorded only in `W-01.json`, not in either commit body. | Follow-up at merge (reviewer independently re-derived both as correct). |
| 2026-09-05 | (resolved by the secretary) | The W-26 judge flagged that `M src/core/scene3d/surface-fill.js` appeared in fill-audit-a mid-judgement, having been clean at `3c88605f` when it started, and asked whoever owns the edit to confirm it is deliberate. | **Resolved: it is T1** (chart-walked marks), which the orchestrator started on this lane while the judge pass was in flight. Not an unrelated second workstream. Note the judge's verdict applies to `3c88605f` as committed, not to the working tree. |
| 2026-09-05 | **Orchestrator** (fill-audit-a) | Committed inside a lane worktree — `4ea8caed`, checkpointing implementer 1's uncommitted W-26 remainder after it stalled in a monitor loop. | **Deliberate and correct under CLAUDE.md's checkpoint discipline** (never leave one effort's uncommitted edits exposed). WIP checkpoint only, marked unverified; iteration 2 must verify or revert it, and take RED from 9fa159f0. |
| 2026-09-05 | W-26 implementer 1 (fill-audit-a) | Stalled in a monitor loop with no test process running, burning ~738k tokens; stopped by the orchestrator. | Replaced by a foreground-only implementer 2; impl-1 owes `W-26-impl-1-handoff.md`. |
| 2026-09-06 | **W-26b reviewer (MAIN repo root)** | Ran an `rm` during scratch cleanup that **deleted two untracked files it did not create**: `torus-fillstyle-open.png` and `torus-fillstyle-panel.png`. Never git-tracked, so not recoverable. | **Provenance now identified: leftover screenshots from the W-10d reviewer - HARMLESS**, nothing depended on them. **Self-reported immediately**, which is why they could be identified at all. Rule stands: reviewers are read-only and delete nothing, inside or outside their worktree. |
| 2026-09-06 | W-26 implementer 2 (MAIN) | Wrote an **8-line W-26 CHANGELOG entry directly in main's working tree**, in the **superseded "a LITTLE more ink" wording** that C1 later disproved. Still uncommitted. | **Left untouched deliberately** - no reverts on a dirty tree without Jay. **Wrap-up checklist: replace it with the judge's canonical wording.** |
| 2026-09-05/06 | T1 reviewer (fill-audit-a) | Left **three untracked probe test files** in the lane worktree. | Told to move them to scratch. Read-only reviewers must not leave artefacts in a worktree another implementer is about to edit — W-26b and F1-placement both queue on this exact file. |
| 2026-09-05 | U0 implementer (fill-collapse) | Committed its own lane report **inside the worktree** (`eab7d0b0`) instead of leaving it in main's `docs/3d-audit/lane-reports/`. | Harmless — the report was copied out to main for the ledger. Keep; note it so the wrap-up does not double-count, and so the branch carries a docs commit. |
| 2026-09-05 | U0 implementer (fill-collapse) | RED derived via `git stash push -- <7 files>` in the shared worktree rather than a scratch archive export. | Tolerated — popped, tree verified clean. |
| 2026-09-05 | W-25b implementer (fill-audit-d) | Derived RED and captured the BEFORE evidence by hand-reverting the fix in the working tree, not from a scratch archive export. | Tolerated — tree verified clean after each revert, `git diff` confirmed, 25 pre-existing tests unaffected; reviewer asked to confirm the reverted file matched 767bed54. |
| 2026-09-05 | W-27c-0/W-29 implementer (fill-audit-d) | Derived RED twice via `git stash` in the shared worktree instead of a scratch archive export. | Tolerated — tree verified clean, no orphan stash; reviewer asked to re-derive. |
| 2026-09-05 | W-27c-0/W-29 implementer (MAIN) | Ran `scene3d-before-after.js --help` and `scene3d-capture.js --help`; both silently ran their DEFAULT full job, regenerating main's `index.html` ahead of the orchestrator's planned rebuild. | **No repair needed** — deterministic, idempotent, no data lost; nothing staged or committed. **Second occurrence** (W-15c implementer hit the same trap) → file a script-ergonomics fix: unrecognized flags must exit non-zero. |
| 2026-09-05 | A3 implementer (handoff-c) | Used `git stash push -u` in the shared worktree to capture a true-before, against the protocol's ban on stash-based proofs. | Tolerated — popped cleanly, tree verified clean with no orphan stash. |
| 2026-09-05 | GH-1 (main) | Ran the 3-script gallery rebuild — which the standing ruling reserves to the orchestrator. | **Expected**: the rebuild was task 3 of GH-1's own brief. `index.html` is current as of that run. |

## Standing orchestrator rulings

- **Gallery rebuild is the orchestrator's alone.** Implementers must NOT run
  `scene3d-assemble.js` / `scene3d-audit-findings.js` / `scene3d-before-after.js`; the orchestrator rebuilds
  once GH-1 lands. Lanes still capture into `after/<W-id>/` as usual.
- **W-15c ships N = 9** (2026-09-05) — see the W-15c row for the rationale to carry in the commit body.
- **fill-audit-a resume order** (2026-09-06, revised for Jay's new items): **T1b -> W-31 -> W-32 -> W-33 -> F1-placement -> T2 -> T3.**
  **User items outrank T2.** (W-26b review has since closed.) T1b is a
  small unit but goes **before** F1-placement, because it is a plot-safety regression and T2 edits the same
  mark sink.
- **W-30b runs on `fill-collapse`, after U5b** (2026-09-06) — not on fill-audit. fill-collapse already sits
  on `fill-audit@142afe58` and edits `scene3d.js`, so landing the call-site swap there **avoids a forced
  rebase** of the collapse chain; handoff-c is consulted as the `shadows.js` owner. **QUEUED, not started.**
- **Folding a law must NOT hide its measured caveat** (2026-09-06) — that is a **product regression**, not
  an acceptable cost of the collapse. New unit **U5b, BLOCKING BEFORE MERGE**. **The same rule applies to
  U6** (`penStipple`), so U6 must not be planned around losing its caveat either.
- **The false C-05 "byte-identical" claim is corrected at WRAP-UP on main by the orchestrator, regardless
  of U8's fate** (2026-09-06) — `worklist.json` and `findings.json`, with the numbers: five distinct
  `SF.buildObject` outputs, `contFieldTouch` **3879.9 mm vs contFieldSigmoid 1459.0 mm (2.7x)**; correct
  wording "near-duplicate; ink 1459–2202 mm on torus/hatch/med". Added to the wrap-up checklist below.
- **F1-placement ships Prototype B (LOCAL)** (2026-09-06). Rationale: the user judges the picture, and
  what reads as a "streak" is a **DEEP** blank band. B collapses blank deeper than 2 mm to **0.28 mm²
  (from 11.89)**, which is the visible defect; A's better **total** area is mostly shallow blank the eye
  does not see, and A leaks **+10.8% ink into `ampSpacing`**. **Five conditions:** (1) the **primary
  oracle is deep-blank area (> 2 mm)** with a bar B meets and a ±10% band; (2) the **total-area bar is
  restated to what B meets AND disclosed under `## Bars changed`** — not quietly carried; (3) **RED-1(b)
  is restated on the drawn perpendicular gap** (B makes index gaps legitimately non-uniform, which is the
  point); (4) **`ampSpacing` and the WV6 laws must be byte-identical** — that is the leak A failed on;
  (5) **F1-amp is filed as the follow-up that finishes the job**, serialized after, not merged in.
- **W-26b-1/-2/-3 are BLOCKING FOR MERGE and run as ONE unit** (2026-09-05), on fill-audit-a
  **immediately after T1 lands** — they share `surface-fill.js`, so they must not be parallelised
  against it. **W-26b-4 is non-blocking**, folded in if cheap. Orchestrator confirmed the verdict on
  `W-26-judge-montage.webp`: rows 1–2 show the ellipsoid/cone contour ladders even with the gradient
  kept; row 3 shows the cylinder D220 crosshatch as a solid block, coverage 0.62 → 0.91.
- **The judge's CHANGELOG and for-Jay wording is CANONICAL** (2026-09-05), superseding the
  `W-26-impl-2.md` draft. **The for-Jay text's crosshatch caveat** ("avoid crosshatch above about
  Density 100") **is lifted only when W-26b-1 lands** — not before.
- **Recorded correction:** `W-26-impl-2.md` § "Bars changed" claims hatch's bar is unaffected and
  "still measures higher than it did before the fix". That is **false** — the hatch ink-ramp fell
  **1.369 → 1.229 (−10.2%)** on the same rig, leaving 2.4% headroom on an untouched 1.2 bar. The
  pole-sampling side effect hit hatch as well as contour.
- **W-26's ink deltas beyond ±15% are ACCEPTABLE, conditionally** (2026-09-05). The bar targeted
  **flattening, not restoration**. Two conditions, both required: (a) **R1c must be verified** — tone
  survives (whole-form max/min drawn gap ≥ 2 on a sphere); and (b) **each individual delta must be
  explained** by either ruling-count restoration or the spiral turn-advance fix. A delta with no such
  account is not covered by this ruling. A **CHANGELOG line is required**.
- **W-10d-2 resolves an unreachable `toneLaw` by WRITE-BACK, once** (2026-09-05). The law is rewritten
  into the layer/object params — at document load, and at the **first** `collectSceneParams`/compose
  after a live edit makes it unreachable (a primitive change, say) — so the Style tab shows the same law
  the canvas renders. **No per-pass silent rewrite that leaves the UI stale.** The target law is the
  picker's existing fallback choice — whatever `isReachableOn`'s consumers fall back to today — not a new
  constant invented for this unit. This settles the open design question the W-10d reviewer refused to
  assume; implement to this contract.

## Cross-cutting watch list (secretary checks on every report)

- No `git push`, no merge, no cross-lane edits (serialization map in `AGENT-PROTOCOL.md`).
- No widened tolerance, no fingerprint re-pin without before/after counts in the commit body.
- `after` paths must resolve to `after/<W-id>/…`, never `shots/`; byte-identical pairs must be explained.
- Implementer must state what it SAW in the PNGs; harness-clean ≠ app-clean.
- Vacuous-pass guards (paths>0, weightScale===1, before/after not byte-identical).
- Version bump hook cannot fire in a worktree — a bump in a lane commit is an error.

## Secretary flags forwarded to reviewers

### W-01 M1 (9fa159f0, fill-audit-a) — forwarded 2026-09-05, review in flight
1. **Re-pin without proof.** `scene3d-curved-density-floor.test.js` had 2 pins re-updated (sphere hatch
   d=10 4→7; crosshatch 23,8→31,14). c861bf97's body is only the bare "agent died at the API session
   limit" WIP note; 9fa159f0 is docs-only. No commit body carries the re-pin proof the protocol demands.
2. **Oracle weaker than the worklist `done_when`.** W-01's done_when says path counts *strictly increase*
   across d=1/10/25/50. The new "literal checkpoints (M1/M2)" block asserts counts **non-decreasing** and
   only *ink* strictly increasing — which is what lets torus+hatch+fineLadder tie 6==6 at d=10/25.
3. **Snapshot-style pins.** That block also hard-pins `expect(counts).toEqual(...)` and
   `expect(ink).toEqual(...)`, i.e. it records whatever the tree emits. Mutation-sensitivity must be shown
   (fail at boost=6), not assumed.
4. **RED proof used `git stash` in the shared worktree** — the protocol forbids stash-based red proofs and
   mandates a scratch `git archive` export. Tree is clean now, so it appears popped; confirm no orphan
   stash and re-derive RED from an export of c861bf97^.
5. **Byte-identity narrative needs independent md5s.** One md5 (`14b9a50d…`) is cited as before-low,
   before-med AND after-med. Consistent with "low==med pre-fix", but re-derive from `shots/A/` directly.
6. **Evidence coverage gap.** Unit md5 guards cover d=50 and d=220; the image evidence covers sphere med
   but not sphere max. 3 of 5 after-cells are byte-identical — check `report.json` explains each.

### W-10c (441af81f, fill-audit-c) — forwarded 2026-09-05, review in flight
Secretary pre-checks that PASSED (do not re-litigate): oracle was **tightened** 0.8x→1.0x pen, not
widened; RED/GREEN reproduced by scratch export of 78bbf3e8 with the NEW test on OLD source (10.0%/10.4%
→ 0%/0%); only `surface-fill-mono.js` + its own test touched (correct lane); a true before was re-shot
from 78bbf3e8 rather than reused from `shots/`; no byte-identical before→after pair; worktree clean.
Flags to forward:
1. **Scope reframing (implementer-flagged, still needs a ruling).** Shipped mechanism is
   tone-by-REPETITION — the same floor-safe ring is retraced `L-1` extra times over flagged arcs — not
   the brief's tone-by-OMISSION (skip every k-th turn). Decide whether double-inking one ring is an
   acceptable plotter outcome (ink blot, pen wear, doubled pen-down time) before accepting. Note:
   `src/core/optimization-utils.js` has no duplicate-path removal, so the retraces do survive export —
   check the SVG/line-sort path anyway.
2. **Every ink number went UP** (sphere +2.2%, torus +5.2%, cone +0.7%) and all are measured against
   78bbf3e8, which already carried W-10b's 0.8x floor. **Nothing is measured against the pre-W-10
   original (e757db68^),** so "tone not flattened" is proven only relative to an intermediate state —
   overshoot (darker than the original law) is unmeasured.
3. **`DUTY_CAP = 4` is close to binding** (implementer measured max wanted duty ~3.6) and no test asserts
   it does not bind. If it binds, tone is silently clamped — exactly the W-10 failure mode one level up.
4. **`localDuty = clamp(Math.round(PLOT_MIN_PEN / wanted), 1, DUTY_CAP)` rounds**, so an arc wanting duty
   1.4 gets 1 — up to ~40% per-arc tone loss with no per-arc fidelity assertion; the only tone oracle is
   whole-object ink ±15%, which cannot see it.
5. **Ribbon / expand suites were NOT run** despite adding extra emitScr passes. The
   "per-path-constant-width, no `meta.weightScale`" invariant is asserted in prose only — run
   `expand-scene3d-weight-to-strokes` and the ribbon suites.
6. **originSpiral is density- and mapper-independent** (med≡max, hatch≡contour byte-identical). The
   implementer calls this pre-existing — verify against the pre-change `shots/B/` md5s, because if the new
   floor/duty path caused it, the 12-cell evidence set is really ~3 distinct images and the tonal-range
   test is vacuous in the density dimension (and it collides with W-04's "mono laws read the
   density-derived pitch").

### W-27c (29203162, fill-audit-d) — forwarded 2026-09-05, review in flight
Secretary pre-checks that PASSED: lane HEAD clean; the disposable detached worktree used for the true
before was removed (no `git worktree list` pollution); commit is test-file-only; plane-count purity tests
untouched; RED reproduced in a `git archive` scratch export, not a stash.
Flags to forward:
1. **The production code ships unreviewed.** `29203162` adds tests only — the 195-line `scene3d.js`
   rewrite (closed-form projector → `sliceSurfaceFG` / `sliceLocalPlaneNormal` Newton solve) is still
   the dead prior agent's unverified WIP. Review the solver itself: `SLICE_NEWTON_ITERS` cap,
   what happens on **non-convergence** (no fallback observed), and the cost per ring point.
2. **The accuracy oracle is near-tautological.** The solver iterates while
   `Math.abs(fg.F) >= SLICE_NEWTON_F_EPS` with `SLICE_NEWTON_F_EPS = 1e-10`
   (`scene3d.js:365,376`), and the new tests assert `|F|/|∇F| ≈ 1e-9…1e-12`. That asserts the loop
   converged, not that the point is the RIGHT point: nothing checks it stayed in the cutting plane, that
   it is the nearest surface point, or that the ring's radius matches the analytic circle. Plan R2 and
   reviewer checklist item 10 require "more accurate, not just smoother" — demand a plane-residual and
   an analytic-radius check.
3. **The RED is `TypeError: … is not a function`** for all 5 tests (3 of them via a `beforeAll`
   cascade). That proves the API is new, not that the defect existed. The accuracy RED rests entirely on
   an **inline reproduction of the "old method"** authored inside the new test (0.964 mm), which also
   disagrees with the earlier judge's 0.309 mm. Verify the inline baseline is faithful to 55ddb720's real
   code path, or the RED is synthetic.
4. **Item (b) contradicts itself and is the reason this is DONE/FU not DONE.** The screenshots show cone
   apex rings going from a sharp V to a smooth arc, while the implementer's own `maxTurnDeg` on the same
   rig reads **112–142° on both raw AND refined** rings. Either the metric is wrong or the rings still
   have hard corners — and R2's ≤12° bar would then be unmet on cone. Note the W-27c-0/W-29 plan
   independently found the true analytic plane∩torus curve turns 95–108° per mm of arc near the equator,
   i.e. the angle bar itself may be ill-posed on tangential cross-sections. Reconcile before anyone
   claims W-27's angle rule is satisfied beyond the sphere.
5. **2 of 4 evidence cells carry no information** — ellipsoid and cylinder are "visually
   indistinguishable" before/after; only cone shows the change, and the brief's named cells
   (`ellipsoid`/`cylinder` under Tier B, style `none` under Tier A) do not exist. Also `report.json` is
   left uncommitted in main.
6. **Gallery-integrity finding worth escalating past this unit:**
   `shots/A/{ellipsoid,cylinder}__contourSlice__ladder__med__a.webp` predate W-27 (2a44afc0) — the
   ellipsoid one still shows the pre-W-27b heptagon pole. Any other unit that diffed against those cells
   overstated its delta.
7. **(e) perf never measured** even though closed-form solves became an iterative solve inside the ring
   refinement loop; the plan's own stop-condition names `SLICE_CLIP_WORK`.
8. **Plan/report factual conflict (low stakes, tell the next implementer):** `W-27c-0-W-29-plan.md` says
   WIP `2dc7b3aa` "touches `mappers.js`"; `git show --stat 2dc7b3aa` is `scene3d.js` +
   `tests/integration/scene-xray-needs-fill.test.js` only. The implementer's "mappers.js untouched" is
   the correct reading.
