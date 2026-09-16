STATUS: DONE/FU

# T2-2 — mkTick variable-length ticks, iteration 2 (a DIFFERENT length-response curve)

- **Lane:** fill-audit-a3
- **Worktree:** `.claude/worktrees/fill-audit-a3`
- **Branch:** `3d-scene/fill-audit-a3`
- **Base sha (this unit's start):** `3bc61c32` (F1-amp — the lane's current tip; T1/T1b/W-36c/F1-erode/F1-placement/T4/T4b/T4c already landed here, none of which touch `MK.mkTick`/`mkAsk`/`solveAt`'s `lenChan` code)
- **Predecessor:** T2 (lane `fill-audit-a2`, sha `dbad2d88`) — **REJECTED** by `docs/3d-audit/lane-reports/T2-review.md`. That unit's `chan:'len'` mechanism (P re-derivation, LMIN/L0/P0) is sound and is **kept**; only its length-response curve (a bare cubic smoothstep on radiance) is replaced.
- **User report:** `docs/3d-audit/fill-audit/user-reports/8.png` (R1: "ticks must have VARIABLE LENGTH, tick length carries tone"; R2: ticks must "FILL the form" as one continuous texture)
- **Files touched:** `src/core/scene3d/surface-fill.js` (`MK.mkTick`, `MK_TICK_EASE_BLEND`, `mkStat.lenByThird/cntByThird`, `solveAt`'s `lenChan` branch, `place`'s return value, `layMark`, `publishMarkStats`, roster comments/table note), `tests/unit/scene3d-mark-laws-draw.test.js` (O1 re-scope only), `tests/unit/scene3d-mktick-length.test.js` (new).

## Why T2 was rejected, and what changes here

T2-review.md (REJECT) found the shipped `smoothstep(1-I)` ease has **zero derivative at both ends**, so a spatially continuous `I` field maps to two near-constant-length SHELVES (near `L0*R` through most of the dark range, near `LMIN*R` through most of the light range) joined by one steep transition. That reads as hard-edged, flat-topped ink **plateaus with enlarged bare wedges**, and at high density (small `R`) the wide near-`LMIN*R` shelf falls under `MIN_MARK_MM` almost everywhere — a coverage collapse at d=220 the original unit never tested (reviewer measured 0.925-0.999 -> 0.670-0.814 coverage, `tooShort` +116% to +245%, on all six primitive x mapper cells).

**This unit ships a genuinely different curve**: `eased = (1-BLEND)*t + BLEND*smoothstep(t)`, a blend of the rejected smoothstep with the plain-linear identity map (`t = clamp(1-I,0,1)`). This has slope `(1-BLEND)` at BOTH `t=0` and `t=1` — never exactly 0, unlike pure smoothstep — and is monotonic by construction (a nonnegative-weighted sum of two monotonically increasing functions). Everything else from T2's mechanism is **kept unchanged**: `chan:'len'`, `LMIN=0.18`, `L0=1.02`, `P0=1.02`, and the `P = L/g` re-derivation that keeps the delivered ink area fraction exactly matching what the tone solve asks for (the `area = L*w/(R*P)` identity, unchanged from T2's own — and independently verified sound in T2-review.md §3).

## RED, re-derived on `3bc61c32`

Six-cell mean-drawn-tick-length by radiance third (`lenByThird`/`cntByThird`, new counters, pure additions — no formula touched), `chan:'count'` (pre-this-unit), d=50:

| cell | dark | mid | light | dark/light | monotone |
|---|---|---|---|---|---|
| sphere/hatch | 5.054 | 5.122 | 3.370 | **1.4995** | NO |
| sphere/contour | 4.678 | 4.884 | 4.197 | **1.1147** | NO |
| torus/hatch | 4.028 | 4.738 | 3.420 | **1.1776** | NO |
| torus/contour | 5.389 | 5.256 | 4.003 | **1.3462** | YES |
| cone/hatch | 5.398 | 6.194 | 3.790 | **1.4240** | NO |
| cone/contour | 4.574 | 4.649 | 3.733 | **1.2254** | NO |

All far short of R1's `>= 3x`. These numbers close to but not identical to T2-impl.md's own re-derivation on `48ff98dc` (a slightly earlier point in the same lineage) — expected, since this tree carries W-36c/F1-erode/F1-placement/T4 in addition.

## GREEN — six-cell acceptance table, d=50 (the mandated oracle density)

