STATUS: ACCEPT-WITH-FOLLOWUPS

# F1-width-bar — adversarial review

Lane: fill-audit-a3. Worktree (read-only): `.claude/worktrees/fill-audit-a3`. Pinned range: `179d9218..42acff7b`
(one commit, `42acff7b`). Reviewer never edited/stashed/checked-out/reset the worktree — only `git status`,
`git diff --stat`, `git log`, `git archive` (to scratch), and `node`/`vitest` runs that either read files or
used `loadVecturaRuntime`'s `scriptOverrides` (in-memory content swaps, never disk writes).

**Note on worktree state:** mid-review, the worktree accumulated live, uncommitted T2-3 WIP
(`src/core/scene3d/surface-fill.js` +200/-12, new `tests/helpers/scene3d-mktick-wedge.js`) — expected per the
task brief ("a T2-3 implementer is working there"). Not touched. All of my own reproduction numbers below
match the impl report's numbers to the exact digit on multiple independent laws/metrics, which is strong
evidence my measurements were taken against the clean `42acff7b` tree, before or unaffected by that WIP (a
200-line change landing mid-fixture would not plausibly leave six independent exact-digit matches intact).

## Condition 1 — Tests-only — ACCEPT

`git diff --stat 179d9218 42acff7b`:
```
scripts/audit/scene3d-ribbon-width.js       | 118 +++++++++++
tests/helpers/scene3d-ribbon-width.js       | 160 +++++++++++++++
tests/unit/scene3d-ribbon-width-bar.test.js | 306 ++++++++++++++++++++++++++++
3 files changed, 584 insertions(+)
```
Exactly three files, all new, none under `src/`. The third file (unnamed in my brief) is
`scripts/audit/scene3d-ribbon-width.js`, the canonical CLI script. **Confirmed as claimed.**

## Condition 2 — The canonical quantity, and agreement with F1-amp-review / F1-erode-plan — ACCEPT-WITH-FOLLOWUPS

**What it measures, read from `tests/helpers/scene3d-ribbon-width.js`:** `RibbonGeometry.buildRibbonMultiPolygon`
is wrapped for one `computeAllDisplayGeometry()` call; each call records centreline arc length and the mean of
its `half[]` array. Calls are split into CLS_RIBBON vs CLS_WALLS by `minHalfWidth` (`penWidth/2` vs
`penWidth*0.05`, verified >3x apart at pen 0.3 → 0.15 vs 0.015). Only CLS_RIBBON calls count.
`meanRibbonWidthMm` = arc-length-weighted mean of `2*halfMean` over CLS_RIBBON calls only. This is exactly
F1-erode-plan.md §7's own method ("ribbon width, length-weighted mean"), reproduced, not reinvented.

**Independently re-measured, own runs (addLayer rig, torus/hatch/d=50, camera 'a'), values I computed myself
by running `scripts/audit/scene3d-ribbon-width.js` in the worktree, no edits:**

| law | pre `6e1ed52f` (mine) | report | post current tree (mine) | report |
|---|---|---|---|---|
| interlockWeave width mm | 1.1381 | 1.1381 | 0.9832 | 0.9832 |
| interlockWeave ink mm | 6325.018 | 6325.018 | 6166.940 | 6166.940 |
| trochoidLoop width mm | 0.9739 | 0.9739 | 0.9377 | 0.9377 |
| trochoidLoop ink mm | 6645.828 | 6645.828 | **6572.712** | 6572.712 |
| onePenDown width mm | 1.0089 | 1.0089 | 0.8801 | 0.8801 |
| onePenDown ink mm | 6326.838 | 6326.838 | 6063.705 | 6063.705 |
| amplitudeOnly ink mm | 3828.291 | 3828.291 | 3886.469 | 3886.469 |

**Every one of these matches the report to the last printed digit.** JOB 2's width table is verified, not
merely trusted.

**A real flaw in the report's causal reasoning, found by direct measurement (not blocking, but should be
corrected).** The report attributes the small gap between F1-erode-plan.md §7's own `onePenDown` reading
(0.9860mm at `cd541f87`) and this unit's own pre-F1-amp reading (1.0089mm at `6e1ed52f`) partly to *"F1-erode's
own fix landed between those two measurements"* before immediately citing byte-identity and settling on
"measurement-method noise." I checked this directly rather than accepting the hedge: `git diff --stat cd541f87
7f805654 -- src/core/scene3d/surface-fill.js` and `git diff --stat e2c3ca85 6e1ed52f -- <same file>` are BOTH
empty (the erode fix, `e2c3ca85`, is bracketed on both sides by commits that don't touch the file again until
F1-amp). I then ran the canonical script with `--sha 7f805654` (immediately pre-erode-fix, byte-identical
source to `cd541f87`) for `onePenDown`: **1.0089mm — identical to the post-erode-fix `6e1ed52f` reading, not
to F1-erode-plan's `0.9860mm`.** This proves the gap exists **before** the erode fix ever runs, on
byte-identical source to what F1-erode-plan measured — so "F1-erode's fix landed between" is not merely
imprecise, it's the wrong candidate entirely. The actual cause is a pure methodology difference between
F1-erode-plan's own ad hoc probe script and this unit's canonical script, confirmed directly rather than by
elimination. The report's bottom-line conclusion ("measurement-method noise... not chased further") is
right; the reasoning offered on the way there is not. Does not affect the floor's own correctness (the floor
is set entirely from this unit's own canonical-script readings on the current tree, not from the disputed
F1-erode-plan number).

