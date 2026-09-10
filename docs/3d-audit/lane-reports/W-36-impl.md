STATUS: DONE/FU

# W-36 — implementer report: crosshatch pair spends one shared coverage budget

- Lane: `fill-audit-a2` · worktree `.claude/worktrees/fill-audit-a2` · port 8475 · branch `3d-scene/fill-audit-a2`.
- Base → new: `f828d828` (T1b, real lane HEAD) → **`e31d8591`**.
- Files touched (all ALLOWED): `src/core/scene3d/surface-fill.js`, `tests/unit/scene3d-crosshatch-parity.test.js` (new), `tests/unit/scene3d-curved-density-floor.test.js`.
- Mechanism shipped: **Rank 1**, exactly as planned — `CROSS_PAIR_BUDGET = 1.1` (the sum W-26b-1 already proved plot-safe) split evenly between family A (role `'a'`) and family B (role `'b'`) at the shipped `crossDensityRatio = 1`; the dial still divides only family B's half by the ratio. `crossShareOf` / `ladderCrossWantedPitch` / `CROSS_SHARE_BASE` deleted (unreachable) — discharges W-26 hygiene item (c). `dfMaxMul` now reads `crossPairShare` for whichever role is walking (family A gets the same step-ceiling treatment family B always did).

## RED → GREEN

- RED re-derived on the real base (`f828d828`, not `47a5a755` — the plan's numbers were close but not identical after T1b): 24 of 37 assertions failed in the new `scene3d-crosshatch-parity.test.js` (P1–P4 fail on d=1/50/220 across all four primitives; Jay's cell fails P2/P3; P5 and P6 already passed pre-fix). Reproduced byte-for-byte in a scratch `git archive f828d828` export with a symlinked `node_modules` (also 24/37).
- GREEN after the fix: **37/37**. `scene3d-curved-density-floor.test.js`: **13/13** after re-pinning 2 counts and replacing 1 bar (see `## Bars changed` below — identical to the commit body).

## Oracle (P1–P6, per LEDGER.md "Standing orchestrator rulings" 2026-09-08 — NOT the brief's literal ±10% count bar)

| cell | A n/gap (mm) before → after | B n/gap (mm) before → after | gap ratio B:A before → after | ink before → after |
|---|---|---|---|---|
| sphere d=1 | 4/— → 2/— | 1/— → 4/— | n/a → n/a (P4: \|4-1\|=3 → \|2-4\|=2) | 207.5 → 235.0 |
| sphere d=50 | 16/1.466 → 9/2.901 | 3/16.775 → 11/2.641 | 11.44 → **0.910** | 819.9 → 877.3 |
| sphere d=220 | 69/0.488 → 37/0.770 | 9/3.278 → 48/0.696 | 6.72 → **0.904** | 3518.0 → 3713.0 |
| cylinder d=1 | 6/— → 3/— | 1/— → 4/— | n/a (P4: \|6-1\|=5 → \|3-4\|=1) | 305.3 → 298.8 |
| cylinder d=50 | 22/1.188 → 12/2.149 | 3/6.437 → 12/2.135 | 5.42 → **0.994** | 1182.4 → 1161.4 |
| cylinder d=220 (judge C1's cell) | 94/0.383 → 52/0.600 | 10/2.662 → 54/0.602 | 6.95 → **1.003** | 4963.8 → **5019.6** (raw rig) / **5209.5** (real capture, +6.0% vs v1.3.98's 4912.6, cap +15%=5649.5) |
| torus d=1 | 3/— → 2/— | 1/— → 2/— | n/a (P4: 2 → 0) | 257.4 → 342.2 |
| torus d=50 | 12/2.091 → 7/5.135 | 1/— → 7/4.302 | n/a → **0.838** | 823.3 → 905.8 |
| torus d=220 | 46/0.777 → 25/1.029 | 4/24.234 → 25/1.092 | 31.2 → **1.061** | 3194.8 → 3195.0 |
| ellipsoid d=1 | 5/— → 2/— | 1/— → 4/— | n/a (P4: 4 → 2) | 299.3 → 274.7 |
| ellipsoid d=50 | 16/1.572 → 9/2.794 | 3/17.585 → 11/2.782 | 11.19 → **0.996** | 951.7 → 1007.6 |
| ellipsoid d=220 | 67/0.525 → 36/0.889 | 9/3.501 → 47/0.723 | 6.67 → **0.814** | 3980.1 → 4187.6 |
| **Jay's cell** (sphere, crosshatch, Ladder, Fine rungs, 45°, d=50) | 17/1.600 → 9/2.949 | 3/16.845 → 11/2.717 | 10.53 → **0.921** | 860.0 → 862.2 |

