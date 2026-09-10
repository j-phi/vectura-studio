STATUS: ACCEPT-WITH-FOLLOWUPS

# W-36 — adversarial review

Reviewer, read-only. Worktree under review: `.claude/worktrees/fill-audit-a2` (W-33 implementer
editing it live throughout this review — never read after the initial archive). Pinned range
`f828d828..e31d8591`, commit `e31d8591`. All verification below was performed in scratch
`git archive` exports (`/private/tmp/claude-501/scratch-W-36/{pre,post,v1398}`, symlinked
`node_modules`), foreground, one file at a time, per `AGENT-PROTOCOL.md` §Reviewers. Nothing in
any worktree was read, edited, or stashed after the initial `git archive f828d828`/`e31d8591`
pulls. All scratch mutations to `surface-fill.js` (mutation-distinctness probe, condition 9) were
applied to the **scratch** copy only, verified byte-identical to `e31d8591` afterward, and are
gone (scratch dirs deleted at the end of this review).

Files touched by the commit, confirmed against a `diff -rq` of both archives (excluding
`node_modules`/`graphify-out`): `src/core/scene3d/surface-fill.js`,
`tests/unit/scene3d-curved-density-floor.test.js` (modified), `tests/unit/scene3d-crosshatch-parity.test.js`
(new). Exactly the ALLOWED list in `W-36-plan.md` §5 — nothing forbidden touched.

## (1) RED reproduced

Copied the new `scene3d-crosshatch-parity.test.js` onto the `pre` (`f828d828`) scratch export and ran it
there: **24 failed / 13 passed (37)** — exact match to the impl report's claim. Spot-checked failure
reasons: sphere/cylinder/torus/ellipsoid P2/P3 fail with the plan's magnitude (e.g. sphere d=220 count
ratio measured **0.1304**, cylinder d=50 **0.1364**), P4 fails on cylinder/ellipsoid d=1 (`|nB-nA|` = 5, 4),
Jay's cell P2 fails with gap ratio **10.528** (matches the plan's/impl's own **10.53**).

Also ran an independent full P1–P6 numeric dump (`zzz-review-w36-p1p6-dump.test.js`, my own script,
not copied from the plan) against `pre`: **exact digit-for-digit match** to the impl report's RED table —
sphere d=50 A 16/1.466 · B 3/16.775; cylinder d=220 A 94/0.383 · B 10/2.662; Jay's cell A 17/1.600 ·
B 3/16.845; `P5_cylinderD220Ink` 4963.809.

## (2) GREEN reproduced

Same test file run against `post` (`e31d8591`): **37/37 passed**.
`scene3d-curved-density-floor.test.js` run against `post`: **13/13 passed**, including the two re-pinned
count assertions and the replaced spread bar.

## (3) P1–P6 reproduced with my own numbers, every cell

My independent dump script (raw `SurfaceFill.buildObject` runs, same rig, own implementation of
`rulingStats`/`crosshatchStats`, not copied from the test file's assertions — only the rig/scene builder
idiom, which is the documented in-repo pattern) against `post`, compared to the impl report:

| cell | my aN/aGap | my bN/bGap | count ratio | gap ratio | impl report |
|---|---|---|---|---|---|
| sphere d=1 | 2/— | 4/— | 2.00 | — | \|4−1\|→\|2−4\|=2 ✓ |
| sphere d=50 | 9/2.901 | 11/2.641 | 1.222 | 0.910 | identical to the digit |
| sphere d=220 | 37/0.770 | 48/0.696 | 1.297 | 0.903 | identical |
| cylinder d=1 | 3/— | 4/— | — | — | \|3−4\|=1 ✓ |
| cylinder d=50 | 12/2.149 | 12/2.135 | 1.000 | 0.993 | identical |
| cylinder d=220 | 52/0.600 | 54/0.602 | 1.038 | 1.003 | identical |
| torus d=1 | 2/— | 2/— | — | — | 2 vs 2, diff 0 ✓ |
| torus d=50 | 7/5.135 | 7/4.302 | 1.000 | 0.838 | identical |
| torus d=220 | 25/1.029 | 25/1.092 | 1.000 | 1.061 | identical |
| ellipsoid d=1 | 2/— | 4/— | 2.00 | — | \|4−2\|=2 ✓ |
| ellipsoid d=50 | 9/2.794 | 11/2.782 | 1.222 | 0.996 | identical |
| ellipsoid d=220 | 36/0.889 | 47/0.723 | 1.306 | 0.814 | identical |
| Jay's cell | 9/2.949 | 11/2.717 | 1.222 | 0.921 | identical |

