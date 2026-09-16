STATUS: DONE/FU

# F1-amp — implementer report (lane fill-audit-a3)

**Worktree:** `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3`
**Branch:** `3d-scene/fill-audit-a3`
**Base sha:** `6e1ed52f` (T4c, this unit's own base — F1-erode landed at `e2c3ca85`, T4b/T4c are TESTS-ONLY commits on top)
**Port:** 8475 (dev server confirmed serving `APP_VERSION` `1.4.1`, matching `package.json`)

This unit backports Round 6's amplitude floor to the four pre-Round-6 flat-coverage wave laws
(`interlockWeave`, `trochoidLoop`, `amplitudeOnly`, `onePenDown` — `RIBBON_LAWS` ∩ `isWaveLaw()` ∩
`!isWv6()`, `surface-fill.js:75`/`:4076`, the same four F1-placement's `wvPlaceCov` fallthrough
scopes to). Before this fix, `wvAmpAsk(I)` returned exactly `k * <const>` with `k = wvRamp(I) = 0`
for every `I >= WV_I0` (0.62) — a perfectly straight, unwavering ruling across the entire lit half
of the object, however evenly F1-placement spaces it. Round 6's own header already calls this "the
defect Jay named, not a feature" for the WV6 laws it fixed; this unit ships the same mechanism for
the four that predate it.

## Files touched

- `src/core/scene3d/surface-fill.js` — `wvAmpAsk`/`wvRamp` region only (+71/-3 lines): two new floor
  constants, the five-line branch rewrite, and a small `waveStat` instrumentation addition (new
  `hi*` counters + `wave.hiAmpMean`/`hiShareMean`/`hiElongMean` reporting fields). `git diff --stat`
  confirms exactly this one file.
- `tests/unit/scene3d-ribbon-f1-amp.test.js` — new, 47 tests.

No other file in the worktree was touched. `git status --short -- . ':!graphify-out'` shows exactly
these two files.

## The RED oracle — re-derived on `6e1ed52f`, not carried from any earlier plan

**Orchestrator's addition (3): the oracle cannot be deep-blank (already 0.00mm² post-F1-erode) — it
must bar the highlight region's own quantity at `I >= WV_I0`.** `waveStat` already had a `lit*`
group gated at a looser `I >= 0.55` (never asserted by any existing test) but nothing gated at
exactly `WV_I0`. I added three new counters (`hiSamples`, `hiAmpSum`, `hiDrawnSum`, `hiElongSum`)
beside them, gated at `I >= WV_I0` exactly, reported as:

- `hiAmpMean` — mean amplitude in millimetres
- `hiShareMean` — that amplitude as a **share of the drawn pitch** (the exact unit `wvAmpAsk`
  returns and WV6's `aFlo` is stated in)
- `hiElongMean` — mean **elongation**, i.e. ink-per-unit-arc, per the file's own Round 5 header
  ("the pen genuinely travels farther; this is an addition, not a redistribution")

These live inside `lastFloorStats.wave`, which the file only populates in `TONE_UNCAPPED` mode (a
permanent, never-shipped, ~10x-slower debug flag). Flipping `TONE_UNCAPPED` itself to measure this
was tried first and is genuinely too slow for a test budget (a single 8-law probe exceeded the
Bash tool's 600s ceiling twice). Instead the test file borrows
`scene3d-tone-quant-flow-live.test.js`'s own technique (patch the loaded module source string, never
the committed file) but narrower: it flips only the ONE ternary that gates the diagnostic object's
**assignment** (`lastFloorStats = TONE_UNCAPPED ? { … } : null;` → `= true ? { … }`), leaving every
other read of `TONE_UNCAPPED` untouched — the render stays at committed CAPPED speed (measured:
47 tests including two full torus builds per law, ~45s total) and only the harmless, already-computed
diagnostic object gets exposed.

**Mutation-kill / anti-vacuity.** Rather than diff against a historical sha (`6e1ed52f` predates the
`hi*` counters themselves and cannot report `wave.hiShareMean` at all — confirmed the hard way: my
first draft tried exactly this and every "pre-fix" assertion errored with `undefined`, not a clean
RED), the test file loads two runtimes from the **same** current-tree source: the shipped fix, and a
text-patched **wiring-revert** mutation that restores `wvAmpAsk`'s five new lines to their literal
pre-fix text (`return k * <const>;`), with the `hi*` instrumentation left fully intact in both. This
is a real mutation kill on the one mechanism this unit ships, measured within one vitest run:

| law | pre-fix `hiShareMean` | post-fix `hiShareMean` | pre-fix `hiElongMean` | post-fix `hiElongMean` |
|---|---|---|---|---|
| interlockWeave | 0 | **0.123** | 1.0 | **1.233** |
| trochoidLoop | 0 | **0.124** | 1.0 | **1.42** |
| amplitudeOnly | 0 | **0.123** | 1.0 | **1.08** |
| onePenDown | 0 | **0.124** | 1.0 | **1.233** |

All four RED assertions (`hiShareMean < 0.02`, `hiElongMean < 1.01`) fail-then-pass exactly as
required; `git diff` before staging confirms only the two intended files changed (i.e. the mutation
edit was never accidentally left in the committed source).

## The fix, and the cliff it nearly shipped with

Two floor constants:

- `WV_AFLOOR_SHARE = 0.14` — `interlockWeave`, `amplitudeOnly`, `onePenDown`. Mirrors WV6's
  `weaveDepth`, the most conservative `aFlo` Round 6 shipped, chosen to minimise ink risk.
- `WV_TROCH_AFLOOR_SHARE = 0.04` — `trochoidLoop` only, and **not a stylistic choice**: measured.

**What happened first.** I shipped all four laws at `0.14` and re-ran
`scene3d-ribbon-flat-field-placement.test.js` — a named must-stay-green guard. It went from 22/22 to
**20/22**: `trochoidLoop`'s own PRIMARY deep-blank oracle regressed from `0.00mm²` (F1-erode's own
landed number) to **`3.97mm²`** (bar `0.55mm²`), and its largest-cluster bar failed too
(`45.54mm²` vs `45mm²`). This is a real regression of F1-placement's primary gating oracle, not a
cosmetic one, and it was caught by re-running the named guard **before** evidence capture, not after.

**Root cause and the sweep.** `trochoidLoop`'s displacement (`wvForm`'s trochoidLoop branch moves
BOTH along and across the ruling — a genuine rolling-circle motion, not a lateral-only sine like the
other three) is far more disruptive to ribbon placement/erosion per unit of amplitude share. A binary
search on `WV_TROCH_AFLOOR_SHARE` using the flat-field-placement guard's own blank-map helpers found
a **cliff**, not a slope:

| share | deepBlank (mm²) | largest cluster (mm²) |
|---|---|---|
| 0 (no floor) | 0.00 | 14.03 |
| 0.02 | 0.00 | 14.11 |
| 0.04 | 0.00 | 14.36 |
| **0.045** | **0.00** | **14.55** |
| **0.05** | **5.23** | **43.66** |
| 0.055 | 5.09 | 43.72 |
| 0.06 | 5.02 | 43.64 |
| 0.08 | 4.72 | 45.74 |
| 0.10 | 4.50 | 45.88 |
| 0.14 | 3.97 | 45.54 |

Safe up to `0.045`, unsafe at `0.05` — a hard threshold, not a gradual degradation, so no
interpolated "safe-ish" value between the uniform `0.14` and this one exists; there is a genuine gap.
Shipped `0.04` for a working margin below the measured cliff. Re-ran
`scene3d-ribbon-flat-field-placement.test.js` at `0.04`: **22/22, clean.**

**I additionally added the same deep-blank/largest-cluster oracle as a permanent guard inside this
unit's own new test file** (own copy of the F1-placement bars, `0.55mm²`/`45mm²`), and
mutation-proved it non-vacuous: temporarily bumping `WV_TROCH_AFLOOR_SHARE` back to `0.14` in the
source reliably fails both new assertions (`deepBlank=3.97…`, `largest cluster …45.54…`); reverted
immediately after (`git status`/`git diff` confirmed clean before proceeding).