**A second, previously undisclosed finding: the evidence screenshots don't share the canonical fixture.**
`scripts/audit/scene3d-capture.js`'s object-rig construction (both `create` and `--rig addLayer` branches,
read at `:263-268`) explicitly sets `style.params.fillAngle = 45`. `tests/helpers/scene3d-ribbon-width.js`'s
`measureRibbonWidth` never sets `fillAngle` at all. Comparing this unit's own two manifests
(`after/F1-width-bar/manifest.B.1-1.jsonl` vs `.addlayer.jsonl`) to the canonical script's own `totalInkMm` for
the identical law/mapper/density confirms the two disagree substantially (e.g. `interlockWeave` addLayer-rig
capture `inkMm: 3897.9` vs the canonical script's `totalInkMm: 6166.940` for the same nominal fixture — a
~37% gap density alone doesn't explain, since both use `med`=50 per `scene3d-capture.js:148`). The evidence
images in `after/F1-width-bar/` that back the "what I saw" writeup are shot at a **different fillAngle** than
the numbers the report measured and floored. This doesn't affect the floor's correctness (self-consistent,
never touches `scene3d-capture.js`), but the decision-10 evidence packet's pictures and its numbers are not
the same fixture, and the report doesn't say so.

## Condition 3 — The discrepancy job — ACCEPT

Reproduced the canonical script's construction against the actual committed `3bc61c32` content myself
(current worktree tree, confirmed byte-identical to `3bc61c32` via `git diff 3bc61c32 179d9218 --
src/core/scene3d/surface-fill.js` = 0 lines, reproduced independently). My own run of
`scripts/audit/scene3d-ribbon-width.js` with no `--sha` override (worktree already at that byte-identical
content) gives `trochoidLoop: 6572.712mm` — **matching the reviewer's original `−1.10%` figure exactly, not
the implementer's `6581.01`/`−0.98%`.** The elimination argument holds on my own numbers too: `interlockWeave`
(6166.940), `amplitudeOnly` (3886.469) and `onePenDown` (6063.705) all match **both** prior reports' post-fix
figures exactly — a rig/fixture/density difference would have moved all four, not one. This is not a
hand-wave: I ran the script myself, in the worktree, and got the reviewer's number. **Confirmed.**

## Condition 4 — The floors, drift envelope, gate direction — ACCEPT-WITH-FOLLOWUPS

Floor arithmetic re-derived and correct: `interlockWeave` 0.9784×0.85=0.83164≈0.8316 ✓;
`trochoidLoop` 0.8270×0.85=0.70295≈0.7030 ✓; `onePenDown` 0.8801×0.80=0.70408≈0.7041 ✓ — all three match the
report and the source constants exactly.

None of the three measured post-fix widths (0.9832, 0.9377, 0.8801) is within platform-drift range of its own
floor: the floors sit 15-20% below the measured value by construction (0.85x/0.80x margins), and
`trochoidLoop`'s own measured worst-case cross-camera spread is −11.8%, comfortably inside its 15% margin. Not
a coin bar on the data available.

**Confirmed it gates the FLOOR (lower half) only, no ceiling.** Read the test file directly: the "GREEN" and
"NEGATIVE CONTROL" blocks both assert `toBeGreaterThanOrEqual(WIDTH_FLOOR_MM[law])`; the mutation-kill block
asserts `toBeLessThan(WIDTH_FLOOR_MM[law])` only on the deliberately-thinned runtime. No test anywhere asserts
an upper bound on width. The file's own header states this explicitly ("gating the LOWER half only... says
nothing about a ribbon going wider"). **Verified true, and verified stated.**

**Follow-up, not reproduced by me:** `onePenDown`'s camera-'b' width. I attempted this myself (a
`measureRibbonWidth(V, { law: 'onePenDown', cameraAngle: 'b' })` probe, own scratch script, never committed or
left behind) under the SAME shared machine the implementer used — load average climbed from 2.5 to 5.0 over
the course of my own attempt and the probe never returned inside a reasonable window before I killed it. This
is not a rubber-stamp of the report's excuse — it is an independent data point that the claimed obstacle
(genuine shared-machine contention) is real, observed directly, not merely asserted. The 0.80x margin for
`onePenDown` (vs 0.85x for the other two) remains unverified against a real cross-camera number; it is a
reasoned, conservative stand-in, not a measured one, and that gap is still open.