All P1 (≥2 rulings), P2 ([0.80,1.25]), P3 ([0.72,1.40]), P4 (≤3 at d=1) bounds independently confirmed
holding on every cell above.

**P5**: my raw-rig measurement `5019.592040900939` mm — identical to the digit to the impl's claimed
5019.6. Real-capture pipeline cross-check (condition 9.3 below): **5209.5 mm**, read directly out of
`docs/3d-audit/fill-audit/after/W-36/manifest.A.1-1.jsonl` (`appVersion":"1.3.99"`), against the true
v1.3.98 real-capture baseline **4912.6 mm** read from the pre-existing `docs/3d-audit/fill-audit/manifest.A.*.jsonl`
— **+6.04%**, well under the +15% cap (5649.5). Both pipelines (raw rig +6.3% vs 4722.7; real capture
+6.04% vs 4912.6) tell the same story; the two different absolute "before" numbers are legitimately two
different pipelines (direct `SurfaceFill` call vs full render+HLR+camera capture), not a discrepancy.

**P6**: my byte-identity numbers on `post` — sphere hatch d=50 `24 / 723.437`, cylinder hatch d=220
`145 / 4495.513`, sphere contour d=50 `18 / 656.382` — identical to the digit to the plan's/impl's P6
values, and (separately) identical to the digit between my own `pre` and `post` runs.

## (4) Bars changed — verified exhaustively against the actual file diff

`diff pre/tests/unit/scene3d-curved-density-floor.test.js post/...` shows **exactly** the five changes
disclosed in the commit body and impl report, nothing else:
- `:264` `22→18`, `:265` `10→11`, `:266` `138→114`, `:267` `60→64` — all match.
- The `>=2.0x` spread assertion is REPLACED with a `crossFamilyBCount`-based `>=2.5x` (dial ends 0.25 vs
  2.0) plus a `>=2.0x` (0.25 vs 1.0) sub-check — matches the disclosed replacement exactly, including the
  new helper function added to read raw runs (`crossFamilyBCount`).
- Commit body (`git log -1 e31d8591`) reproduces the `## Bars changed` table verbatim, matching the impl
  report.

**W-26 gap-jump** (`scene3d-ladder-uniform-field-spacing.test.js`): **9/9 green** on `post`, R1a assertions
(`max/min drawn gap <= 1.15`) hold. **W-26b's anti-blob property** (`scene3d-fill-span-verdict.test.js`):
**11/11 green**; I instrumented the coverage guard directly (temporary `console.log` in a scratch copy,
never touching the real assertion) and measured **sphere crosshatch coverage 0.739 at d=220** — comfortably
under the file's own `< 0.85` cap and far below the historic 0.62→**0.91** saturated state that motivated
W-26b (that exact "0.91" figure is a historic scalar from the W-26b review montage, not something the
current guard measures on cylinder directly — the operative descendant guard for cylinder is P5's ink cap,
which holds with 6% headroom as shown above; noted so the number isn't mis-cited as a live cylinder bar).

## (5) Out-of-scope regression — `scene3d-hatch-density-angle-stable.test.js` — per-family ruling

Reproduced exactly: **9/9 pass on `pre`**, **7/9 pass on `post`** — the same two failures the implementer
found (`sphere > crosshatch` gap **3.703°**, `cone > crosshatch` gap **3.816°**, both vs the file's
3° tolerance). Not in W-36's ALLOWED list; not edited by the implementer; confirmed unedited (file is
byte-identical between `pre` and `post` other than the `.fam` not being touched).

Built an independent per-family measurement (`zzz-review-w36-perfamily-bearing.test.js`) using
`SurfaceFill.buildObject`'s raw `.fam`-tagged runs (the same idiom the parity test uses) inside the exact
scene/rig from the failing guard file (ground off, tilted transform, `fillAngle 20`, `crosshatch`,
Density 50→150), on `post`:

| primitive | family | bearing d=50 | bearing d=150 | gap | ink share d=50 | ink share d=150 |
|---|---|---|---|---|---|---|
| sphere | A#0 | 63.047° | 62.079° | **0.967°** | 0.473 | 0.492 |
| sphere | A#1 | 168.711° | 168.715° | **0.004°** | 0.527 | 0.508 |
| cone | A#0 | 84.399° | 83.052° | **1.347°** | 0.486 | 0.515 |
| cone | A#1 | 144.175° | 144.181° | **0.006°** | 0.514 | 0.485 |
| — | combined (both families, ink-weighted) | — | — | sphere **3.703°**, cone **3.816°** | — | — |

My numbers match the implementer's claimed per-family bearings to the digit (63.05→62.08, 168.711→168.715,
84.40→83.05, 144.175→144.181) and the claimed share range (0.47–0.52).

**Ruling: the combined-bearing metric is the flawed instrument, not a moved family.** Every per-family
bearing gap is well under the guard's own 3° tolerance (max 1.347°, cone A#0 — note this is *not* strictly
≤1°, contrary to a loose paraphrase of the implementer's claim; the implementer's own words were "well
under 1.5°", which is accurate and matches what I measured). The guard's docstring (lines 28-34 of that
file) states its actual intent is that "no code path derives a line's direction from spacing/density/
count" — that claim is independently confirmed true per-family. Before W-36, family A held ~91% of the
ink, so the combined ink-weighted average was effectively measuring family A alone (which is stable); W-36
intentionally moves the split toward 50/50 (confirmed: shares in 0.47–0.52 on both primitives at both
densities), and a near-50/50 vector average of two bearings that are themselves far from parallel (sphere:
~106° apart in the doubled-angle sense; cone: ~60° apart) is highly sensitive to a small (2–5%) shift in
the inter-family ink ratio — exactly what produces the combined-metric swing. This is arithmetic, not a
direction-field regression.

**Recommendation** (matches the implementer's, independently arrived at): file W-36b to re-express this
guard's crosshatch sub-tests as two per-family bearing-stability assertions (which is what the docstring
says the file is for), rather than widening the combined tolerance past 3.82°. Do not silently widen; this
needs the orchestrator's sign-off since it's a guard bar change outside this unit's own scope.

## (6) Byte-identity of every non-crosshatch law — md5 sample

Wrote an independent md5 probe (own script, not the implementer's) hashing final rendered path geometry
for `{sphere, cylinder, torus} × {hatch, contour, spiral} × {ladder, mkTick, mkDashRamp}` = 27 cells, run
against both `pre` and `post`. **All 27 hashes are byte-identical.** No source-level leakage outside the
`crosshatch` + `isEvenLadder()` + `toneOn` scope.

## (7) Visual review — every named PNG looked at, native-resolution crops

Read all crops in `docs/3d-audit/fill-audit/after/W-36/crops/` and the Jay's-cell before/after crops.

- **Jay's own cell** (`jays-cell-before-crop.png` / `jays-cell-after-crop.png`): before shows exactly Jay's
  reported defect — one dominant family of tilted arcs, crossing family reduced to a couple of barely-
  visible strokes at one edge. After shows a clean, roughly-square crosshatch grid, both families clearly
  and comparably present. This directly resolves the literal user complaint.
- **cylinder max** / **sphere med** crops: confirmed the implementer's description — regression shows a
  near-solid single-family hatch with a token crossing family; fix shows a genuine crossed grid, no
  blobbing at d=220, cells clearly resolved.
- Compared against the v1.3.98 pre-audit reference (`shots/A/sphere__crosshatch__ladder__med__a.webp`,
  `shots/A/cylinder__crosshatch__ladder__max__a.webp`) in a montage (see condition 9.2 below): the fix's
  cylinder cell is comparably dense to the v1.3.98 reference (total lines 106 vs 108, i.e. no meaningful
  darkness loss); the fix's sphere cell reads **mildly lighter/more open** than the v1.3.98 reference (total
  lines 20 vs 26, −23%). Neither is a blob or a near-single-family read; this is purely a Rank-1-vs-Rank-2
  darkness judgment call, which per the standing ruling belongs to the orchestrator, not this review.

## (8) Merge note vs main / T1b / W-33