## `## Bars changed`

**None in any pre-existing test file.** `scene3d-ribbon-flat-field-placement.test.js`'s own bars
(`0.55mm²`, `45mm²`) were read, never edited, and used only to gate an internal design decision
(the trochoidLoop floor value) before this unit's own test file and commit existed. The two floor
constants inside this unit's own new file (`WV_AFLOOR_SHARE`, `WV_TROCH_AFLOOR_SHARE`) are disclosed
here in full, including the mid-session tuning history above, rather than presented as if `0.04` were
always the plan.

## Orchestrator's five additions — addressed in full

**(1) Ribbon weight/width, and decision 10.** Whole-object ink (torus/hatch/density 50):

| law | before (mm) | after (mm) | Δ | sceneFill-only Δ |
|---|---|---|---|---|
| interlockWeave | 6325.02 | 6166.94 | **−2.50%** | −3.23% |
| trochoidLoop | 6645.83 | 6581.01 | **−0.98%** | −1.24% |
| amplitudeOnly | 3828.29 | 3886.47 | **+1.52%** | +2.42% |
| onePenDown | 6326.84 | 6063.70 | **−4.16%** | −5.37% |

`sceneEdge` (the silhouette itself) is byte-identical across every law (1427.669mm exactly) — a
sanity check that the deltas above are entirely inside the fill geometry, as expected. **This is
NOT ink-neutral and does not uniformly increase ink**: three of four laws lose fill ink;
`onePenDown` — already flagged by `F1-erode-plan.md` §7 as reading visibly thinner after
F1-placement — loses the *most* under F1-amp (−5.37% fill ink). **This does not foreclose decision
10 in either direction**, but it is directionally relevant: F1-amp makes `onePenDown` (and
`interlockWeave`/`trochoidLoop`) read *lighter*, not bolder. If Jay answers decision 10 with "restore
the pre-fix boldness (style B)", the lever remains the weight field, exactly as F1-erode-plan §7
already concluded — this unit's amplitude floor is not that lever. Mechanism: amplitude adds arc
length (elongation, measured: `hiElongMean` up to 1.42), which by itself would add ink, but the
downstream erosion/self-occlusion/off-surface-rejection pipeline removes more than that adds for 3
of 4 laws at this density — a real, measured, non-obvious net effect, not "more waviness = more
ink."

**(2) F1-trochoid re-measurement.** Re-ran the exact numbers STILL-OPEN.md's F1-trochoid bullet
(LEDGER row 2c) files, on this unit's final tree:

| quantity | filed | re-measured this tree |
|---|---|---|
| `ringNotInkMm2` | 2.4694 | 2.6606 |
| uncovered clusters | 164 | 171 |
| reachable @divisor12 | 76 | 69 |
| reachable @divisor24 | 80 | 69 |
| reachable delta | 4 (fails ≤1 bar) | **0** |
| worst cluster | 34 cells, 0.1912mm², 1.050×0.450mm | 37 cells, 0.2081mm², 0.750×0.375mm |

**Both of F1-trochoid's own named reds in `scene3d-ribbon-f1b-streaks.test.js` are now GREEN** —
the file runs **44/44**, better than the ruled `42/44` baseline (lattice-sensitivity delta collapsed
from 4 to 0; the worst cluster's length dropped from 1.050mm — over the 1.0mm streak-length bar — to
0.750mm, under it). **This is a real, disclosed, mechanism-driven side effect of floor-ing
`trochoidLoop`'s own amplitude (mandatory under this unit's own scope), not scope creep and not a
"changed-but-still-red" stop condition** (nothing that was previously red is still red for a changed
reason; nothing previously green went red). **STILL-OPEN.md's F1-trochoid bullet (LEDGER row 2c) is
now stale and should be refreshed or the unit reconsidered/closed by whoever picks it up next** — I
do not close it unilaterally from inside F1-amp, since I only have this one fixture's numbers, not a
full re-audit of F1-trochoid's own scope.