All "before" numbers measured on the real base `f828d828` (not the planner's `47a5a755` prototype — re-derived per protocol; close but not identical, e.g. sphere d=50 B was 3/16.775 here vs the plan's 3/18.614). All "after" numbers match the plan's Rank-1 prototype predictions to within measurement noise (e.g. cylinder d=220 ink predicted 5019.6, measured 5019.6 exactly on the same rig).

P1–P4 pass on every cell above (both families ≥2 at d=50/220; d=1 |nB−nA|≤3 everywhere — torus d=1 is now 2 vs 2). P5: cylinder d=220 ink 5019.6mm (raw-run BOUNDS-320×220 rig) / 5209.5mm (real capture pipeline, +6.0% vs v1.3.98) — both comfortably inside `[4200, 5431]`. P6 byte-identity controls (sphere hatch d=50 24/723.4mm, cylinder hatch d=220 145/4495.5mm, sphere contour d=50 18/656.4mm) — untouched, confirmed to the digit.

## Bars changed

See the commit body (`e31d8591`) for the full `## Bars changed` section — reproduced here:

- `tests/unit/scene3d-curved-density-floor.test.js:264` — `22` → `18` (sphere crosshatch d=10, ratio 0.25, TOTAL count)
- `:265` — `10` → `11` (d=10, ratio 1.0 — family B was 1 ruling, now 4; this is Jay's literal defect)
- `:266` — `138` → `114` (d=100, ratio 0.25)
- `:267` — `60` → `64` (d=100, ratio 1.0)
- `:275-282` "crossDensityRatio spread restored to >=2.0x" — **REPLACED** (arithmetically incompatible with parity; measured 1.636/1.781, both below the old ≥2.0 bar). Replacement: `nB(0.25)/nB(2) ≥ 2.5` at d=10 (measured 3.00) and d=100 (measured 4.69); `nB(0.25) ≥ 2.0 × nB(1)` at d=100 (measured 2.35).

## Mutation checks (§3.2, all three run and reverted in-place — never left in the tree)

1. Revert to pre-fix blob (= the RED proof above): P1–P4 fail on every cell.
2. `CROSS_PAIR_BUDGET = 2.0`: cylinder d=220 ink = **9136.78 mm** — P5 fails, judge C1's saturation restored almost exactly (matches plan's predicted ~9137).
3. `crossPairShare` forced to always return `1` (both families read the full un-shared target, "role back to 'a'"): cylinder d=220 ink = **9136.78 mm**, identical to mutation 2 — confirms P5 guards the mechanism, not one specific constant.

## Guards run (foreground, one file at a time)

