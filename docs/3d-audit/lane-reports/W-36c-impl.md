STATUS: DONE/FU — orchestrator sign-off needed on two disclosed bar moves (stop condition 7)

# W-36c — impl: each crosshatch family carries the SINGLE-FAMILY HATCH COUNT, under a new anti-saturation cap

Implementer, worktree `fill-audit-a3`, port 8475. Jay's decision (2026-09-10, §4 decision 6 →
**option C**): each crosshatch family carries the single-family hatch ruling count at the same
Density (≈2× the ink of hatch), under a new anti-saturation cap so Density 220 does not go
solid. This **replaces W-36's shipped Rank 1** (`CROSS_PAIR_BUDGET = 1.1`, one shared budget
split evenly between the two families).

- **Lane:** fill-audit-a3
- **Worktree:** `.claude/worktrees/fill-audit-a3`
- **Branch:** `3d-scene/fill-audit-a3`
- **Base sha:** `a3b651f0` (T4 landed on this file since the plan's `426cc5e4` export)
- **Final sha:** `8adfd5af` (a checkpoint commit `ac412d61` was made by the orchestrator mid-unit
  when this implementer was killed by a rate limit; `8adfd5af` verifies that checkpoint's content
  unchanged — re-ran the full guard battery post-checkpoint and confirmed byte-identical results —
  and carries the full commit message with numbers)
- **Port:** 8475
- **Plan:** `docs/3d-audit/lane-reports/W-36c-plan.md` (Opus planner, PLAN-READY)

## RED, re-derived on `a3b651f0` (condition 4)

T4 landed on `surface-fill.js` since the planner's `426cc5e4` export (mkDashRamp/morph-branch
work — `solveAt`'s `capOf`/`bandN`/`bandPitch`). Re-derived the plan's §1 table with a scratch
export of `a3b651f0` (`git archive a3b651f0 | tar -x -C /private/tmp/claude-501/scratch-W36c-pre`,
`node_modules` symlinked) before touching source, per AGENT-PROTOCOL. **Every number matched the
planner's `426cc5e4` table to the digit** — confirms T4's mechanism is disjoint from the
crosshatch pair-budget code:

| cell | hatch n | A n/gap today | B n/gap today | ink today | cov today |
|---|---|---|---|---|---|
| sphere d=1 | 4 | 2 / 2.446 | 4 / 10.620 | 235.0 | 0.064 |
| sphere d=50 | 16 | 9 / 2.901 | 11 / 2.641 | 877.3 | 0.232 |
| sphere d=220 | 69 | 37 / 0.770 | 48 / 0.696 | 3713.0 | 0.738 |
| cylinder d=1 | 6 | 3 / 13.711 | 4 / 5.203 | 298.8 | 0.053 |
| cylinder d=50 | 22 | 12 / 2.149 | 12 / 2.135 | 1161.4 | 0.216 |
| cylinder d=220 | 94 | 52 / 0.600 | 54 / 0.602 | 5019.6 | 0.753 |
| torus d=1 | 3 | 2 / 3.776 | 2 / 1.708 | 342.2 | 0.053 |
| torus d=50 | 12 | 7 / 5.135 | 7 / 4.302 | 905.8 | 0.114 |
| torus d=220 | 46 | 25 / 1.029 | 25 / 1.092 | 3195.0 | 0.334 |
| ellipsoid d=1 | 5 | 2 / 1.966 | 4 / 11.907 | 274.7 | 0.047 |
| ellipsoid d=50 | 16 | 9 / 2.794 | 11 / 2.782 | 1007.6 | 0.175 |
| ellipsoid d=220 | 67 | 36 / 0.889 | 47 / 0.723 | 4187.6 | 0.545 |
| **JAY's cell** (sphere, rungMode fine, d=50) | 17 | 9 / 2.949 | 11 / 2.717 | 862.2 | 0.228 |

P6 controls also re-confirmed on `a3b651f0`: sphere hatch d=50 **24 / 723.44**, cylinder hatch
d=220 **145 / 4495.51**, sphere contour d=50 **18 / 657.25** — all identical to the digit, and
identical again after the fix (byte-identity preserved).

## GREEN — mechanism

`src/core/scene3d/surface-fill.js`:

1. Replaced `CROSS_PAIR_BUDGET = 1.1` (shared sum, `crossPairShare` returning `half/r` or `half`)
   with `CROSS_FAMILY_BUDGET = 1.0` given to **each** family (`crossPairShare` returns
   `CROSS_FAMILY_BUDGET/r` for role `'b'`, `CROSS_FAMILY_BUDGET` for role `'a'`).
2. New anti-saturation cap: `crossMinPitch() = inkWidth() * (1 + CROSS_MIN_CLEAR_INKW)`,
   `CROSS_MIN_CLEAR_INKW = 1` → `2 × inkWidth()`. Generalised to the pair's cell AREA via
   `crossFloorPitch(crossRatio, role, delta)` so neither `crossDensityRatio` nor
   `crossAngleDelta` can defeat it.
3. `ladderPairWantedPitch(I, crossRatio, role, delta)` now returns
   `Math.max(masterPitch / c, crossFloorPitch(...))` — the cap floors the wanted pitch.
4. `dfMaxMul` (the walk's per-step ceiling) widened to
   `clamp(Math.max(1/share, crossFloorPitch/masterPitch), 1, CROSS_DFMAX_BOOST_CAP)` — the cap
   cannot be spent unless the step ceiling widens with it too (the exact trap W-26b-1 already
   documented at this line). Measured range: `[1.00, ~2.2]`, `CROSS_DFMAX_BOOST_CAP = 20` stays a
   dormant safety rail.
5. `crossShare.delta` (`= crossDelta`) threaded through both `crossShareA`/`crossShareB` objects
   and into `ladderPairWantedPitch`'s call site.

Total diff: ~50 lines in `surface-fill.js` (comments + code), matching the plan's Rank 1 edits.

**Rank chosen: Rank 1** (`2× inkWidth`), not the tighter Rank 2. Max measured coverage across the
full sweep is **capsule d=300 = 0.8298**, under the plan's own stop-condition-2 threshold of 0.84
— Rank 2 was not needed.

## GREEN — every number matches the plan's own prototype to the digit

Re-ran the plan's §3.1 measurement harness against the actual fixed engine (not a scratch
prototype — the real worktree file):

| cell | A n/gap → | B n/gap | ink (today → after) | cov (today → after) |
|---|---|---|---|---|
| sphere d=1 | **4**/7.905 | 6/5.301 | 235.0 → **421.5** | 0.064 → 0.114 |
| sphere d=50 | **16**/1.466 | 21/1.341 | 877.3 → **1606.0** | 0.232 → 0.393 |
| sphere d=220 | 46/0.689 | 54/0.628 | 3713.0 → **4328.5** | 0.738 → 0.807 |
| cylinder d=1 | **6**/3.931 | 6/4.055 | 298.8 → **561.6** | 0.053 → 0.109 |
| cylinder d=50 | **22**/1.188 | 22/1.274 | 1161.4 → **2107.5** | 0.216 → 0.379 |
| cylinder d=220 | 62/0.589 | 65/0.591 | 5019.6 → **5828.4** | 0.753 → 0.807 |
| torus d=1 | **3**/22.105 | 3/18.010 | 342.2 → **375.1** | 0.053 → 0.041 |
| torus d=50 | **12**/2.091 | 12/1.982 | 905.8 → **1492.0** | 0.114 → 0.185 |
| torus d=220 | 35/0.974 | 35/0.961 | 3195.0 → **4146.2** | 0.334 → 0.379 |
| ellipsoid d=1 | **5**/5.012 | 6/5.326 | 274.7 → **548.3** | 0.047 → 0.099 |
| ellipsoid d=50 | **16**/1.572 | 21/1.540 | 1007.6 → **1843.2** | 0.175 → 0.293 |
| ellipsoid d=220 | 44/0.795 | 54/0.709 | 4187.6 → **4859.2** | 0.545 → 0.597 |
| **JAY's cell** | **17**/1.600 | 19/1.475 | 862.2 → **1555.6** | 0.228 → 0.377 |

Ink ratio vs matching hatch cell: sphere d=50 **2.22×**, cylinder d=50 **2.00×**, torus d=50
**2.03×**, ellipsoid d=50 **2.20×**, **Jay's cell 2.04×** — ≈2× exactly where Jay asked for it.
At d=220 (cap binding): sphere **1.38×**, cylinder **1.30×**, torus **1.42×**, ellipsoid
**1.37×** — the cap degrading the rule gracefully, as designed.

**Cap coverage sweep** (P5a instrument, `{sphere, cylinder, torus, ellipsoid, cone, capsule} ×
{170, 220, 300}`): max **capsule d=300 = 0.8298**, all others lower. All under the 0.85 bar with
margin ≥ 1.5 pts of headroom on the tightest cell.

## Four mutations — all run and matched the plan's predictions

| # | mutation | measured |
|---|---|---|
| M1 | revert engine, keep new test | **23/91 fail** (21 P3a cells fail 0.40–0.74 vs required 0.85, plus 2 P5b assertions that sit within float rounding of their own rounded-literal threshold on the pre-fix engine's precise ink value — not a real defect: post-fix ink clears the same thresholds by 800+mm) |
| M2 | keep per-family budget, disable cap | **P5a fails**: sphere d=220 cov **0.9839**, cylinder d=220 **0.9867**, cylinder d=300 **0.9985**; cylinder d=220 ink **9136.777mm** — matches judge C1's rejected-Rank-3 saturation number to the digit |
| M3 | cap at 4× inkWidth (over-tight) | **P5b fails** on all 4 primitives: sphere d=220 ink **2229.4** (vs shipped 3713.0), cylinder **2959.4** (vs 5019.6), torus **2208.7** (vs 3195.0), ellipsoid **2543.4** (vs 4187.6) — crosshatch becomes lighter than shipped, proving P5b is a real two-sided cap |
| M4 | restore `CROSS_PAIR_BUDGET/2`, keep cap | **P3a fails on all 21 cells** — proves P3a guards the budget, not the cap |

## Test file: `scene3d-crosshatch-parity.test.js` (rewritten P3/P5, P1/P2/P4/P6 kept verbatim)

- **P1** (kept) — both families ≥ 2 rulings: pass.
- **P2** (kept) — median-gap ratio B:A ∈ [0.80, 1.25]: pass.
- **P3a** (NEW — Jay's rule) — each family ≥ 0.85× the matching hatch count, `d ∈ {1,50,80,110,140}`
  × 4 primitives + Jay's cell: **pass, min 0.933** (structurally guaranteed ≥1.0 below the cap; the
  0.85 margin exists for the "first touch" band at d=140).
- **P3b** (kept, re-scoped from old "P3") — count ratio B:A ∈ [0.72, 1.40] at d=50/220: pass.
- **P4** (kept) — at d=1, |nB−nA| ≤ 3: pass.
- **P5a** (NEW — the cap) — W-26b `inkCoverage` < 0.85, copied verbatim from
  `scene3d-fill-span-verdict.test.js`, on 6 primitives × {170,220,300}: pass, max 0.8298.
- **P5b** (NEW — the cap is not too tight) — d=220 ink ≥ v1.4.1 shipped value, 4 primitives: pass.
- **P5c** (NEW — the family sits AT the cap) — median gap ≥ 0.80× `crossMinPitch` where the cap
  binds: pass.
- **P6** (kept) — byte-identity: sphere hatch d=50 24/723.4, cylinder hatch d=220 145/4495.5,
  sphere contour d=50 18/657.25 — all identical to the digit.

**Result: 91/91.**

## Bars changed (mandatory disclosure)

| file:line | old → new | why |
|---|---|---|
| `src/core/scene3d/surface-fill.js` | `CROSS_PAIR_BUDGET = 1.1` (shared, half-split) → `CROSS_FAMILY_BUDGET = 1.0` (per-family) + new `crossMinPitch`/`crossFloorPitch` cap + widened `dfMaxMul` | This **is** Jay's decision 6 option C — the mechanism itself |
| `tests/unit/scene3d-curved-density-floor.test.js` (~line 293) | crosshatch TOTAL counts: d=10 ratio 0.25 `18→22`, ratio 1.0 `11→18`; d=100 ratio 0.25 `114→120`, ratio 1.0 `64→116` | Arithmetic consequence — both families now ask for the full single-family target instead of half a shared sum |
| `tests/unit/scene3d-curved-density-floor.test.js` (~line 314) | dial ceiling `nB(0.25)/nB(2) >= 2.5` → **`>= 2.0`** (measured 2.25 @d=10, 2.542 @d=100). Sub-check `nB(0.25) >= 2.0×nB(1)` **REMOVED**, replaced with **strict monotonicity** `nB(0.25) > nB(1) > nB(2)` at d=10 AND d=100 (measured 9>7>4, 61>47>24) | **CEILING GOING DOWN — needs orchestrator sign-off** (AGENT-PROTOCOL / plan stop condition 7). Root cause: `ladderPairWantedPitch`'s own `c ≤ 1` coverage clamp now bites earlier (`cov ≈ 0.25` vs the old `≈ 0.45`) because ratio=1 is already AT the ceiling by design — that IS Jay's rule. The dial's authority over its full range is intact (measured); monotonicity cannot be gamed by a flat response, which is what the old magnitude bar existed to catch |
| `tests/unit/scene3d-crosshatch-cell-shape.test.js` — CEILING array, all 11 configs | `nA`/`nB`/`windows`/`cols[].n` all rise (denser families give the instrument more samples), e.g. sphere d=220 a `nA 48→53`, `nB 48→54`, `windows 90→110` | Arithmetic consequence, not a regression. **C1 (aspect RANGE, what W-31 actually protects) does NOT regress**: narrower on 3 configs (sphere d=50 a, torus d=220 a, cone d=220 a), flat on 4, wider on 2 that gained measurable columns (cylinder d=50 a 2→3 cols, ellipsoid d=50 a 3→5 cols). **C5 (measurability) improves on all 11.** Cone d=50 a's old 0.191 minimum (a one-sample artefact, n=1) is gone now that every column has n≥3 — not a regression against an artefact |
| `tests/unit/scene3d-crosshatch-cell-shape.test.js` — C2, 9 of 11 configs | `spreadA`/`spreadB` re-pinned UPWARD, e.g. torus d=220 a spreadB `5.90→7.49`, ellipsoid d=220 a spreadA `12.97→14.70`, cone d=50 a spreadB `11.79→16.88` | **CEILING GOING UP — needs orchestrator sign-off** (AGENT-PROTOCOL / plan stop condition 7). Pre-existing, already-filed **W-31b** defect (`probe()`'s per-ruling MEAN `mmPerFrac` spent as one scalar step) made more visible by denser families and a larger order-statistic population. **NOT fixed here** — the plan explicitly instructs not to attempt a fix (W-31 already measured its own Rank 1/Rank 2 dead); this belongs to W-31b |
| `tests/unit/scene3d-crosshatch-parity.test.js` — old single P5 | `cylinder d=220 ink ∈ [4200, 5431]` ("v1.3.98 + 15% cap") **REPLACED** by P5a/P5b/P5c | The old bar assumed a ~15%-over-shipped ceiling, definitionally wrong once Jay's rule targets ≈2× hatch ink. Replacement caps the thing that actually matters (drawn coverage, the suite's own pre-existing 0.85 instrument) and adds a floor (P5b) the old bar never had |

**Nothing else re-pinned.** `scene3d-plot-safety`, `scene3d-fill-span-verdict` (the calibrator,
untouched), `scene3d-ladder-uniform-field-spacing`, `scene3d-fill-even-spacing`,
`scene3d-curved-density-sparse-end`, `scene3d-curved-crosshatch-controls`,
`scene3d-hatch-density-angle-stable` (W-36b), `scene3d-fill-boundary-ends`,
`scene3d-fill-ruling-continuity`, `scene3d-mapper-audit`, `scene3d-surface-fill`, and every
`scene3d-mark-laws-draw` T1/T1b/T4 oracle are green **unmodified**.

## Guard battery (all foreground, one file at a time)

| suite | result |
|---|---|
| `scene3d-crosshatch-parity.test.js` (this unit's own, rewritten) | **91/91** |
| `scene3d-curved-density-floor.test.js` (re-pinned) | **13/13** |
| `scene3d-crosshatch-cell-shape.test.js` (W-31, re-pinned) | **23/23** |
| `scene3d-hatch-density-angle-stable.test.js` (W-36b, untouched) | **9/9** |
| `scene3d-ladder-uniform-field-spacing.test.js` (W-26 gap-jump) | **9/9** |
| `scene3d-fill-even-spacing.test.js` | **12/12** |
| `scene3d-curved-density-sparse-end.test.js` | **20/20** |
| `scene3d-fill-ruling-continuity.test.js` | **10/10 (+1 skip)** |
| `scene3d-fill-boundary-ends.test.js` | **41/41** |
| `scene3d-plot-safety.test.js` | **5/5 (+1 skip)** |
| `scene3d-mapper-audit.test.js` | **70/70** |
| `scene3d-surface-fill.test.js` | **6/6 (+2 skip)** |
| `scene3d-curved-crosshatch-controls.test.js` | **18/18** |
| `scene3d-fill-span-verdict.test.js` (**untouched**, this unit's own calibrator) | **11/11** |
| `scene3d-mark-laws-draw.test.js` (T1/T1b/T4 mkTick/mkDashRamp oracles) | **30/30 byte-identical** |
| `scene3d-hatch-density-floor.test.js` | 6/6 |
| `scene3d-hatch-density-500.test.js` | 14/14 |
| `scene3d-fill-ruling-corners.test.js` (W-33) | 19/19 |
| `scene3d-tone-law-dispatch.test.js` | 7/7 (1 flaky worker-RPC-timeout error under shared-machine load, exit 0 — matches T1/T1b's own documented pattern, not a regression) |
| `scene3d-hl-stage-roster.test.js` | 5/5 |
| `scene3d-xray.test.js` | 9/9 |
| `scene3d-tone-law-collapse.test.js` | 95/95 (same flaky-RPC note) |
| `scene3d-tone-law-writeback.test.js` | 7/7 |
| `scene3d-mappers.test.js` | 32/32 |
| `scene3d-box-density-bearing.test.js` (faceted path, untouched) | 4/4 |
| `scene3d-curved-fill-angle-migration.test.js` + `scene3d-hatch-angle.test.js` | 65/65 |
| `scene3d-shadow-anatomy/overlap/stroke-treatment.test.js` | 35/35 |
| `fill-hatch-unified.test.js` + `fill-param-effects.test.js` (2D layer, unrelated) | 61/61 |
| `geometry3d-enhancements.test.js` + `noise-rack.test.js` (unrelated) | 89/89 |

## Evidence

`docs/3d-audit/fill-audit/after/W-36c/` (captured from MAIN against this worktree's port 8475):

- `manifest.A.1-1.jsonl` — 15 shots: `{sphere,cylinder,torus,ellipsoid}__crosshatch__ladder__
  {low,med,max}__a` (12), plus the 3 must-not-move controls (`sphere__hatch__ladder__med__a`,
  `sphere__contour__ladder__med__a`, `cylinder__hatch__ladder__max__a`).
- `shots/A/*.webp` — all 15.
- `jays-cell-before.png` / `jays-cell-after.png` — bespoke Playwright capture (no manifest cell
  carries `rungMode`): sphere, crosshatch, fillAngle 45, fillDensity 50, rungMode `fine`,
  DEFAULT_CAMERA, ground+backdrop off. Before = pre-fix scratch export served on port 8478,
  after = this worktree's own dev server on port 8475.
- `report.json` — full numeric dump (raw-rig cells, cap sweep, gallery evidence, mutations, guard
  battery, LOOK notes, bars-changed, stop-conditions-checked).

**Gallery (whole-scene pipeline) before → after:**

| cell | low | med | max |
|---|---|---|---|
| sphere | 454.6 → 759.3 | 1551.3 → 2714.1 | 5940.6 → 6870.4 |
| cylinder | 564.7 → 946.3 | 1716.7 → 2950.5 | 6566.7 → 7682.8 |
| torus | 409.1 → 597.4 | 643.9 → 949.8 | 1817.0 → 2163.2 |
| ellipsoid | 460.3 → 778.1 | 1468.5 → 2467.7 | 5529.1 → 6397.8 |

Low/med magnitudes are smaller than the raw rig's ≈2× because the gallery's whole-scene pipeline
differs from the raw rig (per the plan's own §1 disclosure — the same gap the plan documented
between raw-rig and gallery numbers pre-fix). Max densities show the expected smaller increase
(1.16×–1.19×) where the cap is doing its job.

**Must-not-move controls (byte-identical, confirmed):** `sphere__hatch__ladder__med__a` 1343.1 →
1343.1, `sphere__contour__ladder__med__a` 1169.9 → 1169.9, `cylinder__hatch__ladder__max__a`
5901.2 → 5901.2.

**Jay's bespoke cell:** pathCount 97→120, ink **987.3 → 1680.8mm (1.70×)** on the whole-scene
pipeline; the raw rig's own prediction for the identical params was 862.2 → 1555.6 (2.04×),
matched to the digit by the parity test's own `Jay's cell` assertions.

## LOOK — native-resolution crops, described

- **`cylinder__crosshatch__ladder__max__a`** before/after side-by-side: after is visibly denser —
  the wall's diamond cells shrink noticeably — and still resolves into a clean grid, no solid
  block. The top face's radial family is also denser but legible.
- **`sphere__crosshatch__ladder__med__a`** before/after: after is visibly denser, each family
  approaching the single-family hatch line count seen in `sphere__hatch__ladder__med__a`.
- **`capsule__crosshatch__ladder__max__a`** (the tightest cell, cov 0.8298 against the 0.85 bar):
  fine but clearly resolved diamond grid at native resolution — not a solid block. This is the
  cell that decides Rank 1 vs Rank 2, and it holds.
- **Sphere max, native-resolution crops** (PIL crop → Read, 2× nearest-neighbour upscale): the
  pole-region crop shows the highlight opening BOTH families' gaps together (not deleting one) as
  the surface turns toward the light; the equator-region crop shows a uniform, cleanly resolved
  diamond grid with no artifacts.
- **Cylinder max, native-resolution wall crop**: uniform resolved diamond grid, no artifacts, no
  seam defect.
- **Jay's cell before/after**: clearly denser grid after the fix, both families visibly closer to
  matching density, pole highlight still opens correctly in both.

All crops read as intended: ≈2×-density at low/med, a resolved (not solid) grid at max, on every
primitive checked including the tightest cell.

## Stop conditions checked

1. **P5a breach** — none. Max coverage 0.8298 (capsule d=300), Rank 1 kept.
2. **Capsule margin** — 0.8298 < 0.84 threshold; Rank 2 not invoked.
3. **P5b breach** — none; every d=220 after-ink exceeds its v1.4.1 before-ink.
4. **C2 worse than the plan's own §3.4 prediction** — no; measured numbers match the plan's own
   predictions to the digit (torus d=220 spreadB 7.49, cone d=50 spreadB 16.88, etc.).
5. **P6 control moved** — none; all three controls byte-identical in both the raw rig and gallery.
6. **Undisclosed bar move** — none; every move is in the `## Bars changed` table above.
7. **Orchestrator sign-off on the two disclosed bar moves** — **NOT YET OBTAINED.** Both are
   arithmetic consequences of Jay's own decision 6, mechanism measured and matching the plan's own
   predictions to the digit, but per AGENT-PROTOCOL this is the orchestrator's ruling, not the
   implementer's. **This unit reports DONE/FU on that basis** — everything else is complete and
   verified; the two bar moves need explicit sign-off before this can be called fully closed.
8. **Native crops don't read as ≈2× or solid** — they read correctly (see LOOK above).
9. **Honest bar above Density 140** — per the plan: Jay's rule holds exactly to Density ≈140, then
   degrades by design as the cap binds. Confirmed via the cap-binding table re-checked at
   d=170/220/300 (not independently re-swept across the full d=140–300 band beyond what the P5a/
   P5c tests already exercise).

## Interruption note

This implementer was killed by a rate limit mid-unit (after the mechanism, all test rewrites, the
full guard battery, and most of the evidence capture were already done and verified — only the
final LOOK narration and commit were outstanding). The orchestrator checkpointed the dirty
worktree as `ac412d61` (`wip(3d-audit): W-36c checkpoint (unverified)`) on top of `a3b651f0`. On
resume: re-verified `ac412d61`'s content was intact (re-ran `scene3d-crosshatch-parity.test.js`
91/91, `scene3d-curved-density-floor.test.js` + `scene3d-crosshatch-cell-shape.test.js` 36/36,
byte-identical to the pre-kill results), then created `8adfd5af` — an empty-diff commit on top
carrying the full descriptive message (the checkpoint's content needed no changes).

## Follow-ups for the orchestrator

- Sign off on the two disclosed bar moves (density-floor dial `2.5→2.0`+monotonicity;
  crosshatch-cell-shape C2 ceiling) or direct a different resolution.
- **W-31b** (already filed) inherits the new, higher C2 numbers measured here as its updated
  baseline.
- No other follow-ups; every other guard is green unmodified and every stop condition not listed
  above as open is closed.
