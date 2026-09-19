STATUS: DONE/FU

# T2-5 — implementer report

Lane `fill-audit-a4`, worktree `.claude/worktrees/fill-audit-a4`, branch
`3d-scene/fill-audit-a4`. Base sha `7ef20455` (F1-count, this unit's own lane
base) -> final sha `75777240`. Verified clean (`git status --short -- . ':!graphify-out'`)
before starting: no stash entries in this worktree, no other WIP. Never pushed,
never merged, never touched MAIN's `src/`/`tests/`. Resumed once after an
Incident-13 rate-limit kill (2026-09-17 19:55 EDT) — nothing survived on disk at
resume; re-derived every number from scratch on this exact tree.

Port 8475 confirmed serving this worktree, `served version 1.4.2` == worktree
`package.json`.

## Jay's rule, verbatim (cone/hatch/mkTick/d=50)

"Instead of tick fragments on the right, use gradually shortening ticks to
fill the black gaps at the bottom of the vertical waves. Also don't increase
overlap at the seams. And remove any lines not part of a tick band."

Three clauses, three oracles (O-A/O-B/O-C), one population: every `mkTick`
sub-tick actually emitted at d=50, captured via a `scriptOverrides`-patched
copy of the disk source (never written to disk) — the same needle-patch
mechanism `scene3d-mktick-wedge.test.js`'s own MUTATION-KILL 2 already uses.

## Reading done, in order

`AGENT-PROTOCOL.md`, `ROUND3-RESUME-BRIEFS.md` §0 (binding checklist) and §0b
(timeout rule), `T2-5-plan.md` (whole brief, all sections), `T2-5-plan-evidence/`
(read the index, not every file), `T2-3-plan.md`, `T2-3b-plan.md`, `T2-3c-impl.md`
(inherited code: the stagger, `Lfloor` area floor, walk jump guard, runaway
guard).

## Files touched (all ALLOWED)

- `src/core/scene3d/surface-fill.js` — `layMark`'s `law.shape === 'tick'`
  block (sub-tick re-tiling, replacing T2-3's single-tick stagger where
  needed); `MK.mkTick`'s comment (L0 **stays 1.16** — see clause (b) below).
  Nothing else in the file changed.
- `tests/helpers/scene3d-mktick-band-purity.js` — NEW. Pure oracle math
  (`roughP95`, `lenToneR2n`, `seamOverlap`, `over2RP`), no renderer.
- `tests/unit/scene3d-mktick-band-purity.test.js` — NEW. The three oracles,
  RED at a hand-maintained pre-fix reconstruction, GREEN at the shipped tree,
  mutation-kills, neutrality proof, and a roster md5 sweep.
- `tests/unit/scene3d-mktick-wedge.test.js` — 4 of 12 `pathSignature` goldens
  re-pinned (disclosed below); `STAGGER_NEEDLE` split into two needles to
  match the new two-branch tick block (MUTATION-KILL 2's own claim
  unchanged: force BOTH `room` computations to 0).

## Mechanism — Rank 1, sub-tick re-tiling, MINIMAL split

In `layMark`'s tick block:

```js
if (law.shape === 'tick') {
  const nominalRP = masterPitch / MK_ROW_COV;
  const nSub = clamp(Math.ceil((law.L0 * sv.R) / Math.max(1e-6, 2 * nominalRP)), 1, 6);
  if (nSub > 1) {
    const sub = sv.R / nSub;
    const each = sv.L / nSub;
    // n sub-ticks, each length sv.L/n, tiling the local band sv.R into n
    // sub-bands of width sv.R/n, each with its own golden-ratio stagger
    // scaled to its own (smaller) room.
    ...
  } else {
    // BYTE-IDENTICAL to T2-3's own single-tick stagger.
  }
}
```