## Condition 5 — Mutation proof (BLOCKING) — ACCEPT

Ran the full test file myself, foreground, in the worktree: **`tests/unit/scene3d-ribbon-width-bar.test.js` —
10/10, 33.01s** (well under any timeout). This includes the file's own 3 GREEN + 3 mutation-kill (POSITIVE) +
3 negative-control + 1 `amplitudeOnly`-control tests, all passing — i.e. the mutation-kill proof is not merely
described, it executes and passes as claimed.

Verified both needles are exact, single-occurrence matches against the live source (`grep -n` in the
worktree): `hw.push(Math.max(half[i], HALF_MIN));` at `surface-fill.js:7203` (exactly 1 hit) and all five lines
of `WIRING_NEEDLE` at `surface-fill.js:4117-4121` (exact text match, one occurrence). `patchOne()`'s own
`count !== 1` guard would throw on drift, so this isn't just my grep — the test would fail loudly on a source
change that broke the needle.

**Positive direction (thinning trips the floor):** confirmed by the passing "RED / MUTATION-KILL (POSITIVE)"
block — asserts `ribbonStretchCount` unchanged from shipped (no survivor-bias) AND mutated width below floor,
for all three gated laws.

**Negative direction (an unrelated mechanism change does not trip it):** confirmed by the passing "NEGATIVE
CONTROL" block using F1-amp's own amplitude-floor wiring-revert, reproduced as an in-file literal (no
cross-file `require`) — genuinely a different mechanism (amplitude, not width), and F1-erode-plan.md §7
already established width comes from the weight field, not amplitude.

