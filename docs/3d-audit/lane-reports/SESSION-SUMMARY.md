# 3D fill audit — SESSION SUMMARY (round 1: 2026-09-05 → 06 · round 2: 2026-09-06 19:05 EDT →)

**ROUND 2 IS COMPLETE AND MERGED (local only). Integration is `4421d514` on `3d-scene/integrate-r2`, v1.4.1 — awaiting the fast-forward onto `main`. NOT pushed.** Round 1 is closed: all units landed,
reviewed, and merged into local `main` at `817424dc`, with the docs wrap-up at `6ad1d93e` and the ledger
record at `47a5a755`. **The seven round-1 `3d-scene/*` lanes are historical**; round 2 runs in five NEW
worktrees branched off `main` — map and first-unit briefs in `ROUND2-BRIEFS.md`, queue in `LEDGER.md`
§"Round 2".

> **⚠ MAIN MOVED (2026-09-08).** Another session released **v1.4.0** (`af24d3d9`) and added three CI test
> commits: `e429cfc5` (chunked U0 sweeps — **edits `tests/unit/scene3d-tone-law-collapse.test.js`**),
> `1193cbe1` (rounding for byte-identity/golden comparisons, arm64 vs x86_64) and `88041036` (vitest
> timeouts 60 → 180 s). `main` is `a7d39601`; `origin/main` is `88041036`, so main is **ahead 1** — only the
> docs checkpoint is unpushed. **The merge must rebase the round-2 lanes onto ≥ `88041036`, bump from 1.4.0
> (not 1.3.99), and hand-merge `scene3d-tone-law-collapse.test.js`, which now has THREE independent authors
> (`e429cfc5` on main, U9 `fc8b0fba`, U5b-2/3 `eea613fd`).** Nothing is rebased yet. Detail in `LEDGER.md`
> §"MAIN MOVED" and the merge-checklist additions beside it. Main being **ahead 1** is expected: the docs
> checkpoint stays local until Jay says push.

Detail: `LEDGER.md` (per-unit rows, secretary flags, standing rulings, incidents) · `STILL-OPEN.md` (full findings).