**Deviation from the plan's own sketch, and why.** The plan's own Rank-1
sketch used `nSub = round(sv.R / nominalRP)` — a blanket round-to-nearest
that retiles roughly every site with `R/nominalRP >= 1.5`. I measured that
this ALSO touches `sphere/hatch` (a cell nothing in the plan's own O-C table
flags) and, more importantly, dilutes `scene3d-mark-laws-draw.test.js`'s own
O1 oracle (median sagitta of the longest-third-by-chord-length population on
torus/contour, a file OUTSIDE this unit's ALLOWED scope, and one the caller's
own brief requires stay green) from a real >0.10mm to 0.0962mm — a real,
measured regression I am not permitted to fix by editing that file. Retuning
`nSub` to the MINIMUM split that actually clears the over2RP bar itself
(`ceil(L0*R / (2*nominalRP))`) fixes both problems: it touches only sites
where `law.L0 * sv.R` genuinely exceeds 2 nominal row pitches (the exact
over2RP threshold), leaves `sphere/hatch` byte-identical, and restores O1 to
30/30 green with margin — while still reaching `over2RP === 0` on every one
of the 12 gated fixtures. Reported, not silently done: the whole derivation
and both intermediate numbers are in this report.

## THE THREE CLAUSES — verdicts

### Clause (c) — "remove any lines not part of a tick band" — FIXED

`over2RP` (sub-ticks whose own length exceeds 2x nominal row pitch) is
**0 at d=50 on all 12 fixtures** (6 cells x 2 rigs), gated BLOCKING in
`scene3d-mktick-band-purity.test.js`. RED at the pre-fix reconstruction:
cone/hatch and torus/contour both show over2RP > 0 (re-derived on this tree,
not cited from the plan). Mutation-kill (blocking): forcing `nSub = 1`
(reverting the retiling) reproduces a live over-long population on
torus/contour/create. **cone/hatch/create does NOT work as the mutation-kill
cell** — measured directly: with `nSub` forced to 1 there, `over2RP` stays 0.
On THIS tree, cone/hatch's own local-R distribution combined with `L0=1.16`
(unchanged, see clause (b)) never quite pushes a single-tick length past 2
nominal row pitches, even without retiling — so the retiling's own
contribution to clause (c) is real but not independently provable on that
one cell in isolation. torus/contour/create is used instead, where it is.
This is disclosed rather than silently picking whichever cell made the test
pass.

O-C1 (purity: every emitted sceneFill path belongs to a tick mark) —
existence check (non-vacuous on every cell) plus a synthetic-mutation proof
(injecting a fake non-tick record into the population and showing it changes
the count).

### Clause (b) — "don't increase overlap at the seams" — STOP CONDITION 3, MEASURED-not-fixed

`ovMax = (L0-1)/2` exactly (closed form, `T2-3-plan.md`/`T2-5-plan.md` both
derive this and I re-verified it holds on this tree). The plan's own target
is `L0` 1.16 -> 1.05, which would cut `ovMax` from `0.0800*R` to `0.0250*R`
(under the pre-T2-3 `0.0280*R` bar). **I attempted this and it costs O5 below
the shipped `>= 2.30` bar on 4-6 of 12 fixtures** (measured min ~2.19-2.23,
both rigs). I swept `MK_TICK_EASE_BLEND` 0.92 -> 0.98 (the plan's own
prescribed buy-back lever) and the recovery is negligible (<0.02 on the
weakest cells, in one case slightly NEGATIVE) — confirming T2-3's OWN finding
that the ease curve is not an O5 lever, now reconfirmed at `L0=1.05`.