**My own additional mutation, on a law OTHER than the three gated ones (coordinator's ask):** I mutated
`W_WALLS_PEN = 2.0` down to `0.3` (`surface-fill.js:7048`, the CLS_WALLS/CLS_RIBBON class boundary) via a
`scriptOverrides` swap and re-measured `amplitudeOnly` — the fourth F1-amp subject law, explicitly EXCLUDED
from the width floor (its own `ribbonStretchCount === 0` control). Result: `ribbonStretchCount: 40` (was 0 on
the shipped tree) — **the control is not vacuous; a plausible code change that pushes `amplitudeOnly` into the
wide bucket does trip it.** I did not additionally verify a thinning-only mutation is scoped per-law (rather
than an aggregate/shared bar) by execution, but this is verifiable by code inspection alone and I did so:
`WIDTH_FLOOR_MM` is a 3-key object and every assertion is `test.each(WIDTH_LAWS)` with a per-law lookup — there
is no aggregate/summed assertion anywhere in the file that a law outside `WIDTH_LAWS` could accidentally trip
or hide behind.

## Condition 6 — Decision-10 packet — ACCEPT-WITH-FOLLOWUPS

Per-law mean width (mm + pen) and interior fill ink / total ink at `42acff7b` are present and independently
reproduced by me (condition 2 table above) on the **addLayer/unit-fixture rig only**. This half is genuinely
measured, not inferred — I re-derived every number myself from a live run, not from the report's own text.

**The `create`-rig half is NOT independently measured for width, and the report's justification for that gap
overstates the obstacle.** The report says extending width to the `create` rig "would need `scene3d-
capture.js` itself instrumented for per-stretch width... outside this unit's tests-only grant." I checked
`scene3d-capture.js` directly: it reads only `SurfaceFill.lastRibbonStats` (`:340`), an aggregate counters
object with no width field at all (confirmed by reading `publishRibbonStats` in `surface-fill.js:11812` — it
carries `regionRings`/`regionArea`/`ribbonStat` counters, never a width number) — so the report's claim that
`scene3d-capture.js` "does not expose per-stretch width" is correct as far as it goes. But the report frames
the FIX as requiring an edit to that MAIN-owned script, which is not the only path: `window.Vectura.Scene3D
.Params.PRIMITIVE_CREATE_DEFAULTS` is a plain, in-process-reachable object (confirmed by reading
`scene3d-capture.js:127,236` and `params.js:124`), so a tests-only script could construct the SAME
`PRIMITIVE_CREATE_DEFAULTS`-seeded object bag `scene3d-capture.js`'s own `create` branch builds, inside the
existing `loadVecturaRuntime`/jsdom harness this unit already uses, and wrap `buildRibbonMultiPolygon` exactly
as `measureRibbonWidth` already does — sizing the create-rig width gap without touching `scene3d-capture.js`
at all. This is squarely inside the unit's tests-only grant and was not attempted. I did not build it myself
either (given time/shared-machine cost), so I am not overturning the disposition — MEASURE FIRST was met on
one rig, honestly disclosed as one rig — but "the only way is editing a MAIN-owned script" is not quite true,
and a real, cheaper option was left on the table as a followup rather than named as one.

The ink half is genuinely already covered by prior units on the `create` rig (F1-amp-review condition 3:
`onePenDown` −7.99%) — I did not re-verify that number myself since it was independently reproduced by the
F1-amp reviewer already and re-deriving it is out of this unit's own scope.

## Condition 7 — Lane baseline unchanged, Bars changed — ACCEPT

Spot-checked two of the three named guards myself, foreground, in the worktree, fresh runs:
- `tests/unit/scene3d-ribbon-f1b-streaks.test.js` — **44/44** (29.14s)
- `tests/unit/scene3d-ribbon-wall-coverage.test.js` — **36/36** (36.87s)

Both match the report's claimed baseline exactly. `## Bars changed` says "ADDED only" — correct and the only
honest answer available, since `git diff --stat` (condition 1) shows zero existing files touched; there is
nothing that could have been widened, narrowed, or re-pinned.

## Condition 8 — Runtime — ACCEPT (not a slow-list candidate)

Measured myself: **33.01s** for the full new file (10 tests, 3 separate `loadVecturaRuntime` calls in
`beforeAll`). Comfortably inside the default 120s Bash timeout and nowhere near Tier-2 territory (the file
does not need `timeout: 600000` or singleFork under normal machine load). Does not need adding to the
known-slow list.

## Overall

| # | Verdict |
|---|---|
| 1 Tests-only | ACCEPT |
| 2 Canonical quantity / agreement | ACCEPT-WITH-FOLLOWUPS |
| 3 Discrepancy job | ACCEPT |
| 4 Floors / drift envelope | ACCEPT-WITH-FOLLOWUPS |
| 5 Mutation proof (BLOCKING) | ACCEPT |
| 6 Decision-10 packet, both rigs | ACCEPT-WITH-FOLLOWUPS |
| 7 Lane baseline / Bars changed | ACCEPT |
| 8 Runtime | ACCEPT |

**OVERALL: ACCEPT-WITH-FOLLOWUPS.** This is the first guard in the repo that measures ribbon width, and it
does what it says: every headline number I attempted to reproduce reproduced to the exact digit, from my own
from-scratch runs of the canonical script rather than by re-stating the report's own text; the mutation-kill
proof (BLOCKING) executes and passes both directions, plus my own additional per-law and non-gated-law
mutations; the floor is correctly scoped as a lower-bound-only gate; and the lane baseline is unmoved. None of
the three follow-ups below is blocking, but none should be lost:

1. **Correct the causal claim about the `onePenDown` width gap vs F1-erode-plan.md §7.** It is not "F1-erode's
   fix landed between the two measurements" — I measured `onePenDown` at `7f805654` (byte-identical source to
   `cd541f87`, pre-erode-fix) and got `1.0089mm`, identical to the post-erode-fix `6e1ed52f` reading, not to
   F1-erode-plan's `0.9860mm`. The gap predates the erode fix entirely; it is a pure script-methodology
   difference between F1-erode-plan's own probe and this unit's canonical script. Does not change any floor.
2. **Disclose the fillAngle mismatch between the evidence screenshots and the measured fixture.** The
   `after/F1-width-bar/` captures (both `create` and `addLayer` rigs, via `scene3d-capture.js`) are shot with
   an explicit `fillAngle: 45`; the canonical script/helper never sets `fillAngle`. The two manifests' own
   `inkMm` for identical law/mapper/density diverge from the canonical script's `totalInkMm` by ~35-40% as a
   result. The pictures backing "what I saw" are not quite the fixture the numbers were measured on.
3. **The `create`-rig width gap is more closeable than disclosed.** `scene3d-capture.js`'s inability to expose
   per-stretch width is real, but a tests-only script replicating its `PRIMITIVE_CREATE_DEFAULTS` construction
   inside the existing jsdom harness (no edit to `scene3d-capture.js`) could size the gap. Worth doing before
   this is cited as a permanent limitation.
4. **`onePenDown` camera-'b' width remains unmeasured** — by the implementer (disclosed) and by me (attempted,
   also could not complete before the shared machine's load climbed past 5). The 0.80x margin standing in for
   it is reasoned, not measured. Revisit when the machine is genuinely idle.

## Cleanup

No probe files left in the worktree — three scratch scripts were written to
`/private/tmp/claude-501/scratch-FWB/` (outside the repo) and that whole directory was removed at the end of
the review, along with the `pre`/`post` `git archive` exports and the `node_modules` symlinks inside it. The
worktree's own live T2-3 WIP (`surface-fill.js`, `tests/helpers/scene3d-mktick-wedge.js`) was observed but
never touched.