`e429cfc5` (main, U0 test chunking) and `1193cbe1` (main, golden-comparison rounding) are **not** ancestors
of `f828d828`. Neither touches `surface-fill.js`, `scene3d-crosshatch-parity.test.js`, or
`scene3d-curved-density-floor.test.js` — `e429cfc5` touches only `scene3d-tone-law-collapse.test.js`;
`1193cbe1` touches `scene3d-charts-parity/-curved-density-sparse-end/-hlr-spatial-index-identity/
-mesh-invariants`. No merge conflict, no oracle impact; `scene3d-curved-density-sparse-end` (the one file
`1193cbe1` and W-36 both care about, per the plan's own §1.4) ran 20/20 green per the impl report. T1b is
already the base (`f828d828`) this review is pinned against. W-33's in-progress edits (`refineFillRunTurns`
etc., visible on the live worktree HEAD) are confirmed **absent** from `e31d8591` — verified by diffing
`git archive e31d8591` against the current live worktree file, which shows exactly the W-33 additions and
nothing else, i.e. `e31d8591` itself is clean of W-33 contamination.

## (9) Secretary's follow-up points

**9.1 — Is the replaced spread bar a weaker restatement?** No. The old bar compared the crosshatch
mapper's **TOTAL** (both families) fill count between `crossDensityRatio` 0.25 and 1.0 — a 4× ratio range,
diluted because family A was constant across the ratio and (pre-W-36) dominated the total. The new bar
measures the **crossing family's own count** (`crossFamilyBCount`, reading `.fam`/`.lineIndex` off the raw
runs) across the **full dial range ends**, 0.25 vs 2.0 (an 8× ratio range) — strictly the control the dial
is documented to own, on the family it actually moves, over more of its range, not fewer digits of it. I
independently re-ran the underlying math: at ratio 0.25, `crossPairShare('b', 0.25) = 0.55/0.25 = 2.2`
(clamped to 1 downstream); at ratio 2.0, `0.55/2 = 0.275` — a real, large, monotonic swing, not something
picked to just clear a low bar. Margins are not razor-thin: measured 3.00 vs bar 2.5 (20% headroom) and
4.69 vs 2.5 (88% headroom) at d=10/d=100 respectively; the `≥2.0` sub-check measured 2.35 (17.5% headroom).
**Confirmed legitimate — this is a stronger, less diluted instrument, not a weaker one.**

**9.2 — Family A halving.** Confirmed numerically (my own independent measurements, condition 3 table):
sphere d=220 A 69→37 (pre-W-36→post), cylinder d=220 A 94→52, both ≈−46%/−45%. But relative to the
**v1.3.98 reference Jay accepts as correct** (not the broken pre-W-36 tree), the drop is smaller: sphere A
(d=50) 15→9 (−40%), cylinder A (d=220) 70→52 (−26%). Built the
requested montage — `docs/3d-audit/fill-audit/after/W-36/review-montage-a-halved.png` — three panels per
primitive (v1.3.98 / pre-W-36 `f828d828` / post-W-36 `e31d8591`), sphere d=50 and cylinder d=220, with A/B
counts annotated from my own independently re-derived numbers on **all three** trees (not just pre/post):

| cell | v1.3.98 | pre-W-36 (f828d828) | post-W-36 (e31d8591) |
|---|---|---|---|
| sphere d=50 (A/B, ratio) | 15/11 (0.73) | 16/3 (0.19) | 9/11 (1.22) |
| cylinder d=220 (A/B, ratio) | 70/38 (0.54) | 94/10 (0.11) | 52/54 (1.04) |
| sphere d=50 total lines | 26 | 19 | 20 |
| cylinder d=220 total lines | 108 | 104 | 106 |

