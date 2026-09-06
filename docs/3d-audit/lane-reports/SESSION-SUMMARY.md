# 3D fill audit — SESSION SUMMARY (2026-09-05 → 06)

**FINAL.** All units landed and reviewed; nothing in flight.
Detail: `LEDGER.md` (per-unit rows, secretary flags, standing rulings, incidents) · `STILL-OPEN.md` (full findings).
**Nothing pushed. Nothing merged.** Main is `236e2581` (docs/evidence only).

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

## 3. RESUME ORDER, PER LANE

| lane | order |
|---|---|
| **fill-audit-a** | **T1b** (plot safety) → **W-31 → W-32 → W-33** (USER, outrank T2) → **F1-placement** (Prototype B, ruled) → T2 → T3 → T4 (needs Jay's W-06 call) |
| **fill-collapse** | **U5b** (BLOCKING before merge) → **W-30b** → U6 (needs Jay's penStipple call) → U7 → U8 → U9 |
| **fill-audit-d** | **W-27c-0a iter-4** (re-scope cull to saddle/pole + land the four floors) → **W-34 → W-35** (USER; W-35 is cross-lane, needs params + context-bar) → W-27c-0a-2 (needs a different mechanism) |
| **fill-audit** | W-15c design D (graded case still Density-blind) |
| **handoff-c** | U9 (rebases onto W-30) → W-30-adjacent follow-ups |
| **unscheduled** | F1-amp · W-07b · W-10d-2/-3 · W-28 threshold · W-25 hlr seam · `insetMultiPolygon` ladder · U10–U12 (W-26-blocked, lossy) |

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
| "not close to zero yet" (F1) | torus ribbon streaks | **OPEN, mechanism found** — 62.63 mm² bare strip, 30× A3's whole residue; Prototype B ruled, deep blank 11.89 → **0.28 mm²**. |

## 6. MERGE PLAN

| branch | HEAD | contents |
|---|---|---|
| `main` | `236e2581` | docs/evidence only; GH-1's fixes + all `after/<id>/` still **uncommitted**. |
| `3d-scene/handoff-b` | `9b2a33bb` | Unit A/E/F. Carries the intentionally-red tests. |
| `3d-scene/handoff-c` | `0d405577` | Unit C/D, A2, A3, Unit D phase-align, W-30. |
| `3d-scene/fill-audit` | `142afe58` | W-02/03/21/15c/10d. |
| `3d-scene/fill-audit-a` | `0930cb2d` | W-01/05/06/07, W-26, T1, W-26b. |
| `3d-scene/fill-audit-c` | `e6b85de4` | W-10/10b/19/20/10c. |
| `3d-scene/fill-audit-d` | `ec79e2b9` | W-27/27b/25/28/27c, W-29, W-25b, W-27c-0a. |
| `3d-scene/fill-collapse` | `8610fd66` | off `fill-audit@142afe58`; U0–U5. |

- **⚑ MERGE ORDERED BY JAY, NOW — local only, NO PUSH.** It runs in a **new integration worktree**, with three documented open items carried rather than blocking: **U5b** (caveat visibility), **W-30b** (the wiring that makes W-30 reach a user), and the **CHANGELOG draft** (replace the superseded "a LITTLE more ink" entry with the judge's canonical wording).
- **Five new USER items (2026-09-06) land after the merge, not in it:** W-31/W-32/W-33 on fill-audit-a, W-34/W-35 on fill-audit-d. Verbatim quotes and image mapping in `docs/3d-audit/fill-audit/user-reports/README.md` (images 13/14/15).
- **Intentionally-red tests:** handoff-b carries Unit A's 5 (`scene3d-ribbon-f1b-streaks`) and Unit F's 1. **A3 retired the 5 on handoff-c** — the branches disagree about that file; resolve in A3's favour, re-check Unit F's survivor.
- **Overlap files:** `surface-fill.js` (fill-audit-a ↔ U10–U12), `scene3d.js` (fill-audit faceted ↔ fill-audit-d slices ↔ fill-collapse), `context-bar.js`, `params.js`.
- **Version:** every branch is v1.3.98 — the hook cannot fire in a worktree. **Bump once at merge**, then `version:sync`.
- **⚠️ CHANGELOG on main carries an UNCOMMITTED 8-line W-26 entry in the SUPERSEDED wording** ("a LITTLE more ink" — the claim C1 disproved), written by W-26 implementer 2. Left untouched deliberately: no reverts on a dirty tree without Jay. **Wrap-up: replace it with the judge's canonical wording.**
- **Docs owed:** CHANGELOG + for-Jay text — use the **judge's** wording, **with the crosshatch caveat lifted** (C1 landed); README (W-10d greyed-out note); `worklist.json`/`findings.json` — C-01…C-08 resolved, **correct C-05's "byte-identical" claim (orchestrator owns this regardless of U8:** five distinct outputs, `contFieldTouch` 2.7× ink**)**, and correct `after/W-25/report.json`'s "engaging only for small/thin regions".
- **W-26 hygiene before telling Jay** (none block the close): patch the false hatch-bar line in `W-26-impl-2.md`; disclose the `plot-safety` `q(0.98)` bar move; record that `CROSS_SHARE_BASE`/`CROSS_DFMAX_BOOST_CAP` are empirically tuned.
- **Gallery:** rebuild is the orchestrator's; 47 unexplained byte-identical pairs now WARN.

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