**(3) The highlight-region oracle, RED on `6e1ed52f`, mutation-proved.** Covered in full above (`hi*`
counters, wiring-revert mutation kill). This is the section the brief called "blocking" and it is the
core of this unit's own new test file (16 of 47 tests).

**(4) Every stop-condition number re-derived on `6e1ed52f`, not from the F1-placement/F1-erode
plans.** ±8% ink: measured directly above (range −4.16% … +1.52%, inside the bound).
`ringFillRate >= 0.995`: reconfirmed via `scene3d-ribbon-wall-coverage.test.js` (36/36) and
`scene3d-ribbon-f1b-streaks.test.js` (44/44), both including all four subject laws.
`wide` must not fall / `degenerate === 0` / `erodeEmpty === 0` (interlockWeave): asserted directly
inside this unit's own new test file's "Guards" describe block, all passing.

**(5) Capture rig named; both rigs shot.** `--rig addLayer` exists in MAIN (`scripts/audit/scene3d-capture.js`,
committed `6ffaf9c6`) — both the default `create` rig and `addLayer` were shot for all 12 named cells
(`torus__hatch__{interlockWeave,onePenDown,trochoidLoop,amplitudeOnly,ampSpacing,weaveDepth}__{med,max}__a`).
**Unlike F1-erode** (whose defect the `create` rig could not reach at all — every cell came back
byte-identical), **F1-amp's effect IS visible under the `create` rig**: all 8 subject-law cells are
byte-**different** from the top-level gallery baseline. The `addLayer` rig has no prior baseline in
the top-level gallery for these specific cells (first use here) — its manifest numbers (pathCount,
`wide`, `inkMm`) are recorded in `report.json` and are internally consistent with this unit's own
test file, which uses the identical `engine.addLayer('scene3d')` construction.

## Evidence — cells, byte-identity, and what I saw

12 cells × 2 rigs = 24 shots, `docs/3d-audit/fill-audit/after/F1-amp/`. `report.json` carries the
full `identical_exceptions` list with reasoning. Summary:

- `ampSpacing` (med, max) and `weaveDepth` (max only) — byte-identical (md5) to the top-level
  baseline under the `create` rig. Correct-scoping proof (WV6 laws, `wvAmpAsk`'s `c6` branch
  short-circuits before this unit's edits).
- `weaveDepth__med__a` — **not** byte-identical to the top-level baseline, but this drift is
  **inherited from F1-erode, not caused by F1-amp**. Proof: F1-erode's own capture
  (`after/F1-erode/manifest.B.1-1.jsonl`, captured at `e2c3ca85`, before any F1-amp change existed)
  already shows `pathCount=302, inkMm=2275.6` for this exact cell — identical to this unit's own
  capture. F1-placement's own capture (`cd541f87`, before F1-erode) shows the older `301/2253.8`
  that the top-level `shots/B/` baseline still holds — that baseline was simply never refreshed
  after F1-erode landed. `T4b`/`T4c` (the two commits between F1-erode and this unit's base) are
  both TESTS-ONLY with zero `src/` changes (`git show --stat` confirmed). This unit's own in-process
  fingerprint check (using the SAME `6e1ed52f`-derived source with only `wvAmpAsk`'s wiring
  reverted) independently confirms `ampSpacing`/`weaveDepth` are 100% byte-identical under **this
  unit's specific diff** — the gallery drift is a separate, pre-existing, harmless discrepancy in
  the checked-in baseline image.
- `interlockWeave`, `trochoidLoop`, `amplitudeOnly`, `onePenDown` (med + max) — all 8 byte-different,
  as expected (the mandated fix).

**LOOKED at all four subject laws, native torus/hatch/med cells, 4x-zoomed crop of the ring's
upper-right turning point** (the region nearest the highlight for the default 3/4 camera):

- **interlockWeave — clear, dramatic, unambiguous.** Before: the far-right tip of the ring is a
  smooth, nearly featureless white wedge — no zigzag teeth at all, exactly the "plain ruling in the
  highlight" defect. After: that same tip now shows genuine small jagged notches along its edge —
  the weave no longer straightens there. This is the clearest visual confirmation across all four
  laws, and matches the largest nominal floor (`0.14`) among the four.
- **trochoidLoop — subtle, as expected from its much smaller floor.** Before/after show the same
  general jagged texture at the ring's tip with small tooth-position shifts, not a smooth-to-jagged
  transition like interlockWeave. Consistent with `WV_TROCH_AFLOOR_SHARE = 0.04` being roughly a
  third of the others' `0.14` — the fix is real (numerically proven) but visually modest by design,
  since this is the law with the cliff.
- **onePenDown — not visually obvious at this specific crop**, despite a real, measured ink change
  (largest of the four, −4.16%/−5.37%) and the same `hiShareMean`/`hiElongMean` movement as
  interlockWeave. I looked at the same upper-right-tip crop used for the other three and could not
  confidently point to a difference by eye there — I am disclosing this rather than asserting a
  visual confirmation I do not have. The numeric proof (RED/GREEN oracle, mutation kill, ink
  measurement) stands on its own; the visual effect for this specific law may be concentrated
  elsewhere on the object, or simply less legible against `onePenDown`'s already-busy zigzag
  texture at this zoom.
- **amplitudeOnly — not cropped/looked at separately** this session (budget); its numeric proof
  (RED/GREEN, ink +1.52%/+2.42%, `wide=0` both trees so the CLS_RIBBON-teeth visual story does not
  apply to it the way it does to the other three — its lines are thin centrelines, not wide ribbons).

## Guards — every one run individually, foreground, `timeout: 600000`

Full list and counts in `report.json`'s `guards_run`. Highlights: the two lane-defining guards —
`scene3d-ribbon-f1b-streaks.test.js` **44/44** (better than the ruled 42/44) and
`scene3d-ribbon-wall-coverage.test.js` **36/36** (unmoved) — plus F1-erode's own oracle
(`scene3d-ribbon-erode-refusal.test.js` **16/16**) and F1-placement's own oracle
(`scene3d-ribbon-flat-field-placement.test.js` **22/22**, re-run AFTER the trochoidLoop floor
correction). 30 named guard files total, all green, all non-vacuous (real numeric assertions read
from actual test output). One benign, documented, pre-existing `[vitest-worker] onTaskUpdate` RPC
timeout (exit 0) observed on two runs, and `[FillBoolean] polygon union failed on degenerate
geometry` stderr warnings on several runs — the same two coordinates F1-erode's own retry ladder
already recovers (confirmed `degenerate === 0`, `erodeEmpty === 0` on every run that logs it).

## Live app verification

Dev server confirmed serving the worktree at `http://localhost:8475/`, `APP_VERSION` `1.4.1` matching
`package.json`. Both gallery capture rigs (`create` and `addLayer`) render the fix through the real
Playwright/browser pipeline against this same server — this is a direct render of the shipped fix in
the running app, not a synthetic unit-test mock.

## Recommendation

Ship. All named guards green (two of them *better* than their ruled baseline), the highlight oracle
is RED-derived and mutation-proven, ink stays inside ±8% for all four laws, and the one serious risk
found mid-session (trochoidLoop's cliff) was caught by the guard suite itself before evidence capture
and fixed with a measured, disclosed, per-law floor. **Status DONE/FU, never "F1 CLOSED"**: Jay has
not looked at these pictures, `onePenDown`'s visual effect at this crop is unconfirmed by eye, and
F1-trochoid's own filed numbers (a separate, unscheduled unit) are now stale and need the
secretary's attention.