Family A did drop substantially (26–45%) from either reference point, but family B's rise means **total
line count / total ink is close to flat** against v1.3.98 (cylinder −2 lines / +6.0% real-capture ink;
sphere −6 lines / −12.3% ink per the plan's own ink table) — this is the mechanism (one shared, unchanged
budget, redistributed) working as designed, not ink loss. Also measured, per the secretary's ask, the
**per-family hatch (single-family) count for comparison**: sphere hatch d=50 = 24 fills (both v1.3.98 and
post-fix — byte-identical control, condition 6); cylinder hatch d=220 = 119 (v1.3.98) / 145 (post-fix, a
T1b-era change predating and unrelated to W-36). Under Jay's **literal** reading ("same number of lines as
hatch"), each crosshatch family would need ~24 (sphere) / ~145 (cylinder) — Rank 1's actual per-family
counts (9/11 and 52/54) are roughly **half** of that. This is not an oversight: Rank 3 (`CROSS_SHARE_BASE
0.1→1.0`, literally giving each family the FULL hatch-equivalent target) was measured and **rejected** —
cylinder d=220 ink 9136.8mm, +93.5% over v1.3.98, reproducing judge C1's saturation. So the tension is real
and already ruled on: Jay's literal per-family-matches-hatch reading is **not achievable** without either
re-opening the saturation judge C1 fixed, or (per W-31's own mandate) making one family unevenly spaced.
**Plot-safety check on A's new pitch**: `scene3d-plot-safety.test.js` 5/5+1skip on `post`; my own measured
minimum family-A gaps at d=220 (the tightest case) are cylinder 0.600mm, sphere 0.770mm, ellipsoid 0.889mm,
torus 1.029mm — all ≥2× the 0.3mm pen width, comfortably plot-safe.

**9.3 — P5 against the real capture pipeline.** Done above in condition 3: **5209.5mm measured** (read
directly from the fresh manifest JSONL, `appVersion 1.3.99`), true v1.3.98 real-capture baseline **4912.6mm**
(read from the pre-existing manifest, `appVersion 1.3.98`), delta **+6.04%**, cap **5649.5mm** (+15%) —
holds with 7.8% headroom under the cap.

**9.4 — Are mutations 2 and 3 genuinely distinct, or the same code path?** Independently re-derived, in the
scratch `post` copy (reverted after, verified byte-identical to `e31d8591` afterward — see the diff at the
top of this report). At the shipped default `crossDensityRatio = 1`:
- Mutation 2 (`CROSS_PAIR_BUDGET = 2.0`): cylinder d=220 ink **9136.776685750368**mm.
- Mutation 3 (`crossPairShare` hardcoded to return `1`): cylinder d=220 ink **9136.776685750368**mm.
  Identical to 15+ significant figures — but this is **mathematically forced**, not evidence of the same
  code path: at `CROSS_PAIR_BUDGET=2.0`, `half = 1.0`, and at the shipped ratio `r=1`, `half/r = half = 1.0`
  for BOTH roles — exactly what a hardcoded `return 1` also produces at any ratio.
- To confirm they are genuinely different mechanisms, I re-ran both **at `crossDensityRatio = 2`** (off the
  shipped default, where the two mutations' formulas diverge): mutation 2 gives ink **6755.93**mm (the real
  per-ratio division `half/r` correctly reduces family B's share as the ratio widens); mutation 3 gives ink
  **9092.95**mm (the hardcoded override ignores `crossRatio` entirely and stays near-saturated). **These
  diverge sharply** — confirming mutations 2 and 3 are genuinely distinct code paths that only coincide, by
  exact arithmetic, at the one ratio value (1) the P5 guard happens to test. Both are legitimate,
  independent evidence that the P5 anti-saturation guard is catching "either family reading its full
  un-shared target," not one specific magic constant — as claimed.

## Overall verdict

No vacuous-pass guards found, no widened tolerances beyond what's disclosed in `## Bars changed`
(confirmed by direct diff, not just the commit body's claim), no fingerprint re-pins lacking proof, no
single-pipeline/single-zoom evidence (checked raw-rig numbers, the real capture-pipeline manifest, AND
looked at the native-resolution crops), and the out-of-scope guard failure is root-caused correctly and
not silently touched. The two open items are genuinely orchestrator-level calls the implementer correctly
declined to make unilaterally: (a) the `scene3d-hatch-density-angle-stable` guard's design (re-express
per-family — W-36b), and (b) whether Rank 1's redistribution (family A down ~26-45% vs either reference,
family B up correspondingly, total ink roughly flat) reads acceptably against the v1.3.98 picture, or
whether Rank 2 should be taken — sphere reads mildly lighter, cylinder reads comparably dense; see the
montage.

Scratch dirs deleted at the end of this review; nothing was left in any worktree.
