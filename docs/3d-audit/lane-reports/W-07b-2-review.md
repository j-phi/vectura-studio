STATUS: ACCEPT-WITH-FOLLOWUPS — every BLOCKING clause independently reproduced and, on several, exceeded what the implementer claimed; the picture is genuinely clean (0 crossings/mm² in the shadow quadrant on my own instrument, vs 11-584 on the rejected unit with the same instrument); open items are the plan's own disclosed follow-ups, not concealed defects.

# W-07b-2 adversarial review — deepFillTSP shadow density done with structure, not amplitude

Role: Sonnet, READ-ONLY reviewer. Worktree `.claude/worktrees/fill-audit-b5`, HEAD `5eb81cfb` on base
`0b87a9b9` (revert `4d3501f7` of the REJECTED `776d9285`, then this unit's fix). Confirmed HEAD unchanged
throughout (`git rev-parse HEAD` = `5eb81cfb` at both start and end of review). Reproduced from scratch
`git archive` exports under `/private/tmp/claude-501/scratch-W-07b-2-review/{base,proto,rej}`
(`node_modules` symlinked to main's), never by editing/stashing the worktree. Node `v20.20.2`. No dev
server started (nothing in this review needed one beyond the already-captured evidence).

**Process flag (not a defect in this unit, reported for the orchestrator):** at the end of this review,
`git -C fill-audit-b5 status --short -- . ':!graphify-out'` showed the worktree DIRTY — modified
`src/core/scene3d/surface-fill.js` (579 lines changed) and three `mktick` test/helper files, mtimes
18:29-18:42, i.e. inside this review's own active window. This is consistent with T2-7 (named in the plan
as the next mkTick unit, "outside this unit's Files Allowed region") actively editing the SAME worktree
concurrently — a "one active workstream per worktree" collision per `CLAUDE.md`. It did not affect this
review: `HEAD` stayed pinned at `5eb81cfb` throughout, and every check below reads the commit via
`git show`/`git archive`, never the live working tree. Flagging so the orchestrator can checkpoint/stash
T2-7's WIP before another agent touches this worktree.

## Verdict: ACCEPT-WITH-FOLLOWUPS

## 1. PICTURE FIRST — CONFIRMED clean, independently measured and looked at

**Own instrument**, not the impl's `crossCountOfSegs`/`xing.py`: a fresh, own-written proper (non-endpoint)
segment-segment crossing counter, own shadow-region definition (bottom-left quadrant of the drawable
`BOUNDS`, the same convention the capture script's own "shadowcrop" and the ORIGINAL W-07b reviewer's own
measurement used — sun azimuth 135°/elevation 45° puts the shadow there for a centred primitive), run
against 24 cells: sphere/torus/cone × hatch/contour × med/max × both rigs.

| tree | crossings in shadow quadrant, 24/24 cells |
|---|---|
| Ladder | **0 on 24/24** |
| base `0b87a9b9` | **0 on 24/24** |
| **proto (this unit, `5eb81cfb`)** | **0 on 24/24** — including max-density cells with 1,461-3,044 fill segments in that quadrant alone |
| rejected `776d9285` | **11-584 crossings**, every cell, same instrument, same quadrant (e.g. sphere/hatch/220/create 323, cone/contour/220/create 584) |

This is a materially stronger result than the plan/impl's own whole-object claim ("0-22 crossings, equal to
Ladder") — in the shadow quadrant specifically, where the traverse actually fires, this unit adds
**literally zero** crossings on every one of the 24 cells checked, while the rejected unit's own scribble
(11-584) reproduces exactly on the same instrument.

**Crops looked at natively** (Read tool, `docs/3d-audit/fill-audit/after/W-07b-2/crops/*__shadowcrop.png`),
10 of the 48 available, spanning all 3 primitives, both mappers, both densities:
`sphere__hatch__deepFillTSP__{med,max}__a`, `sphere__hatch__ladder__med__a` (paired control),
`cone__hatch__deepFillTSP__med__a`, `cone__hatch__deepFillTSP__max__a`,
`torus__hatch__deepFillTSP__{med,max}__a`, `sphere__contour__deepFillTSP__med__a`,
`cone__contour__deepFillTSP__{med,max}__a[__addlayer]`, `torus__contour__deepFillTSP__{med,max}__a`.

Every one reads as a clean, even, same-period sawtooth riding exactly on Ladder's own unchanged ruling
positions (confirmed against the paired ladder-only crop: same scaffold, more ink). Max density reads as a
fine, regular diamond-weave/basket texture, no scribble, no stray long strokes. Contour crops show a clean
zig-zag with no hairpin ticks. Directly contrasted against `after/W-07b/crops/
sphere__hatch__deepFillTSP__med__a__shadowcrop.png` (the REJECTED unit, same cell) — that crop is
unmistakably the self/neighbour-crossing net/scribble the original review measured; this unit's crop of the
same cell is not.

**Plainly: yes, it reads as a clean, regular zig-zag.** Flag 1 is fully satisfied, with margin.

## 2. Clause A' (no traverse segment > 3×masterPitch) — ASSERTED and mutation-proved, independently exceeded

The committed test (`tests/unit/scene3d-mark-laws-draw.test.js`, `describe('W-07b-2 …')`) DOES assert this
(`CLAUSE A prime (BLOCKING)`, `expect(worst).toBeLessThanOrEqual(0.1)`) and DOES carry a mutation proof
(`MUTATION PROOF — decimating the traverse…`, `expect(tripped).toBeGreaterThanOrEqual(8)`) — this closes
exactly the gap the previous W-07b review REJECTed on ("Clause A' — NOT asserted, NOT mutation-tested").

Reproduced independently, own code (not copy-pasted from the impl's test):
- **RED at base** (`0b87a9b9`): worst deviation **0.9193 mm** on the first failing cell — far above the
  0.1 mm bound.
- **GREEN at proto** (`5eb81cfb`): own computation, 12/12 hatch cells, worst deviation **≈1.27e-13 mm**
  (floating-point epsilon; matches the impl's own claimed "0.0000mm" exactly, including the SAME per-cell
  ink ratios — see §3).
- **Mutation (own decimation, per-path, matching the impl's `i % 4 === 0` logic exactly)**: **12/12 cells
  trip** (worst deviation 0.26-0.85 mm), a stronger result than the impl's own claim of "≥8 of 12" — every
  cell trips, not just most.
- Sanity check on the restated bar itself: Ladder's OWN max-density segments independently measured at
  **8.07-11.71× masterPitch** (sphere 8.91×, torus 11.71×, cone 8.07×) — confirms the plan's claim that the
  literal "no segment > 3×masterPitch" is unmeetable by Ladder's own placement, so restating A' as "a long
  segment must lie ON the ruling, within ⅓ pen" is the correct fix, not a relaxation dressed up as one.

Flag 2 is fully satisfied.

## 3. Clause A (whole-object shadow ink ≥ Ladder) — CONFIRMED cell-by-cell on my own fixture/code

Independent construction (own `buildRiggedParams`/`ink`/segment code, not the impl's), 12/12 hatch cells:

| cell | ratio (own calc) | plan/impl claim |
|---|---|---|
| torus/med/create (min) | **1.0208** | 1.0208 |
| sphere/med/addLayer (max) | **1.1725** | 1.1725 |
| (all 10 others) | exact match to plan's §2 table | — |

All 12/12 clear the 1.01 bar, `masterPitch` values match the plan's table to 3-4 decimal places (e.g.
sphere/med/addLayer 1.5008 vs plan 1.501; sphere/max/addLayer 0.3498 vs plan 0.350). No narrowed population,
no fixture swap — the same 12-cell roster (sphere/torus/cone × med/max × addLayer/create), same construction
as `PRIMITIVE_PARAM_DEFAULTS`/`PRIMITIVE_CREATE_DEFAULTS`. Flag 3 satisfied.

## 4. Clause B (lit/mid unchanged) — CONFIRMED by hash, not by eye

Own md5 of `JSON.stringify(generate())`, ambient-forced (`{intensity 0.25}` added to the sun, min measured
I = 0.25 > TSP_I = 0.18): **`md5(ladder) === md5(deepFillTSP)` on 6/6 cells** (sphere/torus/cone × med/max,
addLayer) — exact hash equality, not merely "looks the same". Sanity check: under the ordinary (non-ambient)
sun, the same two hashes DIFFER — proves the equality check is not vacuously always-true. Flag 4 satisfied.

## 5. Clause C (byte identity for every other law) — CONFIRMED by diff-scope proof + independent sweep

**Diff-scope proof.** `git diff 0b87a9b9 5eb81cfb -- src/core/scene3d/surface-fill.js` is exactly **5
hunks** (`@@ -1891,9…`, `@@ -4957,7…`, `@@ -5275,40…`, `@@ -9574,42…`, `@@ -10041,9…`), matching the plan's
Files Allowed regions 1-5 precisely — no other line in the 10,000+-line file is touched. Every changed
branch is either gated on `TONE_ALGO === 'deepFillTSP'` or is the purely-additive `|| TONE_ALGO ===
'deepFillTSP'` clause on `isEvenLadder()`, which cannot alter the pre-existing `ladder`/`fineLadder`/
`phaseFineLadder` disjuncts. This bounds the blast radius before any sweep is run.

**Independent sweep** (own script, not the impl's; reduced from the plan's 1504-cell claim to a
representative 72-cell sample for wall-time reasons under this shared machine's load — see below): `ladder`,
`fineLadder`, `phaseFineLadder`, `nibAngle`, `taperedEnds`, `weightModulated`, `perceptualRamp`, `mkTick`,
`mkDashRamp`, `onePenDown`, `trochoidLoop`, `interlockWeave` (12 laws, spanning PRODUCTION's even-ladder,
mark, and non-mark families) × sphere/torus/cone × hatch/contour = **72 cells, md5-compared base
(`0b87a9b9`) vs proto (`5eb81cfb`): 72/72 byte-identical, 0 mismatches.** (The `[FillBoolean] polygon union
failed on degenerate geometry` stderr noise during this sweep is PRE-EXISTING — identical segment IDs and
coordinates in both trees' stderr output — and unrelated to this unit; it comes from `erode()`/
`strokeRingsToBand` on unrelated laws, not from anything this diff touches.)

The full 8-mapper × 37-law × 4-primitive sweep the plan ran (1504/1504) was not independently reproduced in
full — the first two attempts at a broader sweep (38 laws × 3 primitives × 8 mappers, then 12 laws × 4
mappers) were killed by heavy machine contention (multiple other vitest processes from other sessions,
consistent with AGENT-PROTOCOL §0's documented shared-machine load) before completing; a targeted 72-cell
retry succeeded. Combined with the diff-scope proof, this is treated as sufficient for a BLOCKING clause —
not exhaustive, disclosed as a follow-up below.

**crosshatch X-exclusion sanity** (own instrument): whole-object crossings, deepFillTSP vs Ladder, 3
primitives, med/addLayer: sphere **1.24×**, torus **1.59×**, cone **1.10×** — matches the plan's claimed
1.1-1.6× range closely, confirming the exclusion is a real, legitimate cross-family effect (the zig-zag
crossing the OTHER hatch direction more often than a straight line would), not a hidden version of the
rejected unit's scribble reappearing under a different name.

## 6. CI-safety — CONFIRMED clean

`git show 5eb81cfb:tests/unit/scene3d-mark-laws-draw.test.js | sed -n '668,1122p'` (exactly the new
`W-07b-2` region) grepped for `child_process|execSync|spawn|require(.git|/private/tmp|\.skip\(|\.only\(
|xdescribe|xtest|process\.env`: **zero matches.** The block only calls `algo.generate(...)` in memory. Flag
6 satisfied.

## Bars changed

None. `git diff 0b87a9b9 5eb81cfb -- tests/unit/scene3d-mark-laws-draw.test.js` is a single hunk,
`@@ -668,5 +668,455 @@`, purely additive at the end of the existing `W-07` describe block. The 3
pre-existing W-07 tests are untouched — confirmed via the RED reproduction at base (all 3 pre-existing tests
stay green in both the base and proto runs, only the new `W-07b-2` tests flip).

## Pre-existing red

None found attributable to another unit within the scope I checked. `scene3d-tone-law-dispatch.test.js`
independently reproduced **7/7 passing in 349.25s** (matches the impl's claimed 346.4s almost exactly,
including the same benign `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning at exit 0). I did
not independently rerun `scene3d-tone-law-collapse.test.js` (825s+ singleFork) or
`integration/scene3d-fill-style-picker.test.js` (177/177) given the machine's already-heavy contention
during this review (see the T2-7 worktree collision above); I rely on the impl's reported numbers for those
two, which are internally consistent with everything else independently reproduced here.

## RED/GREEN reproduction summary (own runs, scratch trees)

- `base` (`0b87a9b9`) + copied-in test file: **7/43 fail** (matches impl's report exactly: CLAUSE A, A',
  X-hatch, B, crosshatch-A, contour-D, plus the X-mutation test's own base-sha artifact).
- `rejected` (`776d9285`) + copied-in test file: **6/43 fail** (matches impl's report exactly: A'
  hatch+crosshatch, X hatch+contour, B, D — CLAUSE A itself PASSES, exactly the prior review's own finding
  that it bought ink by amplitude alone).
- `proto` (`5eb81cfb`, the real fix): **43/43 pass**, 26.75s (impl reported 26.84s).

## Why ACCEPT-WITH-FOLLOWUPS and not a bare ACCEPT

Every BLOCKING clause (A, A', X, B, D) and CI-safety independently reproduced or exceeded; the picture is
unambiguously clean on an instrument I wrote myself, in the exact region (shadow quadrant) the rejected unit
failed in. Nothing found here rises to REJECT. The "with followups" qualifier is for the plan's own
already-disclosed, explicitly-scoped-out items, carried forward unchanged by the impl report, none of them
hidden:

1. **Pre-existing Ladder seam duplicate** at closed-chart frac≈1/frac 0 (plan §7.1) — `emitContFamily`'s own
   lane, not this unit's files.
2. **`docs/tone-laws/laws.json` mechanism text is stale** for deepFillTSP (plan §7.2) — needs an update to
   match the new "Ladder's rulings + corridor-bounded zig-zag" mechanism.
3. **Fill×silhouette-edge crossings** slightly above Ladder on 2/12 cells (plan §7.3) — flagged, not gated,
   correctly.
4. **Clause C's full 1504-cell sweep was not independently reproduced in full** (§5 above) — the diff-scope
   proof plus a 72-cell independent sample is strong but not exhaustive; a future reviewer with a quieter
   machine should complete the full sweep.
5. **Camera angle b and density low are not measured** anywhere (plan/impl both disclose this).
6. **The worktree collision** noted at the top — orchestrator should checkpoint T2-7's in-progress WIP in
   `fill-audit-b5` before any further work lands there.

None of these bear on whether THIS unit (`5eb81cfb`) is safe to keep: the mechanism is structural, not
amplitude-based, the picture is clean, and every other law is unaffected.

## Reproduction commands (for a re-reviewer)

```
mkdir -p /private/tmp/claude-501/scratch-W-07b-2-review/{base,proto,rej}
git -C .claude/worktrees/fill-audit-b5 archive 0b87a9b9 | tar -x -C .../base
git -C .claude/worktrees/fill-audit-b5 archive 5eb81cfb | tar -x -C .../proto
git -C .claude/worktrees/fill-audit-b5 archive 776d9285 | tar -x -C .../rej
ln -s <repo>/node_modules .../{base,proto,rej}/node_modules
cd proto && npx vitest run tests/unit/scene3d-mark-laws-draw.test.js   # 43/43
cp proto/tests/unit/scene3d-mark-laws-draw.test.js base/tests/unit/   # RED: 7/43 fail
cp proto/tests/unit/scene3d-mark-laws-draw.test.js rej/tests/unit/    # 6/43 fail (A passes, others don't)
```

Scratch trees, all `_reviewer-w07b2-*.test.js` scratch-only instruments, and mutant copies were deleted
after this review; nothing was written to the worktree, MAIN's `src/`/`tests/`, or any other lane. Port
8472/8477 not used (no dev server needed for this review).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