**Per the plan's explicit stop condition 3** ("ship the re-tiling alone and
put the L0/O5 trade to Jay with the table"), I reverted `L0` to **1.16,
unchanged from HEAD**. `ovMax` is UNCHANGED at `0.0800*R` on every one of the
12 fixtures (gated as a non-regression ceiling, not an improvement — the
retiling is EXACTLY neutral on seam overlap by construction: it only decides
WHERE inside the local band a tick's own length sits, never raises any
individual tick's own `L0*R` ceiling). **Clause (b) is neither improved nor
worsened by this unit.**

The L0/O5 trade, for Jay:
- **L0 = 1.16 (shipped here)**: `ovMax = 0.0800*R` (unchanged from HEAD, itself
  already a regression vs pre-T2-3's `0.0280*R`). O5 >= 2.30 holds on all 12.
- **L0 = 1.05** (the plan's own target): `ovMax = 0.0250*R` (clears the bar).
  O5 falls to ~2.19-2.23 on 4-6 of 12 fixtures — below the shipped bar.
- **L0 = 1.06**: `ovMax = 0.0300*R` — still above the 0.0280 bar.
- **L0 = 1.02** (pre-T2-3's own value): `ovMax = 0.0100*R`. O5 collapses
  further (T2-3's own planner measured O5 1.115-1.500 at this L0, the
  `chan:'count'`-adjacent design T2/T2-2 were rejected for lacking length
  variation at all).

### Clause (a) — "gradually shortening ticks ... not fragments" — MEASURED

`roughP95` (bounded step between same-row neighbours within 2 row pitches) —
gated as a DIRECTIONAL improvement vs the pre-fix reconstruction on
cone/hatch/create (real, not tautological: it compares two live renders).
`lenToneR2n` (R² of length/rowPitch regressed on tone) is reported on every
cell, both rigs — non-vacuous, but NOT gated at the plan's own 0.45 target.
Rank 1 (retiling) alone does not move `lenToneR2n` much (the plan's own
prototype found 0.102 -> 0.134-0.183 at various nSub policies, still far
under 0.45) — the mechanism that could close this gap is Rank 2 (a smooth,
spatially-continuous offset field replacing the golden-ratio hash), which
the plan explicitly did NOT prototype and which is out of this unit's grant.
**Shipped as MEASURED**, per the plan's own stop condition on O-A2.

## Guards — all run individually, foreground, this worktree, `timeout: 600000` where applicable

| file | result |
|---|---|
| `scene3d-mktick-band-purity` (own, NEW) | 34/34 |
| `scene3d-mktick-wedge` (own, re-pinned) | 58/58 |
| `scene3d-mktick-banding` (T2-3b) | 22/22 |
| `scene3d-mktick-runaway` (T2-3c) | 37/37 |
| `scene3d-mark-laws-draw` (T1/T1b/T4/W-05b — includes G4, T4b's own subtests) | 30/30 |
| `scene3d-mkdashramp-single-pass` (T3b) | 20/20 — confirms mkTick byte-identical at d=1/50/220, sphere/hatch, addLayer rig |
| `scene3d-ribbon-f1b-streaks` | 44/44 |
| `scene3d-ribbon-wall-coverage` | 36/36 |
| `scene3d-style-fill-lines` | 15/15 |
| `scene3d-ladder-uniform-field-spacing` | 9/9 |
| `scene3d-fill-style-picker` (integration, Tier 2) | 177/177 |
| `scene3d-tone-law-collapse` (Tier 1, singleFork, tool backgrounded at the 600s ceiling per §0b's own amendment, finished in 846.78s) | 121/121 |

One benign `[vitest-worker]: Timeout calling "onTaskUpdate"` and
`[FillBoolean] polygon union failed on degenerate geometry` on stderr in the
ribbon files and the tone-law-collapse file — pre-existing shared-machine
noise, documented by every prior unit in this chain (T2-3c, T2-3b, T1).

## Bars changed

- `tests/unit/scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE` — **4 of 12
  `pathSignature` goldens re-pinned**: `test|torus/contour`, `test|cone/hatch`,
  `create|torus/contour`, `create|cone/hatch` — exactly the cells whose
  `law.L0 * sv.R` exceeds `2*nominalRP` at this fixture (where the retiling
  fires). The other 8 of 12 — INCLUDING `sphere/hatch`, which the plan's own
  looser `nSub` sketch would have touched — are UNCHANGED byte-for-byte.
  Mutation-proved: `scene3d-mktick-band-purity.test.js`'s own O-C2
  MUTATION-KILL (blocking) shows reverting the retiling reproduces a live
  over-long population on torus/contour.
- `tests/unit/scene3d-mktick-wedge.test.js` `STAGGER_NEEDLE` — split into
  `STAGGER_NEEDLE_TILED` + `STAGGER_NEEDLE_SINGLE` (structural, not a bar
  value change): the tick block now has two `room` computations (one per
  branch) instead of one; MUTATION-KILL 2's own claim (disable ALL stagger,
  reproduce the pre-T2-3 wedge) is unchanged, both are disabled together.
- `src/core/scene3d/surface-fill.js` `MK.mkTick.L0` — **attempted 1.16 ->
  1.05, REVERTED to 1.16 (unchanged from HEAD)**. See clause (b) above for
  the full measured trade. This is a bar I tried to move and did NOT ship
  moved — recorded per standing rule 6 anyway, since a fix that was tried and
  backed out is exactly the kind of thing a bar-diff would otherwise hide.
- No other file's bar changed. `O5_BAR = 2.30` (`scene3d-mktick-wedge.test.js`)
  is UNCHANGED — the plan explicitly forbids lowering it, and because L0
  stayed at 1.16 there was no need to. `WEDGE_MEAN_BAR`/`WEDGE_CELL_CEILING`
  unchanged and pass with the same margins T2-3c reported.

## T2-4 (d=220 mkTick coverage) — observation only, per the caller's brief

Measured directly (cone/hatch/create, `scene3d-mktick-wedge.js`'s own
`measureWedge`/`siteCoverage`, scratch-script fixture, both trees on this
sha, script deleted after use — never committed):

| d=220, cone/hatch/create | pre-fix (7ef20455) | T2-5 (this unit) | delta |
|---|---|---|---|
| `wedge25` | 0.08907 | 0.09179 | +3.1% relative (**worsens**, per the plan's own T2-4 finding — but far less than the plan's own round-based Rank-1 prototype measured: 0.0891 -> 0.1365, +53%) |
| `holeMax` | 3.2030 | 3.2030 | **unchanged** |
| `siteCoverage` | 0.87545 | 0.87545 | **unchanged** |
| `pathCount` | 1668 | 1982 | +18.8% |

T2-4 does **NOT** fold into this unit (confirmed, not just cited from the
plan) — the collapse at d=220 is a different mechanism (`MIN_MARK_MM`
censoring short ticks, per `T2-3-plan.md` §2.5 / STILL-OPEN's own T2-4
filing) and this unit's minimal-split retiling costs it slightly rather than
fixing it. The degradation is small because the MINIMAL-`nSub` threshold
(vs the plan's own round-to-nearest sketch) only retiles sites that
genuinely need it — the same property that keeps `sphere/hatch` and O1
untouched keeps this cost down too, as a side effect rather than a
deliberate optimisation for d=220.

## T2-3e (row-lattice pattern) — observation only

Not independently re-measured this unit (the reviewer's own strip-FFT
instrument is not in the repo, and building it is out of this unit's grant
per the plan's own §5 disposition: "NOT PROVEN EITHER WAY... Report: T2-5's
Rank 1 is not shown to remove T2-3e."). `bandC` (the proxy that IS in the
repo, gated by `scene3d-mktick-banding.test.js`) is unaffected by this unit —
22/22 green, unchanged bars — because the retiling touches only the
`law.shape === 'tick'` branch, never `solveAt`'s `lenChan` area floor T2-3b
owns.

## Files ALLOWED / FORBIDDEN — compliance

Touched only: `src/core/scene3d/surface-fill.js` (the tick sink / stagger /
`MK.mkTick.L0` comment), the new oracle test + helper, and
`tests/unit/scene3d-mktick-wedge.test.js` (disclosed golden re-pins only).
Never touched: `MK_ROW_COV`, `mkDashRamp`/T3c's `solveAt` branch, the
crosshatch family cap, the master grid, wave-law code, `geometry-utils.js`,
`ribbonize()`/F1-count's diagnostics, `scene3d.js`, `hlr.js`, `shadows.js`,
`surface-fill-mono.js`, `mappers.js`. Confirmed by `git status --short`
before commit (below) and by re-reading the full diff.

## Roster md5 sweep — coverage as a fraction, disclosed

**Reduced from the plan's own scope, disclosed, not silently narrowed.** The
plan's own §0.4 sweep is 4 x (8 mappers x 37 PRODUCTION laws) = 1184 cells,
run on `cone/create`, `sphere/create`, `torus/create`, `cone/test`. A single
one of those four (8 mappers x 37 laws, `cone/create`) took **336.5s and hit
this unit's own 300s internal test timeout** on this shared machine — the
Bash tool backgrounding it and the vitest test timeout firing independently
are two different ceilings, and this one is the test's own. Reduced further
to the **3 mappers the fix can structurally reach through the mark-emission
path** (`hatch`, `crosshatch`, `contour` — the SAME 3 the plan's own 384-cell
sweep found are the only ones a mkTick change ever moves, `T2-5-plan.md`
§0.4/§2) x all PRODUCTION laws, on `cone/create`: **111 cells, run in 295-308s
(three repeated runs, consistent)**.

**Result: 2/111 cells changed (`cone/create/hatch/mkTick`,
`cone/create/crosshatch/mkTick`), 0 non-mkTick changes.**
`cone/create/contour/mkTick` did NOT change (matches the gallery capture's
own byte-identical pathCount 683/683 for that exact cell).

**Coverage stated as a fraction, per standing rule 2**: 111/1184 = **9.4%**
of the plan's own full scope. The exclusion (5 of 8 mappers, 3 of 4
primitive/rig sweeps) is justified two ways: (1) EMPIRICALLY, by this same
9.4% sample finding zero non-mkTick changes; (2) STRUCTURALLY — not a
substitute for the empirical sample, but the reason a 9.4% sample is
defensible here where it might not be elsewhere — `grep -c "shape: 'tick'"
src/core/scene3d/surface-fill.js` inside the `MK` table returns exactly 1
(the `mkTick` row itself), and every line this unit added is behind
`if (law.shape === 'tick')`, so no other law's `layMark` call can ever reach
this unit's code regardless of mapper or primitive. Additional corroborating
evidence from OTHER guard files, run separately: `scene3d-mkdashramp-single-pass.test.js`'s
own byte-identity sweep independently confirms `mkDashRamp`, `mkDotScreen`,
`mkScribble` and `ladder` are unaffected at d=1/50/220 on sphere/hatch,
addLayer rig (20/20, a different fixture, sphere not cone). The
`over2RP`/`ovMax`/`roughP95` gated oracle tables (34/34 in
`scene3d-mktick-band-purity.test.js`) and the 58/58 `scene3d-mktick-wedge.test.js`
each independently sweep both rigs, all six primary cells, at d=50 — a
different axis of coverage (density/rig/cell rather than mapper/law) that
the roster sweep does not repeat.

I did **not** attempt the plan's own full 1184-cell / 4-sweep scope again
after the first timeout — a second attempt at the same scope would very
likely time out again for the same reason, and the reduced, disclosed sample
plus the structural proof together are the honest stopping point.

## Evidence

Captured FROM MAIN, `--root` = the worktree at (then-uncommitted at capture
time, now committed as `75777240`), both `--rig create` and `--rig addLayer`, port 8475
(served version 1.4.2, matching `package.json`), into
`docs/3d-audit/fill-audit/after/T2-5/` — the six primary mkTick x med cells,
both rigs, plus `cone/hatch` x low/max and `cone/crosshatch` x med (the
affected-but-not-primary mapper). `before` shots captured from a scratch
`git archive 7ef20455` export on a separate port (8496), same capture
command, so the before/after pair is measured on the SAME fixture rather
than borrowed from a stale gallery baseline. Full fixture block (rig,
camera, density, non-default params, ground-plane-ink: excluded from the
vitest fixture / included as capture-harness default in the gallery
fixture) in `report.json`.

**LOOKED at, described:**

- `cone_hatch_target_x5_stacked.png` (native, 5x, the region the plan's own
  root-cause analysis targets, `cone/hatch/create`): BEFORE (top) shows a
  smooth, continuous, unbroken gray diagonal stroke running through the
  black gap between two tick rows — clause (c)'s own defect, a line NOT part
  of a tick band. AFTER (bottom): that continuous stroke is gone, replaced
  by the same tick-band texture (short, discrete marks) the rest of the
  field reads as. This is the clearest, most legible before/after in the
  whole evidence set.
- `cone_hatch_lowerleft_x3_before_after.png` (native, 3x, side-by-side): the
  broader lower-left slab region the plan describes as packed with over-long
  ticks. Same read as above at a wider field of view — before has a faint
  smooth arc, after does not.
- `torus_contour_rightfan_x4_stacked.png` (native, 4x): torus/contour's
  own worst-offender region (max local-R ratio ~2.43x per the plan). The
  difference here is SUBTLE — a handful of short isolated dash fragments
  shift position slightly — because the over-long population there was a
  small minority (18-67 of ~400-700 marks per the plan's own O-C table) of
  an already-scattered fan pattern. Consistent with the numbers: this is
  the cell whose pathCount changes the most (+9.8%) but whose visual
  character changes the least.
- `cone_crosshatch_full_before_after.png` (native, whole-object): the
  affected-but-not-primary mapper. Subtle, consistent with cone/hatch's own
  read at whole-object scale (the target-region crop is where the fix is
  legible, not the whole-object view).
- `cone_hatch_addlayer_full_stacked.png`, `torus_contour_full_before_after_stacked.png`:
  whole-object views, both rigs, both read as "the same object" at a glance
  — correct, since this unit's own population is a minority of all emitted
  ticks (path-count deltas of +0.2% to +18.8% across the nine captured
  cells).

**Plain answer to "does this read as Jay's sentence, rendered":** clause (c)
— yes, cleanly, on the cell the plan's own root-cause analysis is built on.
Clause (a) — partially: the stagger's scattering is unchanged in kind
(Rank 2, not shipped here), but the worst over-long fragments (which read as
the most visually jarring "wrong" marks) are gone. Clause (b) — no change
either direction; the seam-overlap regression T2-3 introduced is still
there, disclosed with a decision table for Jay.

## Stop conditions checked

1. O-A2 (`lenToneR2n >= 0.45`) not reachable without Rank 2 — shipped
   MEASURED, not gated, per the plan's own instruction.
2. Pen-downs (d=50, create rig, the gated population): worst case
   cone/hatch/med +14.5% (580->664 paths), torus/contour +9.8% (387->425),
   cone/crosshatch +16.2% (1002->1164) — all well under the plan's own +50%
   ceiling at d=50 (the minimal-nSub threshold keeps this far lower than the
   plan's own round-based sketch, which measured +36-45% at d=50 on
   cone/hatch alone). At d=220 (not gated, see T2-4 above) cone/hatch/max
   shows +18.8% (1668->1982) — still under +50%.
3. `O5_BAR = 2.30` holds on all 12 (L0 reverted to 1.16 specifically to keep
   this true) — NOT lowered.
4. d=220 `siteCoverage`: **unchanged at 0.87545** (cone/hatch/create, both
   trees) — comfortably above the plan's own 0.85 floor; not falling was not
   even a close call here.
5. No `pathSignature` golden, `O5_BAR`, `wedge25` bar or `bandC` ceiling
   re-pinned without measured proof — see `## Bars changed` above.

## Evidence paths

`docs/3d-audit/fill-audit/after/T2-5/report.json`,
`docs/3d-audit/fill-audit/after/T2-5/manifest.B.1-1.jsonl` (+
`.addlayer.jsonl`), `docs/3d-audit/fill-audit/after/T2-5/shots/B/*.webp`,
`docs/3d-audit/fill-audit/after/T2-5/crops/*.png`.

**T2 is NOT declared closed here** — clause (b) is an open, disclosed
trade-off Jay must rule on, and clause (a)'s R² gap needs Rank 2 (not
prototyped in this unit). This is a DONE/FU: clause (c) fixed and
mutation-proved, clause (a) measurably improved on the gated half and
honestly reported MEASURED on the ungated half, clause (b) MEASURED with a
decision table.

REPORT docs/3d-audit/lane-reports/T2-5-impl.md — DONE/FU — clause (c) fixed (over2RP 0/12); clause (b) MEASURED-not-fixed (L0 trade table); clause (a) partial.
