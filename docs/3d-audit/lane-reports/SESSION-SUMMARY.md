# 3D fill audit — SESSION SUMMARY (round 1: 2026-09-05 → 06 · round 2: 2026-09-06 19:05 EDT →)

**ROUND 2 IN PROGRESS on `main` 47a5a755 (v1.3.99). NOT pushed.** Round 1 is closed: all units landed,
reviewed, and merged into local `main` at `817424dc`, with the docs wrap-up at `6ad1d93e` and the ledger
record at `47a5a755`. **The seven round-1 `3d-scene/*` lanes are historical**; round 2 runs in five NEW
worktrees branched off `main` — map and first-unit briefs in `ROUND2-BRIEFS.md`, queue in `LEDGER.md`
§"Round 2".
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
| **W-26b** (C1+C2+C3+4a) | fill-audit-a | `7bc2b1a0`/`4a858445`/`0930cb2d` | Crosshatch **9326.7 → 5153.7 mm (+4.9% vs pre-W-26)**; `crossDensityRatio` 1.12× → **2.3×**; tautology guard replaced; three coin bars → floor + band. |

## 2. IN FLIGHT

**None.** One unit is deliberately parked:

| unit | lane | sha | state |
|---|---|---|---|
| W-27c-0a iter-3 | fill-audit-d | `ec79e2b9` | **REJECTED / PARKED** — mid-ring fix is the keeper and stays on the branch; the cull is unscoped and thins the flat lower band. Iter-4 is the first resume item. |

## 3. RESUME ORDER, PER LANE (round 2 — all lanes based on `main` 47a5a755)

**Live at 2026-09-06 19:40:** IN-FLIGHT — T1b (fill-audit-a2), W-36 planner (Opus), W-27c-0a iter-4
(fill-audit-d2), **W-15c design D came back MEASURED — no ship, no commit, worktree reverted to `47a5a755`**; per-object λ regressed O28/O21/subwindow-density, and the finding is that *any* camera-projected λ is per-view, so Fix 2 dies with it. **F-14 now has five measured designs.** A **design E** planner is running under a prototype-verified bar. **U9 resolve half is DONE/FU per its implementer (`fc8b0fba`), review in flight** — its rewrite of six assertions in the already-merged `scene3d-tone-law-collapse.test.js` is the open STALE-vs-REGRESSION question, and it collides textually with U5b's edits to the same file. **U5b is CLOSED DONE/FU** (`49475ccd`, reviewer ACCEPT-WITH-FOLLOWUPS); its two follow-ups run as one
unit **U5b-2/3** (plain-language caveat copy + `effectiveLaw` ↔ `resolveToneLaw` cross-check), IN-FLIGHT on
fill-collapse-2 ahead of W-30b. **U9b** (uniqueness re-pin + `onePenDown`) is split out and QUEUED behind U8.

| lane / worktree (port) | order |
|---|---|
| **fill-audit-a2** (:8475) | **T1b** (plot safety) → **W-36** (USER, NEW — crosshatch has ~1/10 the crossing lines; runs BEFORE W-31) → **W-31 → W-32 → W-33** (USER, outrank T2) → **F1-placement** (Prototype B, ruled) → T2 → T3 → T4 (**FROZEN-ON-JAY**, W-06 call) |
| **fill-collapse-2** (:8482) | **U5b CLOSED DONE/FU `49475ccd`** → **U5b-2/3** (copy + cross-check, in flight) → **W-30b** → U6 (**FROZEN-ON-JAY**, penStipple call) → U7 → U8 |
| **fill-audit-d2** (:8481) | **W-27c-0a iter-4** (re-scope cull to saddle/pole + land the four floors) → **W-34 → W-35** (USER; W-35 is cross-lane, needs params + context-bar) → W-27c-0a-2 (needs a different mechanism) |
| **fill-audit-2** (:8476) | W-15c design D **MEASURED — no ship** (O28 view-independence kills every camera-projected λ) → **W-15c design E, PLANNING** (Opus planner, PROTOTYPE-VERIFIED bar or PLAN-BLOCKED) |
| **handoff-c2** (:8470) | U9 **resolve half DONE/FU `fc8b0fba`, review in flight** → U9b (uniqueness re-pin + `onePenDown`, QUEUED behind U8) → W-30-adjacent follow-ups |
| **frozen on Jay** | T4 · U6 · W-06 sign-off · ground-plane density (§4 decisions 1, 2, 3) |
| **unscheduled** | F1-amp · W-07b · W-10d-2/-3 · W-28 threshold · W-25 hlr seam · `insetMultiPolygon` ladder · U10–U12 (W-26-blocked, lossy) |