> **P0 (W-26, the user's ladder-gap rule) is CLOSED — the judge's three blocking conditions are met and independently verified.**

---

## 1. LANDED & REVIEWED

| unit | lane | sha | outcome (before → after) |
|---|---|---|---|
| W-15c triage | fill-audit | `6d6b1b78` | Design C **REVERTED** — broke 6 files / 7 tests and failed its own oracle. |
| W-01 M1 | fill-audit-a | `9fa159f0` | Boost 6→4.1. Torus ladder `[4,3,4,10]` → **`[3,5,7,10]`**; d=50/220 byte-identical (8/8 md5). |
| W-10c (+iter 2, 3) | fill-audit-c | `e6b85de4` | Floor 0.8→**1.0×pen**, under-bar gaps 10.0%/10.4% → **0%/0%**. Cone/sphere gain; **torus wedge worse (73.9→87.8%)** — kept, hidden by W-10d. Iter-3 **BLOCKED**: no primitive id reaches the mono sink. |
| W-15c | fill-audit | `8bd1581b` | Solo-orientation gate. Plane rulings `3,3,3,3` → **`6,6,7,9`**; gap 8.549→**3.149 mm**; integration 1929/1929. |
| W-10d | fill-audit | `142afe58` | originSpiral greyed on torus in the picker. Does **not** reach saved documents. |
| W-25b | fill-audit-d | `789ba0fa` | Floor scoped by aspect. Buckyball **byte-identical to pre-W-25**; Unit F still floored (102/288 calls, aspect 0.177). |
| W-27c | fill-audit-d | `073202a4` | Newton projector + divergence guard. Ellipsoid 0.964 → **9.8e-10 mm**; a 61.65 mm runaway killed. |
| W-27c 0(b) + W-29 | fill-audit-d | `767bed54` | Torus false fragments 107 → **46 paths**; buckyball open rings **6 → 0**. |
| W-25b / W-27c-0a | fill-audit-d | `ec79e2b9` | See §2 — iter-3 **REJECTED/PARKED**, commit kept for ring integrity. |
| A3 | handoff-c | `d86cbf8d` | **MEASURED** — 0.000 mm² dropped, 89–98% pen-unreachable; oracle split shipped. F1 **not** closed. |
| Unit D phase-align | handoff-c | `8e9b0991` | Phase-locked: worst offset **0.1929× → 9.8e-15**, density 3.0× (bar 1.4×). |
| W-30 | handoff-c | `0d405577` | Per-light-type projector — correct, tested, additive. **UNREACHED until W-30b: no user-visible effect yet.** |
| GH-1 | main (uncommitted) | — | Script hardened (hard refusal + unexplained-identical WARN); `after/W-10` restored; 2 pointer bugs fixed. |
| U0 | fill-collapse | `a8d84bef` | Collapse foundation, provable no-op: **48/48 md5**, 48-of-48 mutation kill, 335/335. |
| U1→U5 | fill-collapse | `8610fd66` | Roster **48 → 35**. **18/18 md5-identical** (re-captured); C-05 confirmed picker-tier only (5/5 distinct renders). |
| T1 | fill-audit-a | `67c9752c` | Chart-walked marks. Refusal **0.20–0.61 → 0.005–0.007**; O1/O2 shortfalls analytically **bounded**. |
| **W-26 (P0)** | fill-audit-a | `3c88605f` | **CLOSED.** Gap jump **2.00 → 1.03–1.17**, spiral turn-advance **77× → 1.05×**, +1.4% ink, R1c 21.20→19.91. |
| **W-10d-2** | fill-audit-2 | `79b626d2` | **Contract A, curated**: only `torus` + surface-fill mapper + `originSpiral` writes back, once. 167/167, **48/48 byte-identity**, blast-radius negative holds. |
| **W-33** | fill-audit-a2 | `c6ff81de` (closed) |
| **W-30d** | fill-collapse-2 | `83d1e021` + `54816268` + `9aad87b8` | **The torus footprint now shows its hole** (F2a): centroid ratio 2.869/3.021 → **0.916/1.000** while the solid annulus band stays shadowed at 2.669/2.741. Thin-torus **blank void** filled by a graded inward search. Convex casters pixel-identical. |
| **W-30c** | fill-collapse-2 | `1e528b94` + `79c07770` | Area-light penumbra restored (0 mm → soft-edged); **the torus's receive shadow, which rendered as no shadow at all (ratio 1.000), now reads 2.869/3.021**; and an ambient light at index 0 no longer deletes a positional light's footprint. No bars changed. |
| **W-35** | fill-audit-d2 | `323e2583` | New **`sliceEndOverlap`** control (−2..8, **default 0 = byte-identical no-op**) for the facet-quantised front/back cut. 30/30 + 181/181 + 37/37, **no bars changed**. |
| **W-33** | fill-audit-a2 | `c6ff81de` | Contour FILL rulings brought **≤ 8° in device space** (C1 31.24°/38.35° → ≤8; C2 18.46–23.25° → ≤8). Root cause was structural: **refinement ran before the seam join**, where the join vertex is exempt from each half's turn check. |
| **U8** | fill-collapse-2 | `2d931b1a` | `onePenDown` folded into `interlockWeave` under `penDown`; roster **34 → 33**. Byte-identity 9/9 (dimensioned) + 18/18 md5; both caveats survive. Corrected counts: **51/51 row, 447 total**. |
| **U7** | fill-collapse-2 | `90f3411f` | `weaveDepth` folded behind a **"Nesting"** sub-control; roster **35 → 34**; 418/418. Byte-identity **double-proven** — a primitive×density resolver sweep (9/9) plus a cross-tree real gallery capture (18/18 md5). First fold where **both** survivor and folded id carry their own distinct caveats. |
| **W-36** | fill-audit-a2 | `e31d8591` | The crossed pair now spends **one shared coverage budget split by the dial**. Gap ratio B:A **5.4–31.2× → 0.814–1.061**; **Jay's cell A 17/B 3 → A 9/B 11**. Cylinder d=220 total preserved (106 vs v1.3.98's 108), now 50/50. P5 holds at 5209.5 mm against a 5649.5 cap. |
| **W-34** | fill-audit-d2 | `fe491dfa` | Refinement stop condition moved to **device space** (Fix A) + a **capsule closed form** (Fix B, fired because T3 came back RED at 297% excess). Capsule **32.42 → 8.37°/mm** against an 8.17 truth (2.56% excess); **cone chevron unchanged — 76.4° emitted vs 76.4° analytic, real geometry.** 14/14 byte-identical incl. cone/cylinder; 0(b) ceiling unmoved at 36/55. |
| **W-27c-0a iter-4** | fill-audit-d2 | `c6dd6130` | Cull re-scoped to ≥2 distinct levels. Ink retention **70.8% → 96.2%**, retention floor TIGHTENED 0.6 → 0.9, lower band an **exact scanline match** to before. **Reviewer ACCEPT-WITH-FOLLOWUPS** — every number reproduced; the four widened bars are honest but **structurally toothless against this mechanism**; the report's root cause **REFUTED**. |
| **U9-2** | handoff-c2 | `ed778940` | Evidence script → `scripts/audit/` (byte-identical re-run) + the first real bar on the folded-id `shadowPathCount` delta: floor `>1` below a measured 2–4 drift envelope, ±10% band `[3.6,4.4]`, mutation-proven (3/23 fail under the inverse of the U9 fix). All bars NEW. |
| **U5b-2/3** | fill-collapse-2 | `1e681432` | Audit prose → plain user copy on both folded caveats; generative `effectiveLaw` ↔ `resolveToneLaw` cross-check in a new, rebase-friendly file. 59/59 + 2/2 + 144/144; **no bars changed**, no wiring touched. |
| **U9** (resolve half) | handoff-c2 | `fc8b0fba` | Shadow bag no longer clamps folded ids before `HATCH_LAW_RECIPES`. **22/22 new tests; reviewer ACCEPT-WITH-FOLLOWUPS** — the six rewritten collapse assertions proven **STALE** (they pinned a real pre-existing defect as a feature). Visually near-identical (+2.7% lines) — honest but weak; follow-ups → U9-2. |
| **W-26b** (C1+C2+C3+4a) | fill-audit-a | `7bc2b1a0`/`4a858445`/`0930cb2d` | Crosshatch **9326.7 → 5153.7 mm (+4.9% vs pre-W-26)**; `crossDensityRatio` 1.12× → **2.3×**; tautology guard replaced; three coin bars → floor + band. |

## 2. IN FLIGHT — NONE (round-2 lane work is EXHAUSTED, 2026-09-10)

All five lanes are final and merged. Nothing is in flight but the **merge review**
(`a7d39601..4421d514`; content completeness per lane and the four bar edits are gating).
Everything still open is a **Jay decision (§4, nine of them)** or a **round-3 unit (§3)**.