`scene3d-plot-safety` 5/5 (+1 skip) · `scene3d-fill-span-verdict` 11/11 (incl. crosshatch d=50/220 anti-blob) · `scene3d-curved-crosshatch-controls` 18/18 · `scene3d-ladder-uniform-field-spacing` 9/9 (R1a gap-jump ≤1.15 holds) · `scene3d-fill-even-spacing` 12/12 · `scene3d-curved-density-sparse-end` 20/20 · `scene3d-curved-density-floor` 13/13 (after the re-pins above) · `scene3d-crosshatch-parity` (new) 37/37. Plus a broad sweep of every other unit test file referencing `crosshatch`/`scene3d`: `fill-hatch-unified`, `fill-param-effects`, `geometry3d-enhancements`, `noise-rack`, `scene3d-box-density-bearing`, `scene3d-curved-fill-angle-migration`, `scene3d-fill-boundary-ends`, `scene3d-fill-ruling-continuity`, `scene3d-hatch-angle`, `scene3d-hatch-density-500`, `scene3d-hatch-density-floor`, `scene3d-hl-stage-roster`, `scene3d-mapper-audit`, `scene3d-mappers`, `scene3d-mark-laws-draw`, `scene3d-shadow-anatomy`, `scene3d-shadow-overlap`, `scene3d-stroke-treatment`, `scene3d-surface-fill`, `scene3d-tone-law-dispatch`, `scene3d-xray` — **all green** (one pre-existing "unhandled error" console timeout in `scene3d-tone-law-dispatch`'s stress matrix, unrelated to this fix, run exits 0).

## Guard regression found OUTSIDE this unit's scope — NOT fixed, needs an orchestrator decision

`tests/unit/scene3d-hatch-density-angle-stable.test.js`: **2 of 9 tests now fail** — `sphere > crosshatch: mean rendered bearing is stable across Density 50 -> 150` (gap 3.70° vs a 3° tolerance) and the same for `cone` (gap 3.82°). This file is **not** in this unit's ALLOWED file list and was **not** named in the plan's guard list; it was found by running a broader sweep than the plan specified. It was **not edited**.

Root-caused, and it is not a placement bug:

- This guard's metric is the length-weighted mean bearing of **both** crosshatch families **combined**. Before W-36, family A held ~91% of the ink share (the defect itself), so the combined bearing effectively measured only family A's own direction field — which really is density-invariant.
- W-36 intentionally moves the split toward 50/50 by design (measured `shareA` 0.47–0.52 across Density 50/150 on sphere and cone).
- Measured **per family** (the actual claim this guard's own docstring says it exists to verify — "no code path derives a line's direction from spacing/density/count"): sphere `bearingA` 63.05° → 62.08° (Density 50→150), `bearingB` 168.711° → 168.715°; cone `bearingA` 84.40° → 83.05°, `bearingB` 144.175° → 144.181°. **Every one of these is stable to well under 1.5°** — each family's direction field is unaffected by this fix.
- A near-50/50 vector average of two bearings that are themselves nearly orthogonal (as they are on sphere/cone at this fill angle) is maximally sensitive to a small (2–5%) shift in the inter-family ink-share ratio — that sensitivity, not a direction-field bug, is what produces the combined-metric swing. Cylinder and torus crosshatch (not near that cancellation point at this angle) still pass.

Full numbers, per-family breakdown, and the exact measurement script logic are in `docs/3d-audit/fill-audit/after/W-36/report.json` under `outOfScopeFindingNOTFixed`. Recommend: either accept this as an inherent, now-understood consequence of shipping parity and queue a follow-up to redesign that one guard's sub-test to measure per-family bearing stability (which is what it actually intends to check and would then pass cleanly), or the orchestrator's call otherwise. Not touched here.

## Evidence

- `node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-a2 --port 8475 --only '^(sphere|cylinder|torus|ellipsoid)__crosshatch__ladder__(low|med|max)__a$' --out docs/3d-audit/fill-audit/after/W-36` — 12/12 cells captured, `appVersion 1.3.99` confirmed in the manifest, matches the worktree's `package.json`.
- `docs/3d-audit/fill-audit/after/W-36/report.json` — full before/after ink table, family-split raw stats for every P1–P4 cell, Jay's-cell bespoke capture stats, mutation-check numbers, and the out-of-scope finding above.
- Bespoke capture of Jay's own cell (sphere, Crosshatch, Ladder, Fine rungs, 45°, Density 50 — no manifest cell covers `rungMode`): `after/W-36/jays-cell-before.png` / `jays-cell-after.png`, via a scratch (uncommitted) Playwright script driving `window.app.engine` directly — same `page.evaluate` idiom as `scripts/audit/scene3d-capture.js`. "Before" served from a scratch `git archive f828d828` export on port 8476 (self-started and self-killed by the script, verified via `lsof` before/after); "after" served from the live worktree on port 8475 (already running — left untouched, not killed).
- **LOOKED at the pictures**, native-resolution crops (PIL crop → Read), in `after/W-36/crops/`:
  - **`cylinder__crosshatch__ladder__max__a`**: the true pre-fix regression (`cylinder-max-REGRESSION-before.png`, captured fresh from `f828d828`) shows a dense, near-solid pack of ~0.38 mm-pitch parallel diagonal lines with the crossing family reduced to one or two widely-spaced, barely-visible strokes — reads as a hatch, not a crosshatch. The fix (`cylinder-max-after.png`) shows a clean diamond crosshatch grid, both families at matched ~0.60 mm pitch, no saturation or blobbing, cells clearly resolved.
  - **`sphere__crosshatch__ladder__med__a`**: regression crop (`sphere-med-REGRESSION-before.png`) shows ~11 parallel curved lines (family A) with the crossing family reduced to a single thin arc at one corner. The fix (`sphere-med-after.png`) shows a clear curved crosshatch grid, both families present at comparable, matched pitch.
  - **Jay's own cell**: the before crop reproduces his screenshot description almost exactly — one dominant family of ~17 near-parallel tilted arcs reading as latitude bands, crossing family reduced to ~3 widely-spaced, barely-visible arcs. The after crop shows a clear, roughly-square crosshatch grid with both families visibly present at comparable density.
  - Also confirmed on all three: the highlight/shadow gradient is preserved (gap opens/closes smoothly across the tone bands in both families, no discrete jump), and d=220 crosshatch never blobs into a solid block (P5 + visual check agree).

## Open follow-ups

1. **Orchestrator decision needed** on `scene3d-hatch-density-angle-stable.test.js` (2/9 failing, out of scope — see above).
2. Rank 2 (`CROSS_PAIR_BUDGET = 1.2`) was **not** taken — Rank 1 ships per the standing ruling; only take Rank 2 if the orchestrator judges Rank 1's crops too light against Jay's reference, and only with the W-26 conditional-acceptance ruling re-applied.
3. W-31 (crosshatch cell shape) can now re-measure on `main` + this unit's landing sha, per the existing ruling.