First-unit briefs — files allowed/forbidden, RED oracle, cells to re-shoot — are in **`ROUND2-BRIEFS.md`**.

## 4. DECISIONS FOR JAY

1. **W-06 max density (2995 → 529 mm ink).** Accept the lighter max as final, **or** restore the band in T4? *Recommended: CONDITIONAL — sign off the lost byte-identity (the old max was the slab defect at higher density), but not the ink collapse; T4 should bring max back to ≥1500 mm.* If the lighter look wins, mkDashRamp becomes the lightest of 12 mark laws, its roster text drops to "dot → dash", and O8/O9 are struck.
2. **U6 `penStipple` mark class.** `'dot'` → `'hatch'` (a visible picker re-categorisation), **or** keep `'dot'` and record the known lie? *Plan asks for the change; U6 cannot proceed until decided.*
3. **Ground-plane density after W-15c.** Confirm ~**2.5× denser** ground hatch at defaults (ink 12164 → 30215 mm), **or** exclude the ground from the solo-orientation gate? *Reviewer accepted it on the picture; the app's default scene is unaffected — its ground carries a style override.*
4. **F1 — "which white did you mean?"** No F1 screenshot exists in the repo. *The plan now says it is the 41.7 × 6.6 mm bare strip on the lower front torus; a bench look would confirm before F1-placement's evidence is judged.*
5. **W-27c-0a — accept "improved, not fixed"?** Blob width 3.35 → 2.10 mm (torus), 34.5 → 14.85 mm (sphere) vs a 0.9 mm bar. *Iter-4 first; residual routed to W-27c-0a-2.*

## 5. USER-REPORTED DEFECTS

| report | defect | status |
|---|---|---|
| ladder-gap rule | Sturmian doubling on flat-tone surfaces | **FIXED** — gap jump 2.00 → **1.03–1.17**; crosshatch regression found and fixed in W-26b (coverage 0.91 → legible grid). **P0 closed.** |
| 8.png | mkTick leaves un-ticked bands, hard cone edge | **PARTIAL** — T1 landed the chart-walked mark (refusal 0.61 → 0.007); variable length is T2. The brief's "coverage hole" premise was wrong: coverage was already 0.96–1.00. Cone hard edge = pre-existing `MK_ROW_COV` scaffold, T3's. |
| 9.png | torus ticks read as straight-spoke fans | **FIXED in kind** — ticks curve along the family (sagitta 0.000 → 0.127 mm), bulk texture reads as one coherent weave. A mid-tick kink was found and fixed; a min-spacing tail regression → T1b. |
| 10.png | mkDashRamp draws ONE dash at d=1 | **OPEN** — T3. Measured 5 dashes at d=1 (bar ≥40), count non-monotone `5,2,9,56,416`. |
| 11.png | torus contourSlice angled points + micro-gaps | **micro-gaps FIXED** (107 → 46 paths); **"angled points" = ink merging** — improved, not fixed (blob 3.35 → 2.10 mm vs 0.9). Iter-4 queued. |
| 12.png | buckyball contourSlice ring with an open end | **FIXED** — open rings 6 → 0, plane counts unchanged. |
| 13 (2026-09-06) | crosshatch cells uneven — *"diamond/square gaps vs rectangular gaps… are lines not being evenly spaced?"* | **OPEN → W-31.** Generalises the P0 rule to crosshatch **cell shape**: both families evenly spaced except where tone demands. Re-measure on `0930cb2d` — W-26b-1 changed the crossing family's share. |
| 14 | *"Some of these lines are breaking out beyond the border."* + *"non-curved angles"* | **OPEN → W-32** (silhouette overshoot; RGR ≤ 0.5 pen — note `scene3d-fill-boundary-ends` passed 41/41, so establish whether it measures overshoot at all) and **W-33** (the contour-rounding rule extends to contour FILL rulings). |
| 15 | *"angles in this curved shape that should not be there"* + *"stairstepping where line segments end"* | **OPEN → W-34** (extends W-27c item (b), bar ≤ 8°, open-polyline-aware metric mandatory) and **W-35** (product request: a user-controllable end-overlap / edge-fidelity param). |
| 16 (2026-09-06 18:31) | crosshatch renders ONE family — *"make crosshatch have the same number of crosshatch lines as it has hatch lines unless … variation is needed for highlight/shadow. This seems off."* | **OPEN → W-36, P1.** Sphere/ladder/fine-rungs/d=50 shows ~22 bands and **no** crossing family; montage counts cylinder ≈ 30 vs ≈ 5, ellipsoid ≈ 25 vs ≈ 4, T1 sphere ≈ 24 vs ≈ 8, against v1.3.98's ≈ 22 vs ≈ 20 — **a regression between v1.3.98 and the merge**. Prime suspect `CROSS_SHARE_BASE = 0.1` (`surface-fill.js:4652`) → crossing coverage 10% of family A's at ratio 1. Lane fill-audit-a2, before W-31 |
| "not close to zero yet" (F1) | torus ribbon streaks | **OPEN, mechanism found** — 62.63 mm² bare strip, 30× A3's whole residue; Prototype B ruled, deep blank 11.89 → **0.28 mm²**. |