One unit was rejected and reverted rather than shipped:

| unit | lane | sha | state |
|---|---|---|---|
| **T2** (variable-length ticks) | fill-audit-a2 | reverted at `94cca882` | **REJECTED in review — the round's only reject, out of ~30 units.** The smoothstep length-response on radiance created hard-edged ink plateaus with enlarged bare wedges (coverage collapse, worst at d=220), confirming the orchestrator's picture flag. `git diff 48ff98dc..94cca882 -- src tests` is empty. **Its measurement survives:** the plan's own `g`-based formula was proven broken (dark/light 1.2–1.5×), so **T2 iteration 2** starts from a known-dead formula rather than re-deriving it. |

## 3. RESUME ORDER FOR ROUND 3, PER LANE (branch off the integrated tree, not off the round-2 lanes)

**The five round-2 lanes are historical the moment the fast-forward lands** — read them as provenance.
Round 3 branches off the integrated `main`. Nothing below is started; several items are gated on §4.

| lane / file ownership | order |
|---|---|
| **`surface-fill.js`** | **T2 iteration 2** (`T2-review.md` is the brief — a different length-response curve, and a per-cell acceptance table on all SIX combinations, not the plan's two) → **T3** (mkDashRamp low density, the plan's U3 — alone it answers W-06b) → **W-31b** (crosshatch cell shape; Rank 1's per-ruling scalar step is exhausted, Rank 2 is prototyped-and-rejected, the `48ff98dc` ceiling is the baseline to beat) → **W-35b** (end-overlap for surface-fill rulings) → **F1-placement** (**FROZEN**, §4 decision 4) → **T4** (**FROZEN**, §4 decision 1) |
| **collapse chain / picker** | **U9b + W-10d-3b** (now unblocked — the integrated tree is the first to hold both U9 and U8) → **U7-2** (plain-language caveat pass over EVERY folded law — see §6) → **U6** (**FROZEN**, §4 decision 2) → U10–U12 (W-26-blocked, lossy) |
| **slices pass** | **W-27c-0a-2** (**FROZEN**, §4 decision 5) · **W-34 Fix C** (**FROZEN**, §4 decision 8) |
| **faceted path / context-bar** | **F-14 graded remainder** (**FROZEN**, §4 decision 7) · **ground-plane density** (**FROZEN**, §4 decision 3) |
| **cross-lane / product** | **W-32 Rank 3/4** (**FROZEN**, §4 decision 9 — would satisfy W-32 and W-35 together) · **W-36 budget convention** (**FROZEN**, §4 decision 6) |
| **unscheduled** | W-37 (Fill Curves declines on contourSlice output — `geometry-utils.js`, needs its own lane) · W-33's fitter-limitation follow-up (`flattenSmoothedPath` reduces density where the fix made it dense — **distinct from W-37**, proven) · F1-amp · W-07b · W-25 hlr seam · `insetMultiPolygon` ladder |

**Six of the nine §4 decisions gate a queued unit.** Until they are answered, round 3's real work is
T2 iteration 2, T3, W-31b, W-35b, U9b+W-10d-3b, U7-2 and W-37 — enough for a full session.

## 4. DECISIONS FOR JAY

1. **W-06 max density (2995 → 529 mm ink).** Accept the lighter max as final, **or** restore the band in T4? *Recommended: CONDITIONAL — sign off the lost byte-identity (the old max was the slab defect at higher density), but not the ink collapse; T4 should bring max back to ≥1500 mm.* If the lighter look wins, mkDashRamp becomes the lightest of 12 mark laws, its roster text drops to "dot → dash", and O8/O9 are struck.
2. **U6 `penStipple` mark class.** `'dot'` → `'hatch'` (a visible picker re-categorisation), **or** keep `'dot'` and record the known lie? *Plan asks for the change; U6 cannot proceed until decided.*
3. **Ground-plane density after W-15c.** Confirm ~**2.5× denser** ground hatch at defaults (ink 12164 → 30215 mm), **or** exclude the ground from the solo-orientation gate? *Reviewer accepted it on the picture; the app's default scene is unaffected — its ground carries a style override.*
4. **F1 — "which white did you mean?"** No F1 screenshot exists in the repo. *The plan now says it is the 41.7 × 6.6 mm bare strip on the lower front torus; a bench look would confirm before F1-placement's evidence is judged.*
5. **W-27c-0a — which defect do you mean? (AMENDED 2026-09-09 — the old framing rested on a broken measurement.)** The "blob width" that drove three iterations of culling was `largestW`, which is **the bounding box of the largest 8-connected component — a connectivity extent, not an ink width**. The sphere's "34.5 mm blob" fills **4.5%** of that box. The quantity that matters, **max inscribed-disc diameter, is 0.783 mm (sphere) and 0.849 mm (torus) — already inside the 0.9 mm bar.** *Exhibit: `user-reports/17-w27c-0a-2-decision5-sphere-pole-torus-saddle.png` (native crop). On the picture both sites read as adjacent strokes **merging into a thicker line**, not a grey smear. If the thicker line is the complaint, it is within one pen width and the item closes as MEASURED. If a **smear** is the complaint, the fix is **fewer slices at the pole/saddle**, driving merged area (torus 2.465 mm² / sphere 26.962 mm²) down. Either way the crowding cull cannot help — it is parked.*
6. **W-36 — which crosshatch budget convention? (AMENDED 2026-09-09 — the review turned this into a three-way choice.)** The pre-audit picture you accept **already spent ONE shared budget across both families**: sphere d=50 was **A 15 / B 11** against a single-family hatch count of **24**. So *"each crosshatch family carries the hatch count"* was **never the shipped convention** — which changes the question from yes/no to which rule to adopt. *(a) One shared budget, split evenly — **shipped now as Rank 1**: cylinder d=220 total preserved at 106 vs v1.3.98's 108, sphere reads mildly more open (20 vs 26 lines). (b) Rank 2, a larger pair budget: +16% ink on cylinder d=220, **over the +15% cap** — needs the W-26 conditional-acceptance ruling re-applied per delta, or your explicit call. (c) Per-family = the hatch count: roughly **2× ink**, and it needs a **new anti-saturation cap**, since the current one is v1.3.98 + 15%.* **Exhibit: `after/W-36/review-montage-a-halved.png`** — v1.3.98 / pre-W-36 / post, side by side. Nothing is blocked; Rank 1 stands until you say otherwise.

7. **F-14's graded remainder — close as by-design, or expose the dial?** Six designs have now been measured (A, B, C, D, Fix 2 by analysis, E), and design E proved the bar is **arithmetically impossible, not undiscovered**: on the app-default box, 6 rulings on the lit facet puts it at **4.632 mm of paper coverage against the darkest facet's 5.228 mm — 0.89×, the lit facet DARKER than the darkest one**; at 4 rulings it is already at O20's 1.25× readability bar. The 3-ruling floor is the readability floor working, on facets whose honest ask is 0.7–1.8 rulings. *Options: (a) close **by-design**, with a release note that on graded objects Density sets the object's ink RANGE while tone allocates within it; or (b) a **product unit** exposing `FACET_MIN_RULINGS` as a per-style "minimum facet rulings" control defaulted to 3, handing you the ladder-versus-fill trade explicitly.* Exhibit: `W-15c-E-plan.md` §2's inversion table.
8. **W-34 Fix C — warp the cone's apex band?** The corner you circled is **exact geometry** (76.4° emitted = 76.4° analytic), so removing it is a **look change to a shipped treatment**, not a bug fix. Cost: holding the turn ≤ 25°/mm moves planes 12–15 of 26; ≤ 20°/mm moves planes 11–16 — **every cone contourSlice ring shifts, all 300 cone cells change**. *Same class as W-35; comes to you with a before/after montage of cone planes 11–16.* Fix A (the honest close of the ≤ 8° bar) and Fix B (the capsule closed form) both shipped regardless.
9. **W-32 — refine the fill border to the true silhouette?** The "lines breaking out beyond the border" is **not in the app**: in-app overshoot measures **0.50 pen against a 0.50-pen bar with zero endpoints over**. It was the gallery rig rendering at deserialization `detail` 16, and the re-shoot folds into the wrap-up gallery rebuild. *But the plan's Rank 3/4 option — refining the fill border to the **true** silhouette rather than the tessellated one — **would satisfy W-32 and W-35 together**, which is why it comes to you rather than being closed.* (Raising the `detail` default 16 → 24 is rejected outright: `params.js` says those must never move.)

## 5. USER-REPORTED DEFECTS

| report | defect | status |
|---|---|---|
| ladder-gap rule | Sturmian doubling on flat-tone surfaces | **FIXED** — gap jump 2.00 → **1.03–1.17**; crosshatch regression found and fixed in W-26b (coverage 0.91 → legible grid). **P0 closed.** |
| 8.png | mkTick leaves un-ticked bands, hard cone edge | **STILL PARTIAL after round 2 — T2 was REJECTED and reverted.** T1 landed the chart-walked mark and T1b the plot-safety guard, but **variable tick length is not shipped**: T2's smoothstep response created hard ink plateaus with enlarged bare wedges. **T2 iteration 2 carries it into round 3**, with a per-cell acceptance table on all six combinations. The cone hard edge remains the `MK_ROW_COV` scaffold, which is **T3's**. Superseded detail: | **PARTIAL** — T1 landed the chart-walked mark (refusal 0.61 → 0.007); variable length is T2. The brief's "coverage hole" premise was wrong: coverage was already 0.96–1.00. Cone hard edge = pre-existing `MK_ROW_COV` scaffold, T3's. |
| 9.png | torus ticks read as straight-spoke fans | **FIXED in kind** — ticks curve along the family (sagitta 0.000 → 0.127 mm), bulk texture reads as one coherent weave. A mid-tick kink was found and fixed; a min-spacing tail regression → T1b. |
| 10.png | mkDashRamp draws ONE dash at d=1 | **OPEN** — T3. Measured 5 dashes at d=1 (bar ≥40), count non-monotone `5,2,9,56,416`. |
| 11.png | torus contourSlice angled points + micro-gaps | **micro-gaps FIXED** (107 → 46 paths); **"angled points" = ink merging** — improved, not fixed (blob 3.35 → 2.10 mm vs 0.9). Iter-4 queued. |
| 12.png | buckyball contourSlice ring with an open end | **FIXED** — open rings 6 → 0, plane counts unchanged. |
| 13 (2026-09-06) | crosshatch cells uneven — *"diamond/square gaps vs rectangular gaps"* | **MEASURED, ceiling pinned — the fix needs a new mechanism (W-31b).** Confirmed a real PLACEMENT defect with **tone OFF**: cell aspect ramps **0.60 → 1.75** across a cone, C1 failing on 4 of 5 primitives. Root cause is a **ruling-MEAN metric spent as one scalar step**, i.e. the P0 ladder-gap rule generalised to local geometry. The Rank-1 spike **failed its gate**, so a non-regression ceiling shipped and nothing else. **W-36 is proven not to be the cause.** Superseded detail: | 13-old |  — *"diamond/square gaps vs rectangular gaps… are lines not being evenly spaced?"* | **OPEN → W-31.** Generalises the P0 rule to crosshatch **cell shape**: both families evenly spaced except where tone demands. Re-measure on `0930cb2d` — W-26b-1 changed the crossing family's share. |
| 14 | *"Some of these lines are breaking out beyond the border."* + *"non-curved angles"* | **BOTH ANSWERED.** **W-33 FIXED** the non-curved angles — contour FILL rulings now ≤ 8° in device space (C1 31.24°/38.35° → ≤8; C2 18.46–23.25° → ≤8), after finding refinement ran *before* the seam join where the join vertex is exempt from the turn check. **W-32 is MEASURED, no code**: in-app overshoot is **0.50 pen against a 0.50-pen bar with zero endpoints over** — what you saw was the gallery rig at deserialization `detail` 16. The true-silhouette option is **§4 decision 9**. Superseded detail: | **OPEN → W-32** (silhouette overshoot; RGR ≤ 0.5 pen — note `scene3d-fill-boundary-ends` passed 41/41, so establish whether it measures overshoot at all) and **W-33** (the contour-rounding rule extends to contour FILL rulings). |
| 15 (W-35) | *"stairstepping where line segments end … perhaps having a parameter we can control"* | **DELIVERED — awaiting Jay's look at the control.** `sliceEndOverlap` ships at −2..8, **default 0 = byte-identical**, so nothing changes until he moves it. The mechanism turned out to be a **facet-quantised front/back cut, not a trim**. Evidence: `after/W-35/bespoke/` (k = −2/0/4/8 sweeps + the Style tab). |
| 15 | *"angles in this curved shape that should not be there"* + *"stairstepping where line segments end"* | **OPEN → W-34** (extends W-27c item (b), bar ≤ 8°, open-polyline-aware metric mandatory) and **W-35** (product request: a user-controllable end-overlap / edge-fidelity param). |
| 16 (2026-09-06 18:31) | crosshatch renders ONE family | **FIXED (W-36) — and it reframed your rule.** Gap ratio B:A **5.4–31.2× → 0.814–1.061**; your own cell went **A 17 / B 3 → A 9 / B 11**. But the review found the pre-audit design **already spent ONE shared budget across both families** (sphere d=50 was A 15 / B 11 against a hatch count of 24), so *"each family carries the hatch count"* was never the shipped convention — hence **§4 decision 6**, a three-way choice. Superseded detail: | — *"make crosshatch have the same number of crosshatch lines as it has hatch lines unless … variation is needed for highlight/shadow. This seems off."* | **OPEN → W-36, P1.** Sphere/ladder/fine-rungs/d=50 shows ~22 bands and **no** crossing family; montage counts cylinder ≈ 30 vs ≈ 5, ellipsoid ≈ 25 vs ≈ 4, T1 sphere ≈ 24 vs ≈ 8, against v1.3.98's ≈ 22 vs ≈ 20 — **a regression between v1.3.98 and the merge**. Prime suspect `CROSS_SHARE_BASE = 0.1` (`surface-fill.js:4652`) → crossing coverage 10% of family A's at ratio 1. Lane fill-audit-a2, before W-31 |
| "not close to zero yet" (F1) | torus ribbon streaks | **OPEN, mechanism found** — 62.63 mm² bare strip, 30× A3's whole residue; Prototype B ruled, deep blank 11.89 → **0.28 mm²**. |

## 5b. ROUND-2 MERGE — DONE (local only), pending fast-forward

**Integration is `4421d514` on `3d-scene/integrate-r2`, v1.4.1** (`MERGE-impl-r2.md`). Five lanes merged
`--no-ff`; **merge, not rebase**. Merge review in flight (`a7d39601..4421d514`). **`main` fast-forward sha:
`<PENDING>`** — to be filled in when the orchestrator confirms it. **NOT pushed.**

- **`test:ci` ZERO failures** on the integrated tree: unit **5199**, integration **1973**, e2e **62**,
  visual **99**, perf **10**. Version **1.4.1** synced; CHANGELOG, README and `plans.md` landed.
- **The three-author collapse test AUTO-MERGED (95/95)** — the round's most-feared hazard resolved itself,
  exactly as the U9 reviewer's `+19`-shift analysis predicted. **Only ONE pin moved in the entire merge**
  (W-33's `torus + contour + ladder @ d=50` golden, re-measured on the merged source as checklist item 10
  required). Two textual conflicts, one semantic.
- **The four-day-old "contourSlice x-ray" unknown is CLOSED GREEN** (17/17, 38/38) — it never existed on the
  merged tree, which is why deferring it to an idle machine after the rebase was the right call.
- **THE MERGE FOUND AND FIXED A LIVE PRODUCT DEFECT — round 2's equivalent of round 1's X-ray regression, and
  again it was the one behaviour no lane could test.** Checklist item 7: a `.vectura` saved *before* the
  collapse carries a raw folded `toneLaw` and **no sibling collapse key**, and the ctxbar Style flyout computed
  `effectiveLaw` off the **un-seeded** bag — so every descriptor looked default, the bare survivor came back,
  and **the folded law's own measured caveat did not render**, violating the standing ruling and stop
  condition 4. The docked panel already did it right (`scene3d-panel.js:716` seeds first). **A one-site
  ordering drift between two surfaces whose written contract is that they must not drift.** RED test, fixed at
  source, GREEN, screenshotted in the real app into `after/MERGE-r2/`.
- **Two stale bars were retired that had outlived their defects.** Unit F's "intentionally RED" test measured
  **0 survivors on the integration tree AND on unmodified `main`** — the seam it pinned closed during the
  *round-1* integration and nobody re-measured; the bar is tightened `≤ 2` → `=== 0` and the disproven
  polygon-union root cause is retired from the header. And W-36b's "3 pre-existing unrelated failures,
  ownership undecided" was **wrong on both counts** — main is green, the lane was red, and one `git archive`
  of main would have settled it.
- **Filed out of the merge:** **U7-2**, a plain-language caveat pass over **every** folded law — the ctxbar now
  shows caveats for raw folded ids, but `weaveDepth`'s is still audit prose ("appears in `isWaveLaw()`/
  `WEIGHT_LAWS`…"). U5b-2 did this for two laws; U7 and U8 added folds without it.
- **Known-stale evidence the gallery rebuild must re-shoot:** W-30c's two torus "after" frames (W-30d landed
  after them on the same lane and re-opens the ring's hole) and W-28b's listbox (option count 36 → 34 after
  the U7/U8 fold, on top of the nine-rows-visible reason already on the checklist).

## 6. ROUND-1 MERGE — DONE (local only)

**Merged into local `main` at `817424dc`** — the merge commit of `3d-scene/integrate @ecaf1e17`, **v1.3.99**
(the version hook could not fire in a worktree; bumped once at merge as planned). Main's docs wrap-up is
`6ad1d93e`. **NOT pushed**, per standing practice — pushing remains Jay's call.

- The seven `3d-scene/*` lanes (`handoff-b`, `handoff-c`, `fill-audit`, `fill-audit-a`, `fill-audit-c`,
  `fill-audit-d`, `fill-collapse`) are **historical**. **The next session branches off `main`.**
- **The superseded CHANGELOG draft was discarded on main** — the integration carries the **judge's canonical
  wording**, with the crosshatch caveat lifted (C1 landed).
- **The merge agent found and fixed a real X-ray back-density regression** — see `MERGE-impl.md`. Worth noting
  that the merge itself surfaced a defect no lane did.
- **Carried as documented open items, not blockers:** **U5b** (caveat visibility for folded laws — a product
  regression), **W-30b** (the one-line wiring without which W-30 reaches no user), and the five new **USER**
  items W-31…W-35.
### Still owed against the merged tree — secretary audit, 2026-09-06 19:05 EDT

Verified read-only against `main` 47a5a755. **None of these blocks a lane from starting.**

| item | verdict | file |
|---|---|---|
| Unit A's 5 intentionally-red tests, retired in A3's favour | **DONE-ON-MAIN** | `tests/unit/scene3d-ribbon-f1b-streaks.test.js:175` — "RETIRED as a pass/fail bar (A3-judge.md §5 item A1)"; no `intentionally RED` marker remains |
| Unit F's 1 intentionally-red test | **STILL-OWED** (docs/test comment) | `tests/unit/scene3d-mesh-self-occlusion.test.js:29` still RED on `spiral` **and** still carries the root cause W-25 disproved (polygon-union) — reconcile the text and the bar together |
| `findings.json` / `worklist.json` C-05 "byte-identical" claim | **STILL-OWED** | `docs/3d-audit/fill-audit/findings.json:236` still reads "Byte-identical density-inert rows … visually identical". Correct wording + numbers are in the standing ruling (5 distinct outputs, `contFieldTouch` 3879.9 vs `contFieldSigmoid` 1459.0 mm) |
| `after/W-25/report.json` "engaging only for small/thin regions" | **STILL-OWED** | `docs/3d-audit/fill-audit/after/W-25/report.json:14` — W-25b measured 102/288 `trueSpiral` calls still floored at aspect 0.177 |
| W-26 hygiene (a) false hatch-bar line | **STILL-OWED** | `docs/3d-audit/lane-reports/W-26-impl-2.md:424` still says hatch's 1.2 bar "still measures higher"; the ramp actually fell 1.369 → 1.229 (−10.2%) |
| W-26 hygiene (b) `plot-safety` `q(0.98)` disclosure | **STILL-OWED** | `tests/unit/scene3d-plot-safety.test.js:243,262` — the bar is in place, the `## Bars changed` disclosure is not recorded anywhere |
| W-26 hygiene (c) `CROSS_SHARE_BASE` / `CROSS_DFMAX_BOOST_CAP` noted as empirically tuned | **STILL-OWED** | `src/core/scene3d/surface-fill.js:4652`, `:9718` — the comments justify but never say "empirically tuned". **W-36 now depends on this constant**, so record it as part of W-36 rather than separately |
| gallery rebuild (47 unexplained byte-identical pairs now WARN) | **STILL-OWED** | `docs/3d-audit/fill-audit/index.html` last built **Sep 5 20:11** — it predates T1, W-26b, U1–U5, W-30 and the merge. Orchestrator-only task |

- **Original round-1 wording, kept for the record:** reconcile the intentionally-red tests (handoff-b's Unit A 5 +
  Unit F 1 versus A3's retirement of the 5 — resolve in A3's favour); the `worklist.json`/`findings.json`
  corrections (C-01…C-08 resolved; **C-05's "byte-identical" claim** — five distinct outputs, `contFieldTouch`
  2.7× ink); `after/W-25/report.json`'s "engaging only for small/thin regions"; the W-26 hygiene trio
  (false hatch-bar line in `W-26-impl-2.md`, the `plot-safety` `q(0.98)` disclosure, `CROSS_SHARE_BASE`/
  `CROSS_DFMAX_BOOST_CAP` noted as empirically tuned); and the gallery rebuild (47 unexplained
  byte-identical pairs now WARN).

## 7. PROCESS — lessons & incidents

### Round 2's own lessons (2026-09-06 → 10)

**FIVE oracle-instrument findings — the round's dominant failure mode, and not one of them was a broken
mechanism.** In every case the code was right and the measuring device was wrong, and every one was caught by
somebody **re-deriving a number instead of reading it**. (1) **W-36's** `scene3d-hatch-density-angle-stable`
measured the length-weighted mean bearing of **both crosshatch families combined**, and was only ever stable
because family A held ~91% of the ink — **the defect was propping up the metric**. (2) **W-34's** implementer
**self-caught** a continuous-z0 sweep that would have given a bogus 72.6°/mm capsule "truth", making T3 pass
vacuously at 32.4 and hiding the very defect the unit existed to fix. (3) **W-34b:** `coneCrossSectionWorld`
**closed an arc that is open by construction**, inflating the cone ceiling 76–77 → **141.56°/mm**, so T2's
exemption had been passing against roughly twice its real value. (4) **W-27c-0a-2:** sub-bar (d) `largestW`
is the **bbox of the largest 8-connected component — a connectivity extent, not an ink width**; the sphere's
"34.5 mm blob" fills 4.5% of that box, and the real quantity (max inscribed disc, 0.783/0.849 mm) was
**already inside the 0.9 mm bar**. Three iterations of culling were driven by a number that never measured
the defect. (5) **W-27c-0a-5:** four of six new bars pinned a **round-count artifact** — and this was a unit
created specifically to avoid that mistake, whose author explicitly disclaimed correctness in the pin's own
comment. **A guard is only as good as the quantity it measures, and "the mechanism works" and "the bar
measures the mechanism" are two separate claims that must be proven separately.**

**SIX rate-limit incidents in five days — the round's dominant tax, and one variable decides the cost.**
**Incident 3 alone destroyed context**, because the *session* restarted: transcripts were gone, five agents
had to be rebuilt from their on-disk reports, and the two units mid-step had to be checkpointed blind.
Incidents 4, 5 and 6 killed eight, one and one agent respectively and cost **only wall-clock**, because the
session survived and every agent resumed via `SendMessage` with its transcript. **Agent death is routine and
recoverable; session death is what destroys context — and the on-disk reports are the only thing that
survives it.** The protocol's "write your full report before returning one line" is what made a from-scratch
respawn possible at all, and the two units that had to be checkpointed blind are exactly the two that had not
yet written one.

**Three metric-green / picture-red candidates, and the pictures won all three.** W-30b's "rectangular band"
turned out to be **correct optics** — proven by a from-scratch 200k-point analytic simulation, not by looking
again. W-28b's identical-looking screenshots were an **evidence defect, not a code defect** (the listbox
under-cropped 8 of 9 flipping rows). **T2's plateaus were real, and it is the round's only REJECT.** The
habit that caught all three is the same one round 1 identified: **the orchestrator looks at every picture at
native resolution**, and a checklist item insists on a LIVE check the harness cannot do.

