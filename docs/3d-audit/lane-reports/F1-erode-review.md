STATUS: ACCEPT-WITH-FOLLOWUPS

# F1-erode — adversarial reviewer report (lane fill-audit-a3, cross-lane file grant)

**Reviewer:** Sonnet, read-only. Pinned range `7f805654..e2c3ca85` on `.claude/worktrees/fill-audit-a3`.
**Scratch exports** (node_modules symlinked from MAIN, then `git init` + `git fetch <worktree> refs/heads/3d-scene/fill-audit-a3` to satisfy `scene3d-ribbon-flat-field-placement.test.js`'s internal `git show` shell-out):

| export | tree | purpose |
|---|---|---|
| `/private/tmp/claude-501/scratch-F1E-rev/pre` | `7f805654` | pre-fix (T4b, tests-only, immediately before the fix) |
| `/private/tmp/claude-501/scratch-F1E-rev/post` | `e2c3ca85` | the F1-erode commit itself |
| `/private/tmp/claude-501/scratch-F1E-rev/mutant` | `post` with **only** `src/core/geometry-utils.js` reverted to `pre`'s version | explicit condition-8 mutation |

Worktree confirmed clean at review start (`git status --short -- . ':!graphify-out'` empty, only graphify-noise stash entries). No file in the worktree was ever edited, stashed, or reset. By review end the worktree had moved on under another agent (F1-amp, in flight, `6e1ed52f` + uncommitted WIP) — expected per `STILL-OPEN.md`, not touched by me. No probe file was left in the worktree; all scratch/probe files removed from the scratch trees at the end.

**Commit verified exactly as assigned:** `src/core/geometry-utils.js` +13/−0, `tests/unit/scene3d-ribbon-erode-refusal.test.js` +150 (new). Diff of `geometry-utils.js` matches the plan's §4 Rank-1 prototype essentially verbatim (`consumeErr()` before/after each ladder rung, `continue` on a swallowed failure, final `consumeErr()` to avoid leaking).

---

## Condition 1 — RED/GREEN + the two guard files, no re-pin

**New file RED on pre, GREEN on post**, reproduced myself:
- Pre (`7f805654` + the new test file copied in): **4 failed / 12 passed** — `interlockWeave: erodeEmpty=1` (expected 0), `swallowedAndEmpty=1 of 79` (expected 0), `ribbons=39 wide=40` (expected equal), `degenerate=1` (expected 0). Exact match to the impl report's numbers.
- Post (`e2c3ca85`): **16/16 passed.**

**`scene3d-ribbon-f1b-streaks.test.js` and `scene3d-ribbon-wall-coverage.test.js` are BYTE-IDENTICAL across the whole pinned range** (`diff` exit 0, both files) — no re-pin is even possible, let alone hidden. Measured myself:
- `scene3d-ribbon-f1b-streaks.test.js`: pre **36 passed / 8 failed (44)**, post **42 passed / 2 failed (44)**. The 2 post survivors are named, verbatim: `trochoidLoop — lattice sensitivity … reachable @divisor12=76 @divisor24=80: expected 4 <= 1` and `trochoidLoop — no uncovered cluster reads as a lengthwise streak … cluster 34 cells, 0.1912 mm², 1.050 x 0.450 mm`.
- `scene3d-ribbon-wall-coverage.test.js`: pre **35 passed / 1 failed (36)** (`expected 0.9363204944266638 to be >= 0.995` — matches the plan's own pre-derived number to 13 decimal places), post **36/36**.

**VERDICT: ACCEPT.** Numbers match the impl report exactly; the guard files cannot have been re-pinned because they are unmodified bytes.

## Condition 2 — the two trochoidLoop reds, unmoved, un-re-pinned

Independent vitest-based re-derivation (`SurfaceFill — F1-erode` fixture, torus/hatch/trochoidLoop, using the shared `scene3d-ring-coverage.js` helpers, not copying the implementer's numbers):

| quantity | pre (`7f805654`) | post (`e2c3ca85`) |
|---|---|---|
| `ringNotInkMm2` | **2.469375** | **2.469375** |
| uncovered cluster count | **164** | **164** |
| reachable @divisor12 / @divisor24 | 76 / 80 | 76 / 80 |
| whole-object scenePath md5 (kind + 6dp points) | `fac24c1a2b64f7a3d8657cf2ec85bf9e` | `fac24c1a2b64f7a3d8657cf2ec85bf9e` |

**Byte-identical geometry, confirmed by md5, not just by the two named assertions.** Matches the plan's §3c numbers (2.4694, 164) exactly.

**VERDICT: ACCEPT.**

## Condition 3 — mechanism, magnitude, Rank 1 not Rank 2/3

- **erodeEmpty 1→0 and swallowed-failure detection reproduced** on the exact F1 fixture via the new test file itself (condition 1) and via the independent probe under condition 9 below (swallowed-input area **51.7714 mm²**, exact match to the plan's measured value, found only in `pre`; `swallowedInputFound: false` in `post` because the ladder now recovers before returning).
- **Eroded-boundary shift, confirmed algebraically from the shipped source**, not re-typed from the plan: the ladder's `attempts` array at `geometry-utils.js:1298-1305` (unchanged by this fix) has rung 1 = `[inset * 1.0037, 0.29, 0]`. With `inset = penWidth/2 = 0.15` (pen 0.30), `0.15 * 1.0037 − 0.15 = 0.000555` mm exactly — the plan's claimed shift, derivable directly from the pinned numeric literal, not asserted on faith.
- **Mechanism is Rank 1, not Rank 2/3**: confirmed by file location alone — the entire diff is inside `insetMultiPolygon`'s own ladder in `geometry-utils.js`. Rank 2 would have lived in `surface-fill.js`'s `erode()` (untouched — confirmed 0 lines changed there) and Rank 3 would have touched `strokeRingsToBand` at `geometry-utils.js:1034` (untouched — confirmed by reading the diff hunk boundaries, which start at line 1306, after `strokeRingsToBand`'s own definition).

**VERDICT: ACCEPT.**

## Condition 4 — blast-radius sweep, independently re-run in full

I re-ran the **entire combined sweep** myself (hatch × 4 primitives + all 8 mapper Types × torus, 407 unique cells) as three separate vitest files (to fit the 600s ceiling: A = hatch×{torus,sphere,cone,capsule} 148 cells, B = torus×{wireframe,crosshatch,contour,spiral} 148 cells, C = torus×{stipple,contourSlice,none} 111 cells), each run on `pre` and `post`, comparing md5 of every emitted scenePath (kind + 6dp points) plus a length-based ink metric matching `scripts/audit/scene3d-capture.js`'s own `inkMm` formula (sum of polyline length over **every** scenePath regardless of kind — my first attempt wrongly filtered to `sceneFill` only and produced numbers that didn't match the report; fixing the formula produced an **exact digit-for-digit match** to `report.json`'s `inkBefore`/`inkAfter` values).

**14 changed cells total, 0 in sweep C, matching the report's set exactly, no extra cell found:**

Sweep A (7 changed / 148):
```
hatch/capsule/interlockWeave  5395.7481 -> 5710.4902  (+5.833%)
hatch/cone/taperedEnds        3670.3989 -> 3861.4776  (+5.206%)
hatch/sphere/isophoteWidth    6644.5392 -> 6947.2874  (+4.556%)
hatch/sphere/whiteBand        6992.5042 -> 7295.2524  (+4.330%)
hatch/torus/interlockWeave    6105.7213 -> 6325.0175  (+3.592%)
hatch/capsule/ampSpacing      6501.9602 -> 6635.6452  (+2.056%)
hatch/cone/trochoidLoop       5097.4899 -> 5096.9547  (-0.011%)
```
Sweep B (7 changed / 148):
```
crosshatch/torus/interlockWeave  9441.0572 -> 9660.3534  (+2.323%)
crosshatch/torus/weaveDepth      10454.3272 -> 10624.1732 (+1.625%)
contour/torus/weaveDepth         6302.4580 -> 6380.9444  (+1.245%)
contour/torus/onePenDown         6845.8851 -> 6800.4661  (-0.663%)
crosshatch/torus/trochoidLoop    11129.9919 -> 11105.0871 (-0.224%)
contour/torus/trochoidLoop       6521.6252 -> 6525.3959  (+0.058%)
contour/torus/ampSpacing         6546.3891 -> 6548.4611  (+0.032%)
```
Sweep C: **0 changed / 111** (`stipple`, `contourSlice`, `none` on torus, all 37 laws — byte-identical).

Every one of these 14 rows is an **exact digit match** (to 4 decimal places) against `report.json`'s `runtime_md5_sweep` + the plan's §8 table. No undisclosed changed cell was found anywhere in the 407-cell combined sweep.

**One correction to the task's own framing, not a defect in the implementer's work: there are THREE ink-losing cells across the full combined sweep, not two.** `cone/hatch/trochoidLoop` (−0.01%) and `contour/torus/onePenDown` (−0.66%) are the two the plan's original 185-cell sweep found; the implementer's own extension to all 8 mapper Types found a **third**, `crosshatch/torus/trochoidLoop` (−0.22%), which **is present, correctly signed, in `report.json`'s `changed` array** — it is not hidden — but the impl report's prose never explicitly says "three cells lose ink" (it inherits the plan's "two cells lose a trace of ink" framing when discussing the extended sweep). This is a **disclosure-quality gap, not a hidden regression**: the number is in the data, well inside the ±8% bar, and does not change any pass/fail outcome. Filed as a followup below.

**VERDICT: ACCEPT, with the followup above.**

## Condition 5 — no fingerprint moved for isophoteWidth/whiteBand/taperedEnds

Grepped every test file for a numeric literal or `toBe`/`toBeCloseTo` pin on these three law names. Found exactly one candidate: `tests/unit/scene3d-curved-density-sparse-end.test.js:329`, `expect(runMd5(50, 'hatch', 'taperedEnds', defaults.objects[0])).toBe('4863491ddcae36305a5a897f70ce8091')` — but `defaults.objects[0]` is the **sphere** fixture (confirmed from the file's own preceding `test.each` rows), and my own sweep A shows **`hatch/sphere/taperedEnds` is byte-identical pre/post** (only `hatch/cone/taperedEnds` moved). Ran the guard file directly: **20/20 both trees**, file byte-identical across the range (`diff` exit 0) — no re-pin occurred or was needed.

**VERDICT: ACCEPT.**

## Condition 6 — `consumeLastOpError` consumer audit

Grepped `src/` for every call site: `pathfinder-ops.js:269-271` (`recomputeCompound`, explicit clear-before-compute then read-after), `geometry-utils.js` (this fix, clear-before-and-after each rung plus a final leak-guard), `ribbon-geometry.js:296-310` (`runBooleanOp`, clear-before/read-after, the idiom this fix borrows), `shadows.js:3096-3097` (`boolOk()`, reads immediately after each individual `FillBoolean` op inside `overlapLevels`). All four are read-immediately-after-the-relevant-op; `fill-boolean.js`'s `safeOp` never auto-clears on success, so any of these consumers COULD in principle inherit a stale pending error from an unrelated prior failure elsewhere in the same render tick — this was already true before F1-erode and is unchanged by it. Rank 1's own final `consumeErr()` (the "do not leak a pending error to the next caller" line) can only **reduce** that pre-existing stale-error surface for calls that flow through `insetMultiPolygon`, never increase it. Ran `fill-boolean-safe-op.test.js` myself: **6/6 both trees**, identical output including the same log lines.

**VERDICT: ACCEPT.**

## Condition 7 — fill-depth silent-failure path

Confirmed no production counter was added anywhere (`surface-fill.js` diff is empty; the only diff is the two files listed in the commit). The impl report's own instrumentation table (external wrap of `insetMultiPolygon`, no source change) gives pre/post swallowed-and-empty counts per cell and states the production counter is out of scope because `surface-fill.js` is outside this unit's file grant — matches the plan's §5 forbidden list. I independently re-derived the primary case (hatch/torus/interlockWeave: `swallowedAndEmpty` 1→0) via condition 1's own test file, consistent with the report's table.

**VERDICT: ACCEPT.**

## Condition 8 — mutation-prove the three new integer gates (BLOCKING, per orchestrator note)

Built an **explicit mutant**: a full copy of `post`, with **only** `src/core/geometry-utils.js` reverted to `pre`'s byte-identical version (confirmed via `diff`, exit 0, before running) — nothing else in the tree touched. Ran the new test file against it:

**4 failed / 12 passed** — identical to the RED numbers under condition 1 (`erodeEmpty=1`, `swallowedAndEmpty=1 of 79`, `ribbons=39 wide=40`, `degenerate=1`).

Each gate's own trip, and which half of the defect it covers:
- `erodeEmpty === 0` — trips. Gates the **output-side symptom**: whether `ribbonize()` took the "no region → centreline fallback" branch at all.
- `swallowedAndEmpty === 0` — trips (1→0). Gates the **mechanism directly**, upstream of `erodeEmpty`: whether a `FillBoolean` failure was swallowed and left indistinguishable from a genuinely empty erosion at the `insetMultiPolygon` call site itself.
- anti-vacuity (`wide` floor + `ribbons === wide`) — trips (`ribbons=39` vs `wide=40` pre; equal post). Gates against a **false fix**: that "erodeEmpty=0" not be bought by reclassifying the stretch out of `CLS_RIBBON` instead of actually recovering it.
- (bonus, same test file) `degenerate === 0` — trips (1→0), a downstream counter riding the same event.

**None of the three (four) gates measures ribbon WIDTH in mm** — I read the assertions directly: all four compare integer counts (`erodeEmpty`, `swallowedAndEmpty`, `wide`, `ribbons`, `degenerate`), never a physical dimension. Confirmed this is a genuinely open gap: grepped the whole test suite for a width-in-mm assertion on a ribbon stretch and found none, consistent with the plan's own "NO existing guard measures ribbon WIDTH at all" observation and F1-width-bar being filed as separate, unstarted work.

**VERDICT: ACCEPT.** The mutation proof requested by the orchestrator's blocking note is now on the record with an explicit single-file-reverted mutant, not merely inferred from the pre/post comparison.

## Condition 9 — re-derive plan §6's disproof independently

Wrote an independent probe (not copying the plan's or impl's code) using the shared `scene3d-blank-map.js` + `scene3d-ring-coverage.js` helpers already in the repo, wrapping `insetMultiPolygon` to capture the actual swallowed-failure input multipolygon, then testing point-in-polygon against every 0.8mm-threshold blank cell:

| quantity | pre (`7f805654`) | post (`e2c3ca85`) |
|---|---|---|
| deep-blank (>2.0mm) area | **0.0300 mm²** | **0.0000 mm²** |
| largest >0.8mm cluster | **39.8100 mm², 3981 cells** | **28.3900 mm², 2839 cells** |
| swallowed-erosion input polygon area | **51.7714 mm²** (found) | not found (ladder recovers) |
| overlap: blank-at-0.8mm cells inside the erosion input polygon | **0 of 11095** (0%) | n/a (deep-blank now 0) |

All four numbers on `pre` are **exact matches** to the plan's own independently-derived figures (39.81/3981, 51.7714, deep-blank 0.0300) despite being computed by different code than either the plan's or the implementer's probes. My overlap test (0 of 11095, testing the *whole* 0.8mm blank mask rather than isolating to the single largest cluster's own member cells, a simplification I made for time) is directionally identical to the plan's own more precise cluster-scoped figure (2 of 3981 = 0.05%): both conclude **negligible overlap**, confirming direction A of the plan's disproof. The post-fix numbers (0.0000 mm², largest cluster 28.39 mm²) are exact matches to the report's "after" column.

**VERDICT: ACCEPT**, with the caveat noted (overlap re-derived over the whole 0.8mm mask rather than the single isolated cluster, for time — conclusion unaffected).

## Condition 10 — deep-blank ≤0.55mm² on all three subject laws, post

Ran `scene3d-ribbon-flat-field-placement.test.js` on `post` after fixing a scratch-export-only artefact (the file shells out to `git show 8adfd5af:...`; `git init` + `git fetch <worktree> refs/heads/3d-scene/fill-audit-a3` in the scratch dir, exactly as the plan's §10 reproduction recipe describes, resolves it) — **22/22 passed**, including the condition-4 byte-identity block. Independently re-measured the raw deep-blank numbers with my own probe:

| law | pre | post | bar |
|---|---|---|---|
| interlockWeave | 0.0300 | 0.0000 | ≤0.55 ✓ |
| onePenDown | 0.0000 | 0.0000 | ≤0.55 ✓ |
| trochoidLoop | 0.0000 | 0.0000 | ≤0.55 ✓ |

Exact match to the impl report's table.

**VERDICT: ACCEPT.**

## Condition 11 — pictures

**interlockWeave stretch, before/after (existing evidence, `after/F1-erode/interlockWeave-stretch-crop-{before,after}.png`), viewed with the Read tool:** confirmed the description. BEFORE shows one thin, single-width zigzag line (bare centreline) crossing upper-middle-right of the crop, visibly starved of ink next to every neighbouring bold, solid-filled zigzag ribbon in the same band. AFTER shows that exact stretch filled bold and solid, matching its neighbours, the bare line gone.

**Independently regenerated, not just re-viewed.** Built my own Playwright-rendered SVG crop from the identical fixture (`engine.addLayer('scene3d')`, torus, hatch, interlockWeave, same 30px/mm, same bbox) directly from scenePaths at pre and post — no dependence on the implementer's own render code. My `lastRibbonStats` printout matched the report's before/after stats **exactly** (`erodeEmpty=1 degenerate=1 wide=40 ribbons=39` pre; `erodeEmpty=0 degenerate=0 wide=40 ribbons=40` post), and a pixel diff between my own two crude polygon-fill renders shows a real, non-trivial difference in the same document-space region (diff bbox spans most of the crop, consistent with the erosion recovery changing neighbouring geometry too, matching condition 2's disclosed "condition 2's cluster falls as a side effect"). This rules out the evidence being fabricated or copy-pasted.

**A second cell, `sphere/hatch/isophoteWidth`** (one of the "fill-depth swallowed failure" cells that gains ink but has no gallery crop of its own): rendered the whole object pre/post from scenePaths and diffed. **Only 13 pixels differ** in a 2x-zoomed 379×312 region (max channel delta 57/255) — **the change is NOT visually perceptible at normal viewing resolution.** This is consistent with the mechanism (a `+4.6%` ink recovery at the *fill* depth, spread as a thin sliver, not a whole-ribbon centreline-vs-fill flip like the primary interlockWeave case) and explains why the report correctly does not claim visual evidence for this class of cell — only the numeric md5/ink proof.

**VERDICT: ACCEPT.**

---

## Summary verdict

**ACCEPT-WITH-FOLLOWUPS.** Every one of the eleven conditions reproduced independently, almost all to an exact digit match against the implementer's own numbers, using probes I wrote myself rather than the implementer's or planner's scripts. No widened tolerance, no hidden re-pin (two of the three "must not move" guard files are provably byte-identical across the whole range), no vacuous gate (all four new assertions in the erode-refusal test mutation-trip on an explicit single-file revert), and the two forbidden-to-touch `trochoidLoop` reds are confirmed byte-identical geometry, not merely unchanged assertion text.

**Followups (do not block merge, but should be logged):**
1. **The impl report's prose undercounts ink-losing cells as "two" when its own extended (8-mapper) sweep data contains a third** (`crosshatch/torus/trochoidLoop`, −0.22%, correctly present and correctly signed in `report.json`'s `changed` array). Amend the narrative in `F1-erode-impl.md` / any ledger citation to say three, so a future reader doesn't treat "two" as the settled fact when the raw data already says three. No bar is affected (−0.22% is far inside ±8%).
2. **No test anywhere gates ribbon WIDTH in mm** — confirmed independently, matches the plan's own observation. F1-width-bar remains unfiled/unscheduled; this unit correctly does not attempt it.

## Bars changed

None, confirmed independently: both standing guard files (`scene3d-ribbon-f1b-streaks.test.js`, `scene3d-ribbon-wall-coverage.test.js`) are byte-identical across the pinned range, and the new file's three (four) gates are all on quantities with no prior bar.

## Cleanup

All reviewer probe files removed from `/private/tmp/claude-501/scratch-F1E-rev/{pre,post,mutant}/tests/unit/_reviewer*`. No probe file was ever created in the worktree. Scratch export directories left in place per protocol (not the worktree).