## 6. MERGE — DONE (local only)

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

**Three metric-green / picture-red cases.** W-27c-0a 2b: 49/49 green and ACCEPT-PARTIAL, then a **full-resolution crop** showed the cull reintroducing the exact defect `767bed54` had fixed — and the guard that should have caught it had its ceiling re-pinned 55 → 80 **to accommodate that same splitting**. T1: a visible chevron at every tick centre while **all four oracles passed**, O1's sagitta *higher* because the kink read as curvature. W-26b C2 (caught by the implementer, before landing): the first anti-blob guard drove **every** mapper to coverage 1.0 — a green guard measuring nothing.
> **A guard whose bar you widen to fit a new mechanism stops guarding against that mechanism.** 800 px cells are not enough — crop at native resolution.

**Two silent bar loosenings, both caught by reviewers.** W-26's `inkRamp` 1.8 → 1.3 (plus an undisclosed hatch loss 1.369 → 1.229) and W-27c-0a's sphere `pct1` quietly relaxed to `<10`. Both later justified or reverted — neither self-reported.

**Three coin bars** (W-26): each sat inside its own drift envelope; the judge showed the coin landing wrong. Fixed shape: floor **below** the envelope **plus** a ±10% fingerprint band — now shipped in W-26b-3.

**Incidents.** Two rate-limit kills (3 then 6 agents) — all worktrees intact, all resumed via `SendMessage`; nothing was stashed, so nothing needed recovery. Three stalls (W-26 impl-1's monitor loop, 738k tokens, checkpointed as `4ea8caed`). **One data loss, since identified as harmless:** the W-26b reviewer's `rm` during cleanup deleted two untracked files in main's root (`torus-fillstyle-open.png`, `torus-fillstyle-panel.png`) — **leftover screenshots from the W-10d reviewer**, never tracked and unrecoverable, but nothing depended on them. Self-reported immediately, which is why it was identifiable at all. The rule stands: reviewers are read-only and delete nothing, inside or outside their worktree.

**Tooling defects.** `scripts/audit/*.js` run their **default full job** on an unrecognized flag (`--help` caused two unplanned gallery rebuilds); `ensureServer`'s readiness ping races the app's config scripts (one capture silently lost a cell); `after/W-10` had been overwritten by three stacked capture generations.

**Four gallery coverage gaps.** No cell renders the five F1 ribbon laws; none has an imported mesh; none exercises `shadowReceiveOnObjects`; contourSlice cells use the `ladder` placeholder and `solid` *is* the buckyball. **Check the manifest before naming a cell in a brief.**

**Two arithmetic slips in reports** (U0's 342 vs 335, U1→U5's 21 vs 18) — both caught by reviewers re-running the sums. Worth a habit: sum the table, don't restate the headline.

**What worked.** Scratch `git archive` exports for RED (never stash); reviewers reproducing numbers independently rather than reading them; implementers stop-reporting instead of fudging (W-15c reverted, W-10c iter-3 blocked, T1's honest shortfalls, W-27c-0a's disclosed regression); mutation tests as causal proof (W-26b's re-widening fails the new guard at exactly the pre-fix value); and the orchestrator looking at every picture — which is what caught the two defects no test did.