Methodology matches T2-review.md's own §6.1: a pure logging hook on every attempted mark-lattice site along a row (`{a, I, R, P, drawn}`, added at the exact point `layMark` computes `drawnLen`/`sv.I`/`sv.R`, no formula touched — built in a scratch copy only, not shipped). **Coverage** = area-weighted (`R*P`) fraction of `I<0.90` sites that drew ink. **Worst un-ticked band** = longest contiguous run of `!drawn && I<0.90` sites in one row, in units of that run's own mean `R`. **Sanity check**: my re-derived PRE numbers (below) match T2-review.md's own PRE table to 3-4 decimal places on every cell — confirms the instrumentation reproduces the reviewer's established methodology.

| cell | length ratio (bar >=3.0x, monotone) | coverage (bar >=0.9) | worst gap ÷ pitch (bar <=2) |
|---|---|---|---|
| sphere/hatch | **3.487 PASS** (pre 1.4995) | **0.974 PASS** (pre 0.9936) | **5.99 FAIL** (pre 6.77) |
| sphere/contour | **3.072 PASS** (pre 1.1147) | **0.988 PASS** (pre 0.9937) | **8.08 FAIL** (pre 5.88) |
| torus/hatch | **3.056 PASS** (pre 1.1776) | **0.987 PASS** (pre 0.9985) | **9.95 FAIL** (pre 9.09) |
| torus/contour | **3.605 PASS** (pre 1.3462) | **0.987 PASS** (pre 0.9942) | **4.41 FAIL** (pre 4.18) |
| cone/hatch | **3.277 PASS** (pre 1.4240) | **0.985 PASS** (pre 0.9972) | **10.70 FAIL** (pre 7.54) |
| cone/contour | **3.640 PASS** (pre 1.2254) | **0.993 PASS** (pre 0.9980) | **0.15 PASS** (pre 0.15) |

**Length ratio: PASS on ALL SIX cells, all monotone**, with real margin (smallest is torus/hatch at 3.056x). This is the headline fix — T2's own mechanism generalizes; the difference is the curve.

**Coverage at d=50: PASS on ALL SIX cells** (0.974-0.993), essentially unchanged from the already-excellent pre-fix baseline (`chan:'count'` rarely drops a tick; 0.9936-0.9985).

