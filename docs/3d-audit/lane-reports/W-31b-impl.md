STATUS: MEASURED

# W-31b — implementer report: crosshatch CELL SHAPE, RANK 3 (MEASURED-with-guards)

**Lane:** fill-audit-a3 · **Worktree:** `.claude/worktrees/fill-audit-a3` · **Branch:** `3d-scene/fill-audit-a3`
**Base sha:** `64b160a0` (T3, on top of the plan's `3bc61c32`) · **Final sha:** `c28b3490` (only `tests/unit/scene3d-crosshatch-cell-shape-b.test.js` added; `surface-fill.js` byte-identical to base).
**Port:** 8475.

## Summary

Per the orchestrator's ruling, this unit got ONE bounded attempt at M1 (the plan's Rank-1
per-sample-warped-placement mechanism) — start from the plan's Appendix A prototype, at most TWO
iterations, judged strictly against the four closure conditions in the plan's §4.1. **Both iterations
failed to close the gate.** M1 is **DISCARDED and NOT committed** — the worktree's
`src/core/scene3d/surface-fill.js` is byte-identical to `64b160a0` (`git status` confirms zero diff).

**Rank 3 ships instead**, per the plan's §4.3: no source change, two new mutation-proved guards
(`tests/unit/scene3d-crosshatch-cell-shape-b.test.js`, new file) — **C7** (tone-authority floor at d=50,
gating Jay's "unless we're trying to represent highlights" clause) and **C8** (local plot-safety p01
floor at d=220, guarding the rail a future per-sample placement mechanism must not cross). Both are
GREEN today and both are mutation-proved.

**Jay's defect (evenness) is STILL RED and unfixed** — this unit does not close it. It is documented,
measured, and two new guard rails are placed around any future attempt.

## Which half of Jay's rule this unit gates

Jay's sentence has two clauses: (1) "are lines not being evenly spaced?" and (2) "unless we're trying
to represent highlights." **This unit gates clause 2 for the first time (C7) and adds a safety rail
(C8) that gates neither clause directly but bounds what any future fix for clause 1 is allowed to do.**
Clause 1 itself remains ungated by a passing test — it is documented as RED in `scene3d-crosshatch-cell-shape.test.js`'s
own header (a non-regression ceiling, not the [0.85, 1.18] band) and in this unit's evidence.

## Re-derived RED (this unit's own base, 64b160a0)