**The merge found what no lane could — twice in two rounds.** Round 1's X-ray back-density regression and
round 2's **ctxbar caveat defect** were both invisible to every lane because the two halves of the behaviour
had never existed in one tree. Round 2's was caught only because **checklist item 7 demanded a live check**.
**Write down the behaviours that no single lane can test, and make them checklist items** — that is now
proven twice.

**Three reviewer-caught arithmetic slips** (U0's 342-vs-335, U1–U5's 21-vs-18, **U8's 426-vs-447 plus a
57/57 row that is really 51/51**) and **two overstated claims corrected by reviewers** (W-27c-0a-6's "only
the torus ring" — it is three; W-30d's "the fix" — it raises a ceiling ~3.5–4× without removing it). None was
a missed regression; all would have been copied forward. **Sum the table; do not restate the headline.**

**Bars that describe a defect must be re-measured when the defect's owner lands.** Unit F's "intentionally
RED" test measured **0 on main** and had been carried a whole round as red. W-36b's "pre-existing unrelated
failures" were **the lane's own**, and one `git archive` of main would have said so.

**Camera-a-only measurement has now cost this audit twice, in the same file.** W-34's plan tabulated M1 at
camera a; a camera-b sweep found **all six** primitives over the bar, not the two named. Six units later,
W-27c-0a-6's safety-margin guard checked camera a only and missed two of the three rings its own gate
affects. **Slices-pass guards sweep both cameras by default.**

**What went right, and is worth keeping.** Spike gates on unprototyped plans (**W-31's caught an unshippable
mechanism before a line of source moved**); prototype-before-plan bars (**W-15c design E proved F-14's bar
arithmetically impossible rather than merely unmet**); stop-reports over fudges (W-15c D, W-31, W-27c-0a-2,
T2's revert); reviewers re-deriving headline numbers rather than reading them; and **six clean ACCEPTs**, all
of them on units scoped to a small number of named, externally-specified items.

### Round 1's lessons (kept)



**Three metric-green / picture-red cases.** W-27c-0a 2b: 49/49 green and ACCEPT-PARTIAL, then a **full-resolution crop** showed the cull reintroducing the exact defect `767bed54` had fixed — and the guard that should have caught it had its ceiling re-pinned 55 → 80 **to accommodate that same splitting**. T1: a visible chevron at every tick centre while **all four oracles passed**, O1's sagitta *higher* because the kink read as curvature. W-26b C2 (caught by the implementer, before landing): the first anti-blob guard drove **every** mapper to coverage 1.0 — a green guard measuring nothing.
> **A guard whose bar you widen to fit a new mechanism stops guarding against that mechanism.** 800 px cells are not enough — crop at native resolution.

**Two silent bar loosenings, both caught by reviewers.** W-26's `inkRamp` 1.8 → 1.3 (plus an undisclosed hatch loss 1.369 → 1.229) and W-27c-0a's sphere `pct1` quietly relaxed to `<10`. Both later justified or reverted — neither self-reported.

**Three coin bars** (W-26): each sat inside its own drift envelope; the judge showed the coin landing wrong. Fixed shape: floor **below** the envelope **plus** a ±10% fingerprint band — now shipped in W-26b-3.

**Incidents.** **Incident 5 (2026-09-09 ~13:40 EDT, reset 14:10) killed EIGHT agents** — U8 and W-31's implementers, four reviewers and a planner — and again **every transcript survived**, so all eight resumed via `SendMessage` with no unit changing status. U8's tree was checkpointed (`9a26aa5e`); W-31's was clean; the W-33 reviewer had already finished. ⚠ **The kill exposed a protocol deviation it would otherwise have hidden: the W-35 reviewer was waiting on a background run — the fourth occurrence of that failure mode across both rounds, and the first by a REVIEWER**, whose brief only ever addressed implementers on this point. **Three rate-limit incidents in four days is now the dominant tax on this round.** **Incident 4 (2026-09-08 ~22:30 EDT, reset 23:10) is the control case that proves the point:** the rate limit again killed five agents (U7 impl, W-10d-3 impl, the W-34 reviewer, the W-30c and W-35 planners) — but **the session survived, so every transcript survived, and all five resumed via `SendMessage` with no loss**. The W-28b reviewer finished on resume; the W-30b reviewer had already written its report and needed no resume at all. Two mid-unit trees were checkpointed (`bfe8fdb4` on fill-collapse-2, `4ca6a507` on fill-audit-2) but as ordinary resume points, not blind ones. **Incident 3 cost two units a blind checkpoint; Incident 4 cost only wall-clock — and the single variable between them is whether the SESSION restarted, not whether the agents died.** **Incident 3 (2026-09-06 20:02 EDT) broke the pattern: the rate limit killed six agents AND the session then restarted, so every transcript was lost and nothing could be resumed with `SendMessage`** — the first time in this effort that agents had to be rebuilt from their on-disk reports. The OS also killed a dev server for low memory. Two mid-unit trees were checkpointed as unverified WIP (`fill-audit-a2 0b7d8fda`, `fill-collapse-2 eea613fd`), and the T1b checkpoint carries a probe file (`tests/unit/zzz-t1b-perf.test.js`) that must be deleted before the unit closes. **The lesson this adds: the reports ARE the recovery mechanism** — the protocol's "write your full report to `lane-reports/` before returning one line" is what made a from-scratch respawn possible at all, and the two units that were mid-step (no report yet) are exactly the two that had to be checkpointed blind. Earlier: two rate-limit kills (3 then 6 agents) — all worktrees intact, all resumed via `SendMessage`; nothing was stashed, so nothing needed recovery. Three stalls (W-26 impl-1's monitor loop, 738k tokens, checkpointed as `4ea8caed`). **One data loss, since identified as harmless:** the W-26b reviewer's `rm` during cleanup deleted two untracked files in main's root (`torus-fillstyle-open.png`, `torus-fillstyle-panel.png`) — **leftover screenshots from the W-10d reviewer**, never tracked and unrecoverable, but nothing depended on them. Self-reported immediately, which is why it was identifiable at all. The rule stands: reviewers are read-only and delete nothing, inside or outside their worktree.

**Tooling defects.** `scripts/audit/*.js` run their **default full job** on an unrecognized flag (`--help` caused two unplanned gallery rebuilds); `ensureServer`'s readiness ping races the app's config scripts (one capture silently lost a cell); `after/W-10` had been overwritten by three stacked capture generations.

**Four gallery coverage gaps.** No cell renders the five F1 ribbon laws; none has an imported mesh; none exercises `shadowReceiveOnObjects`; contourSlice cells use the `ladder` placeholder and `solid` *is* the buckyball. **Check the manifest before naming a cell in a brief.**

**Two arithmetic slips in reports** (U0's 342 vs 335, U1→U5's 21 vs 18) — both caught by reviewers re-running the sums. Worth a habit: sum the table, don't restate the headline.

**What worked.** Scratch `git archive` exports for RED (never stash); reviewers reproducing numbers independently rather than reading them; implementers stop-reporting instead of fudging (W-15c reverted, W-10c iter-3 blocked, T1's honest shortfalls, W-27c-0a's disclosed regression); mutation tests as causal proof (W-26b's re-widening fails the new guard at exactly the pre-fix value); and the orchestrator looking at every picture — which is what caught the two defects no test did.