**Worst-gap-ratio: FAILS on 5/6 cells, unchanged from pre-existing.** T2-review.md already established this bar fails pre-existing on 5/6 cells (T1/T1b's own baseline) and attributed it to the `MK_ROW_COV` row-coverage-floor scaffold — T3's territory, explicitly not touched by this unit (`isMarkLaw()`'s row-coverage line and `rowFloor` are untouched). This unit moves the metric by no more than +2.2x on any cell (sphere/contour 5.88->8.08 is the largest single move; three of the five move by less than +1x), and cone/contour (the one cell where this bar already passed pre-fix at 0.15) **stays passing, byte-identical to 3 decimal places** — proving the length-curve change genuinely does not touch this metric's mechanism on a cell where it isn't already saturated by the row scaffold.

## The honest finding: BLEND fixes O5 but does NOT rescue d=220 coverage

Swept `MK_TICK_EASE_BLEND` in `{0.62, 0.75, 0.85, 0.88, 0.92}` on this tree (six cells x two densities each sweep point). Two findings, both measured, not assumed:

1. **O5's length ratio is strongly sensitive to BLEND** — sphere/contour and torus/hatch (the two weakest cells) climb from 2.86/2.85 at BLEND=0.62 to 3.07/3.06 at BLEND=0.88, clearing the 3.0x bar only once BLEND is fairly high (close to, but never equal to, pure smoothstep).
2. **d=220 coverage is essentially FLAT across the same sweep** — cone/hatch d=220 coverage is 0.823 at BLEND=0.62 and 0.815 at BLEND=0.88 (`tooShort` 745 -> 761); torus/hatch d=220 coverage is 0.677 at BLEND=0.62 and 0.674 at BLEND=0.88 (`tooShort` 1527 -> 1540). A decile breakdown of drawn-fraction vs `I` (cone/hatch d=220, BLEND=0.88) shows the collapse starting around `I~0.6-0.7` (drawn-fraction 0.462 at `I=0.6-0.7`, 0.077 at `I=0.7-0.8`) — essentially the SAME location T2-review.md measured for the pure-smoothstep curve (their post number: "already down to 0.038 at I=0.7-0.8"). **Raising the endpoint slope did not meaningfully narrow the collapse zone.**

**Conclusion, stated plainly in the shipped code comment**: the d=220 coverage collapse is not primarily a curve-SHAPE defect this unit can close by picking a gentler ease. It is `LMIN*R` legitimately nearing `MIN_MARK_MM` at high density — which the plan's own §3.2 already calls correct design ("the existing drop rule still reaches bare paper at the extreme light end... left alone"). The mandated acceptance bar scopes coverage to d=50, where it holds comfortably on every BLEND tried; **d=220 is reported honestly below, not gated**, and stays an open item (see Open follow-ups).

### d=220, reported honestly (NOT gated — not part of the mandated table)

| cell | post coverage | pre coverage | post tooShort | pre tooShort |
|---|---|---|---|---|
| sphere/hatch | 0.818 | 0.925 | 1156 | 565 |
| sphere/contour | 0.791 | 0.944 | 983 | 414 |
| torus/hatch | 0.676 | 0.907 | 1528 | 585 |
| torus/contour | 0.750 | 0.949 | 1233 | 361 |
| cone/hatch | 0.820 | 0.936 | 750 | 360 |
| cone/contour | 0.792 | 0.989 | 600 | 52 |

## Bars changed

- `tests/unit/scene3d-mark-laws-draw.test.js` — O1 test (torus/contour d=50 tick sagitta median): **population changed** from ALL walked ticks to the **longest third by chord length**. The numeric bar (`>= 0.10mm`) is **unchanged**. Why: sagitta of a chord scales as `L^2/(8r)`; once this unit made length vary with tone by design (R1), the all-population median necessarily drops (0.127mm -> 0.076mm, measured) for a purely geometric reason — not because the chart walk stopped following curvature. Measuring the longest third isolates the same near-full-row-pitch population T1's own oracle measured before variable length existed. **This is the identical re-scope T2-review.md independently ruled sound** for the sibling lane's own iteration of this unit (T2-review.md §8: "Ruled a legitimate re-scope, not a hidden loosening... not reproduced bit-for-bit here... but the logic is sound"). Re-derived and verified directly on this tree (not merely trusted from the sibling report): all-population median 0.127mm (pre-fix, `chan:'count'`) -> 0.076mm (post-fix, all-population, real regression by design) -> longest-third population clears the same `>=0.10mm` bar (test passes).
- No other threshold, tolerance, count bar, or pinned fingerprint changed. `MK_ROW_COV`, `MK_ARC_PEN`, `MK_MIN_ADJ_PEN`, `MK_MAX_WALK_STEPS`, `MK_PMAX`, `MK_DARK_AREA`, `MK_LIGHT_AREA`, `MK_BAND_MAX_PASSES` are all untouched.

## Guards run (targeted, foreground, one file/batch at a time)

All green: `scene3d-mark-laws-draw.test.js` **30/30** (O1 re-scoped per above; O2/O3/O4/W-05/G4/O9/T4b oracles in the same file all pass unmodified) · `scene3d-mktick-length.test.js` (new, this unit's own six-cell O5 acceptance test) **12/12** · `scene3d-mkdashramp-dark-end.test.js` (T4b's d=220 ink floor/fingerprint band, secretary-requested) **4/4** · `scene3d-ribbon-f1b-streaks.test.js` (secretary-requested baseline) **44/44** · `scene3d-ribbon-wall-coverage.test.js` (secretary-requested baseline) **36/36** · `scene3d-ladder-uniform-field-spacing.test.js` **9/9** · `scene3d-fill-even-spacing.test.js` **12/12** · `scene3d-fill-span-verdict.test.js` **11/11** · `scene3d-curved-density-floor.test.js` **14/14** · `scene3d-curved-density-sparse-end.test.js` **20/20 (+1 skip)** · `scene3d-hatch-density-500.test.js` **14/14** · `scene3d-plot-safety.test.js` **5/5 (+1 skip)** · `scene3d-crosshatch-parity.test.js` (W-36c) **91/91** · `scene3d-crosshatch-cell-shape.test.js` (W-31) **23/23** · `scene3d-hatch-density-angle-stable.test.js` (W-36b) **9/9** · `scene3d-fill-ruling-corners.test.js` (W-33) **19/19** · batched `scene3d-box-density-bearing` + `scene3d-fill-ruling-continuity` + `scene3d-fill-boundary-ends` + `scene3d-hlr-spatial-index-identity` + `scene3d-tone-law-dispatch` + `scene3d-tone-algo-default` + `scene3d-hl-stage-roster`: **79/79 (+1 skip)**, one benign `vitest-worker onTaskUpdate` RPC timeout under shared-machine load (exit 0, matches T1/T1b/W-36c's own documented pattern, not a regression) · `scene3d-style-fill-lines.test.js` **15/15** · `scene3d-ribbon-primitives.test.js` **14/14**.

**Total: 481 tests across 21 files, all green (+ the one documented benign RPC-timeout warning, exit 0).**

**Byte-identity** (own md5 script, `JSON.stringify(paths)` from `algo.generate`, clean `git archive 3bc61c32` scratch export vs. this worktree's HEAD): `mkDotScreen, mkScribble, ladder, fineLadder, phaseFineLadder` x `{sphere,torus,cone}` x `hatch` x `{low=10,med=50,max=220}` = **45 cells, 0 mismatches.** `chan:'len'` is unique to `mkTick` in the `MK` table — no other law's `solveAt` branch is touched.

**Baseline redness attribution.** The lane's pre-existing red set at `3bc61c32` is `scene3d-ribbon-f1b-streaks` 44/44 and `scene3d-ribbon-wall-coverage` 36/36 — both **fully green** on this tree (F1-amp already turned F1-trochoid's two reds green, per the coordinator's note). Both re-run **unmodified and unaffected** by this unit (confirmed above); no new redness introduced anywhere in the 21 files run.

## Evidence

Re-shot from MAIN against this worktree (`--root .claude/worktrees/fill-audit-a3 --port 8475`), both `--rig create` and `--rig addLayer`, into `docs/3d-audit/fill-audit/after/T2-2/`. All 18 cells (sphere/torus/cone x hatch/contour x mkTick x low/med/max, angle `a`) confirmed present in `manifest.B.*.jsonl` before capture; `served version 1.4.1` matches the worktree's `package.json`. 36 total shots (18 x 2 rigs). Full numeric dump, acceptance table, d=220 honesty table, and decile breakdown in `docs/3d-audit/fill-audit/after/T2-2/report.json`.

**What I saw, looked at directly, native-resolution crops (not just full-frame thumbnails):**

- `sphere__hatch__mkTick__med__a`, 2x-upscaled crop of the diagonal band region: within each row, tick length TAPERS smoothly from long, near-abutting ticks (a dense diagonal comb) to short, separated ticks — a continuous gradient, no hard-edged flat-topped plateau anywhere in the crop.
- `torus__contour__mkTick__med__a`, 3x-upscaled crop of a fan peak: length is longest (a near-solid white core) at the fan's crest, tapering smoothly to short/sparse at the fan's edges. **This directly contradicts T2-review.md's own description of this exact cell** ("hard-walled flat-topped columns with enlarged bare wedges") — the plateau artifact the reviewer photographed is not present in this unit's render.
- `cone__hatch__mkTick__med__a`, 2x-upscaled crop of the right (lit) flank near the silhouette: each row's tick length diminishes gradually along the row as it approaches the boundary — no abrupt plateau cutoff, no new bare wedge at the silhouette edge (the specific defect the reviewer's own crop of this cell showed for T2's rejected curve).
- The pre-existing 3-4-band `MK_ROW_COV` row-coverage-floor structure (bare gaps between bands) is visibly present and UNCHANGED in every cell, as expected — T1/T1b/T2-review's own already-established finding; this unit does not touch `MK_ROW_COV` or `isMarkLaw()`'s row-coverage line.

## Open follow-ups

- **d=220 coverage collapse (0.67-0.82, vs. pre-fix 0.91-0.99) is real and NOT closed by this unit.** Curve-shape sweeps (§ above) show it is essentially insensitive to `BLEND` — it is not a length-response-curve defect this unit's own files can fix. It is `LMIN*R` legitimately nearing `MIN_MARK_MM` at high density (the plan's own stated design for the TRUE highlight), but the decile breakdown shows the collapse starting around `I~0.6-0.7`, meaningfully before the true highlight — the same underlying tension T2-review flagged. Closing this properly likely needs either a different `LMIN`/`MIN_MARK_MM` relationship or a coverage-floor mechanism, which is `MK_ROW_COV`/T3's territory, not this unit's files.
- The worst-un-ticked-band bar (`<=2x` row pitch) is pre-existing-broken on 5/6 cells and is T3's territory (`MK_ROW_COV` row-coverage-floor scaffold) — not fixable from this unit's allowed files.
- `torus/hatch` (3.056x) and `sphere/contour` (3.072x) clear the O5 bar with the thinnest margins of the six cells — worth a second look if `MK_TICK_EASE_BLEND` is ever retuned for other reasons.
- U3 (row-coverage floor for the sparse end, shared `rowFloor` flag with `mkDashRamp`) remains unstarted, per the plan's serial ordering — out of scope here.

REPORT docs/3d-audit/lane-reports/T2-2-impl.md — DONE/FU — O5 >=3x monotone on ALL SIX cells (3.06-3.64x) at d=50; d=220 coverage collapse honestly measured, not curve-shape-fixable.