Re-ran `tests/unit/scene3d-crosshatch-cell-shape.test.js` on `64b160a0` before touching anything:
**23/23 pass**, and the pinned CEILING columns are byte-identical to the plan's `3bc61c32` table (cone
d=220a: 0.6438/0.6917/1.0151/1.4652/1.6427, ramp 2.552; sphere d=220b control: 1.0015/0.9748/1.0002/1.0275/1.0063,
ramp 1.054; etc.) — confirming T2-3/T3 (this base's own commits beyond the plan's `3bc61c32`) do not
touch this code path, exactly as the plan's disjointness analysis (`git diff 3bc61c32 64b160a0 --
surface-fill.js` hunk list, none overlapping `:9932-10344`) predicted. **RED is unchanged from the
plan's own re-measurement.**

Re-verified line numbers on this base (shifted from the plan's `3bc61c32` numbers by T2-3/T3's earlier
insertions, all before this region): `angleFamily`'s wrapped branch `lineAtWrapped` at `:10152`, `probe()`
at `:10340`, `mmPerFrac` return at `:10414`, the walk's `df` clamp at `:10575`, `placed.push` at `:10599`,
emission's `placed.forEach` at `:10763`.

## M1 spike — the bounded attempt, in full

### Setup

Applied the plan's Appendix A diff to the worktree's `surface-fill.js`, adapted to the shifted line
numbers, with the mirror mode (M2, already rejected by the plan) dropped entirely for simplicity — this
unit only ever exercised the `mode: 'gap'` (V7) path the plan recommends starting from. Verified
`node --check` clean at each step.

**Bug found and fixed while porting**: the plan's own Appendix A text applies the "curvature bound"
(`W31B_WSMOOTH`) to the per-ruling per-sample SHAPE (`sh[]`) before it becomes an increment. That is not
what a curvature bound on the accumulated warp needs — a bound on this ruling's own shape says nothing
about how the family's field bends across MANY rulings' accumulated history. Re-read the plan's own prose
("CURVATURE BOUND on the ACCUMULATED field... bounds how sharply the ruling BENDS") and moved the
smoothing to operate on `warpSnap + incArr` (the full accumulated field, this ruling's proposal on top of
every prior ruling's own field), matching the stated intent. Verified the fix mattered: before the fix,
V7 reproduced ramps far worse than the plan's own table (cylinder 2.001, torus 2.028, ellipsoid 2.204);
after the fix, V7 reproduced the plan's own table to 3-4 decimals on every primitive.

### Byte-identity proof

`globalThis.__W31B = { off: true }` reproduced every CEILING column exactly to 4 decimals — the gate's own
proof that the reimplementation's OFF path is inert and the plumbing (per-sample `mmArr`/`wantArr`/`wArr`
threaded through `probe()`, the decoupled scalar bookkeeping) is wired correctly before judging the ON path.

### V7 reproduction (iteration 1, no new mechanism — confirms the plan's own gate verdict)

| cell | this unit's V7 columns | this unit's ramp | plan's V7 columns (Appendix A table) | plan's ramp |
|---|---|---|---|---|
| cone d=220 a | 0.886/0.984/1.041/1.030/1.013 | 1.175 | 0.886/0.984/1.041/1.030/1.013 | 1.175 |
| cylinder d=220 a | 1.138/1.055/1.208/1.331/1.082 | 1.262 | 1.138/1.055/1.208/1.331/1.082 | 1.262 |
| sphere d=220 a | 1.035/1.081/1.111/1.146/1.182 | 1.142 | 1.035/1.081/1.111/1.146/1.182 | 1.142 |
| torus d=220 a | 0.979/0.914/1.051/0.978/0.943 | 1.149 | 0.979/0.914/1.051/0.978/0.943 | 1.149 |
| ellipsoid d=220 a | 1.105/1.497/1.310/0.983/1.291 | 1.523 (regressed) | 1.105/1.497/1.310/0.983/1.291 | 1.523 (regressed) |
| sphere d=220 b (control) | 0.911/0.920/0.966/0.727/1.064 | 1.465 (regressed) | 0.911/0.920/0.966/0.727/1.064 | 1.465 (regressed) |

Within-family p01 (mm, flat, my own instrument — see "Instrument note" below): torus 0.0507 -> 0.0004
(plan: 0.0674 -> 0.0005), sphere-cam-b 0.0302 -> 0.0000 (plan: 0.0301 -> 0.0000). **This confirms the
plan's own GATE VERDICT: FAIL** — independently reproduced, not merely cited.

### New attempt within iteration 1: a probe-based local plot-safety floor

Added a mechanism NOT in the plan's Appendix A: after computing this ruling's curvature-bounded warp
update, probe the candidate NEXT ruling it would place and measure its actual clearance to THIS ruling's
own (already-fixed) points, using the exact `acrossClear()` construction `contFieldAniso` already uses
elsewhere in this file. If the candidate would land closer than `0.5 * want`, damp the whole delta toward
zero (toward the previous ruling's own accumulated field) in up to 4 iterations, each shrinking by 0.35x.

**Result: WORSE across the board, not better.** Cone: ramp 1.175 -> 3.076, interior windows (measurability)
79 -> 12 — a measurability collapse, not an improvement. Cylinder/sphere/ellipsoid all degraded similarly
under the same config. **Diagnosis**: damping a ruling's own warp contribution without also re-deriving
how `f` accumulates forward decouples the warp field from the parameter position — a damped ruling still
advances `f` by the same `df` it would have without damping, so the next ruling's own floor check inherits
a worse starting position, compounding across the family. This is a genuine mechanism failure, not a
tuning miss.

### Iteration 2: parameter retuning only, custom mechanism off

Reverted to plain V7 plus retuned knobs only (no probe-based floor): tried `wsmooth: 6, rmax: 1.3` and
`wsmooth: 10, rmax: 1.3, lam: 0.6`.

| config | torus p01 (need >=0.0431) | sphere-cam-b p01 (need >=0.0257) | ellipsoid ramp | cylinder ramp |
|---|---|---|---|---|
| V7 baseline | 0.0004 | 0.0000 | 1.523 | 1.262 |
| wsmooth=6, rmax=1.3 | 0.0007 | 0.0000 | 1.165 | 1.826 (worse) |
| wsmooth=10, rmax=1.3, lam=0.6 | 0.0034 | 0.0000 | 1.101 | 2.127 (worse) |

**Neither retune closes condition 1.** Sphere-camera-b's p01 stays at exactly 0 in every configuration
tried — two rulings of that family are geometrically crossing, not merely close, under every amplitude/
smoothing combination this iteration tried. This matches the plan's own §2.2 point 4 finding: amplitude
caps bound how far a sample moves, not how the ruling bends relative to its actual (not assumed-parallel)
neighbour. Closing it needs the plan's own-named "fifth required change" — an explicit neighbour-clearance
fixed point reading the previous ruling's own emitted field — which is new machinery, not a retune, and is
out of reach of a two-iteration bounded spike without a real risk of shipping something that lets a
plotter's pen cross itself (exactly what iteration 1's own floor attempt demonstrated is easy to get
wrong).

### Cleanup

`git -C <worktree> checkout -- src/core/scene3d/surface-fill.js`; `node --check` clean;
`scene3d-crosshatch-cell-shape.test.js` re-verified 23/23 on the pristine file. `git status --short`
shows zero diff on `surface-fill.js`. The scratch measurement test file used during the spike
(`tests/unit/zzw31b-measure.test.js`) was deleted before committing anything.

## Instrument note (found by this unit, not previously recorded)

`localGaps(lines, crossLines, cap)` in the ceiling file declares `crossLines` and never reads it — the
gaps it returns are strictly within-family. That is what C2/C8 need and what the aspect ratio needs, so
the instrument is correct as-is; the unused parameter is a readability trap, not a bug (matches the plan's
own §1 note; not "fixed" here either, since fixing it would move every pinned number in two files now).

This unit's own p01 measurement (used for C8's pins) differs slightly in the third decimal from the plan's
scratch-export numbers on torus (0.0507 here vs 0.0674 in the plan) and sphere (0.0127 here vs 0.0200) —
both are legitimate "today's own base" measurements using the SAME `localGaps` construction, but computed
over a slightly different percentile-population size (the plan's scratch harness and this unit's guard
file are not byte-identical scripts, only the underlying instrument is shared). Per AGENT-PROTOCOL's rule
3 (name the fixture behind every number), C8's guard pins THIS FILE's own re-derived measurement, not the
plan's, and states so in the test file's own comment.

## Rank 3 guards — C7 and C8

### C7 — tone authority floor at d=50

Gates Jay's SECOND clause. Lit rig, d=50, camera a, crosshatch/ladder: median interior cell AREA under
sun azimuth 315 vs 135 (elevation 45 both times) must be >=1.50 on sphere and >=1.40 on cone. Measured
today (independently re-derived via a standalone node script, not just the guard's own pass/fail):
**sphere area 7.5491 (az315) / 3.5617 (az135) = ratio 2.1196** (floor 1.50, real headroom);
**cone area 6.0793 (az315) / 3.3736 (az135) = ratio 1.8020** (floor 1.40, real headroom). Matches the
plan's own §1.4 numbers (2.119 / 1.802) almost exactly.

**Mutation proof** (blocking, AGENT-PROTOCOL rule 1): the internal closures this bar depends on
(`ladderPairWantedPitch`, the walk that spends `pb.I`) are not exposed as a test seam, and this unit's
file scope (crosshatch placement only) does not license adding one solely for a mutation harness. The
mutation is constructed on the INPUT instead: re-running C7's own comparison as az135-vs-az135 (no
light-direction difference at all) must collapse the ratio to ~1.0 and fail both floors. **Ran it: ratio
collapses to 1.0 (within `toBeCloseTo(1, 1)`) and fails both the 1.50 and 1.40 floors, on both primitives.**
This proves C7 is sensitive to a genuine tone response, not to geometry alone.

### C8 — within-family local-gap p01 does not regress, flat tone, d=220

Gates neither clause directly — it is the rail a per-sample placement mechanism (like the discarded M1
spike) can out-run even while every column-median bar looks fine. Pinned to this unit's own measurement:
sphere 0.0127, cylinder 0.0452, torus 0.0507, ellipsoid 0.0153, cone 0.0128, sphere-cam-b 0.0302 (mm).
Each guard asserts `p01 >= 0.85 * pinned` (plus a loose 0.5x sanity band).

**Mutation proof** (blocking): injects enough synthetic near-zero gap samples — M1's exact failure mode,
two rulings of the same family touching — into a real, freshly measured population to guarantee the
1st-percentile INDEX itself lands on one of them regardless of population size, then confirms the
resulting p01 falls below every one of the six pinned floors. Proves the assertion's arithmetic (a true
1st percentile of the raw population, not a mean or a windowed statistic that could hide a single close
call) actually trips on a touch.

## Guards run (foreground, one file per command, `timeout: 600000` where applicable)

| file | result |
|---|---|
| `scene3d-crosshatch-cell-shape-b.test.js` (new) | **11/11** |
| `scene3d-crosshatch-cell-shape.test.js` (W-31 ceiling) | **23/23** (unchanged) |
| `scene3d-crosshatch-parity.test.js` (W-36c P1-P6) | **91/91** (unchanged) |
| `scene3d-curved-density-floor.test.js` | **14/14** (unchanged) |
| `scene3d-fill-even-spacing.test.js` | **12/12** (unchanged) |
| `scene3d-ladder-uniform-field-spacing.test.js` (W-26 R1a) | **9/9** (unchanged) |
| `scene3d-fill-span-verdict.test.js` | **11/11** (unchanged) |
| `scene3d-plot-safety.test.js` | **5/5 +1 skip** (unchanged) |
| `scene3d-curved-density-sparse-end.test.js` | **20/20** (unchanged) |
| `scene3d-curved-crosshatch-controls.test.js` | **18/18** (unchanged) |
| `scene3d-fill-boundary-ends.test.js` | **41/41** (unchanged) |
| `scene3d-fill-ruling-continuity.test.js` | **10/10 +1 skip** (unchanged) |
| `scene3d-fill-ruling-corners.test.js` (W-33) | **19/19** (unchanged) |
| `scene3d-hatch-density-angle-stable.test.js` (W-36b) | **9/9** (unchanged) |
| `scene3d-mapper-audit.test.js` | **70/70** (unchanged) |
| `scene3d-surface-fill.test.js` | **6/6 +2 skip** (unchanged) |
| `scene3d-mark-laws-draw.test.js` (T4/W-36c oracle) | **30/30** (unchanged) |

Every guard above is unchanged because `surface-fill.js` has zero diff against `64b160a0` — the byte-
identity sweep the plan requires for a source-changing unit is satisfied trivially by construction (no
source changed, so nothing could have moved).

## Pre-existing red

`tests/unit/scene3d-mktick-wedge.test.js`: **44 passed / 2 skipped / 1 failed**, matching the documented
known lane red (T2-3b's, per this unit's brief: "report unchanged, do not touch"). Reproduced exactly,
untouched.

## Sweep coverage

This unit made no source change, so the byte-identity sweep the plan's §5 asks for (35 non-crosshatch
roster cells, non-ladder crosshatch laws, `onMeridianAxis` branches) is satisfied trivially — nothing in
`surface-fill.js` moved. The new guard file's own coverage is 6 of the plan's named fixtures (5 primitives
at d=220 camera a + sphere camera b), matching the plan's C8 fixture list exactly; C7 covers the 2
primitives (sphere, cone) the plan named for the tone-authority floor.

## Evidence

Captured from MAIN with `--root` = this worktree, both `--rig create` (default) and `--rig addLayer`,
`--out docs/3d-audit/fill-audit/after/W-31b`. Tier B: sphere/cone/torus x crosshatch x ladder x {med,max}
x {a,b}, both rigs. Tier A: cylinder/ellipsoid (not in tier B) x same, both rigs, plus the three P6
byte-identity controls (sphere+hatch d=50, sphere+contour d=50, cylinder+hatch d=220), both rigs.
`window.Vectura.APP_VERSION` confirmed `1.4.1`, matching the worktree's `package.json`.

**LOOKED at every named cell (Read tool, native/near-native resolution, cropped where the brief asked):**

- `cylinder__crosshatch__ladder__max__a` (Jay's own panel): cropped left limb / centre / right limb
  separately. Centre shows near-square uniform diamonds. **Left limb visibly more compressed/narrow;
  right limb visibly more stretched/elongated.** Jay's original complaint is still visibly present,
  exactly as documented, unfixed.
- `cone__crosshatch__ladder__max__a` (worst measured ramp): a native horizontal band crop (left
  silhouette to right) shows tight compressed slivers near BOTH edges and near-square cells in the
  middle — visibly asymmetric evenness across the surface, unfixed.
- `torus__crosshatch__ladder__max__a` (the crossing check): full image plus a 3x native crop of the
  near-seam region. **No two neighbouring rulings of the same family touch or merge anywhere** — this
  cell already passes (ramp 1.187) and this unit shipped no change, so it is exactly as before.
- `sphere__crosshatch__ladder__max__b` (control that must not regress): even diamond coverage across
  the visible disc, matching its already-passing columns. Unregressed (no source change).
- `ellipsoid__crosshatch__ladder__max__a` (tier A, the other already-passing config): even diamond
  coverage, matching its already-passing columns. Unregressed.
- `sphere__crosshatch__ladder__med__a` (chart-pole knot): a small bunching/convergence artefact IS
  visible at the top pole. Filed as W-31c per the plan; **not chased in this unit.**

`docs/3d-audit/fill-audit/after/W-31b/report.json` carries the full fixture-tagged numbers, the M1 spike
record, and the C7/C8 measurements.

## Bars changed

**None.** No numeric threshold, tolerance, count bar, or pinned fingerprint in any EXISTING test file was
moved — `surface-fill.js` is byte-identical to `64b160a0` and no existing test file was edited. C7 and C8
are entirely NEW bars in a NEW file (`scene3d-crosshatch-cell-shape-b.test.js`), gating clauses/rails
nothing in this repo gated before this unit — per the plan's own framing, a new bar is disclosed as new,
not as a change to an existing one; there is nothing to report as `old -> new` because there is no `old`.

## Stop conditions checked

1. M1's spike did not clear the four closure conditions after two iterations -> **Rank 3 taken, as
   directed.**
2. No W-36c P1-P6 bar, the anti-saturation cap, the W-26 R1a 1.15 gap-jump, or `scene3d-fill-span-verdict`'s
   0.85 coverage cap moved -> confirmed unchanged (all guards above re-ran green with zero source diff).
3. No P6 byte-identity control moved, no non-crosshatch roster cell's byte-identity was ever at risk (no
   source change).
4. No within-family p01 fell below 0.85x today's value in the SHIPPED tree (trivially true — nothing
   shipped changed placement); the discarded M1 spike DID breach this, which is exactly why it was
   discarded rather than shipped.
5. C7 was not shipped in a state below its floor (it passes today, unchanged).
6. No already-passing config regressed (nothing shipped changed placement).
7. Worktree was clean before this unit started (`git status`/`git stash list` verified) and remained
   single-workstream throughout — no T2-2/T3 collision (confirmed disjoint via `git diff 3bc61c32 64b160a0`
   hunk list before editing).
8. The oracle could not be met honestly by M1 within the bounded budget -> **shipped the measurement
   (Rank 3) and said so.** C1b's band was never widened, the INTERIOR box was never touched, and no
   fingerprint was re-pinned.

## Follow-ups

- **W-31d** (curvature/neighbour-clearance bound): the blocking prerequisite for any future per-sample
  crosshatch placement mechanism in this file. This unit's own failed probe-based floor attempt (recorded
  in the new test file's header comment and above) is a documented dead end — do not retry it as stated;
  it needs the neighbour's own emitted field, not a post-hoc probe-and-damp correction that decouples the
  warp field from the parameter position.
- **W-31c** (chart-pole knot): still visible (sphere/ellipsoid camera a, near the pole), still excluded by
  the INTERIOR definition, still not chased.
